import assert from "node:assert/strict";
import test from "node:test";
import { AccountAccessError } from "../api/_shared/account-error.js";
import { executeBrandIndexAssessment, parseBrandIndexRequest } from "../api/_shared/brand-index.js";
import { createMcpProductExecutor } from "../api/_shared/mcp-product.js";
import { createPublicMcpExecutor } from "../api/_shared/public-mcp-tools.js";
import { BRAND_INDEX_MAX_BODY_BYTES, createPublicBrandIndexHandler } from "../api/v1/public/brand-index.js";
import { assessBrandPresence, brandIndexResultSchema } from "../shared/brand-presence-index.js";
import type { ApiKeyPrincipal } from "../api/_shared/developer-api-keys.js";

const now = Date.parse("2026-09-13T12:00:00Z");
const input = { brand_name: "Example Brand", identity_label: "example", primary_domain: "example.com",
  domains: ["example.com"], socials: [{ platform: "github", handle: "example" }], markets: ["US"], observations: [] };
const complete = { ...input, observations: ["domain:example.com", "social:github:example", "market:US"].map(target_id => ({
  target_id, status: "reported_owned", reported_at: new Date(now).toISOString(), source_url: "https://example.com/about",
})) };
const headers = { "content-type": "application/json" };
const principal: ApiKeyPrincipal = { userId: "brand-owner", keyId: "brand-key", scopes: ["domains:search"], environment: "development" };
function response() {
  return { code: 200, body: undefined as unknown, headers: new Map<string, string | number>(),
    status(code: number) { this.code = code; return this; },
    setHeader(key: string, value: string | number) { this.headers.set(key.toLowerCase(), value); },
    json(body: unknown) { this.body = body; }, end(body?: string) { this.body = body; } };
}

test("brand calculator adapter preserves unknowns and never promotes complete reports to verification", () => {
  const empty = executeBrandIndexAssessment(input, now);
  assert.equal(empty.index.reported_score, null); assert.equal(empty.index.reported_coverage_percent, 0);
  assert.equal(empty.index.status, "needs_reports");
  const result = executeBrandIndexAssessment(complete, now);
  assert.deepEqual(result, assessBrandPresence(complete, now));
  assert.equal(result.index.reported_score, 100); assert.equal(result.index.reported_coverage_percent, 100);
  assert.equal(result.index.classification, "SELF_ASSESSMENT"); assert.equal(result.index.verified_score, null);
  assert.equal(result.index.verified_coverage_percent, 0); assert.equal(result.index.confidence, null);
  assert.equal(result.brand.classification, "USER_SUPPLIED"); assert.equal(result.scope.is_global_score, false);
  assert.ok(result.targets.every(target => target.classification === "USER_SUPPLIED"));
  assert.ok(result.limitations.includes("no_external_lookups_performed"));
});

test("strict brand inputs reject injected trust claims, foreign targets, duplicate scope and unsafe source URLs", () => {
  const invalid: unknown[] = [null, [], "brand", { ...input, brand_name: " " }, { ...input, identity_label: "has spaces" },
    { ...input, domains: [] }, { ...input, domains: ["elsewhere.com"] }, { ...input, domains: ["example.com", "EXAMPLE.COM"] },
    { ...input, primary_domain: "https://example.com" }, { ...input, primary_domain: "app.example.com" },
    { ...input, socials: [] }, { ...input, socials: [{ platform: "github", handle: "example" }, { platform: "github", handle: "other" }] },
    { ...input, markets: ["EU"] }, { ...input, markets: ["US", "US"] }, { ...input, markets: [] },
    { ...input, observations: Array(65).fill(complete.observations[0]) },
    { ...input, observations: [complete.observations[0], complete.observations[0]] }];
  for (const field of ["verified", "authoritative", "verified_score", "classification", "provenance", "source", "userId", "locale", "budget", "aiConsent"]) {
    invalid.push({ ...input, [field]: true }, { ...input, observations: [{ ...complete.observations[0], [field]: true }] });
  }
  for (const target_id of ["domain:other.com", "social:github:other", "market:SE", "market:us", "domain:EXAMPLE.COM"]) {
    invalid.push({ ...input, observations: [{ ...complete.observations[0], target_id }] });
  }
  for (const source_url of ["http://example.com", "https://example.com/?secret=token", "https://example.com/#secret",
    "https://user:pass@example.com", "https://127.0.0.1", "https://localhost", "https://example.com:8443"]) {
    invalid.push({ ...input, observations: [{ ...complete.observations[0], source_url }] });
  }
  invalid.push({ ...input, observations: [{ ...complete.observations[0], status: "verified_owned" }] });
  invalid.push({ ...input, observations: [{ ...complete.observations[0], reported_at: "not-a-date" }] });
  for (const value of invalid) assert.throws(() => parseBrandIndexRequest(value), AccountAccessError);
});

