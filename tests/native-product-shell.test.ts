import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createElement as h, Suspense } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { createServer } from "vite";
import { nativeCopy } from "../src/app/nativeCopy";
import { accountAccessCopy } from "../src/i18n/accountAccessCopy";

const label = (node: ReactTestInstance): string => node.children.map(child => typeof child === "string" ? child : label(child)).join("");

test("native product routes, navigation, sign-in and payment boundaries", async t => {
  const key = "__SAJDA_NATIVE_SHELL_TEST__";
  const originals = new Map([key, "window"].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const originalFetch = globalThis.fetch;
  const fixture = {
    user: { id: "native-account" } as { id: string } | null, language: "sv", loading: false,
    membership: { plan: "trading", accessSource: "operator", expiresAt: null, capabilities: { save_domains: true, swipe_undo: true, trading: true } },
    signIns: 0, reads: 0, payments: 0, signInError: null as Error | null,
    async signInNative() { fixture.signIns++; return { error: fixture.signInError }; },
  };
  Object.defineProperty(globalThis, key, { configurable: true, value: fixture });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { pathname: "/" }, setTimeout, clearTimeout } });
  globalThis.fetch = async () => { throw new Error("Product shell checks must not call live services"); };
  const vite = await createServer({ configFile: false, appType: "custom",
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" },
    plugins: [{ name: "native-shell-test-boundaries", enforce: "pre",
      resolveId(source) { if (source === "@/lib/nativeTransport") return path.resolve("src/lib/nativeTransport.ts"); },
      load(id) {
        const name = id.replaceAll("\\", "/");
        if (name.endsWith("/src/contexts/AuthContext.tsx")) return `export const useAuth=()=>globalThis.${key};`;
        if (name.endsWith("/src/contexts/MembershipContext.tsx")) return `export const useMembership=()=>({membership:globalThis.${key}.membership,loading:false,error:null,refresh:async()=>{}});`;
        if (name.endsWith("/src/i18n/LanguageProvider.tsx")) return `export const useLanguage=()=>({language:globalThis.${key}.language});`;
        if (name.endsWith("/src/lib/appSurface.ts")) return "export const isNativeApp=true;";
        if (name.endsWith("/src/lib/nativeTransport.ts")) return "export let nativeAvailable=false; export const setAvailable=(value)=>{nativeAvailable=value;};";
        if (name.endsWith("/src/lib/anonymousSearchMode.ts")) return "export const isAnonymousSearchMode=()=>true;";
        if (name.endsWith("/src/integrations/supabase/client.ts")) return "export const hasSupabaseBrowserConfig=false;";
        if (name.endsWith("/src/lib/plusBilling.ts")) return `export class PlusBillingError extends Error{}; export const getPlusBilling=async()=>{globalThis.${key}.reads++;throw new Error('Unexpected billing fetch');}; export const openPlusBilling=async()=>{globalThis.${key}.payments++;throw new Error('Unexpected payment');};`;
        // Route tests verify the real guards and routing while isolating costly
        // page engines. Navigation must never start a search or Trading job.
        if (/\/src\/pages\/[^/]+\.tsx$/u.test(name)) {
          const page = name.split("/").at(-1)!.replace(".tsx", "");
          return `import{createElement as h}from'react';export default function Page(){return h('main',{'data-product-page':${JSON.stringify(page)}});}`;
        }
      },
    }],
  });
  let renderer: ReactTestRenderer | undefined;
  const mount = async (component: ReturnType<typeof h>, route = "/") => {
    if (renderer) await act(async () => renderer!.unmount());
    await act(async () => { renderer = create(h(MemoryRouter, { initialEntries: [route] }, component)); });
  };
  try {
    const { default: Navigation } = await vite.ssrLoadModule("/src/app/NativeNavigation.tsx");
    const { default: More } = await vite.ssrLoadModule("/src/app/NativeMore.tsx");
    const { default: ProductRoutes } = await vite.ssrLoadModule("/src/app/ProductRoutes.tsx");
    const { default: PlusBilling } = await vite.ssrLoadModule("/src/components/PlusBilling.tsx");
    const { default: NativeAuth } = await vite.ssrLoadModule("/src/app/NativeAuth.tsx");
    const transport = await vite.ssrLoadModule("/src/lib/nativeTransport.ts");
    const { getLostDomainsCopy } = await vite.ssrLoadModule("/src/i18n/lostDomainsCopy.ts");

    await t.test("five persistent destinations and operational tools remain accessible while signed out", async () => {
      fixture.user = null;
      await mount(h(Navigation), "/swipe");
      const links = renderer!.root.findAllByType("a");
      assert.deepEqual(links.map(link => link.props.href), ["/", "/swipe", "/watchlist", "/plus", "/account"]);
      assert.deepEqual(links.map(label), ["Sök", "Swipe", "Sparat", "Trading", "Konto"]);
      assert.equal(links[2].props["aria-label"], "Sparade domäner");
      assert.equal(links[1].props["aria-current"], "page");
      for (const link of links) {
        assert.ok(link.props["aria-label"]);
        assert.match(link.props.className, /focus-visible:ring-2/);
        assert.match(link.props.className, /min-h-11/);
      }
      await mount(h(More), "/more");
      const destinations = renderer!.root.findAllByType("a").map(link => link.props.href);
      for (const route of ["/marketplace", "/developers", "/pricing", "/help", "/contact", "/legal#privacy", "/legal#terms", "/security", "/status"]) assert.ok(destinations.includes(route), route);
      for (const unsupported of ["/history", "/my-domains", "/top-10-today"]) assert.equal(destinations.includes(unsupported), false, `Do not advertise unavailable legacy feature ${unsupported}`);
      assert.equal(destinations.some(route => /^\/(story|se|install)(\/|$)/u.test(route)), false);
    });

    await t.test("native sign-in and compact navigation remain localized in all five languages", async () => {
      fixture.user = null; transport.setAvailable(false);
      for (const language of ["en", "sv", "es", "fr", "zh"] as const) {
        fixture.language = language;
        await mount(h(NativeAuth), "/auth");
        assert.ok(label(renderer!.root).includes(accountAccessCopy[language].appAuth.body));
        assert.equal(label(renderer!.root.findByProps({ role: "note" })), accountAccessCopy[language].appAuth.preview);
        assert.equal(label(renderer!.root.findByType("button")), nativeCopy[language].signIn);
        assert.equal(renderer!.root.findByType("button").props.disabled, true);
        await mount(h(Navigation), "/watchlist");
        const saved = renderer!.root.findAllByType("a").find(link => link.props.href === "/watchlist")!;
        assert.equal(label(saved), nativeCopy[language].savedShort);
        assert.equal(saved.props["aria-label"], nativeCopy[language].saved);
        assert.doesNotMatch(saved.findByType("span").props.className, /truncate/u);
      }
      assert.equal(fixture.signIns, 0);
      fixture.language = "sv";
    });

    await t.test("shared routes preserve pages and honestly gate unavailable account storage", async () => {
      fixture.user = { id: "native-account" };
      const routes = h(Suspense, { fallback: h("p", null, "Loading") }, h(ProductRoutes, { authElement: h("main", { "data-product-page": "NativeAuth" }) },
        h(Route, { path: "/pricing", element: h("main", { "data-product-page": "NativeMembership" }) })));
      for (const [route, expected] of Object.entries({ "/": "Index", "/swipe": "Swipe", "/watchlist": "Watchlist", "/plus": "LostDomains", "/account": "Account", "/developers": "Developers", "/marketplace": "Marketplace", "/marketplace/a-domain": "MarketplaceListing", "/legal": "Legal", "/security": "Security", "/status": "Status", "/contact": "Contact", "/admin": "Admin", "/pricing": "NativeMembership", "/auth": "NativeAuth", "/my-domains": "AccountFeatureUnavailable", "/history": "AccountFeatureUnavailable", "/top-10-today": "AccountFeatureUnavailable", "/se/sok-doman": "NotFound", "/story": "NotFound", "/install": "NotFound" })) {
        await mount(routes, route);
        for (let attempt = 0; attempt < 100 && !renderer!.root.findAllByType("main").length; attempt++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
        assert.equal(renderer!.root.findByType("main").props["data-product-page"], expected, route);
      }
      fixture.user = null;
      await mount(routes, "/watchlist");
      assert.equal(renderer!.root.findByType("main").props["data-product-page"], "NativeAuth");
    });

    await t.test("Trading shows confirmed membership but cannot read or open web billing", async () => {
      fixture.user = { id: "native-account" };
      await mount(h(PlusBilling, { accountId: fixture.user.id, language: "sv", fallback: getLostDomainsCopy("sv") }), "/plus?billing=success");
      assert.equal(renderer!.root.findByProps({ "data-current-plan": "trading" }).children[0], "Trading");
      assert.ok(label(renderer!.root).includes(nativeCopy.sv.checkoutTitle));
      assert.equal(fixture.reads, 0);
      assert.equal(fixture.payments, 0);
      assert.equal(renderer!.root.findAllByType("button").some(button => /Prenumerera|Prova testbetalning|Hantera prenumeration/u.test(label(button))), false);
      assert.equal(renderer!.root.findAllByType("a").some(link => /stripe\.com/u.test(link.props.href)), false);
    });

    await t.test("browser preview cannot claim an OS sign-in; cancellation remains retryable", async () => {
      fixture.user = null;
      transport.setAvailable(false);
      await mount(h(NativeAuth), "/auth?next=%2Fwatchlist");
      assert.equal(renderer!.root.findByType("button").props.disabled, true);
      assert.ok(label(renderer!.root).includes(accountAccessCopy.sv.appAuth.preview));
      assert.equal(fixture.signIns, 0);
      assert.equal(renderer!.root.findAllByType("input").length, 0);
      transport.setAvailable(true);
      fixture.signInError = new Error("cancelled");
      await mount(h(NativeAuth), "/auth?next=%2Fwatchlist");
      await act(async () => { await renderer!.root.findByType("button").props.onClick(); });
      assert.equal(fixture.signIns, 1);
      assert.equal(renderer!.root.findByType("button").props.disabled, false);
      assert.match(label(renderer!.root.findByProps({ role: "alert" })), /Inloggningen slutfördes inte/u);
    });

    await t.test("only a confirmed account redirects and an unsafe next stays inside the app", async () => {
      fixture.user = { id: "native-account" }; fixture.signInError = null;
      function LocationProbe() { const location = useLocation(); return h("output", null, `${location.pathname}${location.search}`); }
      for (const [requested, expected] of [["/watchlist", "/watchlist"], ["//attacker.invalid", "/"], ["/auth?next=%2Fauth", "/account"]]) {
        await mount(h(Routes, null, h(Route, { path: "/auth", element: h(NativeAuth) }), h(Route, { path: "*", element: h(LocationProbe) })), `/auth?next=${encodeURIComponent(requested)}`);
        assert.equal(label(renderer!.root.findByType("output")), expected);
      }
    });
  } finally {
    if (renderer) await act(async () => renderer!.unmount());
    await vite.close();
    globalThis.fetch = originalFetch;
    for (const [name, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name); }
  }
});

