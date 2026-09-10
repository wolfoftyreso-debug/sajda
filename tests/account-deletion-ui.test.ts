import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createElement as h } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { createServer } from "vite";
import { accountDeletionCopy } from "../src/i18n/accountDeletionCopy";

test("mounted deletion flow requires deliberate confirmation, handles retries and fences owner changes", async () => {
  const original = new Map(["__DELETION_UI_TEST__", "IS_REACT_ACT_ENVIRONMENT"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  type Request = { accountId: string; body: { action: string; requestId: string; code?: string; confirmation?: string }; signal: AbortSignal };
  const requests: Request[] = [];
  const fixture = {
    language: "en",
    request: async (_path: string, value: Request): Promise<unknown> => {
      requests.push(value);
      return { accountId: value.accountId, requestId: "req_safe_correlation", deletionRequestId: value.body.requestId,
        ...(value.body.action === "request" ? { status: "confirmation_required", expiresAt: new Date(Date.now() + 900_000).toISOString() } : { status: "deleted", billing: "none" }) };
    },
  };
  Object.defineProperty(globalThis, "__DELETION_UI_TEST__", { configurable: true, value: fixture });
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });
  const vite = await createServer({ configFile: false, appType: "custom", server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" },
    plugins: [{ name: "deletion-ui-fixtures", enforce: "pre", load(id) {
      const file = id.replaceAll("\\", "/");
      if (file.endsWith("/src/i18n/LanguageProvider.tsx")) return "export const useLanguage=()=>({language:globalThis.__DELETION_UI_TEST__.language});";
      if (file.endsWith("/src/integrations/neon/auth.ts")) return "export const accountRequest=(...args)=>globalThis.__DELETION_UI_TEST__.request(...args);";
    } }],
  });
  let renderer: ReactTestRenderer | undefined;
  try {
    const Panel = (await vite.ssrLoadModule("/src/components/AccountDeletionPanel.tsx")).default;
    const completed: string[] = [];
    const onDeleted = async (owner: string) => { completed.push(owner); };
    const flush = () => new Promise(resolve => setTimeout(resolve, 5));
    const button = (label: string) => renderer!.root.findAllByType("button").find(item => item.children.join("") === label)!;
    const mount = async (owner = "owner-a") => { await act(async () => { renderer?.unmount(); renderer = create(h(Panel, { accountId: owner, onDeleted })); }); };
    const click = async (label: string) => { await act(async () => { button(label).props.onClick(); await flush(); }); };
    const open = async () => {
      await click(accountDeletionCopy.en.title);
      assert.equal(button(accountDeletionCopy.en.request).props.disabled, true);
      await act(async () => { renderer!.root.findByProps({ type: "checkbox" }).props.onChange({ target: { checked: true } }); });
    };
    const setCode = async (value: string) => { await act(async () => { renderer!.root.findByProps({ autoComplete: "one-time-code" }).props.onChange({ target: { value } }); }); };
    await mount();
    assert.equal(requests.length, 0);
    await open(); await click(accountDeletionCopy.en.request);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].body.action, "request");
    assert.equal(button(accountDeletionCopy.en.confirm).props.disabled, true);
    await setCode("12345678"); await click(accountDeletionCopy.en.confirm);
    assert.equal(requests[1].body.confirmation, "DELETE");
    assert.equal(requests[1].body.requestId, requests[0].body.requestId);
    assert.deepEqual(completed, ["owner-a"]);
    assert.match(JSON.stringify(renderer!.toJSON()), /Your account has been deleted/);

    // Code/email failures retain the UUID; they never silently retry or delete.
    const healthy = fixture.request;
    fixture.request = async (_path, value) => { requests.push(value); throw Object.assign(new Error("private provider detail"), { code: "deletion_email_unavailable" }); };
    await mount(); await open(); const before = requests.length;
    await click(accountDeletionCopy.en.request);
    assert.match(JSON.stringify(renderer!.toJSON()), /could not be sent/);
    assert.doesNotMatch(JSON.stringify(renderer!.toJSON()), /private provider/);
    fixture.request = healthy;
    await click(accountDeletionCopy.en.request);
    assert.equal(requests[before].body.requestId, requests[before + 1].body.requestId);
    await click(accountDeletionCopy.en.cancel);
    assert.equal(requests.length, before + 2);

    // Two rapid taps execute one request. A late account-A result cannot update B.
    let release!: (value: unknown) => void;
    fixture.request = async (_path, value) => { requests.push(value); return new Promise(resolve => { release = resolve; }); };
    await mount(); await open();
    const beforeDelayed = requests.length;
    await act(async () => { const start = button(accountDeletionCopy.en.request).props.onClick; start(); start(); });
    assert.equal(requests.length, beforeDelayed + 1);
    const old = requests.at(-1)!;
    await act(async () => { renderer!.update(h(Panel, { accountId: "owner-b", onDeleted })); });
    assert.equal(old.signal.aborted, true);
    await act(async () => { release({ accountId: "owner-a", deletionRequestId: old.body.requestId, requestId: "req_safe",
      status: "confirmation_required", expiresAt: new Date(Date.now() + 900_000).toISOString() }); await flush(); });
    assert.equal(renderer!.root.findAllByProps({ autoComplete: "one-time-code" }).length, 0);
    assert.deepEqual(completed, ["owner-a"]);

    fixture.request = async (_path, value) => ({ accountId: "wrong-owner", deletionRequestId: value.body.requestId, requestId: "req_safe",
      status: "confirmation_required", expiresAt: new Date(Date.now() + 900_000).toISOString() });
    await mount(); await open(); await click(accountDeletionCopy.en.request);
    assert.equal(renderer!.root.findAllByProps({ role: "alert" }).length, 1);
    assert.equal(renderer!.root.findAllByProps({ autoComplete: "one-time-code" }).length, 0);

    for (const [language, copy] of Object.entries(accountDeletionCopy)) {
      fixture.language = language; await mount();
      assert.ok(button(copy.title));
      await click(copy.title);
      assert.match(JSON.stringify(renderer!.toJSON()), /https:\/\/apps.apple.com\/account\/subscriptions/);
      assert.ok(button(copy.request).props.disabled);
    }
  } finally {
    await act(async () => { renderer?.unmount(); });
    await vite.close();
    for (const [key, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
    }
  }
});
