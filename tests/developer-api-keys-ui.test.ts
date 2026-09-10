import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createElement as h } from "react";
import { MemoryRouter } from "react-router-dom";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { createServer } from "vite";

function label(node: ReactTestInstance): string {
  return node.children.map(child => typeof child === "string" ? child : label(child)).join("");
}

test("developer workspace uses its current session, explicit scopes and expiry, and discards secrets on account switches", async () => {
  const fixtureKey = "__SAJDA_DEVELOPER_KEYS_UI__";
  const originals = new Map([fixtureKey, "window", "document", "navigator"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const originalFetch = globalThis.fetch;
  const fixture = { user: { id: "account-a" } as { id: string } | null, sessionOwner: "account-a", copied: "", local: false };
  const calls: { path: string; init: RequestInit }[] = [];
  const secret = "sj_test_abcdefghijklmnop_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG";
  const key = { id: "00000000-0000-4000-8000-000000000001", name: "MCP reader", keyPrefix: "sj_test_abcdefghijklmnop_", lastFour: "DEFG",
    environment: "preview", scopes: ["domains:search"], createdAt: "2026-09-10T10:00:00Z", expiresAt: "2026-10-10T10:00:00Z", lastUsedAt: null, revokedAt: null as string | null };
  let visibleKeys: typeof key[] = [], pendingCreate: ((response: Response) => void) | undefined, deferCreate = false;
  Object.defineProperty(globalThis, fixtureKey, { configurable: true, value: fixture });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { origin: "https://sajda.test" }, setTimeout, confirm: () => true } });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { title: "Sajda" } });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { clipboard: { writeText: async (value: string) => { fixture.copied = value; } } } });
  globalThis.fetch = async (input, init = {}) => {
    calls.push({ path: String(input), init });
    assert.ok(String(input).startsWith("/api/developer/api-keys"));
    assert.equal(init.credentials, "same-origin");
    assert.equal(init.cache, "no-store");
    assert.equal(init.redirect, "error");
    assert.equal(new Headers(init.headers).has("authorization"), false);
    if (!fixture.local) assert.equal(new Headers(init.headers).get("x-sajda-account"), fixture.user?.id);
    if (init.method === "POST") {
      if (deferCreate) return new Promise(resolve => { pendingCreate = resolve; });
      const body = JSON.parse(String(init.body));
      visibleKeys = [{ ...key, ...body }];
      return Response.json({ key: visibleKeys[0], apiKey: secret }, { status: 201 });
    }
    if (init.method === "DELETE") {
      visibleKeys = [{ ...visibleKeys[0], revokedAt: "2026-09-10T11:00:00Z" }];
      return Response.json({ key: visibleKeys[0] });
    }
    return Response.json({ keys: visibleKeys });
  };
  const vite = await createServer({ configFile: false, appType: "custom",
    server: { middlewareMode: true, watch: null, hmr: false, ws: false }, resolve: { alias: { "@": path.resolve("src") } },
    optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" },
    plugins: [{ name: "developer-key-ui-boundaries", enforce: "pre", load(id) {
      const file = id.replaceAll("\\", "/");
      if (file.endsWith("/src/contexts/AuthContext.tsx")) return `export const useAuth=()=>({user:globalThis.${fixtureKey}.user,loading:false});`;
      if (file.endsWith("/src/integrations/neon/auth.ts")) return `export const isAccountAuthConfigured=true;export const readAccountSession=async()=>({user:{id:globalThis.${fixtureKey}.sessionOwner}});`;
      if (file.endsWith("/src/lib/localTestMode.ts")) return `export const isLocalTestMode=()=>globalThis.${fixtureKey}.local;`;
      if (file.endsWith("/src/i18n/LanguageProvider.tsx")) return "export const useLanguage=()=>({language:'en'});";
      if (file.endsWith("/src/components/LanguageSwitcher.tsx")) return "export default function Stub(){return null;}";
      if (file.endsWith("/src/components/ui/dialog.tsx")) return `import{createElement as h}from'react';export const Dialog=({open,children})=>open?h('section',null,children):null;const Box=({children})=>h('div',null,children);export const DialogContent=Box,DialogDescription=Box,DialogFooter=Box,DialogHeader=Box,DialogTitle=Box;`;
    } }],
  });
  let renderer: ReactTestRenderer | undefined;
  try {
    const { default: Developers } = await vite.ssrLoadModule("/src/pages/Developers.tsx");
    const page = () => h(MemoryRouter, { initialEntries: ["/developers"] }, h(Developers));
    const root = () => renderer!.root;
    const button = (text: string) => root().findAllByType("button").find(node => label(node) === text)!;
    await act(async () => { renderer = create(page()); });
    assert.ok(button("Create API key"));
    await act(async () => button("Create API key").props.onClick());
    const checks = root().findAllByProps({ type: "checkbox" });
    assert.equal(checks.length, 7);
    assert.deepEqual(checks.filter(node => node.props.checked).map(node => node.props.value), ["domains:search"]);
    await act(async () => root().findByProps({ id: "developer-key-name" }).props.onChange({ target: { value: "MCP reader" } }));
    await act(async () => checks.find(node => node.props.value === "saved:read")!.props.onChange({ target: { checked: true } }));
    await act(async () => root().findByProps({ id: "developer-key-expiry" }).props.onChange({ target: { value: "30" } }));
    await act(async () => root().findByType("form").props.onSubmit({ preventDefault() {} }));
    const created = calls.find(call => call.init.method === "POST")!;
    assert.deepEqual(JSON.parse(String(created.init.body)), { name: "MCP reader", scopes: ["domains:search", "saved:read"], expiresInDays: 30 });
    assert.equal(label(root()).includes(secret), true);
    await act(async () => button("Copy key").props.onClick());
    assert.equal(fixture.copied, secret);
    await act(async () => button("Done").props.onClick());
    assert.equal(label(root()).includes(secret), false);
    assert.ok(label(root()).includes("saved:read"));
    await act(async () => button("Revoke").props.onClick());
    const revoked = calls.find(call => call.init.method === "DELETE");
    assert.ok(revoked, "Revoking a key must send its owner-bound DELETE request");
    const revokeUrl = new URL(revoked.path, "https://sajda.test");
    assert.equal(revokeUrl.pathname, "/api/developer/api-keys");
    assert.deepEqual([...revokeUrl.searchParams], [["id", key.id]]);
    assert.equal(revoked.init.credentials, "same-origin");
    assert.equal(new Headers(revoked.init.headers).get("x-sajda-account"), "account-a");
    assert.equal(new Headers(revoked.init.headers).has("content-type"), false, "A bodyless DELETE must not claim JSON content");
    assert.equal(Object.hasOwn(revoked.init, "body"), false, "The selected key belongs in the query, not a DELETE body");
    assert.equal(revoked.init.body, undefined);
    assert.ok(label(root()).includes("Revoked"));
    assert.equal(button("Revoke"), undefined);

    // A cross-tab session change prevents a write even before React updates.
    await act(async () => button("Create API key").props.onClick());
    await act(async () => root().findByProps({ id: "developer-key-name" }).props.onChange({ target: { value: "Wrong account" } }));
    fixture.sessionOwner = "account-b";
    const before = calls.length;
    await act(async () => root().findByType("form").props.onSubmit({ preventDefault() {} }));
    assert.equal(calls.length, before);
    fixture.sessionOwner = "account-a";
    deferCreate = true;
    await act(async () => root().findByType("form").props.onSubmit({ preventDefault() {} }));
    assert.ok(pendingCreate);
    fixture.user = { id: "account-b" }; fixture.sessionOwner = "account-b"; visibleKeys = [];
    await act(async () => renderer!.update(page()));
    await act(async () => pendingCreate!(Response.json({ key, apiKey: secret }, { status: 201 })));
    assert.equal(label(root()).includes(secret), false, "A delayed prior-account secret must never be displayed");
    assert.equal(label(root()).includes("MCP reader"), false);
    assert.equal((calls.findLast(call => call.init.method === "POST")!.init.signal as AbortSignal).aborted, true);
    fixture.user = null;
    await act(async () => renderer!.update(page()));
    assert.equal(button("Create API key"), undefined);
    assert.ok(label(root()).includes("Sign in to manage API keys."));
  } finally {
    if (renderer) await act(async () => renderer!.unmount());
    globalThis.fetch = originalFetch;
    for (const [keyName, descriptor] of originals) if (descriptor) Object.defineProperty(globalThis, keyName, descriptor); else Reflect.deleteProperty(globalThis, keyName);
    await vite.close();
  }
});
