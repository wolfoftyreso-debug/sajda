import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom";
import { createServer } from "vite";

// Render real components without making network requests. These assertions
// cover semantic contracts; mobile geometry still requires browser testing.
const vite = await createServer({
  server: { middlewareMode: true, watch: null, hmr: false },
  optimizeDeps: { noDiscovery: true, include: [] },
  define: { "import.meta.env.VITE_PUBLIC_SEARCH_MODE": '"true"', "import.meta.env.VITE_LOCAL_TEST_MODE": '"false"' },
  appType: "custom",
});
try {
  const { LanguageProvider } = await vite.ssrLoadModule("/src/i18n/LanguageProvider.tsx");
  const { default: HeroOfferCarousel } = await vite.ssrLoadModule("/src/components/HeroOfferCarousel.tsx");
  const { default: AdvancedSearchBrief } = await vite.ssrLoadModule("/src/components/AdvancedSearchBrief.tsx");
  const { default: DomainCard } = await vite.ssrLoadModule("/src/components/DomainCard.tsx");
  const { default: ScanningIndicator } = await vite.ssrLoadModule("/src/components/ScanningIndicator.tsx");
  const { DEFAULT_ADVANCED_SEARCH_CRITERIA } = await vite.ssrLoadModule("/src/lib/advancedSearchCriteria.ts");
  const render = (component) => renderToStaticMarkup(h(StaticRouter, { location: "/" }, h(LanguageProvider, null, component)));

  for (const language of ["en", "sv", "es", "fr", "zh"]) {
    const html = render(h(HeroOfferCarousel, { language, onExploreTrending() {}, onOpenAdvancedSearch() {} }));
    assert.equal((html.match(/<article/g) ?? []).length, 3, `${language}: three paths`);
    assert.match(html, /href="\/swipe"/, `${language}: Swipe navigation`);
    assert.doesNotMatch(html, />RDAP</, `${language}: no unexplained protocol token`);
    assert.doesNotMatch(html, /100 TO EXPLORE|100 to explore|>SHORTLIST</);
  }

  const advancedProps = {
    value: "A bakery for our neighbourhood", criteria: DEFAULT_ADVANCED_SEARCH_CRITERIA,
    onEnabledChange() {}, onValueChange() {}, onCriteriaChange() {},
    children: h("div", null, "EXTENSION_CONTROLS_SENTINEL"),
  };
  const collapsed = render(h(AdvancedSearchBrief, { ...advancedProps, enabled: false }));
  assert.match(collapsed, /aria-expanded="false"/);
  assert.doesNotMatch(collapsed, /<textarea|EXTENSION_CONTROLS_SENTINEL/);
  const expanded = render(h(AdvancedSearchBrief, { ...advancedProps, enabled: true }));
  assert.match(expanded, /aria-expanded="true"/);
  assert.match(expanded, /<textarea/);
  assert.match(expanded, /EXTENSION_CONTROLS_SENTINEL/);

  const result = {
    domain: "sajdatestexample.com", status: "unknown", registrarPrice: 0,
    estimatedValue: 0, confidenceScore: 0, namingScore: 72,
    rationale: "A compact combination with a clear theme.",
    checkMethod: "none", availabilityVerified: false, showWatchlistActions: false,
  };
  const unknown = render(h(DomainCard, result));
  assert.match(unknown, /Domain quality/);
  assert.match(unknown, /72\/100/);
  assert.match(unknown, /not a market valuation/);
  assert.doesNotMatch(unknown, /≈|\$0|Estimated value|Registry-verified available/);
  const legacy = render(h(DomainCard, { ...result, estimatedValue: 90000 }));
  assert.doesNotMatch(legacy, /90,000|90000|≈/, "Legacy heuristic dollars must not reappear as market value");

  const scanning = render(h(ScanningIndicator, {
    isScanning: true, domainsScanned: 0, domainsFound: 0, timeRemaining: 90,
    targetDomains: 50, activeTLDScans: new Map([["com", 0], ["dev", 0]]), onStop() {},
  }));
  assert.match(scanning, /Stop search/);
  assert.match(scanning, /aria-busy="true"/);
  assert.doesNotMatch(scanning, /1:30|0%|0\/50|progressbar/, "No invented progress or ETA without streaming evidence");

  const { runAnonymousSearch } = await vite.ssrLoadModule("/src/lib/localTestSearch.ts");
  const originalFetch = globalThis.fetch;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const requests = [];
  try {
    Object.defineProperty(globalThis, "window", { configurable: true, value: {
      setTimeout, clearTimeout, location: { hostname: "127.0.0.1" },
    } });
    globalThis.fetch = async (url, init) => {
      if (init.signal.aborted) throw new DOMException("Aborted", "AbortError");
      requests.push({ url, body: JSON.parse(init.body), signal: init.signal });
      return new Response(JSON.stringify({ results: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    await runAnonymousSearch(["com"], 50, "coastal bakery", "en", { domains: [], creativeMode: "medium" });
    assert.deepEqual(requests[0].body, {
      tlds: ["com"], count: 50, theme: "coastal bakery", locale: "en", advanced: false,
      swipe: false, creativeMode: "medium",
    }, "An empty exact-domain list must not break creative search validation");
    assert.equal(requests[0].url, "/api/domain-search");

    await runAnonymousSearch(["com"], 2, "", "sv", { domains: ["example.com", "example.org"], providers: ["loopia"] });
    assert.deepEqual(requests[1].body.domains, ["example.com", "example.org"]);
    assert.deepEqual(requests[1].body.providers, ["loopia"]);
    assert.equal(requests[1].body.locale, "sv");
    assert.equal("brief" in requests[1].body, false);

    await runAnonymousSearch(["dev"], 50, "", "en", {
      advanced: true, brief: "  A calm scheduling tool  ", criteria: DEFAULT_ADVANCED_SEARCH_CRITERIA, domains: [],
    });
    assert.equal(requests[2].body.brief, "A calm scheduling tool");
    assert.deepEqual(requests[2].body.criteria, DEFAULT_ADVANCED_SEARCH_CRITERIA);
    assert.equal("domains" in requests[2].body, false);

    const { getSwipeTlds, getAnonymousSearchTlds } = await vite.ssrLoadModule("/src/lib/anonymousSearchMode.ts");
    const swipeTlds = [...getSwipeTlds()];
    assert.deepEqual(swipeTlds, [...getAnonymousSearchTlds()], "Swipe and search must expose the same verified endings");
    assert.ok(swipeTlds.includes("dev") && swipeTlds.includes("ai") && swipeTlds.includes("org"));
    assert.equal(swipeTlds.length, 9, "The Swipe selector must not collapse back to .com only");
    await runAnonymousSearch(swipeTlds, 100, "", "en", { swipe: true, minLength: 3, maxLength: 9 });
    assert.deepEqual(requests[3].body.tlds, swipeTlds, "The complete Swipe selection reaches the server");
    assert.equal(requests[3].body.swipe, true);
    assert.equal(requests[3].body.minLength, 3);
    assert.equal(requests[3].body.maxLength, 9);
    const cancellation = new AbortController();
    cancellation.abort();
    await assert.rejects(runAnonymousSearch(["com"], 1, "", "en", { signal: cancellation.signal }));
    assert.equal(requests.length, 4, "Cancelled search must not be sent");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else delete globalThis.window;
  }

  console.log("UI contracts: OK (five languages, advanced disclosure, evidence-aware cards, four request modes, cancellation)");
} finally {
  await vite.close();
}
