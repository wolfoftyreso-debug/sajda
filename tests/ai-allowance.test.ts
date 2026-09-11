import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { AI_ALLOWANCE_LEASE_MS, createAiAllowanceReserver, type AiAllowanceClient, type AiAllowancePool } from "../api/_shared/ai-allowance.js";

type Counter = { namespace: string; day: string; identity_hash: string; request_count: number; last_request_at: string };
type Lease = { namespace: string; id: string; expiresAt: number };

/** Transactional test double, not a substitute for the deployed Postgres test. */
class MemoryDatabase implements AiAllowancePool {
  now = Date.parse("2026-09-08T12:00:00.000Z");
  counters = new Map<string, Counter>();
  leases = new Map<string, Lease>();
  statements: { text: string; values: unknown[] }[] = [];
  destroyed = 0;
  connects = 0;
  fail = "";
  testIpMaximum = 20;
  private tail = Promise.resolve();

  async connect(): Promise<AiAllowanceClient> {
    this.connects += 1;
    if (this.fail === "connect") throw new Error("Secret connection details must not escape");
    let unlock: (() => void) | undefined;
    let counters: Map<string, Counter> | undefined;
    let leases: Map<string, Lease> | undefined;
    const finish = () => { counters = undefined; leases = undefined; unlock?.(); unlock = undefined; };
    return {
      query: async (text, values = []) => {
        this.statements.push({ text, values });
        const operation = /\/\* ai:([a-z]+) \*\//u.exec(text)?.[1] ?? text.split(" ")[0];
        if (this.fail === operation) throw new Error("Secret SQL error must not escape");
        const rows: Record<string, unknown>[] = [];
        if (operation === "lock") {
          const prior = this.tail;
          this.tail = new Promise<void>(resolve => { unlock = resolve; });
          await prior;
          counters = new Map(Array.from(this.counters, ([key, row]) => [key, { ...row }]));
          leases = new Map(Array.from(this.leases, ([key, row]) => [key, { ...row }]));
        } else if (operation === "clock") {
          rows.push({ now: new Date(this.now), day: new Date(this.now).toISOString().slice(0, 10) });
        } else if (operation === "cleanup") {
          const [namespace, day, now] = values as string[];
          const cutoff = Date.parse(day) - 2 * 86_400_000;
          let removed = 0;
          for (const [key, row] of counters!) {
            if (removed < 100 && row.namespace === namespace && Date.parse(row.day) < cutoff) { counters!.delete(key); removed += 1; }
          }
          removed = 0;
          for (const [key, row] of leases!) {
            if (removed < 100 && row.namespace === namespace && row.expiresAt <= Date.parse(now)) { leases!.delete(key); removed += 1; }
          }
        } else if (operation === "counters") {
          const [namespace, day, identity] = values as string[];
          for (const row of counters!.values()) {
            if (row.namespace === namespace && row.day === day
              && (row.identity_hash === "global" || row.identity_hash === identity)) rows.push({ ...row });
          }
        } else if (operation === "active") {
          rows.push({ active: [...leases!.values()].filter(row => row.namespace === values[0] && row.expiresAt > Date.parse(values[1] as string)).length });
        } else if (operation === "consume") {
          const [namespace, day, identity, now] = values as string[];
          for (const hash of ["global", identity]) {
            const key = `${namespace}|${day}|${hash}`;
            const count = (counters!.get(key)?.request_count ?? 0) + 1;
            const ipMaximum = ["sajda.ai.v1:preview", "sajda.ai.v1:development"].includes(namespace) ? this.testIpMaximum : 3;
            if (count > (hash === "global" ? 100 : ipMaximum)) throw new Error("Counter constraint violated");
            counters!.set(key, { namespace, day, identity_hash: hash, request_count: count, last_request_at: now });
          }
        } else if (operation === "lease") {
          const [namespace, id] = values as string[];
          leases!.set(id, { namespace, id, expiresAt: this.now + AI_ALLOWANCE_LEASE_MS });
        } else if (operation === "release") {
          const lease = this.leases.get(values[1] as string);
          if (lease?.namespace === values[0]) this.leases.delete(values[1] as string);
        } else if (operation === "COMMIT") {
          this.counters = counters!;
          this.leases = leases!;
          finish();
          if (this.fail === "after-commit") throw new Error("Ambiguous commit acknowledgement");
        } else if (operation === "ROLLBACK") finish();
        else assert.ok(operation === "BEGIN" || operation === "SET", `Unexpected SQL: ${operation}`);
        return { rows };
      },
      release: destroy => { if (destroy) this.destroyed += 1; finish(); },
    };
  }
}

