import assert from "node:assert/strict";
import test from "node:test";
import { connectorShortlistInputSchema, parseConnectorShortlistRequest, presentConnectorShortlist } from "../api/_shared/connector-shortlist.js";
import { NAMES_API_TLDS } from "../api/_shared/names-contract.js";

const now = Date.parse("2026-09-11T12:00:00.000Z");
const iso = (offset = 0) => new Date(now + offset).toISOString();
const budget = { amount: 20, currency: "USD", period: "first_year" };
const request = (overrides: Record<string, unknown> = {}) => parseConnectorShortlistRequest({ query: "Nordic design studio", budget, ...overrides });
function offer(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { providerId: "porkbun", registrar: "Porkbun", purchaseUrl: "https://porkbun.com/products/domains",
    priceSourceUrl: "https://api.porkbun.com/api/json/v3/pricing/get", priceStatus: "verified", priceVerified: true,
    dataSource: "official_provider_api", priceScope: "standard_tld", checkedAt: iso(-60000), currency: "USD",
    registrationPrice: 10, renewalPrice: 14, taxTreatment: "unknown", priceType: "standard", ...overrides };
}
function row(domain = "nordkit.com", overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { domain, tld: domain.split(".").at(-1), status: "available", checkMethod: "rdap", source: "verisign-rdap",
    authoritative: true, checkedAt: iso(-30000), rationale: "A short, clear name for a design studio.", namingScore: 80,
    registrarPrice: 1, estimatedValue: 9999999, registrarOffers: [offer()], ...overrides };
}
function exact(domain = "nordkit.com", overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return offer({ priceScope: "exact_domain_offer", domain, availability: "available", expiresAt: iso(4 * 60000),
    priceSourceUrl: `https://api.porkbun.com/api/json/v3/domain/checkDomain/${domain}`, ...overrides });
}
function present(rows: unknown[] = [row()], overrides: Record<string, unknown> = {}, referenceFx?: unknown) {
  return presentConnectorShortlist({ checkedAt: iso(), results: rows }, request(overrides), { now, referenceFx });
}
function assertNoSuggestions(result: ReturnType<typeof present>, message?: string) {
  assert.equal(result.returnedCount, 0, message);
  assert.deepEqual(result.items, [], message);
  assert.equal(result.provisionalCount, 0, message);
  assert.equal(result.conditionalCount, 0, message);
  assert.deepEqual(result.provisionalItems, [], message);
}
const fx = { source: "ECB via Frankfurter", sourceUrl: "https://frankfurter.dev/", fetchedAt: iso(-60000), rates: {
  SEK: { usdPerUnit: 0.1, date: "2026-09-11" }, EUR: { usdPerUnit: 1.2, date: "2026-09-11" }, GBP: { usdPerUnit: 1.5, date: "2026-09-10" },
} };

test("connector shortlist parser has strict bounded input and documented defaults", () => {
  assert.deepEqual(request(), { query: "Nordic design studio", budget, tlds: ["com", "dev", "app"], count: 10, locale: "en" });
  for (const locale of ["en", "sv", "es", "fr", "zh"]) assert.equal(request({ locale }).locale, locale);
  assert.equal(request({ query: "  Café för 🦊  " }).query, "Café för 🦊");
  assert.equal(request({ budget: { ...budget, amount: 0.01 } }).budget.amount, 0.01);
  assert.equal(request({ budget: { ...budget, amount: 100000 } }).budget.amount, 100000);
  assert.deepEqual(request({ tlds: [...NAMES_API_TLDS] }).tlds, NAMES_API_TLDS);
  assert.equal(connectorShortlistInputSchema.additionalProperties, false);
  assert.deepEqual(connectorShortlistInputSchema.required, ["query", "budget"]);
  assert.deepEqual(connectorShortlistInputSchema.properties.tlds.items.enum, NAMES_API_TLDS);
  assert.deepEqual(connectorShortlistInputSchema.properties.tlds.default, request().tlds);
  assert.equal(connectorShortlistInputSchema.properties.count.default, request().count);
});

