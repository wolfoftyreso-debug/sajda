import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod/v4";
import {
  NAME_PACKAGE_INTELLIGENCE_METHODOLOGY, NAME_PACKAGE_INTELLIGENCE_SCHEMA_VERSION,
  namePackageIntelligenceSchema, projectNamePackageIntelligence,
} from "../shared/name-package-intelligence";
import { buildNamePackages, NAME_PACKAGE_EVIDENCE_MAX_AGE_MS, NAME_PACKAGE_METHODOLOGY_VERSION, SOCIAL_PLATFORMS } from "../shared/name-packages";
import { NAMES_API_TLDS, parseNamesApiRequest } from "../api/_shared/names-contract";
import { DEFAULT_NAME_PACKAGE_MARKETS, NAME_PACKAGE_MARKET_CODES, buildNamePackageMarketCoverage, normalizeNamePackageMarkets } from "../shared/name-package-markets.js";

const at = "2026-09-13T12:00:00.000Z", now = Date.parse(at) + 1000;
const settings = { platforms: [...SOCIAL_PLATFORMS], requiredTlds: ["com", "se"], now };
const row = (domain = "nomera.com", extra: Record<string, unknown> = {}) => ({
  domain, status: "available", authoritative: true, checkMethod: "rdap", source: "verisign-rdap", checkedAt: at, namingScore: 82, ...extra,
});
const projection = (rows = [row()], options = settings) => projectNamePackageIntelligence({ results: rows }, options);
const genericFailure = (run: () => unknown) => assert.throws(run, error => error instanceof Error && error.message === "Name package intelligence could not be produced.");

test("machine name-package contract is a strict Zod v4 JSON schema", () => {
  const output = projection();
  assert.equal(output.schema_version, NAME_PACKAGE_INTELLIGENCE_SCHEMA_VERSION);
  assert.equal(output.methodology_version, NAME_PACKAGE_METHODOLOGY_VERSION);
  assert.equal(output.methodology_version, "name-package-1.0.0");
  assert.equal(output.generated_at, new Date(now).toISOString());
  assert.equal(output.requested_count, 10); assert.equal(output.returned_count, 1);
  assert.deepEqual(namePackageIntelligenceSchema.parse(output), output);
  const json = z.toJSONSchema(namePackageIntelligenceSchema);
  assert.equal(json.type, "object"); assert.equal(json.additionalProperties, false);
});

test("entity IDs represent only stable lexical candidates, never companies or durable records", () => {
  const item = projection().packages[0];
  assert.equal(item.entity_id, "name-package:nomera"); assert.equal(item.canonical_name, "nomera");
  assert.equal(item.entity_type, "name_candidate"); assert.equal(item.country, null); assert.equal(item.canonical_url, null);
  const later = projection([row("nomera.com", { checkedAt: new Date(now).toISOString(), source: "other-rdap" })]).packages[0];
  assert.equal(later.entity_id, item.entity_id);
  assert.equal(later.evidence.domains[0].evidence_id, item.evidence.domains[0].evidence_id);
  assert.notEqual(later.evidence.domains[0].source, item.evidence.domains[0].source);
  assert.ok(item.index.limitations.includes("name_candidate_not_registered_company_identity"));
});

test("default market coverage is explicit and does not infer geography from a name or extension", () => {
  const output = projection();
  assert.deepEqual(output.market_coverage, buildNamePackageMarketCoverage(DEFAULT_NAME_PACKAGE_MARKETS));
  assert.deepEqual(output.market_coverage.checked_markets, []);
  assert.equal(output.market_coverage.automated_checks_available, false);
  assert.deepEqual(output.market_coverage.requested_markets, normalizeNamePackageMarkets(DEFAULT_NAME_PACKAGE_MARKETS));
  for (const check of output.market_coverage.checks) {
    assert.equal(check.company.status, "not_checked"); assert.equal(check.trademark.status, "not_checked");
  }
  const selected = projectNamePackageIntelligence({ results: [row("nomera.se")], locale: "sv", country: "SE" }, { ...settings, markets: ["US"] });
  assert.deepEqual(selected.market_coverage.requested_markets, ["US"]);
  assert.equal(selected.packages[0].country, null);
});

