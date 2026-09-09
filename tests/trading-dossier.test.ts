import assert from "node:assert/strict";
import test from "node:test";
import { analyzeTradingDossier, isTradingDossier, type TradingDossierAssessment, type TradingDossierObservation } from "../shared/trading-dossier";
import type { TradingArchiveEvidence } from "../shared/trading-archive";

const now = Date.parse("2026-09-09T18:00:00.000Z");
const iso = (at: number) => new Date(at).toISOString();
function assessment(at = now - 1_000): TradingDossierAssessment {
  const time = { observedAt: iso(at), expiresAt: iso(at + 900_000) };
  return { domain: "cloudbilling.com", sourceUrl: "https://catalog.org/projects", targetUrl: "https://cloudbilling.com/", sensitive: false,
    registryStatus: "registry_not_found", risk: { level: "review", reasons: [] }, reviewStatus: "review_candidate", evidence: [
      { kind: "registry", source: "https://rdap.verisign.com/com/v1/domain/cloudbilling.com", method: "rdap", outcome: "registry_not_found", details: { httpStatus: 404 }, ...time },
      { kind: "dns", source: "system-dns-resolver", method: "address_lookup", outcome: "no_address", ...time },
      { kind: "mail", source: "system-dns-resolver", method: "mx_lookup", outcome: "no_explicit_mx", ...time },
      { kind: "target_http", source: "https://cloudbilling.com/", method: "https_get", outcome: "unreachable", details: { error: "dns_unavailable", scope: "apex" }, ...time },
    ] };
}
function observation(at: number): TradingDossierObservation {
  return { ...assessment(at), observedAt: iso(at) };
}
const prior = () => [observation(now - 13 * 3_600_000), observation(now - 2 * 3_600_000)];
const options = () => ({ now, sourceApproved: true, observations: prior() });

test("a newer observation suppresses an older report without rewriting its original evidence",()=>{
  const item=assessment(),result=analyzeTradingDossier(item,{...options(),superseded:true});
  assert.notEqual(result.status,"ready_for_price_review");
  assert.ok(result.blockers.includes("freshness"));
  assert.ok(result.reasons.includes("newer_observation_available"));
  assert.equal(result.coverage.newestEvidenceAt,item.evidence[0].observedAt);
});

test("deep dossier requires complete repeated observations rather than a scalar confidence score", () => {
  const ready = analyzeTradingDossier(assessment(), options());
  assert.equal(ready.status, "ready_for_price_review");
  assert.equal(ready.priority, "price_review");
  assert.equal(ready.temporal.state, "stable_absence");
  assert.equal(ready.temporal.stableChecks, 3);
  assert.equal(ready.temporal.spanSeconds, 46_799);
  assert.equal(ready.coverage.observedFamilies, 4);
  assert.equal(ready.coverage.independentProvidersVerified, false);
  assert.equal(ready.registrability, "unverified");
  assert.equal(ready.investmentValue, "unverified");
  assert.deepEqual(ready.blockers, []);
  for (const id of ["registrar", "rights", "market_evidence"]) assert.equal(ready.stages.find(stage => stage.id === id)?.state, "unknown");
  assert.ok(isTradingDossier(ready));
});

test("readiness expires at the earliest actual evidence deadline, not report read time", () => {
  const item = assessment();
  item.evidence = item.evidence.map(row => row.kind === "dns" ? { ...row, expiresAt: iso(now+60_000) } : row);
  const first = analyzeTradingDossier(item, options());
  const reread = analyzeTradingDossier(item, { ...options(), now: now+50_000 });
  assert.equal(first.validUntil, iso(now+60_000));
  assert.equal(reread.validUntil, first.validUntil);
  assert.ok(isTradingDossier(first));
  const expired = analyzeTradingDossier(item, { ...options(), now: now+60_000 });
  assert.notEqual(expired.status, "ready_for_price_review");
  assert.equal(expired.validUntil, null);
  assert.equal(isTradingDossier({ ...first, validUntil: iso(now+900_001) }), false);
});

