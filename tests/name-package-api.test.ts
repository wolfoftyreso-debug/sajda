import assert from "node:assert/strict";
import test from "node:test";
import { AccountAccessError } from "../api/_shared/account-error.js";
import type { ApiKeyPrincipal } from "../api/_shared/developer-api-keys.js";
import { parseNamePackageSearchRequest } from "../api/_shared/name-package-contract.js";
import { createMcpProductExecutor } from "../api/_shared/mcp-product.js";
import { createPublicMcpExecutor } from "../api/_shared/public-mcp-tools.js";
import { createNamePackagesApiHandler } from "../api/v1/name-packages.js";
import { createPublicNamePackagesApiHandler } from "../api/v1/public/name-packages.js";
import { namePackageIntelligenceSchema } from "../shared/name-package-intelligence.js";
import { DEFAULT_NAME_PACKAGE_MARKETS, NAME_PACKAGE_MARKET_CODES, normalizeNamePackageMarkets } from "../shared/name-package-markets.js";
import type domainSearch from "../api/domain-search.js";
import { generateNamePackageCandidates } from "../api/_shared/name-package-candidates.js";

const input = { query: "  creative studio  ", tlds: ["com", "dev"], platforms: ["github", "instagram"], count: 3 };
const principal: ApiKeyPrincipal = { userId: "package-owner", keyId: "package-key", scopes: ["domains:search"], environment: "development" };
const quota = async () => ({ allowed: true, remaining: 3, resetAt: Date.now() + 60000 });
const origin = () => "https://sajda.test";
const headers = { "content-type": "application/json" };
function response() {
  return { code: 200, body: undefined as unknown, headers: new Map<string, string | number>(),
    status(code: number) { this.code = code; return this; },
    setHeader(key: string, value: string | number) { this.headers.set(key.toLowerCase(), value); },
    json(body: unknown) { this.body = body; }, end(body?: string) { this.body = body; } };
}
function rawPayload() {
  return { checkedAt: new Date().toISOString(), privateTrace: "secret-engine-debug", results: [
    { domain: generateNamePackageCandidates(parseNamePackageSearchRequest(input)).domains[0], status: "available", authoritative: true, checkMethod: "rdap",
      source: "verisign-com-rdap", checkedAt: new Date(Date.now() - 30000).toISOString(), namingScore: 82,
      estimatedValue: 999999, registrarPrice: 100, registrarOffers: [{ currency: "USD", registrationPrice: 10, priceScope: "standard_tld" }] },
  ] };
}

test("package machine contract is shared, strict, bounded and defaults only documented fields", () => {
  assert.deepEqual(parseNamePackageSearchRequest(input), { ...input, query: "creative studio", locale: "en", nameLanguage: "en", markets: [...DEFAULT_NAME_PACKAGE_MARKETS] });
  assert.equal(parseNamePackageSearchRequest({ ...input, count: undefined }).count, 10);
  for (const change of [{ query: " " }, { query: "x".repeat(101) }, { tlds: [] }, { tlds: ["com", "com"] },
    { tlds: ["co.uk"] }, { platforms: [] }, { platforms: ["github", "github"] }, { platforms: ["arbitrary"] },
    { count: 11 }, { count: 0 }, { count: "3" }, { providers: ["loopia", "loopia"] }, { locale: "de" },
    { aiConsent: true }, { advanced: true }, { budget: 100 }, { jurisdiction: "SE" }, { observedAt: new Date().toISOString() },
    { socialObservations: [] }, { userId: "other" }, { endpoint: "https://evil.test" }]) {
    assert.throws(() => parseNamePackageSearchRequest({ ...input, ...change }), AccountAccessError);
  }
  for (const value of [null, [], "studio"]) assert.throws(() => parseNamePackageSearchRequest(value), AccountAccessError);
});

