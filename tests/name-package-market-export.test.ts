import assert from "node:assert/strict";
import test from "node:test";
import { load } from "cheerio";
import { buildNamePackages } from "../shared/name-packages";
import { buildNamePackageMarketCoverage, DEFAULT_NAME_PACKAGE_MARKETS, NAME_PACKAGE_MARKET_CODES, type NamePackageMarketCode } from "../shared/name-package-markets";
import { exportNamePackageReport } from "../src/lib/namePackageExport";
import { marketCountText, namePackageCountryName, namePackageMarketsCopy } from "../src/i18n/namePackageMarketsCopy";

test("country names are localized and safely fall back to their ISO code", () => {
  for (const language of ["en", "sv", "es", "fr", "zh"]) {
    const countries = NAME_PACKAGE_MARKET_CODES.map(code => namePackageCountryName(code, language));
    assert.equal(countries.length, NAME_PACKAGE_MARKET_CODES.length);
    assert.ok(countries.every(country => typeof country === "string" && country.length > 0));
  }
  assert.equal(namePackageCountryName("US", "not a locale"), "US");
  assert.equal(marketCountText("0 / {count}", 38), "0 / 38");
});

test("exports contain exactly the chosen manual review sources once, never checked markets or name queries", () => {
  const stamp = "2026-09-13T12:00:00.000Z";
  const packages = buildNamePackages([
    { domain: "nomera.com", status: "available", availabilityVerified: true, checkMethod: "rdap", source: "fixture", checkedAt: stamp },
    { domain: "tavora.com", status: "available", availabilityVerified: true, checkMethod: "rdap", source: "fixture", checkedAt: stamp },
  ], { platforms: [], observedAt: stamp, now: Date.parse(stamp) });
  const before = JSON.stringify(packages);
  const selections: (readonly NamePackageMarketCode[] | undefined)[] = [undefined, ["US"], ["US", "SE", "DE"], ["CA", "JP"], NAME_PACKAGE_MARKET_CODES];
  for (const language of ["en", "sv", "es", "fr", "zh"] as const) for (const markets of selections) {
    const report = exportNamePackageReport(packages, language, stamp, markets);
    const $ = load(report), c = namePackageMarketsCopy[language], coverage = buildNamePackageMarketCoverage(markets);
    assert.equal($("#package-market-review").length, 1);
    assert.equal($("[data-market]").length, markets?.length ?? DEFAULT_NAME_PACKAGE_MARKETS.length);
    assert.ok($("#package-market-review").text().includes(marketCountText(c.coverage, coverage.requested_markets.length)));
    assert.ok($("#package-market-review").text().includes(c.incomplete));
    for (const check of coverage.checks) {
      const section = $(`[data-market="${check.market}"]`);
      assert.ok(section.text().includes(namePackageCountryName(check.market, language)));
      assert.ok(section.text().includes(c.notChecked));
      assert.deepEqual(section.find("a").map((_, node) => $(node).attr("href")).get(), [...check.company.sources, ...check.trademark.sources].map(source => source.url));
      assert.ok(section.text().includes(c.catalogDate));
      for (const code of check.required_follow_up) assert.ok(section.text().includes(c.followUps[code]));
    }
    for (const source of $("#package-market-review a").toArray()) {
      const href = $(source).attr("href")!;
      assert.ok(href.startsWith("https://")); assert.ok(!href.includes("nomera") && !href.includes("tavora"));
    }
    assert.equal($("article a[href^='https://']").length, 0, "Legal source directories are not repeated per candidate");
    assert.equal($("article a[href='#package-market-review']").length, packages.length * 2);
    assert.equal($("script,img,iframe,form").length, 0);
    assert.equal(JSON.stringify(packages), before, "Market selection changes neither evidence dates nor scores");
  }
});