test("connector shortlist parser refuses missing budget, controls, malformed numbers and unknown keys", () => {
  const invalid = [null, [], {}, { query: "studio" }, { query: "studio", budget: null },
    ...["", "   ", "a".repeat(101), "x\u0000x", "x\nxx", "x\ud800x", "x\udfffx"].map(query => ({ query, budget })),
    ...[0, 11, 1.5, NaN, Infinity, "10"].map(count => ({ query: "x", budget, count })),
    ...[0, -1, 100000.01, 1.001, NaN, Infinity, "20"].map(amount => ({ query: "x", budget: { ...budget, amount } })),
    ...[[], ["com", "com"], [".com"], ["COM"], ["co.uk"], ["xyz", "unsupported"]].map(tlds => ({ query: "x", budget, tlds })),
    { query: "x", budget: { ...budget, currency: "CAD" } }, { query: "x", budget: { ...budget, period: "five_years" } },
    { query: "x", budget: { ...budget, taxInclusive: true } }, { query: "x", budget, accountId: "other" },
    { query: "x", budget, locale: "de" }, { query: "x", budget, providers: ["porkbun"] }];
  for (const value of invalid) assert.throws(() => parseConnectorShortlistRequest(value));
});

test("suggestion briefs cannot trigger exact-domain mode or bypass count using a domain list", () => {
  const twelveDomains = Array.from({ length: 12 }, (_, index) => `${String.fromCharCode(97 + index)}.com`).join(" ");
  assert.ok(twelveDomains.length <= 100, "Regression must pass the old brief-length guard.");
  for (const query of [twelveDomains, twelveDomains.replaceAll(" ", "|"), "nordkit.com .dev .ai",
    "a.com", "A.COM.", "(a.com)", "[a.com]", '"a.com"', "`a.com`", "a.com,b.com;c.com",
    "A studio like example.com but more Nordic", "Inspired by (example.com).", "Referens: sajda.se!",
    "https://example.com/path?q=one", "https://localhost/path", "//localhost/path", "HTTP://EXAMPLE.COM",
    "Visit www.example.com", "user@example.com", "mailto:dev@localhost", "example.co.uk", "brand.unsupported",
    "åäö.se", "café.com", "xn--caf-dma.com", "example\uff0ecom", "example\u3002com"] ) {
    assert.throws(() => request({ query, count: 1 }), /Use domains_check/, query);
  }
  assert.match(connectorShortlistInputSchema.properties.query.description, /without full domain names/);
  assert.match(connectorShortlistInputSchema.properties.query.description, /domains_check/);
});

test("suggestion brief protection preserves normal punctuation and native-language text", () => {
  for (const query of ["Nordic design studio.", "Clear. Short. Easy to remember.", "A studio, e.g. for furniture design.",
    "Version 2.0 for designers", "A.I. tools for founders", "Dr. Smith and friends", "Stilren design. För åäö och småföretag!",
    "Café för 🦊", "Création de noms. Pour les cafés.", "Una marca para pequeñas empresas.", "现代品牌。适合设计工作室。",
    "Theme: calm Nordic architecture", "Short names for a .com business", "Clean... memorable... modern"]) {
    assert.doesNotThrow(() => request({ query, count: 1 }), query);
    assert.equal(request({ query, count: 1 }).query, query);
  }
});

test("host-supplied name ideas are optional, ASCII-only, lowercase and deduplicated without changing the brief", () => {
  assert.equal(request().candidateSeeds, undefined);
  assert.deepEqual(request({ candidateSeeds: ["NordKit", "nordkit", "FORM-lab", "form-lab", "a", "8", "a".repeat(63)] }).candidateSeeds,
    ["nordkit", "form-lab", "a", "8", "a".repeat(63)]);
  const input = { query: "Nordic design studio", budget, candidateSeeds: ["NordKit", "nordkit"] };
  const snapshot = JSON.stringify(input);
  assert.deepEqual(parseConnectorShortlistRequest(input).candidateSeeds, ["nordkit"]);
  assert.equal(JSON.stringify(input), snapshot);
  assert.equal(request({ candidateSeeds: Array(30).fill("NordKit") }).candidateSeeds?.length, 1);
  assert.equal(request({ candidateSeeds: ["company", "NordKit"] }).query, "Nordic design studio");
  assert.equal(connectorShortlistInputSchema.properties.candidateSeeds.maxItems, 30);
  assert.equal(connectorShortlistInputSchema.properties.candidateSeeds.items.maxLength, 63);
  assert.match(connectorShortlistInputSchema.properties.candidateSeeds.description, /generates candidates from query/);
});

