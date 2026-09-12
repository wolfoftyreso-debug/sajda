import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { AccountAccessError } from "../api/_shared/account-error.js";
import { createTradingScenariosStore, type TradingScenariosClient } from "../api/_shared/trading-scenarios-store.js";
import { tradingScenarioInputSchema, type TradingScenarioInput } from "../shared/trading-scenarios.js";

const owner = "scenario-owner-a";
const input: TradingScenarioInput = {
  id: "10000000-0000-4000-8000-000000000001", expectedVersion: 0, domain: "example.com", title: "Brand thesis",
  thesis: "A user-authored hypothesis", catalyst: "Product launch", invalidation: "No buyer interest",
  reviewOn: "2026-12-01", stance: "bullish", analysisMode: "brand",
  assumptions: { acquisitionUsd: 100, annualRenewalUsd: 12, otherCostsUsd: 10, holdingMonths: 12,
    sellingFeePercent: 15, saleProbabilityPercent: 20, bearSaleUsd: 100, baseSaleUsd: 1000, bullSaleUsd: 5000 },
};
const hasCode = (code: string) => (error: unknown) => error instanceof AccountAccessError && error.code === code;
type Row = Record<string, unknown>;
function row(value = input, actualOwner = owner, namespace = "development"): Row {
  const normalized = tradingScenarioInputSchema.parse(value);
  const { expectedVersion, id, ...payload } = normalized;
  return { owner_id: actualOwner, namespace, id, payload, version: expectedVersion + 1,
    last_input_hash: createHash("sha256").update(JSON.stringify(normalized)).digest("hex"),
    created_at: new Date("2026-09-11T10:00:00.000Z"), updated_at: new Date("2026-09-11T10:00:00.000Z") };
}
function fixture(options: { fail?: string; failRollback?: boolean; count?: number; denied?: boolean; env?: NodeJS.ProcessEnv; corrupt?: Row; updateLost?: boolean } = {}) {
  let rows: Row[] = [], count = 0, clock = 0;
  let lock = Promise.resolve();
  const calls: Array<{ text: string; args: unknown[] }> = [], releases: boolean[] = [];
  const pool = { async connect(): Promise<TradingScenariosClient> {
    let working: Row[] | undefined, unlock: (() => void) | undefined, pendingCount: number | undefined;
    const source = () => working ?? rows;
    const matching = (args: unknown[]) => source().filter(value => value.owner_id === args[0] && value.namespace === args[1]);
    return {
      release(destroy = false) { releases.push(destroy); unlock?.(); unlock = undefined; },
      async query(text, args = []) {
        calls.push({ text, args });
        if (text === "ROLLBACK") {
          working = undefined; pendingCount = undefined; unlock?.(); unlock = undefined;
          if (options.failRollback) throw new Error("rollback connection closed");
          return { rows: [] };
        }
        if (options.fail && text.includes(options.fail)) throw new Error("postgres://private SQL token");
        if (text === "COMMIT") {
          if (working) rows = working;
          if (pendingCount !== undefined) count = pendingCount;
          working = undefined; unlock?.(); unlock = undefined;
        }
        if (text.includes("scenarios:lock")) {
          const previous = lock;
          lock = new Promise<void>(resolve => { unlock = resolve; });
          await previous;
          working = structuredClone(rows);
        }
        if (text.includes("scenarios:access")) return { rows: options.denied ? [] : [{ owner_id: args[0], allowed: true }] };
        if (text.includes("scenarios:limit")) { pendingCount = Math.min(count + 1, 61); return { rows: [{ request_count: pendingCount }] }; }
        if (text.includes("scenarios:current")) return { rows: matching(args).filter(value => value.id === args[2]) };
        if (text.includes("scenarios:count")) return { rows: [{ count: options.count ?? matching(args).length }] };
        if (text.includes("scenarios:list")) return { rows: options.corrupt ? [options.corrupt] : matching(args)
          .sort((a, b) => String(new Date(b.updated_at as string).toISOString()).localeCompare(new Date(a.updated_at as string).toISOString()))
          .slice(0, Number(args[2])) };
        if (text.includes("scenarios:insert")) {
          const now = new Date(Date.UTC(2026, 8, 11, 10, 0, ++clock));
          const inserted = { owner_id: args[0], namespace: args[1], id: args[2], payload: JSON.parse(String(args[3])), last_input_hash: args[4],
            version: 1, created_at: now, updated_at: now };
          assert.ok(working); working.push(inserted); return { rows: [inserted] };
        }
        if (text.includes("scenarios:update")) {
          const previous = matching(args).find(value => value.id === args[2] && value.version === args[5]);
          if (!previous || options.updateLost) return { rows: [] };
          Object.assign(previous, { payload: JSON.parse(String(args[3])), last_input_hash: args[4], version: Number(previous.version) + 1,
            updated_at: new Date(Date.UTC(2026, 8, 11, 10, 0, ++clock)) });
          return { rows: [previous] };
        }
        return { rows: [] };
      },
    };
  } };
  const store = createTradingScenariosStore({ pool, environment: () => options.env ?? {} });
  return { store, options, calls, releases, seed(value: Row) { rows.push(value); }, get rows() { return rows; }, get count() { return count; } };
}
test("scenario create/read produce schema-validated owned snapshots and canonical timestamps", async () => {
  const f = fixture();
  const saved = await f.store.save(owner, input);
  assert.equal(saved.length, 1); assert.equal(saved[0].version, 1); assert.equal(saved[0].domain, input.domain);
  assert.equal(saved[0].createdAt, "2026-09-11T10:00:01.000Z");
  assert.equal("expectedVersion" in saved[0], false); assert.equal("last_input_hash" in saved[0], false);
  assert.deepEqual(await f.store.read(owner), saved);
  assert.ok(f.calls.some(call => call.text === "BEGIN READ ONLY"));
  assert.deepEqual(f.releases, [false, false]);
});
test("every data query binds owner and namespace; lock binds both before count and insertion", async () => {
  const f = fixture({ env: { VERCEL: "1", VERCEL_ENV: "preview" } });
  await f.store.save(owner, input); await f.store.read(owner);
  for (const call of f.calls.filter(call => /scenarios:(?:access|current|count|insert|list)/u.test(call.text))) {
    assert.equal(call.args[0], owner); assert.equal(call.args[1], "preview");
    if (!call.text.includes("scenarios:insert")) assert.match(call.text, /(?:owner_id|u\.id)\s*=\s*\$1/u);
  }
  const lock = f.calls.findIndex(call => call.text.includes("scenarios:lock"));
  assert.deepEqual(f.calls[lock].args, [`sajda.scenarios.v1:preview:${owner}`]);
  assert.ok(lock < f.calls.findIndex(call => call.text.includes("scenarios:count")));
});
test("same UUID under a different account is isolated and reveals no foreign scenario", async () => {
  const f = fixture(); f.seed(row(input, "owner-b"));
  assert.deepEqual(await f.store.read(owner), []);
  await assert.rejects(() => f.store.save(owner, { ...input, expectedVersion: 1 }), hasCode("scenario_conflict"));
  await f.store.save(owner, input);
  assert.equal(f.rows.length, 2); assert.equal((await f.store.read("owner-b"))[0].version, 1);
});
test("development/preview/production rows cannot cross deployment boundaries", async () => {
  const f = fixture({ env: { VERCEL: "1", VERCEL_ENV: "preview" } });
  f.seed(row(input, owner, "production")); f.seed(row(input, owner, "development"));
  assert.deepEqual(await f.store.read(owner), []);
  await f.store.save(owner, input); assert.equal(f.rows.length, 3);
  assert.equal(f.rows.filter(value => value.namespace === "preview").length, 1);
});
test("create and last update retries are idempotent without incrementing versions", async () => {
  const f = fixture(); const first = await f.store.save(owner, input);
  assert.deepEqual(await f.store.save(owner, { ...input, title: ` ${input.title} ` }), first);
  const next = { ...input, expectedVersion: 1, title: "Revised hypothesis" };
  const second = await f.store.save(owner, next);
  assert.equal(second[0].version, 2); assert.equal(second[0].createdAt, first[0].createdAt);
  assert.deepEqual(await f.store.save(owner, next), second);
  assert.equal(f.calls.filter(call => call.text.includes("scenarios:insert")).length, 1);
  assert.equal(f.calls.filter(call => call.text.includes("scenarios:update")).length, 1);
});

