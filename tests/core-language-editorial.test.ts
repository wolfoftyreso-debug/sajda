import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createElement as h } from "react";
import { MemoryRouter } from "react-router-dom";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { createServer } from "vite";
import { applyDocumentMetadata, translate } from "../src/i18n/LanguageProvider";
import { getSajdaInspirationDirections, getContextualSajdaInspiration } from "../src/lib/sajdaInspiration";
import { marketplaceCopy, interpolateMarketplace } from "../src/lib/marketplaceCopy";

const languages = ["en", "sv", "es", "fr", "zh"] as const;
function text(node: ReactTestInstance): string {
  return node.children.map(child => typeof child === "string" ? child : text(child)).join(" ");
}

test("English is the editorial reference and saved domains never imply monitoring", () => {
  assert.equal(translate("en", "tld.io"), "Tech & startups");
  for (const language of languages) {
    assert.doesNotMatch(translate(language, "search.button"), /\{count\}/u);
    const saved = [
      translate(language, "domain.save", { domain: "example.test" }),
      translate(language, "domain.removeWatchlist", { domain: "example.test" }),
      translate(language, "toast.loginToSave"),
      translate(language, "toast.addedWatchlist"),
      translate(language, "toast.removedWatchlist"),
    ].join(" ");
    assert.doesNotMatch(saved, /watchlist|bevakningslista|seguimiento|liste de suivi|关注列表/iu);
    assert.match(saved, /example\.test/u);
    assert.doesNotMatch(saved, /\{domain\}/u);
  }
  assert.doesNotMatch(translate("sv", "search.exactInfo"), /registry/u);
  assert.equal(translate("sv", "domain.available"), "Ledig");
});

test("Trading and pricing metadata are localized without overriding market routes", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "document");
  const fixture = { title: "", documentElement: { lang: "" }, querySelector: () => null };
  Object.defineProperty(globalThis, "document", { configurable: true, value: fixture });
  try {
    const titles = new Set<string>();
    for (const language of languages) {
      applyDocumentMetadata(language, "/plus");
      assert.match(fixture.title, /^Sajda Trading/u);
      titles.add(fixture.title);
      applyDocumentMetadata(language, "/pricing");
      assert.match(fixture.title, /Sajda$/u);
      titles.add(fixture.title);
    }
    assert.equal(titles.size, 10);
    fixture.title = "Market-owned title";
    applyDocumentMetadata("en", "/se/sok-doman/");
    assert.equal(fixture.title, "Market-owned title");
    assert.equal(fixture.documentElement.lang, "sv-SE");
  } finally {
    if (original) Object.defineProperty(globalThis, "document", original);
    else Reflect.deleteProperty(globalThis, "document");
  }
});

test("curated naming ideas preserve IDs, localized detail and the user's input", () => {
  const canonical = getSajdaInspirationDirections("en");
  for (const language of languages) {
    const directions = getSajdaInspirationDirections(language);
    assert.deepEqual(directions.map(item => item.id), canonical.map(item => item.id));
    for (const item of directions) {
      assert.ok(item.title.trim());
      assert.ok(item.rationale.trim());
      assert.ok(item.guardrail.trim());
      assert.ok(item.searchPrompt.trim());
      assert.equal(item.starterTerms.length, 3);
      const contextual = getContextualSajdaInspiration(language, item.id, {
        keyword: "café", selectedTlds: [".se", ".com"],
      });
      assert.equal(contextual.direction.id, item.id);
      assert.ok(contextual.direction.searchPrompt.startsWith("café, "));
      assert.deepEqual(contextual.selectedTlds, ["se", "com"]);
    }
  }
  assert.ok(getSajdaInspirationDirections("sv").find(item => item.id === "place-and-memory")?.starterTerms.includes("stenbrott"));
});

test("marketplace language distinguishes a prepared draft from a received inquiry", () => {
  assert.doesNotMatch(Object.values(marketplaceCopy.en).join(" "), /enquiry/iu);
  assert.equal(marketplaceCopy.en.purchaseEnquiryEyebrow, "Buyer inquiry");
  for (const language of languages) {
    const copy = marketplaceCopy[language];
    assert.notEqual(copy.purchaseEnquirySentTitle, copy.purchaseEnquiryReceivedTitle);
    assert.notEqual(copy.purchaseEnquirySentBody, copy.purchaseEnquiryReceivedBody);
    assert.ok(copy.noCheckout.trim());
    assert.ok(copy.noCheckoutBody.trim());
    assert.ok(copy.privacyNotice.trim());
    assert.ok(copy.domainReadinessOwnership.includes("DNS"));
    assert.ok(interpolateMarketplace(copy.draftsCount, { count: 7 }).includes("7"));
    assert.ok(interpolateMarketplace(copy.purchaseEnquirySentOffer, { price: "$2,500" }).includes("$2,500"));
  }
});