test("host name ideas reject URLs, complete domains, controls, malformed labels and all-placeholder lists", () => {
  for (const candidateSeeds of [null, "NordKit", [], Array(31).fill("NordKit"), [null], [1],
    ...["", "a".repeat(64), "NordKit.com", "nord.kit", "https://nordkit", "//nordkit", "nordkit/path", "user@nordkit",
      " NordKit", "NordKit ", "nord kit", "nord_kit", "-nordkit", "nordkit-", "nord\nkit", "nordkit\n", "\tnordkit",
      "nord\u0000kit", "nord\u007fkit", "café", "åäö", "北欧", "🦊", "xn--nordkit", "XN--NORDKIT", "nord\ud800kit"].map(value => [value]),
    ["NAME", "domain", "COMPANY", "app", "test", "example"]]) {
    assert.throws(() => request({ candidateSeeds }), undefined, JSON.stringify(candidateSeeds));
  }
  assert.throws(() => request({ query: "https://example.com", candidateSeeds: ["NordKit"] }), /Use domains_check/);
  assert.throws(() => request({ candidateSeeds: ["NordKit"], count: 11 }));
  assert.throws(() => parseConnectorShortlistRequest({ query: "studio", candidateSeeds: ["NordKit"] }));
});

test("published extension prices remain conditional; heuristic valuations are never exposed as prices", () => {
  const result = present();
  assert.equal(result.status, "empty");
  assert.equal(result.requestedCount, 10); assert.equal(result.returnedCount, 0); assert.equal(result.shortfall, 10);
  assert.deepEqual(result.items, []);
  assert.equal(result.confirmedCount, 0); assert.equal(result.conditionalCount, 1); assert.equal(result.provisionalCount, 1);
  const item = result.provisionalItems[0];
  assert.equal(item.evidenceType, "conditional_tld_estimate");
  assert.deepEqual(item.offer.price, { amount: 10, currency: "USD", taxTreatment: "unknown" });
  assert.equal(item.offer.renewal?.amount, 14);
  assert.equal(item.availability.status, "registry_not_found");
  assert.equal(item.availability.checkedAt, iso(-30000));
  assert.equal(item.offer.checkedAt, iso(-60000));
  assert.equal(item.offer.comparison.converted, false); assert.equal(item.offer.comparison.fx, null);
  assert.match(result.warnings.join(" "), /not confirmed exact-domain/);
  assert.match(result.warnings.join(" "), /Missing results were not invented/);
  assert.doesNotMatch(JSON.stringify(result), /9999999|estimatedValue|registrarPrice/);
});

test("confirmed offers require fresh domain-bound official evidence, availability and short expiry", () => {
  const result = present([row("nordkit.com", { registrarOffers: [exact()] })], { count: 1 });
  assert.equal(result.confirmedCount, 1); assert.equal(result.conditionalCount, 0); assert.equal(result.status, "complete");
  assert.equal(result.items[0].offer.expiresAt, iso(4 * 60000));
  assert.match(result.items[0].caveats.join(" "), /not a reservation/);
  for (const mutation of [{ domain: "different.com" }, { availability: "unavailable" }, { availability: "unknown" },
    { availability: undefined }, { expiresAt: undefined }, { expiresAt: iso() }, { expiresAt: iso(-1) },
    { expiresAt: iso(5 * 60000) }, { checkedAt: iso(1) }, { checkedAt: iso(-5 * 60000 - 1) },
    { priceSourceUrl: "https://api.porkbun.com/api/json/v3/pricing/get" },
    { priceSourceUrl: "https://api.porkbun.com/api/json/v3/domain/checkDomain/different.com" },
    { dataSource: "provider_search_page" }]) {
    const rejected = present([row("nordkit.com", { registrarOffers: [exact("nordkit.com", mutation)] })]);
    assert.equal(rejected.confirmedCount, 0, JSON.stringify(mutation));
    assertNoSuggestions(rejected, JSON.stringify(mutation));
  }
});