test("uppercase and lowercase UUID retries share the canonical database identity and receipt", async () => {
  const f = fixture();
  const upper = { ...input, id: "ABCDEFAB-CDEF-4ABC-8DEF-ABCDEFABCDEF", title: "Nordisk idé 🧭" };
  const first = await f.store.save(owner, upper);
  assert.equal(first[0].id, upper.id.toLowerCase());
  assert.equal(first[0].title, upper.title);
  assert.deepEqual(await f.store.save(owner, { ...upper, id: upper.id.toLowerCase() }), first);
  assert.deepEqual(await f.store.save(owner, upper), first);
  assert.equal(f.rows.length, 1);
  assert.equal(f.calls.filter(call => call.text.includes("scenarios:insert")).length, 1);
  assert.equal(f.calls.filter(call => call.text.includes("scenarios:update")).length, 0);
  assert.equal(first[0].version, 1);
});
test("stale/divergent operations cannot clobber a newer edit", async () => {
  const f = fixture(); await f.store.save(owner, input);
  await assert.rejects(() => f.store.save(owner, { ...input, title: "Different create" }), hasCode("scenario_conflict"));
  await f.store.save(owner, { ...input, expectedVersion: 1, title: "Second" });
  await assert.rejects(() => f.store.save(owner, input), hasCode("scenario_conflict"));
  await assert.rejects(() => f.store.save(owner, { ...input, expectedVersion: 1, title: "Third" }), hasCode("scenario_conflict"));
  assert.equal((await f.store.read(owner))[0].title, "Second");
});
test("a raced SQL update still requires owner+namespace+id+version CAS", async () => {
  const f = fixture({ updateLost: true }); f.seed(row());
  await assert.rejects(() => f.store.save(owner, { ...input, expectedVersion: 1, title: "Changed" }), hasCode("scenario_conflict"));
  const update = f.calls.find(call => call.text.includes("scenarios:update"))!;
  assert.match(update.text, /WHERE owner_id=\$1 AND namespace=\$2 AND id=\$3::uuid AND version=\$6/u);
  assert.equal(f.rows[0].version, 1);
});
test("100-scenario capacity allows updates and denies extra creates", async () => {
  const f = fixture({ count: 100 }); f.seed(row());
  const second = { ...input, id: "20000000-0000-4000-8000-000000000001" };
  await assert.rejects(() => f.store.save(owner, second), hasCode("scenario_limit"));
  assert.equal((await f.store.save(owner, { ...input, expectedVersion: 1, title: "Existing edited" }))[0].version, 2);
  assert.equal(f.rows.length, 1);
});
test("concurrent creates serialize before quota count and cannot exceed 100", async () => {
  const f = fixture();
  for (let i = 1; i <= 99; i++) f.seed(row({ ...input, id: `10000000-0000-4000-8000-${String(i).padStart(12, "0")}` }));
  const results = await Promise.allSettled([
    f.store.save(owner, { ...input, id: "20000000-0000-4000-8000-000000000001" }),
    f.store.save(owner, { ...input, id: "30000000-0000-4000-8000-000000000001" }),
  ]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  const denied = results.find(result => result.status === "rejected") as PromiseRejectedResult;
  assert.equal(denied.reason.code, "scenario_limit"); assert.equal(f.rows.length, 100);
});
test("concurrent identical requests create once and receive one coherent version", async () => {
  const f = fixture();
  const [a, b] = await Promise.all([f.store.save(owner, input), f.store.save(owner, input)]);
  assert.deepEqual(a, b); assert.equal(f.rows.length, 1); assert.equal(a[0].version, 1);
});
test("revoked/unverified Trading access is rechecked inside every read and write", async () => {
  const f = fixture({ denied: true });
  await assert.rejects(() => f.store.read(owner), hasCode("trading_required"));
  await assert.rejects(() => f.store.save(owner, input), hasCode("trading_required"));
  assert.equal(f.calls.some(call => /scenarios:(?:list|insert|update|count)/u.test(call.text)), false);
  const check = f.calls.find(call => call.text.includes("scenarios:access"))!;
  assert.match(check.text, /u\."emailVerified"=true/u); assert.match(check.text, /a\.expires_at>statement_timestamp\(\)/u);
});
test("write/list/commit failure rolls back and preserves retry identity", async () => {
  for (const failed of ["scenarios:insert", "scenarios:list", "COMMIT"]) {
    const f = fixture({ fail: failed });
    await assert.rejects(() => f.store.save(owner, input), error => hasCode("trading_scenarios_unavailable")(error)
      && !/postgres|SQL|token|private/u.test(String(error)));
    assert.equal(f.rows.length, 0); assert.ok(f.calls.some(call => call.text === "ROLLBACK"));
    f.options.fail = undefined; assert.equal((await f.store.save(owner, input))[0].version, 1);
  }
});
test("broken rollback destroys pooled connection instead of returning it to pool", async () => {
  const f = fixture({ fail: "scenarios:insert", failRollback: true });
  await assert.rejects(() => f.store.save(owner, input), hasCode("trading_scenarios_unavailable"));
  assert.deepEqual(f.releases, [true]);
});
test("invalid owner/configuration/input never start a database mutation", async () => {
  const f = fixture({ env: { VERCEL: "1", VERCEL_ENV: "unknown" } });
  await assert.rejects(() => f.store.save(owner, input), hasCode("trading_scenarios_unavailable"));
  assert.deepEqual(f.calls, []);
  const valid = fixture();
  for (const invalid of ["", " ", "a".repeat(201)]) await assert.rejects(() => valid.store.read(invalid), hasCode("invalid_session"));
  await assert.rejects(() => valid.store.save(owner, { ...input, domain: "http://127.0.0.1" }), hasCode("invalid_request"));
  assert.deepEqual(valid.calls, []);
});

test("NUL and unpaired surrogates cannot bypass the store validation boundary", async () => {
  const f = fixture();
  for (const field of ["title", "thesis", "catalyst", "invalidation"] as const) {
    for (const unsafe of ["\u0000", "\ud800", "\udc00", "\ud800x"]) {
      await assert.rejects(() => f.store.save(owner, { ...input, [field]: `Draft ${unsafe} text` }), hasCode("invalid_request"));
    }
  }
  assert.deepEqual(f.calls, []);
});
test("corrupt, foreign and unbounded persisted payloads fail closed", async () => {
  for (const corrupt of [
    { ...row(), owner_id: "other" }, { ...row(), namespace: "production" }, { ...row(), version: -1 },
    { ...row(), payload: { ...(row().payload as object), title: "x".repeat(101) } },
    { ...row(), updated_at: new Date("2025-01-01T00:00:00Z") }, { ...row(), created_at: "invalid" },
    { ...row(), payload: { ...(row().payload as object), evidence: "fabricated" } },
    { ...row(), last_input_hash: "invalid" },
  ]) {
    const f = fixture({ corrupt }); await assert.rejects(() => f.store.read(owner), hasCode("trading_scenarios_unavailable"));
  }
});
test("forged retry hash cannot acknowledge a different persisted payload", async () => {
  const f = fixture(); f.seed({ ...row(), payload: { ...(row().payload as object), title: "Other title" } });
  await assert.rejects(() => f.store.save(owner, input), hasCode("scenario_conflict"));
});
test("durable rate budget saturates and commits rejected requests", async () => {
  const f = fixture(); for (let i = 0; i < 60; i++) await f.store.limit(owner);
  assert.equal(f.count, 60);
  await assert.rejects(() => f.store.limit(owner), hasCode("rate_limited")); assert.equal(f.count, 61);
  await assert.rejects(() => f.store.limit(owner), hasCode("rate_limited")); assert.equal(f.count, 61);
  const limits = f.calls.filter(call => call.text.includes("scenarios:limit"));
  assert.equal(new Set(limits.map(call => call.args[0])).size, 1);
  assert.match(String(limits[0].args[0]), /^[a-f0-9]{64}$/u);
});
test("migration is owner-keyed, bounded, cascades account deletion and denies public access", () => {
  const sql = readFileSync(new URL("../db/migrations/0018_trading_scenarios.sql", import.meta.url), "utf8");
  assert.match(sql, /REFERENCES public\.sajda_auth_user\(id\) ON DELETE CASCADE/u);
  assert.match(sql, /PRIMARY KEY \(namespace, owner_id, id\)/u);
  assert.match(sql, /octet_length\(payload::text\) <= 16384/u);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/u); assert.match(sql, /REVOKE ALL ON sajda\.trading_scenarios FROM PUBLIC/u);
  assert.doesNotMatch(sql, /INSERT INTO|DROP TABLE|GRANT /u);
});