test("market selection is optional, bounded and exact, with no locale or TLD inference", () => {
  for (const markets of [[], ["US", "US"], ["us"], ["EU"], ["ZZ"], [" US"], "US", [123], null,
    Array(NAME_PACKAGE_MARKET_CODES.length + 1).fill("US")]) {
    assert.throws(() => parseNamePackageSearchRequest({ ...input, markets }), AccountAccessError);
  }
  assert.deepEqual(parseNamePackageSearchRequest({ ...input, markets: ["US", "SE", "DE"] }).markets, ["US", "SE", "DE"]);
  assert.deepEqual(parseNamePackageSearchRequest({ ...input, markets: [...NAME_PACKAGE_MARKET_CODES] }).markets, [...NAME_PACKAGE_MARKET_CODES]);
  for (const locale of ["en", "sv", "es", "fr", "zh"]) {
    assert.deepEqual(parseNamePackageSearchRequest({ ...input, tlds: ["se"], locale }).markets, [...DEFAULT_NAME_PACKAGE_MARKETS]);
  }
});

test("private executor checks scope and strict input before shared domain quota or engine work", async () => {
  let quotas = 0, searches = 0;
  const execute = createMcpProductExecutor({ quota: async (_principal, bucket) => { quotas++; assert.equal(bucket, "domains"); return quota(); },
    domainSearch: async (request, res) => {
      searches++; assert.deepEqual(request.headers, {});
      assert.deepEqual(request.body, { theme: "creative studio", tlds: ["com", "dev"], count: 3, locale: "en", providers: ["loopia"] });
      const reserve = Object.getOwnPropertySymbols(request).map(symbol => Reflect.get(request, symbol)).find(Array.isArray);
      assert.deepEqual(reserve, generateNamePackageCandidates(parseNamePackageSearchRequest(input)).domains);
      res.status(200).json(rawPayload());
    } });
  await assert.rejects(execute("name_packages_search", { ...input, aiConsent: true }, principal), AccountAccessError);
  await assert.rejects(execute("name_packages_search", input, { ...principal, scopes: [] }), AccountAccessError);
  assert.equal(quotas, 0); assert.equal(searches, 0);
  const result = await execute("name_packages_search", input, principal);
  assert.equal(result.status, 200); assert.equal(quotas, 1); assert.equal(searches, 1);
  const parsed = namePackageIntelligenceSchema.parse(result.data);
  assert.equal(parsed.requested_count, 3); assert.equal(parsed.returned_count, 3);
  assert.ok(parsed.packages.every(pkg => pkg.evidence.domains.length === 2));
  assert.equal(parsed.packages.flatMap(pkg => pkg.evidence.domains).filter(domain => domain.authoritative).length, 1);
  assert.ok(parsed.packages.every(pkg => pkg.brand_index.mode === "candidate"));
  assert.doesNotMatch(JSON.stringify(parsed), /secret-engine-debug|estimatedValue|999999|registrarPrice/u);
  const denied = createMcpProductExecutor({ quota: async () => ({ allowed: false, remaining: 0, resetAt: Date.now() + 60000 }),
    domainSearch: async () => { assert.fail("Denied searches must not reach the engine"); } });
  const limited = await denied("name_packages_search", input, principal);
  assert.equal(limited.status, 429); assert.ok(limited.retryAfterSeconds! > 0);
});

test("public executor keeps only network headers, sanitizes output and never fetches FX or quotes", async () => {
  let calls = 0;
  const execute = createPublicMcpExecutor({ ...headers, "x-forwarded-for": "192.0.2.42", cookie: "secret-cookie",
    authorization: "Bearer secret", "x-sajda-account": "other" }, "req_namepackagepublic1", {
    search: async (request, res) => {
      calls++; assert.deepEqual(request.headers, { ...headers, "x-forwarded-for": "192.0.2.42" });
      const body = request.body as Record<string, unknown>;
      assert.equal(body.aiConsent, undefined); assert.equal(body.platforms, undefined); assert.equal(body.advanced, undefined); assert.equal(body.markets, undefined);
      res.status(200).json(rawPayload());
    }, fx: async () => { assert.fail("Package exploration does not fetch FX"); },
    quote: async () => { assert.fail("Package exploration does not fetch exact quotes"); },
  });
  await assert.rejects(execute("name_packages_search", { ...input, budget: 100 }), AccountAccessError);
  assert.equal(calls, 0);
  const data = namePackageIntelligenceSchema.parse(await execute("name_packages_search", input));
  assert.equal(calls, 1); assert.equal(data.returned_count, 3);
  assert.doesNotMatch(JSON.stringify(data), /secret|estimatedValue|999999|registrarPrice/u);
});