test("Cloudflare exact checks use public documentation and a fixed registrar landing page, not account URLs", () => {
  const cloudflare = exact("nordkit.com", { providerId: "cloudflare", registrar: "Cloudflare Registrar",
    priceSourceUrl: "https://developers.cloudflare.com/api/resources/registrar/methods/check/",
    purchaseUrl: "https://www.cloudflare.com/domains/", registrationPrice: 9.15, renewalPrice: 10.44 });
  const result = present([row("nordkit.com", { registrarOffers: [cloudflare] })], { count: 1 });
  assert.equal(result.status, "complete"); assert.equal(result.returnedCount, 1); assert.equal(result.provisionalCount, 0);
  assert.equal(result.items[0].offer.providerId, "cloudflare");
  assert.equal(result.items[0].offer.sourceUrl, cloudflare.priceSourceUrl);
  assert.equal(result.items[0].offer.purchaseUrl, "https://www.cloudflare.com/domains/");
  assert.equal(result.items[0].offer.price.taxTreatment, "unknown");
  assert.equal(result.items[0].offer.comparison.amount, 9.15);
  assert.match(result.items[0].caveats.join(" "), /Taxes: unknown/);
  for (const mutation of [{ domain: "other.com" }, { availability: "unknown" }, { priceVerified: false },
    { dataSource: "tldes_price_feed" }, { expiresAt: undefined }, { expiresAt: iso(5 * 60000) },
    { priceSourceUrl: "https://api.cloudflare.com/client/v4/accounts/private-account/registrar/domains/check" },
    { priceSourceUrl: "https://developers.cloudflare.com/api/resources/registrar/methods/check/?account=private" },
    { priceSourceUrl: "https://api.porkbun.com/api/json/v3/domain/checkDomain/nordkit.com" },
    { purchaseUrl: "https://www.cloudflare.com/domains/other" }, { purchaseUrl: "https://domains.cloudflare.com/" },
    { purchaseUrl: "https://www.cloudflare.com/domains/?domain=nordkit.com" },
    { purchaseUrl: "https://dash.cloudflare.com/private-account/domains" }]) {
    assertNoSuggestions(present([row("nordkit.com", { registrarOffers: [{ ...cloudflare, ...mutation }] })]), JSON.stringify(mutation));
  }
  assertNoSuggestions(present([row("nordkit.com", { authoritative: false, registrarOffers: [cloudflare] })]));
  assertNoSuggestions(present([row("nordkit.com", { checkedAt: iso(-5 * 60000 - 1), registrarOffers: [cloudflare] })]));
  const renewal = present([row("nordkit.com", { registrarOffers: [cloudflare] })], { count: 1, budget: { ...budget, period: "annual_renewal" } });
  assert.equal(renewal.items[0].offer.comparison.amount, 10.44);
});

test("registry status and actual per-row timestamp gate all candidates, irrespective of fresh envelope", () => {
  for (const mutation of [{ status: "taken" }, { status: "unknown" }, { authoritative: false }, { checkMethod: "none" },
    { source: "" }, { error: "lookup failed" }, { error: null }, { checkedAt: undefined }, { checkedAt: null },
    { checkedAt: iso(1) }, { checkedAt: iso(-5 * 60000 - 1) }, { checkedAt: "2026-09-11" }]) {
    assertNoSuggestions(present([row("nordkit.com", mutation)]), JSON.stringify(mutation));
  }
  assert.equal(present([row("nordkit.com", { checkedAt: iso(-5 * 60000) })]).provisionalCount, 1);
  const stale = present([row("nordkit.com", { checkedAt: iso(-3600000) })]);
  assert.deepEqual(stale.exclusions, { stale_availability: 1 });
});

test("unsupported, malformed and duplicate/conflicting domains cannot become shortlist entries", () => {
  const result = present([row(), row("nordkit.com", { status: "taken" }),
    ...["Nordkit.com", "nordkit.se", "xn--caf-dma.com", "foo.bar.com", "-bad.com", "bad-.com", "bad_name.com", "x".repeat(64) + ".com"].map(domain => row(domain)),
    row("valid.com", { tld: "app" }), null]);
  assertNoSuggestions(result);
  assert.equal(result.exclusions.duplicate_domain, 1);
  assert.equal(result.exclusions.unsupported_domain, 10);
});

