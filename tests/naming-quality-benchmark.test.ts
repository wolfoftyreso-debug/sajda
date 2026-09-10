import assert from "node:assert/strict";
import test from "node:test";
import { generateCandidates } from "../api/domain-search.ts";
import { buildBlindReview, csvCell, loadFixtures, measureStructure, reviewCsv, runOfflineBenchmark, validateFixtures } from "../scripts/evaluate-naming-quality.mjs";

const dataset = await loadFixtures();
const fixture = dataset.briefs[0];

test("the naming benchmark contains twenty explicit EN/SV briefs across useful categories", () => {
  assert.equal(validateFixtures(dataset), dataset);
  assert.equal(dataset.briefs.filter((brief) => brief.locale === "en").length, 10);
  assert.equal(dataset.briefs.filter((brief) => brief.locale === "sv").length, 10);
  assert.ok(new Set(dataset.briefs.map((brief) => brief.category)).size >= 5);
  assert.ok(dataset.briefs.every((brief) => brief.brief !== brief.theme && brief.humanChecks.length >= 2));
  assert.throws(() => validateFixtures({ ...dataset, briefs: [...dataset.briefs.slice(0, 19), dataset.briefs[0]] }), /duplicate/);
});

test("twenty offline baseline runs pass only structural constraints without network requests", () => {
  const previousFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests += 1; throw new Error("Network forbidden in offline fixture test"); };
  try {
    const report = runOfflineBenchmark(dataset, generateCandidates);
    assert.equal(requests, 0);
    assert.equal(report.summary.briefCount, 20);
    assert.equal(report.summary.structuralPassCount, 20, JSON.stringify(report.results.filter((result) => !result.structuralPass)));
    assert.equal(report.summary.humanReviewsCompleted, 0);
    assert.equal(report.semanticQuality, "NOT_EVALUATED");
    assert.equal(report.availability, "NOT_CHECKED");
    assert.equal(report.price, "NOT_CHECKED");
    for (const result of report.results) {
      assert.equal(result.deterministic, true);
      assert.ok(result.returnedCount > 0 && result.returnedCount <= 30);
      assert.equal(result.duplicateDomainCount, 0);
      assert.equal(result.invalidDomainCount, 0);
      assert.equal(result.outsideLengthCount, 0);
      assert.equal(result.excludedWordCount, 0);
      assert.ok(result.surfaceVariation.highestPrefixShare >= 0 && result.surfaceVariation.highestPrefixShare <= 1);
      assert.ok(result.surfaceVariation.highestSuffixShare >= 0 && result.surfaceVariation.highestSuffixShare <= 1);
      assert.ok(result.candidates.every((candidate) => !Object.hasOwn(candidate, "namingScore") && !Object.hasOwn(candidate, "estimatedValue")));
    }
  } finally { globalThis.fetch = previousFetch; }
});

test("structural measurement detects defects and does not count TLD alternatives as new name ideas", () => {
  const measured = measureStructure([
    { domain: "calm.com" }, { domain: "calm.app" }, { domain: "calm.com" },
    { domain: "bank.com" }, { domain: "zz.com" }, { domain: "bad-name.com" }, { domain: "other.xyz" },
  ], fixture);
  assert.equal(measured.structuralPass, false);
  assert.equal(measured.duplicateDomainCount, 1);
  assert.equal(measured.alternateTldReuseCount, 2);
  assert.equal(measured.uniqueLabelCount, 5);
  assert.equal(measured.excludedWordCount, 1);
  assert.equal(measured.unselectedTldCount, 1);
  assert.equal(measured.outsideLengthCount, 1);
  assert.equal(measured.invalidDomainCount, 2);
  assert.equal(measureStructure([], fixture).structuralPass, false);
});

test("empty and non-repeatable generation cannot report a structural pass", () => {
  assert.equal(runOfflineBenchmark(dataset, () => []).summary.structuralPassCount, 0);
  let counter = 0;
  const report = runOfflineBenchmark(dataset, () => [{ domain: `name${++counter}.com` }]);
  assert.equal(report.summary.structuralPassCount, 0);
  assert.ok(report.results.every((result) => result.violations.includes("not_deterministic")));
});

const systems = [
  { systemId: "hidden-system-alpha", results: dataset.briefs.map((brief) => ({ briefId: brief.id, candidates: [{ domain: "cedar.com" }, { domain: "lumina.app" }, { domain: "cedar.app" }] })) },
  { systemId: "hidden-system-beta", results: dataset.briefs.map((brief) => ({ briefId: brief.id, candidates: [{ domain: "cedar.com" }, { domain: "meadow.com" }] })) },
];

test("blind review masks source and rank, pools shared names and starts every human rating blank", () => {
  const blind = buildBlindReview(dataset, systems);
  assert.equal(blind.rows.length, 60);
  assert.equal(new Set(blind.rows.map((row) => row.candidateId)).size, 60);
  assert.deepEqual(blind, buildBlindReview(dataset, systems));
  assert.notDeepEqual(blind.rows, buildBlindReview(dataset, systems, "another-seed").rows);
  for (const row of blind.rows) {
    assert.equal(row.reviewerId, "");
    assert.equal(row.relevance1to5, "");
    assert.equal(row.pronunciation1to5, "");
    assert.equal(row.spelling1to5, "");
    assert.equal(row.distinctiveness1to5, "");
    assert.equal(row.acceptForShortlistYesNoUnsure, "");
    assert.equal(row.reason, "");
    assert.equal(row.availability, "NOT_CHECKED");
  }
  assert.ok(!JSON.stringify(blind.rows).includes("hidden-system"));
  assert.ok(!JSON.stringify(blind.rows).includes("originalRank"));
  assert.equal(blind.privateKey.candidates.find((candidate) => candidate.candidateLabel === "cedar").origins.length, 2);
  assert.ok(!reviewCsv(blind.rows).includes("hidden-system"));
});

test("blind inputs reject incomplete coverage, duplicate systems and unsafe candidate strings", () => {
  assert.throws(() => buildBlindReview(dataset, [{ ...systems[0], results: [] }]), /exactly one/);
  assert.throws(() => buildBlindReview(dataset, [systems[0], systems[0]]), /unique/);
  assert.throws(() => buildBlindReview(dataset, [{ ...systems[0], results: dataset.briefs.map((brief) => ({ briefId: brief.id, candidates: [{ domain: "=HYPERLINK(1)" }] })) }]), /lowercase ASCII/);
});

test("CSV output is quoted, escapes embedded quotes and neutralizes formula-leading cells", () => {
  assert.equal(csvCell('A "quoted" name'), '"A ""quoted"" name"');
  assert.equal(csvCell("=1+1"), '"\'=1+1"');
  assert.equal(csvCell(" @command"), '"\' @command"');
  assert.equal(csvCell("normal text"), '"normal text"');
});
