/**
 * Opt-in PostgreSQL regression. Every fixture and rate-limit write is isolated
 * in one transaction that is ALWAYS rolled back. No email or provider calls.
 *
 * node --env-file=.env.neon-development.local --import tsx scripts/check-swipe-entitlements.mjs --run
 *
 * Uses the real entitlement query through a transaction-bound transport;
 * this verifies PostgreSQL semantics, not an HTTP/browser/authentication flow.
 */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { neonConfig } from "@neondatabase/serverless";

async function run() {
  if (!process.argv.includes("--run")) {
    console.log(JSON.stringify({ status: "SKIPPED", reason: "Explicit --run and a reviewed development/preview database are required." }));
    return;
  }
  const connectionString = process.env.DATABASE_URL_UNPOOLED?.trim();
  const runtimeConnectionString = process.env.DATABASE_URL?.trim();
  assert.ok(connectionString && runtimeConnectionString, "Both server database variables must be configured.");
  const connection = new URL(connectionString);
  const runtime = new URL(runtimeConnectionString);
  assert.ok(["postgres:", "postgresql:"].includes(connection.protocol) && connection.hostname.endsWith(".neon.tech"));
  assert.equal(connection.hostname.includes("-pooler."), false, "The rollback harness requires an unpooled Neon connection.");
  assert.equal(runtime.hostname.replace("-pooler.", "."), connection.hostname, "Runtime and migration connections must target the same branch.");
  assert.equal(runtime.pathname, connection.pathname);
  assert.notEqual(process.env.VERCEL_ENV, "production", "Do not run synthetic fixtures against production.");
  connection.searchParams.set("sslmode", "verify-full");
  const pool = new Pool({ connectionString: connection.toString(), max: 1,
    connectionTimeoutMillis: 8_000, query_timeout: 6_000, allowExitOnIdle: true });
  const previousFetch = neonConfig.fetchFunction;
  const previousEndpoint = neonConfig.fetchEndpoint;
  const ids = [randomUUID(), randomUUID()].map(value => `qa-swipe-rollback-${value}`);
  const subjectHashes = ids.map(id => createHash("sha256").update(`account-capabilities:${id}`).digest("hex"));
  let client;
  let transactionOpen = false;
  let check = "connect";
  const passed = [];
  const verify = async (label, fn) => {
    check = label;
    await fn();
    passed.push(label);
  };

  try {
    client = await pool.connect();
    const remainder = async () => {
      const result = await client.query(`SELECT
        (SELECT count(*)::int FROM public.sajda_auth_user WHERE id = ANY($1::text[])) AS users,
        (SELECT count(*)::int FROM sajda.account_entitlements WHERE user_id = ANY($1::text[])) AS grants,
        (SELECT count(*)::int FROM sajda.function_rate_limits
          WHERE scope = 'account-capabilities' AND subject_hash = ANY($2::text[])) AS limits`, [ids, subjectHashes]);
      assert.deepEqual(result.rows[0], { users: 0, grants: 0, limits: 0 });
    };
    await remainder();
    await client.query("BEGIN");
    transactionOpen = true;
    await client.query("SET LOCAL statement_timeout = '5s'");
    await client.query("SET LOCAL lock_timeout = '2s'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout = '30s'");

    // Keep the production helper's exact parameterized SQL and database-clock
    // rules, while running it on this single rollback-only pg connection.
    neonConfig.fetchEndpoint = "https://fixture.neon.tech/sql";
    neonConfig.fetchFunction = async (url, options) => {
      assert.equal(String(url), "https://fixture.neon.tech/sql");
      const statement = JSON.parse(String(options?.body));
      assert.equal(typeof statement.query, "string");
      assert.ok(Array.isArray(statement.params) && ids.includes(statement.params[1]));
      assert.ok(statement.query.includes("FROM rate_limit") && statement.query.includes("sajda.account_entitlements"));
      const result = await client.query(statement.query, statement.params);
      return Response.json({
        fields: result.fields.map(({ name, dataTypeID }) => ({ name, dataTypeID })),
        rows: result.rows.map(row => result.fields.map(({ name }) => row[name] === null ? null
          : typeof row[name] === "boolean" ? row[name] ? "t" : "f" : String(row[name]))),
        rowCount: result.rowCount,
      });
    };
    const { getAccountCapabilities } = await import("../api/_shared/account-entitlements.ts");
    const read = async index => getAccountCapabilities({ id: ids[index], emailVerified: true });
    await client.query(`INSERT INTO public.sajda_auth_user (id, name, email, "emailVerified")
      SELECT id, 'Rollback-only QA fixture', id || '@example.invalid', true
      FROM unnest($1::text[]) AS id`, [ids]);

    await verify("empty/free account denied", async () => {
      assert.deepEqual(await read(0), { swipe_undo: false });
    });
    await client.query(`INSERT INTO sajda.account_entitlements
      (user_id, capability, grant_source, source_reference, valid_from, expires_at)
      VALUES ($1, 'swipe_undo', 'operator', 'rollback-only QA fixture',
        statement_timestamp() - interval '1 hour', statement_timestamp() + interval '1 hour')`, [ids[0]]);
    await verify("active stored capability allowed", async () => {
      assert.deepEqual(await read(0), { swipe_undo: true });
    });
    await verify("other account cannot inherit entitlement", async () => {
      assert.deepEqual(await read(1), { swipe_undo: false });
    });
    await verify("expired entitlement denied using database time", async () => {
      await client.query("UPDATE sajda.account_entitlements SET expires_at = statement_timestamp() WHERE user_id = $1", [ids[0]]);
      assert.deepEqual(await read(0), { swipe_undo: false });
    });
    await verify("future entitlement denied", async () => {
      await client.query(`UPDATE sajda.account_entitlements
        SET valid_from = statement_timestamp() + interval '1 hour', expires_at = statement_timestamp() + interval '2 hours'
        WHERE user_id = $1`, [ids[0]]);
      assert.deepEqual(await read(0), { swipe_undo: false });
    });
    await verify("revoked entitlement denied immediately", async () => {
      await client.query(`UPDATE sajda.account_entitlements SET
        valid_from = statement_timestamp() - interval '1 hour', expires_at = statement_timestamp() + interval '1 hour',
        revoked_at = statement_timestamp() WHERE user_id = $1`, [ids[0]]);
      assert.deepEqual(await read(0), { swipe_undo: false });
    });

    const deniedConstraint = async (label, sql, params, code) => verify(label, async () => {
      await client.query("SAVEPOINT invalid_entitlement_fixture");
      try {
        let rejected = false;
        try { await client.query(sql, params); } catch (error) {
          assert.equal(error.code, code);
          rejected = true;
        }
        assert.equal(rejected, true, "Invalid grant must be rejected by PostgreSQL");
      } finally {
        await client.query("ROLLBACK TO SAVEPOINT invalid_entitlement_fixture");
        await client.query("RELEASE SAVEPOINT invalid_entitlement_fixture");
      }
    });
    const insert = `INSERT INTO sajda.account_entitlements
      (user_id, capability, grant_source, source_reference, valid_from, expires_at)
      VALUES ($1, $2, $3, $4, statement_timestamp() - interval '1 hour', statement_timestamp() + interval '1 hour')`;
    await deniedConstraint("duplicate user capability rejected", insert,
      [ids[0], "swipe_undo", "operator", "duplicate fixture"], "23505");
    await deniedConstraint("nonexistent owner rejected by foreign key", insert,
      [`${ids[0]}-missing`, "swipe_undo", "operator", "foreign key fixture"], "23503");
    await deniedConstraint("unknown capability rejected", insert,
      [ids[1], "admin", "operator", "unknown capability fixture"], "23514");
    await deniedConstraint("untrusted grant source rejected", insert,
      [ids[1], "swipe_undo", "browser", "client fixture"], "23514");
    await deniedConstraint("missing grant provenance rejected", insert,
      [ids[1], "swipe_undo", "operator", " "], "23514");
    for (const [label, update, code] of [
      ["missing expiry rejected", "expires_at = NULL", "23502"],
      ["backwards validity rejected", "expires_at = valid_from", "23514"],
      ["infinite expiry rejected", "expires_at = 'infinity'::timestamptz", "23514"],
      ["infinite start rejected", "valid_from = '-infinity'::timestamptz", "23514"],
      ["infinite grant time rejected", "granted_at = '-infinity'::timestamptz", "23514"],
      ["infinite revocation rejected", "revoked_at = 'infinity'::timestamptz", "23514"],
    ]) await deniedConstraint(label, `UPDATE sajda.account_entitlements SET ${update} WHERE user_id = $1`, [ids[0]], code);

    await verify("capability table is RLS protected without PUBLIC grants", async () => {
      const result = await client.query(`SELECT c.relrowsecurity FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'sajda' AND c.relname = 'account_entitlements'`);
      assert.equal(result.rows[0]?.relrowsecurity, true);
      const grants = await client.query(`SELECT count(*)::int AS count FROM information_schema.role_table_grants
        WHERE table_schema = 'sajda' AND table_name = 'account_entitlements' AND grantee = 'PUBLIC'`);
      assert.equal(grants.rows[0].count, 0);
    });
    check = "rollback and absence of persistent fixture data";
    await client.query("ROLLBACK");
    transactionOpen = false;
    await verify(check, remainder);
    console.log(JSON.stringify({ status: "PASS", checks: passed.length, verified: passed,
      persistentFixtureUsers: 0, persistentFixtureGrants: 0, persistentFixtureLimits: 0,
      externalEmailOrPaymentCalls: 0, transport: "transaction-bound actual PostgreSQL; no HTTP/session test" }, null, 2));
  } catch {
    console.error(JSON.stringify({ status: "FAIL", check, completedChecks: passed.length }));
    process.exitCode = 1;
  } finally {
    neonConfig.fetchFunction = previousFetch;
    neonConfig.fetchEndpoint = previousEndpoint;
    if (client) {
      if (transactionOpen) await client.query("ROLLBACK").catch(() => {
        console.error(JSON.stringify({ status: "FAIL", check: "Rollback response not confirmed; disconnecting aborts the uncommitted transaction." }));
        process.exitCode = 1;
      });
      client.release();
    }
    await pool.end();
  }
}

run().catch(() => {
  console.error(JSON.stringify({ status: "FAIL", check: "Configuration or setup validation; no credentials printed." }));
  process.exitCode = 1;
});