test("single check, rapid repeats and summaries cannot manufacture temporal corroboration", () => {
  const single = analyzeTradingDossier(assessment(), { now, sourceApproved: true });
  assert.equal(single.status, "monitor");
  assert.equal(single.temporal.stableChecks, 1);
  const fast = analyzeTradingDossier(assessment(), { now, sourceApproved: true,
    observations: [observation(now - 10_000), observation(now - 30_000), observation(now - 60_000)] });
  assert.equal(fast.temporal.stableChecks, 1);
  assert.equal(fast.status, "monitor");
  const summaries = prior().map(({ evidence: _evidence, ...row }) => row);
  const summarized = analyzeTradingDossier(assessment(), { now, sourceApproved: true, observations: summaries });
  assert.equal(summarized.temporal.stableChecks, 1);
  assert.equal(summarized.status, "monitor");
});

test("duplicating check rows does not increase check families or independent providers", () => {
  const item = assessment();
  item.evidence = Array.from({ length: 30 }, () => ({ ...item.evidence[0] }));
  const result = analyzeTradingDossier(item, options());
  assert.equal(result.coverage.observedFamilies, 1);
  assert.equal(result.coverage.independentProvidersVerified, false);
  assert.notEqual(result.status, "ready_for_price_review");
  assert.ok(result.blockers.includes("dns"));
  assert.ok(result.blockers.includes("mail"));
  assert.ok(result.blockers.includes("website"));
});

test("duplicate observations and shifted wrapper timestamps do not create extra checks", () => {
  const same = observation(now - 13 * 3_600_000);
  const replay = analyzeTradingDossier(assessment(), { now, sourceApproved: true,
    observations: [same, same, same, { ...same, observedAt: iso(now - 12.9 * 3_600_000) }] });
  assert.equal(replay.temporal.stableChecks, 2);
  assert.notEqual(replay.status, "ready_for_price_review");
});

test("timestamps are bounded, future rows and artificially long expiry cannot pass", () => {
  for (const invalid of [now + 1_000, now - 901_000]) {
    const result = analyzeTradingDossier(assessment(invalid), options());
    assert.equal(result.coverage.observedFamilies, 0);
    assert.notEqual(result.status, "ready_for_price_review");
  }
  const forever = assessment();
  forever.evidence = forever.evidence.map(row => ({ ...row, expiresAt: iso(now + 86_400_000) }));
  assert.notEqual(analyzeTradingDossier(forever, options()).status, "ready_for_price_review");
  const ancient = analyzeTradingDossier(assessment(), { now, sourceApproved: true,
    observations: [observation(now - 74 * 3_600_000), observation(now - 2 * 3_600_000)] });
  assert.equal(ancient.temporal.stableChecks, 2);
});

test("a broken page, forbidden response, server failure or redirect is never domain absence", () => {
  for (const status of [200, 301, 403, 404, 410, 500, 503]) {
    const item = assessment();
    item.evidence = [...item.evidence, { ...item.evidence[3], outcome: "unknown", details: { httpStatus: status } }];
    const result = analyzeTradingDossier(item, options());
    assert.equal(result.dependencies.respondingHttp, true);
    assert.ok(result.reasons.includes("conflicting_observations"));
    assert.notEqual(result.status, "ready_for_price_review");
  }
  const pathOnly = assessment();
  pathOnly.targetUrl = "https://cloudbilling.com/old-project";
  pathOnly.evidence = pathOnly.evidence.map(row => row.kind === "target_http" ? { ...row, source: pathOnly.targetUrl } : row);
  assert.equal(analyzeTradingDossier(pathOnly, options()).coverage.families.website, "unknown");
});

