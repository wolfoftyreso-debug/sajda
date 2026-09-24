import assert from "node:assert/strict";
import test from "node:test";
import { applyPackageObservations, buildNamePackages, NAME_PACKAGE_EVIDENCE_MAX_AGE_MS, type NamePackage } from "../shared/name-packages.js";
import { buildNamePackageDomainCheckPlan, candidateBrandIndexSchema, getNamePackageBrandIndex } from "../shared/brand-candidate-index.js";
import { NAMES_API_TLDS, parseNamesApiRequest } from "../api/_shared/names-contract.js";
import { projectNamePackageIntelligence } from "../shared/name-package-intelligence.js";

const now = Date.parse("2026-09-13T12:00:00Z"), at = new Date(now).toISOString();
function fixture(tlds = ["com", "se"]): NamePackage {
  return buildNamePackages([{ domain: "nordform.com", status: "available", availabilityVerified: true,
    checkMethod: "rdap", checkedAt: at, namingScore: 82 }],
  { platforms: ["github", "instagram"], requiredTlds: tlds, observedAt: null, now })[0];
}

test("candidate Brand Index is explicit, versioned and uses the same evidence-derived score", () => {
  const pkg = fixture(), result = getNamePackageBrandIndex(pkg, now);
  assert.deepEqual(candidateBrandIndexSchema.parse(result), result);
  assert.equal(result.mode, "candidate"); assert.equal(result.score, pkg.packageScore);
  assert.equal(result.status, "checks_needed"); assert.equal(result.attainableMaximum, 70);
  assert.deepEqual(result.signals, { domainCount: 2, availableDomains: 1, takenDomains: 0, uncheckedDomains: 1,
    socialCount: 2, sameHandleFormats: 2, observedProfiles: 0 });
  assert.equal(result.ownershipVerified, false); assert.equal(result.legalClearance, false);
  assert.equal(result.nextActions[0].kind, "refresh_domains");
  assert.ok(result.missingChecks.includes("company_register")); assert.ok(result.missingChecks.includes("trademark_register"));
});

test("forged saved scores, labels and ready status cannot mint readiness or ownership", () => {
  const pkg = fixture(), baseline = getNamePackageBrandIndex(pkg, now);
  const forged = { ...pkg, packageScore: 100, fitScore: 100, evidenceCoverage: 100, missingChecks: [], nextActions: [],
    scoreParts: { fit: { score: 40, max: 40 }, domains: { score: 30, max: 30 }, socials: { score: 20, max: 20 },
      company: { score: 5, max: 5 }, trademark: { score: 5, max: 5 } } } as NamePackage;
  assert.deepEqual(getNamePackageBrandIndex(forged, now), baseline);
  assert.throws(() => getNamePackageBrandIndex({ ...pkg, label: "other" }, now));
  assert.equal(candidateBrandIndexSchema.safeParse({ ...baseline, ownershipVerified: true }).success, false);
  assert.equal(candidateBrandIndexSchema.safeParse({ ...baseline, score: 99 }).success, false);
});

test("same-name domains can be ready while social registration and legal clearance remain unchecked", () => {
  const pkg = fixture(["com"]), result = getNamePackageBrandIndex(pkg, now);
  assert.equal(result.status, "domains_ready"); assert.equal(result.signals.availableDomains, 1);
  assert.ok(result.score <= 70); assert.equal(result.dimensions.socials.score, 0);
  assert.equal(result.dimensions.company.score, 0); assert.equal(result.dimensions.trademark.score, 0);
  const lookedUp = applyPackageObservations(pkg, [{ platform: "github", handle: "nordform", status: "not_found",
    checkedAt: at, sourceUrl: "https://api.github.com/users/nordform" }], now);
  const observed = getNamePackageBrandIndex(lookedUp, now);
  assert.equal(observed.score, result.score); assert.ok(observed.evidenceCoverage > result.evidenceCoverage);
  assert.ok(observed.missingChecks.includes("social:github"));
});

test("observed conflicts lower readiness and are prioritized without claiming a legal collision", () => {
  const pkg = fixture(["com"]);
  const conflicted = applyPackageObservations(pkg, [{ platform: "github", handle: "nordform", status: "profile_found",
    checkedAt: at, sourceUrl: "https://api.github.com/users/nordform" }], now);
  const index = getNamePackageBrandIndex(conflicted, now);
  assert.equal(index.status, "conflicts_found"); assert.ok(index.score < pkg.packageScore);
  assert.equal(index.signals.observedProfiles, 1);
  assert.deepEqual(index.nextActions[0], { kind: "review_social", platform: "github", url: "https://github.com/nordform" });
});

test("evidence ages at read time and a current receipt never renews registry observations", () => {
  const pkg = fixture(["com"]), later = now + NAME_PACKAGE_EVIDENCE_MAX_AGE_MS + 1;
  const result = getNamePackageBrandIndex({ ...pkg, observedAt: new Date(later).toISOString() }, later);
  assert.equal(result.status, "checks_needed"); assert.equal(result.signals.availableDomains, 0);
  assert.equal(result.dimensions.domains.score, 0);
  assert.deepEqual(buildNamePackageDomainCheckPlan(pkg, { now: later }).batches, [["nordform.com"]]);
});

test("completion plan is exact, deterministic and respects existing API batch bounds", () => {
  const pkg = fixture([...NAMES_API_TLDS]);
  const missing = buildNamePackageDomainCheckPlan(pkg, { now });
  assert.equal(missing.batches.length, 1); assert.equal(missing.batches[0].length, 10);
  assert.deepEqual(missing.checkedDomains, ["nordform.com"]);
  const full = buildNamePackageDomainCheckPlan(pkg, { now, onlyMissing: false });
  assert.equal(full.batches.length, 2); assert.equal(full.batches[0].length, 10); assert.equal(full.batches[1].length, 1);
  for (const domains of full.batches) assert.doesNotThrow(() => parseNamesApiRequest({ domains, tlds: [...NAMES_API_TLDS] }));
  assert.ok(full.batches.flat().every(domain => domain.startsWith("nordform.")));
  assert.throws(() => buildNamePackageDomainCheckPlan(pkg, { batchSize: 11, now }));
  assert.throws(() => buildNamePackageDomainCheckPlan(pkg, { supportedTlds: ["invalid"], now }));
});

test("unsupported compound suffixes stay explicit and are never silently turned into another domain", () => {
  const result = buildNamePackageDomainCheckPlan(fixture(["com", "co.uk"]), { now });
  assert.deepEqual(result.unsupportedDomains, ["nordform.co.uk"]); assert.deepEqual(result.batches, []);
  assert.equal(result.requiresChecks, true);
  assert.equal(buildNamePackageDomainCheckPlan(fixture(["com"]), { now }).requiresChecks, false);
});

test("API Brand Index and existing package index have exactly the same dimensions", () => {
  const result = projectNamePackageIntelligence({ results: [{ domain: "nordform.com", status: "available", authoritative: true,
    checkMethod: "rdap", checkedAt: at, namingScore: 82 }] }, { platforms: ["github"], requiredTlds: ["com", "se"], now });
  const pkg = result.packages[0];
  assert.equal(pkg.brand_index.score, pkg.index.score); assert.equal(pkg.brand_index.evidenceCoverage, pkg.index.evidence_coverage_percent);
  assert.equal(pkg.brand_index.dimensions.domains.score, pkg.index.score_parts.domains.score);
});
