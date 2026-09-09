import test from "node:test";
import assert from "node:assert/strict";
import { reserveFreeSearch, hasCompletedFreeSearch } from "../src/lib/freeSearchQuota";

const key = "sajda.free-search.v1";
const records = new Map<string, string>();
const store = {
  getItem: (name: string) => records.get(name) ?? null,
  setItem: (name: string, value: string) => { records.set(name, value); },
  removeItem: (name: string) => { records.delete(name); },
};
Object.defineProperty(globalThis, "window", { value: { localStorage: store }, configurable: true });

test("one free search: failures retry, success consumes, stale tabs cannot overwrite", async (t) => {
  await t.test("reject duplicate reservation but release a failed search", () => {
    const first = reserveFreeSearch();
    assert.ok(first);
    assert.equal(reserveFreeSearch(), null);
    assert.equal(hasCompletedFreeSearch(), false);
    first.release();
    assert.equal(records.has(key), false);
  });
  await t.test("successful search consumes one pass and cannot be released", () => {
    const first = reserveFreeSearch();
    assert.ok(first);
    first.complete();
    first.release();
    assert.equal(hasCompletedFreeSearch(), true);
    assert.equal(reserveFreeSearch(), null);
    records.clear();
  });
  await t.test("a crashed tab's expired pending reservation is retryable", () => {
    records.set(key, JSON.stringify({ version: 1, state: "pending", reservationId: "expired-tab-reservation", updatedAt: "2020-01-01", expiresAt: "2020-01-01" }));
    const retry = reserveFreeSearch();
    assert.ok(retry);
    retry.release();
  });
  await t.test("an older tab cannot commit or delete another tab's reservation", () => {
    const old = reserveFreeSearch();
    assert.ok(old);
    records.clear();
    const current = reserveFreeSearch();
    assert.ok(current);
    old.complete();
    old.release();
    assert.equal(hasCompletedFreeSearch(), false);
    assert.equal(reserveFreeSearch(), null);
    current.release();
  });
  await t.test("valid but wrong-shaped storage never burns a trial", () => {
    records.set(key, JSON.stringify({ version: 12, state: "completed" }));
    const retry = reserveFreeSearch();
    assert.ok(retry);
    retry.release();
  });
  await t.test("storage quota/write rejection falls back to memory", () => {
    store.setItem = () => { throw new Error("QuotaExceededError"); };
    const retry = reserveFreeSearch();
    assert.ok(retry);
    retry.complete();
    assert.equal(hasCompletedFreeSearch(), true);
    assert.equal(reserveFreeSearch(), null);
  });
});