test("market coverage is separate from category coverage, readiness and legal evidence", () => {
  const baseline = projection();
  const selected = projectNamePackageIntelligence({ results: [row()] }, { ...settings, markets: ["US", "SE", "DE"] });
  const all = projectNamePackageIntelligence({ results: [row()] }, { ...settings, markets: [...NAME_PACKAGE_MARKET_CODES] });
  assert.deepEqual(selected.packages, baseline.packages);
  assert.deepEqual(all.packages, baseline.packages);
  assert.deepEqual(selected.market_coverage.requested_markets, normalizeNamePackageMarkets(["US", "SE", "DE"]));
  assert.deepEqual(all.market_coverage.checked_markets, []);
  assert.equal(all.market_coverage.automated_checks_available, false);
  assert.equal(all.packages[0].index.score_parts.company.score, 0);
  assert.equal(all.packages[0].index.score_parts.trademark.score, 0);
});

test("projection markets reject malformed values instead of silently changing the requested scope", () => {
  for (const markets of [[], ["US", "US"], ["EU"], ["us"], ["ZZ"], null,
    Array(NAME_PACKAGE_MARKET_CODES.length + 1).fill("US")]) {
    genericFailure(() => projectNamePackageIntelligence({ results: [row()] }, { ...settings, markets } as Parameters<typeof projectNamePackageIntelligence>[1]));
  }
});

test("record-level source and observation dates are preserved without inventing verification or confidence", () => {
  const item = projection().packages[0], actual = item.evidence.domains[0], required = item.evidence.domains[1];
  assert.equal(actual.domain, "nomera.com"); assert.equal(actual.status, "available"); assert.equal(actual.authoritative, true);
  assert.equal(actual.source, "verisign-rdap"); assert.equal(actual.observed_at, at);
  assert.equal(actual.verified_at, null); assert.equal(actual.confidence, null);
  assert.equal(actual.freshness.status, "fresh"); assert.equal(actual.freshness.age_seconds, 1);
  assert.equal(actual.classification, "OBSERVED");
  assert.deepEqual(actual.naming_score, { classification: "DERIVED", value: 82 }); assert.equal(actual.recheck_supported, true);
  assert.equal(required.domain, "nomera.se"); assert.equal(required.requested_alternative, true);
  assert.equal(required.classification, "DERIVED"); assert.equal(required.status, "unknown");
  assert.equal(required.observed_at, null); assert.equal(required.source, null); assert.equal(required.freshness.status, "unknown");
  assert.equal(required.naming_score.value, null);
  assert.equal(item.index.score_parts.domains.score, 15);
});

test("top-level receipt timestamps never rescue missing row evidence", () => {
  for (const checkedAt of [undefined, null]) {
    const output = projectNamePackageIntelligence({ results: [row("nomera.com", { checkedAt })], checkedAt: at, generated_at: at }, settings);
    const domain = output.packages[0].evidence.domains[0];
    assert.equal(domain.observed_at, null); assert.equal(domain.freshness.status, "unknown");
    assert.equal(domain.status, "unknown"); assert.equal(domain.authoritative, false);
    assert.equal(domain.verified_at, null); assert.equal(output.packages[0].index.score_parts.domains.score, 0);
  }
});

test("a fresh domain never refreshes a stale, future or undated sibling", () => {
  const stale = new Date(now - NAME_PACKAGE_EVIDENCE_MAX_AGE_MS - 1).toISOString(), future = new Date(now + 1).toISOString();
  const out = projection([row(), row("nomera.se", { checkedAt: stale }), row("nomera.org", { checkedAt: future }), row("nomera.net", { checkedAt: null })]);
  const domains = new Map(out.packages[0].evidence.domains.map(item => [item.domain, item]));
  assert.equal(domains.get("nomera.com")?.status, "available");
  assert.equal(domains.get("nomera.se")?.freshness.status, "stale"); assert.equal(domains.get("nomera.se")?.observed_at, stale);
  assert.equal(domains.get("nomera.org")?.freshness.status, "future"); assert.equal(domains.get("nomera.org")?.observed_at, future);
  assert.equal(domains.get("nomera.net")?.freshness.status, "unknown");
  for (const domain of ["nomera.se", "nomera.org", "nomera.net"]) { assert.equal(domains.get(domain)?.status, "unknown"); assert.equal(domains.get(domain)?.authoritative, false); }
  assert.equal(domains.get("nomera.org")?.freshness.age_seconds, null);
  assert.equal(out.packages[0].index.score_parts.domains.score, 8);
});