test("shared support, legal, security and status pages leave native chrome to the app shell", async () => {
  const key = "__SAJDA_NATIVE_PUBLIC_PAGE_TEST__";
  const original = Object.getOwnPropertyDescriptor(globalThis, key);
  const originalFetch = globalThis.fetch;
  const fixture = { language: "en" };
  Object.defineProperty(globalThis, key, { configurable: true, value: fixture });
  globalThis.fetch = async () => { throw new Error("Public page render must not submit forms or call services"); };
  const vite = await createServer({ configFile: false, appType: "custom",
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" },
    ssr: { noExternal: ["react-router-dom"] },
    plugins: [{ name: "native-public-page-test-boundaries", enforce: "pre",
      resolveId(source) { if (source === "react-router-dom") return "\0native-public-page-links"; },
      load(id) {
      if (id === "\0native-public-page-links") return "import{createElement as h,forwardRef}from'react';export const Link=forwardRef(({to,children,...props},ref)=>h('a',{...props,href:to,ref},children));";
      const name = id.replaceAll("\\", "/");
      if (name.endsWith("/src/lib/appSurface.ts")) return "export let isNativeApp=false;export const setNative=value=>{isNativeApp=value;};";
      if (name.endsWith("/src/i18n/LanguageProvider.tsx")) return `export const useLanguage=()=>globalThis.${key};export const applyDocumentMetadata=()=>{};`;
      if (name.endsWith("/src/components/LanguageSwitcher.tsx")) return "import{createElement as h}from'react';export default()=>h('div',{'data-web-language-switcher':true},'Web languages');";
    } }],
  });
  try {
    const surface = await vite.ssrLoadModule("/src/lib/appSurface.ts");
    for (const page of ["Contact", "Legal", "Security", "Status"]) {
      const { default: Page } = await vite.ssrLoadModule(`/src/pages/${page}.tsx`);
      for (const language of ["en", "sv", "es", "fr", "zh"]) {
        fixture.language = language;
        const render = () => renderToStaticMarkup(h(Page));
        surface.setNative(false); const web = render();
        assert.equal((web.match(/<header\b/gu) ?? []).length, 1, `${page}/${language}: retain website header`);
        assert.match(web, /data-web-language-switcher/u);
        surface.setNative(true); const native = render();
        assert.doesNotMatch(native, /<header\b|data-web-language-switcher/u, `${page}/${language}: no duplicate app header`);
        assert.equal((native.match(/<h1\b/gu) ?? []).length, 1, `${page}/${language}: retain screen title`);
        assert.equal(native.match(/<h1\b[^>]*>(.*?)<\/h1>/su)?.[1], web.match(/<h1\b[^>]*>(.*?)<\/h1>/su)?.[1]);
        if (page === "Contact") { assert.match(native, /<form\b/u); assert.match(native, /id="contact-message"/u); }
        if (page === "Legal") for (const anchor of ["privacy", "terms", "cookies", "accessibility"]) assert.ok(native.includes(`id="${anchor}"`), anchor);
      }
    }
  } finally {
    await vite.close(); globalThis.fetch = originalFetch;
    if (original) Object.defineProperty(globalThis, key, original); else Reflect.deleteProperty(globalThis, key);
  }
});
