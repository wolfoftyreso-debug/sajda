import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createElement as h } from "react";
import { MemoryRouter } from "react-router-dom";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { createServer } from "vite";
import { nativeCommerceCopy } from "../src/i18n/nativeCommerceCopy";
import { nativeCopy } from "../src/app/nativeCopy";
import type { Language } from "../src/i18n/languagePreference";

const text = (node: ReactTestInstance): string => node.children.map(child => typeof child === "string" ? child : text(child)).join("");

test("native Trading is a Pro add-on with one Apple bundle and an account entry", async t => {
  const key = "__SAJDA_NATIVE_TRADING_ADDON_TEST__";
  const original = Object.getOwnPropertyDescriptor(globalThis, key);
  const originalFetch = globalThis.fetch;
  const fixture = {
    language: "en" as Language,
    purchases: [] as Array<{ accountId: string; productId: string }>,
    catalog: (accountId: string) => ({ accountId, enabled: true, purchasesEnabled: true, products: [
      { id: "com.hypbit.sajda.premium", name: "Sajda Premium", price: "29,99 €", plan: "premium" },
      { id: "com.hypbit.sajda.trading", name: "Sajda Trading", price: "59,99 €", plan: "trading" },
    ] }),
  };
  Object.defineProperty(globalThis, key, { configurable: true, value: fixture });
  globalThis.fetch = async () => { throw new Error("Native Trading UI must not call live billing or providers"); };
  const vite = await createServer({ configFile: false, appType: "custom",
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" },
    plugins: [{ name: "native-trading-addon-boundaries", enforce: "pre", load(id) {
      const name = id.replaceAll("\\", "/");
      if (name.endsWith("/src/i18n/LanguageProvider.tsx")) return `export const useLanguage=()=>({language:globalThis.${key}.language});`;
      if (name.endsWith("/src/contexts/AuthContext.tsx")) return "export const useAuth=()=>({user:null});";
      if (name.endsWith("/src/lib/nameProjectsFeature.ts")) return "export let nameProjectsEnabled=false; export const setEnabled=value=>{nameProjectsEnabled=value;};";
      if (name.endsWith("/src/lib/nativeTransport.ts")) return `export const nativeAvailable=true;
        export const nativeCommerceCatalog=async(accountId)=>globalThis.${key}.catalog(accountId);
        export const nativeCommercePurchase=async(accountId,productId)=>{globalThis.${key}.purchases.push({accountId,productId});return 'pending';};
        export const nativeCommerceRestore=async()=> 'no_active'; export const nativeCommerceManage=async()=>{};`;
    } }],
  });
  let renderer: ReactTestRenderer | undefined;
  const mount = async (component: ReturnType<typeof h>, route = "/pricing") => {
    if (renderer) await act(async () => renderer!.unmount());
    await act(async () => { renderer = create(h(MemoryRouter, { initialEntries: [route] }, component)); });
  };
  try {
    const { default: Commerce } = await vite.ssrLoadModule("/src/components/NativeCommercePanel.tsx");
    const { default: Navigation } = await vite.ssrLoadModule("/src/app/NativeNavigation.tsx");
    const { default: More } = await vite.ssrLoadModule("/src/app/NativeMore.tsx");
    const feature = await vite.ssrLoadModule("/src/lib/nameProjectsFeature.ts");
    for (const language of ["en", "sv", "es", "fr", "zh"] as Language[]) {
      await t.test(`${language}: public titles and bundle terms precede the exact native purchase`, async () => {
        fixture.language = language;
        await mount(h(Commerce, { accountId: "native-owner", onChanged: async () => {} }));
        const root = renderer!.root;
        const copy = nativeCommerceCopy(language);
        const pro = root.findByProps({ "data-native-plan": "premium" });
        const bundle = root.findByProps({ "data-native-product-kind": "bundle" });
        assert.equal(pro.findByType("h3").children[0], "Pro");
        assert.equal(pro.props["data-native-product-kind"], "base-plan");
        assert.equal(bundle.findByType("h3").children[0], "Pro + Trading");
        assert.ok(text(root.findByProps({ "aria-labelledby": "native-trading-addon-heading" })).includes(copy.tradingEligibility));
        assert.ok(text(bundle).includes(copy.tradingBundleScope));
        assert.ok(text(bundle).includes(copy.tradingBundlePrice));
        assert.ok(text(bundle).includes("59,99 €"));
        assert.equal(text(root).includes("Sajda Premium"), false);
        assert.equal(text(root).includes("Sajda Trading"), false);
        const action = bundle.findByType("button");
        assert.equal(text(action), copy.tradingSubscribe);
        await act(async () => action.props.onClick());
        assert.deepEqual(fixture.purchases.at(-1), { accountId: "native-owner", productId: "com.hypbit.sajda.trading" });
        assert.ok(text(renderer!.root).includes(copy.pending));
      });
      await t.test(`${language}: Trading links to account and only one tab is selected`, async () => {
        await mount(h(Navigation), "/account#trading");
        const links = renderer!.root.findAllByType("a");
        const trading = links.find(link => link.props.href === "/account#trading")!;
        assert.equal(trading.props["aria-label"], nativeCopy[language].tradingAddon);
        assert.equal(trading.props["aria-current"], "page");
        assert.equal(links.filter(link => link.props["aria-current"] === "page").length, 1);
        assert.equal(links.some(link => link.props.href === "/plus"), false);
        await mount(h(More), "/more");
        const moreLinks = renderer!.root.findAllByType("a");
        assert.equal(text(moreLinks.find(link => link.props.href === "/account#trading")!), nativeCopy[language].tradingAddon);
        assert.equal(moreLinks.some(link => link.props.href === "/plus"), false);
      });
    }
    await t.test("with Projects in the tab bar, Account owns the Trading section", async () => {
      feature.setEnabled(true);
      await mount(h(Navigation), "/account#trading");
      const selected = renderer!.root.findAllByType("a").filter(link => link.props["aria-current"] === "page");
      assert.equal(selected.length, 1);
      assert.equal(selected[0].props.href, "/account");
    });
  } finally {
    if (renderer) await act(async () => renderer!.unmount());
    await vite.close();
    globalThis.fetch = originalFetch;
    if (original) Object.defineProperty(globalThis, key, original); else Reflect.deleteProperty(globalThis, key);
  }
});
