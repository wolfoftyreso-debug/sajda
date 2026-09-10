import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createServer } from "vite";

interface RequestOptions { path: string; method: string; body?: string; id: string }
interface Transport {
  nativeAvailable: boolean;
  sanitizeNativeSession(value: unknown, now?: number): unknown;
  readNativeSession(): Promise<unknown>;
  nativeSignIn(): Promise<unknown>;
  nativeSignOut(): Promise<unknown>;
  nativeRequest(path: string, method: string, body?: unknown, signal?: AbortSignal): Promise<Response>;
}

function deferred<T = unknown>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const response = (overrides: Record<string, unknown> = {}) => ({
  status: 200, body: '{"ok":true}', headers: { "content-type": "application/json" }, ...overrides,
});
const session = (now = Date.now()) => ({
  user: {
    id: "account-native-123", email: "person@example.test", email_verified: true,
    created_at: "2026-01-02T03:04:05.000Z", last_sign_in_at: "2026-09-01T12:00:00.000Z",
  },
  expires_at: Math.floor(now / 1000) + 3_600,
});

test("native transport validates the bridge boundary and fences authentication changes", async t => {
  const key = "__SAJDA_NATIVE_TRANSPORT_TEST__";
  const original = Object.getOwnPropertyDescriptor(globalThis, key);
  const originalFetch = globalThis.fetch;
  const requests: RequestOptions[] = [];
  const cancellations: string[] = [];
  const fixture = {
    onSession: async (): Promise<unknown> => ({ session: session() }),
    onSignIn: async (): Promise<unknown> => ({ ok: true }),
    onSignOut: async (): Promise<unknown> => ({ ok: true }),
    onRequest: async (_options: RequestOptions): Promise<unknown> => response(),
    onCancel: async (_id: string): Promise<void> => {},
    async session() { return fixture.onSession(); },
    async signIn() { return fixture.onSignIn(); },
    async signOut() { return fixture.onSignOut(); },
    async request(options: RequestOptions) { requests.push(options); return fixture.onRequest(options); },
    async cancel({ id }: { id: string }) { cancellations.push(id); return fixture.onCancel(id); },
  };
  Object.defineProperty(globalThis, key, { configurable: true, value: fixture });
  globalThis.fetch = async () => { throw new Error("Native transport tests must not call live services"); };
  const vite = await createServer({
    configFile: false, appType: "custom",
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    resolve: { alias: { "@": path.resolve("src") } },
    optimizeDeps: { noDiscovery: true, include: [] },
    ssr: { noExternal: ["@capacitor/core"] },
    plugins: [{
      name: "native-transport-test-bridge", enforce: "pre",
      resolveId(source) { if (source === "@capacitor/core") return "\0native-transport-test-capacitor"; },
      load(id) {
        if (id === "\0native-transport-test-capacitor") {
          return `export const Capacitor={isNativePlatform:()=>true};export const registerPlugin=()=>globalThis.${key};`;
        }
      },
    }],
  });
  try {
    const transport = await vite.ssrLoadModule("/src/lib/nativeTransport.ts") as Transport;
    assert.equal(transport.nativeAvailable, true);

    await t.test("sanitizer keeps only verified, unexpired account fields", () => {
      const now = Date.parse("2026-09-10T10:00:00.000Z");
      const valid = session(now);
      const dirty = {
        ...valid, token: "must-not-cross-the-bridge", access_token: "also-secret", refresh_token: "also-secret",
        user: { ...valid.user, token: "nested-secret", role: "admin", metadata: { secret: "nested" } },
      };
      const sanitized = transport.sanitizeNativeSession(dirty, now);
      assert.deepEqual(sanitized, valid);
      assert.notEqual(sanitized, dirty);
      assert.equal(JSON.stringify(sanitized).includes("secret"), false);
      assert.equal(transport.sanitizeNativeSession(null, now), null);
      const withoutLastSignIn = { ...valid, user: { ...valid.user } };
      Reflect.deleteProperty(withoutLastSignIn.user, "last_sign_in_at");
      assert.deepEqual(transport.sanitizeNativeSession(withoutLastSignIn, now), withoutLastSignIn);
    });

    await t.test("sanitizer rejects expired or malformed sessions instead of signing them in", () => {
      const now = Date.parse("2026-09-10T10:00:00.000Z");
      const valid = session(now);
      for (const malformed of [
        undefined, false, [], "session", {}, { user: null, expires_at: valid.expires_at },
        { ...valid, expires_at: 0 }, { ...valid, expires_at: now / 1000 },
        { ...valid, expires_at: now / 1000 - 1 }, { ...valid, expires_at: null },
        { ...valid, expires_at: String(valid.expires_at) }, { ...valid, expires_at: Number.POSITIVE_INFINITY },
        { ...valid, expires_at: Number.MAX_SAFE_INTEGER + 1 }, { ...valid, expires_at: valid.expires_at + 0.1 },
        { user: valid.user },
        ...[
          { id: "" }, { id: " " }, { id: "x".repeat(201) }, { id: 123 },
          { email: "" }, { email: "x".repeat(321) }, { email: null },
          { email_verified: false }, { email_verified: "true" }, { email_verified: undefined },
          { created_at: "not-a-date" }, { created_at: null }, { last_sign_in_at: "not-a-date" },
        ].map(user => ({ ...valid, user: { ...valid.user, ...user } })),
      ]) assert.throws(() => transport.sanitizeNativeSession(malformed, now), Error);
    });

    await t.test("session reader validates its envelope and strips credentials", async () => {
      const valid = session();
      fixture.onSession = async () => ({ session: { ...valid, token: "secret" }, requestId: "request-1" });
      assert.deepEqual(await transport.readNativeSession(), valid);
      fixture.onSession = async () => ({ session: null });
      assert.equal(await transport.readNativeSession(), null);
      for (const malformed of [null, undefined, {}, [], { session: { ...valid, expires_at: 0 } }]) {
        fixture.onSession = async () => malformed;
        await assert.rejects(transport.readNativeSession(), Error);
      }
    });

    await t.test("in-flight session reads cannot restore an account after sign-out or sign-in", async () => {
      for (const transition of [() => transport.nativeSignOut(), () => transport.nativeSignIn()]) {
        const pending = deferred();
        fixture.onSession = () => pending.promise;
        const read = transport.readNativeSession();
        const rejected = assert.rejects(read, Error);
        await transition();
        pending.resolve({ session: session() });
        await rejected;
      }
    });

    await t.test("a failed auth transition still invalidates a previously started session read", async () => {
      const pending = deferred();
      fixture.onSession = () => pending.promise;
      fixture.onSignOut = async () => { throw new Error("Logout request failed"); };
      const read = transport.readNativeSession();
      const rejected = assert.rejects(read, Error);
      await assert.rejects(transport.nativeSignOut(), /Logout request failed/u);
      pending.resolve({ session: session() });
      await rejected;
      fixture.onSignOut = async () => ({ ok: true });
    });

    await t.test("authentication requires an explicit successful bridge response", async () => {
      for (const malformed of [null, undefined, {}, { ok: false }, { ok: "true" }]) {
        fixture.onSignIn = async () => malformed;
        fixture.onSignOut = async () => malformed;
        await assert.rejects(transport.nativeSignIn(), Error);
        await assert.rejects(transport.nativeSignOut(), Error);
      }
      fixture.onSignIn = async () => ({ ok: true });
      fixture.onSignOut = async () => ({ ok: true });
    });

    await t.test("a late sign-in result cannot claim success after a subsequent sign-out", async () => {
      const pending = deferred();
      fixture.onSignIn = () => pending.promise;
      const signIn = transport.nativeSignIn();
      const rejected = assert.rejects(signIn, Error);
      await transport.nativeSignOut();
      pending.resolve({ ok: true });
      await rejected;
      fixture.onSignIn = async () => ({ ok: true });
    });

    await t.test("duplicate sign-in is rejected without invalidating the pending legitimate sign-in", async () => {
      const pending = deferred();
      let calls = 0;
      fixture.onSignIn = () => { calls++; return pending.promise; };
      const first = transport.nativeSignIn();
      await assert.rejects(transport.nativeSignIn(), Error);
      assert.equal(calls, 1);
      pending.resolve({ ok: true });
      assert.deepEqual(await first, { ok: true });
      fixture.onSignIn = async () => ({ ok: true });
    });

    await t.test("duplicate logout and sign-in during logout cannot invalidate the pending logout", async () => {
      const pending = deferred();
      let signOutCalls = 0;
      let signInCalls = 0;
      fixture.onSignOut = () => { signOutCalls++; return pending.promise; };
      fixture.onSignIn = async () => { signInCalls++; return { ok: true }; };
      const first = transport.nativeSignOut();
      await assert.rejects(transport.nativeSignOut(), Error);
      await assert.rejects(transport.nativeSignIn(), Error);
      assert.equal(signOutCalls, 1);
      assert.equal(signInCalls, 0);
      pending.resolve({ ok: true });
      assert.deepEqual(await first, { ok: true });
      fixture.onSignIn = async () => ({ ok: true });
      fixture.onSignOut = async () => ({ ok: true });
    });

    await t.test("late private account responses are discarded across authentication changes", async () => {
      for (const transition of [() => transport.nativeSignOut(), () => transport.nativeSignIn()]) {
        const pending = deferred();
        fixture.onRequest = () => pending.promise;
        const request = transport.nativeRequest("/api/native/account", "POST", { path: "/api/account/watchlist" });
        const rejected = assert.rejects(request, Error);
        await transition();
        pending.resolve(response({ body: '{"private":"old-account"}' }));
        await rejected;
      }
    });

    await t.test("public requests remain valid across a sign-out", async () => {
      const pending = deferred();
      fixture.onRequest = () => pending.promise;
      const request = transport.nativeRequest("/api/domain-search", "POST", { query: "sajda.test" });
      await transport.nativeSignOut();
      pending.resolve(response({ body: '{"public":true}' }));
      assert.deepEqual(await (await request).json(), { public: true });
    });

    await t.test("already-aborted signals never start a bridge request", async () => {
      fixture.onRequest = async () => response();
      const controller = new AbortController();
      controller.abort();
      // The minimum supported iOS runtime need not implement throwIfAborted.
      Object.defineProperty(controller.signal, "throwIfAborted", { value: undefined });
      const start = requests.length;
      await assert.rejects(transport.nativeRequest("/api/health", "GET", undefined, controller.signal), { name: "AbortError" });
      assert.equal(requests.length, start);
    });

    await t.test("abort during body serialization cannot start an orphaned native request", async () => {
      const controller = new AbortController();
      const start = requests.length;
      const body = { toJSON() { controller.abort(); return { query: "aborted" }; } };
      await assert.rejects(transport.nativeRequest("/api/domain-search", "POST", body, controller.signal), { name: "AbortError" });
      assert.equal(requests.length, start);
    });

    await t.test("abort cancels the matching native request and ignores its late result", async () => {
      const pending = deferred();
      fixture.onRequest = () => pending.promise;
      fixture.onCancel = async () => { throw new Error("Cancellation acknowledgement unavailable"); };
      const controller = new AbortController();
      Object.defineProperty(controller.signal, "throwIfAborted", { value: undefined });
      const request = transport.nativeRequest("/api/health", "GET", undefined, controller.signal);
      const rejected = assert.rejects(request, { name: "AbortError" });
      const active = requests.at(-1)!;
      controller.abort();
      await rejected;
      assert.equal(cancellations.at(-1), active.id);
      pending.resolve(response());
      await Promise.resolve();
      fixture.onCancel = async () => {};
    });

    await t.test("successful requests serialize bodies and remove their abort listener", async () => {
      fixture.onRequest = async () => response();
      const controller = new AbortController();
      const cancelCount = cancellations.length;
      const result = await transport.nativeRequest("/api/domain-search", "POST", { query: "sajda.test" }, controller.signal);
      assert.equal(result.status, 200);
      assert.deepEqual(await result.json(), { ok: true });
      assert.equal(requests.at(-1)!.body, '{"query":"sajda.test"}');
      assert.match(requests.at(-1)!.id, /^[a-zA-Z0-9_-]{1,64}$/u);
      controller.abort();
      assert.equal(cancellations.length, cancelCount);
    });

    await t.test("request IDs remain available when the runtime has no randomUUID", async () => {
      const originalRandomUUID = Object.getOwnPropertyDescriptor(globalThis.crypto, "randomUUID");
      Object.defineProperty(globalThis.crypto, "randomUUID", { configurable: true, value: undefined });
      try {
        fixture.onRequest = async () => response();
        await transport.nativeRequest("/api/health", "GET");
        const firstId = requests.at(-1)!.id;
        await transport.nativeRequest("/api/health", "GET");
        const secondId = requests.at(-1)!.id;
        assert.match(firstId, /^[a-zA-Z0-9_-]{1,64}$/u);
        assert.match(secondId, /^[a-zA-Z0-9_-]{1,64}$/u);
        assert.notEqual(firstId, secondId);
      } finally {
        if (originalRandomUUID) Object.defineProperty(globalThis.crypto, "randomUUID", originalRandomUUID);
        else Reflect.deleteProperty(globalThis.crypto, "randomUUID");
      }
    });

    await t.test("response validation prevents malformed status, bodies, or headers crossing the bridge", async () => {
      for (const malformed of [
        null, undefined, {}, response({ status: 199 }), response({ status: 600 }),
        response({ status: 200.5 }), response({ status: "200" }), response({ body: {} }),
        response({ body: "a".repeat(4_000_001) }), response({ body: "å".repeat(2_000_001) }),
        response({ headers: null }), response({ headers: [] }),
        response({ headers: { "content-type": 123 } }), response({ headers: { "x-request-id": "a\r\nb" } }),
        response({ headers: { "x-request-id": "a".repeat(4_097) } }),
      ]) {
        fixture.onRequest = async () => malformed;
        await assert.rejects(transport.nativeRequest("/api/health", "GET"), Error);
      }
      fixture.onRequest = async () => response({ headers: {
        "content-type": "application/json", "retry-after": "30", "x-request-id": "safe-request-id",
        authorization: "Bearer must-not-cross", "set-cookie": "secret=value", "x-internal-secret": "secret",
      } });
      const result = await transport.nativeRequest("/api/health", "GET");
      assert.equal(result.headers.get("retry-after"), "30");
      assert.equal(result.headers.get("x-request-id"), "safe-request-id");
      for (const name of ["authorization", "set-cookie", "x-internal-secret"]) assert.equal(result.headers.has(name), false);
    });

    await t.test("null-body HTTP statuses produce usable Response objects", async () => {
      for (const status of [204, 205, 304]) {
        fixture.onRequest = async () => response({ status, body: "" });
        const result = await transport.nativeRequest("/api/health", "GET");
        assert.equal(result.status, status);
        assert.equal(await result.text(), "");
      }
    });
  } finally {
    await vite.close();
    globalThis.fetch = originalFetch;
    if (original) Object.defineProperty(globalThis, key, original);
    else Reflect.deleteProperty(globalThis, key);
  }
});
