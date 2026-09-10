// Explicit, bounded integration probe. Run with node --import tsx.
// brief/review consume at most ONE Gateway generation request; refinement
// makes TWO product requests, with no automatic retries or budget changes.
// Refinement follows immediately, exercising the two-step naming workflow.
// exact never shares with AI, even when --allow-ai-sharing is present.
// Uses synthetic QA inputs only. Never registers domains or changes accounts.
// --allow-ai-sharing permits these fixtures to be sent to Google Gemini
// through Vercel AI Gateway using the selected project's existing allowance.
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AI_CONSENT_VERSION } from "../shared/ai-consent.ts";
import { runtimeFetch } from "./runtime-http.mjs";

const modes = ["brief", "refinement", "review", "limit", "exact"];
const fixtureBrief = "Ett litet svenskt kafferosteri med varm och enkel tonalitet. Korta, lättstavade domännamn för kaffe och gemenskap.";
// Editorial fixtures only: these do not assert actual domain availability.
const reviewCandidates = ["kaffeglimt.com", "rostglad.com", "kaffekust.com"].map((domain, i) => ({
  domain, status: "available", availabilityVerified: true, checkMethod: "rdap", rankingPosition: i + 1, priceVerified: false,
}));

/** Node assertion messages can append actual/expected values after line one. */
export function runtimeProbeFailureReason(error) {
  return error instanceof assert.AssertionError ? error.message.split(/\r?\n/u)[0] : "Runtime probe failed";
}

function verifyCreativeGeneration(data, refined = false) {
  assert.equal(data.generation?.source, "ai", "Candidate generation must use AI, not a local fallback");
  assert.equal(data.generation.refinementApplied, refined, "Generation must report whether feedback was applied");
  assert.ok(Array.isArray(data.results) && data.results.length >= 4 && data.results.length <= 8,
    "An eight-result search must return between four and eight candidates");
  for (const entry of data.results) {
    assert.ok(typeof entry.domain === "string" && /^[a-z][a-z0-9]{2,21}\.com$/.test(entry.domain),
      "Generated candidates must follow the supported naming contract");
    assert.equal(entry.estimatedValue, 0, "Generation must not invent an economic valuation");
    assert.ok(["available", "taken", "unknown"].includes(entry.status), "Candidate registry status must be explicit");
    if (entry.status === "available") assert.equal(entry.authoritative, true,
      "An available candidate must have authoritative registry evidence");
  }
  assert.equal(new Set(data.results.map(entry => entry.domain)).size, data.results.length,
    "Generated candidates must not repeat within a batch");
}