test("freshness has exact boundary behavior and projection does not renew a date", () => {
  const atBoundary = projectNamePackageIntelligence({ results: [row()] }, { ...settings, now: Date.parse(at) + NAME_PACKAGE_EVIDENCE_MAX_AGE_MS });
  assert.equal(atBoundary.packages[0].evidence.domains[0].status, "available");
  const after = projectNamePackageIntelligence({ results: [row()] }, { ...settings, now: Date.parse(at) + NAME_PACKAGE_EVIDENCE_MAX_AGE_MS + 1 });
  assert.equal(after.packages[0].evidence.domains[0].status, "unknown"); assert.equal(after.packages[0].evidence.domains[0].freshness.status, "stale");
  assert.equal(after.packages[0].evidence.domains[0].observed_at, at);
  assert.notEqual(after.generated_at, atBoundary.generated_at);
});

test("unknown, DNS-only and unauthoritative observations never become available", () => {
  for (const extra of [{ status: "unknown" }, { status: "checking" }, { checkMethod: "dns" }, { authoritative: false }, { checkMethod: "none" }, { checkMethod: "error" }]) {
    const output = projection([row("nomera.com", extra)]);
    assert.equal(output.packages[0].evidence.domains[0].status, "unknown");
    assert.equal(output.packages[0].index.score_parts.domains.score, 0);
  }
  assert.equal(projection([row("nomera.com", { status: "taken" })]).packages[0].evidence.domains[0].status, "taken");
});

test("machine projection is the shared scorer, not a parallel scoring algorithm", () => {
  const rows = [row("zavaro.com"), row("nomera.com"), row("nomera.se", { status: "taken" }), row("nomo.com", { namingScore: 41 })];
  const output = projection(rows);
  const core = buildNamePackages(rows.map(item => ({ domain: item.domain, status: item.status as "available" | "taken",
    availabilityVerified: item.authoritative, checkMethod: item.checkMethod, checkedAt: item.checkedAt, source: item.source, namingScore: item.namingScore })),
  { platforms: settings.platforms, requiredTlds: settings.requiredTlds, observedAt: null, now });
  assert.deepEqual(output.packages.map(item => item.entity_id), core.map(item => item.id));
  output.packages.forEach((item, index) => {
    assert.equal(item.rank, index + 1); assert.equal(item.index.score, core[index].packageScore);
    assert.equal(item.index.name_fit_score, core[index].fitScore); assert.equal(item.index.evidence_coverage_percent, core[index].evidenceCoverage);
    assert.equal(item.index.risk_penalty, core[index].riskPenalty);
    for (const key of ["fit", "domains", "socials", "company", "trademark"] as const) { assert.equal(item.index.score_parts[key].score, core[index].scoreParts[key].score); assert.equal(item.index.score_parts[key].maximum, core[index].scoreParts[key].max); }
    assert.ok(item.index.score <= 70); assert.equal(item.index.classification, "DERIVED");
  });
  assert.deepEqual(output, projection([...rows].reverse(), { ...settings, platforms: [...settings.platforms].reverse(), requiredTlds: [...settings.requiredTlds].reverse() }));
  assert.equal(NAME_PACKAGE_INTELLIGENCE_METHODOLOGY.current_attainable_maximum, 70);
  assert.deepEqual(NAME_PACKAGE_INTELLIGENCE_METHODOLOGY.score_weights, { fit: 40, domains: 30, socials: 20, company: 5, trademark: 5 });
});

test("duplicates cannot multiply evidence or remove a conflict", () => {
  const output = projection([row(), row(), row("nomera.com", { status: "taken" })]);
  const reversed = projection([row("nomera.com", { status: "taken" }), row(), row()]);
  assert.deepEqual(output, reversed); assert.equal(output.packages[0].evidence.domains.length, 2);
  assert.equal(output.packages[0].evidence.domains[0].status, "taken");
  assert.equal(new Set(output.packages[0].evidence.domains.map(item => item.evidence_id)).size, 2);
});

