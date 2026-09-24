import assert from "node:assert/strict";
import test from "node:test";
import { AccountAccessError } from "../api/_shared/account-error.js";
import { executeBrandLookupRequest, parseBrandLookupRequest } from "../api/_shared/brand-lookup-contract.js";
import { createMcpProductExecutor } from "../api/_shared/mcp-product.js";
import { createPublicMcpExecutor } from "../api/_shared/public-mcp-tools.js";
import { createPublicBrandLookupHandler } from "../api/v1/public/brand-lookup.js";
import { brandLookupResultSchema } from "../shared/brand-lookup.js";
import type { ApiKeyPrincipal } from "../api/_shared/developer-api-keys.js";
import { lookupFixture } from "./brand-lookup-fixtures.js";

const search = { operation: "search", query: "Example Brand" };
const profile = { operation: "profile", entity_id: "Q2" };
const headers = { "content-type": "application/json" };
const principal: ApiKeyPrincipal = { userId: "lookup-owner", keyId: "lookup-key", scopes: ["domains:search"], environment: "development" };
function response() {
  return { code: 200, body: undefined as unknown, headers: new Map<string, string | number>(),
    status(code: number) { this.code = code; return this; },
    setHeader(key: string, value: string | number) { this.headers.set(key.toLowerCase(), value); },
    json(body: unknown) { this.body = body; }, end(body?: string) { this.body = body; } };
}

test("lookup input is a strict Unicode search/profile union without credential or trust injection", () => {
  assert.deepEqual(parseBrandLookupRequest(search), { ...search, locale: "en" });
  assert.deepEqual(parseBrandLookupRequest(profile), { ...profile, locale: "en" });
  assert.equal(parseBrandLookupRequest({ ...search, query: "  名称 café  " }).operation, "search");
  const invalid = [null, [], "IKEA", {}, { ...search, query: " " }, { ...search, query: "a".repeat(101) },
    { ...search, query: "x\u0000" }, { ...search, locale: "de" }, { ...search, entity_id: "Q2" }, { ...profile, query: "IKEA" },
    ...["Q0", "Q01", "q2", "Q1234567890123", "https://www.wikidata.org/wiki/Q2"].map(entity_id => ({ ...profile, entity_id }))];
  for (const field of ["verified", "authoritative", "score", "observations", "api_key", "authorization", "url", "source_url", "providers", "userId", "aiConsent"]) {
    invalid.push({ ...search, [field]: true }, { ...profile, [field]: true });
  }
  for (const value of invalid) assert.throws(() => parseBrandLookupRequest(value), AccountAccessError);
});

test("lookup executors preserve selected-entity assertions without engine, quota or private-header forwarding", async () => {
  const calls: unknown[] = [];
  const lookup = async (value: unknown) => { calls.push(value); return lookupFixture(value); };
  const forbidden = async () => { assert.fail("Brand lookup cannot invoke domain, registrar, AI or account product work"); };
  const publicExecute = createPublicMcpExecutor({ authorization: "Bearer private", cookie: "private-cookie",
    "x-sajda-account": "foreign-account", "x-forwarded-for": "192.0.2.22" }, "req_brandlookup1", {
    lookup, search: forbidden, fx: forbidden, quote: forbidden,
  });
  const privateExecute = createMcpProductExecutor({ lookup, domainSearch: forbidden, quota: forbidden,
    membership: forbidden, trading: forbidden, savedDomains: forbidden });
  const candidates = brandLookupResultSchema.parse(await publicExecute("brand_lookup", search));
  assert.equal(candidates.operation, "search"); if (candidates.operation !== "search") assert.fail();
  assert.equal(candidates.candidates.length, 2); assert.equal(candidates.verified_index, null);
  assert.equal(calls.length, 1, "Search does not silently profile or choose the first entity");
  const selected = brandLookupResultSchema.parse((await privateExecute("brand_lookup", profile, principal)).data);
  assert.equal(selected.operation, "profile"); if (selected.operation !== "profile") assert.fail();
  assert.equal(selected.requested_entity_id, "Q2"); assert.equal(selected.index.score, null);
  assert.equal(selected.assertions[0].classification, "DATABASE_ASSERTION"); assert.equal(selected.assertions[0].relationship, "not_verified");
  assert.deepEqual(calls, [{ ...search, locale: "en" }, { ...profile, locale: "en" }]);
  assert.doesNotMatch(JSON.stringify(selected), /Bearer private|private-cookie|foreign-account|192\.0\.2/u);
  await assert.rejects(privateExecute("brand_lookup", profile, { ...principal, scopes: [] }),
    error => error instanceof AccountAccessError && error.status === 403);
  await assert.rejects(privateExecute("brand_lookup", { ...profile, verified: true }, principal), AccountAccessError);
  await assert.rejects(publicExecute("brand_lookup", { ...search, providers: [] }), AccountAccessError);
  assert.equal(calls.length, 2);
});