const secret = "unit-test-secret-only-abcdefghijklmnopqrstuvwxyz";
const baseEnvironment: NodeJS.ProcessEnv = {
  VERCEL: "1", VERCEL_ENV: "preview", BETTER_AUTH_SECRET: secret,
  DATABASE_URL: "postgresql://test:test@database.invalid/test",
};
const headers = (ip = "192.0.2.1") => ({ "x-vercel-forwarded-for": ip });
function setup(overrides: NodeJS.ProcessEnv = {}) {
  const database = new MemoryDatabase();
  const environment = { ...baseEnvironment, ...overrides };
  const reserve = createAiAllowanceReserver({ environment: () => environment, pool: () => database });
  return { database, environment, reserve };
}

test("missing configuration, invalid environment and disabled budget never reach the database", async () => {
  for (const [overrides, reason] of [
    [{ DATABASE_URL: "" }, "not_configured"], [{ BETTER_AUTH_SECRET: "short" }, "not_configured"],
    [{ VERCEL_ENV: "untrusted" }, "not_configured"], [{ SAJDA_AI_DAILY_LIMIT: "-1" }, "not_configured"],
    [{ SAJDA_AI_DAILY_LIMIT: "1.2" }, "not_configured"], [{ SAJDA_AI_DAILY_LIMIT: "0" }, "disabled"],
  ] as [NodeJS.ProcessEnv, string][]) {
    const { database, reserve } = setup(overrides);
    const result = await reserve(headers());
    assert.equal(result.allowed, false);
    assert.equal(result.reason, reason);
    await result.release();
    assert.equal(database.connects, 0);
  }
});

test("Vercel requires one valid trusted IP and ignores socket/forwarded fallbacks", async () => {
  const { database, reserve } = setup();
  for (const input of [
    {}, { "x-forwarded-for": "192.0.2.1" }, { "x-vercel-forwarded-for": ["192.0.2.1"] },
    headers("192.0.2.1, 192.0.2.2"), headers("192.0.2.1:123"), headers("not-an-ip"),
    { "x-vercel-forwarded-for": "192.0.2.1", "X-Vercel-Forwarded-For": "192.0.2.2" },
  ]) assert.equal((await reserve(input, { remoteAddress: "127.0.0.1" })).reason, "missing_identity");
  assert.equal(database.connects, 0);
  const valid = await reserve({ "X-Vercel-Forwarded-For": "192.0.2.1" });
  assert.equal(valid.allowed, true);
  await valid.release();
});

test("local development accepts only a loopback socket, never a proxy header", async () => {
  const { database, reserve } = setup({ VERCEL: undefined });
  assert.equal((await reserve(headers())).reason, "missing_identity");
  assert.equal((await reserve(headers(), { remoteAddress: "192.0.2.1" })).reason, "missing_identity");
  const allowed = await reserve(headers("203.0.113.8"), { remoteAddress: "::ffff:127.0.0.1" });
  assert.equal(allowed.allowed, true);
  const ipKey = createHmac("sha256", secret).update(["sajda-ai-ip-v1", "sajda.ai.v1:development", "127.0.0.1"].join("\0")).digest("hex");
  assert.ok([...database.counters.values()].some(row => row.identity_hash === ipKey));
  await allowed.release();
});

test("reservation consumes global/IP counters, creates a short lease, stores no raw IP", async () => {
  const { database, reserve } = setup();
  const allowed = await reserve(headers());
  assert.equal(allowed.allowed, true);
  assert.equal(database.counters.size, 2);
  assert.equal(database.leases.size, 1);
  assert.equal([...database.leases.values()][0].expiresAt - database.now, 20_000);
  assert.ok(database.statements.some(row => row.text.includes("pg_advisory_xact_lock")));
  assert.ok(database.statements.some(row => row.text.includes("lock_timeout = '750ms'")));
  assert.ok(!JSON.stringify(database.statements).includes("192.0.2.1"));
  assert.ok(!JSON.stringify([...database.counters.values()]).includes(secret));
  await Promise.all([allowed.release(), allowed.release()]);
  assert.equal(database.leases.size, 0);
  assert.equal(database.statements.filter(row => row.text.includes("ai:release")).length, 1);
  assert.ok([...database.counters.values()].every(row => row.request_count === 1));
});

