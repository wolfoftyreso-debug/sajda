import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod/v4";
import {
  assessBrandPresence, brandIndexInputSchema, brandIndexResultSchema, buildBrandIndexTargets,
  BRAND_INDEX_REPORT_MAX_AGE_MS, BRAND_INDEX_WEIGHTS, type BrandIndexInput,
} from "../shared/brand-presence-index";
import { NAME_PACKAGE_MARKET_CODES } from "../shared/name-package-markets";

const NOW = Date.parse("2026-09-13T12:00:00.000Z");
const AT = new Date(NOW).toISOString();
function scope(): BrandIndexInput {
  return { brand_name: "Example Brand", identity_label: "example", primary_domain: "example.com", domains: ["example.com"],
    socials: [{ platform: "github", handle: "example" }], markets: ["US"], observations: [] };
}
function reports(input = scope(), status: BrandIndexInput["observations"][number]["status"] = "reported_owned", at: string | null = AT): BrandIndexInput {
  return { ...input, observations: buildBrandIndexTargets(input).map(target => ({ target_id: target.id, status, reported_at: at })) };
}

test("an unresearched existing brand has no score, not a zero or a popularity-based score", () => {
  for (const brand_name of ["Example Brand", "IKEA", "Apple", "Unknown company"]) {
    const result = assessBrandPresence({ ...scope(), brand_name }, NOW);
    assert.equal(result.index.reported_score, null);
    assert.equal(result.index.verified_score, null);
    assert.equal(result.index.status, "needs_reports");
    assert.equal(result.counts.assessed, 0);
    assert.equal(result.counts.unassessed, 3);
    assert.equal(result.index.verified_coverage_percent, 0);
    assert.equal(result.index.confidence, null);
  }
});

test("a complete coherent set of current claims yields 100 only as a scoped self-assessment", () => {
  const result = assessBrandPresence(reports(), NOW);
  assert.equal(result.index.reported_score, 100);
  assert.equal(result.index.classification, "SELF_ASSESSMENT");
  assert.equal(result.index.verified_score, null);
  assert.equal(result.index.status, "ready");
  assert.equal(result.scope.is_global_score, false);
  assert.equal(result.index.reported_coverage_percent, 100);
  assert.equal(result.counts.owned, 3);
  assert.ok(result.targets.every(target => target.classification === "USER_SUPPLIED"));
  assert.equal(Object.values(BRAND_INDEX_WEIGHTS).reduce((sum, weight) => sum + weight, 0), 100);
});

test("authorized use is credited for brand presence but never relabelled as direct ownership", () => {
  const result = assessBrandPresence(reports(scope(), "reported_authorized"), NOW);
  assert.equal(result.index.reported_score, 100);
  assert.equal(result.counts.authorized, 3);
  assert.equal(result.counts.owned, 0);
  assert.ok(result.limitations.includes("authorized_use_not_direct_ownership"));
});

test("a matching name is not proof of control, even with an official-looking source", () => {
  const input = reports(scope(), "matching_name_only");
  input.observations.forEach(item => { item.source_url = "https://www.ikea.com/"; });
  const result = assessBrandPresence(input, NOW);
  assert.equal(result.index.reported_score, null);
  assert.equal(result.index.reported_coverage_percent, 0);
  assert.equal(result.counts.matching_only, 3);
  assert.equal(result.index.verified_score, null);
});

test("reported conflicts are assessed negatives, unlike missing evidence", () => {
  const result = assessBrandPresence(reports(scope(), "reported_conflict"), NOW);
  assert.equal(result.index.reported_score, 0);
  assert.equal(result.index.reported_coverage_percent, 100);
  assert.equal(result.counts.conflicts, 3);
  assert.equal(result.counts.unassessed, 0);
  assert.equal(result.index.verified_score, null);
});

test("every category must have a current assessed report even when weighted coverage is high", () => {
  const input = reports();
  input.observations = input.observations.filter(item => item.target_id !== "market:US");
  const result = assessBrandPresence(input, NOW);
  assert.equal(result.index.reported_coverage_percent, 75);
  assert.equal(result.index.reported_score, null);
  assert.equal(result.index.status, "needs_reports");
});

