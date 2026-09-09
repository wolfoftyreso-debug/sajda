import assert from "node:assert/strict";
import test from "node:test";
import { neonConfig } from "@neondatabase/serverless";
import { createRegistrarInspector, isRegistrarEnrichmentEnabled, parsePorkbunDomainCheck } from "../api/_shared/lost-domains-registrar";
import { deferLostRegistrar, permitLostRegistrar } from "../api/_shared/lost-domains-providers";
import { isTradingRegistrarEvidence, registrarAcquisitionEvidence, TRADING_REGISTRAR_ENDPOINT } from "../shared/trading-registrar";
import { evaluateTradingAcquisition } from "../shared/trading-acquisition";

const time = Date.UTC(2030, 0, 20, 12);
const domain = "cloudtools.com";
const keys = { apiKey: "pk1_fixture-only-0123456789", secretKey: "sk1_fixture-only-9876543210" };
function payload() { return { status: "SUCCESS", response: { avail: "yes", type: "registration", price: "9.73", regularPrice: "12.00",
  firstYearPromo: "yes", premium: "no", minDuration: 1, additional: { renewal: { type: "renewal", price: "11.25" } } } }; }
function fixture() {
  let now = time;
  const calls: Array<{ url: string; init: RequestInit }> = [], permits: AbortSignal[] = [], deferrals: number[] = [];
  const control = { enabled: true, credentials: keys as typeof keys | null, permit: async () => true,
    response: async (): Promise<Response> => Response.json(payload()), defer: async (_at: number) => {} };
  const inspect = createRegistrarInspector({ now: () => now, enabled: () => control.enabled, credentials: () => control.credentials,
    permit: async signal => { permits.push(signal!); return control.permit(); }, defer: async at => { deferrals.push(at); await control.defer(at); },
    fetch: async (input, init) => { calls.push({ url: String(input), init: init! }); return control.response(); } });
  return { inspect, control, calls, permits, deferrals, advance: (duration: number) => { now += duration; } };
}

test("exact registrar adapter performs only one fixed read-only check and retains known USD facts", async () => {
  const f = fixture(), result = await f.inspect(" CLOUDTOOLS.COM. ");
  assert.equal(isTradingRegistrarEvidence(result), true);
  assert.equal(result.status, "checked"); assert.equal(result.availability, "available");
  assert.equal(result.currency, "USD"); assert.equal(result.annualRegistrationMinor, 973);
  assert.equal(result.renewalPriceMinor, 1125); assert.equal(result.renewalTermYears, null);
  assert.equal(result.regularAnnualRegistrationMinor, 1200); assert.equal(result.minRegistrationYears, 1);
  assert.equal(result.minimumRegistrationSubtotalMinor, 973); assert.equal(result.firstYearPromo, true); assert.equal(result.premium, false);
  assert.equal(Date.parse(result.expiresAt) - Date.parse(result.checkedAt), 300_000);
  assert.equal(f.calls.length, 1); assert.equal(f.permits.length, 1); assert.deepEqual(f.deferrals, []);
  const request = f.calls[0];
  assert.equal(request.url, TRADING_REGISTRAR_ENDPOINT + domain); assert.equal(request.init.method, "POST");
  assert.equal(request.init.redirect, "error"); assert.ok(request.init.signal);
  assert.deepEqual(JSON.parse(String(request.init.body)), { apikey: keys.apiKey, secretapikey: keys.secretKey });
  assert.doesNotMatch(JSON.stringify(result), /fixture-only|secretapikey|apikey|balance|cost|agreeToTerms|create/);
  assert.doesNotMatch(request.url, /mock|sandbox|create|renew|transfer/);
});

test("known exact price still cannot bypass missing taxes, fees, renewal term and investor diligence", async () => {
  const result = await fixture().inspect(domain);
  const acquired = evaluateTradingAcquisition({ domain, ...registrarAcquisitionEvidence(result) }, time);
  assert.equal(acquired.gates.registrability, true); assert.equal(acquired.gates.exact_quote, true);
  assert.equal(acquired.gates.renewal, false); assert.equal(acquired.gates.fees, false); assert.equal(acquired.gates.tax, false);
  assert.equal(acquired.gates.mandatory_addons, false); assert.equal(acquired.priceSignal, "none");
  assert.deepEqual(acquired.totalCostScenarios, []); assert.equal(acquired.readyForAcquisitionReview, false);
  assert.equal(evaluateTradingAcquisition({ domain, ...registrarAcquisitionEvidence(result) }, time + 300_000).gates.registrability, false);
});

