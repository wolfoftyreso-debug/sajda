import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { AccountAccessError } from "../api/_shared/account-error.js";
import { createAccountRateLimitStorage } from "../api/_shared/account-rate-limit.js";
import { createAccountAuth } from "../api/_shared/account-server.js";

type Budget = { key: string; count: number; lastRequest: number };
function databaseFixture() {
  let now = 1_800_000_000_000;
  const budgets = new Map<string, Budget>(), calls: { sql: string; args: unknown[] }[] = [];
  const database = { async query(sql: string, args: unknown[]) {
    calls.push({ sql, args });
    assert.match(sql, /\/\* account:auth-rate-limit \*\//u, "Unexpected database access in no-network auth fixture");
    const [, key, windowMs, maximum, anchored] = args as [string, string, number, number, boolean];
    let row = budgets.get(key);
    if (!row || row.lastRequest <= now - windowMs) row = { key, count: 1, lastRequest: now };
    else {
      // A single synchronous fake statement mirrors the atomic SQL. It is not
      // evidence of real PostgreSQL locking; the SQL contract is checked below.
      const accepted = row.count < maximum;
      row.count = Math.min(row.count + 1, maximum + 1);
      if (!anchored && accepted) row.lastRequest = Math.max(row.lastRequest, now);
    }
    budgets.set(key, row);
    return { rows: [{ ...row, now_ms: Math.max(row.lastRequest, now) }] };
  } };
  return { database, budgets, calls, get now() { return now; }, advance(ms: number) { now += ms; } };
}

test("atomic session windows permit 20 minutes of normal Trading polling without a forced idle minute", async () => {
  const f = databaseFixture(), storage = createAccountRateLimitStorage(f.database);
  const key = "192.0.2.9|/get-session";
  for (let step = 0; step < 240; step++) {
    assert.deepEqual(await storage.consume(key, { window: 60, max: 60 }), { allowed: true, retryAfter: null });
    f.advance(5000);
  }
  assert.equal(f.budgets.get(key)?.count, 12);
  assert.equal(f.calls.length, 240);
});

test("session bursts remain capped and rejected retries do not move the window", async () => {
  const f = databaseFixture(), storage = createAccountRateLimitStorage(f.database);
  const key = "192.0.2.9|/get-session", rule = { window: 60, max: 60 };
  const started = f.now;
  const results = await Promise.all(Array.from({ length: 100 }, () => storage.consume(key, rule)));
  assert.equal(results.filter(result => result.allowed).length, 60);
  assert.equal(results.filter(result => !result.allowed).length, 40);
  assert.equal(f.budgets.get(key)?.count, 61, "Counter saturates instead of overflowing under abuse");
  assert.equal(f.budgets.get(key)?.lastRequest, started);
  f.advance(59_001);
  assert.deepEqual(await storage.consume(key, rule), { allowed: false, retryAfter: 1 });
  f.advance(999);
  assert.deepEqual(await storage.consume(key, rule), { allowed: true, retryAfter: null });
  assert.equal(f.budgets.get(key)?.count, 1);
});

test("login, signup and recovery keep their exact stricter inactivity limits", async () => {
  for (const [path, window, max] of [["sign-in/email", 60, 5], ["sign-up/email", 600, 5],
    ["request-password-reset", 600, 3], ["send-verification-email", 600, 3]] as const) {
    const f = databaseFixture(), storage = createAccountRateLimitStorage(f.database);
    const key = `192.0.2.9|/${path}`, rule = { window, max };
    for (let request = 0; request < max; request++) {
      assert.equal((await storage.consume(key, rule)).allowed, true);
      if (request < max - 1) f.advance(1000);
    }
    const lastAccepted = f.now;
    assert.deepEqual(await storage.consume(key, rule), { allowed: false, retryAfter: window });
    f.advance(window * 1000 - 1);
    assert.deepEqual(await storage.consume(key, rule), { allowed: false, retryAfter: 1 });
    assert.equal(f.budgets.get(key)?.lastRequest, lastAccepted);
    f.advance(1);
    assert.equal((await storage.consume(key, rule)).allowed, true);
  }
});

test("rate keys remain isolated by trusted IP and endpoint, preserving active SDK rows", async () => {
  const f = databaseFixture(), storage = createAccountRateLimitStorage(f.database);
  f.budgets.set("192.0.2.1|/sign-in/email", { key: "192.0.2.1|/sign-in/email", count: 5, lastRequest: f.now });
  assert.equal((await storage.consume("192.0.2.1|/sign-in/email", { window: 60, max: 5 })).allowed, false);
  assert.equal((await storage.consume("192.0.2.2|/sign-in/email", { window: 60, max: 5 })).allowed, true);
  assert.equal((await storage.consume("192.0.2.1|/get-session", { window: 60, max: 60 })).allowed, true);
  assert.equal(f.calls[0].args[1], "192.0.2.1|/sign-in/email", "A deployment must not rename keys and forgive active login limits");
});

test("older-started statements cannot move a newer row's anchor backwards after lock contention", async () => {
  for (const path of ["get-session", "sign-in/email"]) {
    const f = databaseFixture(), storage = createAccountRateLimitStorage(f.database);
    const key = `192.0.2.9|/${path}`, anchor = f.now + 200;
    f.budgets.set(key, { key, count: 1, lastRequest: anchor });
    assert.deepEqual(await storage.consume(key, { window: 60, max: 5 }), { allowed: true, retryAfter: null });
    assert.equal(f.budgets.get(key)?.lastRequest, anchor);
    f.budgets.set(key, { key, count: 5, lastRequest: anchor });
    assert.deepEqual(await storage.consume(key, { window: 60, max: 5 }), { allowed: false, retryAfter: 60 });
    assert.equal(f.budgets.get(key)?.lastRequest, anchor);
  }
});

test("storage uses one atomic statement, database time and bounded nonblocking cleanup", async () => {
  const f = databaseFixture();
  await createAccountRateLimitStorage(f.database).consume("192.0.2.9|/get-session", { window: 60, max: 60 });
  assert.equal(f.calls.length, 1);
  const { sql, args } = f.calls[0];
  assert.match(sql, /ON CONFLICT \(key\) DO UPDATE/u);
  assert.match(sql, /LEAST\(budget\.count \+ 1, \$4::integer \+ 1\)/u);
  assert.match(sql, /NOT \$5::boolean AND budget\.count < \$4::integer/u);
  assert.match(sql, /statement_timestamp\(\)/u);
  assert.match(sql, /GREATEST\(budget\."lastRequest", \(SELECT now_ms FROM clock\)\)/u);
  assert.match(sql, /GREATEST\(consumed\."lastRequest", clock\.now_ms\) AS now_ms/u);
  assert.match(sql, /expired, clock, consumed/u, "Cleanup depends on the consumed row, not a separate unlocked budget read");
  assert.match(sql, /expired\.key <> \$2/u, "Cleanup never rewrites the same row as the upsert");
  assert.match(sql, /LIMIT 32 FOR UPDATE OF expired SKIP LOCKED/u);
  assert.doesNotMatch(sql, /192\.0\.2\.9/u);
  assert.deepEqual(args.slice(1), ["192.0.2.9|/get-session", 60_000, 60, true]);
});

test("unavailable or malformed storage fails closed without exposing keys or SQL", async () => {
  const unavailable = (error: unknown) => error instanceof AccountAccessError && error.status === 503
    && !/postgres|secret|192\.0\.2|SELECT/u.test(error.message);
  for (const rows of [[], [{ key: "different", count: 1, lastRequest: 1, now_ms: 1 }],
    [{ key: "192.0.2.9|/get-session", count: 0, lastRequest: 1, now_ms: 1 }],
    [{ key: "192.0.2.9|/get-session", count: 62, lastRequest: 1, now_ms: 1 }],
    [{ key: "192.0.2.9|/get-session", count: 1, lastRequest: 2, now_ms: 1 }]]) {
    await assert.rejects(() => createAccountRateLimitStorage({ query: async () => ({ rows }) })
      .consume("192.0.2.9|/get-session", { window: 60, max: 60 }), unavailable);
  }
  await assert.rejects(() => createAccountRateLimitStorage({ query: async () => { throw new Error("postgres secret SELECT"); } })
    .consume("192.0.2.9|/get-session", { window: 60, max: 60 }), unavailable);
  const f = databaseFixture();
  for (const rule of [{ window: 0, max: 60 }, { window: 60, max: 0 }, { window: Infinity, max: 60 }]) {
    await assert.rejects(() => createAccountRateLimitStorage(f.database).consume("fixture", rule), unavailable);
  }
  assert.equal(f.calls.length, 0);
});

test("the real Better Auth HTTP chain uses the custom limiter for sustained anonymous session polling", async () => {
  const f = databaseFixture();
  const pool = new Pool({ connectionString: "postgresql://fixture:fixture@fixture.invalid/fixture" });
  // The SDK validates schema before serving HTTP. Simulate only its read-only
  // introspection against our checked-in auth migration; do not disable that
  // production safety check or leave any actual socket path in this fixture.
  const migration = readFileSync(new URL("../db/migrations/0002_vercel_auth.sql", import.meta.url), "utf8");
  const columns = [...migration.matchAll(/CREATE TABLE public\.(\w+) \(([\s\S]*?)\n\);/gu)].flatMap(table =>
    table[2].split("\n").flatMap(line => {
      const column = /^\s*(?:"([^"]+)"|([a-z_]\w*))\s+(text|boolean|timestamptz|bigint|integer)\b/iu.exec(line);
      return column ? [{ column: column[1] ?? column[2], not_null: /NOT NULL|PRIMARY KEY/u.test(line), has_default: /DEFAULT/u.test(line),
        table: table[1], table_type: "r", schema: "public", type: ({ boolean: "bool", bigint: "int8", integer: "int4" } as Record<string, string>)[column[3]] ?? column[3],
        type_schema: "pg_catalog", column_description: null, auto_incrementing: null }] : [];
    }));
  let introspections = 0;
  Object.assign(pool, { query: f.database.query, connect: async () => ({ release() {}, async query(sql: string) {
    introspections++;
    if (sql.includes("current_schemas(true)")) return { rows: [{ schemas: ["pg_catalog", "public"] }] };
    if (sql.includes('"pg_catalog"."pg_attribute"')) return { rows: columns };
    assert.fail("Unexpected account/provider query in the no-network SDK fixture");
  } }) });
  try {
    const auth = createAccountAuth({ origin: "https://sajda.test", secret: "fixture-only-secret-not-a-real-credential".repeat(2), pool,
      sendEmail: async () => { assert.fail("The session limiter test must never send email"); } });
    assert.deepEqual(auth.options.rateLimit?.customRules, {
      "/sign-in/email": { window: 60, max: 5 }, "/sign-up/email": { window: 600, max: 5 },
      "/request-password-reset": { window: 600, max: 3 }, "/send-verification-email": { window: 600, max: 3 },
    });
    const request = () => new Request("https://sajda.test/api/auth/get-session", { headers: { "x-vercel-forwarded-for": "192.0.2.9" } });
    for (let step = 0; step < 180; step++) {
      const result = await auth.handler(request());
      assert.equal(result.status, 200, `Normal polling must not start429 after minute5, request ${step + 1}`);
      assert.equal(await result.json(), null, "This test has no session cookie and never accesses account rows");
      f.advance(5000);
    }
    // Existing path limits are still real HTTP429, with a usable retry hint.
    for (let step = 0; step < 60; step++) assert.equal((await auth.handler(request())).status, 200);
    const limited = await auth.handler(request());
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("x-retry-after"), "60");
    for (const [path, window, max] of [["sign-in/email", 60, 5], ["sign-up/email", 600, 5],
      ["request-password-reset", 600, 3], ["send-verification-email", 600, 3]] as const) {
      const invalidCredentials = () => new Request(`https://sajda.test/api/auth/${path}`, { method: "POST",
        headers: { "x-vercel-forwarded-for": "192.0.2.9", origin: "https://sajda.test", "content-type": "application/json" }, body: "{}" });
      for (let attempt = 0; attempt < max; attempt++) {
        const result = await auth.handler(invalidCredentials());
        assert.ok([400, 422].includes(result.status), `${path}: malformed input fails before any account or email work`);
      }
      const denied = await auth.handler(invalidCredentials());
      assert.equal(denied.status, 429, `${path} keeps its exact configured limit in the real SDK request chain`);
      assert.equal(denied.headers.get("x-retry-after"), String(window));
    }
    assert.equal(introspections, 2, "Only schema metadata, never real user or session rows, was queried");
    assert.equal(pool.totalCount, 0, "No database connection was opened");
  } finally { await pool.end(); }
});