test("price verification, scope, timestamp and current feed TTL are mandatory", () => {
  const invalid = [{ priceVerified: false }, { priceStatus: "not_connected" }, { priceScope: undefined },
    { priceScope: "estimate" }, { checkedAt: undefined }, { checkedAt: iso(1) }, { checkedAt: iso(-24 * 3600000 - 1) },
    { expiresAt: null }, { expiresAt: iso(-1) }, { priceVerified: true, dataSource: "provider_search_page" }, { providerId: "openprovider" }];
  for (const mutation of invalid) assertNoSuggestions(present([row("nordkit.com", { registrarOffers: [offer(mutation)] })]), JSON.stringify(mutation));
  assert.equal(present([row("nordkit.com", { registrarOffers: [offer({ checkedAt: iso(-24 * 3600000) })] })]).provisionalCount, 1);
  const tldes = { dataSource: "tldes_price_feed", priceSourceUrl: "https://tldes.com/docs/api-reference.html" };
  assert.equal(present([row("nordkit.com", { registrarOffers: [offer({ ...tldes, checkedAt: iso(-2 * 3600000) })] })]).provisionalCount, 1);
  const stale = present([row("nordkit.com", { registrarOffers: [offer({ ...tldes, checkedAt: iso(-2 * 3600000 - 1) })] })]);
  assert.deepEqual(stale.exclusions, { stale_price: 1 });
});

test("renewal budget compares renewal rather than discounted acquisition and preserves native taxes", () => {
  assert.equal(present([row("nordkit.com", { registrarOffers: [offer({ registrationPrice: 1, renewalPrice: 30, priceType: "campaign" })] })]).provisionalCount, 1);
  assertNoSuggestions(present([row("nordkit.com", { registrarOffers: [offer({ registrationPrice: 1, renewalPrice: 30 })] })],
    { budget: { ...budget, period: "annual_renewal" } }));
  const result = present([row("nordkit.com", { registrarOffers: [offer({ registrationPrice: 100, renewalPrice: 14, taxTreatment: "excluded" })] })],
    { budget: { ...budget, period: "annual_renewal" } });
  assert.equal(result.provisionalItems[0].offer.price.amount, 14);
  assert.equal(result.provisionalItems[0].offer.registration?.amount, 100);
  assert.equal(result.provisionalItems[0].offer.price.taxTreatment, "excluded");
  assert.match(result.provisionalItems[0].caveats.join(" "), /does not limit the initial registration/);
  assertNoSuggestions(present([row("nordkit.com", { registrarOffers: [offer({ renewalPrice: undefined })] })],
    { budget: { ...budget, period: "annual_renewal" } }));
});

test("Loopia actual gross/net price fields preserve the selected tax basis", () => {
  const loopia = offer({ providerId: "loopia", registrar: "Loopia", purchaseUrl: "https://www.loopia.se/domannamn/",
    dataSource: "loopia_public_price_list", priceSourceUrl: "https://www.loopia.se/domannamn/detaljerad_prislista/",
    currency: "SEK", registrationPriceInclVat: 125, registrationPriceExVat: 100, renewalPriceInclVat: 150, taxTreatment: undefined });
  const options = { budget: { amount: 150, currency: "SEK", period: "first_year" } };
  const result = present([row("nordkit.com", { registrarOffers: [loopia] })], options);
  assert.deepEqual(result.provisionalItems[0].offer.price, { amount: 125, currency: "SEK", taxTreatment: "included" });
  assert.equal(result.provisionalItems[0].offer.renewal?.amount, 150);
  assertNoSuggestions(present([row("nordkit.com", { registrarOffers: [{ ...loopia, taxTreatment: "excluded" }] })], options));
  const net = present([row("nordkit.com", { registrarOffers: [{ ...loopia, registrationPriceInclVat: undefined }] })], options);
  assert.deepEqual(net.provisionalItems[0].offer.price, { amount: 100, currency: "SEK", taxTreatment: "excluded" });
});

test("invalid native money, currencies, tax labels or ICANN fees are not silently repaired", () => {
  for (const mutation of [{ registrationPrice: NaN }, { registrationPrice: Infinity }, { registrationPrice: -1 },
    { registrationPrice: "10" }, { registrationPrice: null }, { registrationPrice: 100000001 },
    { registrationPriceInclVat: "10" }, { currency: "usd" }, { currency: "USDT" }, { taxTreatment: "including" },
    { icannFee: -1 }, { icannFee: "0.2" }, { icannFee: Infinity }, { icannFee: null }]) {
    assertNoSuggestions(present([row("nordkit.com", { registrarOffers: [offer(mutation)] })]), JSON.stringify(mutation));
  }
  assert.equal(present([row("nordkit.com", { registrarOffers: [offer({ registrationPrice: 0 })] })]).provisionalCount, 1);
});

