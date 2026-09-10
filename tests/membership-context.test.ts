import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createElement as h } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { createServer } from "vite";
import type { AccountMembership } from "../shared/account-membership";

const origin = "https://sajda.example.test", requestId = "req_0123456789abcdef";
const pause = () => new Promise(resolve => setTimeout(resolve, 5));
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
function membership(plan: AccountMembership["plan"] = "premium", expiresAt = new Date(Date.now() + 3_600_000).toISOString()): AccountMembership {
  return { plan, accessSource: plan === "free" ? "free" : "subscription", expiresAt: plan === "free" ? null : expiresAt,
    capabilities: { save_domains: true, swipe_undo: plan === "premium" || plan === "trading", trading: plan === "trading" } };
}
interface Value { membership: AccountMembership | null; loading: boolean; error: { code: string } | null; refresh(): Promise<void> }

// Real React provider and membership/session client; only auth context, browser
// events/clocks and HTTP are fixtures. No application test bypass is introduced.
test("one mounted membership provider follows account ownership, refresh and expiry without false Free states", async t => {
  const originals = new Map(["window", "document", "__MEMBERSHIP_CONTEXT_TEST__", "IS_REACT_ACT_ENVIRONMENT"]
    .map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const originalFetch = globalThis.fetch;
  const fixture = { owner: "account-a" as string | null, verified: true, authLoading: false, visible: "visible" };
  const setGlobal = (key: string, value: unknown) => Object.defineProperty(globalThis, key, { configurable: true, value });
  setGlobal("__MEMBERSHIP_CONTEXT_TEST__", fixture); setGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const windowListeners = new Map<string, Set<() => void>>(), documentListeners = new Map<string, Set<() => void>>();
  const timers = new Map<number, { callback: () => void; delay: number; interval: boolean }>();
  let timerId = 1;
  const add = (map: Map<string, Set<() => void>>) => (event: string, callback: () => void) => {
    const callbacks = map.get(event) ?? new Set(); callbacks.add(callback); map.set(event, callbacks);
  };
  const remove = (map: Map<string, Set<() => void>>) => (event: string, callback: () => void) => { map.get(event)?.delete(callback); };
  const schedule = (interval: boolean) => (callback: () => void, delay: number) => { const id = timerId++; timers.set(id, { callback, delay, interval }); return id; };
  setGlobal("window", { location: { origin, hostname: "sajda.example.test" },
    addEventListener: add(windowListeners), removeEventListener: remove(windowListeners),
    setTimeout: schedule(false), clearTimeout: (id: number) => timers.delete(id),
    setInterval: schedule(true), clearInterval: (id: number) => timers.delete(id),
  });
  setGlobal("document", { get visibilityState() { return fixture.visible; },
    addEventListener: add(documentListeners), removeEventListener: remove(documentListeners),
  });
  let now = Date.now(); t.mock.method(Date, "now", () => now);
  const vite = await createServer({ configFile: false, appType: "custom",
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" },
    define: { "import.meta.env.VITE_ACCOUNT_AUTH_ENABLED": '"true"', "import.meta.env.VITE_LOCAL_TEST_MODE": '"false"' },
    plugins: [{ name: "membership-test-auth-boundary", enforce: "pre", load(id) {
      if (id.replaceAll("\\", "/").endsWith("/src/contexts/AuthContext.tsx")) return "export const useAuth=()=>{const f=globalThis.__MEMBERSHIP_CONTEXT_TEST__;return {loading:f.authLoading,user:f.owner?{id:f.owner,email_verified:f.verified}:null};};";
    } }],
  });
  const requests: { owner: string | null; signal?: AbortSignal | null }[] = [];
  const frames: { owner: string | null; plan: string | null; loading: boolean; error: string | null }[] = [];
  const payload = (plan: AccountMembership["plan"] = "premium", owner = fixture.owner, expiresAt?: string) => ({ accountId: owner, requestId, membership: membership(plan, expiresAt) });
  let reply: (request: typeof requests[number]) => Response | Promise<Response> = () => Response.json(payload());
  let renderer: ReactTestRenderer | undefined, latest: Value | undefined;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input)); assert.equal(url.origin, origin); assert.equal(init.credentials, "same-origin");
    assert.equal(new Headers(init.headers).has("authorization"), false);
    if (url.pathname === "/api/auth/get-session") return Response.json(fixture.owner ? {
      user: { id: fixture.owner, email: "qa@example.test", emailVerified: fixture.verified, name: "QA", createdAt: "2026-09-01T10:00:00Z", updatedAt: "2026-09-01T10:00:00Z" },
      session: { id: "fixture-session", userId: fixture.owner, createdAt: "2026-09-01T10:00:00Z", updatedAt: "2026-09-01T10:00:00Z", expiresAt: new Date(now + 60_000).toISOString() },
    } : null);
    assert.equal(url.pathname, "/api/account/membership"); assert.equal(init.method, "GET");
    assert.equal(init.cache, "no-store"); assert.equal(init.redirect, "error"); assert.equal(init.body, undefined);
    const request = { owner: new Headers(init.headers).get("x-sajda-account"), signal: init.signal };
    requests.push(request); return reply(request);
  };
  try {
    const { MembershipProvider, useMembership } = await vite.ssrLoadModule("/src/contexts/MembershipContext.tsx");
    function Probe() {
      latest = useMembership();
      frames.push({ owner: fixture.owner, plan: latest!.membership?.plan ?? null, loading: latest!.loading, error: latest!.error?.code ?? null });
      return h("output", null, latest!.membership?.plan ?? (latest!.loading ? "checking" : latest!.error ? "unconfirmed" : "signed-out"));
    }
    const tree = () => h(MembershipProvider, null, h(Probe), h(Probe));
    const until = async (predicate: () => boolean) => { for (let i = 0; i < 100 && !predicate(); i++) await act(pause); assert.ok(predicate(), "Membership fixture settles"); };
    const render = async () => { await act(async () => { renderer!.update(tree()); await pause(); }); };
    const mount = async (options: { owner?: string | null; verified?: boolean; authLoading?: boolean; plan?: AccountMembership["plan"]; response?: () => Response | Promise<Response>; settle?: boolean } = {}) => {
      if (renderer) await act(async () => { renderer!.unmount(); });
      renderer = undefined; latest = undefined; requests.length = 0; frames.length = 0;
      fixture.owner = options.owner === undefined ? "account-a" : options.owner;
      fixture.verified = options.verified ?? true; fixture.authLoading = options.authLoading ?? false; fixture.visible = "visible";
      reply = options.response ?? (() => Response.json(payload(options.plan)));
      await act(async () => { renderer = create(tree(), { unstable_isConcurrent: true }); await pause(); });
      if (options.settle !== false && !fixture.authLoading) await until(() => Boolean(latest && !latest.loading));
    };

    await t.test("guest, unresolved auth and unverified users never fetch or invent a plan", async () => {
      await mount({ owner: null }); assert.equal(requests.length, 0); assert.equal(latest!.membership, null); assert.equal(latest!.loading, false);
      await mount({ authLoading: true }); assert.equal(requests.length, 0); assert.equal(latest!.membership, null); assert.equal(latest!.loading, true);
      await mount({ verified: false }); assert.equal(requests.length, 0); assert.equal(latest!.membership, null);
      assert.equal(latest!.error?.code, "email_verification_required");
    });

    await t.test("two consumers share one server read and Free appears only after a valid response", async () => {
      const pending = deferred<Response>(); await mount({ response: () => pending.promise, settle: false });
      await until(() => requests.length === 1); assert.equal(latest!.membership, null); assert.equal(latest!.loading, true);
      assert.ok(frames.every(frame => frame.plan === null));
      await act(async () => { pending.resolve(Response.json(payload("free"))); await pause(); });
      await until(() => latest!.membership?.plan === "free"); assert.equal(requests.length, 1);
    });

    await t.test("initial failure and failed refresh remain unconfirmed rather than Free or cached Premium", async () => {
      const failure = () => Response.json({ error: "private-upstream-data", code: "membership_unavailable", requestId }, { status: 503 });
      await mount({ response: failure }); assert.equal(latest!.membership, null); assert.equal(latest!.error?.code, "unavailable");
      await mount(); assert.equal(latest!.membership?.plan, "premium"); reply = failure;
      await act(async () => { await latest!.refresh(); });
      assert.equal(latest!.membership, null); assert.equal(latest!.error?.code, "unavailable");
      assert.equal(latest!.loading, false);
    });

    await t.test("explicit refresh follows upgrade and downgrade without locally promoting access", async () => {
      await mount({ plan: "free" });
      for (const plan of ["basic", "premium", "trading", "premium", "basic", "free"] as const) {
        reply = () => Response.json(payload(plan)); await act(async () => { await latest!.refresh(); });
        assert.deepEqual(latest!.membership, membership(plan)); assert.equal(latest!.error, null);
      }
      assert.equal(requests.length, 7);
    });

    await t.test("switching accounts aborts old work and hides it before the new account resolves", async () => {
      await mount(); const previous = deferred<Response>(), next = deferred<Response>();
      reply = request => request.owner === "account-a" ? previous.promise : next.promise;
      await act(async () => { void latest!.refresh(); await pause(); });
      await until(() => requests.length === 2); const oldRequest = requests.at(-1)!;
      frames.length = 0; fixture.owner = "account-b"; await render(); await until(() => requests.length === 3);
      assert.equal(oldRequest.signal?.aborted, true); assert.equal(latest!.membership, null); assert.equal(latest!.loading, true);
      await act(async () => { previous.resolve(Response.json(payload("trading", "account-a"))); await pause(); });
      assert.equal(latest!.membership, null);
      assert.ok(frames.every(frame => frame.owner !== "account-b" || frame.plan === null));
      await act(async () => { next.resolve(Response.json(payload("basic", "account-b"))); await pause(); });
      await until(() => latest!.membership?.plan === "basic");
    });

    await t.test("logout clears paid state and ignores delayed responses", async () => {
      await mount({ plan: "trading" }); const delayed = deferred<Response>(); reply = () => delayed.promise;
      await act(async () => { void latest!.refresh(); await pause(); }); await until(() => requests.length === 2);
      const oldRequest = requests.at(-1)!; fixture.owner = null; await render();
      assert.equal(oldRequest.signal?.aborted, true); assert.equal(latest!.membership, null); assert.equal(latest!.loading, false);
      await act(async () => { delayed.resolve(Response.json(payload("trading", "account-a"))); await pause(); });
      assert.equal(latest!.membership, null); assert.equal(latest!.error, null); assert.equal(requests.length, 2);
    });

    await t.test("overlapping refreshes for one account cannot restore an older higher tier", async () => {
      await mount(); const older = deferred<Response>(), newer = deferred<Response>(); reply = () => older.promise;
      await act(async () => { void latest!.refresh(); await pause(); }); await until(() => requests.length === 2);
      const stale = requests.at(-1)!; reply = () => newer.promise;
      await act(async () => { void latest!.refresh(); await pause(); }); await until(() => requests.length === 3);
      assert.equal(stale.signal?.aborted, true);
      await act(async () => { newer.resolve(Response.json(payload("free"))); await pause(); });
      await until(() => latest!.membership?.plan === "free");
      await act(async () => { older.resolve(Response.json(payload("trading"))); await pause(); });
      assert.equal(latest!.membership?.plan, "free");
    });

    await t.test("expiry refresh removes the grant before accepting a fresh downgrade", async () => {
      const expiry = now + 5_000;
      await mount({ response: () => Response.json(payload("premium", "account-a", new Date(expiry).toISOString())) });
      const expiryTimer = [...timers].find(([, timer]) => !timer.interval && timer.delay === 5_000);
      assert.ok(expiryTimer, "Paid expiry schedules a refresh independently of the one-minute poll");
      const pending = deferred<Response>(); reply = () => pending.promise; now = expiry + 1;
      await act(async () => { timers.delete(expiryTimer[0]); expiryTimer[1].callback(); await pause(); });
      await until(() => requests.length === 2); assert.equal(latest!.membership, null); assert.equal(latest!.loading, true);
      await act(async () => { pending.resolve(Response.json(payload("free"))); await pause(); });
      await until(() => latest!.membership?.plan === "free");
      assert.ok([...timers.values()].every(timer => timer.interval), "Free plans leave no expiry timer");
    });

    await t.test("focus and visible polling revalidate; hidden tabs do not start background reads", async () => {
      await mount(); const before = requests.length;
      fixture.visible = "hidden";
      await act(async () => { for (const callback of windowListeners.get("focus") ?? []) callback(); for (const timer of timers.values()) if (timer.interval) timer.callback(); await pause(); });
      assert.equal(requests.length, before);
      fixture.visible = "visible"; reply = () => Response.json(payload("trading"));
      await act(async () => { for (const callback of documentListeners.get("visibilitychange") ?? []) callback(); await pause(); });
      await until(() => latest!.membership?.plan === "trading"); assert.equal(requests.length, before + 1);
    });

    await t.test("unmount aborts work and removes all listeners and timers", async () => {
      await mount(); const pending = deferred<Response>(); reply = () => pending.promise;
      await act(async () => { void latest!.refresh(); await pause(); }); await until(() => requests.length === 2);
      const active = requests.at(-1)!;
      await act(async () => { renderer!.unmount(); renderer = undefined; });
      assert.equal(active.signal?.aborted, true);
      await act(async () => { pending.resolve(Response.json(payload("premium"))); await pause(); });
      assert.equal(timers.size, 0);
      assert.ok([...windowListeners.values(), ...documentListeners.values()].every(listeners => listeners.size === 0));
    });
  } finally {
    if (renderer) await act(async () => { renderer!.unmount(); });
    globalThis.fetch = originalFetch;
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete (globalThis as Record<string, unknown>)[key];
    }
    await vite.close();
  }
});
