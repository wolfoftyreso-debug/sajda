import assert from "node:assert/strict";
import test from "node:test";
import { executeBusinessNamesRecommendation } from "../api/_shared/business-names.js";
import { businessNamesResultSchema } from "../api/_shared/business-names-contract.js";
import { generateNamePackageCandidates } from "../api/_shared/name-package-candidates.js";
import type { NamePackageSearchRequest } from "../api/_shared/name-package-contract.js";
import { buildBusinessNameSummary, businessNameSummarySchema } from "../shared/business-name-summary.js";
import { projectNamePackageIntelligence } from "../shared/name-package-intelligence.js";

const now = Date.parse("2026-09-17T12:00:00Z");
const request = { businessDescription: "An artisan bakery serving local families", count: 10 };
type State = "available" | "taken" | "unknown" | "stale" | "undated" | "future" | "checking" | "unverified" | "omitted";

function observations(input: NamePackageSearchRequest, states: readonly (State | readonly State[])[]) {
  const { labels } = generateNamePackageCandidates(input);
  const results = labels.flatMap((label, index) => input.tlds.flatMap((tld, tldIndex) => {
    const entry = states[index] ?? "available";
    const state = typeof entry === "string" ? entry : entry[tldIndex] ?? "unknown";
    if (state === "omitted") return [];
    const status = ["stale", "undated", "future", "unverified"].includes(state) ? "available" : state;
    return [{ domain: `${label}.${tld}`, status,
      authoritative: !["unknown", "checking", "unverified"].includes(state),
      checkMethod: state === "unknown" ? "error" : state === "checking" ? "none" : "rdap",
      source: ["unknown", "checking"].includes(state) ? null : "registry-fixture",
      checkedAt: ["unknown", "checking", "undated"].includes(state) ? null
        : new Date(now + (state === "future" ? 60_000 : state === "stale" ? -3_600_000 : -30_000)).toISOString() }];
  }));
  return projectNamePackageIntelligence({ results }, {
    platforms: input.platforms, requiredTlds: input.tlds, markets: input.markets, limit: input.count, now,
  });
}

const sixAvailable: State[] = ["available", "available", "available", "available", "available", "available"];

test("six of ten always includes a localized lead, exact shortfall, truthful reasons and next steps", async () => {
  const headings = {
    en: "Found 6 of 10 requested names.",
    sv: "Vi hittade 6 av 10 önskade namn.",
    fr: "Nous avons trouvé 6 noms sur les 10 demandés.",
    es: "Encontramos 6 de los 10 nombres solicitados.",
    zh: "已找到所需 10 个名称中的 6 个。",
  };
  for (const [locale, headline] of Object.entries(headings)) {
    const result = await executeBusinessNamesRecommendation({ ...request, locale, nameLanguage: "fr" },
      async input => observations(input, [...sixAvailable, "taken", "taken", "unknown", "stale"]));
    const summary = result.result_summary;
    assert.equal(summary.locale, locale);
    assert.equal(summary.headline, headline);
    assert.equal(result.requirements.name_language, "fr", "Explanation language must not change naming language.");
    assert.deepEqual(summary.counts, {
      requested: 10, returned: 6, missing: 4, candidate_limit: 10, generated_candidates: 10,
      assessed_candidates: 10, eligible_candidates: 6, registered_only_candidates: 2,
      unconfirmed_candidates: 2, unassessed_candidates: 0,
    });
    assert.deepEqual(summary.reasons.map(({ code, candidate_count }) => ({ code, candidate_count })), [
      { code: "requested_domains_taken", candidate_count: 2 },
      { code: "availability_unconfirmed", candidate_count: 2 },
    ]);
    for (const reason of summary.reasons) assert.ok(summary.explanation.includes(reason.message));
    assert.deepEqual(summary.next_steps.map(step => step.action), ["retry_checks", "change_endings", "refine_brief"]);
    assert.ok(summary.next_steps.every(step => step.label.trim().length > 5));
    assert.equal(result.completeness, "partial");
    assert.deepEqual(businessNamesResultSchema.parse(result), result);
  }
});

test("mixed endings cannot turn unknown or outdated evidence into confirmed registration", async () => {
  const result = await executeBusinessNamesRecommendation({ ...request, tlds: ["com", "dev"] }, async input => observations(input, [
    ...sixAvailable,
    ["taken", "taken"], ["taken", "unknown"], ["taken", "stale"], ["taken", "omitted"],
  ]));
  assert.equal(result.returned_count, 6);
  assert.equal(result.result_summary.counts.registered_only_candidates, 1);
  assert.equal(result.result_summary.counts.unconfirmed_candidates, 3);
  assert.equal(result.result_summary.reasons.find(reason => reason.code === "availability_unconfirmed")?.candidate_count, 3);
});

