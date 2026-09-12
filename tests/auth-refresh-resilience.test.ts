import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createElement as h, useState } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { createServer } from "vite";
import type { AccountSession } from "../src/integrations/neon/account-types";

function session(owner = "owner-a", expires = Date.now() / 1000 + 3600): AccountSession {
  return { user: { id: owner, created_at: "2026-09-01T00:00:00Z" }, expires_at: expires };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const httpFailure = (status: number) => Object.assign(new Error("test provider failure"), { status });

test("actual AuthProvider preserves drafts only across transient, unexpired background checks", async t => {
  const key = "__AUTH_REFRESH_RESILIENCE_TEST__";
  const descriptors = new Map([key, "window", "document", "BroadcastChannel", "IS_REACT_ACT_ENVIRONMENT"].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const focus = new Set<() => void>();
  const visibility = new Set<() => void>();
  const intervals = new Set<() => void>();
  const channels: TestChannel[] = [];
  class TestChannel {
    onmessage: (() => void) | null = null;
    constructor() { channels.push(this); }
    postMessage() {}
    close() {}
  }
  let reads = 0;
  let read: () => Promise<AccountSession | null> = async () => session();
  let signOut: () => Promise<{ error?: unknown }> = async () => ({});
  const fixture = { read: () => { reads++; return read(); }, signOut: () => signOut() };
  Object.defineProperty(globalThis, key, { configurable: true, value: fixture });
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });
  Object.defineProperty(globalThis, "BroadcastChannel", { configurable: true, value: TestChannel });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { visibilityState: "visible",
    addEventListener: (_name: string, listener: () => void) => visibility.add(listener),
    removeEventListener: (_name: string, listener: () => void) => visibility.delete(listener),
  } });
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    location: { origin: "https://sajda.example.test" },
    addEventListener: (_name: string, listener: () => void) => focus.add(listener),
    removeEventListener: (_name: string, listener: () => void) => focus.delete(listener),
    setInterval: (listener: () => void) => { intervals.add(listener); return listener; },
    clearInterval: (listener: () => void) => intervals.delete(listener),
  } });
  const vite = await createServer({ configFile: false, appType: "custom", server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" },
    plugins: [{ name: "auth-refresh-transport-boundaries", enforce: "pre", load(id) {
      const name = id.replaceAll("\\", "/");
      if (name.endsWith("/src/i18n/LanguageProvider.tsx")) return "export const useLanguage=()=>({language:'en'});";
      if (name.endsWith("/src/lib/appSurface.ts")) return "export const isNativeApp=false;";
      if (name.endsWith("/src/lib/nativeTransport.ts")) return "export const nativeSignIn=async()=>{};export const nativeSignOut=async()=>{};export const forgetDeletedAccount=async()=>{};";
      if (name.endsWith("/src/integrations/neon/auth.ts")) return `
        export const isAccountAuthConfigured=true;
        export const readAccountSession=()=>globalThis.${key}.read();
        export const accountError=(error,message)=>Object.assign(new Error(message),{status:error?.status,code:error?.code});
        export const getAccountAuthClient=async()=>({signIn:{email:async()=>({})},signOut:()=>globalThis.${key}.signOut()});`;
    } }],
  });
  let renderer: ReactTestRenderer | undefined;
  let auth!: ReturnType<typeof import("../src/contexts/AuthContext").useAuth>;
  try {
    const { AuthProvider, useAuth } = await vite.ssrLoadModule("/src/contexts/AuthContext.tsx");
    t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: Date.now() });
    const Draft = () => {
      const [value, setValue] = useState("");
      return h("input", { value, onChange: (event: { target: { value: string } }) => setValue(event.target.value) });
    };
    const Probe = () => { auth = useAuth(); return auth.user ? h(Draft, { key: auth.user.id }) : h("output", {}, "signed-out"); };
    const mount = async (initial: () => Promise<AccountSession | null> = async () => session()) => {
      if (renderer) await act(async () => renderer!.unmount());
      reads = 0; read = initial; signOut = async () => ({});
      await act(async () => { renderer = create(h(AuthProvider, {}, h(Probe))); });
    };
    const refresh = async () => act(async () => { for (const listener of focus) listener(); });
    const broadcast = async () => act(async () => channels.at(-1)!.onmessage?.());
    const editDraft = async () => act(async () => renderer!.root.findByType("input").props.onChange({ target: { value: "Unsaved owner-a thesis" } }));
    const draft = () => renderer!.root.findByType("input").props.value;

    await t.test("429, 503 and network failure preserve an unexpired owner and unsaved mounted work, recovery clears the error", async () => {
      await mount(); await editDraft();
      for (const failure of [httpFailure(429), httpFailure(503), new TypeError("Failed to fetch")]) {
        read = async () => { throw failure; }; await refresh();
        assert.equal(auth.user?.id, "owner-a"); assert.equal(draft(), "Unsaved owner-a thesis"); assert.ok(auth.error);
      }
      read = async () => session(); await refresh();
      assert.equal(auth.error, null); assert.equal(draft(), "Unsaved owner-a thesis");
    });
    await t.test("first-load transport failure never invents a session", async () => {
      await mount(async () => { throw httpFailure(503); });
      assert.equal(auth.user, null); assert.equal(auth.loading, false); assert.ok(auth.error);
    });
    await t.test("null, 401, 403 and explicit revoked-session errors clear the owner and draft", async () => {
      for (const failure of [null, httpFailure(401), httpFailure(403), Object.assign(new Error("revoked"), { code: "INVALID_SESSION" })]) {
        await mount(); await editDraft();
        read = async () => { if (failure) throw failure; return null; }; await refresh();
        assert.equal(auth.user, null); assert.equal(renderer!.root.findAllByType("input").length, 0);
      }
    });
    await t.test("expired, missing and invalid expirations are never restored", async () => {
      for (const expires of [Date.now() / 1000, Date.now() / 1000 - 1, NaN, Infinity, undefined, null]) {
        await mount(async () => ({ ...session(), expires_at: expires }));
        assert.equal(auth.user, null);
      }
    });
    await t.test("expiry clears identity at its deadline even when a refresh is still pending; its late response cannot resurrect it", async () => {
      await mount(async () => session("owner-a", Date.now() / 1000 + 2)); await editDraft();
      const late = deferred<AccountSession | null>(); read = () => late.promise; await refresh();
      await act(async () => t.mock.timers.tick(2000));
      assert.equal(auth.user, null);
      await act(async () => late.resolve(session()));
      assert.equal(auth.user, null);
    });
    await t.test("focus, visibility and interval refreshes share one in-flight background check", async () => {
      await mount();
      const pending = deferred<AccountSession | null>(); read = () => pending.promise;
      await act(async () => { for (const listeners of [focus, visibility, intervals]) for (const listener of listeners) listener(); });
      assert.equal(reads, 2, "initial check plus one shared refresh");
      await act(async () => pending.resolve(session()));
      read = async () => session(); await refresh(); assert.equal(reads, 3, "completed checks are not reused as authorization cache");
    });
    await t.test("known credentials changed in another tab discards old private work even if the new check fails", async () => {
      await mount(); await editDraft();
      read = async () => { throw httpFailure(503); }; await broadcast();
      assert.equal(auth.user, null);
      read = async () => session("owner-b"); await refresh();
      assert.equal(auth.user?.id, "owner-b"); assert.equal(draft(), "");
    });
    await t.test("late owner-a failure cannot overwrite newly verified owner-b", async () => {
      await mount(); await editDraft();
      const old = deferred<AccountSession | null>(); read = () => old.promise; await refresh();
      read = async () => session("owner-b"); await broadcast();
      assert.equal(auth.user?.id, "owner-b"); assert.equal(draft(), "");
      await act(async () => old.reject(httpFailure(503)));
      assert.equal(auth.user?.id, "owner-b"); assert.equal(auth.error, null);
    });
    await t.test("successful credentials action never returns the previous owner's pending session", async () => {
      await mount(); await editDraft();
      const old = deferred<AccountSession | null>(); read = () => old.promise; await refresh();
      read = async () => { throw httpFailure(429); };
      await act(async () => { assert.ok((await auth.signIn("owner-b@example.test", "fixture-password")).error); });
      assert.equal(auth.user, null);
      await act(async () => old.resolve(session())); assert.equal(auth.user, null);
    });
    await t.test("failed logout preserves current state, successful logout fences a late refresh", async () => {
      await mount(); await editDraft();
      signOut = async () => ({ error: httpFailure(503) });
      await act(async () => { await assert.rejects(auth.signOut(), /Sign-out failed/); });
      assert.equal(auth.user?.id, "owner-a"); assert.equal(draft(), "Unsaved owner-a thesis");
      const late = deferred<AccountSession | null>(); read = () => late.promise; await refresh();
      signOut = async () => ({}); await act(async () => auth.signOut());
      await act(async () => late.resolve(session())); assert.equal(auth.user, null);
    });
  } finally {
    if (renderer) await act(async () => renderer!.unmount());
    t.mock.timers.reset();
    await vite.close();
    for (const [name, descriptor] of descriptors) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name); }
  }
});