test("active mail, private-address outcomes and sensitive provenance are hard exclusions", () => {
  const mail = assessment();
  mail.evidence = mail.evidence.map(row => row.kind === "mail" ? { ...row, outcome: "mx_present" } : row);
  assert.equal(analyzeTradingDossier(mail, options()).status, "reject");
  const privateAddress = assessment();
  privateAddress.evidence = privateAddress.evidence.map(row => row.kind === "dns" ? { ...row, outcome: "non_public_address" } : row);
  assert.equal(analyzeTradingDossier(privateAddress, options()).status, "reject");
  assert.equal(analyzeTradingDossier({ ...assessment(), sensitive: true }, options()).status, "reject");
  assert.equal(analyzeTradingDossier({ ...assessment(), risk: { level: "excluded", reasons: [] } }, options()).status, "reject");
  for (const targetUrl of ["https://cloudbilling.com/oauth/callback", "https://mail.cloudbilling.com/", "https://cloudbilling.com/%61uth/session", "https://cloudbilling.com/script.js"]) {
    assert.equal(analyzeTradingDossier({ ...assessment(), targetUrl }, options()).status, "reject");
  }
});

test("provider, target and domain identity must match actual checks exactly", () => {
  for (const source of ["https://attacker.test/domain/cloudbilling.com", "https://rdap.verisign.com/com/v1/domain/other.com", "https://rdap.verisign.com.evil.org/com/v1/domain/cloudbilling.com"]) {
    const item = assessment();
    item.evidence = item.evidence.map(row => row.kind === "registry" ? { ...row, source } : row);
    assert.equal(analyzeTradingDossier(item, options()).coverage.families.registry, "unknown");
  }
  for (const source of ["8.8.8.8", "unknown-resolver", "https://dns.google/resolve"]) {
    const item = assessment();
    item.evidence = item.evidence.map(row => row.kind === "dns" ? { ...row, source } : row);
    assert.equal(analyzeTradingDossier(item, options()).coverage.families.dns, "unknown");
  }
  assert.equal(analyzeTradingDossier({ ...assessment(), targetUrl: "https://other.com/" }, options()).status, "reject");
  assert.equal(analyzeTradingDossier({ ...assessment(), domain: "project.github.io" }, options()).status, "reject");
});

test("source approval is an explicit independent gate; archive evidence cannot substitute", () => {
  const missing = analyzeTradingDossier(assessment(), { now, observations: prior() });
  assert.notEqual(missing.status, "ready_for_price_review");
  assert.ok(missing.blockers.includes("source_permission"));
  assert.equal(analyzeTradingDossier(assessment(), { ...options(), sourceApproved: false }).status, "reject");
  for (const sourceUrl of ["http://catalog.org/", "https://user:password@catalog.org/", "https://cloudbilling.com/links", "https://127.0.0.1/", "https://catalog.org/?token=secret"]) {
    assert.equal(analyzeTradingDossier({ ...assessment(), sourceUrl }, options()).status, "reject");
  }
});

test("expired or renewed registry lifecycle is monitoring context, not registrability", () => {
  const item = assessment();
  item.registryStatus = "registered";
  item.evidence = item.evidence.map(row => row.kind === "registry" ? { ...row, outcome: "registered", details: {
    httpStatus: 200, statuses: ["redemption period", "pending delete"],
    events: ["expiration: 2026-09-01T00:00:00.000Z", "renewal: 2026-09-08T00:00:00.000Z"],
  } } : row);
  const result = analyzeTradingDossier(item, options());
  assert.equal(result.status, "monitor");
  assert.equal(result.priority, "watch");
  assert.equal(result.lifecycle.expirationPassed, true);
  assert.equal(result.lifecycle.expiryMeansAvailable, false);
  assert.equal(result.lifecycle.renewalObservedAt, "2026-09-08T00:00:00.000Z");
  assert.ok(result.reasons.includes("past_expiration_is_not_availability"));
  assert.equal(result.registrability, "unverified");
});

test("a recent complete contradictory snapshot resets temporal stability", () => {
  const conflict = observation(now - 3_600_000);
  conflict.registryStatus = "registered";
  conflict.evidence = conflict.evidence!.map(row => row.kind === "registry" ? { ...row, outcome: "registered", details: { httpStatus: 200 } } : row);
  const result = analyzeTradingDossier(assessment(), { ...options(), observations: [...prior(), conflict] });
  assert.equal(result.status, "monitor");
  assert.equal(result.temporal.state, "transition");
  assert.equal(result.temporal.stableChecks, 1);
});