test("lookup output validation rejects injected evidence, wrong operations and foreign result scope", async () => {
  const good = await lookupFixture(search);
  const variants = [{ ...good, verified: true }, { ...good, locale: "sv" }, { ...good, query: "other" }, await lookupFixture(profile)];
  for (const value of variants) await assert.rejects(executeBrandLookupRequest(search, async () => value),
    error => error instanceof AccountAccessError && error.status === 503 && !/other|verified/u.test(error.message));
  await assert.rejects(executeBrandLookupRequest(profile, () => lookupFixture({ ...profile, entity_id: "Q3" })),
    error => error instanceof AccountAccessError && error.status === 503);
});

test("public REST returns the same versioned search/profile contracts with anonymous privacy headers", async () => {
  const handler = createPublicBrandLookupHandler({ execute: lookupFixture });
  for (const body of [search, profile]) {
    const res = response(); await handler({ method: "POST", headers: { ...headers, cookie: "private-cookie" }, body }, res);
    assert.equal(res.code, 200); assert.deepEqual(res.body, await lookupFixture(body));
    assert.equal(res.headers.get("cache-control"), "no-store"); assert.equal(res.headers.get("x-robots-tag"), "noindex, nofollow");
    assert.equal(res.headers.get("x-content-type-options"), "nosniff"); assert.equal(res.headers.get("access-control-allow-origin"), "*");
    assert.equal(res.headers.get("x-ratelimit-limit"), "12");
    for (const key of ["access-control-allow-credentials", "set-cookie", "www-authenticate"]) assert.equal(res.headers.has(key), false);
  }
});

test("public REST rejects undocumented transport/input variants before lookup and keeps preflight free", async () => {
  let calls = 0;
  const execute = async (value: unknown) => { calls++; return lookupFixture(value); };
  const cases = [{ method: "GET", headers, body: search, status: 405 },
    { method: "POST", headers: { ...headers, Authorization: "" }, body: search, status: 400 },
    { method: "POST", headers: { ...headers, authorization: "Bearer private", AUTHORIZATION: "" }, body: search, status: 400 },
    { method: "POST", headers, body: search, query: { query: "override" }, status: 400 },
    { method: "POST", headers, body: search, url: "/api/v1/public/brand-lookup?query=private", status: 400 },
    { method: "POST", headers: { "content-type": "text/plain" }, body: search, status: 415 },
    { method: "POST", headers, body: { ...search, verified: true }, status: 400 },
    { method: "POST", headers, body: "{" , status: 400 },
    { method: "POST", headers, body: { ...search, query: "x".repeat(6200) }, status: 413 }];
  for (const sample of cases) {
    const res = response(); await createPublicBrandLookupHandler({ execute })(sample, res);
    assert.equal(res.code, sample.status); assert.doesNotMatch(JSON.stringify(res.body), /Bearer private|query=private|override/u);
  }
  const preflight = response(); await createPublicBrandLookupHandler({ execute })({ method: "OPTIONS", headers: {} }, preflight);
  assert.equal(preflight.code, 204); assert.equal(preflight.headers.get("access-control-allow-origin"), "*"); assert.equal(calls, 0);
});

test("REST 12/minute request guard limits work and resets without claiming global quotas", async () => {
  let now = Date.now(), calls = 0;
  const handler = createPublicBrandLookupHandler({ now: () => now, execute: async value => { calls++; return lookupFixture(value); } });
  for (let i = 0; i < 12; i++) {
    const res = response(); await handler({ method: "POST", headers, body: search }, res); assert.equal(res.code, 200);
  }
  const limited = response(); await handler({ method: "POST", headers, body: search }, limited);
  assert.equal(limited.code, 429); assert.equal(limited.headers.get("retry-after"), 60); assert.equal(calls, 12);
  now += 60000;
  const reset = response(); await handler({ method: "POST", headers, body: search }, reset); assert.equal(reset.code, 200); assert.equal(calls, 13);
});

test("REST source failures and retry metadata are safe, distinct from empty matches and do not leak diagnostics", async () => {
  for (const [code, status] of [["profile_not_found", 404], ["rate_limited", 429], ["lookup_unavailable", 503]] as const) {
    const handler = createPublicBrandLookupHandler({ execute: async () => {
      throw Object.assign(new AccountAccessError(code, status, "private upstream body or token"), { retryAfterSeconds: 172800 });
    } });
    const res = response(); await handler({ method: "POST", headers, body: profile }, res);
    assert.equal(res.code, status); assert.doesNotMatch(JSON.stringify(res.body), /private upstream|token/u);
    if (status === 429) assert.equal(res.headers.get("retry-after"), 172800);
  }
  const failed = createPublicBrandLookupHandler({ execute: async () => { throw new Error("private raw lookup error"); } });
  const res = response(); await failed({ method: "POST", headers, body: search }, res); assert.equal(res.code, 503);
  assert.doesNotMatch(JSON.stringify(res.body), /private raw/u);
  const empty = createPublicBrandLookupHandler({ execute: async value => {
    const result = await lookupFixture(value); assert.equal(result.operation, "search");
    if (result.operation !== "search") assert.fail();
    return { ...result, status: "no_matches", candidates: [] };
  } });
  const noMatches = response(); await empty({ method: "POST", headers, body: search }, noMatches);
  assert.equal(noMatches.code, 200); assert.equal((noMatches.body as { status: string }).status, "no_matches");
});
