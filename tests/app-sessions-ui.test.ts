import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { createElement as h } from "react";
import { act, create, type ReactTestRenderer, type ReactTestInstance } from "react-test-renderer";
import { createServer } from "vite";
import { appSessionsCopy } from "../src/i18n/appSessionsCopy";

const text = (node: ReactTestInstance): string => node.children.map(child => typeof child === "string" ? child : text(child)).join("");
const first = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", createdAt: "2026-09-10T06:00:00.000Z", expiresAt: "2026-09-16T06:00:00.000Z" };
const second = { ...first, id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", createdAt: "2026-09-09T06:00:00.000Z" };

test("app sign-in control uses the real client parser and owner-scoped UI; transport is simulated", async t => {
  const key = "__SAJDA_APP_SESSIONS_UI__";
  const previous = Object.getOwnPropertyDescriptor(globalThis, key);
  type Request = { accountId: string; method?: string; body?: { id: string }; signal?: AbortSignal };
  const calls: Array<{ path: string; options: Request }> = [];
  const page = (overrides = {}) => ({ accountId: "owner-a", items: [first, second], nextCursor: null, currentSessionId: null, requestId: "req_fixture", ...overrides });
  const fixture = { language: "sv", request: async (_path: string, _options: Request): Promise<unknown> => page() };
  Object.defineProperty(globalThis, key, { configurable: true, value: fixture });
  const vite = await createServer({ configFile: false, appType: "custom", server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" },
    plugins: [{ name: "app-sessions-transport-fixture", enforce: "pre", load(id) {
      const file = id.replaceAll("\\", "/");
      if (file.endsWith("/src/i18n/LanguageProvider.tsx")) return `export const useLanguage=()=>({language:globalThis.${key}.language});`;
      if (file.endsWith("/src/integrations/neon/auth.ts")) return `export const accountRequest=(path,options)=>globalThis.${key}.request(path,options);`;
    } }],
  });
  let renderer: ReactTestRenderer | undefined;
  try {
    const { default: Panel } = await vite.ssrLoadModule("/src/components/AccountAppSessions.tsx");
    const client = await vite.ssrLoadModule("/src/lib/appSessions.ts");
    const root = () => renderer!.root;
    const buttons = () => root().findAllByType("button");
    const button = (label: string) => buttons().find(node => text(node) === label)!;
    const click = async (label: string) => { const target = button(label); assert.ok(target, label); await act(async () => target.props.onClick()); };
    const mount = async () => {
      if (renderer) await act(async () => renderer!.unmount());
      calls.length = 0;
      await act(async () => { renderer = create(h(Panel, { accountId: "owner-a" })); });
    };
    function respond(handler: typeof fixture.request = async () => page()) {
      fixture.request = async (path, options) => { calls.push({ path, options }); return handler(path, options); };
    }

    for (const language of ["en", "sv", "es", "fr", "zh"] as const) await t.test(`${language}: deliberate read and current-session guard`, async () => {
      fixture.language = language; respond(async () => page({ currentSessionId: second.id }));
      await mount(); const copy = appSessionsCopy[language];
      assert.equal(calls.length, 0, "Account navigation must not inspect sessions automatically");
      assert.equal(root().findByType("h2").children.join(""), copy.title);
      assert.equal(button(copy.show).props["aria-expanded"], false);
      await click(copy.show);
      assert.equal(calls.length, 1); assert.equal(calls[0].options.accountId, "owner-a");
      assert.equal(calls[0].path, "/api/account/app-sessions");
      assert.ok(text(root()).includes(copy.currentHint));
      assert.equal(buttons().filter(node => text(node) === copy.revoke).length, 1);
      assert.equal(root().findAllByType("time").length, 4);
      for (const item of buttons()) assert.match(item.props.className, /min-h-11/);
    });
    fixture.language = "sv"; const copy = appSessionsCopy.sv;
    await t.test("read failure is not an empty account; refresh recovers", async () => {
      respond(async () => { throw new Error("simulated network failure"); }); await mount(); await click(copy.show);
      assert.ok(text(root()).includes(copy.loadError)); assert.ok(!text(root()).includes(copy.empty));
      respond(async () => page({ items: [] })); await click(copy.retry);
      assert.ok(text(root()).includes(copy.empty)); assert.ok(!text(root()).includes(copy.loadError));
    });
    await t.test("confirmation can cancel without mutation; false acknowledgement cannot claim revoked", async () => {
      respond(); await mount(); await click(copy.show); await click(copy.revoke);
      assert.equal(calls.length, 1); assert.ok(text(root()).includes(copy.consequence));
      await click(copy.cancel); assert.equal(calls.length, 1);
      await click(copy.revoke);
      respond(async () => ({ ok: false, accountId: "owner-a", requestId: "req_fixture" }));
      await click(copy.confirmAction);
      assert.ok(text(root()).includes(copy.revokeError)); assert.ok(!text(root()).includes(copy.revoked));
      assert.equal(root().findAllByType("li").length, 2);
      assert.equal(calls.at(-1)!.options.method, "DELETE"); assert.deepEqual(calls.at(-1)!.options.body, { id: first.id });
      respond(async () => ({ ok: true, accountId: "owner-a", requestId: "req_fixture" }));
      await click(copy.confirmAction);
      assert.ok(text(root()).includes(copy.revoked)); assert.equal(root().findAllByType("li").length, 1);
    });
    await t.test("double click issues one mutation and changing account discards late response", async () => {
      respond(); await mount(); await click(copy.show); await click(copy.revoke);
      let resolve!: (value: unknown) => void;
      respond(async () => new Promise(done => { resolve = done; }));
      const target = button(copy.confirmAction); const before = calls.length;
      await act(async () => { target.props.onClick(); target.props.onClick(); });
      assert.equal(calls.length, before + 1); const oldSignal = calls.at(-1)!.options.signal;
      await act(async () => { renderer!.update(h(Panel, { accountId: "owner-b" })); });
      assert.equal(oldSignal!.aborted, true); assert.equal(root().findAllByType("li").length, 0);
      await act(async () => resolve({ ok: true, accountId: "owner-a", requestId: "req_fixture" }));
      assert.ok(!text(root()).includes(copy.revoked)); assert.equal(root().findAllByType("li").length, 0);
      respond(async () => page({ accountId: "owner-b", items: [] })); await click(copy.show);
      assert.equal(calls.at(-1)!.options.accountId, "owner-b"); assert.ok(text(root()).includes(copy.empty));
    });
    await t.test("changing account during a read cannot show old app metadata", async () => {
      let resolve!: (value: unknown) => void;
      respond(async () => new Promise(done => { resolve = done; })); await mount(); await click(copy.show);
      const oldSignal = calls[0].options.signal;
      await act(async () => renderer!.update(h(Panel, { accountId: "owner-b" })));
      assert.equal(oldSignal!.aborted, true);
      await act(async () => resolve(page()));
      assert.equal(root().findAllByType("li").length, 0); assert.ok(button(copy.show));
    });
    await t.test("pagination preserves cursor and rejects a loop without duplicating rows", async () => {
      respond(async () => page({ items: [first], nextCursor: "opaque-page" })); await mount(); await click(copy.show);
      respond(async () => page({ items: [second], nextCursor: "opaque-page" })); await click(copy.more);
      assert.equal(calls.at(-1)!.path, "/api/account/app-sessions?cursor=opaque-page");
      assert.ok(text(root()).includes(copy.paginationError)); assert.equal(root().findAllByType("li").length, 1);
      respond(async () => page({ items: [second] })); await click(copy.retry);
      assert.ok(!text(root()).includes(copy.paginationError)); assert.equal(root().findAllByType("li").length, 1);
    });
    await t.test("client rejects owner mismatch, malformed pages and unconfirmed revocation", async () => {
      for (const invalid of [page({ accountId: "owner-b" }), page({ items: [first, first] }), page({ items: [{ ...first, expiresAt: "invalid" }] }), page({ items: [], nextCursor: "more" }), page({ currentSessionId: "invalid" })]) {
        respond(async () => invalid); await assert.rejects(() => client.listAppSessions({ accountId: "owner-a" }));
      }
      respond(async () => ({ ok: true, accountId: "owner-b", requestId: "req_fixture" }));
      await assert.rejects(() => client.revokeAppSession(first.id, { accountId: "owner-a" }));
      const before = calls.length;
      await assert.rejects(() => client.revokeAppSession("all", { accountId: "owner-a" }));
      assert.equal(calls.length, before);
    });
  } finally {
    if (renderer) await act(async () => renderer!.unmount()); await vite.close();
    if (previous) Object.defineProperty(globalThis, key, previous); else Reflect.deleteProperty(globalThis, key);
  }
});