test("social and company fields from the engine cannot fabricate free names or legal clearance", () => {
  const output = projectNamePackageIntelligence({ results: [row("nomera.com", { company: "available", socials: [{ platform: "github", status: "available" }], confidenceScore: 99 })],
    company: { status: "verified", country: "SE", organizationNumber: "private-id" }, socials: [{ status: "not_found" }], trademark: { registered: false } }, settings);
  const item = output.packages[0];
  for (const social of item.evidence.socials) {
    assert.equal(social.status, "not_checked"); assert.equal(social.registration_status, "unknown"); assert.equal(social.classification, "UNVERIFIED");
    assert.equal(social.source, null); assert.equal(social.observed_at, null); assert.equal(social.verified_at, null); assert.equal(social.confidence, null);
    assert.equal(social.format_assessment.classification, "DERIVED");
  }
  for (const record of [item.evidence.company, item.evidence.trademark]) { assert.equal(record.status, "not_checked"); assert.equal(record.observed_at, null); assert.equal(record.source, null); assert.equal(record.confidence, null); }
  assert.equal(item.index.score_parts.socials.score, 0); assert.equal(item.index.score_parts.company.score, 0); assert.equal(item.index.score_parts.trademark.score, 0);
  assert.equal(item.price_assessment.status, "not_assessed");
});

test("signals remain derived and refer only to evidence IDs in the same package", () => {
  const output = projection();
  for (const item of output.packages) {
    const allowed = new Set([...item.evidence.domains, ...item.evidence.socials, item.evidence.company, item.evidence.trademark].map(value => value.evidence_id));
    for (const signal of item.signals) { assert.equal(signal.classification, "DERIVED"); assert.ok(signal.evidence_ids.every(id => allowed.has(id))); }
    assert.ok(item.signals.some(signal => signal.code === "company_check_required"));
    assert.ok(item.signals.some(signal => signal.code === "trademark_check_required"));
  }
});

test("only actual API checks and explicitly manual profile actions are offered", () => {
  const item = projection().packages[0];
  const domains = item.available_actions.find(action => action.type === "domains_check")!;
  assert.equal(domains.type, "domains_check");
  if (domains.type === "domains_check") { assert.deepEqual(domains.domains, ["nomera.com", "nomera.se"]); assert.equal(domains.automatic, false); }
  assert.ok(item.available_actions.every(action => action.type === "domains_check" || action.type === "manual_profile_check" && action.manual));
  assert.ok(!JSON.stringify(item.available_actions).includes("company_check"));
  const idn = projection([row("café.se")]).packages[0];
  assert.equal(idn.entity_id, "name-package:xn--caf-dma"); assert.equal(idn.available_actions.length, 1);
  assert.ok(idn.evidence.socials.every(social => social.handle === null));
});

test("all selected API extensions produce callable <=10-domain action batches; unsupported suffixes remain explicit", () => {
  const output = projectNamePackageIntelligence({ results: [row()] }, { ...settings, requiredTlds: [...NAMES_API_TLDS] });
  const actions = output.packages[0].available_actions.filter(action => action.type === "domains_check");
  assert.equal(actions.length, 2);
  assert.deepEqual(actions.map(action => action.domains.length), [10, 1]);
  for (const action of actions) assert.doesNotThrow(() => parseNamesApiRequest({ domains: action.domains, tlds: [...new Set(action.domains.map(name => name.split(".").at(-1)!))] }));
  const unsupported = projectNamePackageIntelligence({ results: [row("nomera.co.uk")] }, { ...settings, requiredTlds: [] }).packages[0];
  assert.equal(unsupported.evidence.domains[0].recheck_supported, false);
  assert.equal(unsupported.available_actions.some(action => action.type === "domains_check"), false);
  assert.ok(unsupported.index.limitations.includes("automated_rechecks_limited_to_supported_extensions"));
});

test("published derived naming inputs can reproduce the index without hidden scores", () => {
  const output = projection([row(), row("nomera.se", { namingScore: 65 }), row("tavora.com", { checkedAt: null, namingScore: 45 })]);
  const replay = buildNamePackages(output.packages.flatMap(pkg => pkg.evidence.domains.map(domain => ({ domain: domain.domain,
    status: domain.status, availabilityVerified: domain.authoritative, checkMethod: domain.check_method,
    checkedAt: domain.observed_at, ...(domain.source ? { source: domain.source } : {}),
    ...(domain.naming_score.value === null ? {} : { namingScore: domain.naming_score.value }),
  }))), { ...settings, observedAt: null });
  assert.deepEqual(replay.map(pkg => [pkg.id, pkg.packageScore, pkg.fitScore]), output.packages.map(pkg => [pkg.entity_id, pkg.index.score, pkg.index.name_fit_score]));
});

