import assert from "node:assert/strict";
import test from "node:test";
import { completeConnectorSearch } from "../api/_shared/connector-search.js";
import { generateConnectorCandidates } from "../api/_shared/connector-candidates.js";
import { parseConnectorShortlistRequest } from "../api/_shared/connector-shortlist.js";
import { fetchConnectorRegistrarOffers, type ConnectorRegistrarOffer } from "../api/_shared/connector-registrar.js";
import domainSearch, { createPublicConnectorEngineRequest, createPublicApiEngineRequest } from "../api/domain-search.js";

const now = Date.parse("2026-09-11T12:00:00.000Z"), iso = new Date(now).toISOString();
const request = parseConnectorShortlistRequest({ query: "calm planning app for independent founders", tlds: ["com", "app", "dev"],
  budget: { amount: 30, currency: "USD", period: "first_year" } });
const candidates = generateConnectorCandidates({ query: request.query, tlds: request.tlds, count: 120 });
const provisionalOffer = { providerId: "porkbun", registrar: "Porkbun", purchaseUrl: "https://porkbun.com/products/domains",
  priceSourceUrl: "https://api.porkbun.com/api/json/v3/pricing/get", priceStatus: "verified", priceVerified: true,
  dataSource: "official_provider_api", priceScope: "standard_tld", checkedAt: iso, currency: "USD",
  registrationPrice: 10, renewalPrice: 14, taxTreatment: "unknown", priceType: "standard" };
const engine = () => ({ checked: candidates.length, results: candidates.map(candidate => ({ ...candidate,
  status: "available", authoritative: true, checkMethod: "rdap", source: "registry", checkedAt: iso, registrarOffers: [provisionalOffer] })) });
function quote(domain: string, amount = 10): ConnectorRegistrarOffer {
  return { providerId: "cloudflare", registrar: "Cloudflare", purchaseUrl: "https://www.cloudflare.com/domains/",
    priceSourceUrl: "https://developers.cloudflare.com/api/resources/registrar/methods/check/", dataSource: "official_provider_api",
    priceStatus: "verified", priceVerified: true, priceScope: "exact_domain_offer", domain, availability: "available", checkedAt: iso,
    expiresAt: new Date(now + 300000).toISOString(), currency: "USD", registrationPrice: amount, renewalPrice: amount,
    taxTreatment: "unknown", priceType: "standard" };
}
type Quoter = typeof fetchConnectorRegistrarOffers;

test("refill rejects over-budget first batch and continues until ten exact offers, never using estimates as completion", async () => {
  const seen: string[] = []; let calls = 0;
  const result = await completeConnectorSearch(engine(), request, candidates, { now: () => now, quote: async domains => {
    calls++; seen.push(...domains);
    return { status: "ok", checkedDomains: domains.length,
      offers: Object.fromEntries(domains.map((domain, index) => [domain, quote(domain, calls === 1 && index > 2 ? 100 : 10)])) };
  } });
  assert.equal(result.status, "complete"); assert.equal(result.confirmedCount, 10); assert.equal(result.shortfall, 0);
  assert.equal(calls, 2); assert.equal(new Set(seen).size, seen.length); assert.equal(result.search.quoteChecks, 40);
  assert.equal(result.search.stopReason, "target_reached");
  assert.ok(result.items.every(item => item.evidenceType === "confirmed_exact_offer" && item.offer.comparison.amount <= 30));
});

test("missing registrar access gives useful provisional ideas but zero confirmed matches and an explicit blocker", async () => {
  let calls = 0;
  const result = await completeConnectorSearch(engine(), request, candidates, { now: () => now,
    quote: async () => { calls++; return { status: "not_configured", checkedDomains: 0, offers: {} }; } });
  assert.equal(calls, 1); assert.equal(result.returnedCount, 0); assert.equal(result.shortfall, 10);
  assert.equal(result.provisionalCount, 10); assert.equal(result.search.quoteChecks, 0);
  assert.equal(result.search.stopReason, "exact_pricing_not_configured"); assert.ok(result.operatorAction);
});

