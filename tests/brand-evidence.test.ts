import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod/v4";
import { buildNamePackages, applyPackageObservations, NAME_PACKAGE_EVIDENCE_MAX_AGE_MS } from "../shared/name-packages.js";
import { assessBrandPresence, brandIndexResultSchema } from "../shared/brand-presence-index.js";
import { getNamePackageBrandIndex } from "../shared/brand-candidate-index.js";
import {
  brandEvidenceEntrySchema, brandEvidenceReportSchema, buildCandidateBrandEvidenceReport,
  buildLookupBrandEvidenceReport, createBrandEvidenceReport, safeBrandEvidenceSourceUrl,
  BRAND_EVIDENCE_REPORT_MAX_AGE_MS, BRAND_EVIDENCE_MAX_ENTRIES,
  brandRegistrySourceUrl,
} from "../shared/brand-evidence.js";
import { lookupFixture } from "./brand-lookup-fixtures.js";
import { brandLookupResultSchema } from "../shared/brand-lookup.js";
import { candidateBrandIndexSchema } from "../shared/brand-candidate-index.js";
import { namePackageIntelligenceSchema, projectNamePackageIntelligence } from "../shared/name-package-intelligence.js";

const now = Date.parse("2026-10-07T12:00:00Z"), at = new Date(now).toISOString();
function pkg() {
  return buildNamePackages([{ domain: "sajdatrusttest.com", status: "available", availabilityVerified: true,
    checkMethod: "rdap", checkedAt: at, source: "https://rdap.verisign.com/com/v1/domain/sajdatrusttest.com" }],
  { platforms: ["github", "instagram"], requiredTlds: ["com", "co.uk"], observedAt: null, now })[0];
}

test("candidate ledger separates checked registry signals from missing social and legal coverage without changing scores", () => {
  const candidate = pkg(), index = getNamePackageBrandIndex(candidate, now), report = index.evidence_report;
  assert.equal(index.score, candidate.packageScore);
  assert.deepEqual(report.summary, { total: 8, checked: 1, reported: 0, listed: 0, unknown: 7, checked_coverage_percent: 12 });
  assert.equal(report.entries[0].statement, "domain_check_unavailable"); // canonical co.uk first, not fabricated evidence
  const checked = report.entries.find(entry => entry.state === "checked")!;
  assert.equal(checked.target, "sajdatrusttest.com"); assert.equal(checked.statement, "domain_available");
  assert.equal(checked.origin, "provider_observation"); assert.equal(checked.observed_at, at);
  assert.equal(report.ownership_verified, false); assert.equal(report.legal_clearance, false); assert.equal(report.continuous_monitoring, false);
});

test("a dated DNS/timeout attempt, missing registry date or unsupported alternative cannot mint checked evidence", () => {
  for (const input of [
    { status: "unknown" as const, checkMethod: "rdap", availabilityVerified: false, checkedAt: at },
    { status: "available" as const, checkMethod: "dns", availabilityVerified: true, checkedAt: at },
    { status: "available" as const, checkMethod: "rdap", availabilityVerified: true, checkedAt: null },
  ]) {
    const candidate = buildNamePackages([{ domain: "sajdatrusttest.com", ...input }], { platforms: [], observedAt: at, now })[0];
    assert.equal(buildCandidateBrandEvidenceReport(candidate, now).summary.checked, 0);
  }
});

test("GitHub profile presence and absence are narrow observations, never registration or identity ownership", () => {
  for (const status of ["profile_found", "not_found"] as const) {
    const candidate = applyPackageObservations(pkg(), [{ platform: "github", handle: "sajdatrusttest", status, checkedAt: at,
      sourceUrl: "https://api.github.com/users/sajdatrusttest" }], now);
    const report = buildCandidateBrandEvidenceReport(candidate, now);
    assert.equal(report.summary.checked, 2);
    assert.equal(report.entries.find(entry => entry.kind === "social" && entry.state === "checked")?.statement,
      status === "profile_found" ? "social_profile_found" : "social_profile_not_found");
    assert.equal(report.ownership_verified, false); assert.equal(candidate.scoreParts.socials.score, 0);
  }
});