test("default global cap is 50 and configured cap never exceeds 100", async () => {
  for (const [configured, maximum] of [[undefined, 50], ["999", 100], ["2", 2]] as const) {
    const { database, reserve } = setup({ SAJDA_AI_DAILY_LIMIT: configured });
    for (let index = 1; index <= maximum; index += 1) {
      const allowed = await reserve(headers(`192.0.2.${index}`));
      assert.equal(allowed.allowed, true);
      await allowed.release();
    }
    assert.equal((await reserve(headers("198.51.100.1"))).reason, "daily_limit");
    assert.equal([...database.counters.values()].find(row => row.identity_hash === "global")?.request_count, maximum);
  }
});

test("all AI task instances share three rapid IP requests per UTC day and deny the fourth", async () => {
  const { database, environment, reserve } = setup();
  const otherTask = createAiAllowanceReserver({ environment: () => environment, pool: () => database });
  const instant = database.now;
  for (let index = 0; index < 3; index += 1) {
    const allowed = await (index % 2 ? otherTask : reserve)(headers());
    assert.equal(allowed.allowed, true);
    await allowed.release();
  }
  assert.equal((await otherTask(headers())).reason, "ip_daily_limit");
  assert.equal(database.now, instant);
  assert.equal(database.leases.size, 0);
  assert.ok([...database.counters.values()].every(row => row.request_count === 3));
});

test("test IP override rejects malformed or out-of-range values before any database access", async () => {
  for (const stage of ["development", "preview", "production"]) {
    for (const value of ["", " ", "0", "-1", "21", "100", "1.5", "1e1", "01", "Infinity", "NaN", "20; DROP TABLE"] ) {
      const { database, reserve } = setup({ VERCEL_ENV: stage, SAJDA_AI_TEST_IP_DAILY_LIMIT: value });
      assert.equal((await reserve(headers())).reason, "not_configured", `${stage}: ${value}`);
      assert.equal(database.connects, 0);
    }
  }
});

test("only explicit preview/development test configuration permits up to twenty IP requests", async () => {
  for (const stage of ["preview", "development"]) {
    for (const maximum of [1, 4, 20]) {
      const { database, reserve } = setup({ VERCEL_ENV: stage, SAJDA_AI_TEST_IP_DAILY_LIMIT: String(maximum) });
      for (let index = 0; index < maximum; index++) {
        const result = await reserve(headers());
        assert.equal(result.allowed, true);
        await result.release();
      }
      assert.equal((await reserve(headers())).reason, "ip_daily_limit");
      assert.ok([...database.counters.values()].every(row => row.request_count === maximum));
      assert.equal(database.leases.size, 0);
    }
  }
});

test("production ignores a valid test override and untrusted headers cannot enable it", async () => {
  for (const override of ["1", "20"]) {
    const { database, reserve } = setup({ VERCEL_ENV: "production", SAJDA_AI_TEST_IP_DAILY_LIMIT: override });
    for (let index = 0; index < 3; index++) {
      const result = await reserve({ ...headers(), "SAJDA_AI_TEST_IP_DAILY_LIMIT": "20", "VERCEL_ENV": "preview" });
      assert.equal(result.allowed, true);
      await result.release();
    }
    assert.equal((await reserve(headers())).reason, "ip_daily_limit");
    assert.ok([...database.counters.values()].every(row => row.namespace === "sajda.ai.v1:production" && row.request_count === 3));
  }
});

test("local test override requires development execution and keeps loopback identity checks", async () => {
  for (const productionHint of [undefined, "NODE_ENV", "VERCEL_ENV"]) {
    const environment: NodeJS.ProcessEnv = { VERCEL: undefined, SAJDA_AI_TEST_IP_DAILY_LIMIT: "20" };
    if (productionHint) environment[productionHint] = "production";
    const { reserve } = setup(environment);
    assert.equal((await reserve(headers())).reason, "missing_identity");
    const maximum = productionHint ? 3 : 20;
    for (let index = 0; index < maximum; index++) {
      const result = await reserve({}, { remoteAddress: "127.0.0.1" });
      assert.equal(result.allowed, true);
      await result.release();
    }
    assert.equal((await reserve({}, { remoteAddress: "127.0.0.1" })).reason, "ip_daily_limit");
  }
});

