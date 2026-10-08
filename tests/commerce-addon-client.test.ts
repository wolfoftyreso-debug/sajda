import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createServer } from "vite";

const origin = "https://sajda.example.test", requestId = "req_0123456789abcdef", effectiveAt = new Date(Date.now() + 86400000).toISOString();
const snapshot = () => ({ accountId: "account-a", requestId, ready: true, mode: "test", status: "active", activePlan: "premium", canCheckout: false,
  canManage: true, appStoreManaged: false, accessExpiresAt: effectiveAt,
  price: { unitAmount: 4900, currency: "usd", interval: "month", intervalCount: 1, taxBehavior: "exclusive" },
  plans: Object.fromEntries(["basic", "premium", "trading"].map(plan => [plan, { ready: true, canCheckout: false,
    price: { unitAmount: plan === "basic" ? 900 : plan === "premium" ? 1900 : 4900, currency: "usd", interval: "month", intervalCount: 1, taxBehavior: "exclusive" } }])),
  tradingAddon: { canAdd: false, canRemove: false, pending: { enabled: true, effectiveAt, canCancel: true, state: "processing", canRetry: true } } });

test("Trading add-on client preserves uncertainty, explicit intent and owner/abort boundaries", async t => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window"), originalFetch = globalThis.fetch;
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { origin, hostname: "sajda.example.test" }, setTimeout, clearTimeout } });
  const vite = await createServer({ configFile: false, appType: "custom", server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] },
    define: { "import.meta.env.VITE_ACCOUNT_AUTH_ENABLED": '"true"', "import.meta.env.VITE_LOCAL_TEST_MODE": '"false"' } });
  let owner = "account-a", afterPost: (() => void) | undefined;
  const posts: Record<string, unknown>[] = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input), origin); assert.equal(url.origin, origin);
    if (url.pathname === "/api/auth/get-session") return Response.json({ user: { id: owner, email: "qa@example.test", emailVerified: true, name: "QA", createdAt: "2026-09-01T10:00:00Z", updatedAt: "2026-09-01T10:00:00Z" },
      session: { id: "session-a", userId: owner, createdAt: "2026-09-01T10:00:00Z", updatedAt: "2026-09-01T10:00:00Z", expiresAt: new Date(Date.now() + 60000).toISOString() } });
    assert.equal(url.pathname, "/api/account/billing"); assert.equal(init.credentials, "same-origin");
    assert.equal(init.cache, "no-store"); assert.equal(init.redirect, "error"); assert.equal(new Headers(init.headers).get("x-sajda-account"), "account-a");
    const body = JSON.parse(String(init.body)); posts.push(body); afterPost?.();
    return Response.json({ accountId: "account-a", requestId, ...(body.action === "trading-addon" ? { state: "scheduled", enabled: body.enabled, effectiveAt } : { state: "canceled" }) });
  };
  try {
    const client = await vite.ssrLoadModule("/src/lib/plusBilling.ts"), code = (expected: string) => (error: { code?: string }) => error.code === expected;
    await t.test("processing is honest and unknown DTO is never synthesized", () => {
      assert.equal(client.parsePlusBilling(snapshot(), "account-a").tradingAddon.pending.state, "processing");
      const { tradingAddon: _absent, ...legacy } = snapshot();
      assert.equal(client.parsePlusBilling(legacy, "account-a").tradingAddon, undefined);
      assert.equal(client.parsePlusBilling({ ...snapshot(), status: "past_due", activePlan: null,
        tradingAddon: { ...snapshot().tradingAddon, pending: { ...snapshot().tradingAddon.pending, canRetry: false } } }, "account-a").tradingAddon.pending.canCancel, true);
      for (const patch of [
        { tradingAddon: { ...snapshot().tradingAddon, canAdd: true } },
        { tradingAddon: { ...snapshot().tradingAddon, pending: { ...snapshot().tradingAddon.pending, state: "scheduled" } } },
        { tradingAddon: { ...snapshot().tradingAddon, pending: { ...snapshot().tradingAddon.pending, enabled: false } } },
        { appStoreManaged: true }, { canManage: false }, { status: "past_due", activePlan: null },
      ]) assert.throws(() => client.parsePlusBilling({ ...snapshot(), ...patch }, "account-a"), code("invalid_response"));
    });
    await t.test("mutations carry exact account intent, never client prices or arbitrary IDs", async () => {
      posts.length = 0; owner = "account-a";
      const key = randomUUID(); assert.equal((await client.changeTradingAddon({ accountId: owner }, key, true)).enabled, true);
      assert.deepEqual(posts[0], { action: "trading-addon", requestKey: key, enabled: true });
      const cancelKey = randomUUID(); assert.equal((await client.cancelTradingAddonChange({ accountId: owner }, cancelKey)).state, "canceled");
      assert.deepEqual(posts[1], { action: "cancel-trading-addon-change", requestKey: cancelKey });
      for (const value of [{ accountId: "other", requestId, state: "scheduled", enabled: true, effectiveAt },
        { accountId: owner, requestId, state: "scheduled", enabled: false, effectiveAt },
        { accountId: owner, requestId, state: "scheduled", enabled: true, effectiveAt, url: "https://attacker.test" }])
        assert.throws(() => client.parseTradingAddonChange(value, owner, true));
    });
    await t.test("changed owner after mutation invalidates the result; aborted scope cannot start a mutation", async () => {
      owner = "account-a"; afterPost = () => { owner = "account-b"; };
      await assert.rejects(() => client.changeTradingAddon({ accountId: "account-a" }, randomUUID(), false), code("account_changed"));
      afterPost = undefined; owner = "account-a"; const controller = new AbortController(); controller.abort(); const before = posts.length;
      await assert.rejects(() => client.cancelTradingAddonChange({ accountId: owner, signal: controller.signal }, randomUUID())); assert.equal(posts.length, before);
    });
  } finally { globalThis.fetch = originalFetch; if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow); else Reflect.deleteProperty(globalThis, "window"); await vite.close(); }
});