test("unavailable response is not called registrable and malformed fields fail closed", () => {
  const unavailable = payload(); unavailable.response.avail = "no";
  const result = parsePorkbunDomainCheck(domain, unavailable, time)!;
  assert.equal(result.availability, "unavailable");
  assert.equal(evaluateTradingAcquisition({ domain, ...registrarAcquisitionEvidence(result) }, time).status, "excluded");
  for (const price of [-1, 9.73, true, "-1", "1e2", "12 USD", "1.001", "1000000001.00", null]) {
    const value = payload(); value.response.price = price as never;
    assert.equal(parsePorkbunDomainCheck(domain, value, time), null, String(price));
  }
  for (const value of [{}, { status: "SUCCESS" }, { status: "ERROR", response: payload().response },
    { ...payload(), domain: "different.com" }, { status: "SUCCESS", response: { ...payload().response, avail: "maybe" } },
    { status: "SUCCESS", response: { ...payload().response, type: "transfer" } },
    { status: "SUCCESS", response: { ...payload().response, minDuration: 0 } }]) assert.equal(parsePorkbunDomainCheck(domain, value, time), null);
});

test("multi-year nonpromo arithmetic is explicit while multi-year promotional totals stay unknown", () => {
  const value = payload(); value.response.minDuration = 2;
  assert.equal(parsePorkbunDomainCheck(domain, value, time)!.minimumRegistrationSubtotalMinor, null);
  value.response.firstYearPromo = "no";
  assert.equal(parsePorkbunDomainCheck(domain, value, time)!.minimumRegistrationSubtotalMinor, 1946);
  delete (value.response as Partial<typeof value.response>).firstYearPromo;
  assert.equal(parsePorkbunDomainCheck(domain, value, time)!.minimumRegistrationSubtotalMinor, null);
  delete (value.response as Partial<typeof value.response>).minDuration;
  assert.equal(parsePorkbunDomainCheck(domain, value, time)!.minRegistrationYears, null);
});

test("sandbox and mock keys, headers and payloads are never accepted as live", async () => {
  for (const field of ["apiKey", "secretKey"] as const) {
    const f = fixture(); f.control.credentials = { ...keys, [field]: field === "apiKey" ? "pk1_sb_fixture-only-123456789" : "sk1_sb_fixture-only-123456789" };
    assert.equal((await f.inspect(domain)).reason, "sandbox_not_live"); assert.equal(f.calls.length, 0); assert.equal(f.permits.length, 0);
  }
  for (const name of ["x-porkbun-sandbox", "x-porkbun-mock"]) {
    const f = fixture(); f.control.response = async () => Response.json(payload(), { headers: { [name]: "true" } });
    const result = await f.inspect(domain); assert.equal(result.reason, "sandbox_not_live"); assert.equal(result.availability, "unknown");
  }
  for (const marker of ["sandbox", "mock", "dryRun"]) {
    const f = fixture(); f.control.response = async () => Response.json({ ...payload(), [marker]: true });
    assert.equal((await f.inspect(domain)).reason, "sandbox_not_live");
    assert.equal(parsePorkbunDomainCheck(domain, { ...payload(), [marker]: true }, time), null);
  }
});

test("disabled, unconfigured, invalid and aborted requests perform no provider work", async () => {
  const disabled = fixture(); disabled.control.enabled = false;
  assert.equal((await disabled.inspect(domain)).reason, "disabled"); assert.equal(disabled.calls.length, 0); assert.equal(disabled.permits.length, 0);
  const unconfigured = fixture(); unconfigured.control.credentials = null;
  assert.equal((await unconfigured.inspect(domain)).reason, "not_configured"); assert.equal(unconfigured.calls.length, 0);
  const invalid = fixture();
  for (const value of ["https://cloudtools.com", "localhost", "127.0.0.1", "a.blogspot.com", "www.cloudtools.com", "cloudtools.com/../create", "xn--hlsa-loa.se"]) {
    const result = await invalid.inspect(value); assert.equal(result.reason, "invalid_domain"); assert.equal(isTradingRegistrarEvidence(result), true);
  }
  assert.equal(invalid.calls.length, 0); assert.equal(invalid.permits.length, 0);
  const controller = new AbortController(); controller.abort();
  const aborted = fixture(); assert.equal((await aborted.inspect(domain, { signal: controller.signal })).reason, "aborted"); assert.equal(aborted.calls.length, 0);
});