test("raising or removing the test override preserves existing counters, identities and spend", async () => {
  const { database, environment, reserve } = setup();
  for (let index = 0; index < 3; index++) await (await reserve(headers())).release();
  assert.equal((await reserve(headers())).reason, "ip_daily_limit");
  const originalKeys = [...database.counters.keys()];
  environment.SAJDA_AI_TEST_IP_DAILY_LIMIT = "20";
  for (let index = 3; index < 20; index++) await (await reserve(headers())).release();
  assert.equal((await reserve(headers())).reason, "ip_daily_limit");
  assert.deepEqual([...database.counters.keys()], originalKeys);
  assert.ok([...database.counters.values()].every(row => row.request_count === 20));
  delete environment.SAJDA_AI_TEST_IP_DAILY_LIMIT;
  assert.equal((await reserve(headers())).reason, "ip_daily_limit");
  assert.ok([...database.counters.values()].every(row => row.request_count === 20));
});

test("enabling a test override before migration fails closed without partially consuming quota", async () => {
  const { database, reserve } = setup({ SAJDA_AI_TEST_IP_DAILY_LIMIT: "20" });
  database.testIpMaximum = 3;
  for (let index = 0; index < 3; index++) await (await reserve(headers())).release();
  assert.equal((await reserve(headers())).reason, "storage_unavailable");
  assert.ok([...database.counters.values()].every(row => row.request_count === 3));
  assert.equal(database.leases.size, 0);
  assert.equal(database.destroyed, 1);
});

test("test IP override does not raise the shared global budget or concurrent lease limit", async () => {
  const { database, reserve } = setup({ SAJDA_AI_TEST_IP_DAILY_LIMIT: "20" });
  const parallel = await Promise.all([reserve(headers()), reserve(headers()), reserve(headers())]);
  assert.equal(parallel.filter(result => result.allowed).length, 2);
  assert.equal(parallel.filter(result => result.reason === "concurrency_limit").length, 1);
  assert.ok([...database.leases.values()].every(lease => lease.expiresAt - database.now === 20_000));
  await Promise.all(parallel.map(result => result.release()));
  for (let index = 2; index < 50; index++) {
    const result = await reserve(headers(`192.0.2.${Math.floor(index / 20) + 1}`));
    assert.equal(result.allowed, true);
    await result.release();
  }
  assert.equal((await reserve(headers("192.0.2.99"))).reason, "daily_limit");
  assert.equal([...database.counters.values()].find(row => row.identity_hash === "global")?.request_count, 50);
});

test("concurrent requests consume the final expanded test IP allowance exactly once", async () => {
  const { database, reserve } = setup({ SAJDA_AI_TEST_IP_DAILY_LIMIT: "20" });
  for (let index = 0; index < 19; index++) await (await reserve(headers())).release();
  const results = await Promise.all([reserve(headers()), reserve(headers())]);
  assert.equal(results.filter(result => result.allowed).length, 1);
  assert.equal(results.filter(result => result.reason === "ip_daily_limit").length, 1);
  assert.ok([...database.counters.values()].every(row => row.request_count === 20));
  await Promise.all(results.map(result => result.release()));
});

test("UTC midnight resets the daily cap without delaying the next naming request", async () => {
  const { database, reserve } = setup();
  database.now = Date.parse("2026-09-08T23:59:45.000Z");
  for (let day = 0; day < 2; day += 1) {
    for (let request = 0; request < 3; request += 1) {
      const allowed = await reserve(headers());
      assert.equal(allowed.allowed, true);
      await allowed.release();
    }
    assert.equal((await reserve(headers())).reason, "ip_daily_limit");
    database.now += 30_000;
  }
  assert.equal([...database.counters.values()].filter(row => row.identity_hash === "global").length, 2);
  assert.ok([...database.counters.values()].every(row => row.request_count === 3));
});

