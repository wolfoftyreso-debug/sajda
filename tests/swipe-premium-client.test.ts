import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { createServer } from "vite";
import type { SwipePremiumErrorCode } from "../src/lib/swipePremium";

test("Swipe Undo requires a new owner-scoped server grant for every action", async t => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalFetch = globalThis.fetch;
  const origin = "https://sajda.example.test";
  const requestId = "req_0123456789abcdef";
  const requests: { url: URL; init: RequestInit }[] = [];
  let owner: string | null = "account-a";
  let sessionExpiry = Date.now() + 60_000;
  let reply: (init: RequestInit) => Response = () => Response.json({ ok: true, capability: "swipe_undo", accountId: "account-a", requestId });
  let duringSessionRead: (() => void) | undefined;
  let duringResponse: (() => void) | undefined;
  const vite = await createServer({
    configFile: false, appType: "custom", server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] },
    define: { "import.meta.env.VITE_ACCOUNT_AUTH_ENABLED": '"true"', "import.meta.env.VITE_LOCAL_TEST_MODE": '"false"' },
  });
  try {
    Object.defineProperty(globalThis, "window", { configurable: true, value: {
      location: { origin, hostname: "sajda.example.test" }, setTimeout, clearTimeout,
    } });
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(String(input));
      requests.push({ url, init });
      if (url.pathname === "/api/auth/get-session") {
        const currentOwner = owner;
        const expiresAt = new Date(sessionExpiry).toISOString();
        duringSessionRead?.();
        return Response.json(currentOwner ? {
          user: { id: currentOwner, email: "qa@example.test", emailVerified: true, name: "QA", createdAt: "2026-09-08T10:00:00Z", updatedAt: "2026-09-08T10:00:00Z" },
          session: { id: "session-a", userId: currentOwner, createdAt: "2026-09-08T10:00:00Z", updatedAt: "2026-09-08T10:00:00Z", expiresAt },
        } : null);
      }
      assert.equal(url.pathname, "/api/account/capabilities");
      duringResponse?.();
      return reply(init);
    };
    const { authorizeSwipeUndo, getSwipeCapabilities } = await vite.ssrLoadModule("/src/lib/swipePremium.ts");
    const failedWith = (code: SwipePremiumErrorCode) => (error: unknown) => error instanceof Error
      && error.name === "SwipePremiumError" && (error as Error & { code: string }).code === code;
    const grant = () => Response.json({ ok: true, capability: "swipe_undo", accountId: "account-a", requestId });
    const posts = () => requests.filter(request => request.url.pathname === "/api/account/capabilities" && request.init.method === "POST");

    await t.test("each successful undo performs a new POST, not a local entitlement check", async () => {
      const before = posts().length;
      assert.deepEqual(await authorizeSwipeUndo({ accountId: "account-a" }), { accountId: "account-a", requestId });
      assert.deepEqual(await authorizeSwipeUndo({ accountId: "account-a" }), { accountId: "account-a", requestId });
      assert.equal(posts().length - before, 2);
      for (const { url, init } of requests) {
        assert.equal(url.origin, origin);
        assert.equal(init.credentials, "same-origin");
        assert.equal(new Headers(init.headers).has("authorization"), false);
      }
      for (const { init } of posts()) {
        assert.equal(init.redirect, "error");
        assert.equal(init.cache, "no-store");
        assert.equal(new Headers(init.headers).get("x-sajda-account"), "account-a");
        assert.equal(new Headers(init.headers).get("content-type"), "application/json");
        assert.deepEqual(JSON.parse(String(init.body)), { capability: "swipe_undo" });
      }
    });

    await t.test("a display capability never grants Undo after the entitlement expires", async () => {
      reply = () => Response.json({ capabilities: { swipe_undo: true }, accountId: "account-a", requestId });
      assert.deepEqual(await getSwipeCapabilities({ accountId: "account-a" }), { swipe_undo: true });
      reply = () => Response.json({ error: "Expired subscription", code: "premium_required", requestId }, { status: 403 });
      await assert.rejects(authorizeSwipeUndo({ accountId: "account-a" }), failedWith("premium_required"));
      reply = () => Response.json({ capabilities: { swipe_undo: false }, accountId: "account-a", requestId });
      assert.deepEqual(await getSwipeCapabilities({ accountId: "account-a" }), { swipe_undo: false });
    });

    await t.test("free, expired session, unverified email and dependency failures fail closed", async () => {
      for (const [status, code, expected] of [
        [403, "premium_required", "premium_required"], [401, "authentication_required", "unauthenticated"],
        [401, "invalid_session", "unauthenticated"], [403, "email_verification_required", "email_verification_required"],
        [409, "account_changed", "account_changed"], [503, "capabilities_unavailable", "unavailable"],
        [503, "auth_unavailable", "unavailable"], [403, "invalid_origin", "unavailable"], [429, "rate_limited", "unavailable"],
      ] as const) {
        reply = () => Response.json({ error: "Sensitive upstream detail", code, requestId }, { status });
        await assert.rejects(authorizeSwipeUndo({ accountId: "account-a" }), error => {
          assert.ok(failedWith(expected)(error));
          assert.doesNotMatch((error as Error).message, /Sensitive upstream detail/u);
          return true;
        });
      }
      reply = () => { throw new Error("Network failed"); };
      await assert.rejects(authorizeSwipeUndo({ accountId: "account-a" }), failedWith("unavailable"));
    });

    await t.test("malformed or contradictory 200 responses cannot authorize an action", async () => {
      const valid = { ok: true, capability: "swipe_undo", accountId: "account-a", requestId };
      for (const payload of [null, [], {}, "premium", { ...valid, ok: "true" }, { ...valid, capability: "export" },
        { ...valid, accountId: undefined }, { ...valid, accountId: 1 }, { ...valid, requestId: "" },
        { ...valid, requestId: "<script>" }, { ...valid, code: "premium_required" }, { ...valid, error: "denied" }]) {
        reply = () => Response.json(payload);
        await assert.rejects(authorizeSwipeUndo({ accountId: "account-a" }));
      }
      reply = () => new Response("not JSON", { status: 200 });
      await assert.rejects(authorizeSwipeUndo({ accountId: "account-a" }));
      reply = () => Response.json({ ...valid, accountId: "account-b" });
      await assert.rejects(authorizeSwipeUndo({ accountId: "account-a" }), failedWith("account_changed"));
    });

    await t.test("malformed display capabilities are rejected rather than becoming truthy", async () => {
      for (const payload of [
        { capabilities: { swipe_undo: "true" }, accountId: "account-a", requestId },
        { capabilities: { swipe_undo: true }, requestId },
        { capabilities: { swipe_undo: true }, accountId: "account-a", requestId, ok: false },
        { capabilities: {}, accountId: "account-a", requestId },
      ]) {
        reply = () => Response.json(payload);
        await assert.rejects(getSwipeCapabilities({ accountId: "account-a" }), failedWith("invalid_response"));
      }
    });

    await t.test("account change before or during authorization cannot grant the initiating UI access", async () => {
      reply = grant;
      owner = "account-b";
      const before = posts().length;
      await assert.rejects(authorizeSwipeUndo({ accountId: "account-a" }), failedWith("account_changed"));
      assert.equal(posts().length, before);
      owner = "account-a";
      duringResponse = () => { owner = "account-b"; };
      await assert.rejects(authorizeSwipeUndo({ accountId: "account-a" }), failedWith("account_changed"));
      duringResponse = undefined;
      owner = "account-a";
      duringResponse = () => { sessionExpiry = Date.now() - 1000; };
      await assert.rejects(authorizeSwipeUndo({ accountId: "account-a" }), failedWith("unauthenticated"));
      duringResponse = undefined;
      sessionExpiry = Date.now() + 60_000;
      duringResponse = () => { owner = null; };
      await assert.rejects(authorizeSwipeUndo({ accountId: "account-a" }), failedWith("unauthenticated"));
      duringResponse = undefined;
      owner = "account-a";
    });

    await t.test("initiating account is immutable and abort prevents stale completion", async () => {
      reply = grant;
      const options = { accountId: "account-a" };
      duringSessionRead = () => { options.accountId = "account-b"; };
      assert.equal((await authorizeSwipeUndo(options)).accountId, "account-a");
      duringSessionRead = undefined;
      const cancelled = new AbortController();
      cancelled.abort();
      const before = requests.length;
      await assert.rejects(authorizeSwipeUndo({ accountId: "account-a", signal: cancelled.signal }), { name: "AbortError" });
      assert.equal(requests.length, before);
      const stale = new AbortController();
      duringResponse = () => stale.abort();
      await assert.rejects(authorizeSwipeUndo({ accountId: "account-a", signal: stale.signal }), { name: "AbortError" });
      duringResponse = undefined;
      await assert.rejects(authorizeSwipeUndo({ accountId: "" }), failedWith("unauthenticated"));
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else delete (globalThis as { window?: unknown }).window;
    await vite.close();
  }
});
