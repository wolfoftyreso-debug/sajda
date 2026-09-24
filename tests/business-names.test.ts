import assert from "node:assert/strict";
import test from "node:test";
import { AccountAccessError } from "../api/_shared/account-error.js";
import { parseBusinessNamesRequest, businessNamesRequestSchema, businessNamesResultSchema } from "../api/_shared/business-names-contract.js";
import { executeBusinessNamesRecommendation } from "../api/_shared/business-names.js";
import { generateNamePackageCandidates } from "../api/_shared/name-package-candidates.js";
import { summarizeConnectorBusinessBrief } from "../api/_shared/connector-candidates.js";
import type { NamePackageSearchRequest } from "../api/_shared/name-package-contract.js";
import { projectNamePackageIntelligence } from "../shared/name-package-intelligence.js";
import { BRAND_NAME_LANGUAGES } from "../shared/name-languages.js";
import { DEFAULT_NAME_PACKAGE_MARKETS } from "../shared/name-package-markets.js";
import { z } from "zod/v4";

const now = Date.parse("2026-09-17T12:00:00Z");
const base = { businessDescription: "An independent bakery making artisan bread for local families" };
function evidence(input: NamePackageSearchRequest, statuses: string[] = []) {
  const domains = generateNamePackageCandidates(input).domains;
  return projectNamePackageIntelligence({ results: domains.map((domain, index) => {
    const status = statuses[index] ?? "available";
    return { domain, status: status === "stale" || status === "undated" ? "available" : status,
      authoritative: status !== "unknown", checkMethod: status === "unknown" ? "none" : "rdap",
      source: status === "unknown" ? null : "verisign-com-rdap",
      checkedAt: status === "undated" || status === "unknown" ? null : new Date(now - (status === "stale" ? 3_600_000 : 30_000)).toISOString() };
  }) }, { platforms: input.platforms, requiredTlds: input.tlds, markets: input.markets, limit: input.count, now });
}

test("business-name contract is strict, bounded and defaults documented discovery requirements", () => {
  const parsed = parseBusinessNamesRequest(base);
  assert.equal(parsed.businessDescription, base.businessDescription);
  assert.equal(parsed.nameLanguage, "en"); assert.equal(parsed.locale, "en"); assert.equal(parsed.count, 10);
  assert.deepEqual(parsed.tlds, ["com"]); assert.deepEqual(parsed.platforms, ["instagram", "linkedin"]);
  assert.deepEqual(parsed.markets, DEFAULT_NAME_PACKAGE_MARKETS); assert.deepEqual(parsed.keywords, []);
  for (const changes of [{ businessDescription: " " }, { businessDescription: "x".repeat(1001) },
    { businessDescription: "<script>name</script>" }, { businessDescription: "hidden\u200bword" },
    { keywords: Array(9).fill("bakery") }, { keywords: ["bread", "BREAD"] }, { keywords: ["https://example.com"] },
    { keywords: ["x".repeat(41)] }, { nameLanguage: "zh" }, { locale: "it" }, { count: 11 }, { count: "10" },
    { tlds: ["com", "com"] }, { platforms: [] }, { markets: ["EU"] }, { providers: ["unknown"] },
    { budget: 100 }, { aiConsent: true }, { userId: "other-user" }, { evidence: [] }]) {
    assert.throws(() => parseBusinessNamesRequest({ ...base, ...changes }), AccountAccessError);
  }
  for (const value of [null, "bakery", []]) assert.throws(() => parseBusinessNamesRequest(value), AccountAccessError);
  assert.doesNotThrow(() => z.toJSONSchema(businessNamesRequestSchema));
  assert.doesNotThrow(() => z.toJSONSchema(businessNamesResultSchema));
});

test("brief compression considers the whole description, preserves explicit keywords and exposes its interpretation", () => {
  const description = "We want to create a new company and need a clear name. ".repeat(6)
    + "Our business is an artisan bakery making bread.";
  assert.ok(description.indexOf("bakery") > 100);
  const brief = summarizeConnectorBusinessBrief(description, ["pastry"]);
  assert.ok(brief.query.length <= 100);
  assert.ok(brief.recognized_topics.some(topic => topic.id === "food" && topic.matched_terms.includes("bakery")));
  assert.ok(brief.included_terms.includes("pastry"));
  assert.ok(brief.included_terms.includes("food"));
  assert.equal(brief.query, brief.included_terms.join(" "));
  assert.deepEqual(summarizeConnectorBusinessBrief(description, ["pastry"]), brief);
});

