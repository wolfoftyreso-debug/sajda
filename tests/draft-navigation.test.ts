import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createElement as h } from "react";
import { createMemoryRouter, Navigate, Route, RouterProvider, Routes, type RouterProviderProps } from "react-router-dom";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { createServer } from "vite";
import { tradingPortalCopy } from "../src/i18n/tradingPortalCopy";
import { tradingScenarioSchema, type TradingScenario, type TradingScenarioInput } from "../shared/trading-scenarios";

const c = tradingPortalCopy.en;
const pause = () => new Promise(resolve => setTimeout(resolve, 0));
const text = (node: ReactTestInstance): string => node.children.map(child => typeof child === "string" ? child : text(child)).join("");

test("data-router guard protects real Trading drafts without retaining another account's work", async t => {
  const key = "__SAJDA_DRAFT_ROUTER_TEST__";
  const originals = new Map([key, "window", "IS_REACT_ACT_ENVIRONMENT"].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const originalFetch = globalThis.fetch;
  const listeners = new Set<() => void>();
  const beforeUnload = new Set<(event: { preventDefault(): void; returnValue?: string }) => void>();
  const focus: string[] = [];
  const fixture = {
    auth: { user: { id: "account-a" } as { id: string } | null, loading: false },
    subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); },
    async request(_path: string, options: { accountId: string; body?: { scenario: TradingScenarioInput } }) {
      const input = options.body?.scenario;
      const { expectedVersion: _expectedVersion, ...fields } = input ?? {};
      const rows: TradingScenario[] = input ? [tradingScenarioSchema.parse({ ...fields,
        version: input.expectedVersion + 1, createdAt: "2030-01-20T12:00:00.000Z", updatedAt: "2030-01-20T12:00:00.000Z" }) as TradingScenario] : [];
      return { accountId: options.accountId, requestId: "req_0123456789abcdef", scenarios: rows };
    },
    session: async () => fixture.auth.user ? { user: fixture.auth.user, expires_at: Date.now() / 1000 + 60 } : null,
  };
  Object.defineProperty(globalThis, key, { configurable: true, value: fixture });
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    confirm: () => true,
    addEventListener(name: string, listener: (event: { preventDefault(): void; returnValue?: string }) => void) { if (name === "beforeunload") beforeUnload.add(listener); },
    removeEventListener(name: string, listener: (event: { preventDefault(): void; returnValue?: string }) => void) { if (name === "beforeunload") beforeUnload.delete(listener); },
    get localStorage() { throw new Error("Private drafts must not use browser storage"); },
    get sessionStorage() { throw new Error("Private drafts must not use browser storage"); },
  } });
  globalThis.fetch = async () => { throw new Error("Router regression tests must not call live services"); };
  const vite = await createServer({ configFile: false, appType: "custom",
    server: { middlewareMode: true, watch: null, hmr: false, ws: false }, resolve: { alias: { "@": path.resolve("src") } },
    optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" },
    plugins: [{ name: "draft-router-test-boundaries", enforce: "pre", load(id) {
      const name = id.replaceAll("\\", "/");
      if (name.endsWith("/src/contexts/AuthContext.tsx")) return `import{useSyncExternalStore}from'react';export const useAuth=()=>useSyncExternalStore(globalThis.${key}.subscribe,()=>globalThis.${key}.auth);`;
      if (name.endsWith("/src/i18n/LanguageProvider.tsx")) return `export const useLanguage=()=>({language:'en'});`;
      if (name.endsWith("/src/lib/anonymousSearchMode.ts")) return `export const isAnonymousSearchMode=()=>false;`;
      if (name.endsWith("/src/integrations/neon/auth.ts")) return `export const accountRequest=(...args)=>globalThis.${key}.request(...args);export const readAccountSession=()=>globalThis.${key}.session();`;
      // No DOM implementation is installed in this Node suite. Keep the real
      // provider/controls, but render the Radix portal boundary inline. Actual
      // dialog focus trapping and browser history are additionally browser QA.
      if (name.endsWith("/src/components/ui/dialog.tsx")) return `import{createElement as h}from'react';
        export const Dialog=({open,children,onOpenChange})=>open?h('section',{'data-draft-dialog':true,onOpenChange},children):null;
        export const DialogContent=props=>h('div',{'data-dialog-content':true,...props});
        export const DialogHeader=props=>h('header',props);export const DialogFooter=props=>h('footer',props);
        export const DialogTitle=props=>h('h2',props);export const DialogDescription=props=>h('p',props);`;
    } }],
  });
  let renderer: ReactTestRenderer | undefined;
  let router: RouterProviderProps["router"] | undefined;
  try {
    const [{ default: Guard }, { default: Portal }, { default: ProtectedRoute }, { useAuth }] = await Promise.all([
      vite.ssrLoadModule("/src/app/DraftNavigationProvider.tsx"), vite.ssrLoadModule("/src/components/TradingPortal.tsx"),
      vite.ssrLoadModule("/src/components/ProtectedRoute.tsx"), vite.ssrLoadModule("/src/contexts/AuthContext.tsx"),
    ]);
    function TradingRoute() {
      const { user } = useAuth();
      return user ? h(Portal, { key: user.id, accountId: user.id, language: "en", candidates: [], now: Date.now() }) : h(Navigate, { to: "/auth", replace: true });
    }
    function RouteTree() {
      return h(Routes, null,
        h(Route, { path: "/plus", element: h(ProtectedRoute, null, h(TradingRoute)) }),
        h(Route, { path: "/account", element: h(ProtectedRoute, null, h("main", null, "Account page")) }),
        h(Route, { path: "/auth", element: h("main", null, "Sign in page") }),
        h(Route, { path: "*", element: h("main", null, "Home page") }));
    }
    const root = () => renderer!.root;
    const button = (label: string) => {
      const found = root().findAllByType("button").find(node => text(node) === label);
      assert.ok(found, `Missing button: ${label}`); return found;
    };
    const field = (name: string) => root().findAllByType("input").find(node => node.props.name === name)!;
    const click = async (label: string) => act(async () => { button(label).props.onClick(); await pause(); });
    const navigate = async (to: string | number) => act(async () => { void router!.navigate(to as string); await pause(); });
    const dialog = () => root().findAll(node => node.props["data-draft-dialog"] === true);
    const setAuth = async (owner: string | null, loading = false) => act(async () => {
      fixture.auth = { user: owner ? { id: owner } : null, loading };
      for (const notify of listeners) notify();
      await pause();
    });
    const mount = async (entries = ["/", "/plus"], index = entries.length - 1, owner: string | null = "account-a", loading = false) => {
      if (renderer) await act(async () => renderer!.unmount());
      router?.dispose();
      fixture.auth = { user: owner ? { id: owner } : null, loading };
      focus.length = 0;
      router = createMemoryRouter([{ path: "*", element: h(Guard, null, h(RouteTree)) }], { initialEntries: entries, initialIndex: index });
      await act(async () => { renderer = create(h(RouterProvider, { router: router! }), { createNodeMock(element) {
        if (element.type === "button") return { focus: () => focus.push(String(element.props.children)) };
        if (element.type === "nav") return { scrollIntoView() {} };
        if (element.props["data-trading-panel"] !== undefined) return { focus() {} };
        return null;
      } }); await pause(); });
    };
    const dirty = async () => {
      await click(c.tabs.scenarios);
      await act(async () => field("title").props.onChange({ target: { value: "Unsent private hypothesis" } }));
      assert.equal(beforeUnload.size, 1);
    };

    await t.test("initial loading and protected-route redirects preserve their destination", async () => {
      await mount(["/account?panel=billing#invoices"], 0, null, true);
      assert.equal(router!.state.location.pathname, "/account");
      assert.equal(root().findAll(node => node.props.role === "status").length, 1);
      await setAuth(null);
      assert.equal(router!.state.location.pathname, "/auth");
      assert.equal(new URLSearchParams(router!.state.location.search).get("next"), "/account?panel=billing#invoices");
      assert.equal(dialog().length, 0);
    });

    await t.test("ordinary navigation works until an edit, then keeping the draft cancels a push", async () => {
      await mount(); await navigate("/account"); assert.equal(router!.state.location.pathname, "/account");
      await navigate("/plus"); await dirty(); await navigate("/account");
      assert.equal(router!.state.location.pathname, "/plus"); assert.equal(dialog().length, 1);
      const content = root().findAll(node => node.props["data-dialog-content"] === true)[0];
      let prevented = false;
      content.props.onOpenAutoFocus({ preventDefault() { prevented = true; } });
      assert.equal(prevented, true); assert.equal(focus.at(-1), c.keepEditing);
      await click(c.keepEditing);
      assert.equal(dialog().length, 0); assert.equal(field("title").props.value, "Unsent private hypothesis");
      assert.equal(router!.state.location.pathname, "/plus");
      await navigate("/account"); await act(async () => dialog()[0].props.onOpenChange(false));
      assert.equal(field("title").props.value, "Unsent private hypothesis", "Escape/dismiss keeps the draft");
    });

    await t.test("Back and Forward are blocked until deliberate discard, without corrupting history", async () => {
      await mount(["/", "/plus", "/account"], 1); await dirty();
      await navigate(-1);
      assert.equal(router!.state.location.pathname, "/plus"); assert.equal(dialog().length, 1);
      await click(c.keepEditing); assert.equal(field("title").props.value, "Unsent private hypothesis");
      await navigate(1);
      assert.equal(router!.state.location.pathname, "/plus"); assert.equal(dialog().length, 1);
      await click(c.keepEditing); await navigate(-1); await click(c.leaveWithoutSaving);
      assert.equal(router!.state.location.pathname, "/"); assert.equal(beforeUnload.size, 0);
      await navigate(1); await click(c.tabs.scenarios);
      assert.equal(field("title").props.value, "", "Only explicit discard loses the unsaved draft");
      await navigate(1); assert.equal(router!.state.location.pathname, "/account");
    });

    await t.test("same-page query and hash navigation preserves the current scenario without a prompt", async () => {
      await mount(); await dirty(); await navigate("/plus?view=research#plus-workspace-title");
      assert.equal(dialog().length, 0); assert.equal(router!.state.location.hash, "#plus-workspace-title");
      assert.equal(field("title").props.value, "Unsent private hypothesis");
      assert.equal(beforeUnload.size, 1);
      let prevented = false;
      const event = { preventDefault() { prevented = true; }, returnValue: undefined as string | undefined };
      for (const callback of beforeUnload) callback(event);
      assert.equal(prevented, true); assert.equal(event.returnValue, "", "Hard reload keeps the native browser warning");
    });

    await t.test("account replacement clears the private draft and pending navigation prompt", async () => {
      await mount(); await dirty(); await navigate("/"); assert.equal(dialog().length, 1);
      await setAuth("account-b");
      assert.equal(dialog().length, 0); assert.equal(beforeUnload.size, 0);
      assert.equal(router!.state.location.pathname, "/plus", "Do not automatically execute a prior owner's navigation");
      assert.ok(!text(root()).includes("Unsent private hypothesis"));
      await click(c.tabs.scenarios); assert.equal(field("title").props.value, "");
      await navigate("/account"); assert.equal(router!.state.location.pathname, "/account");
    });

    await t.test("logout/expired authentication is never blocked by the departing owner's draft", async () => {
      await mount(); await dirty(); await navigate("/"); assert.equal(dialog().length, 1);
      await setAuth(null);
      assert.equal(router!.state.location.pathname, "/auth"); assert.equal(dialog().length, 0);
      assert.equal(beforeUnload.size, 0); assert.equal(root().findAllByType("form").length, 0);
      assert.equal(new URLSearchParams(router!.state.location.search).get("next"), "/plus");
    });

    await t.test("successful server acknowledgement releases both SPA and reload guards", async () => {
      await mount(); await dirty();
      const values = { domain: "example.com", "assumptions.acquisitionUsd": "100", "assumptions.annualRenewalUsd": "20",
        "assumptions.otherCostsUsd": "0", "assumptions.holdingMonths": "12", "assumptions.sellingFeePercent": "10",
        "assumptions.saleProbabilityPercent": "50", "assumptions.bearSaleUsd": "50", "assumptions.baseSaleUsd": "200", "assumptions.bullSaleUsd": "500" };
      for (const [name, value] of Object.entries(values)) await act(async () => field(name).props.onChange({ target: { value } }));
      await act(async () => { await root().findByType("form").props.onSubmit({ preventDefault() {} }); await pause(); });
      assert.ok(text(root()).includes(c.scenarioSaved)); assert.equal(beforeUnload.size, 0);
      await navigate("/account"); assert.equal(router!.state.location.pathname, "/account"); assert.equal(dialog().length, 0);
    });
  } finally {
    if (renderer) await act(async () => renderer!.unmount());
    router?.dispose(); await vite.close(); globalThis.fetch = originalFetch;
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name);
    }
  }
});