test("reported fee is conservatively included in filtering and preserved separately without floating-point loss", () => {
  const result = present([row("nordkit.com", { registrarOffers: [offer({ registrationPrice: 0.1, icannFee: 0.2 })] })],
    { budget: { ...budget, amount: 0.3 } });
  assert.equal(result.provisionalItems[0].offer.price.amount, 0.1);
  assert.equal(result.provisionalItems[0].offer.reportedIcannFee, 0.2);
  assert.equal(result.provisionalItems[0].offer.comparison.amount, 0.3);
  assert.equal(result.provisionalItems[0].offer.comparison.includesReportedIcannFee, true);
  assert.match(result.provisionalItems[0].caveats.join(" "), /may already include it/);
  assertNoSuggestions(present([row("nordkit.com", { registrarOffers: [offer({ registrationPrice: 20, icannFee: 0.01 })] })]));
});

test("verified cross-currency reference comparisons preserve source, time and native prices", () => {
  const result = present([row("nordkit.com", { registrarOffers: [offer({ currency: "SEK", registrationPrice: 100, renewalPrice: 150 })] })], {}, fx);
  assert.deepEqual(result.provisionalItems[0].offer.price, { amount: 100, currency: "SEK", taxTreatment: "unknown" });
  assert.equal(result.provisionalItems[0].offer.comparison.amount, 10);
  assert.equal(result.provisionalItems[0].offer.comparison.fx?.sourceRateDate, "2026-09-11");
  assert.equal(result.provisionalItems[0].offer.comparison.fx?.targetRateDate, null);
  assert.equal(result.provisionalItems[0].offer.comparison.fx?.sourceUrl, "https://frankfurter.dev/");
  assert.equal(result.provisionalItems[0].offer.comparison.fx?.fetchedAt, iso(-60000));
  const euros = present([row("nordkit.com", { registrarOffers: [offer({ currency: "GBP", registrationPrice: 12 })] })],
    { budget: { ...budget, currency: "EUR" } }, fx);
  assert.equal(euros.provisionalItems[0].offer.comparison.amount, 15);
  assert.equal(euros.provisionalItems[0].offer.comparison.fx?.sourceRateDate, "2026-09-10");
  assert.equal(euros.provisionalItems[0].offer.comparison.fx?.targetRateDate, "2026-09-11");
  const krona = present([row()], { budget: { ...budget, currency: "SEK", amount: 100 } }, fx);
  assert.equal(krona.provisionalItems[0].offer.comparison.amount, 100);
});

test("unavailable, stale or future FX excludes conversion; same-currency evidence needs no FX", () => {
  const rows = [row("nordkit.com", { registrarOffers: [offer({ currency: "SEK", registrationPrice: 100 })] })];
  for (const referenceFx of [undefined, null, {}, { ...fx, sourceUrl: "https://evil.invalid/" },
    { ...fx, fetchedAt: iso(1) }, { ...fx, fetchedAt: iso(-6 * 3600000 - 1) },
    { ...fx, rates: { SEK: { usdPerUnit: 0.1, date: "2026-09-12" } } },
    { ...fx, rates: { SEK: { usdPerUnit: 0.1, date: "2026-09-01" } } },
    { ...fx, rates: { SEK: { usdPerUnit: 0, date: "2026-09-11" } } }]) {
    const result = present(rows, {}, referenceFx);
    assertNoSuggestions(result);
    assert.deepEqual(result.exclusions, { currency_unavailable: 1 });
    assert.match(result.warnings.join(" "), /currency conversion was unavailable/);
  }
  assert.equal(present(rows, { budget: { ...budget, currency: "SEK", amount: 100 } }).provisionalCount, 1);
  assertNoSuggestions(present([row("nordkit.com", { registrarOffers: [offer({ currency: "ZZZ" })] })], {}, fx));
});

