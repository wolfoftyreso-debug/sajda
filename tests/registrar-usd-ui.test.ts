import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createElement as h } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { createServer } from "vite";
import { REFERENCE_FX_SOURCE, REFERENCE_FX_SOURCE_URL } from "../shared/reference-fx";

function label(node: ReactTestInstance): string {
  return node.children.map(child => typeof child === "string" ? child : label(child)).join("");
}

test("mounted standard-price cards share one FX lookup and show comparable USD in every language", async () => {
  const fixtureKey = "__REGISTRAR_USD_TEST_LANGUAGE__";
  const originalLanguage = Object.getOwnPropertyDescriptor(globalThis, fixtureKey);
  const originalFetch = globalThis.fetch;
  const setLanguage = (language: string) => Object.defineProperty(globalThis, fixtureKey, { configurable: true, value: language });
  const now = new Date();
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    calls++;
    assert.equal(input, "/api/reference-fx");
    assert.equal(init?.credentials, "omit");
    return Response.json({ referenceFx: { source: REFERENCE_FX_SOURCE, sourceUrl: REFERENCE_FX_SOURCE_URL,
      fetchedAt: now.toISOString(), rates: { SEK: { usdPerUnit: 0.1, date: now.toISOString().slice(0, 10) } } } });
  };
  const vite = await createServer({ configFile: false, appType: "custom",
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" },
    plugins: [{ name: "registrar-usd-test-context", enforce: "pre", load(id) {
      const normalized = id.replaceAll("\\", "/");
      if (normalized.endsWith("/src/i18n/LanguageProvider.tsx")) return `export const useLanguage=()=>({language:globalThis.${fixtureKey},t:key=>key});`;
      if (normalized.endsWith("/src/components/ui/tooltip.tsx")) return "export const Tooltip=({children})=>children; export const TooltipProvider=Tooltip; export const TooltipTrigger=Tooltip; export const TooltipContent=Tooltip;";
    } }],
  });
  let renderer: ReactTestRenderer | undefined;
  try {
    const { default: DomainCard } = await vite.ssrLoadModule("/src/components/DomainCard.tsx");
    const loopia = { providerId: "loopia", registrar: "Loopia", purchaseUrl: "https://www.loopia.se/domannamn/",
      priceSourceUrl: "https://www.loopia.se/domannamn/detaljerad_prislista/", currency: "SEK",
      registrationPriceInclVat: 100, renewalPriceInclVat: 200, priceVerified: true,
      priceScope: "standard_tld", dataSource: "loopia_public_price_list", checkedAt: now.toISOString() };
    const porkbun = { providerId: "porkbun", registrar: "Porkbun", purchaseUrl: "https://porkbun.com/products/domains",
      priceSourceUrl: "https://porkbun.com/products/domains", currency: "USD", registrationPrice: 11.06,
      renewalPrice: 11.06, priceVerified: true, priceScope: "standard_tld", taxTreatment: "unknown",
      dataSource: "official_provider_api", checkedAt: now.toISOString() };
    const props = { domain: "example.com", status: "available", confidenceScore: 65, registrarPrice: 0,
      estimatedValue: 0, rationale: "Test fixture.", showWatchlistActions: false,
      registrarOffer: loopia, providerOffers: [loopia, porkbun], selectedProviderIds: ["loopia", "porkbun", "namecheap"] };
    const tree = () => h("main", null, h(DomainCard, props), h(DomainCard, { ...props, domain: "second.com" }));
    setLanguage("en");
    await act(async () => { renderer = create(tree()); });
    assert.equal(calls, 1, "Many result cards use one rate request");
    await act(async () => {
      for (const button of renderer!.root.findAllByType("button").filter(button => button.props["aria-expanded"] === false)) button.props.onClick();
    });
    for (const language of ["en", "sv", "es", "fr", "zh"]) {
      setLanguage(language);
      await act(async () => { renderer!.update(tree()); });
      const text = label(renderer!.root);
      assert.match(text, /≈ \$10[.,]00 USD/);
      assert.match(text, /≈ \$20[.,]00 USD/);
      assert.match(text, /\$11[.,]06 USD/);
      assert.ok(text.includes(now.toISOString().slice(0, 10)));
      assert.ok(text.includes("ECB via Frankfurter"));
      assert.match(text, /100[.,]00/);
      assert.equal(calls, 1);
      const links = renderer!.root.findAllByType("a");
      assert.ok(links.some(link => link.props.href === "https://porkbun.com/products/domains"));
      assert.ok(links.some(link => link.props.href === "https://www.namecheap.com/domains/domain-name-search/"));
    }
  } finally {
    if (renderer) await act(async () => renderer!.unmount());
    globalThis.fetch = originalFetch;
    if (originalLanguage) Object.defineProperty(globalThis, fixtureKey, originalLanguage); else Reflect.deleteProperty(globalThis, fixtureKey);
    await vite.close();
  }
});