test("REST and MCP executors expose identical market coverage without additional lookups or legal points", async () => {
  let searches = 0, quotas = 0;
  const search: typeof domainSearch = async (request, res) => {
    searches++;
    assert.equal((request.body as Record<string, unknown>).markets, undefined);
    res.status(200).json(rawPayload());
  };
  const privateExecute = createMcpProductExecutor({ domainSearch: search,
    quota: async () => { quotas++; return quota(); } });
  const publicExecute = createPublicMcpExecutor(headers, "req_packagemarketparity1", {
    search, fx: async () => { assert.fail("Markets do not trigger FX"); },
    quote: async () => { assert.fail("Markets do not trigger registrar quotes"); },
  });
  const selected = { ...input, markets: ["US", "SE", "DE"], locale: "zh", tlds: ["se"] };
  const privateResult = namePackageIntelligenceSchema.parse((await privateExecute("name_packages_search", selected, principal)).data);
  const publicResult = namePackageIntelligenceSchema.parse(await publicExecute("name_packages_search", selected));
  assert.deepEqual(privateResult.market_coverage, publicResult.market_coverage);
  assert.deepEqual(publicResult.market_coverage.requested_markets, normalizeNamePackageMarkets(["US", "SE", "DE"]));
  assert.deepEqual(publicResult.market_coverage.checked_markets, []);
  assert.equal(publicResult.market_coverage.automated_checks_available, false);
  for (const item of publicResult.packages) {
    assert.equal(item.country, null);
    assert.equal(item.evidence.company.status, "not_checked"); assert.equal(item.evidence.trademark.status, "not_checked");
    assert.equal(item.index.score_parts.company.score, 0); assert.equal(item.index.score_parts.trademark.score, 0);
  }
  const publicRest = createPublicNamePackagesApiHandler({ execute: publicExecute });
  const privateRest = createNamePackagesApiHandler({ authorize: async () => principal, requestOrigin: origin, quota, execute: privateExecute });
  for (const handler of [publicRest, privateRest]) {
    const res = response(); await handler({ method: "POST", headers, body: selected }, res);
    assert.equal(res.code, 200);
    assert.deepEqual(namePackageIntelligenceSchema.parse(res.body).market_coverage, publicResult.market_coverage);
  }
  assert.equal(searches, 4); assert.equal(quotas, 2);
  for (const invalid of [{ ...selected, markets: ["EU"] }, { ...selected, markets: ["US", "US"] }]) {
    await assert.rejects(privateExecute("name_packages_search", invalid, principal), AccountAccessError);
    await assert.rejects(publicExecute("name_packages_search", invalid), AccountAccessError);
  }
  assert.equal(searches, 4); assert.equal(quotas, 2);
});

test("public REST rejects credentials, malformed, oversized and undocumented requests before dispatch", async () => {
  let calls = 0;
  const handler = createPublicNamePackagesApiHandler({ execute: async () => { calls++; return {}; } });
  const preflight = response(); await handler({ method: "OPTIONS", headers: {} }, preflight);
  assert.equal(preflight.code, 204); assert.equal(preflight.headers.get("access-control-allow-origin"), "*");
  assert.equal(preflight.headers.has("access-control-allow-credentials"), false);
  assert.equal(preflight.headers.get("cache-control"), "no-store");
  assert.equal(preflight.headers.get("x-content-type-options"), "nosniff");
  assert.equal(preflight.headers.get("x-robots-tag"), "noindex, nofollow");
  const cases = [
    { method: "GET", headers, body: input, status: 405 },
    { method: "POST", headers: { ...headers, authorization: "Bearer secret" }, body: input, status: 400 },
    { method: "POST", headers: { ...headers, Authorization: "" }, body: input, status: 400 },
    { method: "POST", headers: { "content-type": "text/plain" }, body: input, status: 415 },
    { method: "POST", headers, body: "{", status: 400 },
    { method: "POST", headers, body: [], status: 400 },
    { method: "POST", headers, body: { ...input, count: 100 }, status: 400 },
    { method: "POST", headers, body: { ...input, private: "x".repeat(6200) }, status: 413 },
    { method: "POST", headers, body: input, query: { advanced: "true" }, status: 400 },
    { method: "POST", headers, body: input, url: "/api/v1/public/name-packages?query=override", status: 400 },
  ];
  for (const sample of cases) {
    const res = response(); await handler(sample, res); assert.equal(res.code, sample.status);
  }
  assert.equal(calls, 0);
});

