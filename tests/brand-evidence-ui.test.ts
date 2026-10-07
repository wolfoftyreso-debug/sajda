import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { createServer } from "vite";
import { BRAND_EVIDENCE_STATEMENTS, createBrandEvidenceReport, type BrandEvidenceEntry } from "../shared/brand-evidence";
import { brandEvidenceCopy } from "../src/i18n/brandEvidenceCopy";
import { applyPackageObservations, buildNamePackages, NAME_PACKAGE_EVIDENCE_MAX_AGE_MS } from "../shared/name-packages";
import { exportNamePackageReport } from "../src/lib/namePackageExport";
import { namePackagesCopy } from "../src/i18n/namePackagesCopy";
import { brandWorkspaceCopy } from "../src/i18n/brandWorkspaceCopy";
import { brandIndexCopy } from "../src/i18n/brandIndexCopy";

const now = Date.parse("2026-10-07T12:00:00Z"), at = new Date(now).toISOString();
const entries: BrandEvidenceEntry[] = [
  { id: "check:domain:example.com", target: "example.com", kind: "domain", state: "checked", freshness: "current", source_url: "https://rdap.verisign.com/com/v1/domain/example.com", observed_at: at, statement: "domain_registered", origin: "provider_observation" },
  { id: "report:market:US", target: "US", kind: "market", state: "reported", freshness: "current", source_url: null, observed_at: at, statement: "reported_authorized", origin: "user_report" },
  { id: "listed:Q901$web", target: "https://example.com", kind: "domain", state: "listed", freshness: "current", source_url: "https://www.wikidata.org/wiki/Q901#P856", observed_at: at, statement: "source_lists_website", origin: "source_assertion" },
  { id: "check:domain:oldexample.com", target: "oldexample.com", kind: "domain", state: "checked", freshness: "current", source_url: null, observed_at: new Date(now - NAME_PACKAGE_EVIDENCE_MAX_AGE_MS - 1).toISOString(), statement: "domain_available", origin: "provider_observation" },
  { id: "monitoring:example", target: "example", kind: "monitoring", state: "unknown", freshness: "unknown", source_url: null, observed_at: null, statement: "continuous_monitoring_not_active", origin: "none" },
];

