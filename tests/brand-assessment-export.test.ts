import assert from "node:assert/strict";
import test from "node:test";
import { load } from "cheerio";
import { exportBrandAssessment } from "../src/lib/brandAssessmentExport";
import { brandWorksheetCopy } from "../src/i18n/brandWorksheetCopy";
import { brandEvidenceCopy } from "../src/i18n/brandEvidenceCopy";
import { brandIndexInputSchema, type BrandIndexInput } from "../shared/brand-presence-index";
import { brandEvidenceReportSchema } from "../shared/brand-evidence";
import type { PackageDomainInput } from "../shared/name-packages";

const at = Date.parse("2026-10-07T12:00:00.000Z"), original = "2026-10-07T11:59:00.000Z";
const input: BrandIndexInput = { brand_name: "Example <script>alert('x')</script>", identity_label: "examplebrand", primary_domain: "examplebrand.com",
  domains: ["examplebrand.com", "examplebrand.net"], socials: [{ platform: "github", handle: "examplebrand" }], markets: ["US", "FR"],
  observations: [{ target_id: "domain:examplebrand.com", status: "reported_owned", source_url: "https://example.com/ownership", reported_at: original }] };
const rows: PackageDomainInput[] = [{ domain: "examplebrand.com", status: "taken", availabilityVerified: true, checkMethod: "rdap", checkedAt: original, source: "verisign-rdap" }];

test("local worksheet export is inert, lossless for recorded scope and explicit in all five languages", () => {
  for (const language of ["en", "sv", "es", "fr", "zh"] as const) {
    const html = exportBrandAssessment(input, rows, language, at), $ = load(html), wc = brandWorksheetCopy[language], ec = brandEvidenceCopy[language];
    assert.equal($("html").attr("lang"), language);
    assert.ok($("body").text().includes(wc.localBoundary)); assert.ok($("body").text().includes(ec.boundary));
    assert.equal($("script,iframe,img,link,form").length, 0); assert.equal($("meta[http-equiv='Content-Security-Policy']").attr("content"), "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'");
    for (const state of ["checked", "reported", "listed", "unknown"]) assert.equal($(`[data-evidence-group='${state}']`).length, 1);
    const portable = JSON.parse($("[data-portable-brand-assessment]").text());
    assert.deepEqual(brandIndexInputSchema.parse(portable.input), brandIndexInputSchema.parse(input));
    const evidence = brandEvidenceReportSchema.parse(portable.evidence_report);
    assert.equal(evidence.summary.checked, 1); assert.equal(evidence.summary.reported, 1); assert.equal(evidence.summary.listed, 0);
    assert.equal(evidence.ownership_verified, false); assert.equal(evidence.legal_clearance, false); assert.equal(evidence.continuous_monitoring, false);
    assert.equal(portable.assessment.index.verified_score, null);
    assert.equal(evidence.entries.find(entry => entry.id === "report:domain:examplebrand.com")?.observed_at, original);
    assert.equal(evidence.entries.find(entry => entry.id === "check:domain:examplebrand.com")?.observed_at, original);
    assert.equal($(`[data-evidence-entry='report:domain:examplebrand.com'] a`).attr("href"), "https://example.com/ownership");
    assert.equal($(`[data-evidence-entry='check:domain:examplebrand.com'] a`).attr("href"), "https://rdap.verisign.com/com/v1/domain/examplebrand.com");
    assert.ok($("body").text().includes(input.brand_name)); assert.doesNotMatch(html, /<script>alert/);
    assert.equal($("[data-evidence-entry='check:domain:examplebrand.net']").attr("data-evidence-state"), "unknown");
  }
});

test("export ages evidence without refreshing dates or converting reports to verified checks", () => {
  const $ = load(exportBrandAssessment(input, rows, "en", at + 31 * 24 * 60 * 60_000));
  const portable = JSON.parse($("[data-portable-brand-assessment]").text());
  assert.equal(portable.evidence_report.summary.checked, 0); assert.equal(portable.evidence_report.summary.reported, 0);
  for (const id of ["report:domain:examplebrand.com", "check:domain:examplebrand.com"]) {
    const row = portable.evidence_report.entries.find((entry: { id: string }) => entry.id === id);
    assert.equal(row.state, "unknown"); assert.equal(row.freshness, "stale"); assert.equal(row.observed_at, original);
    assert.equal($(`[data-evidence-entry='${id}'] time`).attr("datetime"), original);
  }
  assert.equal(portable.assessment.index.reported_score, null);
  assert.throws(() => exportBrandAssessment(input, rows, "en", NaN), /time/);
  assert.throws(() => exportBrandAssessment(input, [{ ...rows[0], domain: "unrequested.com" }], "en", at), /domain_response/);
});
