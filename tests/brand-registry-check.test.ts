import assert from "node:assert/strict";
import test from "node:test";
import { checkBrandReportDomains } from "../api/_shared/brand-registry-check.js";
import { verifyBrandRegistryDomain } from "../api/domain-search.js";

test("archived registry adapter fetches only exact audited targets and preserves cached source dates", async () => {
  const original = globalThis.fetch, urls: string[] = [], suffix = `${Date.now()}`;
  const registered = `sajda-check-taken-${suffix}.com`, available = `sajda-check-free-${suffix}.net`;
  const unavailable = `sajda-check-unknown-${suffix}.org`;
  globalThis.fetch = (async (input, init) => {
    const url = String(input); urls.push(url);
    assert.equal(init?.redirect, "error"); assert.ok(init?.signal);
    if (url.endsWith(registered)) return new Response(JSON.stringify({ objectClassName: "domain", ldhName: registered }), { status: 200, headers: { "content-type": "application/rdap+json" } });
    if (url.endsWith(available)) return new Response(JSON.stringify({ errorCode: 404 }), { status: 404, headers: { "content-type": "application/rdap+json" } });
    return new Response("provider error", { status: 503 });
  }) as typeof fetch;
  try {
    const result = await checkBrandReportDomains([registered, available, unavailable, "example.co.uk", "example.se"]);
    assert.equal(result.length, 5); assert.equal(urls.length, 3);
    assert.equal(result[0].statement, "domain_registered"); assert.equal(result[1].statement, "domain_available");
    assert.equal(result[0].state, "checked"); assert.equal(result[2].state, "unknown");
    assert.equal(result[2].origin, "provider_observation"); assert.ok(result[2].observed_at);
    for (const row of result.slice(3)) { assert.equal(row.origin, "none"); assert.equal(row.observed_at, null); assert.equal(row.source_url, null); }
    const repeated = await checkBrandReportDomains([registered, available]);
    assert.equal(urls.length, 3); assert.equal(repeated[0].observed_at, result[0].observed_at);
    assert.ok(urls.every(url => /^https:\/\/(?:rdap\.verisign\.com|rdap\.publicinterestregistry\.org)\//u.test(url)));
    for (const invalid of [[], Array(21).fill(registered), [registered, registered], ["https://example.com"], ["127.0.0.1"], ["example.COM"], ["localhost"], ["sub.example.com"]]) {
      await assert.rejects(checkBrandReportDomains(invalid));
    }
    for (const domain of ["sub.example.com", "example.co.uk", "example.com?next=http://127.0.0.1", "example.se"]) {
      await assert.rejects(verifyBrandRegistryDomain(domain));
    }
    assert.equal(urls.length, 3, "invalid scopes never reach a source");
  } finally { globalThis.fetch = original; }
});

test("a mismatched RDAP domain never becomes a checked observation", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ objectClassName: "domain", ldhName: "other.com" }),
    { status: 200, headers: { "content-type": "application/rdap+json" } })) as typeof fetch;
  try {
    const [result] = await checkBrandReportDomains([`sajda-check-mismatch-${Date.now()}.com`]);
    assert.equal(result.state, "unknown"); assert.equal(result.statement, "domain_check_unavailable");
  } finally { globalThis.fetch = original; }
});