test("stale, undated, future, nonauthoritative and checking observations remain unconfirmed", async () => {
  const result = await executeBusinessNamesRecommendation(request, async input => observations(input, [
    "stale", "undated", "future", "unverified", "checking", "unknown", "unknown", "unknown", "unknown", "unknown",
  ]));
  assert.equal(result.returned_count, 0);
  assert.equal(result.result_summary.counts.registered_only_candidates, 0);
  assert.equal(result.result_summary.counts.unconfirmed_candidates, 10);
  assert.deepEqual(result.result_summary.reasons.map(reason => reason.code), ["availability_unconfirmed"]);
  assert.match(result.result_summary.explanation, /does not mean a domain is taken/u);
  assert.doesNotMatch(result.result_summary.explanation, /outage|timeout|rate limit/u,
    "Unknown evidence does not establish the cause of a failed check.");
});

test("zero results explains a known-taken pool without claiming there are no names anywhere", async () => {
  const result = await executeBusinessNamesRecommendation(request, async input => observations(input, Array(10).fill("taken")));
  assert.equal(result.completeness, "none");
  assert.equal(result.result_summary.headline, "Found 0 of 10 requested names.");
  assert.equal(result.result_summary.counts.missing, 10);
  assert.equal(result.result_summary.counts.registered_only_candidates, 10);
  assert.deepEqual(result.result_summary.next_steps.map(step => step.action), ["change_endings", "refine_brief"]);
  assert.match(result.result_summary.explanation, /not an exhaustive search/u);
  assert.match(result.result_summary.explanation, /10 more names are needed/u);
});

test("omitted candidates have their own unknown count instead of silently disappearing", async () => {
  const result = await executeBusinessNamesRecommendation(request, async input => observations(input,
    [...sixAvailable, "taken", "unknown", "omitted", "omitted"]));
  const summary = result.result_summary;
  assert.equal(summary.counts.generated_candidates, 10);
  assert.equal(summary.counts.assessed_candidates, 8);
  assert.equal(summary.counts.unassessed_candidates, 2);
  assert.equal(summary.counts.unconfirmed_candidates, 1);
  assert.equal(summary.counts.registered_only_candidates, 1);
  assert.equal(summary.counts.missing, 4);
  assert.equal(summary.reasons.find(reason => reason.code === "candidates_not_assessed")?.candidate_count, 2);
});

test("a complete smaller request is not described as a shortfall or an excluded eligible pool", async () => {
  const result = await executeBusinessNamesRecommendation({ ...request, count: 3 }, async input => observations(input,
    [...sixAvailable, "taken", "taken", "taken", "taken"]));
  assert.equal(result.completeness, "complete");
  assert.equal(result.result_summary.headline, "Found 3 of 3 requested names.");
  assert.equal(result.result_summary.counts.eligible_candidates, 6);
  assert.equal(result.result_summary.counts.returned, 3);
  assert.equal(result.result_summary.counts.missing, 0);
  assert.deepEqual(result.result_summary.reasons, []);
  assert.deepEqual(result.result_summary.next_steps.map(step => step.action), ["review_results"]);
});

test("generation shortfall differs from failed availability checks", async () => {
  const result = await executeBusinessNamesRecommendation(request, async input => observations(input,
    [...sixAvailable, "omitted", "omitted", "omitted", "omitted"]));
  const summary = buildBusinessNameSummary({ locale: "en", requestedCount: 10, returnedCount: 6,
    candidateLimit: 10, generatedCount: 6, tlds: ["com"], intelligence: result.intelligence });
  assert.equal(summary.counts.unassessed_candidates, 0);
  assert.equal(summary.counts.unconfirmed_candidates, 0);
  assert.deepEqual(summary.reasons.map(reason => reason.code), ["insufficient_candidates_generated"]);
  assert.equal(summary.reasons[0].candidate_count, 4);
  assert.match(summary.explanation, /only 6 candidate names/u);
  assert.equal(summary.next_steps.some(step => step.action === "retry_checks"), false);
});

test("response validation rejects hidden shortfall, invented explanations and overlapping counts", async () => {
  const result = await executeBusinessNamesRecommendation(request, async input => observations(input,
    [...sixAvailable, "taken", "taken", "unknown", "stale"]));
  const mutations = [
    { ...result.result_summary, headline: "Here are your top 10 names." },
    { ...result.result_summary, explanation: "A provider outage caused this." },
    { ...result.result_summary, reasons: [] },
    { ...result.result_summary, locale: "sv" },
    { ...result.result_summary, counts: { ...result.result_summary.counts, missing: 0 } },
    { ...result.result_summary, counts: { ...result.result_summary.counts, registered_only_candidates: 4, unconfirmed_candidates: 0 } },
  ];
  for (const summary of mutations) assert.equal(businessNamesResultSchema.safeParse({ ...result, result_summary: summary }).success, false);
  const withoutSummary: Record<string, unknown> = { ...result };
  delete withoutSummary.result_summary;
  assert.equal(businessNamesResultSchema.safeParse(withoutSummary).success, false);
  assert.equal(businessNameSummarySchema.safeParse({ ...result.result_summary,
    counts: { ...result.result_summary.counts, eligible_candidates: 10 } }).success, false);
});

test("duplicated upstream candidates fail instead of inflating the explanation", async () => {
  await assert.rejects(executeBusinessNamesRecommendation(request, async input => {
    const intelligence = observations(input, ["available", "taken", "taken", "taken", "taken", "taken", "taken", "taken", "taken", "taken"]);
    intelligence.packages[9] = intelligence.packages[8];
    return intelligence;
  }), /did not match/u);
});
