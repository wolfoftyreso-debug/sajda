import assert from "node:assert/strict";
import test from "node:test";
import { AccountAccessError } from "../api/_shared/account-error.js";
import { createBrandLookupBudget, reserveBrandLookup, type BrandLookupBudgetOptions } from "../api/_shared/brand-lookup-budget.js";

const isLimited = (error: unknown) => error instanceof AccountAccessError && error.code === "rate_limited" && error.status === 429;
function fixture(options: Omit<BrandLookupBudgetOptions, "now"> = {}) {
  let time = 0;
  const reserve = createBrandLookupBudget({ ...options, now: () => time });
  return { reserve, setTime(value: number) { time = value; } };
}

test("the default gate admits immediately, rejects while busy and enforces exact start spacing", async () => {
  const f = fixture(), lease = await f.reserve();
  f.setTime(5000);
  await assert.rejects(f.reserve, isLimited);
  await lease.release();
  const next = await f.reserve();
  await next.release();
  f.setTime(5999);
  await assert.rejects(f.reserve, isLimited);
  f.setTime(6000);
  await (await f.reserve()).release();
});

test("concurrent reservations reject without queueing and only one acquires a lease", async () => {
  const f = fixture();
  const results = await Promise.allSettled(Array.from({ length: 20 }, () => f.reserve()));
  const accepted = results.filter(result => result.status === "fulfilled");
  assert.equal(accepted.length, 1);
  for (const result of results) if (result.status === "rejected") assert.ok(isLimited(result.reason));
  await accepted[0].value.release();
});

test("release is idempotent and an old lease cannot release a newer active lease", async () => {
  const f = fixture(), first = await f.reserve();
  await Promise.all([first.release(), first.release()]);
  f.setTime(1000);
  const second = await f.reserve();
  await first.release();
  f.setTime(2000);
  await assert.rejects(f.reserve, isLimited);
  await second.release();
  await (await f.reserve()).release();
});

test("thirty admissions exhaust the sliding hour and release does not refund them", async () => {
  const f = fixture();
  for (let index = 0; index < 30; index++) {
    f.setTime(index * 1000);
    await (await f.reserve()).release();
  }
  f.setTime(30_000);
  await assert.rejects(f.reserve, isLimited);
  f.setTime(3_599_999);
  await assert.rejects(f.reserve, isLimited);
  f.setTime(3_600_000);
  await (await f.reserve()).release();
  f.setTime(3_600_999);
  await assert.rejects(f.reserve, isLimited);
  f.setTime(3_601_000);
  await (await f.reserve()).release();
});

test("the hour expires per admission rather than resetting a whole anchored bucket", async () => {
  const f = fixture({ maxPerHour: 2 });
  await (await f.reserve()).release();
  f.setTime(10_000);
  await (await f.reserve()).release();
  f.setTime(3_600_000);
  await (await f.reserve()).release();
  f.setTime(3_601_000);
  await assert.rejects(f.reserve, isLimited);
  f.setTime(3_610_000);
  await (await f.reserve()).release();
});

test("factory overrides can tighten spacing and the hourly cap without widening defaults", async () => {
  const f = fixture({ maxPerHour: 1, minSpacingMs: 2000 });
  await (await f.reserve()).release();
  f.setTime(2000);
  await assert.rejects(f.reserve, isLimited);
  f.setTime(3_600_000);
  await (await f.reserve()).release();
  const spaced = fixture({ minSpacingMs: 2000 });
  await (await spaced.reserve()).release();
  spaced.setTime(1999);
  await assert.rejects(spaced.reserve, isLimited);
  spaced.setTime(2000);
  await (await spaced.reserve()).release();
});

test("backoff extends but never shortens cooldown and release never clears it", async () => {
  const f = fixture(), lease = await f.reserve();
  await lease.backoff(10);
  f.setTime(1000);
  await lease.backoff(1);
  await lease.release();
  f.setTime(9999);
  await assert.rejects(f.reserve, isLimited);
  f.setTime(10_000);
  await (await f.reserve()).release();
});

test("backoff does not implicitly release an active lease and may arrive after release", async () => {
  const f = fixture(), lease = await f.reserve();
  await lease.backoff(1);
  f.setTime(2000);
  await assert.rejects(f.reserve, isLimited);
  await lease.release();
  await lease.backoff(2);
  f.setTime(3999);
  await assert.rejects(f.reserve, isLimited);
  f.setTime(4000);
  await (await f.reserve()).release();
});

test("a full-day Retry-After survives release and expires only at its boundary", async () => {
  const f = fixture(), lease = await f.reserve();
  await lease.backoff(86_400);
  await lease.release();
  f.setTime(86_399_999);
  await assert.rejects(f.reserve, isLimited);
  f.setTime(86_400_000);
  await (await f.reserve()).release();
});

test("long Retry-After durations are respected beyond one day and arithmetic overflow saturates closed", async () => {
  const f = fixture(), lease = await f.reserve();
  await lease.backoff(172_800);
  await lease.release();
  for (const time of [86_400_000, 172_799_999]) {
    f.setTime(time);
    await assert.rejects(f.reserve, isLimited);
  }
  f.setTime(172_800_000);
  const next = await f.reserve();
  await next.backoff(Number.MAX_VALUE);
  await next.release();
  f.setTime(Number.MAX_SAFE_INTEGER - 86_400_000);
  await assert.rejects(f.reserve, isLimited);
});

test("fractional backoff rounds up to milliseconds and zero does not cancel a cooldown", async () => {
  const f = fixture(), lease = await f.reserve();
  await lease.backoff(1.0001);
  await lease.backoff(0);
  await lease.release();
  f.setTime(1000);
  await assert.rejects(f.reserve, isLimited);
  f.setTime(1001);
  await (await f.reserve()).release();
});

test("invalid configuration and backoff inputs fail without opening the gate", async () => {
  for (const maxPerHour of [0, -1, 31, 1.5, NaN, Infinity]) assert.throws(() => createBrandLookupBudget({ maxPerHour }), TypeError);
  for (const minSpacingMs of [0, 999, 1000.5, 86_400_001, NaN, Infinity]) assert.throws(() => createBrandLookupBudget({ minSpacingMs }), TypeError);
  assert.throws(() => createBrandLookupBudget({ now: null } as unknown as BrandLookupBudgetOptions), TypeError);
  const f = fixture(), lease = await f.reserve();
  for (const seconds of [-1, NaN, Infinity]) await assert.rejects(() => lease.backoff(seconds), TypeError);
  f.setTime(1000);
  await assert.rejects(f.reserve, isLimited);
  await lease.release();
  await (await f.reserve()).release();
});

test("invalid clocks fail closed and backwards time cannot forgive spacing or backoff", async () => {
  const f = fixture();
  f.setTime(10_000);
  const lease = await f.reserve();
  await lease.backoff(2);
  await lease.release();
  for (const value of [NaN, Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER, 0, 11_999]) {
    f.setTime(value);
    await assert.rejects(f.reserve, isLimited);
  }
  f.setTime(12_000);
  await (await f.reserve()).release();
  await assert.rejects(createBrandLookupBudget({ now: () => { throw new Error("private clock details"); } }), error =>
    isLimited(error) && error instanceof Error && !error.message.includes("private clock details"));
});

test("instances are intentionally isolated and the production export is an async reservation function", async () => {
  const first = fixture(), second = fixture();
  const a = await first.reserve(), b = await second.reserve();
  await a.backoff(86_400);
  await Promise.all([a.release(), b.release()]);
  second.setTime(1000);
  await (await second.reserve()).release();
  assert.equal(typeof reserveBrandLookup, "function");
});
