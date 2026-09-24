import assert from "node:assert/strict";
import test from "node:test";
import {
  buildNamePackageMarketCoverage, DEFAULT_NAME_PACKAGE_MARKETS, EU_NAME_PACKAGE_MARKETS,
  NAME_PACKAGE_MARKET_CODES, NAME_PACKAGE_MARKET_CATALOG_VERSION,
  namePackageMarketCoverageSchema, normalizeNamePackageMarkets,
} from "../shared/name-package-markets";

test("EU is a 27-country preset, not a fictional corporate register jurisdiction", () => {
  assert.equal(EU_NAME_PACKAGE_MARKETS.length, 27);
  assert.equal(new Set(EU_NAME_PACKAGE_MARKETS).size, 27);
  assert.equal(DEFAULT_NAME_PACKAGE_MARKETS.length, 28);
  assert.equal(DEFAULT_NAME_PACKAGE_MARKETS[0], "US");
  assert.ok(!NAME_PACKAGE_MARKET_CODES.some(code => String(code) === "EU"));
});

test("market normalization is deterministic, bounded and never broadens invalid input", () => {
  assert.deepEqual(normalizeNamePackageMarkets(["DE", "US", "SE", "US"]), ["US", "DE", "SE"]);
  for (const value of [[], ["EU"], ["UK"], ["us"], ["ZZ"], [" SE"], ["US", "ZZ"], new Array(100).fill("US"), null]) {
    assert.throws(() => normalizeNamePackageMarkets(value as string[]));
  }
  assert.deepEqual(normalizeNamePackageMarkets(), DEFAULT_NAME_PACKAGE_MARKETS);
});

test("every selectable country has explicitly manual official review paths, not false clearance", () => {
  const result = buildNamePackageMarketCoverage(NAME_PACKAGE_MARKET_CODES);
  assert.equal(result.catalog_version, NAME_PACKAGE_MARKET_CATALOG_VERSION);
  assert.equal(result.requested_markets.length, NAME_PACKAGE_MARKET_CODES.length);
  assert.deepEqual(result.checked_markets, []);
  assert.equal(result.automated_checks_available, false);
  assert.equal(result.checks.length, NAME_PACKAGE_MARKET_CODES.length);
  for (const check of result.checks) {
    assert.equal(check.company.status, "not_checked");
    assert.equal(check.trademark.status, "not_checked");
    assert.ok(check.required_follow_up.includes("not_legal_clearance"));
    for (const source of [...check.company.sources, ...check.trademark.sources]) {
      const url = new URL(source.url);
      assert.equal(url.protocol, "https:");
      assert.equal(url.username, ""); assert.equal(url.password, "");
      assert.equal(source.access, "manual");
      assert.equal(source.reviewed_on, "2026-09-13");
      assert.ok(!("verified_at" in source)); assert.ok(!("observed_at" in source));
    }
  }
});

test("US federal trademarks do not pretend to clear state company names or unregistered rights", () => {
  const us = buildNamePackageMarketCoverage(["US"]).checks[0];
  assert.equal(us.company.sources[0].scope, "state_company_registration_guidance");
  assert.equal(us.trademark.sources[0].scope, "federal_trademark_search");
  assert.ok(us.required_follow_up.includes("choose_us_state"));
  assert.ok(us.required_follow_up.includes("state_and_unregistered_rights"));
});

test("EU and EEA coverage are distinct, and no WIPO collection claims worldwide completeness", () => {
  const result = buildNamePackageMarketCoverage(["SE", "DE", "NO"]);
  for (const check of result.checks.filter(check => check.market !== "NO")) {
    assert.ok(check.required_follow_up.includes("national_and_regional_trademarks"));
    assert.ok(check.trademark.sources.some(source => source.name.includes("EUIPO")));
  }
  const no = result.checks.find(check => check.market === "NO")!;
  assert.ok(!no.trademark.sources.some(source => source.scope === "regional_trademark_search"));
  for (const check of buildNamePackageMarketCoverage(NAME_PACKAGE_MARKET_CODES).checks) {
    if (check.trademark.sources.some(source => source.scope === "participating_trademark_collections")) {
      assert.ok(check.required_follow_up.includes("participating_collections_only"));
    }
  }
});

test("coverage schema cannot claim automated or completed legal checking", () => {
  const result = buildNamePackageMarketCoverage(["US"]);
  assert.ok(namePackageMarketCoverageSchema.safeParse(result).success);
  assert.ok(!namePackageMarketCoverageSchema.safeParse({ ...result, checked_markets: ["US"] }).success);
  assert.ok(!namePackageMarketCoverageSchema.safeParse({ ...result, automated_checks_available: true }).success);
  assert.ok(!namePackageMarketCoverageSchema.safeParse({ ...result, checks: [{ ...result.checks[0], company: { ...result.checks[0].company, status: "available" } }] }).success);
  assert.ok(!namePackageMarketCoverageSchema.safeParse({ ...result, requested_markets: ["US", "SE"] }).success);
  assert.ok(!namePackageMarketCoverageSchema.safeParse({ ...result, checks: [...result.checks, ...result.checks] }).success);
});

test("additional countries preserve restricted directory scope instead of implying complete coverage", () => {
  const result = buildNamePackageMarketCoverage(["GB", "CH", "CA", "AU", "NZ", "SG", "JP"]);
  assert.equal(NAME_PACKAGE_MARKET_CODES.length, 38);
  assert.equal(result.checks.length, 7);
  const canada = result.checks.find(check => check.market === "CA")!;
  assert.ok(canada.required_follow_up.includes("subnational_register_coverage"));
  const japan = result.checks.find(check => check.market === "JP")!;
  assert.ok(japan.required_follow_up.includes("language_limited_directory"));
  assert.equal(japan.company.sources[0].scope, "corporate_identity_directory");
});

test("coverage is independent and cannot be contaminated by a previous caller", () => {
  const first = buildNamePackageMarketCoverage(["US"]);
  first.checks[0].company.sources[0].name = "changed by caller";
  first.requested_markets.length = 0;
  const second = buildNamePackageMarketCoverage(["US"]);
  assert.deepEqual(second.requested_markets, ["US"]);
  assert.ok(!JSON.stringify(second).includes("changed by caller"));
});
