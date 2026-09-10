// Explicit, bounded integration probe. brief/review can each consume ONE paid
// Gateway request from the selected project's existing allowance/credits.
// Uses synthetic QA inputs only. Never registers a domain or changes accounts.
// --allow-ai-sharing explicitly permits these synthetic briefs/themes/names
// to be sent to Google Gemini through Vercel AI Gateway, not customer data.
import assert from "node:assert/strict";
import { runtimeFetch } from "./runtime-http.mjs";

const origin = process.env.SAJDA_TEST_ORIGIN;
const mode = process.argv[2];
const allowAi = process.argv.includes("--allow-ai-sharing");
if (mode !== "exact" && !allowAi) throw new Error("AI probes require --allow-ai-sharing: send the documented synthetic fixtures to Google Gemini through Vercel AI Gateway. This can consume paid allowance.");
if (!origin || !["brief", "review", "limit", "exact"].includes(mode)) throw new Error("Set SAJDA_TEST_ORIGIN and choose brief, review, limit or exact.");
const url = new URL(origin);
if (url.protocol !== "https:" || !url.hostname.startsWith("sajda-") || !url.hostname.endsWith("-hypbit.vercel.app")) throw new Error("Use a linked Sajda preview, never an arbitrary host.");
const review = mode === "review" || mode === "limit";
// These are declared test inputs for the editorial-only review, not assertions
// that the synthetic domains are actually available. No availability is output.
const candidates = ["kaffeglimt.com", "rostglad.com", "kaffekust.com"].map((domain, i) => ({
  domain, status: "available", availabilityVerified: true, checkMethod: "rdap", rankingPosition: i + 1, priceVerified: false,
}));
const body = review ? { theme: "Svenskt kafferosteri", locale: "sv", candidates }
  : { advanced: true, theme: "kaffe", brief: "Ett litet svenskt kafferosteri med varm och enkel tonalitet. Korta, lättstavade domännamn för kaffe och gemenskap.",
    count: 8, locale: "sv", tlds: ["com"], providers: ["cloudflare"], ...(mode === "exact" ? { domains: ["example.com"] } : {}) };
try {
  const start = Date.now();
  const response = await runtimeFetch(new URL(review ? "/api/deep-review" : "/api/domain-search", origin), {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, ...(allowAi ? { aiConsent: { version: "2026-09-10", accepted: true } } : {}) }),
  });
  assert.equal(response.status, 200, "Product endpoint must remain usable");
  const data = await response.json();
  const source = review ? data.analysisSource : data.briefAnalysis?.mode;
  assert.equal(source, mode === "limit" || mode === "exact" ? "local" : "ai", "Expected analysis source");
  if (review) {
    assert.equal(data.top10.length, 3);
    assert.deepEqual([...data.top10.map(entry => entry.domain)].sort(), candidates.map(entry => entry.domain).sort());
    for (const entry of data.top10) {
      assert.equal(entry.score, Object.values(entry.scoreBreakdown).reduce((a, b) => a + b, 0));
      assert.equal(entry.status, undefined, "Editorial layer must not assert availability");
      if (entry.editorialNote !== undefined) assert.ok(entry.editorialNote.length <= 180);
    }
    assert.equal(data.top10.some(entry => Boolean(entry.editorialNote)), mode === "review");
  } else {
    assert.ok(data.briefAnalysis.themes.length >= 1);
    assert.ok(data.briefAnalysis.summary.length >= 12);
  }
  console.log(JSON.stringify({ origin, mode, status: response.status, source, elapsedMs: Date.now() - start,
    ...(review ? { reviewed: data.top10.length, notes: data.top10.filter(entry => entry.editorialNote).length } : {}),
    note: "Deployed HTTP integration; synthetic test inputs, not a browser or domain purchase test." }));
} catch (error) {
  // Errors intentionally omit raw request/response and CLI authentication.
  console.error(JSON.stringify({ mode, passed: false, reason: error instanceof assert.AssertionError ? error.message : "Runtime probe failed" }));
  process.exitCode = 1;
}
