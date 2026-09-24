import assert from "node:assert/strict";
import test from "node:test";
import { recordNamePackageMetrics } from "../api/_shared/name-package-metrics.js";
import { projectNamePackageIntelligence } from "../shared/name-package-intelligence.js";

const at = "2026-09-13T12:00:00.000Z", now = Date.parse(at);
const requestId = "req_completion123456";
function result() {
  const row = (domain: string, extra: Record<string, unknown> = {}) => ({ domain, status: "available", authoritative: true,
    checkMethod: "rdap", checkedAt: at, source: "https://registry.example/source-secret-canary", ...extra });
  return projectNamePackageIntelligence({ query: "private-query-canary", accountId: "account-secret-canary", results: [
    row("privatecanary.com"), row("privatecanary.net", { status: "taken" }),
    row("privatecanary.dev", { checkedAt: "2026-09-13T11:00:00.000Z" }),
    row("privatecanary.ai", { status: "unknown", authoritative: false, checkMethod: "none" }),
    row("secondcanary.com"),
  ] }, { requiredTlds: ["com", "se"], platforms: ["github"], limit: 4, now });
}

test("package completion metrics contain only bounded aggregate evidence and version metadata", () => {
  const events: Record<string, unknown>[] = [], assessment = result(), before = JSON.stringify(assessment);
  recordNamePackageMetrics(assessment, { requestId, surface: "public" }, event => events.push(event));
  assert.deepEqual(events, [{ event: "name_package_intelligence_completed", request_id: requestId, surface: "public",
    schema_version: "sajda.name-package-intelligence.v1", methodology_version: "name-package-1.0.0",
    requested_count: 4, returned_count: 2, domain_evidence_count: 7, fresh_domain_count: 3,
    unknown_domain_count: 4, missing_legal_checks_count: 4 }]);
  assert.doesNotMatch(JSON.stringify(events), /canary|registry\.example|https:|private-query|account-secret|evidence_id|canonical_name|\.com/u);
  assert.equal(JSON.stringify(assessment), before, "Logging cannot mutate the completed assessment");
});

test("empty package responses log zero evidence and legal-check counts", () => {
  const empty = projectNamePackageIntelligence({ results: [] }, { requiredTlds: ["com"], platforms: ["github"], limit: 2, now });
  let event: Record<string, unknown> | undefined;
  recordNamePackageMetrics(empty, { requestId, surface: "account" }, value => { event = value; });
  assert.equal(event?.surface, "account"); assert.equal(event?.requested_count, 2); assert.equal(event?.returned_count, 0);
  for (const key of ["domain_evidence_count", "fresh_domain_count", "unknown_domain_count", "missing_legal_checks_count"])
    assert.equal(event?.[key], 0, key);
});

test("invalid request identifiers are omitted without reflecting their input", () => {
  const assessment = result();
  for (const invalid of ["", "req_short", "private-query-canary", "req_secret\ncanary", `req_${"x".repeat(65)}`, "Bearer account-secret-canary"]) {
    const events: Record<string, unknown>[] = [];
    recordNamePackageMetrics(assessment, { requestId: invalid, surface: "public" }, event => events.push(event));
    assert.equal(events.length, 1); assert.equal(Object.hasOwn(events[0], "request_id"), false);
    assert.doesNotMatch(JSON.stringify(events), /canary|Bearer|secret/u);
  }
});

test("synchronous logger failure cannot fail a completed search", () => {
  const assessment = result(), before = JSON.stringify(assessment);
  let attempts = 0;
  assert.doesNotThrow(() => recordNamePackageMetrics(assessment, { requestId, surface: "account" }, () => {
    attempts++; throw new Error("private-logger-diagnostic-canary");
  }));
  assert.equal(attempts, 1); assert.equal(JSON.stringify(assessment), before);
});

test("default completion logging emits one JSON event with no raw output", () => {
  const original = console.info, output: unknown[] = [];
  console.info = value => { output.push(value); };
  try { recordNamePackageMetrics(result(), { requestId, surface: "public" }); }
  finally { console.info = original; }
  assert.equal(output.length, 1); assert.equal(typeof output[0], "string");
  assert.equal(JSON.parse(output[0] as string).event, "name_package_intelligence_completed");
  assert.doesNotMatch(output[0] as string, /canary|source-secret|private-query|account-secret/u);
});