test("parallel callers cannot reserve more than two global leases", async () => {
  const { database, reserve } = setup();
  const results = await Promise.all(Array.from({ length: 10 }, (_, index) => reserve(headers(`192.0.2.${index + 1}`))));
  assert.equal(results.filter(row => row.allowed).length, 2);
  assert.equal(results.filter(row => row.reason === "concurrency_limit").length, 8);
  assert.equal(database.leases.size, 2);
  await results[0].release();
  const next = await reserve(headers("198.51.100.1"));
  assert.equal(next.allowed, true);
  assert.equal(database.leases.size, 2);
  await Promise.all([...results.map(row => row.release()), next.release()]);
});

test("rapid requests from the same IP still obey two concurrent leases and the daily cap", async () => {
  const { database, reserve } = setup();
  const results = await Promise.all(Array.from({ length: 3 }, () => reserve(headers())));
  assert.equal(results.filter(result => result.allowed).length, 2);
  assert.equal(results.filter(result => result.reason === "concurrency_limit").length, 1);
  assert.equal(database.leases.size, 2);
  assert.ok([...database.counters.values()].every(row => row.request_count === 2));
  await results.find(result => result.allowed)!.release();
  const third = await reserve(headers());
  assert.equal(third.allowed, true);
  assert.equal(database.leases.size, 2);
  assert.equal((await reserve(headers())).reason, "ip_daily_limit");
  assert.ok([...database.counters.values()].every(row => row.request_count === 3));
  await Promise.all([...results.map(result => result.release()), third.release()]);
});

test("concurrent refinement requests consume the last IP allowance exactly once", async () => {
  const { database, reserve } = setup();
  for (let request = 0; request < 2; request += 1) await (await reserve(headers())).release();
  const results = await Promise.all([reserve(headers()), reserve(headers())]);
  assert.equal(results.filter(result => result.allowed).length, 1);
  assert.equal(results.filter(result => result.reason === "ip_daily_limit").length, 1);
  assert.ok([...database.counters.values()].every(row => row.request_count === 3));
  await Promise.all(results.map(result => result.release()));
});

test("a concurrent race for the last daily request consumes it exactly once", async () => {
  const { database, reserve } = setup({ SAJDA_AI_DAILY_LIMIT: "1" });
  const results = await Promise.all([reserve(headers("192.0.2.1")), reserve(headers("192.0.2.2"))]);
  assert.equal(results.filter(result => result.allowed).length, 1);
  assert.equal(results.filter(result => result.reason === "daily_limit").length, 1);
  assert.equal([...database.counters.values()].find(row => row.identity_hash === "global")?.request_count, 1);
  await Promise.all(results.map(result => result.release()));
});

test("crashed callers lose their lease after exactly 20 seconds without a quota refund", async () => {
  const { database, reserve } = setup();
  await reserve(headers("192.0.2.1"));
  await reserve(headers("192.0.2.2"));
  database.now += 19_999;
  assert.equal((await reserve(headers("192.0.2.3"))).reason, "concurrency_limit");
  database.now += 1;
  const next = await reserve(headers("192.0.2.3"));
  assert.equal(next.allowed, true);
  assert.equal([...database.counters.values()].find(row => row.identity_hash === "global")?.request_count, 3);
  await next.release();
});

test("database failures deny AI and destroy failed transaction connections", async () => {
  for (const failure of ["connect", "BEGIN", "SET", "lock", "clock", "cleanup", "counters", "active", "consume", "lease", "COMMIT"]) {
    const { database, reserve } = setup();
    database.fail = failure;
    const result = await reserve(headers());
    assert.equal(result.allowed, false, failure);
    assert.equal(result.reason, "storage_unavailable", failure);
    assert.equal(database.counters.size, 0, failure);
    assert.equal(database.leases.size, 0, failure);
    if (failure !== "connect") assert.equal(database.destroyed, 1, failure);
  }
});

test("uncertain commit denies the request and conservatively retains consumed quota", async () => {
  const { database, reserve } = setup();
  database.fail = "after-commit";
  assert.equal((await reserve(headers())).reason, "storage_unavailable");
  assert.equal(database.counters.size, 2);
  assert.equal(database.leases.size, 1);
  database.fail = "";
  for (let request = 0; request < 2; request += 1) {
    const retry = await reserve(headers());
    assert.equal(retry.allowed, true);
    assert.equal(database.leases.size, 2);
    await retry.release();
  }
  assert.equal((await reserve(headers())).reason, "ip_daily_limit");
  assert.ok([...database.counters.values()].every(row => row.request_count === 3));
  assert.equal(database.leases.size, 1);
});