test("a refused or failing durable permit cannot be bypassed by a local process", async () => {
  const refused = fixture(); refused.control.permit = async () => false;
  assert.equal((await refused.inspect(domain)).reason, "rate_limited"); assert.equal(refused.calls.length, 0);
  const unavailable = fixture(); unavailable.control.permit = async () => { throw new Error(keys.secretKey); };
  const result = await unavailable.inspect(domain);
  assert.equal(result.reason, "provider_gate_unavailable"); assert.equal(unavailable.calls.length, 0);
  assert.doesNotMatch(JSON.stringify(result), /fixture-only/);
});

test("HTTP429 remains durable even with malformed body and honors long numeric and date Retry-After", async () => {
  for (const [retry, duration] of [["86400", 86_400_000], [new Date(time + 12 * 60 * 60_000).toUTCString(), 12 * 60 * 60_000]] as const) {
    const f = fixture(); f.control.response = async () => new Response("{invalid", { status: 429, headers: { "content-type": "application/json", "retry-after": retry } });
    assert.equal((await f.inspect(domain)).reason, "rate_limited"); assert.deepEqual(f.deferrals, [time + duration]);
    f.advance(11_000); assert.equal((await f.inspect("othercloud.com")).reason, "rate_limited"); assert.equal(f.calls.length, 1);
  }
});

test("legacy and current200body rate-limit responses defer without retry or interpreting provider messages", async () => {
  for (const body of [{ status: "ERROR", code: "RATE_LIMIT_EXCEEDED", ttlRemaining: 120, message: keys.secretKey },
    { status: "ERROR", ttlRemaining: 120, message: keys.secretKey }]) {
    const f = fixture(); f.control.response = async () => Response.json(body);
    const result = await f.inspect(domain); assert.equal(result.reason, "rate_limited");
    assert.deepEqual(f.deferrals, [time + 120_000]); assert.equal(f.calls.length, 1);
    assert.doesNotMatch(JSON.stringify(result), /fixture-only/);
  }
});

test("durable backoff failure does not shorten an observed24hour local restriction", async () => {
  const f = fixture(); f.control.response = async () => new Response(null, { status: 429, headers: { "retry-after": "86400" } });
  f.control.defer = async () => { throw new Error("unavailable"); };
  assert.equal((await f.inspect(domain)).reason, "provider_gate_unavailable");
  f.advance(7 * 60 * 60_000);
  assert.equal((await f.inspect(domain)).reason, "rate_limited"); assert.equal(f.calls.length, 1);
});

test("longer configured provider windows are respected after a successful lookup", async () => {
  const f = fixture(); f.control.response = async () => Response.json({ ...payload(), limits: { TTL: 60, limit: 1, used: 1 } });
  assert.equal((await f.inspect(domain)).status, "checked"); assert.deepEqual(f.deferrals, [time + 60_000]);
  f.advance(11_000); assert.equal((await f.inspect("othercloud.com")).reason, "rate_limited"); assert.equal(f.calls.length, 1);
});

test("body limits, invalid media, upstream errors and thrown secrets return bounded unknown evidence", async () => {
  for (const response of [() => new Response("x".repeat(17 * 1024), { headers: { "content-type": "application/json" } }),
    () => Response.json(payload(), { headers: { "content-length": String(17 * 1024) } }),
    () => new Response("{}", { headers: { "content-type": "text/html" } }), () => new Response("broken", { status: 500 }),
    () => Response.json({ status: "ERROR", message: keys.secretKey }), () => { throw new Error(keys.secretKey); }]) {
    const f = fixture(); f.control.response = async () => response();
    const result = await f.inspect(domain);
    assert.equal(result.status, "unknown"); assert.equal(result.availability, "unknown"); assert.equal(result.annualRegistrationMinor, null);
    assert.equal(isTradingRegistrarEvidence(result), true); assert.doesNotMatch(JSON.stringify(result), /fixture-only/); assert.equal(f.calls.length, 1);
  }
});

