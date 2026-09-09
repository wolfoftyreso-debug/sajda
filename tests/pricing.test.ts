import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createElement as h } from "react";
import { MemoryRouter } from "react-router-dom";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { createServer } from "vite";
import { PLAN_ORDER, PLANS, formatPlanMonthlyPrice } from "../shared/plans";
import { PLUS_PLAN } from "../shared/plus-plan";
import { getPricingCopy } from "../src/i18n/pricingCopy";

function label(node: ReactTestInstance): string {
  return node.children.map(child => typeof child === "string" ? child : label(child)).join("");
}

test("pricing describes four distinct levels without advertising unfinished monitoring as live", () => {
  assert.deepEqual(PLAN_ORDER, ["free", "basic", "premium", "trading"]);
  assert.equal(PLANS.trading.unitAmount, PLUS_PLAN.unitAmount);
  for (const language of ["sv", "en"]) {
    const copy = getPricingCopy(language);
    assert.equal(Object.keys(copy.plans).length, 4);
    assert.ok(copy.plans.trading.points.some(point => point.includes("Lost Domains")));
    assert.match(copy.notice, /aktiverar inte|does not activate/);
    assert.match(copy.monitoring, /inte aktiva idag|not active today/);
    assert.match(copy.current, /utan abonnemang|without a subscription/);
    assert.match(copy.risk, /inte en garanti|not a guarantee/);
    assert.match(copy.terms, /eventuell skatt och slutbelopp|applicable tax and the final total/);
    assert.doesNotMatch(JSON.stringify(copy), /unlimited|obegränsad|most popular|populärast/i);
  }
  for (const language of ["es", "fr", "zh"]) assert.deepEqual(getPricingCopy(language), getPricingCopy("en"));
});

test("mounted pricing presents the shared prices and only truthful navigation, without checkout effects", async t => {
  const originalFetch = globalThis.fetch;
  const fixtureKey = "__SAJDA_PRICING_TEST_LANGUAGE__";
  const originalFixture = Object.getOwnPropertyDescriptor(globalThis, fixtureKey);
  const setLanguage = (language: string) => Object.defineProperty(globalThis, fixtureKey, { configurable: true, value: language });
  setLanguage("sv");
  globalThis.fetch = async () => { throw new Error("Pricing must not create accounts, start payments or request private data"); };
  const vite = await createServer({ configFile: false, appType: "custom",
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" },
    plugins: [{ name: "pricing-test-language-boundary", enforce: "pre", load(id) {
      const normalized = id.replaceAll("\\", "/");
      if (normalized.endsWith("/src/i18n/LanguageProvider.tsx")) return `export const useLanguage=()=>({language:globalThis.${fixtureKey}}); export const applyDocumentMetadata=()=>{};`;
      if (normalized.endsWith("/src/components/LanguageSwitcher.tsx")) return "export default function LanguageSwitcher(){return null;}";
    } }],
  });
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { pathname: "/pricing" } } });
  let renderer: ReactTestRenderer | undefined;
  try {
    const { default: Pricing } = await vite.ssrLoadModule("/src/pages/Pricing.tsx");
    for (const language of ["sv", "en", "fr"]) {
      await t.test(`${language}: four prices, disabled Basic/Premium and no overflow-prone controls`, async () => {
        setLanguage(language);
        if (renderer) await act(async () => renderer!.unmount());
        await act(async () => { renderer = create(h(MemoryRouter, { initialEntries: ["/pricing"], future: { v7_startTransition: true, v7_relativeSplatPath: true } }, h(Pricing))); });
        const cards = renderer!.root.findAllByType("article");
        assert.equal(cards.length, 4);
        assert.equal(renderer!.root.findAllByType("h1").length, 1);
        for (const id of PLAN_ORDER) {
          const card = cards.find(card => card.props["data-plan"] === id)!;
          const price = card.findByProps({ "data-plan-price": id });
          assert.equal(label(price), formatPlanMonthlyPrice(id, language));
          if (id === "basic" || id === "premium") {
            const button = card.findByType("button");
            assert.equal(button.props.disabled, true);
            assert.equal(button.props.onClick, undefined);
            assert.equal(label(button), getPricingCopy(language).unavailable);
            assert.match(button.props.className, /min-h-11/);
            assert.match(button.props.className, /whitespace-normal/);
            assert.equal(card.findAllByType("a").length, 0);
          } else {
            const link = card.findByType("a");
            assert.equal(link.props.href, id === "free" ? "/" : "/plus");
            assert.equal(label(link), id === "free" ? getPricingCopy(language).trySearch : getPricingCopy(language).exploreTrading);
          }
        }
        assert.equal(renderer!.root.findAllByType("form").length, 0);
        assert.equal(renderer!.root.findAllByType("table").length, 0);
        for (const node of renderer!.root.findAll(node => typeof node.props.className === "string")) {
          assert.doesNotMatch(node.props.className, /(?:^|[\s:])(?:fixed|sticky|absolute)(?:\s|$)|truncate/u);
        }
      });
    }
  } finally {
    if (renderer) await act(async () => renderer!.unmount());
    globalThis.fetch = originalFetch;
    if (originalFixture) Object.defineProperty(globalThis, fixtureKey, originalFixture); else Reflect.deleteProperty(globalThis, fixtureKey);
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow); else Reflect.deleteProperty(globalThis, "window");
    await vite.close();
  }
});
