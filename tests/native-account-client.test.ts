import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createServer } from "vite";

interface BridgeRequest { path: string; method: string; body?: string; id: string }

test("native account client accepts the Capacitor origin and preserves private request boundaries", async t => {
  const key = "__SAJDA_NATIVE_ACCOUNT_CLIENT_TEST__";
  const originals = new Map([key, "window"].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const originalFetch = globalThis.fetch;
  const requests: BridgeRequest[] = [];
  let owner = "account-a";
  let sessionReads = 0;
  let onSessionRead: (() => void) | undefined;
  let onAccountResponse: (() => void) | undefined;
  const fixture = {
    async session() {
      sessionReads++;
      const id = owner;
      onSessionRead?.();
      return { session: { user: { id, email: "qa@example.test", email_verified: true, created_at: "2026-01-02T03:04:05Z" },
        expires_at: Math.floor(Date.now() / 1000) + 3600 } };
    },
    async request(options: BridgeRequest) {
      requests.push(options);
      onAccountResponse?.();
      return { status: 200, body: '{"items":[],"nextCursor":null}' };
    },
    async cancel() {},
  };
  Object.defineProperty(globalThis, key, { configurable: true, value: fixture });
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    location: new URL("capacitor://localhost/"), setTimeout, clearTimeout,
  } });
  globalThis.fetch = async () => { throw new Error("Native account tests must not make browser or live requests"); };
  const vite = await createServer({
    configFile: false, appType: "custom",
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    resolve: { alias: { "@": path.resolve("src") } },
    optimizeDeps: { noDiscovery: true, include: [] },
    define: {
      "import.meta.env.VITE_ACCOUNT_AUTH_ENABLED": '"true"',
      "import.meta.env.VITE_LOCAL_TEST_MODE": '"false"',
      "import.meta.env.VITE_SAJDA_SURFACE": '"native"',
    },
    ssr: { noExternal: ["@capacitor/core"] },
    plugins: [{
      name: "native-account-client-test-bridge", enforce: "pre",
      resolveId(source) { if (source === "@capacitor/core") return "\0native-account-client-test-capacitor"; },
      load(id) {
        if (id === "\0native-account-client-test-capacitor") {
          return `export const Capacitor={isNativePlatform:()=>true};export const registerPlugin=()=>globalThis.${key};`;
        }
      },
    }],
  });
  try {
    const { accountRequest } = await vite.ssrLoadModule("/src/integrations/neon/auth.ts");

    await t.test("null-origin requests retain their path, encoded cursor, method, body and initiating owner", async () => {
      assert.equal(window.location.origin, "null");
      const route = "/api/account/saved-domains?cursor=a%2Fb%2B%3D";
      const result = await accountRequest(route, { accountId: owner });
      assert.deepEqual(result, { items: [], nextCursor: null });
      assert.equal(requests.at(-1)?.path, "/api/native/account");
      assert.equal(requests.at(-1)?.method, "POST");
      assert.deepEqual(JSON.parse(requests.at(-1)!.body!), { path: route, method: "GET", accountId: owner });
      const body = { domain: "example.com" };
      await accountRequest("/api/account/saved-domains", { accountId: owner, method: "POST", body });
      assert.deepEqual(JSON.parse(requests.at(-1)!.body!), { path: "/api/account/saved-domains", method: "POST", body, accountId: owner });
    });

    await t.test("noncanonical native targets are rejected before session or bridge work", async () => {
      const count = requests.length, reads = sessionReads;
      for (const route of [
        "https://sajda.invalid/api/account/membership", "https://user:pass@sajda.invalid/api/account/membership",
        "capacitor://localhost/api/account/membership", "//sajda.invalid/api/account/membership",
        "api/account/membership", "/api/auth/get-session", "/api/developer/api-keys",
        "/api/account/../account/membership", "/api/account/./membership", "/api/account/%2e%2e/account/membership",
        "/api/account/%6dembership", "/api/account/membership/", "/api/account//membership",
        "/api/account/..\\account/membership", "/api/account/membership?cursor=a\\b",
        "/api/account/membership#secret", "/api/account/membership?cursor=a#secret",
        "/api/account/membership\n", "/api/account/mem\tbership", "/api/account/membership?cursor=a\rb",
        "/api/account/membership?cursor=a\u0000b", "/api/account/membership?cursor=a\u007fb",
        "/api/account/membership?cursor=a b", "/api/account/membership?cursor=" + "a".repeat(1000),
      ]) await assert.rejects(accountRequest(route, { accountId: owner }), /Invalid account API path/, route);
      assert.equal(requests.length, count);
      assert.equal(sessionReads, reads);
    });

    await t.test("changed accounts cannot send private requests and owner scope is snapshotted", async () => {
      const count = requests.length;
      owner = "account-b";
      await assert.rejects(accountRequest("/api/account/membership", { accountId: "account-a" }), { code: "account_changed" });
      assert.equal(requests.length, count);
      owner = "account-a";
      const scope = { accountId: owner };
      onSessionRead = () => { scope.accountId = "account-b"; };
      try { await accountRequest("/api/account/membership", scope); }
      finally { onSessionRead = undefined; }
      assert.equal(JSON.parse(requests.at(-1)!.body!).accountId, "account-a");
    });

    await t.test("cancellation before the session, during its check and after the bridge response remains enforced", async () => {
      const before = new AbortController(); before.abort();
      const count = requests.length, reads = sessionReads;
      await assert.rejects(accountRequest("/api/account/membership", { accountId: owner, signal: before.signal }), { name: "AbortError" });
      assert.equal(sessionReads, reads);
      assert.equal(requests.length, count);
      const during = new AbortController();
      onSessionRead = () => during.abort();
      try { await assert.rejects(accountRequest("/api/account/membership", { accountId: owner, signal: during.signal }), { name: "AbortError" }); }
      finally { onSessionRead = undefined; }
      assert.equal(requests.length, count);
      const after = new AbortController();
      onAccountResponse = () => after.abort();
      try { await assert.rejects(accountRequest("/api/account/membership", { accountId: owner, signal: after.signal }), { name: "AbortError" }); }
      finally { onAccountResponse = undefined; }
    });
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
    await vite.close();
  }
});