test("provider errors, 429 and hard time budget stop work without retry or invented offers", async () => {
  for (const status of ["unavailable", "rate_limited", "throws"] as const) {
    let calls = 0;
    const result = await completeConnectorSearch(engine(), request, candidates, { now: () => now, quote: async domains => {
      calls++; if (status === "throws") throw new Error("private provider error");
      return { status, offers: {}, checkedDomains: domains.length };
    } });
    assert.equal(calls, 1); assert.equal(result.confirmedCount, 0);
    assert.equal(result.search.stopReason, status === "rate_limited" ? "provider_rate_limited" : "provider_unavailable");
    assert.doesNotMatch(JSON.stringify(result), /private provider error/u);
  }
  const result = await completeConnectorSearch(engine(), request, candidates, { now: () => now, startedAt: now - 45000,
    quote: async () => { assert.fail("No request after run deadline"); } });
  assert.equal(result.search.stopReason, "work_limit");
  const denied = await completeConnectorSearch(engine(), request, candidates, { now: () => now,
    quote: async domains => ({ status: "unavailable", failureReason: "authorization", offers: {}, checkedDomains: domains.length }) });
  assert.equal(denied.search.stopReason, "registrar_authorization_required");
  assert.equal(denied.confirmedCount, 0); assert.match(denied.operatorAction ?? "", /no permissions were expanded/u);
});

test("exhaustion is bounded; taken, unknown, stale and duplicate names do not receive exact-price requests", async () => {
  let calls = 0;
  const input = engine();
  input.results[0].status = "taken"; input.results[1].status = "unknown";
  input.results[2].checkedAt = new Date(now - 300001).toISOString(); input.results.push({ ...input.results[3] });
  const result = await completeConnectorSearch(input, request, candidates, { now: () => now, quote: async domains => {
    calls++; assert.ok(domains.length <= 20);
    assert.ok(domains.every(domain => !input.results.slice(0, 4).some(row => row.domain === domain)));
    return { status: "ok", offers: {}, checkedDomains: domains.length };
  } });
  assert.ok(calls <= 6); assert.equal(result.confirmedCount, 0); assert.equal(result.search.stopReason, "candidate_pool_exhausted");
});

test("forged quote domain, unsupported source and stale exact offer never enter confirmed results", async () => {
  for (const corrupt of [ (value: ConnectorRegistrarOffer) => ({ ...value, domain: "unrequested.com" }),
    (value: ConnectorRegistrarOffer) => ({ ...value, priceSourceUrl: "https://attacker.invalid/" }),
    (value: ConnectorRegistrarOffer) => ({ ...value, expiresAt: iso }) ]) {
    const result = await completeConnectorSearch(engine(), request, candidates, { now: () => now,
      quote: (async domains => ({ status: "ok", checkedDomains: domains.length,
        offers: Object.fromEntries(domains.map(domain => [domain, corrupt(quote(domain))])) })) as Quoter });
    assert.equal(result.confirmedCount, 0); assert.equal(result.provisionalCount, 10);
  }
});

test("candidate reserve cannot be forged through HTTP and does not create trusted principal or skip shared anonymous quota", async () => {
  const headers = { "content-type": "application/json", "x-forwarded-for": "192.0.2.205" };
  const invoke = async (req: Parameters<typeof domainSearch>[0]) => {
    let status = 0; const response = { setHeader() {}, status(value: number) { status = value; return response; }, json() {}, end() {} };
    await domainSearch(req, response); return status;
  };
  const domains = candidates.slice(0, 13).map(candidate => candidate.domain);
  const body = { theme: "planning", tlds: ["com"], providers: ["not-a-provider"], domains };
  // Invalid provider stops all network work, after consuming quota. A large
  // raw domains list fails earlier; only the internal Symbol accepts the pool.
  assert.equal(await invoke(createPublicApiEngineRequest({ headers }, { ...body, connectorCandidates: domains }, "req_connectorboundary1")), 400);
  for (let i = 0; i < 6; i++) assert.equal(await invoke(createPublicConnectorEngineRequest({ headers }, body, "req_connectorboundary1", domains)), 400);
  assert.equal(await invoke(createPublicConnectorEngineRequest({ headers }, body, "req_connectorboundary1", domains)), 429);
  for (const invalid of [[], [...domains, domains[0]], ["evil.com\n"], ["http://169.254.169.254"], Array.from({ length: 121 }, (_, i) => `plan${i}.com`)]) {
    assert.throws(() => createPublicConnectorEngineRequest({ headers }, body, "req_connectorboundary1", invalid));
  }
});