test("release failure is safe, does not refund and expires without manual intervention", async () => {
  const { database, reserve } = setup();
  const allowed = await reserve(headers());
  database.fail = "release";
  await allowed.release();
  await allowed.release();
  assert.equal(database.destroyed, 1);
  assert.equal(database.leases.size, 1);
  database.fail = "";
  database.now += 20_000;
  await (await reserve(headers("192.0.2.2"))).release();
  assert.equal(database.leases.size, 0);
  assert.equal([...database.counters.values()].find(row => row.identity_hash === "global")?.request_count, 2);
});

test("development, preview and production use separate namespaces and HMAC identities", async () => {
  const { database, environment, reserve } = setup({ SAJDA_AI_DAILY_LIMIT: "1" });
  for (const stage of ["preview", "production", "development"]) {
    environment.VERCEL_ENV = stage;
    const allowed = await reserve(headers());
    assert.equal(allowed.allowed, true);
    await allowed.release();
    assert.equal((await reserve(headers("192.0.2.2"))).reason, "daily_limit");
  }
  assert.equal(new Set([...database.counters.values()].filter(row => row.identity_hash !== "global").map(row => row.identity_hash)).size, 3);
});

test("equivalent IPv6 and IPv4-mapped representations cannot gain another allowance", async () => {
  const { database, reserve } = setup();
  for (const aliases of [
    ["192.0.2.1", "::ffff:192.0.2.1"],
    ["2001:0db8:0000:0000:0000:0000:0000:0001", "2001:db8::1"],
  ]) {
    for (let request = 0; request < 3; request += 1) {
      const allowed = await reserve(headers(aliases[request % 2]));
      assert.equal(allowed.allowed, true);
      await allowed.release();
    }
    assert.equal((await reserve(headers(aliases[1]))).reason, "ip_daily_limit");
  }
  assert.equal(database.counters.size, 3);
  assert.equal([...database.counters.values()].find(row => row.identity_hash === "global")?.request_count, 6);
});

test("cleanup is bounded and migration is additive with server-only table privileges", async () => {
  const { database, reserve } = setup();
  await (await reserve(headers())).release();
  const cleanup = database.statements.find(row => row.text.includes("ai:cleanup"))!.text;
  assert.equal(cleanup.match(/LIMIT 100/gu)?.length, 2);
  const migration = readFileSync(new URL("../db/migrations/0003_ai_allowance.sql", import.meta.url), "utf8");
  assert.equal(migration.match(/CREATE TABLE /gu)?.length, 2);
  assert.equal(migration.match(/ENABLE ROW LEVEL SECURITY/gu)?.length, 2);
  assert.match(migration, /THEN 100 ELSE 3 END/u);
  assert.match(migration, /FROM PUBLIC/u);
  assert.doesNotMatch(migration, /\b(?:DROP|TRUNCATE|DELETE|UPDATE)\b/iu);
});

test("test-capacity migration replaces only the exact counter check without resetting stored state", () => {
  const migration = readFileSync(new URL("../db/migrations/0017_ai_test_allowance.sql", import.meta.url), "utf8");
  assert.equal(migration.match(/DROP CONSTRAINT /gu)?.length, 1);
  assert.match(migration, /DROP CONSTRAINT sajda_ai_allowance_counters_check/u);
  assert.match(migration, /ADD CONSTRAINT sajda_ai_allowance_counters_check CHECK/u);
  assert.match(migration, /WHEN identity_hash = 'global' THEN 100/u);
  assert.match(migration, /WHEN namespace IN \('sajda\.ai\.v1:preview', 'sajda\.ai\.v1:development'\) THEN 20/u);
  assert.match(migration, /ELSE 3/u);
  assert.doesNotMatch(migration, /\b(?:IF EXISTS|TRUNCATE|DELETE|UPDATE|INSERT|GRANT|DISABLE|DROP TABLE)\b/iu);
  assert.doesNotMatch(migration, /identity_hash_check|namespace_check|_pkey|allowance_leases/u);
});
