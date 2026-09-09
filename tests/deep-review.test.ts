import assert from "node:assert/strict";
import test from "node:test";
import handler from "../api/deep-review";
import { rankReviewCandidates } from "../api/_shared/deep-review-ranking";
import { nameQualitySignals } from "../api/_shared/search-quality.mjs";
import { rankDeepReviewCandidates, runDeepReview, type DeepReviewCandidate, type DeepReviewResult } from "../src/lib/deepReview";

function candidate(domain: string, rankingPosition?: number): DeepReviewCandidate {
  return { domain, status: "available", availabilityVerified: true, checkMethod: "rdap", confidenceScore: 45,
    namingScore: nameQualitySignals(domain.split(".")[0]).score, rankingPosition };
}

const coffee = [
  "kafferosteriio.com", "mykafferosteri.com", "kafferosterilabs.com", "kafferosterinova.com",
  "kaffeglimt.com", "kaffehus.com", "bonro.com", "rostglod.com", "bryggverk.com", "bonatelje.com",
].map((domain, index) => candidate(domain, index + 1));

test("short readable coffee ideas beat repetitive long keyword wrappers", () => {
  const { top10 } = rankDeepReviewCandidates(coffee, "kafferosteri");
  assert.equal(top10[0].domain, "kaffehus.com");
  assert.ok(top10.findIndex((entry) => entry.domain === "kaffeglimt.com")
    < top10.findIndex((entry) => entry.domain.includes("kafferosteri")));
  assert.equal(top10.slice(0, 5).filter((entry) => entry.domain.includes("kafferosteri")).length, 1);
  assert.deepEqual(top10.map((entry) => entry.rank), [1,2,3,4,5,6,7,8,9,10]);
});

test("family diversity favors distinct ideas over multiple extensions and generic wrappers", () => {
  const candidates = ["kaffe.se", "kaffe.com", "mykaffe.com", "kaffeio.com", "kaffehus.com", "kaffeglimt.com"]
    .map((domain, index) => candidate(domain, index + 1));
  const { top10 } = rankDeepReviewCandidates(candidates, "kaffe");
  assert.deepEqual(top10.slice(0, 3).map((entry) => entry.domain), ["kaffe.se", "kaffehus.com", "kaffeglimt.com"]);
  assert.equal(top10.length, candidates.length, "diversity reorders rather than discarding scarce results");
});

test("quality is recomputed and scores stay bounded; legacy confidence is not a valuation signal", () => {
  const normal = candidate("kaffehus.se", 1);
  const baseline = rankReviewCandidates([normal], "kaffe")[0];
  const manipulated = rankReviewCandidates([{ ...normal, namingScore: Number.POSITIVE_INFINITY }], "kaffe")[0];
  assert.equal(manipulated.score, baseline.score);
  for (const value of [Number.NaN, Number.POSITIVE_INFINITY, -10, 100_000]) {
    const entry = rankDeepReviewCandidates([{ ...normal, namingScore: value, confidenceScore: value, rankingPosition: value }], "kaffe").top10[0];
    assert.equal(entry.scoreBreakdown.searchSignal, 0);
    assert.ok(Number.isFinite(entry.score) && entry.score >= 0 && entry.score <= 100);
    assert.equal(entry.score, Object.values(entry.scoreBreakdown).reduce((a, b) => a + b, 0));
  }
});

test("original search ranking breaks quality ties and .com has no blanket advantage over .se", () => {
  const top10 = rankDeepReviewCandidates([candidate("novali.com", 2), candidate("novali.se", 1)], "").top10;
  assert.equal(top10[0].domain, "novali.se");
  assert.equal(top10[0].score, top10[1].score);
  assert.deepEqual(rankDeepReviewCandidates([candidate("skog.se")], "skög").top10,
    rankDeepReviewCandidates([candidate("skog.se")], "skog").top10);
});

test("unverified/taken candidates cannot enter the local shortlist; domains deduplicate", () => {
  const result = rankDeepReviewCandidates([candidate("kaffehus.se"), candidate(" KAFFEHUS.SE "),
    { ...candidate("annat.se"), status: "taken" }, { ...candidate("fel.se"), checkMethod: "dns" }], "kaffe");
  assert.equal(result.reviewedCount, 1);
  assert.equal(result.top10[0].domain, "kaffehus.se");
});

test("API and local fallback share exactly the same ranking; object bodies obey byte limits", async () => {
  let status = 0;
  let payload: unknown;
  const response = { setHeader() {}, status(code: number) { status = code; return this; }, json(value: unknown) { payload = value; } };
  const request = { method: "POST", headers: { "x-forwarded-for": "deep-review-test-parity" }, body: { candidates: coffee, theme: "kafferosteri" } };
  const previousModel = process.env.AI_GATEWAY_ENABLED;
  process.env.AI_GATEWAY_ENABLED = "false";
  try {
    await handler(request, response);
    assert.equal(status, 200);
    assert.deepEqual((payload as DeepReviewResult).top10, rankDeepReviewCandidates(coffee, "kafferosteri").top10);
    await handler({ ...request, body: { ...request.body, ignored: "x".repeat(17_000) } }, response);
    assert.equal(status, 400);
    assert.match((payload as { error: string }).error, /too large/i);
  } finally {
    if (previousModel === undefined) delete process.env.AI_GATEWAY_ENABLED;
    else process.env.AI_GATEWAY_ENABLED = previousModel;
  }
});

test("browser request preserves naming score/order and a provider failure falls back identically", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  globalThis.window = { setTimeout, clearTimeout } as unknown as Window & typeof globalThis;
  let body: { candidates: DeepReviewCandidate[] } | undefined;
  globalThis.fetch = async (_input, init) => {
    body = JSON.parse(String(init?.body));
    return new Response("{}", { status: 503 });
  };
  try {
    const result = await runDeepReview(coffee, "kafferosteri", "sv");
    assert.equal(body?.candidates[0].namingScore, coffee[0].namingScore);
    assert.equal(body?.candidates[0].rankingPosition, 1);
    assert.deepEqual(result.top10, rankDeepReviewCandidates(coffee, "kafferosteri").top10);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
  }
});