test("private and unrelated engine fields are omitted, including prices and tokens", () => {
  const secret = "never-expose-this-private-prompt";
  const output = projectNamePackageIntelligence({ results: [row("nomera.com", { rationale: secret, estimatedValue: 45000, registrarOffer: { registrationPrice: 9 }, token: secret })],
    brief: secret, apiKey: secret, accountId: secret, owner: secret, generation: { prompt: secret } }, settings);
  const serialized = JSON.stringify(output);
  assert.ok(!serialized.includes(secret)); assert.ok(!serialized.includes("45000")); assert.ok(!serialized.includes("registrarOffer"));
  assert.ok(!serialized.includes("registrationPrice")); assert.ok(!serialized.includes("estimatedValue"));
});

test("closed output schema rejects additions at every significant trust boundary", () => {
  const output = projection();
  const variants = [
    { ...output, raw: {} },
    { ...output, packages: [{ ...output.packages[0], company_id: "invented" }] },
    { ...output, packages: [{ ...output.packages[0], index: { ...output.packages[0].index, confidence: 0.98 } }] },
    { ...output, packages: [{ ...output.packages[0], evidence: { ...output.packages[0].evidence, raw: {} } }] },
    { ...output, packages: [{ ...output.packages[0], evidence: { ...output.packages[0].evidence, domains: [{ ...output.packages[0].evidence.domains[0], secret: "no" }] } }] },
    { ...output, packages: [{ ...output.packages[0], price_assessment: { status: "not_assessed", price: 9 } }] },
  ];
  for (const variant of variants) assert.equal(namePackageIntelligenceSchema.safeParse(variant).success, false);
});

test("malformed provider payloads fail generically without partial or coerced results", () => {
  const badPayloads: unknown[] = [null, [], {}, { results: null }, { results: "no" }, { results: [null] }, { results: [row(), { domain: "bad" }] },
    { results: [row("https://private.test/path")] }, { results: [row("example.invalid")] }, { results: [row("nomera.com", { authoritative: "true" })] },
    { results: [row("nomera.com", { namingScore: 101 })] }, { results: [row("nomera.com", { checkedAt: "not-a-date" })] },
    { results: [row("nomera.com", { checkedAt: "2026-02-30T12:00:00.000Z" })] }, { results: [row("nomera.com", { source: "https://secret:token@rdap.example/query" })] },
    { results: [row("nomera.com", { source: "https://rdap.example/?token=secret" })] }, { results: [row("nomera.com", { source: "<script>private</script>" })] },
    { results: Array(1001).fill(row()) },
  ];
  for (const payload of badPayloads) genericFailure(() => projectNamePackageIntelligence(payload, settings));
});

test("options are bounded and invalid suffixes never improve the denominator", () => {
  for (const extra of [{ limit: 0 }, { limit: 11 }, { limit: 1.5 }, { now: NaN }, { now: -1 },
    { platforms: ["mastodon"] }, { platforms: ["github", "github"] }, { requiredTlds: ["com", "github.io"] }, { requiredTlds: ["com", "bad.invalid"] }]) {
    genericFailure(() => projectNamePackageIntelligence({ results: [row()] }, { ...settings, ...extra } as typeof settings));
  }
  const rows = ["nomera", "tavora", "navera", "namora", "namera", "nimora", "novora", "nemora", "numera", "tamora", "tamero", "tavero"].map(name => row(`${name}.com`));
  assert.equal(projection(rows).returned_count, 10);
  const smaller = projectNamePackageIntelligence({ results: rows }, { ...settings, limit: 3 });
  assert.equal(smaller.requested_count, 3); assert.equal(smaller.returned_count, 3); assert.equal(smaller.packages.length, 3);
  const empty = projectNamePackageIntelligence({ results: [] }, { ...settings, limit: 3 });
  assert.equal(empty.returned_count, 0); assert.deepEqual(empty.packages, []);
});

test("projection does not mutate input data or options", () => {
  const payload = { results: [row(), row("nomera.se", { checkedAt: null })], checkedAt: at };
  const options = structuredClone(settings), beforePayload = structuredClone(payload), beforeOptions = structuredClone(options);
  projectNamePackageIntelligence(payload, options);
  assert.deepEqual(payload, beforePayload); assert.deepEqual(options, beforeOptions);
});
