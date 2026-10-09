import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createElement as h } from "react";
import { createMemoryRouter, RouterProvider, Routes, Route } from "react-router-dom";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { createServer } from "vite";
import { brandWorksheetCopy } from "../src/i18n/brandWorksheetCopy";
import { tradingPortalCopy } from "../src/i18n/tradingPortalCopy";

const text = (node: ReactTestInstance): string => node.children.map(child => typeof child === "string" ? child : text(child)).join("");
const pause = () => new Promise(resolve => setTimeout(resolve, 0));

test("mounted public brand worksheet guards guest history and clears guards across account changes", async t => {
  const key = "__SAJDA_LOCAL_WORKSHEET_ROUTER__";
  const originals = new Map([key, "window", "IS_REACT_ACT_ENVIRONMENT"].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const originalFetch = globalThis.fetch, notifications = new Set<() => void>();
  const beforeUnload = new Set<(event: { preventDefault(): void; returnValue?: string }) => void>();
  const fixture = { auth: { user: null as { id: string } | null }, language: "en",
    subscribe(listener: () => void) { notifications.add(listener); return () => notifications.delete(listener); } };
  Object.defineProperty(globalThis, key, { configurable: true, value: fixture });
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { pathname: "/brand-index/assessment" }, setInterval: () => 1, clearInterval() {},
    addEventListener(name: string, listener: (event: { preventDefault(): void; returnValue?: string }) => void) { if (name === "beforeunload") beforeUnload.add(listener); },
    removeEventListener(name: string, listener: (event: { preventDefault(): void; returnValue?: string }) => void) { if (name === "beforeunload") beforeUnload.delete(listener); },
    get localStorage() { throw new Error("No local worksheet storage"); }, get sessionStorage() { throw new Error("No local worksheet storage"); } } });
  globalThis.fetch = async () => { throw new Error("Local navigation test must not call providers"); };
  const vite = await createServer({ configFile: false, appType: "custom", server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" },
    plugins: [{ name: "brand-worksheet-router-boundaries", enforce: "pre", load(id) {
      const name = id.replaceAll("\\", "/");
      if (name.endsWith("/src/contexts/AuthContext.tsx")) return `import{useSyncExternalStore}from'react';export const useAuth=()=>useSyncExternalStore(globalThis.${key}.subscribe,()=>globalThis.${key}.auth);`;
      if (name.endsWith("/src/i18n/LanguageProvider.tsx")) return `export const useLanguage=()=>({language:globalThis.${key}.language});export const applyDocumentMetadata=()=>{};`;
      if (name.endsWith("/src/components/LanguageSwitcher.tsx")) return "export default function LanguageSwitcher(){return null;}";
      if (name.endsWith("/src/components/FreeSearchGate.tsx")) return "export default function FreeSearchGate(){return null;}";
      if (name.endsWith("/src/contexts/ScanContext.tsx")) return "export const useScan=()=>({isScanning:false,requestAnonymousSearchAccess:()=>{throw new Error('No provider request permitted') }});";
      if (name.endsWith("/src/lib/appSurface.ts")) return "export const isNativeApp=false;";
      if (name.endsWith("/src/lib/nativeTransport.ts")) return "export const nativeShareFile=()=>{throw new Error('No native export in navigation test')};";
      // Keep the actual router provider and controls; only the DOM portal is synthetic.
      if (name.endsWith("/src/components/ui/dialog.tsx")) return `import{createElement as h}from'react';
        export const Dialog=({open,children,onOpenChange})=>open?h('section',{'data-draft-dialog':true,onOpenChange},children):null;
        export const DialogContent=props=>h('div',props);export const DialogHeader=props=>h('header',props);
        export const DialogFooter=props=>h('footer',props);export const DialogTitle=props=>h('h2',props);export const DialogDescription=props=>h('p',props);`;
    } }],
  });
  let renderer: ReactTestRenderer | undefined, router: ReturnType<typeof createMemoryRouter> | undefined;
  try {
    const [{ default: Guard }, { default: Page }] = await Promise.all([
      vite.ssrLoadModule("/src/app/DraftNavigationProvider.tsx"), vite.ssrLoadModule("/src/pages/BrandIndexAssessment.tsx"),
    ]);
    function Pages() { return h(Routes, null,
      h(Route, { path: "/brand-index/assessment", element: h(Page) }),
      h(Route, { path: "*", element: h("main", null, "Another page") })); }
    const root = () => renderer!.root;
    const field = () => root().findByProps({ id: "brand-index-name" });
    const dialog = () => root().findAll(node => node.props["data-draft-dialog"] === true);
    const click = async (label: string) => { const button = root().findAllByType("button").find(node => text(node) === label); assert.ok(button, label); await act(async () => { button.props.onClick(); await pause(); }); };
    const navigate = async (to: string | number) => act(async () => { void router!.navigate(to as string); await pause(); });
    const edit = async () => act(async () => field().props.onChange({ target: { value: "Private local worksheet" } }));
    const setOwner = async (id: string | null) => act(async () => {
      fixture.auth = { user: id ? { id } : null }; for (const notify of notifications) notify(); await pause();
    });
    const mount = async () => {
      if (renderer) await act(async () => renderer!.unmount()); router?.dispose(); fixture.auth = { user: null }; fixture.language = "en";
      router = createMemoryRouter([{ path: "*", element: h(Guard, null, h(Pages)) }], { initialEntries: ["/", "/brand-index/assessment", "/name-packages"], initialIndex: 1 });
      await act(async () => { renderer = create(h(RouterProvider, { router: router! })); await pause(); });
    };
    await t.test("pristine guests navigate freely; local edits block pushes and cancellation retains work", async () => {
      await mount(); assert.equal(beforeUnload.size, 0); await navigate("/"); assert.equal(dialog().length, 0);
      await navigate("/brand-index/assessment"); await edit(); assert.equal(beforeUnload.size, 1);
      await navigate("/name-packages"); assert.equal(router!.state.location.pathname, "/brand-index/assessment"); assert.equal(dialog().length, 1);
      assert.ok(text(root()).includes(brandWorksheetCopy.en.leaveTitle)); assert.ok(text(root()).includes(brandWorksheetCopy.en.leaveBody));
      assert.ok(!text(root()).includes(tradingPortalCopy.en.leaveDraftTitle));
      await click(tradingPortalCopy.en.keepEditing); assert.equal(field().props.value, "Private local worksheet"); assert.equal(dialog().length, 0);
      await navigate("/"); await act(async () => dialog()[0].props.onOpenChange(false));
      assert.equal(field().props.value, "Private local worksheet"); assert.equal(beforeUnload.size, 1);
    });
    await t.test("Back, Forward and explicit leave have coherent local-loss semantics", async () => {
      await mount(); await edit(); await navigate(-1); assert.equal(dialog().length, 1);
      await click(tradingPortalCopy.en.keepEditing); await navigate(1); assert.equal(dialog().length, 1);
      await click(tradingPortalCopy.en.keepEditing); await navigate(-1); await click(tradingPortalCopy.en.leaveWithoutSaving);
      assert.equal(router!.state.location.pathname, "/"); assert.equal(beforeUnload.size, 0);
      await navigate(1); assert.equal(field().props.value, ""); assert.equal(dialog().length, 0);
    });
    await t.test("query/hash and languages preserve work; session replacement clears it without replaying a navigation", async () => {
      await mount(); await edit(); await navigate("/brand-index/assessment?view=scope#brand-index-title");
      assert.equal(dialog().length, 0); assert.equal(field().props.value, "Private local worksheet");
      for (const language of ["sv", "es", "fr", "zh"] as const) {
        fixture.language = language; await navigate("/");
        assert.ok(text(root()).includes(brandWorksheetCopy[language].leaveBody)); await click(tradingPortalCopy[language].keepEditing);
        assert.equal(field().props.value, "Private local worksheet");
      }
      await navigate("/"); assert.equal(dialog().length, 1); await setOwner("account-a");
      assert.equal(dialog().length, 0); assert.equal(field().props.value, ""); assert.equal(beforeUnload.size, 0);
      assert.equal(router!.state.location.pathname, "/brand-index/assessment");
      await edit(); await setOwner("account-b"); assert.equal(field().props.value, ""); assert.equal(beforeUnload.size, 0);
      await edit(); await setOwner(null); assert.equal(field().props.value, ""); assert.equal(beforeUnload.size, 0);
      await navigate("/auth"); assert.equal(router!.state.location.pathname, "/auth"); assert.equal(dialog().length, 0);
    });
  } finally {
    if (renderer) await act(async () => renderer!.unmount()); router?.dispose(); await vite.close(); globalThis.fetch = originalFetch;
    for (const [name, descriptor] of originals) if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name);
  }
});
