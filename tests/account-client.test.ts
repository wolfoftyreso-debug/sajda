import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { createServer } from "vite";

test("same-origin account client uses cookie sessions, fixed owner scope and no bearer token", async (t) => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalFetch = globalThis.fetch;
  const origin = "https://sajda.example.test";
  const requests: { url: URL; init: RequestInit }[] = [];
  let owner = "account-a";
  let sessionFailureStatus: number | undefined;
  let onSessionRead: (() => void) | undefined;
  let onAccountResponse: (() => void) | undefined;
  const vite = await createServer({
    configFile: false, appType: "custom",
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    resolve: { alias: { "@": path.resolve("src") } },
    optimizeDeps: { noDiscovery: true, include: [] },
    define: {
      "import.meta.env.VITE_ACCOUNT_AUTH_ENABLED": '"true"',
      "import.meta.env.VITE_LOCAL_TEST_MODE": '"false"',
    },
  });
  try {
    Object.defineProperty(globalThis, "window", { configurable: true, value: {
      location: { origin, hostname: "sajda.example.test" }, setTimeout, clearTimeout,
    } });
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(String(input));
      requests.push({ url, init });
      if (url.pathname === "/api/auth/get-session") {
        if (sessionFailureStatus) return Response.json({ code: "SESSION_CHECK_FAILED", message: "Unsafe provider diagnostic" }, { status: sessionFailureStatus });
        const userId = owner;
        onSessionRead?.();
        return Response.json({
          user: { id: userId, email: "qa@example.test", emailVerified: true, name: "QA", createdAt: "2026-09-08T10:00:00Z", updatedAt: "2026-09-08T10:00:00Z" },
          session: { id: "session-one", userId, createdAt: "2026-09-08T10:00:00Z", updatedAt: "2026-09-08T10:00:00Z", expiresAt: "2026-09-15T10:00:00Z" },
        });
      }
      if (url.pathname.startsWith("/api/account/")) {
        onAccountResponse?.();
        return Response.json({ items: [], nextCursor: null });
      }
      return Response.json({ status: true });
    };
    const { getAccountAuthClient, readAccountSession, accountRequest, accountError } = await vite.ssrLoadModule("/src/integrations/neon/auth.ts");

    await t.test("safe auth errors preserve only response classification, not provider details", () => {
      const safe = accountError({ status: 429, code: "RATE_LIMITED", message: "private provider body", token: "do-not-copy" }, "Retry later.");
      assert.equal(safe.message, "Retry later."); assert.equal(safe.status, 429); assert.equal(safe.code, "RATE_LIMITED");
      assert.equal("token" in safe, false);
      for (const status of ["401", NaN, Infinity, 99, 600, null]) assert.equal(accountError({ status }, "Safe").status, undefined);
      assert.equal(accountError({ status: 401 }, "Safe").status, 401);
    });

    await t.test("only same-origin auth API is used for session and credential actions", async () => {
      const session = await readAccountSession();
      assert.equal(session.user.id, owner);
      assert.equal(session.user.email_verified, true);
      assert.equal("access_token" in session, false);
      assert.equal("token" in session, false);
      const client = await getAccountAuthClient();
      await client.signIn.email({ email: "qa@example.test", password: "test-only-password" });
      await client.requestPasswordReset({ email: "qa@example.test", redirectTo: `${origin}/auth?mode=update-password` });
      await client.signOut({});
      assert.deepEqual(requests.map(request => request.url.pathname), [
        "/api/auth/get-session", "/api/auth/sign-in/email", "/api/auth/request-password-reset", "/api/auth/sign-out",
      ]);
      for (const request of requests) {
        assert.equal(request.url.origin, origin);
        assert.equal(request.init.credentials, "same-origin");
        assert.equal(new Headers(request.init.headers).has("authorization"), false);
      }
    });

    await t.test("account mutations send the initiating owner plus JSON, not authentication tokens", async () => {
      await accountRequest("/api/account/saved-domains", { accountId: owner, method: "POST", body: { domain: "example.com" } });
      const { init } = requests.at(-1)!;
      assert.equal(init.credentials, "same-origin");
      assert.equal(init.redirect, "error");
      assert.equal(new Headers(init.headers).get("x-sajda-account"), owner);
      assert.equal(new Headers(init.headers).get("content-type"), "application/json");
      assert.equal(new Headers(init.headers).has("authorization"), false);
      assert.deepEqual(JSON.parse(String(init.body)), { domain: "example.com" });
    });

    await t.test("real auth SDK retains 401/429/503 classification and a failed fresh check never authorizes a mutation", async () => {
      try {
        for (const status of [401, 429, 503]) {
          sessionFailureStatus = status;
          await assert.rejects(readAccountSession(), (error: Error & { status?: number }) => error.status === status && !error.message.includes("Unsafe provider diagnostic"));
          const writes = requests.filter(request => request.url.pathname.startsWith("/api/account/")).length;
          await assert.rejects(accountRequest("/api/account/saved-domains", { accountId: owner, method: "POST", body: { domain: "example.com" } }), { status });
          assert.equal(requests.filter(request => request.url.pathname.startsWith("/api/account/")).length, writes);
        }
      } finally { sessionFailureStatus = undefined; }
    });

    await t.test("changed account is rejected before the private endpoint is called", async () => {
      owner = "account-b";
      const count = requests.filter(request => request.url.pathname.startsWith("/api/account/")).length;
      await assert.rejects(accountRequest("/api/account/saved-domains", { accountId: "account-a" }), /account changed/);
      assert.equal(requests.filter(request => request.url.pathname.startsWith("/api/account/")).length, count);
      owner = "account-a";
    });

    await t.test("owner is snapshotted before the async session check", async () => {
      const options = { accountId: "account-a" };
      onSessionRead = () => { options.accountId = "account-b"; };
      await accountRequest("/api/account/saved-domains", options);
      onSessionRead = undefined;
      assert.equal(new Headers(requests.at(-1)!.init.headers).get("x-sajda-account"), "account-a");
    });

    await t.test("abort before or during a request prevents stale UI data", async () => {
      const cancelled = new AbortController();
      cancelled.abort();
      const count = requests.length;
      await assert.rejects(accountRequest("/api/account/saved-domains", { accountId: owner, signal: cancelled.signal }), { name: "AbortError" });
      assert.equal(requests.length, count);
      const stale = new AbortController();
      onAccountResponse = () => stale.abort();
      await assert.rejects(accountRequest("/api/account/saved-domains", { accountId: owner, signal: stale.signal }), { name: "AbortError" });
      onAccountResponse = undefined;
    });

    await t.test("external URLs and embedded credentials cannot receive account requests", async () => {
      const count = requests.length;
      for (const url of ["https://other.example/api/account/saved-domains", "https://user:pass@sajda.example.test/api/account/saved-domains", "/api/auth/sign-in/email"]) {
        await assert.rejects(accountRequest(url, { accountId: owner }), /Invalid account API path/);
      }
      assert.equal(requests.length, count);
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else delete (globalThis as { window?: unknown }).window;
    await vite.close();
  }
});
