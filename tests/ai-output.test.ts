import test from "node:test";
import assert from "node:assert/strict";
import { parseAiBriefAnalysis } from "../api/domain-search.js";
import { parseEditorialNotes } from "../api/deep-review.js";

const brief = { themes: ["kaffe", "gemenskap", "värme"], creativeDirections: ["Korta ord med varm ton", "Tydliga svenska ord"], summary: "Ett varmt och enkelt namnspår för ett svenskt kafferosteri." };

test("brief schema tolerates only a bounded array surplus and returns the product's strict limits", () => {
  assert.equal(parseAiBriefAnalysis(brief)?.mode, "ai");
  const result = parseAiBriefAnalysis({ ...brief, themes: Array.from({ length: 12 }, (_, i) => `tema${i}`), creativeDirections: Array(4).fill("Korta, tydliga ord") });
  assert.equal(result?.themes.length, 8);
  assert.equal(result?.creativeDirections.length, 3);
  for (const invalid of [{ ...brief, themes: Array(17).fill("kaffe") }, { ...brief, creativeDirections: Array(9).fill("Korta, tydliga ord") },
    { ...brief, extra: "unsupported" }, { ...brief, themes: [1] }, { ...brief, creativeDirections: [] }, { ...brief, summary: "x".repeat(321) }]) {
    assert.equal(parseAiBriefAnalysis(invalid), undefined);
  }
});

test("brief text bounds apply after normalization, not to hidden/control character padding", () => {
  assert.equal(parseAiBriefAnalysis({ ...brief, creativeDirections: ["a\n\n\n\n\n\n\nb"] }), undefined);
  assert.equal(parseAiBriefAnalysis({ ...brief, themes: ["a\u0001\u0002"] }), undefined);
  const result = parseAiBriefAnalysis({ ...brief, creativeDirections: ["Korta\n\nvarma ord"] });
  assert.deepEqual(result?.creativeDirections, ["Korta varma ord"]);
});

test("editorial notes require actual known, unique, bounded content before reporting AI success", () => {
  const domains = new Set(["kaffeglimt.com"]);
  const note = { domain: "kaffeglimt.com", note: "Kort sammansättning med tydlig kaffekoppling." };
  assert.equal(parseEditorialNotes({ notes: [note] }, domains)?.size, 1);
  for (const invalid of [{ notes: [] }, { notes: [note, note] }, { notes: [{ ...note, domain: "other.com" }] },
    { notes: [{ ...note, note: "x".repeat(181) }] }, { notes: [{ ...note, note: "a\n\n\n\n\n\nb" }] },
    { notes: [note], scores: [100] }, { notes: [{ ...note, score: 100 }] }]) {
    assert.equal(parseEditorialNotes(invalid, domains), undefined);
  }
});