test("partial positive evidence and a registered history row also reset stability", () => {
  const active = observation(now - 3_600_000);
  active.evidence = active.evidence!.filter(row => row.kind === "mail").map(row => ({ ...row, outcome: "mx_present" }));
  const partial = analyzeTradingDossier(assessment(), { ...options(), observations: [...prior(), active] });
  assert.notEqual(partial.status, "ready_for_price_review");
  assert.equal(partial.temporal.stableChecks, 1);
  const summary = { ...active, registryStatus: "registered" as const, evidence: undefined };
  const knownRegistered = analyzeTradingDossier(assessment(), { ...options(), observations: [...prior(), summary] });
  assert.equal(knownRegistered.status, "monitor");
  assert.equal(knownRegistered.temporal.state, "transition");
  assert.equal(knownRegistered.temporal.stableChecks, 1);
});

test("oversized input cannot hide a dependency after the processing bound", () => {
  const item = assessment();
  item.evidence = [...Array.from({ length: 32 }, (_, index) => ({ ...item.evidence[index % 4] })), { ...item.evidence[2], outcome: "mx_present" }];
  const result = analyzeTradingDossier(item, options());
  assert.equal(result.status, "reject");
  assert.ok(result.reasons.includes("invalid_evidence_size"));
});

test("bounded archive samples never establish ownership, backlink counts, traffic or value", () => {
  const sourceUrl = new URL("https://index.commoncrawl.org/CC-MAIN-2026-30-index");
  sourceUrl.search = new URLSearchParams({ url: "cloudbilling.com", matchType: "host", output: "json", limit: "5", fl: "url,timestamp,status" }).toString();
  const archive: TradingArchiveEvidence = { source: "common_crawl", domain: "cloudbilling.com", status: "observed", reason: "crawl_sightings",
    checkedAt: iso(now - 1_000), sourceUrl: sourceUrl.href, collection: "CC-MAIN-2026-30", sampleCount: 1,
    earliestSampleAt: "2026-08-01T00:00:00.000Z", latestSampleAt: "2026-08-01T00:00:00.000Z", sampleStatuses: [200],
    priorExistence: true, sampleLimit: 5, collectionLimit: 1 };
  const item = { ...assessment(), archive };
  const result = analyzeTradingDossier(item, { now, sourceApproved: true });
  assert.equal(result.historicalContext.archive, "observed");
  assert.equal(result.historicalContext.priorExistence, true);
  assert.equal(result.historicalContext.ownershipVerified, false);
  assert.equal(result.historicalContext.backlinksVerified, false);
  assert.equal(result.historicalContext.trafficVerified, false);
  assert.equal(result.status, "monitor");
  assert.equal(analyzeTradingDossier({ ...item, archive: { ...archive, domain: "other.com" } }, options()).historicalContext.archive, "unknown");
  assert.equal(analyzeTradingDossier({ ...item, archive: { ...archive, checkedAt: iso(now + 1) } }, options()).historicalContext.archive, "unknown");
});

test("dossier serialization validation rejects invented readiness and valuation claims", () => {
  const ready = analyzeTradingDossier(assessment(), options());
  assert.ok(isTradingDossier(JSON.parse(JSON.stringify(ready))));
  assert.equal(isTradingDossier({ ...ready, investmentValue: "high" }), false);
  assert.equal(isTradingDossier({ ...ready, registrability: "confirmed" }), false);
  assert.equal(isTradingDossier({ ...ready, temporal: { ...ready.temporal, stableChecks: 1 } }), false);
  assert.equal(isTradingDossier({ ...ready, dependencies: { ...ready.dependencies, activeMail: true } }), false);
  assert.equal(isTradingDossier({ ...ready, lifecycle: { ...ready.lifecycle, expiryMeansAvailable: true } }), false);
  assert.equal(isTradingDossier({ ...ready, historicalContext: { ...ready.historicalContext, backlinksVerified: true } }), false);
});

test("deterministic output does not mutate evidence or supplied observation arrays", () => {
  const item = assessment(), config = options(), before = JSON.stringify({ item, config });
  const first = analyzeTradingDossier(item, config);
  assert.deepEqual(analyzeTradingDossier(item, config), first);
  assert.equal(JSON.stringify({ item, config }), before);
});
