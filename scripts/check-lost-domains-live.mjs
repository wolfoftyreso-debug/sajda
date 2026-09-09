/** Opt-in, bounded public protocol smoke. Not a commercial discovery run.
 * Uses IANA's illustrative example page and inspects at most one public link.
 * Does not grant access, seed an approved source, write evidence or purchase. */
import assert from "node:assert/strict";
import { discoverSource, inspectCandidate, rankAssessments } from "../api/_shared/lost-domains-engine.ts";

if (!process.argv.includes("--run")) {
  console.log("Skipped. Use node --import tsx scripts/check-lost-domains-live.mjs --run for a bounded live protocol smoke.");
} else {
  try {
    const discovery = await discoverSource({ url: "https://example.com/", allowedHost: "example.com", maxLinks: 1 });
    assert.ok(discovery.candidates.length <= 1);
    const candidate = discovery.candidates.find(row => row.domain === "iana.org");
    if (!candidate) throw new Error("The public example fixture changed or was unavailable.");
    const assessment = await inspectCandidate(candidate);
    assert.equal(assessment.confirmedRegistrable, false);
    assert.equal(assessment.registrability, "unverified");
    assert.equal(rankAssessments([assessment]).confirmed.length, 0);
    console.log(JSON.stringify({ mode: "bounded-live-protocol-smoke", source: "https://example.com/", inspected: assessment.domain,
      registryStatus: assessment.registryStatus, reviewStatus: assessment.reviewStatus,
      observations: assessment.evidence.map(({ kind, outcome, observedAt }) => ({ kind, outcome, observedAt })),
      confirmedRegistrable: false, databaseWrites: false }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ mode: "bounded-live-protocol-smoke", state: "failed",
      code: error && typeof error === "object" && "code" in error ? String(error.code) : "fixture_unavailable" }));
    process.exitCode = 1;
  }
}