test("unknown targets remain in the fixed denominator; adding countries cannot inflate the score", () => {
  const input = reports();
  input.markets = [...NAME_PACKAGE_MARKET_CODES];
  const result = assessBrandPresence(input, NOW);
  assert.equal(result.index.reported_score, 76);
  assert.equal(result.subscores.markets.score, 0.66);
  assert.equal(result.counts.unassessed, NAME_PACKAGE_MARKET_CODES.length - 1);
  assert.notEqual(result.scope.comparison_key, assessBrandPresence(reports(), NOW).scope.comparison_key);
  assert.equal(result.scope.is_global_score, false);
});

test("sparse current claims in each category do not bypass the minimum weighted-coverage gate", () => {
  const input = reports();
  input.domains.push("example.org", "example.net");
  input.socials.push({ platform: "instagram", handle: "example" }, { platform: "youtube", handle: "example" });
  input.markets.push("SE", "DE");
  const result = assessBrandPresence(input, NOW);
  assert.equal(result.index.reported_coverage_percent, 33);
  assert.equal(result.index.reported_score, null);
});

test("displayed coverage never rounds upward across the readiness threshold", () => {
  const input = reports();
  input.socials.push({ platform: "instagram", handle: "example" });
  input.markets = NAME_PACKAGE_MARKET_CODES.slice(0, 11);
  const result = assessBrandPresence(input, NOW);
  assert.equal(result.index.reported_coverage_percent, 59);
  assert.equal(result.index.reported_score, null);
  assert.equal(result.index.status, "needs_reports");
});

test("namespace consistency is exact, separately scored, and conditional on reported control", () => {
  const input = scope();
  input.domains.push("example.org", "example-company.com");
  input.socials[0].handle = "example_official";
  const result = assessBrandPresence(reports(input), NOW);
  assert.equal(result.subscores.domains.score, 35);
  assert.equal(result.subscores.socials.score, 25);
  assert.equal(result.subscores.markets.score, 25);
  assert.equal(result.subscores.consistency.score, 7.5);
  assert.equal(result.index.reported_score, 93);
});

test("freshness is based on the report timestamp, never the assessment time", () => {
  for (const at of [null, new Date(NOW + 1).toISOString(), new Date(NOW - BRAND_INDEX_REPORT_MAX_AGE_MS - 1).toISOString()]) {
    const result = assessBrandPresence(reports(scope(), "reported_owned", at), NOW);
    assert.equal(result.index.reported_score, null);
    assert.equal(result.index.reported_coverage_percent, 0);
    assert.ok(result.targets.every(target => target.reported_at === at));
  }
  assert.equal(assessBrandPresence(reports(scope(), "reported_owned", new Date(NOW - BRAND_INDEX_REPORT_MAX_AGE_MS).toISOString()), NOW).index.reported_score, 100);
  assert.equal(assessBrandPresence(reports(), NOW + BRAND_INDEX_REPORT_MAX_AGE_MS + 1).index.reported_score, null);
  const offset = assessBrandPresence(reports(scope(), "reported_owned", "2026-09-13T14:00:00+02:00"), NOW);
  assert.equal(offset.index.reported_score, 100);
});

test("caller-supplied authority, dates, scores and extra fields cannot become verified evidence", () => {
  for (const extra of [{ verified: true }, { verified_score: 99 }, { verified_at: AT }, { confidence: 1 }, { classification: "VERIFIED" }]) {
    assert.equal(brandIndexInputSchema.safeParse({ ...scope(), ...extra }).success, false);
    const input = reports();
    Object.assign(input.observations[0], extra);
    assert.equal(brandIndexInputSchema.safeParse(input).success, false);
  }
});

test("invalid UTC offsets cannot masquerade as permanently current reports", () => {
  for (const offset of ["+24:00", "+99:99", "+00:60", "-24:00", "-99:99"]) {
    assert.equal(brandIndexInputSchema.safeParse(reports(scope(), "reported_owned", `2026-09-13T12:00:00${offset}`)).success, false, offset);
  }
});

