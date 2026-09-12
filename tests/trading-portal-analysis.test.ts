import assert from "node:assert/strict";
import test from "node:test";
import { isCurrentTradingEvidence, rankTradingPortal, tradingEvidenceCoverage, tradingPortalScore, tradingReportComposition } from "../src/lib/tradingPortal.js";
import type { LostDomainAssessment, LostDomainEvidence } from "../src/lib/lostDomains.js";
import { analyzeTradingMarketFit } from "../shared/trading-market-fit.js";
import { parsePorkbunDomainCheck } from "../api/_shared/lost-domains-registrar.js";

const now = Date.UTC(2026, 8, 11, 12);
const iso = (at: number) => new Date(at).toISOString();
function evidence(kind: LostDomainEvidence["kind"], outcome: string, observed = now - 60_000, expires = observed + 15 * 60_000): LostDomainEvidence {
  return { kind, outcome, source: kind === "registry" ? "https://rdap.verisign.com/com/v1/domain/cloudtools.com" : kind === "target_http" ? "https://cloudtools.com/" : "system-dns-resolver",
    method: kind === "registry" ? "rdap" : kind === "target_http" ? "https_get" : kind === "dns" ? "address_lookup" : "mx_lookup",
    observedAt: iso(observed), expiresAt: iso(expires) };
}
function candidate(domain = "cloudtools.com", overrides: Partial<LostDomainAssessment> = {}): LostDomainAssessment {
  return { domain, sourceUrl: "https://source.example/", targetUrl: `https://${domain}/`, anchor: domain,
    sensitive: false, registryStatus: "registry_not_found", registrability: "unverified", confirmedRegistrable: false,
    reviewStatus: "review_candidate", evidence: [evidence("registry", "registry_not_found"), evidence("dns", "no_address"),
      evidence("mail", "no_explicit_mx"), evidence("target_http", "unreachable")],
    risk: { level: "review", reasons: [] }, potentialScore: 70, confidenceScore: 80,
    marketFit: analyzeTradingMarketFit(domain), ...overrides };
}
function quoted(row: LostDomainAssessment, at = now - 60_000) {
  return { ...row, registrar: parsePorkbunDomainCheck(row.domain, { status: "SUCCESS", response: {
    avail: "yes", type: "registration", price: "9.73", regularPrice: "12.00", firstYearPromo: "yes", premium: "no", minDuration: 1,
    additional: { renewal: { type: "renewal", price: "11.25" } },
  } }, at)! };
}
test("current evidence requires a real observation and open expiry interval", () => {
  assert.equal(isCurrentTradingEvidence(evidence("registry", "registered"), now), true);
  assert.equal(isCurrentTradingEvidence(evidence("dns", "no_address", now), now), true);
  for (const value of [
    evidence("registry", "registered", now - 16 * 60_000),
    evidence("registry", "registered", now + 1),
    evidence("registry", "registered", now - 60_000, now),
    evidence("registry", "registered", now - 60_000, now - 60_000),
    { ...evidence("registry", "registered"), observedAt: "invalid" },
    { ...evidence("registry", "registered"), expiresAt: "invalid" },
  ]) assert.equal(isCurrentTradingEvidence(value, now), false);
  assert.equal(isCurrentTradingEvidence(evidence("registry", "registered"), NaN), false);
});
test("unknown, failed and rate-limited outcomes never become current checks", () => {
  for (const outcome of ["unknown", "unavailable", "error", "timeout", "rate_limited", "", "made_up_success"]) {
    assert.equal(isCurrentTradingEvidence(evidence("registry", outcome), now), false, outcome);
  }
});
test("long artificial expiry cannot extend the engine's 15-minute evidence lifetime", () => {
  assert.equal(isCurrentTradingEvidence(evidence("registry", "registered", now - 60 * 60_000, now + 60_000), now), false);
  assert.equal(isCurrentTradingEvidence(evidence("registry", "registered", now - 60_000, now + 60 * 60_000), now), false);
});
test("coverage counts distinct check kinds, not repeated sources or observations", () => {
  const row = candidate();
  assert.equal(tradingEvidenceCoverage(row, now), 4);
  assert.equal(tradingEvidenceCoverage({ ...row, evidence: [...row.evidence, ...row.evidence] }, now), 4);
  assert.equal(tradingEvidenceCoverage({ ...row, evidence: row.evidence.filter(value => value.kind !== "registry") }, now), 3);
  assert.equal(tradingEvidenceCoverage({ ...row, evidence: [evidence("registry", "rate_limited")] }, now), 0);
});
test("newer failure supersedes an older success from the same check source", () => {
  const old = evidence("registry", "registry_not_found", now - 120_000);
  const failed = evidence("registry", "unknown", now - 30_000);
  assert.equal(tradingEvidenceCoverage(candidate("cloudtools.com", { evidence: [old, failed] }), now), 0);
  assert.equal(tradingEvidenceCoverage(candidate("cloudtools.com", { evidence: [failed, old] }), now), 0);
});
test("tied contradictory checks and future observations do not overstate completed coverage", () => {
  const registered = evidence("registry", "registered"), absent = evidence("registry", "registry_not_found");
  assert.equal(tradingEvidenceCoverage(candidate("cloudtools.com", { evidence: [registered, absent] }), now), 0);
  assert.equal(tradingEvidenceCoverage(candidate("cloudtools.com", { evidence: [evidence("registry", "registered", now + 1)] }), now), 0);
});
test("all non-risk modes exclude sensitive/excluded targets from positive research scores", () => {
  const rows = [candidate("cloudtools.com", { sensitive: true }),
    candidate("cloudtools.com", { reviewStatus: "excluded" }), candidate("cloudtools.com", { risk: { level: "excluded", reasons: ["sensitive_dependency"] } })];
  for (const row of rows) for (const mode of ["balanced", "brand", "acquisition"] as const) {
    assert.equal(tradingPortalScore(quoted(row), mode, now), 0);
  }
});
test("stale or absent evidence cannot earn a positive non-risk score even with a fresh price", () => {
  for (const row of [candidate("cloudtools.com", { evidence: [] }), candidate("cloudtools.com", {
    evidence: [evidence("registry", "registry_not_found", now - 20 * 60_000)],
  })]) for (const mode of ["balanced", "brand", "acquisition"] as const) assert.equal(tradingPortalScore(quoted(row), mode, now), 0);
});
test("risk mode is a triage order where missing checks and exclusions increase priority", () => {
  const complete = candidate(), missing = candidate("missing.com", { evidence: [] });
  const excluded = candidate("excluded.com", { evidence: [], sensitive: true, risk: { level: "excluded", reasons: Array(30).fill("review") } });
  assert.ok(tradingPortalScore(missing, "risk", now) > tradingPortalScore(complete, "risk", now));
  assert.equal(tradingPortalScore(excluded, "risk", now), 100);
  assert.equal(rankTradingPortal([complete, missing, excluded], "risk", "", now)[0].row.domain, "excluded.com");
});
test("analysis modes genuinely alter order without mutating source evidence", () => {
  const brand = candidate("cloudtools.com", { confidenceScore: 0 });
  const technical = candidate("zqxvbnm.com", { confidenceScore: 100 });
  const withQuote = quoted(technical);
  const rows = [brand, withQuote], before = structuredClone(rows);
  assert.equal(rankTradingPortal(rows, "brand", "", now)[0].row.domain, brand.domain);
  assert.equal(rankTradingPortal(rows, "acquisition", "", now)[0].row.domain, technical.domain);
  assert.deepEqual(rows, before);
});
test("availability observations expire independently and cannot be supplied by future prices", () => {
  const row = candidate(), unquoted = tradingPortalScore(row, "acquisition", now);
  const fresh = quoted(row);
  assert.equal(tradingPortalScore(fresh, "acquisition", now), unquoted + 45);
  assert.equal(tradingPortalScore(quoted(row, now + 60_000), "acquisition", now), unquoted);
  assert.equal(tradingPortalScore(quoted(row, now - 5 * 60_000), "acquisition", now), unquoted);
  assert.equal(tradingPortalScore({ ...fresh, registrar: { ...fresh.registrar, availability: "unavailable" } }, "acquisition", now), unquoted);
});
test("newer or tied registration evidence removes only the acquisition availability bonus", () => {
  for (const registeredAt of [now - 30_000, now - 60_000]) {
    const row = candidate("cloudtools.com", { evidence: [evidence("registry", "registered", registeredAt), evidence("dns", "resolves")],
      registryStatus: "registered", reviewStatus: "registered" });
    const before = structuredClone(row), fresh = quoted(row, now - 60_000);
    assert.equal(tradingPortalScore(fresh, "acquisition", now), tradingPortalScore(row, "acquisition", now));
    assert.equal(tradingPortalScore(fresh, "brand", now), tradingPortalScore(row, "brand", now));
    assert.deepEqual(row, before);
  }
});
test("newer registry evidence contradicts availability even when aggregate status has not caught up", () => {
  const row = candidate("cloudtools.com", { evidence: [evidence("registry", "registered", now - 30_000), evidence("dns", "no_address")] });
  assert.equal(row.registryStatus, "registry_not_found");
  assert.equal(tradingPortalScore(quoted(row, now - 60_000), "acquisition", now), tradingPortalScore(row, "acquisition", now));
});
test("a current registered aggregate with a later registry check stays conservative", () => {
  const row = candidate("cloudtools.com", { registryStatus: "registered", reviewStatus: "registered",
    evidence: [evidence("registry", "unknown", now - 30_000), evidence("dns", "resolves")] });
  assert.equal(tradingPortalScore(quoted(row, now - 60_000), "acquisition", now), tradingPortalScore(row, "acquisition", now));
});
test("historical registration before a fresh available quote does not remove its priority bonus", () => {
  const row = candidate("cloudtools.com", { registryStatus: "registered", reviewStatus: "registered",
    evidence: [evidence("registry", "registered", now - 120_000), evidence("dns", "no_address")] });
  assert.equal(tradingPortalScore(quoted(row, now - 60_000), "acquisition", now), tradingPortalScore(row, "acquisition", now) + 45);
});

