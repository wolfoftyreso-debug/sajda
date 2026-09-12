import assert from "node:assert/strict";
import test from "node:test";
import { fetchConnectorRegistrarOffers } from "../api/_shared/connector-registrar.js";
import { parseConnectorShortlistRequest, presentConnectorShortlist } from "../api/_shared/connector-shortlist.js";

// These are mocked contract/security tests, NOT an authenticated Cloudflare
// network test. No live account, token, registration or payment is used.
const now = Date.parse("2026-09-11T12:00:00.000Z");
const domain = "nordkit.com";
const accountId = "0123456789abcdef0123456789abcdef";
const token = "mock_only_never_a_live_credential";
const env = { SAJDA_CONNECTOR_CLOUDFLARE_ACCOUNT_ID: accountId, SAJDA_CONNECTOR_CLOUDFLARE_TOKEN: token };
function row(name = domain, overrides: Record<string, unknown> = {}) {
  return { name, registrable: true, tier: "standard",
    pricing: { currency: "USD", registration_cost: "8.57", renewal_cost: "10.11" }, ...overrides };
}
function body(rows: unknown[] = [row()], overrides: Record<string, unknown> = {}) {
  return { success: true, errors: [], messages: [], result: { domains: rows }, ...overrides };
}
function json(payload: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(payload), { headers: { "Content-Type": "application/json" }, ...init });
}
async function run(payload: unknown = body(), domains: string[] = [domain]) {
  return fetchConnectorRegistrarOffers(domains, { env, now: () => now, fetch: async () => json(payload) });
}
function noOffers(result: Awaited<ReturnType<typeof run>>, status = "unavailable", checkedDomains = 1) {
  assert.deepEqual(result, { status, offers: {}, checkedDomains });
}