test("registry evidence expires at read time; a fresh report or persisted readiness never renews it", () => {
  const candidate = pkg(), later = now + NAME_PACKAGE_EVIDENCE_MAX_AGE_MS + 1;
  const expired = getNamePackageBrandIndex({ ...candidate, observedAt: new Date(later).toISOString(), packageScore: 70 }, later);
  assert.equal(expired.evidence_report.summary.checked, 0);
  const original = expired.evidence_report.entries.find(entry => entry.target === "sajdatrusttest.com")!;
  assert.equal(original.freshness, "stale"); assert.equal(original.origin, "provider_observation"); assert.equal(original.state, "unknown");
  assert.equal(original.observed_at, at);
});

test("audited registry identifiers retain source and original time across repeated stale projections", () => {
  const original = pkg(); original.domains.find(domain => domain.domain.endsWith(".com"))!.source = "verisign-rdap";
  const later = now + NAME_PACKAGE_EVIDENCE_MAX_AGE_MS + 1;
  const stale = buildNamePackages(original.domains, { platforms: ["github"], observedAt: null, now: later })[0];
  const rebuilt = buildNamePackages(stale.domains, { platforms: ["github"], observedAt: null, now: later })[0];
  assert.equal(rebuilt.domains.find(domain => domain.domain.endsWith(".com"))!.checkMethod, "none");
  for (const candidate of [original, stale, rebuilt]) {
    const report = getNamePackageBrandIndex(candidate, later).evidence_report;
    const domain = report.entries.find(entry => entry.target === "sajdatrusttest.com")!;
    assert.equal(domain.state, "unknown"); assert.equal(domain.freshness, "stale"); assert.equal(domain.origin, "provider_observation");
    assert.equal(domain.observed_at, at); assert.equal(domain.source_url, "https://rdap.verisign.com/com/v1/domain/sajdatrusttest.com");
    assert.equal(report.summary.checked, 0);
  }
  assert.equal(brandRegistrySourceUrl("sajdatrusttest.net", "verisign-rdap", "rdap"), "https://rdap.verisign.com/net/v1/domain/sajdatrusttest.net");
  for (const [domain, source, method] of [["sajdatrusttest.org", "verisign-rdap", "rdap"], ["sajdatrusttest.com", "unknown-registry", "rdap"],
    ["sajdatrusttest.com", "verisign-rdap", "dns"], ["sub.sajdatrusttest.com", "verisign-rdap", "rdap"]]) {
    assert.equal(brandRegistrySourceUrl(domain, source, method), null);
  }
});

test("future registry timestamps remain unknown instead of extending the evidence lifetime", () => {
  const candidate = pkg(); candidate.domains.find(domain => domain.domain.endsWith(".com"))!.checkedAt = new Date(now + 1).toISOString();
  const report = buildCandidateBrandEvidenceReport(candidate, now);
  assert.equal(report.summary.checked, 0); assert.equal(report.entries.find(entry => entry.target.endsWith(".com"))!.freshness, "future");
});

test("a 100-point self-assessment remains reported, including when its source looks official", () => {
  const scope = { brand_name: "Sajda Trust Test", identity_label: "sajdatrusttest", primary_domain: "sajdatrusttest.com",
    domains: ["sajdatrusttest.com"], socials: [{ platform: "github", handle: "sajdatrusttest" }], markets: ["US"] };
  const observations = ["domain:sajdatrusttest.com", "social:github:sajdatrusttest", "market:US"].map(target_id => ({
    target_id, status: "reported_owned", source_url: "https://www.sec.gov/", reported_at: at,
  }));
  const result = assessBrandPresence({ ...scope, observations }, now);
  assert.equal(result.index.reported_score, 100); assert.equal(result.index.verified_score, null);
  assert.deepEqual(result.evidence_report.summary, { total: 7, checked: 0, reported: 3, listed: 0, unknown: 4, checked_coverage_percent: 0 });
  assert.ok(result.evidence_report.entries.filter(entry => entry.state === "reported").every(entry => entry.origin === "user_report"));
  const expired = assessBrandPresence({ ...scope, observations }, now + BRAND_EVIDENCE_REPORT_MAX_AGE_MS + 1);
  assert.equal(expired.evidence_report.summary.reported, 0); assert.equal(expired.evidence_report.summary.unknown, 7);
});