test("search cards, review grammar and result trends render in all five languages", async () => {
  const key = "__SAJDA_CORE_EDITORIAL_LOCALE__";
  const original = Object.getOwnPropertyDescriptor(globalThis, key);
  const setLanguage = (value: string) => Object.defineProperty(globalThis, key, { configurable: true, value });
  const vite = await createServer({
    configFile: false, appType: "custom",
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    resolve: { alias: { "@": path.resolve("src") } },
    optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" },
    plugins: [{ name: "core-editorial-fixtures", enforce: "pre", load(id) {
      const file = id.replaceAll("\\", "/");
      if (file.endsWith("/src/i18n/LanguageProvider.tsx")) return `export const useLanguage=()=>({language:globalThis.${key},t:k=>k});`;
      if (file.endsWith("/src/hooks/use-toast.ts")) return "export const useToast=()=>({toast:()=>{}});";
    } }],
  });
  let renderer: ReactTestRenderer | undefined;
  try {
    const { default: HeroOfferCarousel } = await vite.ssrLoadModule("/src/components/HeroOfferCarousel.tsx");
    const { default: StatsCard } = await vite.ssrLoadModule("/src/components/StatsCard.tsx");
    const { default: DeepReviewPanel } = await vite.ssrLoadModule("/src/components/DeepReviewPanel.tsx");
    const { default: RouteLoading } = await vite.ssrLoadModule("/src/components/RouteLoading.tsx");
    const { createSaleLandingHtml } = await vite.ssrLoadModule("/src/components/SaleLandingGenerator.tsx");
    const candidate = { domain: "example.com", status: "available", availabilityVerified: true, checkMethod: "rdap", confidenceScore: 60 };
    const mount = async (node: ReturnType<typeof h>) => {
      if (renderer) await act(async () => renderer!.unmount());
      await act(async () => { renderer = create(h(MemoryRouter, null, node)); });
    };
    const trendWords = { en: "compared with the previous search", sv: "jämfört med förra sökningen",
      es: "respecto a la búsqueda anterior", fr: "par rapport à la recherche précédente", zh: "与上次搜索相比" };
    for (const language of languages) {
      setLanguage(language);
      await mount(h(RouteLoading));
      const loading = { en: "Loading", sv: "Laddar", es: "Cargando", fr: "Chargement", zh: "正在加载" };
      assert.ok(renderer!.root.findByProps({ role: "status" }).props["aria-label"].startsWith(loading[language]));
      await mount(h(HeroOfferCarousel, { language, onExploreTrending: () => {}, onOpenAdvancedSearch: () => {} }));
      assert.equal(renderer!.root.findAllByType("article").length, 3);
      assert.equal(renderer!.root.findAllByType("a").length, 1);
      assert.equal(renderer!.root.findAllByType("a")[0].props.href, "/swipe");
      const cardText = text(renderer!.root);
      assert.match(cardText, /100/u); assert.match(cardText, /50/u);
      assert.doesNotMatch(cardText, /baraja|kurerat|语境/u);
      await mount(h(StatsCard, { title: "Fixture", value: 5, icon: () => null, trend: { value: 10, isPositive: true } }));
      assert.ok(text(renderer!.root).includes(trendWords[language]));
      await mount(h(DeepReviewPanel, { candidates: [candidate], theme: "", language }));
      if (language === "es") assert.match(text(renderer!.root), /1 nombre confirmado como disponible está listo/u);
      if (language === "sv") assert.match(text(renderer!.root), /1 namn har bekräftats ledigt/u);
      await mount(h(DeepReviewPanel, { candidates: [candidate, { ...candidate, domain: "other.com" }], theme: "", language }));
      if (language === "es") assert.match(text(renderer!.root), /2 nombres confirmados como disponibles están listos/u);
      if (language === "sv") assert.match(text(renderer!.root), /2 namn har bekräftats lediga/u);
      const salePage = createSaleLandingHtml({
        language, domain: "example.test", price: "$2,500", description: "<script>alert('fixture')</script>",
        listingUrl: "https://example.test/listing", contactUrl: "https://example.test/contact",
      });
      assert.ok(salePage.includes(`<html lang="${language}">`));
      assert.ok(salePage.includes("$2,500"));
      assert.match(salePage, /&lt;script&gt;/u);
      assert.doesNotMatch(salePage, /<script/iu);
      const inquiryLabels = { en: "Make an inquiry", sv: "Gör en förfrågan", es: "Hacer una consulta", fr: "Faire une demande", zh: "发送咨询" };
      assert.ok(salePage.includes(inquiryLabels[language]));
      const localSalePage = createSaleLandingHtml({
        language, domain: "example.test", price: "$2,500", description: "Fixture",
        listingUrl: "http://127.0.0.1/listing", contactUrl: null,
      });
      assert.doesNotMatch(localSalePage, /href="http:\/\/127\.0\.0\.1/u);
    }
  } finally {
    if (renderer) await act(async () => renderer!.unmount());
    await vite.close();
    if (original) Object.defineProperty(globalThis, key, original); else Reflect.deleteProperty(globalThis, key);
  }
});
