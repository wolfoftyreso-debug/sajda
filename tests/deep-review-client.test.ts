import assert from "node:assert/strict";
import test from "node:test";
import { rankDeepReviewCandidates, runDeepReview, type DeepReviewCandidate } from "../src/lib/deepReview";

const candidates: DeepReviewCandidate[] = ["kaffehus.com", "bryggverk.com"].map(domain => ({
  domain, status: "available", availabilityVerified: true, checkMethod: "rdap", confidenceScore: 70,
}));

test("review client accepts only local or provider-neutral AI results with validated evidence shape", async () => {
  const previousFetch = globalThis.fetch;
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const local = rankDeepReviewCandidates(candidates, "kaffe");
  let payload: unknown = local;
  Object.defineProperty(globalThis, "window", { configurable: true, value: { setTimeout, clearTimeout } });
  globalThis.fetch = async () => Response.json(payload);
  try {
    assert.equal((await runDeepReview(candidates, "kaffe", "sv")).analysisSource, "local");
    payload = { ...local, analysisSource: "ai", top10: local.top10.map(entry => ({ ...entry, editorialNote: "A concise and readable direction." })) };
    const assisted = await runDeepReview(candidates, "kaffe", "sv");
    assert.equal(assisted.analysisSource, "ai");
    assert.equal(assisted.top10[0].editorialNote, "A concise and readable direction.");

    const badEntry = (changes: Record<string, unknown>) => ({ ...local, analysisSource: "ai", top10: [{ ...local.top10[0], ...changes }, local.top10[1]] });
    for (const invalid of [
      { ...local, analysisSource: "openai" }, { ...local, analysisSource: "unknown-provider" },
      { ...local, analysisSource: null }, { ...local, reviewedAt: "not-a-date" },
      { ...local, reviewedCount: 500 }, { ...local, top10: [] },
      badEntry({ domain: "unrequested.com" }), badEntry({ rank: 0 }), badEntry({ score: 101 }),
      badEntry({ score: local.top10[0].score - 1 }), badEntry({ editorialNote: "x".repeat(181) }),
      badEntry({ scoreBreakdown: { ...local.top10[0].scoreBreakdown, readability: 61 } }),
      { ...local, analysisSource: "ai", top10: [local.top10[0], { ...local.top10[0], rank: 2 }] },
    ]) {
      payload = invalid;
      const fallback = await runDeepReview(candidates, "kaffe", "sv");
      assert.equal(fallback.analysisSource, "local");
      assert.deepEqual(fallback.top10, local.top10);
    }
  } finally {
    globalThis.fetch = previousFetch;
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else delete (globalThis as { window?: unknown }).window;
  }
});