test("time and name recognition never substitute for current user reports", () => {
  for (const reported_at of [undefined, "2026-09-14T12:00:00Z", "2026-08-01T12:00:00Z"]) {
    const value = { ...complete, observations: complete.observations.map(report => ({ ...report, reported_at })) };
    const result = executeBrandIndexAssessment(value, now);
    assert.equal(result.index.reported_score, null); assert.equal(result.index.reported_coverage_percent, 0);
    assert.equal(result.index.verified_score, null);
  }
  const matched = executeBrandIndexAssessment({ ...complete, observations: complete.observations.map(report => ({ ...report, status: "matching_name_only" })) }, now);
  assert.equal(matched.index.reported_score, null); assert.equal(matched.index.reported_coverage_percent, 0);
  for (const name of ["ikea", "example"]) {
    const result = executeBrandIndexAssessment({ ...input, brand_name: name.toUpperCase(), identity_label: name,
      primary_domain: `${name}.com`, domains: [`${name}.com`], socials: [{ platform: "instagram", handle: name }] }, now);
    assert.equal(result.index.reported_score, null); assert.equal(result.index.verified_score, null);
    assert.ok(result.targets.every(target => target.reported_status === "unknown"));
  }
});

test("public and scoped MCP executors are pure and consume no domain, account-product or provider quota", async () => {
  const forbidden = async () => { assert.fail("Brand assessment must not invoke providers, account state or domain quota"); };
  const publicExecute = createPublicMcpExecutor({ authorization: "Bearer private", cookie: "private-cookie",
    "x-sajda-account": "someone-else" }, "req_brandassessment1", { search: forbidden, fx: forbidden, quote: forbidden, now: () => now });
  const privateExecute = createMcpProductExecutor({ domainSearch: forbidden, quota: forbidden, membership: forbidden,
    savedDomains: forbidden, trading: forbidden });
  const data = await publicExecute("brand_index_assess", complete);
  assert.deepEqual(data, executeBrandIndexAssessment(complete, now));
  assert.doesNotMatch(JSON.stringify(data), /Bearer private|private-cookie|someone-else/u);
  const scoped = await privateExecute("brand_index_assess", input, principal);
  assert.equal(scoped.status, 200); assert.equal(brandIndexResultSchema.parse(scoped.data).index.verified_score, null);
  await assert.rejects(privateExecute("brand_index_assess", input, { ...principal, scopes: [] }),
    error => error instanceof AccountAccessError && error.status === 403);
  await assert.rejects(privateExecute("brand_index_assess", { ...input, verified: true }, principal), AccountAccessError);
  await assert.rejects(publicExecute("brand_index_assess", { ...input, verified: true }), AccountAccessError);
});

test("public REST returns the exact shared assessment with safe headers and no private header projection", async () => {
  let calls = 0;
  const handler = createPublicBrandIndexHandler({ now: () => now, assess: (value, clock) => {
    calls++; assert.deepEqual(value, complete); assert.equal(clock, now); return executeBrandIndexAssessment(value, clock);
  } });
  const res = response();
  await handler({ method: "POST", headers: { ...headers, cookie: "private-cookie", "x-sajda-account": "foreign" }, body: complete }, res);
  assert.equal(res.code, 200); assert.equal(calls, 1);
  assert.deepEqual(res.body, executeBrandIndexAssessment(complete, now));
  for (const [key, value] of [["cache-control", "no-store"], ["x-content-type-options", "nosniff"],
    ["x-robots-tag", "noindex, nofollow"], ["access-control-allow-origin", "*"]]) assert.equal(res.headers.get(key), value);
  for (const key of ["set-cookie", "www-authenticate", "access-control-allow-credentials"]) assert.equal(res.headers.has(key), false);
  assert.equal(res.headers.get("x-ratelimit-limit"), "120");
});

