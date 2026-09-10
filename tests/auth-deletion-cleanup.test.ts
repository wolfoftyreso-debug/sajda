import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createElement as h } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { createServer } from "vite";
import type { AccountSession } from "../src/integrations/neon/account-types";

function session(owner: string): AccountSession {
  return { user: { id: owner, email: `${owner}@example.test`, created_at: "2026-09-01T00:00:00Z" }, expires_at: Date.now() / 1000 + 3600 };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

test("real AuthProvider clears only the confirmed deleted owner and fences session races", async t => {
  const key = "__AUTH_DELETION_CLEANUP_TEST__";
  const descriptors = new Map([key, "window", "document", "BroadcastChannel"].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const focus = new Set<() => void>();
  const visibility = new Set<() => void>();
  const channels: TestChannel[] = [];
  class TestChannel {
    onmessage: (() => void) | null = null;
    messages: unknown[] = [];
    closed = false;
    constructor(readonly name: string) { channels.push(this); }
    postMessage(message: unknown) { this.messages.push(message); }
    close() { this.closed = true; }
  }
  let read: () => Promise<AccountSession | null> = async () => session("owner-a");
  let forget: (owner: string) => Promise<void> = async () => undefined;
  const forgotten: string[] = [];
  let genericSignouts = 0;
  const fixture = {
    read: () => read(),
    forget: async (owner: string) => { forgotten.push(owner); return forget(owner); },
    genericSignout: async () => { genericSignouts++; throw new Error("Deletion must not sign out an unscoped/new account"); },
  };
  Object.defineProperty(globalThis, key, { configurable: true, value: fixture });
  Object.defineProperty(globalThis, "BroadcastChannel", { configurable: true, value: TestChannel });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { visibilityState: "visible",
    addEventListener: (_name: string, callback: () => void) => visibility.add(callback),
    removeEventListener: (_name: string, callback: () => void) => visibility.delete(callback),
  } });
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    addEventListener: (_name: string, callback: () => void) => focus.add(callback),
    removeEventListener: (_name: string, callback: () => void) => focus.delete(callback),
    setInterval: () => 1, clearInterval: () => undefined,
  } });
  const vite = await createServer({ configFile: false, appType: "custom", server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" },
    plugins: [{ name: "auth-deletion-external-boundaries", enforce: "pre", load(id) {
      const name = id.replaceAll("\\", "/");
      if (name.endsWith("/src/i18n/LanguageProvider.tsx")) return "export const useLanguage=()=>({language:'en'});";
      if (name.endsWith("/src/lib/appSurface.ts")) return "export let isNativeApp=false; export const setNative=value=>{isNativeApp=value;};";
      if (name.endsWith("/src/integrations/neon/auth.ts")) return `export const isAccountAuthConfigured=true;export const readAccountSession=()=>globalThis.${key}.read();export const accountError=(error,message)=>new Error(message);export const getAccountAuthClient=async()=>({signOut:globalThis.${key}.genericSignout});`;
      if (name.endsWith("/src/lib/nativeTransport.ts")) return `export const nativeSignIn=async()=>{};export const nativeSignOut=()=>globalThis.${key}.genericSignout();export const forgetDeletedAccount=owner=>globalThis.${key}.forget(owner);`;
    } }],
  });
  let renderer: ReactTestRenderer | undefined;
  let auth!: { user: { id: string } | null; session: AccountSession | null; loading: boolean; error: Error | null;
    completeAccountDeletion: (owner: string) => Promise<boolean> };
  try {
    const { AuthProvider, useAuth } = await vite.ssrLoadModule("/src/contexts/AuthContext.tsx");
    const { setNative } = await vite.ssrLoadModule("/src/lib/appSurface.ts");
    const Probe = () => { auth = useAuth(); return h("output", {}, auth.user?.id ?? "signed-out"); };
    const mount = async (native = false) => {
      if (renderer) await act(async () => renderer!.unmount());
      read = async () => session("owner-a"); forget = async () => undefined; forgotten.length = 0; genericSignouts = 0;
      setNative(native);
      await act(async () => { renderer = create(h(AuthProvider, {}, h(Probe))); });
      assert.equal(auth.user?.id, "owner-a");
    };
    const currentChannel = () => channels.at(-1)!;
    const focusRefresh = async () => act(async () => { for (const listener of focus) listener(); });

    await t.test("mount, ordinary refresh and wrong-owner completion never clear or call the native bridge", async () => {
      await mount(true); await focusRefresh();
      assert.equal(auth.user?.id, "owner-a");
      for (const wrong of ["", "owner-b"]) {
        let result = true;
        await act(async () => { result = await auth.completeAccountDeletion(wrong); });
        assert.equal(result, false);
      }
      assert.equal(auth.user?.id, "owner-a");
      assert.deepEqual(forgotten, []); assert.deepEqual(currentChannel().messages, []);
      assert.equal(genericSignouts, 0);
    });
    await t.test("confirmed owner callback clears browser state and broadcasts without generic sign-out", async () => {
      await mount();
      assert.equal(auth.user?.id, "owner-a", "no cleanup before explicit successful-deletion callback");
      let result = false;
      await act(async () => { result = await auth.completeAccountDeletion("owner-a"); });
      assert.equal(result, true); assert.equal(auth.user, null); assert.equal(auth.session, null);
      assert.equal(auth.error, null); assert.equal(auth.loading, false);
      assert.deepEqual(currentChannel().messages, ["session-changed"]);
      assert.deepEqual(forgotten, []); assert.equal(genericSignouts, 0);
    });
    await t.test("matching native identity is forgotten exactly once before local completion", async () => {
      await mount(true);
      let result = false;
      await act(async () => { result = await auth.completeAccountDeletion("owner-a"); });
      assert.equal(result, true); assert.equal(auth.user, null);
      assert.deepEqual(forgotten, ["owner-a"]);
      assert.deepEqual(currentChannel().messages, ["session-changed"]);
      await act(async () => { assert.equal(await auth.completeAccountDeletion("owner-a"), false); });
      assert.deepEqual(forgotten, ["owner-a"]); assert.equal(genericSignouts, 0);
    });
    await t.test("delayed native forgetting cannot clear a newly restored account", async () => {
      await mount(true);
      const cleanup = deferred<void>(); forget = () => cleanup.promise;
      let deletion!: Promise<boolean>;
      await act(async () => { deletion = auth.completeAccountDeletion("owner-a"); });
      read = async () => session("owner-b"); await focusRefresh();
      assert.equal(auth.user?.id, "owner-b");
      let completed = true;
      await act(async () => { cleanup.resolve(); completed = await deletion; });
      assert.equal(completed, false); assert.equal(auth.user?.id, "owner-b");
      assert.deepEqual(currentChannel().messages, []); assert.deepEqual(forgotten, ["owner-a"]);
      assert.equal(genericSignouts, 0);
    });
    await t.test("refresh started before deletion cannot restore the deleted owner afterward", async () => {
      await mount();
      const stale = deferred<AccountSession | null>(); read = () => stale.promise;
      await focusRefresh();
      await act(async () => { assert.equal(await auth.completeAccountDeletion("owner-a"), true); });
      await act(async () => stale.resolve(session("owner-a")));
      assert.equal(auth.user, null); assert.deepEqual(currentChannel().messages, ["session-changed"]);
    });
    await t.test("native cleanup failure still invalidates the matching local session", async () => {
      await mount(true);
      const failure = new Error("Keychain cleanup failed"); forget = async () => { throw failure; };
      await act(async () => { await assert.rejects(auth.completeAccountDeletion("owner-a"), error => error === failure); });
      assert.equal(auth.user, null); assert.equal(auth.session, null); assert.equal(auth.loading, false);
      assert.deepEqual(currentChannel().messages, ["session-changed"]); assert.equal(genericSignouts, 0);
    });
    await t.test("same-owner refresh during slow native cleanup must not suppress successful deletion cleanup", async () => {
      await mount(true);
      const cleanup = deferred<void>(); forget = () => cleanup.promise;
      let deletion!: Promise<boolean>;
      await act(async () => { deletion = auth.completeAccountDeletion("owner-a"); });
      await focusRefresh();
      assert.equal(auth.user?.id, "owner-a");
      let completed = false;
      await act(async () => { cleanup.resolve(); completed = await deletion; });
      assert.equal(completed, true); assert.equal(auth.user, null);
      assert.deepEqual(currentChannel().messages, ["session-changed"]);
    });
    await t.test("refresh begun during native cleanup cannot restore the deleted owner after cleanup finishes", async () => {
      await mount(true);
      const cleanup = deferred<void>(); forget = () => cleanup.promise;
      let deletion!: Promise<boolean>;
      await act(async () => { deletion = auth.completeAccountDeletion("owner-a"); });
      const stale = deferred<AccountSession | null>(); read = () => stale.promise;
      await focusRefresh();
      await act(async () => { cleanup.resolve(); assert.equal(await deletion, true); });
      await act(async () => stale.resolve(session("owner-a")));
      assert.equal(auth.user, null);
      assert.deepEqual(currentChannel().messages, ["session-changed"]);
    });
  } finally {
    if (renderer) await act(async () => renderer!.unmount());
    await vite.close();
    for (const [name, descriptor] of descriptors) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name); }
  }
});
