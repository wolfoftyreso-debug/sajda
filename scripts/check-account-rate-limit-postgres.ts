/** Explicit development-only PostgreSQL verification. Every mutation (including
 * limiter cleanup) is inside one never-committed outer transaction. No users,
 * grants, provider calls, migrations or production/preview connections.
 *
 * Run from the repository with the reviewed development env file:
 * SAJDA_AUTH_RATE_LIMIT_DB_TEST=1 node --env-file=.env.neon-development.local
 *   --import tsx scripts/check-account-rate-limit-postgres.ts
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import type { Pool, PoolClient } from "pg";
import { createAccountPool } from "../api/_shared/account-server.js";
import { createAccountRateLimitStorage } from "../api/_shared/account-rate-limit.js";

let pool: Pool | undefined, client: PoolClient | undefined;
let open = false, rollbackVerified = false, stage = "guard";
const checks: string[] = [];
try {
  assert.equal(process.env.SAJDA_AUTH_RATE_LIMIT_DB_TEST, "1", "Explicit development test opt-in is required");
  assert.ok(!process.env.VERCEL, "Never run inside a deployment");
  assert.ok(!process.env.VERCEL_ENV || process.env.VERCEL_ENV === "development", "Only development is allowed");
  assert.equal(process.env.NEON_PROJECT_ID, "spring-paper-89655503", "Only the reviewed development Neon project is allowed");
  // Independently pin the target against the workspace's reviewed development
  // configuration. Do not fall back to a runtime/production DATABASE_URL.
  const reviewed = parseEnv(readFileSync(new URL("../.env.neon-development.local", import.meta.url), "utf8"));
  assert.equal(reviewed.NEON_PROJECT_ID, "spring-paper-89655503");
  assert.ok(!reviewed.VERCEL_ENV || reviewed.VERCEL_ENV === "development");
  const url = new URL(process.env.DATABASE_URL_UNPOOLED ?? "");
  const pinned = new URL(reviewed.DATABASE_URL_UNPOOLED ?? "");
  assert.ok(["postgres:", "postgresql:"].includes(url.protocol));
  assert.ok(url.hostname.endsWith(".neon.tech") && !url.hostname.includes("-pooler."));
  assert.equal(url.hostname, pinned.hostname, "The database host must match reviewed development");
  assert.equal(url.port, pinned.port); assert.equal(url.pathname, pinned.pathname); assert.equal(url.username, pinned.username);
  assert.ok(url.username && url.password && url.pathname.length > 1);
  url.searchParams.delete("options");
  pool = createAccountPool(url.toString());
  stage = "connect";
  client = await pool.connect();
  const run = randomUUID(), sessionKey = `qa-rate-${run}|/get-session`, credentialKey = `qa-rate-${run}|/sign-in/email`;
  const keys = [sessionKey, credentialKey];
  const database = client;
  const storage = createAccountRateLimitStorage({ query: (sql, args) => database.query(sql, args) });
  async function budget(key: string) {
    const rows = (await database.query('SELECT count, "lastRequest" FROM public.sajda_auth_rate_limit WHERE key=$1', [key])).rows;
    assert.equal(rows.length, 1);
    return { count: Number(rows[0].count), anchor: Number(rows[0].lastRequest) };
  }
  async function moveAnchor(key: string, deltaMs: number) {
    const result = await database.query(`UPDATE public.sajda_auth_rate_limit
      SET "lastRequest"=floor(extract(epoch FROM statement_timestamp())*1000)::bigint+$2::bigint
      WHERE key=$1 RETURNING "lastRequest"`, [key, deltaMs]);
    assert.equal(result.rowCount, 1);
    return Number(result.rows[0].lastRequest);
  }

  stage = "begin";
  await database.query("BEGIN"); open = true;
  await database.query("SET LOCAL statement_timeout='8s'; SET LOCAL lock_timeout='2s'; SET LOCAL idle_in_transaction_session_timeout='30s'");
  assert.equal((await database.query("SELECT count(*)::integer AS count FROM public.sajda_auth_rate_limit WHERE key=ANY($1::text[])", [keys])).rows[0].count, 0);
  stage = "session_anchor";
  const sessionRule = { window: 60, max: 60 };
  assert.deepEqual(await storage.consume(sessionKey, sessionRule), { allowed: true, retryAfter: null });
  const started = (await budget(sessionKey)).anchor;
  for (let request = 1; request < 60; request++) assert.equal((await storage.consume(sessionKey, sessionRule)).allowed, true);
  assert.deepEqual(await budget(sessionKey), { count: 60, anchor: started });
  checks.push("accepted_session_anchor_stable");
  stage = "burst_saturation";
  for (let request = 0; request < 3; request++) {
    const denied = await storage.consume(sessionKey, sessionRule);
    assert.equal(denied.allowed, false); assert.ok(denied.retryAfter! >= 1 && denied.retryAfter! <= 60);
  }
  assert.deepEqual(await budget(sessionKey), { count: 61, anchor: started });
  checks.push("60_accepted_then_saturated_429_budget");
  stage = "expired_anchor";
  const expired = await moveAnchor(sessionKey, -60_001);
  assert.equal((await storage.consume(sessionKey, sessionRule)).allowed, true);
  const reset = await budget(sessionKey);
  assert.equal(reset.count, 1); assert.ok(reset.anchor > expired);
  checks.push("expired_session_window_resets");
  stage = "credential_anchor";
  const credentialRule = { window: 60, max: 5 };
  assert.equal((await storage.consume(credentialKey, credentialRule)).allowed, true);
  const oldCredential = await moveAnchor(credentialKey, -2000);
  assert.equal((await storage.consume(credentialKey, credentialRule)).allowed, true);
  assert.ok((await budget(credentialKey)).anchor > oldCredential);
  for (let request = 2; request < 5; request++) assert.equal((await storage.consume(credentialKey, credentialRule)).allowed, true);
  const lastAccepted = (await budget(credentialKey)).anchor;
  for (let request = 0; request < 2; request++) assert.equal((await storage.consume(credentialKey, credentialRule)).allowed, false);
  assert.deepEqual(await budget(credentialKey), { count: 6, anchor: lastAccepted });
  checks.push("credential_accept_advances_reject_preserves_anchor");
  stage = "clock_ordering";
  // Simulate an older-started SQL statement encountering a newer locked row.
  // This is not a claim of two-connection contention or a committed fixture.
  const newerAnchor = await moveAnchor(sessionKey, 1000);
  assert.equal((await storage.consume(sessionKey, sessionRule)).allowed, true);
  assert.equal((await budget(sessionKey)).anchor, newerAnchor);
  checks.push("nonmonotonic_statement_time_fails_neither_open_nor_spuriously_closed");

  stage = "rollback";
  await database.query("ROLLBACK"); open = false;
  stage = "verify_no_residual_keys";
  assert.equal((await database.query("SELECT count(*)::integer AS count FROM public.sajda_auth_rate_limit WHERE key=ANY($1::text[])", [keys])).rows[0].count, 0);
  rollbackVerified = true;
  console.info(JSON.stringify({ event: "account_rate_limit_postgres_verified", checks, rollbackVerified,
    persistedFixtures: 0, schemaChanges: 0, realProviderCalls: 0, multiConnectionConcurrencyTested: false }));
} catch (error) {
  const code = error && typeof error === "object" && "code" in error && typeof error.code === "string"
    && /^[a-z0-9_]{1,40}$/iu.test(error.code) ? error.code : "verification_failed";
  console.error(JSON.stringify({ event: "account_rate_limit_postgres_failed", stage, code }));
  process.exitCode = 1;
} finally {
  let destroy = false;
  if (open && client) {
    try { await client.query("ROLLBACK"); }
    catch { destroy = true; console.error(JSON.stringify({ event: "account_rate_limit_rollback_unconfirmed" })); process.exitCode = 1; }
  }
  client?.release(destroy);
  await pool?.end();
}