test("conversion rounds conservatively upward, never granting a misleading budget match", () => {
  const rows = [row("nordkit.com", { registrarOffers: [offer({ currency: "SEK", registrationPrice: 10.01 })] })];
  assertNoSuggestions(present(rows, { budget: { ...budget, amount: 1 } }, fx));
  assert.equal(present(rows, { budget: { ...budget, amount: 1.01 } }, fx).provisionalItems[0].offer.comparison.amount, 1.01);
  const tiny = present([row("nordkit.com", { registrarOffers: [offer({ registrationPrice: 1e-7 })] })]);
  assert.equal(tiny.provisionalItems[0].offer.comparison.amount, 0.01);
});

test("only reviewed evidence links and safe registrar destinations are exposed", () => {
  for (const priceSourceUrl of ["https://attacker.invalid/", "http://api.porkbun.com/api/json/v3/pricing/get",
    "https://api.porkbun.com/api/json/v3/pricing/get?token=secret", "https://api.porkbun.com/secret/token",
    "https://porkbun.com@attacker.invalid/", "https://attacker.porkbun.com/", "javascript:alert(1)",
    "https://tldes.com/docs/api-reference.html#secret", "https://127.0.0.1/", "https://user:secret@api.porkbun.com/",
    "https://api.porkbun.com:8443/api/json/v3/pricing/get"]) {
    assertNoSuggestions(present([row("nordkit.com", { registrarOffers: [offer({ priceSourceUrl })] })]), priceSourceUrl);
  }
  for (const purchaseUrl of ["https://porkbun.com.attacker.invalid/", "https://porkbun.com@attacker.invalid/", "javascript:alert(1)",
    "https://porkbun.com/?token=secret", "https://porkbun.com/?domain=other.com", "https://porkbun.com/?domain=nordkit.com&domain=nordkit.com",
    "https://porkbun.com/#token", "http://porkbun.com/", "https://porkbun.com:8443/", "https://user:secret@porkbun.com/"]) {
    assertNoSuggestions(present([row("nordkit.com", { registrarOffers: [offer({ purchaseUrl })] })]), purchaseUrl);
  }
  const cloudflare = offer({ providerId: "cloudflare", dataSource: "tldes_price_feed", priceSourceUrl: "https://tldes.com/docs/api-reference.html",
    purchaseUrl: "https://domains.cloudflare.com/?domain=nordkit.com" });
  assert.equal(present([row("nordkit.com", { registrarOffers: [cloudflare] })]).provisionalItems[0].offer.purchaseUrl, "https://domains.cloudflare.com/?domain=nordkit.com");
});

test("one domain gets one best suitable offer; confirmed evidence ranks before estimates", () => {
  const loopia = offer({ providerId: "loopia", registrar: "Loopia", purchaseUrl: "https://www.loopia.se/domannamn/",
    priceSourceUrl: "https://www.loopia.se/domannamn/detaljerad_prislista/", dataSource: "loopia_public_price_list", registrationPrice: 8 });
  assert.equal(present([row("nordkit.com", { registrarOffers: [offer(), loopia] })]).provisionalItems[0].offer.providerId, "loopia");
  assert.equal(present([row("nordkit.com", { registrarOffers: [loopia, exact("nordkit.com", { registrationPrice: 18 })] })]).items[0].offer.price.amount, 18);
  const result = present([row("highscore.com", { namingScore: 100 }), row("exact.com", { namingScore: 10, registrarOffers: [exact("exact.com")] }),
    row("lowerscore.com", { namingScore: 60 })], { count: 2 });
  assert.deepEqual(result.items.map(item => item.domain), ["exact.com"]);
  assert.deepEqual(result.provisionalItems.map(item => item.domain), ["highscore.com", "lowerscore.com"]);
  assert.equal(result.confirmedCount, 1); assert.equal(result.conditionalCount, 2); assert.equal(result.provisionalCount, 2);
  assert.equal(result.returnedCount, 1); assert.equal(result.shortfall, 1); assert.equal(result.status, "partial");
});

test("tie ordering is deterministic, invalid score is null, and fallback offer is supported", () => {
  const result = present([row("bravo.com"), row("alpha.com"), row("invalid.com", { namingScore: Infinity }),
    row("cheaper.com", { registrarOffers: [offer({ registrationPrice: 5 })] }),
    row("fallback.com", { registrarOffers: undefined, registrarOffer: offer(), namingScore: 90 })]);
  assert.deepEqual(result.provisionalItems.map(item => item.domain), ["fallback.com", "cheaper.com", "alpha.com", "bravo.com", "invalid.com"]);
  assert.equal(result.provisionalItems.at(-1)?.namingScore, null);
});