test("authenticated REST enforces credential scopes and request quota without granting browser access", async () => {
  let requests = 0, searches = 0;
  const execute = createMcpProductExecutor({ quota, domainSearch: async (_request, res) => { searches++; res.status(200).json(rawPayload()); } });
  const handler = createNamePackagesApiHandler({ authorize: async () => principal, requestOrigin: origin, execute,
    quota: async (_principal, bucket) => { requests++; assert.equal(bucket, "requests"); return quota(); } });
  const bad = response(); await handler({ method: "POST", headers, body: { ...input, aiConsent: true } }, bad);
  assert.equal(bad.code, 400); assert.equal(requests, 0); assert.equal(searches, 0);
  const res = response(); await handler({ method: "POST", headers, body: input }, res);
  assert.equal(res.code, 200); assert.equal(requests, 1); assert.equal(searches, 1);
  assert.equal(res.headers.has("access-control-allow-origin"), false);
  assert.equal(namePackageIntelligenceSchema.parse(res.body).returned_count, 3);
  for (const badHeaders of [{ ...headers, Origin: "https://evil.test" },
    { ...headers, origin: "https://sajda.test", Origin: "https://evil.test" }]) {
    const result = response(); await handler({ method: "POST", headers: badHeaders, body: input }, result);
    assert.ok([400, 403].includes(result.code));
  }
  assert.equal(searches, 1);
  for (const [authorized, expected] of [
    [async () => { throw new AccountAccessError("invalid_api_key", 401, "Invalid API key."); }, 401],
    [async () => ({ ...principal, scopes: [] }), 403],
  ] as const) {
    const denied = createNamePackagesApiHandler({ authorize: authorized, requestOrigin: origin,
      quota: async () => { assert.fail("No quota after denied authorization"); } });
    const result = response(); await denied({ method: "POST", headers, body: input }, result); assert.equal(result.code, expected);
  }
  const blocked = createNamePackagesApiHandler({ authorize: async () => principal, requestOrigin: origin,
    quota: async () => ({ allowed: false, remaining: 0, resetAt: Date.now() + 60000 }),
    execute: async () => { assert.fail("No work after request quota denial"); } });
  const limited = response(); await blocked({ method: "POST", headers, body: input }, limited);
  assert.equal(limited.code, 429); assert.ok(Number(limited.headers.get("retry-after")) > 0);
});

test("provider failures stay safe errors and public REST preserves retry metadata", async () => {
  const execute = createPublicMcpExecutor(headers, "req_namepackageretry1", { search: async (_request, res) => {
    res.setHeader("Retry-After", 42); res.status(429).json({ error: "private upstream diagnostic" });
  } });
  const handler = createPublicNamePackagesApiHandler({ execute });
  const res = response(); await handler({ method: "POST", headers, body: input }, res);
  assert.equal(res.code, 429); assert.equal(res.headers.get("retry-after"), 42);
  assert.doesNotMatch(JSON.stringify(res.body), /private upstream/u);
  const privateExecute = createMcpProductExecutor({ quota, domainSearch: async (_request, output) => {
    output.status(502).json({ error: "private upstream diagnostic", secret: "never-export" });
  } });
  const failed = await privateExecute("name_packages_search", input, principal);
  assert.equal(failed.status, 503); assert.doesNotMatch(JSON.stringify(failed), /private upstream|never-export/u);
});