test("third-party listings preserve exact evidence references and never enter checked coverage", async () => {
  const profile = await lookupFixture({ operation: "profile", entity_id: "Q901" });
  assert.equal(profile.operation, "profile"); if (profile.operation !== "profile") assert.fail();
  const report = buildLookupBrandEvidenceReport(profile, Date.parse(profile.retrieved_at));
  assert.equal(report.summary.listed, 1); assert.equal(report.summary.checked, 0); assert.equal(report.summary.checked_coverage_percent, 0);
  assert.equal(report.entries[0].source_url, "https://www.wikidata.org/wiki/Q901#P856");
  assert.equal(report.entries[0].origin, "source_assertion"); assert.equal(report.entries[0].observed_at, profile.retrieved_at);
  assert.equal(buildLookupBrandEvidenceReport(profile, Date.parse(profile.retrieved_at) + NAME_PACKAGE_EVIDENCE_MAX_AGE_MS + 1).summary.listed, 0);
});

test("profile and self-assessment outputs cannot import another entity's report or forged provider checks", async () => {
  const profile = await lookupFixture({ operation: "profile", entity_id: "Q901" });
  if (profile.operation !== "profile") assert.fail();
  const foreign = await lookupFixture({ operation: "profile", entity_id: "Q902" });
  if (foreign.operation !== "profile") assert.fail();
  assert.equal(brandLookupResultSchema.safeParse({ ...profile, evidence_report: foreign.evidence_report }).success, false);
  const provider = getNamePackageBrandIndex(pkg(), now).evidence_report;
  assert.equal(brandLookupResultSchema.safeParse({ ...profile, evidence_report: provider }).success, false);
  const self = assessBrandPresence({ brand_name: "Sajda Trust Test", identity_label: "sajdatrusttest", primary_domain: "sajdatrusttest.com",
    domains: ["sajdatrusttest.com"], socials: [{ platform: "github", handle: "sajdatrusttest" }], markets: ["US"] }, now);
  assert.equal(brandIndexResultSchema.safeParse({ ...self, evidence_report: provider }).success, false);
});

test("duplicate package domain rows do not multiply checked items or throw during index projection", () => {
  const candidate = pkg(); candidate.domains.push({ ...candidate.domains.find(domain => domain.domain.endsWith(".com"))! });
  const index = getNamePackageBrandIndex(candidate, now);
  assert.equal(index.evidence_report.summary.checked, 1); assert.equal(index.evidence_report.summary.total, 8);
});

test("candidate schemas and package envelopes cannot import another identity's ledger", () => {
  const first = getNamePackageBrandIndex(pkg(), now);
  const other = buildNamePackages([{ domain: "othertrustname.com", status: "available", availabilityVerified: true, checkMethod: "rdap", checkedAt: at }],
    { platforms: ["github"], observedAt: null, now })[0];
  const second = getNamePackageBrandIndex(other, now);
  assert.equal(candidateBrandIndexSchema.safeParse({ ...first, evidence_report: second.evidence_report }).success, false);
  const response = projectNamePackageIntelligence({ results: [{ domain: "sajdatrusttest.com", status: "available", authoritative: true, checkMethod: "rdap", checkedAt: at }] },
    { platforms: ["github"], requiredTlds: ["com"], now });
  assert.equal(namePackageIntelligenceSchema.safeParse({ ...response, packages: [{ ...response.packages[0], brand_index: second }] }).success, false);
  assert.equal(candidateBrandIndexSchema.safeParse({ ...first, signals: { ...first.signals, availableDomains: 2 } }).success, false);
});

test("foreign social observations cannot enter the candidate ledger or checked counts", () => {
  const candidate = pkg(), observed = applyPackageObservations(buildNamePackages([{ domain: "othertrustname.com", status: "unknown", availabilityVerified: false, checkMethod: "none" }],
    { platforms: ["github"], observedAt: null, now })[0], [{ platform: "github", handle: "othertrustname", status: "profile_found", checkedAt: at,
      sourceUrl: "https://api.github.com/users/othertrustname" }], now);
  const result = getNamePackageBrandIndex({ ...candidate, socials: observed.socials }, now);
  assert.equal(result.evidence_report.summary.checked, 1); assert.equal(result.signals.observedProfiles, 0);
  assert.ok(result.evidence_report.entries.every(entry => !entry.target.includes("othertrustname")));
});

