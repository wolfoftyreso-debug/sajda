import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import NamePackageResultSummary from "../src/components/NamePackageResultSummary";
import { summarizePackageResults } from "../src/lib/namePackageResultSummary";
import { namePackageResultCopy, packageResultText } from "../src/i18n/namePackageResultCopy";
import { buildNamePackages, type PackageDomainInput } from "../shared/name-packages";

const at = "2026-09-17T12:00:00.000Z";
const now = Date.parse(at);
const row = (name: string, status: PackageDomainInput["status"] = "available", checkedAt: string | null = at): PackageDomainInput => ({
  domain: `${name}.com`, status, checkedAt, availabilityVerified: status !== "unknown", checkMethod: "rdap", source: "Offline test fixture",
});
function packages(rows: PackageDomainInput[]) {
  return buildNamePackages(rows, { platforms: ["github"], observedAt: at, now });
}

test("a six-package result explains its count without claiming six legally available businesses", () => {
  const results = packages([row("first"), row("second"), row("third"), row("fourth"), row("fifth", "taken"), row("sixth", "unknown")]);
  assert.deepEqual(summarizePackageResults(results), { count: 6, available: 4, registered: 1, unconfirmed: 1 });
  const html = renderToStaticMarkup(React.createElement(NamePackageResultSummary, { packages: results, generatedSearch: true, language: "en", onEditSearch() {} }));
  assert.match(html, /6 of 10 candidate name packages/u);
  assert.match(html, /only 6 distinct names/u);
  assert.match(html, /limited search, not proof/u);
  assert.match(html, /currently verified available domain: 4 of 6/u);
  assert.match(html, /Only registered domains among the selected extensions: 1/u);
  assert.match(html, /No confirmed available domain: 1/u);
  assert.match(html, /Company names, trademarks and social-handle registration remain unverified/u);
  assert.match(html, /<button[^>]+type="button"/u);
});

test("ten packages with six available domains does not pretend only six packages were returned", () => {
  const results = packages(Array.from({ length: 10 }, (_, index) => row(`name${index}`, index < 6 ? "available" : "taken")));
  const html = renderToStaticMarkup(React.createElement(NamePackageResultSummary, { packages: results, generatedSearch: true, language: "en", onEditSearch() {} }));
  assert.match(html, /10 of 10 candidate name packages/u);
  assert.match(html, /currently verified available domain: 6 of 10/u);
  assert.match(html, /Only registered domains among the selected extensions: 4/u);
  assert.doesNotMatch(html, /only 6 distinct|limited search|No confirmed available/u);
});

test("expired evidence and incomplete selected extensions cannot be counted as verified availability or all taken", () => {
  const results = packages([row("stale", "available", "2026-09-16T12:00:00.000Z"), row("missing", "available", null), row("mixed", "taken"), { ...row("mixed", "unknown"), domain: "mixed.ai" }]);
  assert.deepEqual(summarizePackageResults(results), { count: 3, available: 0, registered: 0, unconfirmed: 3 });
  const missingExtension = buildNamePackages([row("partial", "taken")], { platforms: [], requiredTlds: ["com", "ai"], observedAt: at, now });
  assert.equal(missingExtension[0].domains.find(domain => domain.domain === "partial.ai")?.requestedAlternative, true);
  assert.deepEqual(summarizePackageResults(missingExtension), { count: 1, available: 0, registered: 0, unconfirmed: 1 }, "A selected but missing extension must not become an all-registered package");
  assert.deepEqual(summarizePackageResults(packages([row("absent", "taken")]), ["com", "ai"]), { count: 1, available: 0, registered: 0, unconfirmed: 1 }, "Even a malformed partial package must retain the selected extension gap");
  assert.deepEqual(summarizePackageResults(packages([row("outside"), { ...row("outside", "taken"), domain: "outside.ai" }]), ["ai"]), { count: 1, available: 0, registered: 1, unconfirmed: 0 }, "An unrequested alternative must not imply that a selected extension is available");
  assert.deepEqual(summarizePackageResults([]), { count: 0, available: 0, registered: 0, unconfirmed: 0 });
});

test("an exact lookup does not invent a request for ten names and all UI languages explain partial results", () => {
  const results = packages([row("nomera")]);
  const exact = renderToStaticMarkup(React.createElement(NamePackageResultSummary, { packages: results, generatedSearch: false, language: "en", onEditSearch() {} }));
  assert.match(exact, /Candidate name packages: 1/u);
  assert.doesNotMatch(exact, /of 10 candidate|reach 10|<button/u);
  for (const language of ["en", "sv", "es", "fr", "zh"] as const) {
    const c = namePackageResultCopy[language];
    const html = renderToStaticMarkup(React.createElement(NamePackageResultSummary, { packages: results, generatedSearch: true, language, onEditSearch() {} }));
    assert.ok(html.includes(packageResultText(c.targetCount, { count: 1, target: 10 })));
    assert.ok(html.includes(c.adjust));
    assert.doesNotMatch(html, /undefined|\{count\}|\{target\}|\{available\}/u);
    if (language !== "en") assert.doesNotMatch(html, /candidate name packages|limited search|remain unverified/u);
    assert.notEqual(c.failedEmpty, c.failedRetained);
  }
});
