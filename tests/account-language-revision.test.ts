import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createElement as h } from "react";
import { MemoryRouter } from "react-router-dom";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { createServer } from "vite";
import { accountAccessCopy } from "../src/i18n/accountAccessCopy";
import { accountNavigationCopy } from "../src/i18n/accountNavigationCopy";
import { appSessionsCopy } from "../src/i18n/appSessionsCopy";
import { getMembershipCopy } from "../src/i18n/membershipCopy";
import { getPlusBillingCopy } from "../src/i18n/plusBillingCopy";
import { getPricingCopy } from "../src/i18n/pricingCopy";
import { savedDomainsCopy } from "../src/i18n/savedDomainsCopy";
import { swipeAccountSaveCopy } from "../src/i18n/swipeAccountSaveCopy";
import { swipePremiumCopy } from "../src/i18n/swipePremiumCopy";
import { nativeCopy } from "../src/app/nativeCopy";

const languages = ["en", "sv", "es", "fr", "zh"] as const;
const savedLabels = ["Saved domains", "Sparade domäner", "Dominios guardados", "Domaines enregistrés", "已保存的域名"];
function leaves(value: unknown, prefix = ""): Record<string, string> {
  if (typeof value === "string") return { [prefix]: value };
  assert.ok(value !== null && typeof value === "object", `Non-copy value at ${prefix}`);
  return Object.fromEntries(Object.entries(value).flatMap(([key, child]) => Object.entries(leaves(child, `${prefix}.${key}`))));
}

test("account, pricing and native language catalogs preserve English structure and interpolation in all five languages", () => {
  const catalogs = [accountAccessCopy, accountNavigationCopy, appSessionsCopy, savedDomainsCopy, swipeAccountSaveCopy, swipePremiumCopy, nativeCopy,
    Object.fromEntries(languages.map(language => [language, getPricingCopy(language)])),
    Object.fromEntries(languages.map(language => [language, getMembershipCopy(language)])),
    Object.fromEntries(languages.map(language => [language, getPlusBillingCopy(language)])),
  ];
  for (const catalog of catalogs) {
    const translated = catalog as Record<string, unknown>;
    const english = leaves(translated.en);
    for (const language of languages) {
      const strings = leaves(translated[language]);
      assert.deepEqual(Object.keys(strings).sort(), Object.keys(english).sort(), language);
      for (const [key, value] of Object.entries(strings)) {
        assert.ok(value.trim().length > 0, `${language}${key}`);
        assert.deepEqual(value.match(/\{\w+\}/gu) ?? [], english[key].match(/\{\w+\}/gu) ?? [], `${language}${key}`);
      }
    }
  }
  for (const [index, language] of languages.entries()) {
    assert.equal(savedDomainsCopy[language].title, savedLabels[index]);
    assert.equal(getMembershipCopy(language).saved, savedLabels[index]);
    assert.equal(nativeCopy[language].saved, savedLabels[index]);
    assert.equal(nativeCopy[language].swipe, "Swipe");
    assert.equal(getPricingCopy(language).plans.trading.name, "Trading");
    assert.equal(getPricingCopy(language).plans.premium.name, "Premium");
  }
  for (const language of ["sv", "es", "fr", "zh"] as const) {
    for (const key of ["helpIntro", "swipeHelp", "tradingHelp", "history", "today"] as const) assert.notEqual(nativeCopy[language][key], nativeCopy.en[key]);
    assert.notEqual(accountAccessCopy[language].verification.resend, accountAccessCopy.en.verification.resend);
    assert.notEqual(getPlusBillingCopy(language).returnPending, getPlusBillingCopy("en").returnPending);
    assert.notEqual(getPricingCopy(language).monitoring, getPricingCopy("en").monitoring);
  }
  assert.deepEqual(getPricingCopy("unknown"), getPricingCopy("en"));
  assert.deepEqual(getPlusBillingCopy("unknown"), getPlusBillingCopy("en"));
  assert.deepEqual(getMembershipCopy("unknown"), getMembershipCopy("en"));
});

const label = (node: ReactTestInstance): string => node.children.map(child => typeof child === "string" ? child : label(child)).join("");

test("native consent and protected-route status use the chosen language without authorizing on render", async t => {
  const fixtureKey = "__SAJDA_ACCOUNT_LANGUAGE_TEST__";
  const previous = Object.getOwnPropertyDescriptor(globalThis, fixtureKey);
  const previousFetch = globalThis.fetch;
  const fixture = { language: "en", user: null as { id: string; email: string } | null, loading: false };
  Object.defineProperty(globalThis, fixtureKey, { configurable: true, value: fixture });
  globalThis.fetch = async () => { throw new Error("Rendering consent must not contact a provider or authorize an app"); };
  const vite = await createServer({ configFile: false, appType: "custom",
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" },
    plugins: [{ name: "account-language-fixture", enforce: "pre", load(id) {
      const file = id.replaceAll("\\", "/");
      if (file.endsWith("/src/i18n/LanguageProvider.tsx")) return `export const useLanguage=()=>globalThis.${fixtureKey};`;
      if (file.endsWith("/src/contexts/AuthContext.tsx")) return `export const useAuth=()=>globalThis.${fixtureKey};`;
      if (file.endsWith("/src/lib/anonymousSearchMode.ts")) return "export const isAnonymousSearchMode=()=>false;";
    } }],
  });
  let renderer: ReactTestRenderer | undefined;
  const route = `/native/connect?challenge=${"a".repeat(43)}&state=${"b".repeat(43)}`;
  const mount = async (component: ReturnType<typeof h>, entry = route) => {
    if (renderer) await act(async () => renderer!.unmount());
    await act(async () => { renderer = create(h(MemoryRouter, { initialEntries: [entry], future: { v7_startTransition: true, v7_relativeSplatPath: true } }, component)); });
  };
  try {
    const { default: NativeConnect } = await vite.ssrLoadModule("/src/pages/NativeConnect.tsx");
    const { default: ProtectedRoute } = await vite.ssrLoadModule("/src/components/ProtectedRoute.tsx");
    for (const language of languages) await t.test(`${language}: consent, recovery, sign-in action and loading status`, async () => {
      fixture.language = language; fixture.loading = false; fixture.user = null;
      const copy = accountAccessCopy[language];
      await mount(h(NativeConnect));
      assert.equal(label(renderer!.root.findByType("h1")), copy.native.title);
      assert.ok(label(renderer!.root).includes(copy.native.permission));
      const signIn = renderer!.root.findAllByType("a").find(link => link.props.href.startsWith("/auth?"));
      assert.ok(signIn);
      assert.equal(label(signIn), copy.native.signIn);
      assert.equal(renderer!.root.findAllByType("button").length, 0);
      await mount(h(NativeConnect), "/native/connect");
      assert.equal(label(renderer!.root.findByProps({ role: "alert" })), copy.native.invalid);
      fixture.user = { id: "language-fixture", email: "reader@example.invalid" };
      await mount(h(NativeConnect));
      assert.equal(label(renderer!.root.findByType("button")), copy.native.connect);
      fixture.loading = true;
      await mount(h(ProtectedRoute, null, h("p", null, "Private content")), "/account");
      assert.equal(label(renderer!.root.findByProps({ role: "status" })), copy.checking);
    });
  } finally {
    if (renderer) await act(async () => renderer!.unmount());
    await vite.close();
    globalThis.fetch = previousFetch;
    if (previous) Object.defineProperty(globalThis, fixtureKey, previous); else Reflect.deleteProperty(globalThis, fixtureKey);
  }
});