test("unknown entries cannot relabel expired/future evidence as current or change statement origin", () => {
  const report = buildCandidateBrandEvidenceReport(pkg(), now);
  const checked = report.entries.find(entry => entry.state === "checked")!;
  for (const origin of ["provider_observation", "none", "source_assertion"] as const) {
    assert.equal(brandEvidenceEntrySchema.safeParse({ ...checked, state: "unknown", origin, statement: "reported_owned" }).success, false);
  }
  const unknown = { ...checked, state: "unknown" as const, statement: "domain_check_unavailable" as const };
  const unknownReport = createBrandEvidenceReport([unknown], now);
  for (const generated_at of [new Date(now + NAME_PACKAGE_EVIDENCE_MAX_AGE_MS + 1).toISOString(), new Date(now - 1).toISOString()]) {
    assert.equal(brandEvidenceReportSchema.safeParse({ ...unknownReport, generated_at }).success, false);
  }
});

test("report summaries, false trust claims and incompatible state/origin cannot be injected", () => {
  const report = buildCandidateBrandEvidenceReport(pkg(), now), checked = report.entries.find(entry => entry.state === "checked")!;
  for (const value of [{ ...report, summary: { ...report.summary, checked: 8 } }, { ...report, summary: { ...report.summary, checked_coverage_percent: 100 } },
    ...["ownership_verified", "legal_clearance", "continuous_monitoring"].map(key => ({ ...report, [key]: true })),
    { ...report, entries: [...report.entries, report.entries[0]] }]) assert.equal(brandEvidenceReportSchema.safeParse(value).success, false);
  for (const change of [{ origin: "user_report" }, { origin: "source_assertion" }, { freshness: "future" }, { observed_at: null },
    { statement: "reported_owned" }, { verified: true }]) assert.equal(brandEvidenceEntrySchema.safeParse({ ...checked, ...change }).success, false);
  assert.equal(brandEvidenceReportSchema.safeParse({ ...report, generated_at: new Date(now - 1).toISOString() }).success, false);
  assert.throws(() => createBrandEvidenceReport(Array.from({ length: BRAND_EVIDENCE_MAX_ENTRIES + 1 }, () => checked), now));
});

test("separate signals on one target remain separate; generated contract is strict and reproducible", () => {
  const checked = buildCandidateBrandEvidenceReport(pkg(), now).entries.find(entry => entry.state === "checked")!;
  const reported = { ...checked, id: "report:domain:sajdatrusttest.com", origin: "user_report" as const,
    state: "reported" as const, statement: "reported_owned" as const };
  const report = createBrandEvidenceReport([checked, reported], now);
  assert.equal(report.summary.checked, 1); assert.equal(report.summary.reported, 1); assert.equal(report.summary.total, 2);
  assert.equal(report.summary.checked_coverage_percent, 50);
  assert.deepEqual(createBrandEvidenceReport([checked, reported], now), report);
  assert.ok(JSON.stringify(z.toJSONSchema(brandEvidenceReportSchema)).includes("additionalProperties"));
});

test("provenance links reject secret-bearing, executable and private URLs without fetching anything", () => {
  for (const value of [null, "javascript:alert(1)", "http://example.com/", "https://user:secret@example.com/", "https://example.com:444/",
    "https://127.0.0.1/", "https://localhost/", "https://private.local/", "https://example.com/?token=secret", "https://example.com/#unsafe",
    "https://www.wikidata.org/wiki/Q901#P856\n", "https://example.com/ a"]) assert.equal(safeBrandEvidenceSourceUrl(value), null);
  assert.equal(safeBrandEvidenceSourceUrl("https://www.wikidata.org/wiki/Q901#P856"), "https://www.wikidata.org/wiki/Q901#P856");
  assert.equal(safeBrandEvidenceSourceUrl("https://api.github.com/users/sajdatrusttest"), "https://api.github.com/users/sajdatrusttest");
});