test("public REST rejects credentials, query parameters and invalid bodies before calculation", async () => {
  let calls = 0;
  const handler = createPublicBrandIndexHandler({ assess: () => { calls++; return executeBrandIndexAssessment(input, now); } });
  const cases = [
    { method: "GET", headers, body: input, status: 405 },
    { method: "POST", headers: { ...headers, Authorization: "" }, body: input, status: 400 },
    { method: "POST", headers: { ...headers, authorization: "Bearer private", AUTHORIZATION: "" }, body: input, status: 400 },
    { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: input, status: 400 },
    { method: "POST", headers: { "content-type": "text/plain" }, body: input, status: 415 },
    { method: "POST", headers, body: input, query: { token: "private" }, status: 400 },
    { method: "POST", headers, body: input, url: "/api/v1/public/brand-index?verified=true", status: 400 },
    ...["", "{", "null", "[]", JSON.stringify({ ...input, verified: true })].map(body => ({ method: "POST", headers, body, status: 400 })),
  ];
  for (const sample of cases) {
    const res = response(); await handler(sample, res); assert.equal(res.code, sample.status);
    assert.doesNotMatch(JSON.stringify(res.body), /Bearer private|token|verified=true/u);
  }
  const lazy = { method: "POST", headers, get body(): unknown { throw new Error("private parse diagnostic"); } };
  const malformed = response(); await handler(lazy, malformed); assert.equal(malformed.code, 400);
  const preflight = response(); await handler({ method: "OPTIONS", headers: {} }, preflight);
  assert.equal(preflight.code, 204); assert.equal(preflight.headers.get("access-control-allow-origin"), "*");
  assert.equal(calls, 0);
});

test("REST enforces 64 KiB for text, buffer, object and streaming bodies including exact boundary", async () => {
  const handler = createPublicBrandIndexHandler({ now: () => now });
  const json = JSON.stringify(input);
  const boundary = json + " ".repeat(BRAND_INDEX_MAX_BODY_BYTES - Buffer.byteLength(json));
  const accepted = response(); await handler({ method: "POST", headers, body: boundary }, accepted);
  assert.equal(accepted.code, 200);
  for (const body of [boundary + " ", Buffer.from(boundary + " "), { ...input, brand_name: "é".repeat(33000) }]) {
    const rejected = response(); await handler({ method: "POST", headers, body }, rejected); assert.equal(rejected.code, 413);
  }
  let chunks = 0;
  const stream = { method: "POST", headers, async *[Symbol.asyncIterator]() {
    chunks++; yield Buffer.alloc(BRAND_INDEX_MAX_BODY_BYTES + 1, " ");
    chunks++; yield "not consumed";
  } };
  const rejected = response(); await handler(stream, rejected); assert.equal(rejected.code, 413); assert.equal(chunks, 1);
  const validStream = { method: "POST", headers, async *[Symbol.asyncIterator]() { yield json.slice(0, 20); yield json.slice(20); } };
  const streamed = response(); await handler(validStream, streamed); assert.equal(streamed.code, 200);
  const lazy = { method: "POST", headers, get body() { return input; } };
  const parsed = response(); await handler(lazy, parsed); assert.equal(parsed.code, 200);
});

test("REST request guard resets, does not perform excess calculation and exposes no raw failures", async () => {
  let clock = now, calls = 0;
  const handler = createPublicBrandIndexHandler({ now: () => clock, assess: () => { calls++; return executeBrandIndexAssessment(input, clock); } });
  for (let i = 0; i < 120; i++) {
    const res = response(); await handler({ method: "POST", headers, body: input }, res); assert.equal(res.code, 200);
  }
  const limited = response(); await handler({ method: "POST", headers, body: input }, limited);
  assert.equal(limited.code, 429); assert.equal(limited.headers.get("retry-after"), 60); assert.equal(calls, 120);
  clock += 60000;
  const reset = response(); await handler({ method: "POST", headers, body: input }, reset); assert.equal(reset.code, 200);
  const failed = createPublicBrandIndexHandler({ assess: () => { throw new Error("private token and report contents"); } });
  const res = response(); await failed({ method: "POST", headers, body: input }, res);
  assert.equal(res.code, 503); assert.doesNotMatch(JSON.stringify(res.body), /private token|report contents/u);
});
