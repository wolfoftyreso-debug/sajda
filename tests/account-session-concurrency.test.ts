import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createServer } from "vite";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

function sessionResponse(owner = "owner-a"): Response {
  return Response.json({
    user: { id: owner, email: `${owner}@example.test`, emailVerified: true, name: "Synthetic QA", createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z" },
    session: { id: "synthetic-session", userId: owner, createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z", expiresAt: new Date(Date.now() + 3_600_000).toISOString() },
  });
}

test("actual auth SDK coalesces only pending preflights without caching authorization or weakening response checks", async t => {
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalFetch = globalThis.fetch;
  const origin = "https://sajda.example.test";
  let reads = 0;
  let transports = 0;
  let reply: () => Promise<Response> = async () => sessionResponse();
  let privateReply: () => Promise<Response> = async () => Response.json({ items: [] });
  const vite = await createServer({ configFile: false, appType: "custom", server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] },
    define: { "import.meta.env.VITE_ACCOUNT_AUTH_ENABLED": '"true"', "import.meta.env.VITE_LOCAL_TEST_MODE": '"false"' },
  });
  try {
    Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { origin, hostname: "sajda.example.test" }, setTimeout, clearTimeout } });
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(String(input));
      assert.equal(url.origin, origin);
      assert.equal(init.credentials, "same-origin");
      assert.equal(new Headers(init.headers).has("authorization"), false);
      if (url.pathname === "/api/auth/get-session") {
        reads++;
        assert.equal(url.searchParams.get("disableCookieCache"), "true");
        assert.equal(init.cache, "no-store");
        return reply();
      }
      assert.equal(url.pathname, "/api/account/saved-domains");
      transports++;
      return privateReply();
    };
    const { accountRequest, readAccountSession, invalidateAccountSessionReads } = await vite.ssrLoadModule("/src/integrations/neon/auth.ts");
    const reset = () => { invalidateAccountSessionReads(); reads = 0; transports = 0; reply = async () => sessionResponse(); privateReply = async () => Response.json({ items: [] }); };
    const pendingReply = () => {
      const started = deferred<void>();
      const result = deferred<Response>();
      reply = () => { started.resolve(); return result.promise; };
      return { ...result, started: started.promise };
    };

    await t.test("five concurrent preflights use one uncached session read; completed results are discarded", async () => {
      reset(); const gate = pendingReply();
      const requests = Array.from({ length: 5 }, () => accountRequest("/api/account/saved-domains", { accountId: "owner-a" }));
      await gate.started; assert.equal(reads, 1); assert.equal(transports, 0);
      gate.resolve(sessionResponse()); await Promise.all(requests);
      assert.equal(transports, 5);
      reply = async () => sessionResponse();
      await accountRequest("/api/account/saved-domains", { accountId: "owner-a" });
      assert.equal(reads, 2, "no settled result serves the next authorization check");
    });

    await t.test("post-response and explicit fresh checks never join an older preflight", async () => {
      reset(); const old = pendingReply();
      const before = readAccountSession({ coalesce: true }); await old.started;
      reply = async () => sessionResponse("owner-b");
      const after = await readAccountSession();
      assert.equal(after.user.id, "owner-b"); assert.equal(reads, 2);
      old.resolve(sessionResponse("owner-a")); assert.equal((await before).user.id, "owner-a");
      await Promise.all([readAccountSession(), readAccountSession()]); assert.equal(reads, 4);
    });

    await t.test("shared callers receive separate session snapshots", async () => {
      reset(); const gate = pendingReply();
      const first = readAccountSession({ coalesce: true }); const second = readAccountSession({ coalesce: true });
      await gate.started; gate.resolve(sessionResponse());
      const [a, b] = await Promise.all([first, second]);
      assert.notEqual(a, b); assert.notEqual(a.user, b.user);
      a.user.id = "caller-edit"; assert.equal(b.user.id, "owner-a");
    });

    await t.test("429 and 503 failures reject all shared callers, authorize no request, and leave the next read fresh", async () => {
      for (const status of [429, 503]) {
        reset(); const gate = pendingReply();
        const writes = Array.from({ length: 3 }, () => accountRequest("/api/account/saved-domains", { accountId: "owner-a", method: "POST", body: { domain: "example.com" } }));
        const settled = Promise.allSettled(writes);
        await gate.started; gate.resolve(Response.json({ code: "SESSION_CHECK_FAILED", message: "PRIVATE_PROVIDER_DIAGNOSTIC" }, { status }));
        for (const result of await settled) {
          assert.equal(result.status, "rejected");
          if (result.status === "rejected") { assert.equal(result.reason.status, status); assert.doesNotMatch(result.reason.message, /PRIVATE_PROVIDER/u); }
        }
        assert.equal(reads, 1); assert.equal(transports, 0);
        reply = async () => sessionResponse();
        await accountRequest("/api/account/saved-domains", { accountId: "owner-a" }); assert.equal(reads, 2); assert.equal(transports, 1);
      }
    });

    await t.test("cancelling one consumer does not abort another consumer's shared preflight", async () => {
      reset(); const gate = pendingReply(); const cancelled = new AbortController();
      const first = accountRequest("/api/account/saved-domains", { accountId: "owner-a", signal: cancelled.signal });
      const aborted = assert.rejects(first, { name: "AbortError" });
      const second = accountRequest("/api/account/saved-domains", { accountId: "owner-a" });
      await gate.started; cancelled.abort(); gate.resolve(sessionResponse());
      await Promise.all([aborted, second]); assert.equal(reads, 1); assert.equal(transports, 1);
    });

    await t.test("an identity fence rejects a late preflight and a late fresh read before any private request", async () => {
      for (const coalesce of [true, false]) {
        reset(); const old = pendingReply();
        const stale = coalesce ? accountRequest("/api/account/saved-domains", { accountId: "owner-a" }) : readAccountSession();
        const rejected = assert.rejects(stale, { code: "account_changed", status: 409 });
        await old.started; invalidateAccountSessionReads();
        reply = async () => sessionResponse("owner-b");
        assert.equal((await readAccountSession({ coalesce: true })).user.id, "owner-b");
        old.resolve(sessionResponse("owner-a")); await rejected; assert.equal(transports, 0);
        assert.equal((await readAccountSession()).user.id, "owner-b"); assert.equal(reads, 3);
      }
    });

    await t.test("a late old-generation failure cannot clear the new generation's pending read", async () => {
      reset(); const old = pendingReply(); const stale = readAccountSession({ coalesce: true });
      const rejected = assert.rejects(stale, { code: "account_changed", status: 409 });
      await old.started; invalidateAccountSessionReads();
      const current = pendingReply(); const first = readAccountSession({ coalesce: true }); await current.started;
      old.resolve(Response.json({ message: "private failure" }, { status: 503 })); await rejected;
      const second = readAccountSession({ coalesce: true }); assert.equal(reads, 2);
      current.resolve(sessionResponse("owner-b"));
      assert.equal((await first).user.id, "owner-b"); assert.equal((await second).user.id, "owner-b"); assert.equal(reads, 2);
    });

    await t.test("logout or owner replacement during private transport rejects late payloads and errors without asserting that a write failed", async () => {
      for (const response of [Response.json({ items: [{ domain: "old-private.example" }] }), Response.json({ error: "unavailable" }, { status: 503 })]) {
        reset(); const started = deferred<void>(); const gate = deferred<Response>();
        privateReply = () => { started.resolve(); return gate.promise; };
        const pending = accountRequest("/api/account/saved-domains", { accountId: "owner-a", method: "POST", body: { domain: "example.com" } });
        const rejected = assert.rejects(pending, (error: Error & { code?: string; status?: number }) => {
          assert.equal(error.code, "account_changed"); assert.equal(error.status, 409); assert.doesNotMatch(error.message, /old-private|write failed|unavailable/u); return true;
        });
        await started.promise; invalidateAccountSessionReads(); gate.resolve(response); await rejected;
        assert.equal(reads, 1); assert.equal(transports, 1, "an already sent mutation may have completed and is not silently retried");
        reply = async () => sessionResponse("owner-b"); privateReply = async () => Response.json({ items: [] });
        await accountRequest("/api/account/saved-domains", { accountId: "owner-b" }); assert.equal(reads, 2); assert.equal(transports, 2);
      }
    });

    await t.test("an explicit caller cancellation remains an abort even if its owner also changed", async () => {
      reset(); const controller = new AbortController(); const started = deferred<void>(); const gate = deferred<Response>();
      privateReply = () => { started.resolve(); return gate.promise; };
      const pending = accountRequest("/api/account/saved-domains", { accountId: "owner-a", signal: controller.signal });
      const aborted = assert.rejects(pending, { name: "AbortError" });
      await started.promise; invalidateAccountSessionReads(); controller.abort(); gate.resolve(Response.json({ items: [] })); await aborted;
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (windowDescriptor) Object.defineProperty(globalThis, "window", windowDescriptor); else Reflect.deleteProperty(globalThis, "window");
    await vite.close();
  }
});
