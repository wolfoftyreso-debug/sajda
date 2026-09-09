import assert from "node:assert/strict";
import test from "node:test";
import { assertAccountSessionOwner, collectAccountPages } from "../src/lib/accountRequestScope";

// These fixtures exercise client race guards, not cryptographic authorization.
// Cookie verification and expected-owner enforcement are tested server-side.

test("client request identity cannot silently follow a changed cookie session", () => {
  assert.doesNotThrow(() => assertAccountSessionOwner("account-a", "account-a"));
  for (const value of ["account-b", undefined, null, "", {}]) {
    assert.throws(() => assertAccountSessionOwner(value, "account-a"), (error: unknown) =>
      error instanceof Error && "code" in error && error.code === "account_changed");
  }
  assert.throws(() => assertAccountSessionOwner("", ""));
});

test("all saved-domain pages retain the initiating owner", async () => {
  const seen: string[] = [];
  const items = await collectAccountPages(async (cursor, scope) => {
    seen.push(scope.accountId);
    return cursor ? { items: ["second.com"], nextCursor: null } : { items: ["first.com"], nextCursor: "100" };
  }, { accountId: "account-a" });
  assert.deepEqual(items, ["first.com", "second.com"]);
  assert.deepEqual(seen, ["account-a", "account-a"]);
});

test("account switch during pagination rejects instead of combining owners", async () => {
  const options = { accountId: "account-a" };
  let providerAccount = "account-a";
  let successfulPages = 0;
  await assert.rejects(() => collectAccountPages(async (_cursor, scope) => {
    assertAccountSessionOwner(providerAccount, scope.accountId);
    successfulPages++;
    // A cross-tab sign-in changes the provider session and the caller's state.
    providerAccount = "account-b";
    options.accountId = "account-b";
    return { items: ["private-a.com"], nextCursor: "20" };
  }, options), /account changed/);
  assert.equal(successfulPages, 1, "No account-B page may join account-A data");
});

test("rapid identity switch discards a delayed response even when transport ignores abort", async () => {
  const oldAccount = new AbortController();
  let resolveOld!: (page: { items: string[]; nextCursor: null }) => void;
  let visible: string[] = [];
  const stale = collectAccountPages(() => new Promise(resolve => { resolveOld = resolve; }), {
    accountId: "account-a", signal: oldAccount.signal,
  }).then(items => { visible = items; });
  const rejected = assert.rejects(stale, { name: "AbortError" });
  oldAccount.abort();
  visible = await collectAccountPages(async () => ({ items: ["private-b.com"], nextCursor: null }), { accountId: "account-b" });
  resolveOld({ items: ["private-a.com"], nextCursor: null });
  await rejected;
  assert.deepEqual(visible, ["private-b.com"]);
});

test("cancellation prevents continuation and rejects partial saved-domain data", async () => {
  const cancelled = new AbortController();
  let calls = 0;
  await assert.rejects(() => collectAccountPages(async () => {
    calls++;
    cancelled.abort();
    return { items: ["private.com"], nextCursor: "20" };
  }, { accountId: "account-a", signal: cancelled.signal }), { name: "AbortError" });
  assert.equal(calls, 1);
  await assert.rejects(() => collectAccountPages(async () => {
    calls++;
    return { items: [], nextCursor: null };
  }, { accountId: "account-a", signal: cancelled.signal }), { name: "AbortError" });
  assert.equal(calls, 1);
});

test("malformed/repeated pagination fails without returning a partial list", async () => {
  await assert.rejects(() => collectAccountPages(async () => ({ items: ["one.com"], nextCursor: "10" }), { accountId: "account-a" }), /could not be loaded/);
  await assert.rejects(() => collectAccountPages(async () => ({ items: null as unknown as string[], nextCursor: null }), { accountId: "account-a" }), /could not be loaded/);
});