test("expiry or later unknown checks cannot resurrect availability contradicted after the quote", () => {
  const registration = evidence("registry", "registered", now - 30_000, now - 15_000);
  for (const later of [[], [evidence("registry", "unknown", now - 10_000)], [evidence("registry", "registry_not_found", now - 10_000)]]) {
    const row = candidate("cloudtools.com", { evidence: [registration, ...later, evidence("dns", "resolves")] });
    const baseline = tradingPortalScore(row, "acquisition", now);
    assert.equal(tradingPortalScore(quoted(row, now - 60_000), "acquisition", now), baseline,
      "A known registration after a quote requires a new registrar observation, even if its cache expires");
    assert.equal(tradingPortalScore(quoted(row, now - 5_000), "acquisition", now), baseline + 45,
      "A genuinely newer registrar observation can supersede the former registration");
  }
});
test("all score modes stay bounded for malformed numeric rubric inputs", () => {
  for (const value of [NaN, Infinity, -10, 1000]) {
    const row = candidate(); row.confidenceScore = value; row.marketFit = { ...row.marketFit!, score: value };
    for (const mode of ["balanced", "brand", "acquisition", "risk"] as const) {
      const result = tradingPortalScore(row, mode, now);
      assert.ok(Number.isFinite(result) && result >= 0 && result <= 100);
    }
  }
});
test("ranking search is trimmed/case-insensitive with deterministic ties and no source mutation", () => {
  const rows = [candidate("bravo.com", { evidence: [] }), candidate("alpha.com", { evidence: [] }), candidate("alpha.se", { evidence: [] })];
  assert.deepEqual(rankTradingPortal(rows, "balanced", " ALPHA ", now).map(value => value.row.domain), ["alpha.com", "alpha.se"]);
  assert.deepEqual(rankTradingPortal(rows, "balanced", "", now).map(value => value.row.domain), ["alpha.com", "alpha.se", "bravo.com"]);
  assert.equal(rows[0].domain, "bravo.com"); assert.deepEqual(rankTradingPortal(rows, "balanced", "nonexistent", now), []);
});
test("report composition counts observations by extension, not market demand, return or forecasts", () => {
  const changed = candidate("changed.com", { observationHistory: {
    firstObservedAt: iso(now - 60 * 60_000), lastObservedAt: iso(now), previousObservedAt: iso(now - 60 * 60_000),
    observations: 2, independentSources: 1, previousRegistryStatus: "registered", registryChanged: true, windowDays: 180,
  } });
  const rows = [candidate("other.com"), changed, candidate("third.se")], before = structuredClone(rows);
  assert.deepEqual(tradingReportComposition(rows), [{ extension: "com", count: 2, changed: 1 }, { extension: "se", count: 1, changed: 0 }]);
  assert.deepEqual(rows, before); assert.deepEqual(tradingReportComposition([]), []);
  for (const group of tradingReportComposition(rows)) assert.deepEqual(Object.keys(group).sort(), ["changed", "count", "extension"]);
});
