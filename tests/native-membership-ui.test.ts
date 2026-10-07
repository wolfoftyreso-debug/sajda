import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createElement as h } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { createServer } from "vite";
import { nativeCommerceCopy, nativePlanFeatures } from "../src/i18n/nativeCommerceCopy";
import { getMembershipCopy } from "../src/i18n/membershipCopy";
import type { Language } from "../src/i18n/languagePreference";

const text = (node: ReactTestInstance): string => node.children.map(child => typeof child === "string" ? child : text(child)).join("");

test("native account → plan comparison → subscribe/restore uses App Store controls without a pricing self-loop", async t => {
  const key = "__SAJDA_NATIVE_MEMBERSHIP_UI_TEST__";
  const original = Object.getOwnPropertyDescriptor(globalThis, key);
  const originalFetch = globalThis.fetch;
  const fixture = {
    user: { id: "synthetic-native-owner" } as { id: string } | null, language: "en" as Language,
    loading: false, enabled: true, purchasesEnabled: true, catalogCalls: 0, refreshes: 0,
    purchases: [] as Array<{ owner: string; id: string }>, restores: [] as string[], native: true,
    membership: { plan: "free", accessSource: "free", expiresAt: null,
      capabilities: { save_domains: true, swipe_undo: false, trading: false } },
    products: [
      { id: "com.hypbit.sajda.basic", name: "Sajda Basic", price: "11,99 €", plan: "basic" },
      { id: "com.hypbit.sajda.premium", name: "Sajda Premium", price: "29,99 €", plan: "premium" },
      { id: "com.hypbit.sajda.trading", name: "Sajda Trading", price: "59,99 €", plan: "trading" },
    ],
  };
  Object.defineProperty(globalThis, key, { configurable: true, value: fixture });
  globalThis.fetch = async () => { throw new Error("Native membership must not call Stripe or live providers"); };
  const vite = await createServer({ configFile: false, appType: "custom",
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" },
    plugins: [{ name: "native-membership-ui-boundaries", enforce: "pre", load(id) {
      const normalized = id.replaceAll("\\", "/");
      if (normalized.endsWith("/src/contexts/AuthContext.tsx")) return `export const useAuth=()=>globalThis.${key};`;
      if (normalized.endsWith("/src/contexts/MembershipContext.tsx")) return `export const useMembership=()=>({membership:globalThis.${key}.membership,loading:false,error:null,refresh:async()=>{globalThis.${key}.refreshes++;}});`;
      if (normalized.endsWith("/src/i18n/LanguageProvider.tsx")) return `export const useLanguage=()=>({language:globalThis.${key}.language});`;
      if (normalized.endsWith("/src/lib/appSurface.ts")) return "export const isNativeApp=true;";
      if (normalized.endsWith("/src/lib/nativeTransport.ts")) return `export let nativeAvailable=true;
        export const nativeCommerceCatalog=async(owner)=>{const f=globalThis.${key};f.catalogCalls++;return {accountId:owner,enabled:f.enabled,purchasesEnabled:f.purchasesEnabled,products:f.enabled?f.products:[]};};
        export const nativeCommercePurchase=async(owner,id)=>{globalThis.${key}.purchases.push({owner,id});return 'pending';};
        export const nativeCommerceRestore=async(owner)=>{globalThis.${key}.restores.push(owner);return 'no_active';};
        export const nativeCommerceManage=async()=>{};`;
    } }],
  });
  let renderer: ReactTestRenderer | undefined;
  try {
    const { default: Membership } = await vite.ssrLoadModule("/src/app/NativeMembership.tsx");
    const { default: AccountPanel } = await vite.ssrLoadModule("/src/components/AccountMembershipPanel.tsx");
    async function mount(route = "/pricing") {
      if (renderer) await act(async () => renderer!.unmount());
      await act(async () => { renderer = create(h(MemoryRouter, { initialEntries: [route] },
        h(Routes, null, h(Route, { path: "/account", element: h(AccountPanel) }),
          h(Route, { path: "/pricing", element: h(Membership) }),
          h(Route, { path: "/auth", element: h("main", { "data-auth": true }) })))); });
    }
    const root = () => renderer!.root;
    const button = (label: string) => root().findAllByType("button").find(node => text(node) === label)!;

    await t.test("account entry navigates to real plan controls and cannot link back to itself", async () => {
      await mount("/account");
      assert.equal(fixture.catalogCalls, 0);
      const compare = root().findAllByType("a").find(node => node.props.href === "/pricing")!;
      assert.ok(compare);
      await act(async () => compare.props.onClick({ button: 0, defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; } }));
      assert.ok(root().findAllByType("article").length === 3);
      assert.equal(root().findAllByType("a").some(node => node.props.href === "/pricing"), false);
      assert.equal(fixture.catalogCalls, 1);
      assert.equal(fixture.purchases.length, 0);
      assert.equal(fixture.restores.length, 0);
      assert.equal(root().findAllByType("a").some(node => /stripe\.com|checkout|billing\/portal/u.test(node.props.href)), false);
    });

    for (const language of ["en", "sv", "es", "fr", "zh"] as Language[]) {
      await t.test(`${language}: each tier describes released benefits and limits before purchase`, async () => {
        fixture.language = language; await mount();
        const copy = nativeCommerceCopy(language);
        const plans = root().findAllByType("article");
        assert.equal(plans.length, 3);
        for (const plan of plans) {
          const id = plan.props["data-native-plan"] as "basic" | "premium" | "trading";
          for (const feature of nativePlanFeatures(id, language)) assert.ok(text(plan).includes(feature));
          assert.ok(text(plan).includes(copy.releasedFeatures));
          const subscribe = plan.findByType("button");
          assert.ok(subscribe.props["aria-label"].includes(plan.findByType("h3").children[0]));
          assert.match(subscribe.props.className, /min-h-11/);
        }
        assert.ok(text(plans[0]).includes(copy.basicScope));
        assert.equal(text(plans[0]).includes(getMembershipCopy(language).undo), false);
        assert.ok(text(plans[1]).includes(getMembershipCopy(language).undo));
        assert.equal(text(plans[1]).includes(copy.research), false);
        assert.ok(text(plans[2]).includes(copy.research));
        assert.ok(text(plans[2]).includes("24")); assert.ok(text(plans[2]).includes("600")); assert.ok(text(plans[2]).includes("30"));
        assert.ok(text(plans[2]).includes(copy.researchLimit));
        assert.ok(text(root()).includes(copy.standardLimits));
        assert.ok(text(root()).includes("29,99 €"));
        assert.equal(text(root()).includes("USD 19"), false);
        assert.equal(root().findAllByType("a").some(node => node.props.href === "/pricing"), false);
      });
    }

    await t.test("subscribe forwards the exact Apple product and owner without granting pending access", async () => {
      fixture.language = "en"; await mount();
      const premium = root().findByProps({ "data-native-plan": "premium" });
      await act(async () => premium.findByType("button").props.onClick());
      assert.deepEqual(fixture.purchases, [{ owner: fixture.user!.id, id: "com.hypbit.sajda.premium" }]);
      assert.equal(fixture.refreshes, 0);
      assert.equal(fixture.membership.plan, "free");
      assert.ok(text(root()).includes(nativeCommerceCopy("en").pending));
      await act(async () => button(nativeCommerceCopy("en").restore).props.onClick());
      assert.deepEqual(fixture.restores, [fixture.user!.id]);
      assert.equal(fixture.refreshes, 1);
      assert.ok(text(root()).includes(nativeCommerceCopy("en").no_active));
      assert.equal(fixture.membership.plan, "free");
    });

    await t.test("paused new purchases keep meaningful comparison and restore available", async () => {
      fixture.purchasesEnabled = false; await mount();
      assert.equal(root().findAllByType("article").length, 3);
      for (const plan of root().findAllByType("article")) assert.equal(plan.findByType("button").props.disabled, true);
      assert.equal(button(nativeCommerceCopy("en").restore).props.disabled, false);
      assert.ok(text(root()).includes(nativeCommerceCopy("en").paused));
    });

    await t.test("disabled commerce and signed-out entry never expose purchasing controls", async () => {
      fixture.enabled = false; await mount();
      assert.ok(text(root()).includes(nativeCommerceCopy("en").unavailable));
      assert.equal(root().findAllByType("article").length, 0);
      assert.equal(button(nativeCommerceCopy("en").restore), undefined);
      const before = fixture.catalogCalls;
      fixture.user = null; await mount();
      assert.equal(fixture.catalogCalls, before);
      assert.equal(root().findAllByType("a").find(node => node.props.href === "/auth?next=%2Fpricing")?.children[0], "Sign in");
      assert.equal(root().findAllByType("button").length, 0);
    });
  } finally {
    if (renderer) await act(async () => renderer!.unmount());
    await vite.close(); globalThis.fetch = originalFetch;
    if (original) Object.defineProperty(globalThis, key, original); else Reflect.deleteProperty(globalThis, key);
  }
});