test("caller cancellation bounds a nonresponding transport", async () => {
  const f = fixture(); f.control.response = () => new Promise(() => {});
  const controller = new AbortController(); const pending = f.inspect(domain, { signal: controller.signal });
  const timer = setTimeout(() => controller.abort(), 20);
  try { assert.equal((await pending).reason, "aborted"); assert.equal(f.calls.length, 1); }
  finally { clearTimeout(timer); }
});

test("transport schema rejects copied totals, fabricated tax knowledge and unknown domains", () => {
  const result = parsePorkbunDomainCheck(domain, payload(), time)!;
  for (const value of [{ ...result, minimumRegistrationSubtotalMinor: 1 }, { ...result, taxTreatment: "included" },
    { ...result, renewalTermYears: 1 }, { ...result, sourceUrl: "https://evil.com" }, { ...result, domain: "other.com" },
    { ...result, expiresAt: new Date(time + 600_000).toISOString() }, { ...result, secret: "x" }]) assert.equal(isTradingRegistrarEvidence(value), false);
});

test("feature flag is opt-in and the fixed durable gate is account-wide and monotonic", async () => {
  const oldFlag = process.env.SAJDA_LOST_DOMAINS_REGISTRAR_ENABLED;
  try {
    for (const flag of [undefined, "false", "TRUE", "1"]) {
      if (flag === undefined) delete process.env.SAJDA_LOST_DOMAINS_REGISTRAR_ENABLED; else process.env.SAJDA_LOST_DOMAINS_REGISTRAR_ENABLED = flag;
      assert.equal(isRegistrarEnrichmentEnabled(), false);
    }
    process.env.SAJDA_LOST_DOMAINS_REGISTRAR_ENABLED = "true"; assert.equal(isRegistrarEnrichmentEnabled(), true);
  } finally { if (oldFlag === undefined) delete process.env.SAJDA_LOST_DOMAINS_REGISTRAR_ENABLED; else process.env.SAJDA_LOST_DOMAINS_REGISTRAR_ENABLED = oldFlag; }
  const previous = neonConfig.fetchFunction, oldUrl = process.env.DATABASE_URL;
  const requests: Array<{ query: string; params: string[] }> = []; let allowed = true;
  process.env.DATABASE_URL = "postgresql://fixture:fixture@ep-fixture.neon.tech/fixture";
  neonConfig.fetchFunction = (async (_url: unknown, init?: RequestInit) => {
    requests.push(JSON.parse(String(init?.body))); assert.ok(init?.signal);
    return Response.json({ fields: [{ name: "provider", dataTypeID: 25 }], rows: allowed ? [["fixed-provider"]] : [], rowCount: allowed ? 1 : 0 });
  }) as typeof neonConfig.fetchFunction;
  try {
    assert.equal(await permitLostRegistrar(), true); allowed = false; assert.equal(await permitLostRegistrar(), false);
    assert.deepEqual(requests[0].params, ["https://api.porkbun.com/api/json/v3/domain/checkDomain"]);
    assert.deepEqual(requests[0].params, requests[1].params);
    assert.match(requests[0].query, /interval '10 seconds'/u);
    assert.match(requests[0].query, /WHERE sajda\.lost_domain_provider_backoff\.blocked_until <= statement_timestamp\(\)/u);
    await deferLostRegistrar(time + 86_400_000);
    assert.equal(requests[2].params[1], new Date(time + 86_400_000).toISOString());
    assert.match(requests[2].query, /GREATEST\(sajda\.lost_domain_provider_backoff\.blocked_until, EXCLUDED\.blocked_until\)/u);
    for (const invalid of [Number.NaN, Infinity, -1, 8.64e15 + 1]) await assert.rejects(deferLostRegistrar(invalid));
    assert.equal(requests.length, 3);
  } finally {
    neonConfig.fetchFunction = previous;
    if (oldUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = oldUrl;
  }
});