/** Injectable HTTP boundary permits offline regression checks without live calls. */
export async function runGatewayRuntimeProbe({ origin, mode, allowAi = false }, fetcher = runtimeFetch,
  { onProgress = progress => console.log(JSON.stringify(progress)) } = {}) {
  assert.ok(origin && modes.includes(mode), "Set SAJDA_TEST_ORIGIN and choose brief, refinement, review, limit or exact");
  assert.ok(mode === "exact" || allowAi,
    "AI probes require --allow-ai-sharing for synthetic fixtures and may consume the existing paid allowance");
  const url = new URL(origin);
  assert.ok(url.protocol === "https:" && url.hostname.startsWith("sajda-") && url.hostname.endsWith("-hypbit.vercel.app")
    && !url.username && !url.password && !url.port && url.pathname === "/" && !url.search && !url.hash,
  "Use a linked Sajda preview origin without credentials, path, query or fragment");
  const started = Date.now();
  const review = mode === "review" || mode === "limit";
  const consent = { version: AI_CONSENT_VERSION, accepted: true };
  const creativeBody = { advanced: true, theme: "", brief: fixtureBrief, count: 8,
    locale: "sv", tlds: ["com"], providers: ["cloudflare"] };
  const body = review ? { theme: "Svenskt kafferosteri", locale: "sv", candidates: reviewCandidates }
    : mode === "exact" ? { domains: ["example.com"], count: 8, locale: "en", tlds: ["com"], providers: ["cloudflare"] }
    : creativeBody;
  let requestCount = 0;
  const post = async (requestBody) => {
    requestCount++;
    assert.ok(requestCount <= (mode === "refinement" ? 2 : 1), "Runtime probe exceeded its fixed request allowance");
    const response = await fetcher(new URL(review ? "/api/deep-review" : "/api/domain-search", url.origin), {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...requestBody, ...(mode !== "exact" && allowAi ? { aiConsent: consent } : {}) }),
    });
    assert.equal(response.status, 200, "Product endpoint must remain usable");
    const data = await response.json();
    assert.ok(data && typeof data === "object" && !Array.isArray(data), "Product endpoint must return a result object");
    return data;
  };
  const data = await post(body);
  let details;
  if (review) {
    assert.equal(data.analysisSource, mode === "limit" ? "local" : "ai", "Expected editorial analysis source");
    assert.ok(Array.isArray(data.top10) && data.top10.length === 3, "Editorial review must retain all three fixtures");
    assert.deepEqual([...data.top10.map(entry => entry.domain)].sort(), reviewCandidates.map(entry => entry.domain).sort(),
      "Editorial review must not replace the submitted domains");
    for (const entry of data.top10) {
      assert.ok(entry.scoreBreakdown && typeof entry.scoreBreakdown === "object", "Review needs a score breakdown");
      assert.equal(entry.score, Object.values(entry.scoreBreakdown).reduce((a, b) => a + b, 0),
        "Review score must equal its displayed breakdown");
      assert.equal(entry.status, undefined, "Editorial review must not assert domain availability");
      if (entry.editorialNote !== undefined) assert.ok(typeof entry.editorialNote === "string" && entry.editorialNote.length <= 180,
        "Editorial notes must stay within the documented length");
    }
    assert.equal(data.top10.some(entry => Boolean(entry.editorialNote)), mode === "review",
      "Editorial notes must match the expected AI or budget-limited source");
    details = { source: data.analysisSource, reviewed: data.top10.length, notes: data.top10.filter(entry => entry.editorialNote).length };
  } else if (mode === "exact") {
    assert.ok(Array.isArray(data.results) && data.results.length === 1, "Exact check must return only the requested domain");
    assert.equal(data.results[0].domain, "example.com", "Exact check must preserve the requested domain");
    assert.equal(data.results[0].status, "taken", "The reserved example domain must not appear available");
    assert.equal(data.results[0].authoritative, true, "Exact status must have authoritative registry evidence");
    assert.equal(data.results[0].estimatedValue, 0, "Exact checks must not invent an economic valuation");
    assert.equal(data.generation, undefined, "Exact checks must not invoke candidate generation");
    details = { source: "registry", checked: 1 };
  } else {
    verifyCreativeGeneration(data);
    details = { source: "ai", generated: data.results.length };
    if (mode === "refinement") {
      const previousNames = data.results.map(entry => entry.domain);
      onProgress({ mode: "refinement", stage: "first_search_verified", requests: 1 });
      const refined = await post({ ...creativeBody,
        refinement: { reasons: ["too_generic", "too_long"], previousNames, likedNames: previousNames.slice(0, 2) },
      });
      verifyCreativeGeneration(refined, true);
      assert.ok(refined.results.every(entry => !previousNames.includes(entry.domain)),
        "Refinement must not repeat a domain from the preceding result set");
      details = { ...details, refined: refined.results.length, refinementApplied: true, repeated: 0 };
    }
  }
  return { origin: url.origin, mode, passed: true, status: 200, ...details,
    requests: requestCount, elapsedMs: Date.now() - started,
    note: "Deployed HTTP integration; synthetic fixtures, not a browser or domain purchase test." };
}

// Importing this module for offline tests never runs a probe.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2];
  try {
    console.log(JSON.stringify(await runGatewayRuntimeProbe({ origin: process.env.SAJDA_TEST_ORIGIN,
      mode, allowAi: process.argv.includes("--allow-ai-sharing") })));
  } catch (error) {
    // Every assertion starts with a fixed message. Never print response data, domain
    // candidates, raw transport errors, command arguments or authentication.
    console.error(JSON.stringify({ mode: modes.includes(mode) ? mode : "invalid", passed: false,
      reason: runtimeProbeFailureReason(error) }));
    process.exitCode = 1;
  }
}