test("evidence panel separates all four sources without turning source retrieval into verification", async () => {
  const vite = await createServer({ configFile: false, appType: "custom", server: { middlewareMode: true, watch: null, hmr: false, ws: false }, resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" } });
  try {
    const Panel = (await vite.ssrLoadModule("/src/components/BrandEvidencePanel.tsx")).default;
    const { BrandIndexSummary } = await vite.ssrLoadModule("/src/components/BrandIndexSummary.tsx");
    const report = createBrandEvidenceReport(entries, now);
    for (const language of ["en", "sv", "es", "fr", "zh"] as const) {
      const c = brandEvidenceCopy[language], html = renderToStaticMarkup(h(Panel, { report, language, compact: true, headingLevel: "h5" })), $ = load(html);
      assert.equal($("h5").text(), c.title);
      assert.equal($("[data-evidence-count='checked'] dd").text(), "1");
      assert.equal($("[data-evidence-count='reported'] dd").text(), "1");
      assert.equal($("[data-evidence-count='listed'] dd").text(), "1");
      assert.equal($("[data-evidence-count='unknown'] dd").text(), "2");
      assert.equal($("[data-evidence-state='checked']").length, 1);
      assert.ok($("[data-evidence-coverage]").text().includes("20"));
      assert.equal($("[data-evidence-scope]").text(), c.scope);
      assert.equal($("[data-evidence-boundary]").text(), c.boundary);
      const stale = $("[data-evidence-entry='check:domain:oldexample.com']");
      assert.equal(stale.attr("data-evidence-state"), "unknown");
      assert.ok(stale.text().includes(c.freshness.stale));
      const listed = $("[data-evidence-state='listed']");
      assert.ok(listed.text().includes(c.sourceRetrieved));
      assert.ok(listed.text().includes(c.currentSource));
      assert.ok(!listed.text().includes(`${c.observed}:`));
      assert.ok($("[data-evidence-state='reported']").text().includes(c.reportedAt));
      assert.equal($("time").length, 4);
      assert.equal($("details").attr("open"), undefined, "Details are available without an initial wall of text");
      assert.equal($("summary").length, 1);
      assert.ok($("a").toArray().every(node => $(node).attr("rel") === "noopener noreferrer"));
      assert.ok(html.includes("grid-cols-2") && html.includes("sm:grid-cols-4"));
      assert.deepEqual(Object.keys(c.statements).sort(), [...BRAND_EVIDENCE_STATEMENTS].sort());
    }
    const forged = { ...report, entries: report.entries.map(entry => ({ ...entry, target: '<script>alert("x")</script>', source_url: "javascript:alert(1)" })) };
    const unsafe = renderToStaticMarkup(h(Panel, { report: forged, language: "en" }));
    assert.equal(load(unsafe)("a").length, 0);
    assert.ok(!unsafe.includes("<script>") && unsafe.includes("&lt;script&gt;"));
    const pkg = buildNamePackages([{ domain: "example.com", status: "available", availabilityVerified: true, checkMethod: "rdap", checkedAt: at }], { platforms: ["github"], observedAt: null, now })[0];
    const candidate = load(renderToStaticMarkup(h(BrandIndexSummary, { pkg, language: "en", now })));
    assert.equal(candidate("[data-candidate-brand-index] [data-brand-evidence]").length, 1);
    assert.equal(candidate("[data-evidence-count='checked'] dd").text(), "1");
    assert.equal(candidate("[data-evidence-count='unknown'] dd").text(), "5");
    assert.equal(candidate("[data-evidence-coverage]").length, 1);
    assert.ok(!candidate("[data-candidate-brand-index]").text().includes(brandWorkspaceCopy.en.coverage), "The candidate has one explicit ledger denominator, not conflicting legacy coverage");
    const old = load(renderToStaticMarkup(h(BrandIndexSummary, { pkg, language: "en", now: now + NAME_PACKAGE_EVIDENCE_MAX_AGE_MS + 1 })));
    assert.equal(old("[data-evidence-count='checked'] dd").text(), "0", "Candidate summary ages its evidence at read time");
    assert.equal(old("[data-evidence-count='unknown'] dd").text(), "6");
  } finally { await vite.close(); }
});

test("saved-package HTML exports recompute all dated evidence and score parts at export time", () => {
  const original = buildNamePackages([{ domain: "example.com", status: "available", availabilityVerified: true, checkMethod: "rdap", checkedAt: at, source: "https://rdap.verisign.com/com/v1/domain/example.com", namingScore: 90 }], { platforms: ["github"], observedAt: null, now })[0];
  const pkg = applyPackageObservations(original, [{ platform: "github", handle: "example", status: "profile_found", checkedAt: at, sourceUrl: "https://api.github.com/users/example" }], now);
  const before = JSON.stringify(pkg), later = new Date(now + NAME_PACKAGE_EVIDENCE_MAX_AGE_MS + 1).toISOString();
  const current = load(exportNamePackageReport([pkg], "en", at));
  assert.equal(current("article [data-evidence-count='checked'] dd").text(), "2");
  for (const language of ["en", "sv", "es", "fr", "zh"] as const) {
    const $ = load(exportNamePackageReport([pkg], language, later)), c = namePackagesCopy[language], ec = brandEvidenceCopy[language];
    assert.equal($("article [data-evidence-count='checked'] dd").text(), "0");
    assert.equal($("article [data-evidence-state='checked']").length, 0);
    assert.equal($("article [data-evidence-count='unknown'] dd").text(), "6");
    assert.ok($("article").text().includes(c.stale));
    assert.ok(!$("article").text().includes(`— ${c.available}`));
    assert.ok(!$("article").text().includes(`— ${c.profileFound}`));
    assert.ok($("article").text().includes(`${c.domainPart}: 0/30`));
    assert.equal($("article [data-evidence-coverage]").length, 1);
    assert.ok(!$("article").text().includes(c.evidence), "Legacy verification coverage is not repeated with another denominator");
    assert.ok($("article [data-evidence-boundary]").text().includes(ec.boundary));
    const oldSocial = $("article [data-evidence-entry='check:social:github:example']");
    assert.equal(oldSocial.attr("data-evidence-state"), "unknown");
    assert.equal(oldSocial.find("time").attr("datetime"), at, "Old source observations remain inspectable, not refreshed");
    assert.ok(oldSocial.text().includes(ec.freshness.stale));
    assert.equal($("script,img,iframe,form").length, 0);
    assert.equal($("meta[http-equiv='Content-Security-Policy']").attr("content"), "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'");
  }
  assert.throws(() => exportNamePackageReport([pkg], "en", "not-a-date"), /timestamp/);
  assert.equal(JSON.stringify(pkg), before, "Export does not mutate account data or observation dates");
});

test("ownership/control proof is named separately from checked signals in all five languages", () => {
  const boundaries = { en: /independently.*ownership\/control/iu, sv: /oberoende.*ägande\/kontroll/iu, es: /titularidad\/control.*independiente/iu, fr: /propriété\/contrôle.*indépendamment/iu, zh: /独立核实.*所有权／控制权/u };
  for (const language of ["en", "sv", "es", "fr", "zh"] as const) {
    assert.match(brandIndexCopy[language].verifiedScore, boundaries[language]);
    assert.match(brandIndexCopy[language].verifiedCoverage, boundaries[language]);
    assert.notEqual(brandIndexCopy[language].verifiedCoverage, brandEvidenceCopy[language].checked);
  }
  assert.equal(brandEvidenceCopy.en.statements.reported_authorized, "You reported authorized use. This has not been independently verified and is not legal clearance.");
});