test("registrar adapter makes one fixed read-only check and projects exact annual prices", async () => {
  let calls = 0;
  const result = await fetchConnectorRegistrarOffers([domain], { env, now: () => now, fetch: async (url, init) => {
    calls++;
    assert.equal(url, `https://api.cloudflare.com/client/v4/accounts/${accountId}/registrar/domain-check`);
    assert.equal(init?.method, "POST");
    assert.equal(init?.redirect, "error");
    assert.equal(init?.credentials, "omit");
    assert.equal(init?.cache, "no-store");
    assert.ok(init?.signal instanceof AbortSignal);
    assert.deepEqual(init?.headers, { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" });
    assert.deepEqual(JSON.parse(String(init?.body)), { domains: [domain] });
    return json(body());
  } });
  assert.equal(calls, 1);
  assert.deepEqual(result, { status: "ok", checkedDomains: 1, offers: { [domain]: {
    providerId: "cloudflare", registrar: "Cloudflare", purchaseUrl: "https://www.cloudflare.com/domains/",
    priceSourceUrl: "https://developers.cloudflare.com/api/resources/registrar/methods/check/",
    priceStatus: "verified", priceVerified: true, dataSource: "official_provider_api", priceScope: "exact_domain_offer",
    domain, availability: "available", checkedAt: new Date(now).toISOString(), expiresAt: new Date(now + 300000).toISOString(),
    currency: "USD", registrationPrice: 8.57, renewalPrice: 10.11, taxTreatment: "unknown", priceType: "standard",
  } } });
  assert.ok(!JSON.stringify(result).includes(accountId));
  assert.ok(!JSON.stringify(result).includes(token));
});

test("missing or malformed scoped credentials cannot fall back to generic Cloudflare credentials", async () => {
  let calls = 0;
  const invalid = [{}, { CLOUDFLARE_ACCOUNT_ID: accountId, CLOUDFLARE_API_TOKEN: token },
    { ...env, SAJDA_CONNECTOR_CLOUDFLARE_TOKEN: undefined }, { ...env, SAJDA_CONNECTOR_CLOUDFLARE_ACCOUNT_ID: undefined },
    ...["", "../other-account", "a".repeat(33), `${accountId}/registrations`, ` ${accountId}`].map(value => ({ ...env, SAJDA_CONNECTOR_CLOUDFLARE_ACCOUNT_ID: value })),
    ...["", "token\r\nInjected: true", "token with space", "Bearer token", "a".repeat(4097)].map(value => ({ ...env, SAJDA_CONNECTOR_CLOUDFLARE_TOKEN: value }))];
  for (const configuration of invalid) {
    noOffers(await fetchConnectorRegistrarOffers([domain], { env: configuration, fetch: async () => { calls++; return json(body()); } }), "not_configured", 0);
  }
  assert.equal(calls, 0);
});

test("input domains are exact lowercase bounded DNS names, never endpoints or an unbounded batch", async () => {
  let calls = 0;
  const invalid = [null, {}, "nordkit.com", [], Array.from({ length: 21 }, (_, i) => `name${i}.com`), [domain, domain],
    ...[null, 42, "", "nordkit", "NordKit.com", "a..com", "a.com.", ".com", "a.c", "a.123", "a_b.com", "-a.com", "a-.com",
      "xn--caf-dma.com", "café.com", "a.xn--p1ai", "a com", " a.com", "a.com\n", "https://a.com", "a.com/path", "user@a.com",
      "a.com?x=1", "127.0.0.1", `${"a".repeat(64)}.com`, `${"a".repeat(63)}.${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(63)}.com`].map(value => [value])];
  for (const value of invalid) {
    noOffers(await fetchConnectorRegistrarOffers(value as string[], { env, fetch: async () => { calls++; return json(body()); } }), "unavailable", 0);
  }
  assert.equal(calls, 0);
});

test("a batch of twenty is checked once and output is bound to names, not response order", async () => {
  const domains = Array.from({ length: 20 }, (_, i) => `name${i}.com`);
  const result = await run(body([...domains].reverse().map(name => row(name))), domains);
  assert.equal(result.status, "ok");
  assert.equal(result.checkedDomains, 20);
  assert.equal(Object.keys(result.offers).length, 20);
  for (const name of domains) assert.equal(result.offers[name].domain, name);
});

test("unavailable, restricted, omitted and premium domains never become exact offers", async () => {
  const domains = [domain, "taken.com", "premium.com", "restricted.uk", "missing.com"];
  const result = await run(body([row(), row("taken.com", { registrable: false, reason: "domain_unavailable" }),
    row("premium.com", { tier: "premium" }), row("restricted.uk", { registrable: false, reason: "extension_not_supported_via_api" })]), domains);
  assert.equal(result.status, "ok");
  assert.equal(result.checkedDomains, 5);
  assert.deepEqual(Object.keys(result.offers), [domain]);
  noOffers(await run(body([])), "ok");
  noOffers(await run(body([row(domain, { registrable: false, tier: "premium", reason: "domain_premium" })])), "ok");
});

test("malformed, duplicate, unrequested or contradictory evidence invalidates the whole batch", async () => {
  const cases = [null, [], {}, { success: true }, body([], { success: "true" }), body([], { success: false }),
    body([], { errors: [{}] }), body([], { errors: null }), body([], { messages: null }), body([], { result: { domains: {} } }),
    body([null]), body([[]]), body([{}]), body([row("different.com")]), body([row("NORDKIT.COM")]),
    body([row(), row()]), body([row(domain, { registrable: "true" })]), body([row(domain, { registrable: undefined })]),
    body([row(domain, { tier: undefined })]), body([row(domain, { tier: "unknown" })]),
    body([row(domain, { reason: "domain_unavailable" })]), body([row(domain, { pricing: undefined })])];
  for (const payload of cases) noOffers(await run(payload));
  noOffers(await run(body([row(), row("different.com")]), [domain, "second.com"]), "unavailable", 2);
  noOffers(await run(body([row(), row()]), [domain, "second.com"]), "unavailable", 2);
});

test("prices require bounded unsigned decimal strings, no coercion or sub-cent precision", async () => {
  const invalid = [null, undefined, 8.57, 0, [], {}, "", " ", " 8.57", "8.57 ", "-1", "+1", "01", "00.00", ".50", "1.",
    "1e1", "NaN", "Infinity", "1,50", "1_000", "0x10", "1.001", "0.000", "100000000.01", "999999999", "１.５０"];
  for (const price of invalid) {
    for (const field of ["registration_cost", "renewal_cost"]) {
      noOffers(await run(body([row(domain, { pricing: { currency: "USD", registration_cost: "8.57", renewal_cost: "10.11", [field]: price } })])));
    }
  }
  for (const price of ["0", "0.00", "0.01", "1", "1.5", "99999999.99", "100000000"]) {
    const result = await run(body([row(domain, { pricing: { currency: "USD", registration_cost: price, renewal_cost: price } })]));
    assert.equal(result.offers[domain].registrationPrice, Number(price));
    assert.equal(result.offers[domain].renewalPrice, Number(price));
  }
});

test("only reviewed uppercase currencies are accepted without guessing or conversion", async () => {
  for (const currency of [null, undefined, "usd", "USD ", "US", "$", "USDX", "ZZZ", "CAD", 123]) {
    noOffers(await run(body([row(domain, { pricing: { currency, registration_cost: "8.57", renewal_cost: "10.11" } })])));
  }
  for (const currency of ["USD", "EUR", "GBP", "SEK"]) {
    const result = await run(body([row(domain, { pricing: { currency, registration_cost: "8.57", renewal_cost: "10.11" } })]));
    assert.equal(result.offers[domain].currency, currency);
    assert.equal(result.offers[domain].registrationPrice, 8.57);
  }
});

test("provider bodies and surplus account, payment and URL fields are never projected", async () => {
  const sensitive = { accountId, token, payment: "sensitive_payment", purchaseUrl: "https://evil.example/", sourceUrl: "https://evil.example/" };
  const result = await run(body([row(domain, sensitive)], { privateAccount: sensitive, messages: [sensitive] }));
  assert.equal(result.status, "ok");
  for (const value of [accountId, token, "sensitive_payment", "evil.example", "privateAccount"]) assert.ok(!JSON.stringify(result).includes(value));
});

test("HTTP failure and rate limits return no offer, never retry and never expose the body", async () => {
  for (const status of [201, 301, 302, 400, 429, 500, 503]) {
    let calls = 0;
    const result = await fetchConnectorRegistrarOffers([domain], { env, fetch: async () => {
      calls++;
      return json({ secret: token, accountId, result: body().result }, { status });
    } });
    noOffers(result, status === 429 ? "rate_limited" : "unavailable");
    assert.equal(calls, 1);
  }
  const redirected = json(body());
  Object.defineProperty(redirected, "redirected", { value: true });
  noOffers(await fetchConnectorRegistrarOffers([domain], { env, fetch: async () => redirected }));
});

test("HTTP 401/403 exposes only an authorization diagnosis, never the provider error body", async () => {
  for (const status of [401, 403]) {
    let calls = 0;
    const result = await fetchConnectorRegistrarOffers([domain], { env, fetch: async () => {
      calls++;
      return json({ success: false, errors: [{ message: `private_error ${token} ${accountId}`, permission: "private_scope" }],
        accountId, token, payment: "private_payment", result: body().result }, { status });
    } });
    assert.deepEqual(result, { status: "unavailable", offers: {}, checkedDomains: 1, failureReason: "authorization" });
    for (const value of [token, accountId, "private_error", "private_scope", "private_payment"]) assert.ok(!JSON.stringify(result).includes(value));
    assert.equal(calls, 1);
  }
  // Untrusted provider text cannot invent an HTTP authorization diagnosis.
  noOffers(await run(body([], { success: false, errors: [{ code: 403, message: "authorization required" }] })));
});

test("fetch failures remain private and do not trigger a fallback provider or registration", async () => {
  let calls = 0;
  const result = await fetchConnectorRegistrarOffers([domain], { env, fetch: async () => {
    calls++;
    throw new Error(`private upstream failure ${accountId} ${token}`);
  } });
  noOffers(result);
  assert.equal(calls, 1);
});

test("malformed JSON, invalid UTF-8, content types and oversized response headers fail closed", async () => {
  const cases = [new Response("{", { headers: { "Content-Type": "application/json" } }),
    new Response(new Uint8Array([0xc3, 0x28]), { headers: { "Content-Type": "application/json" } }),
    new Response(JSON.stringify(body())), new Response(null, { headers: { "Content-Type": "application/json" } }),
    ...["text/html", "text/plain", "application/jsonp"].map(type => new Response(JSON.stringify(body()), { headers: { "Content-Type": type } })),
    ...["65537", "99999999999999999", "-1", "abc"].map(length => new Response(JSON.stringify(body()), { headers: { "Content-Type": "application/json", "Content-Length": length } }))];
  for (const response of cases) noOffers(await fetchConnectorRegistrarOffers([domain], { env, now: () => now, fetch: async () => response }));
});

test("response streaming enforces the 64 KiB limit even with a misleading length header", async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({ start(controller) {
    controller.enqueue(new Uint8Array(32768).fill(32));
    controller.enqueue(new Uint8Array(32769).fill(32));
  }, cancel() { cancelled = true; } });
  noOffers(await fetchConnectorRegistrarOffers([domain], { env, fetch: async () =>
    new Response(stream, { headers: { "Content-Type": "application/json", "Content-Length": "1" } }) }));
  assert.equal(cancelled, true);
});

test("a valid response exactly at the byte limit is accepted and UTF-8 can span chunks", async () => {
  const encoded = new TextEncoder().encode(JSON.stringify(body([row()], { messages: [{ message: "ö" }] })));
  const padding = new Uint8Array(65536 - encoded.length).fill(32);
  const stream = new ReadableStream<Uint8Array>({ start(controller) {
    for (const byte of encoded) controller.enqueue(new Uint8Array([byte]));
    controller.enqueue(padding);
    controller.close();
  } });
  const result = await fetchConnectorRegistrarOffers([domain], { env, now: () => now, fetch: async () =>
    new Response(stream, { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Length": "65536" } }) });
  assert.equal(result.status, "ok");
  assert.equal(result.offers[domain].registrationPrice, 8.57);
});

test("the single 8-second deadline bounds both fetch and a stalled response body", async t => {
  const originalSetTimeout = globalThis.setTimeout;
  const delays: number[] = [];
  t.mock.method(globalThis, "setTimeout", ((callback: (...args: unknown[]) => void, delay: number, ...args: unknown[]) => {
    delays.push(delay);
    return originalSetTimeout(callback, 0, ...args);
  }) as typeof globalThis.setTimeout);
  let signal: AbortSignal | null | undefined;
  noOffers(await fetchConnectorRegistrarOffers([domain], { env, fetch: async (_, init) => {
    signal = init?.signal;
    return new Promise<Response>(() => undefined);
  } }));
  assert.equal(signal?.aborted, true);
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
  noOffers(await fetchConnectorRegistrarOffers([domain], { env, fetch: async (_, init) => {
    signal = init?.signal;
    return new Response(stream, { headers: { "Content-Type": "application/json" } });
  } }));
  assert.equal(signal?.aborted, true);
  assert.equal(cancelled, true);
  assert.deepEqual(delays, [8000, 8000]);
});

test("offer timestamps are created after response validation and caller input is not mutable evidence", async () => {
  const domains = [domain];
  let complete = false;
  const result = await fetchConnectorRegistrarOffers(domains, { env, now: () => {
    assert.equal(complete, true);
    return now;
  }, fetch: async () => {
    domains[0] = "other.com";
    complete = true;
    return json(body());
  } });
  assert.equal(result.offers[domain].domain, domain);
  assert.equal(result.offers[domain].checkedAt, new Date(now).toISOString());
  for (const invalid of [NaN, Infinity, -Infinity, 8640000000000000, Date.parse("+010000-01-01T00:00:00.000Z")]) {
    noOffers(await fetchConnectorRegistrarOffers([domain], { env, now: () => invalid, fetch: async () => json(body()) }));
  }
});

test("adapter output is accepted as exact evidence only alongside a fresh registry observation", async () => {
  const result = await run();
  const request = parseConnectorShortlistRequest({ query: "Nordic design studio", tlds: ["com"],
    budget: { amount: 20, currency: "USD", period: "first_year" } });
  const candidate = { domain, tld: "com", status: "available", authoritative: true, checkMethod: "rdap", source: "verisign-rdap",
    checkedAt: new Date(now).toISOString(), registrarOffers: [result.offers[domain]] };
  const present = (overrides: Record<string, unknown> = {}) => presentConnectorShortlist({ results: [{ ...candidate, ...overrides }] }, request, { now });
  assert.equal(present().confirmedCount, 1);
  assert.equal(present().provisionalCount, 0);
  assert.equal(present().items[0].offer.comparison.amount, 8.57);
  assert.equal(present().items[0].offer.purchaseUrl, "https://www.cloudflare.com/domains/");
  assert.equal(present({ checkedAt: new Date(now - 300001).toISOString() }).confirmedCount, 0);
  assert.equal(present({ status: "taken" }).confirmedCount, 0);
  assert.equal(present({ authoritative: false }).confirmedCount, 0);
});