test("top ten is one bounded package search and ranks actual available evidence with Brand Index", async () => {
  let searches = 0;
  const result = await executeBusinessNamesRecommendation(base, async input => {
    searches++; assert.equal(input.count, 10); assert.equal(input.nameLanguage, "en");
    assert.ok(generateNamePackageCandidates(input).domains.length <= 110);
    assert.equal("businessDescription" in input, false); assert.equal("aiConsent" in input, false);
    return evidence(input);
  });
  assert.equal(searches, 1); assert.equal(result.returned_count, 10); assert.equal(result.completeness, "complete");
  assert.equal(result.shortfall_reason, null); assert.equal(result.methodology.ai_used, false);
  assert.equal(result.requirements.business_description, base.businessDescription);
  assert.ok(result.recommendations.every((row, index) => row.rank === index + 1 && row.name === row.package.canonical_name));
  assert.ok(result.recommendations.every(row => row.package.brand_index.mode === "candidate"
    && row.package.brand_index.legalClearance === false && row.available_domains.includes(`${row.name}.com`)));
  assert.ok(result.recommendations.every(row => row.package.evidence.company.status === "not_checked"
    && row.package.evidence.trademark.status === "not_checked" && row.package.evidence.socials.every(social => social.registration_status === "unknown")));
  assert.ok(result.recommendations.every((row, index, all) => index === 0 || all[index - 1].package.brand_index.score >= row.package.brand_index.score));
  assert.deepEqual(businessNamesResultSchema.parse(result), result);
});

test("requested count is a result limit, not fabricated padding, and unknown/taken/stale/undated names are excluded", async () => {
  const statuses = ["available", "available", "taken", "stale", "unknown", "undated", "taken", "taken", "taken", "taken"];
  const partial = await executeBusinessNamesRecommendation(base, async input => evidence(input, statuses));
  assert.equal(partial.returned_count, 2); assert.equal(partial.completeness, "partial");
  assert.equal(partial.shortfall_reason, "insufficient_fresh_available_domains");
  assert.equal(partial.intelligence.returned_count, 10, "Unrecommended candidates retain their explicit evidence.");
  const none = await executeBusinessNamesRecommendation(base, async input => evidence(input, Array(10).fill("unknown")));
  assert.equal(none.returned_count, 0); assert.deepEqual(none.recommendations, []);
  assert.equal(none.shortfall_reason, "no_fresh_available_domains"); assert.equal(none.completeness, "none");
  const three = await executeBusinessNamesRecommendation({ ...base, count: 3 }, async input => {
    assert.equal(input.count, 10); return evidence(input);
  });
  assert.equal(three.requested_count, 3); assert.equal(three.returned_count, 3); assert.equal(three.shortfall_reason, null);
});

test("all seven naming languages are independent of locale and use the same real package boundary", async () => {
  const names = new Map<string, string[]>();
  for (const nameLanguage of BRAND_NAME_LANGUAGES) {
    const result = await executeBusinessNamesRecommendation({ ...base, nameLanguage, locale: "sv", count: 2 }, async input => {
      assert.equal(input.nameLanguage, nameLanguage); assert.equal(input.locale, "sv"); return evidence(input);
    });
    assert.equal(result.requirements.name_language, nameLanguage);
    names.set(nameLanguage, result.recommendations.map(row => row.name));
  }
  assert.equal(new Set([...names.values()].map(value => value.join(","))).size, BRAND_NAME_LANGUAGES.length);
});

test("multiple endings require at least one fresh requested alternative without claiming full coverage", async () => {
  const result = await executeBusinessNamesRecommendation({ ...base, tlds: ["com", "dev"], count: 1 }, async input =>
    evidence(input, Array.from({ length: 20 }, (_, index) => index % 2 ? "available" : "taken")));
  assert.equal(result.returned_count, 1);
  assert.deepEqual(result.recommendations[0].available_domains, [`${result.recommendations[0].name}.dev`]);
  assert.ok(result.recommendations[0].package.evidence.domains.some(domain => domain.status === "taken"));
  assert.equal(result.recommendations[0].package.brand_index.status, "conflicts_found");
});

test("malformed and meaningless input do not spend searches; upstream errors retain exact retry semantics", async () => {
  for (const request of [{ ...base, count: 11 }, { businessDescription: "企業名称" }, { businessDescription: "and the for" }]) {
    await assert.rejects(executeBusinessNamesRecommendation(request, async () => assert.fail("Invalid input must stop before search")), AccountAccessError);
  }
  const limited = new AccountAccessError("rate_limited", 429, "Retry later");
  Object.assign(limited, { retryAfterSeconds: 120 });
  await assert.rejects(executeBusinessNamesRecommendation(base, async () => { throw limited; }), error => error === limited);
});

test("output rejects unrelated candidate evidence and inconsistent public recommendation counts", async () => {
  await assert.rejects(executeBusinessNamesRecommendation(base, async input => evidence({ ...input, query: "security encryption" })),
    /did not match/u);
  const result = await executeBusinessNamesRecommendation(base, async input => evidence(input));
  assert.equal(businessNamesResultSchema.safeParse({ ...result, returned_count: 9 }).success, false);
  assert.equal(businessNamesResultSchema.safeParse({ ...result, estimatedValue: 10000 }).success, false);
  assert.equal(businessNamesResultSchema.safeParse({ ...result, shortfall_reason: "no_fresh_available_domains" }).success, false);
});