test("extension estimates can never complete a shortlist, even when enough estimates exist", () => {
  const rows = Array.from({ length: 15 }, (_, index) => row(`idea${index}.com`));
  for (const count of [1, 5, 10]) {
    const result = present(rows, { count });
    assert.equal(result.status, "empty");
    assert.equal(result.returnedCount, 0); assert.equal(result.confirmedCount, 0);
    assert.equal(result.shortfall, count); assert.deepEqual(result.items, []);
    assert.equal(result.provisionalCount, 10); assert.equal(result.conditionalCount, 10);
    assert.equal(result.provisionalItems.length, 10);
    assert.ok(result.provisionalItems.every(item => item.evidenceType === "conditional_tld_estimate"));
  }
});

test("confirmed and provisional lists have independent caps, with no domain counted twice", () => {
  const confirmed = Array.from({ length: 15 }, (_, index) => row(`quoted${index}.com`, {
    namingScore: index, registrarOffers: [offer({ registrationPrice: 1 }), exact(`quoted${index}.com`)],
  }));
  const provisional = Array.from({ length: 15 }, (_, index) => row(`idea${index}.com`, { namingScore: 100 - index }));
  for (const count of [1, 7, 10]) {
    const result = present([...provisional, ...confirmed], { count });
    assert.equal(result.status, "complete"); assert.equal(result.returnedCount, count);
    assert.equal(result.confirmedCount, count); assert.equal(result.shortfall, 0);
    assert.equal(result.items.length, count); assert.equal(result.provisionalCount, 10);
    assert.equal(result.conditionalCount, 10); assert.equal(result.provisionalItems.length, 10);
    assert.ok(result.items.every(item => item.evidenceType === "confirmed_exact_offer"));
    assert.ok(result.provisionalItems.every(item => item.evidenceType === "conditional_tld_estimate"));
    assert.equal(new Set([...result.items, ...result.provisionalItems].map(item => item.domain)).size, count + 10);
    assert.equal(result.items[0].domain, "quoted14.com");
    assert.equal(result.provisionalItems[0].domain, "idea0.com");
  }
});

test("an invalid exact offer may remain provisional but never masquerades as a confirmed budget match", () => {
  const result = present([row("nordkit.com", { registrarOffers: [offer(), exact("nordkit.com", { availability: "unknown" })] })], { count: 1 });
  assert.equal(result.status, "empty"); assert.equal(result.returnedCount, 0); assert.equal(result.shortfall, 1);
  assert.equal(result.confirmedCount, 0); assert.equal(result.provisionalCount, 1);
  assert.equal(result.provisionalItems[0].evidenceType, "conditional_tld_estimate");
});

test("empty and partial outputs quantify exclusions without inventing names or rates", () => {
  const result = present([row("pricey.com", { registrarOffers: [offer({ registrationPrice: 21 })] }),
    row("unknown.com", { registrarOffers: [] }), row("taken.com", { status: "taken" })]);
  assert.deepEqual(result.exclusions, { over_budget: 1, unpriced: 1, not_available: 1 });
  assert.equal(result.status, "empty"); assert.equal(result.shortfall, 10);
  assertNoSuggestions(result);
  assert.equal(present([]).status, "empty");
});

test("projection is pure, bounded, and rejects malformed engine payloads without echoing data", () => {
  const payload = { results: [row()] }, input = request(), snapshot = JSON.stringify({ payload, input, fx });
  presentConnectorShortlist(payload, input, { now, referenceFx: fx });
  assert.equal(JSON.stringify({ payload, input, fx }), snapshot);
  for (const value of [null, [], {}, { results: "secret" }, { results: Array(201).fill(row()) }]) {
    assert.throws(() => presentConnectorShortlist(value, input, { now }), /^Error: Invalid search-engine response\.$/);
  }
  assert.throws(() => presentConnectorShortlist(payload, input, { now: NaN }));
  const result = present([row("nordkit.com", { rationale: "x\u0000y" + "a".repeat(1000) })]);
  assert.equal(result.provisionalItems[0].rationale.length, 240);
  assert.ok(!result.provisionalItems[0].rationale.includes("\u0000"));
});