test("scope and reports are bounded, duplicate-free, normalized and referentially valid", () => {
  const normalized = brandIndexInputSchema.parse({ ...scope(), primary_domain: " EXAMPLE.COM ", domains: [" Example.COM "], socials: [{ platform: "github", handle: " EXAMPLE " }] });
  assert.equal(normalized.primary_domain, "example.com");
  assert.equal(normalized.socials[0].handle, "example");
  for (const input of [
    { ...scope(), domains: ["example.com", "EXAMPLE.COM"] },
    { ...scope(), domains: ["example.org"] },
    { ...scope(), socials: [{ platform: "github", handle: "example" }, { platform: "github", handle: "other" }] },
    { ...scope(), markets: ["US", "US"] }, { ...scope(), markets: ["EU"] }, { ...scope(), markets: [] },
    { ...scope(), domains: Array.from({ length: 21 }, (_, i) => `example${i}.com`) },
    { ...scope(), observations: [{ target_id: "domain:unrelated.com", status: "reported_owned", reported_at: AT }] },
    { ...scope(), observations: Array(2).fill({ target_id: "market:US", status: "reported_owned", reported_at: AT }) },
  ]) assert.equal(brandIndexInputSchema.safeParse(input).success, false);
});

test("domain and handle inputs cannot silently become URLs, subdomains, private suffixes or IPs", () => {
  for (const primary_domain of ["github.io", "vercel.app", "pages.dev", "blogspot.com"]) {
    assert.equal(brandIndexInputSchema.safeParse({ ...scope(), primary_domain, domains: [primary_domain] }).success, true, primary_domain);
  }
  for (const primary_domain of ["https://example.com", "example.com/path", "www.example.com", "localhost", "127.0.0.1", "example.github.io", "example..com", "-example.com", "example.invalid"]) {
    assert.equal(brandIndexInputSchema.safeParse({ ...scope(), primary_domain, domains: [primary_domain] }).success, false, primary_domain);
  }
  for (const handle of ["@example", "https://github.com/example", "example user", "<script>", ""]) {
    assert.equal(brandIndexInputSchema.safeParse({ ...scope(), socials: [{ platform: "github", handle }] }).success, false, handle);
  }
});

test("source links are optional, bounded, public HTTPS references and never fetched or trusted", () => {
  for (const source_url of ["http://example.com", "https://user:password@example.com", "https://localhost", "https://127.0.0.1", "https://example.com:8443/", "https://example.com/?token=secret", "https://example.com/#secret", "javascript:alert(1)"]) {
    const input = reports(); input.observations[0].source_url = source_url;
    assert.equal(brandIndexInputSchema.safeParse(input).success, false, source_url);
  }
  const input = reports(); input.observations[0].source_url = "https://example.com/about";
  const result = assessBrandPresence(input, NOW);
  assert.equal(result.targets[0].source_url, "https://example.com/about");
  assert.equal(result.targets[0].classification, "USER_SUPPLIED");
  assert.equal(result.index.verified_score, null);
});

test("identical scopes have stable keys across ordering; changed identity or scope is not comparable", () => {
  const input = scope(); input.domains.push("example.org"); input.markets.push("SE");
  input.socials.push({ platform: "instagram", handle: "example" });
  const result = assessBrandPresence(reports(input), NOW);
  const reversed = { ...input, domains: [...input.domains].reverse(), markets: [...input.markets].reverse(), socials: [...input.socials].reverse() };
  assert.equal(result.scope.comparison_key, assessBrandPresence(reversed, NOW + 1).scope.comparison_key);
  assert.deepEqual(result.targets.map(target => target.id), assessBrandPresence(reversed, NOW).targets.map(target => target.id));
  assert.notEqual(result.scope.comparison_key, assessBrandPresence({ ...input, identity_label: "different" }, NOW).scope.comparison_key);
  assert.notEqual(result.scope.comparison_key, assessBrandPresence({ ...input, primary_domain: "example.org" }, NOW).scope.comparison_key);
});

test("pure model output is reproducible, JSON-schema representable and cannot assert verification", () => {
  const result = assessBrandPresence(reports(), NOW);
  assert.deepEqual(result, assessBrandPresence(reports(), NOW));
  assert.equal(z.toJSONSchema(brandIndexResultSchema).type, "object");
  assert.equal(z.toJSONSchema(brandIndexInputSchema, { io: "input" }).type, "object");
  assert.equal(brandIndexResultSchema.safeParse({ ...result, index: { ...result.index, verified_score: 99 } }).success, false);
  assert.equal(brandIndexResultSchema.safeParse({ ...result, scope: { ...result.scope, is_global_score: true } }).success, false);
  for (const now of [NaN, Infinity, -1, 1.5, 253_402_300_800_000]) assert.throws(() => assessBrandPresence(scope(), now));
});
