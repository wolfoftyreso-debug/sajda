import assert from "node:assert/strict";
import test from "node:test";
import handler, { generateCandidates, screening } from "../api/domain-search.ts";
import { asciiNameToken, joinNameWords, nameQualitySignals, interpretRdapResponse, readRegistryResponse, registryRetryAt } from "../api/_shared/search-quality.mjs";

const criteria = { minLength: 3, maxLength: 16, nameLanguage: "auto", nameStyle: "balanced", includeWords: [], excludeWords: [] };
let requestNumber = 0;
async function request(body, options = {}) {
  const headers = {};
  const result = { status: 0, body: null, headers };
  const response = {
    setHeader(key, value) { headers[key.toLowerCase()] = value; },
    status(status) { result.status = status; return this; },
    json(value) { result.body = value; },
    end() {},
  };
  await handler({ method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `test-search-${++requestNumber}` }, body, ...options }, response);
  return result;
}

test("normalization preserves Nordic, French and German Latin references", () => {
  assert.equal(asciiNameToken("ÅÄÖ café Øresund Æble Straße"), "aaocafeoresundaeblestrasse");
  assert.equal(joinNameWords("eco", "orbit"), "ecoorbit");
  assert.equal(joinNameWords("coffee", "estate"), "coffeeestate");
  assert.equal(joinNameWords("guide", "guiden"), "");
  assert.equal(joinNameWords("plan", "planen"), "");
});

test("themed generation is deterministic, valid, unique and balanced across selected endings", () => {
  for (const theme of ["hav", "bygglov", "kaffe", "frisörsalong", "health", "finance", "coastal studio", "zorbexus"]) {
    const result = generateCandidates(["com", "app", "dev"], 50, theme, "sv");
    assert.deepEqual(result, generateCandidates(["com", "app", "dev"], 50, theme, "sv"));
    assert.ok(result.length > 0 && result.length <= 50, theme);
    assert.equal(new Set(result.map((item) => item.domain)).size, result.length);
    assert.ok(result.every((item) => /^[a-z][a-z0-9]{2,21}\.(com|app|dev)$/.test(item.domain)));
    const counts = ["com", "app", "dev"].map((tld) => result.filter((item) => item.domain.endsWith(`.${tld}`)).length);
    assert.ok(Math.max(...counts) - Math.min(...counts) <= 1);
  }
});

test("short typed reference and multiword intent lead the results", () => {
  assert.equal(generateCandidates(["com"], 50, "hav", "sv")[0].domain, "hav.com");
  const multiword = generateCandidates(["com"], 50, "coffee craft", "en");
  assert.ok(multiword.slice(0, 5).some((item) => item.domain === "coffeecraft.com"));
  const sentence = generateCandidates(["com"], 50, "Jag vill ha ett namn för en konsult", "sv");
  assert.equal(sentence[0].domain, "konsult.com");
  assert.ok(sentence.every((item) => !item.domain.startsWith("ha")));
});

test("prefix variations do not masquerade as independent naming directions", () => {
  const firstTwenty = generateCandidates(["com"], 50, "hav", "sv").slice(0, 20);
  assert.ok(firstTwenty.filter((item) => item.domain.includes("hav")).length <= 3);
  assert.ok(firstTwenty.some((item) => /kust|bris|vatten|vik/.test(item.domain)));
  const unknown = generateCandidates(["com"], 50, "zorbexus", "en");
  assert.ok(unknown.every((item) => item.domain.includes("zorbe")), "unknown themes cannot be padded with unrelated filler");
});

test("explicit Swedish language, length, and excluded-word constraints are respected", () => {
  const result = generateCandidates(["com"], 80, "kaffe", "sv", { ...criteria, nameLanguage: "sv", minLength: 6, maxLength: 12, excludeWords: ["kollen", "bygg"] });
  assert.ok(result.length > 0);
  for (const { domain } of result) {
    const label = domain.split(".")[0];
    assert.ok(label.length >= 6 && label.length <= 12, label);
    assert.ok(!/kollen|bygg|cloud|works|coffee|brew|bean|^get|^my|^next|^true/.test(label), label);
  }
});

test("automatic language follows a known English reference instead of mixing in Swedish UI language", () => {
  const result = generateCandidates(["com"], 40, "coffee", "sv");
  assert.equal(result[0].domain, "coffee.com");
  assert.ok(result.some((item) => /bean|brew|roast/.test(item.domain)));
  assert.ok(result.every((item) => !/blick|kollen|navet|sparet|rummet/.test(item.domain)));
});

test("naming signal is extension-independent and never a fabricated valuation", () => {
  const com = screening("klarhem.com", "keyword", "sv");
  const dev = screening("klarhem.dev", "keyword", "sv");
  assert.equal(com.estimatedValue, 0);
  assert.equal(com.registrarPrice, 0);
  assert.equal(com.namingScore, dev.namingScore);
  assert.ok(com.namingScore >= 0 && com.namingScore <= 100);
  assert.ok(nameQualitySignals("klarhem").score > nameQualitySignals("xqzzzt99").score);
});

test("RDAP validates exact domain object and coherent negative evidence", () => {
  const type = "application/rdap+json; charset=utf-8";
  assert.equal(interpretRdapResponse(200, type, '{"objectClassName":"domain","ldhName":"EXAMPLE.COM"}', "example.com"), "taken");
  assert.equal(interpretRdapResponse(404, type, "", "fresh.com"), "available");
  assert.equal(interpretRdapResponse(404, type, '{"errorCode":404}', "fresh.com"), "available");
  assert.equal(interpretRdapResponse(404, type, '{"rdapConformance":["rdap_level_0"],"objectClassName":"error","errorCode":404,"title":"Not Found"}', "fresh.xyz"), "available");
  for (const [status, contentType, body] of [
    [404, "text/html", "<h1>Not found</h1>"],
    [200, type, "{}"],
    [200, type, '{"objectClassName":"domain","ldhName":"someone-else.com"}'],
    [404, type, '{"errorCode":429}'],
    [404, type, '{"errorCode":404,"objectClassName":"domain","ldhName":"fresh.com"}'],
    [404, type, '{"errorCode":404,"objectClassName":"error","ldhName":"fresh.com"}'],
    [404, type, '{"errorCode":429,"objectClassName":"error"}'],
    [404, type, '{"errorCode":404,"objectClassName":"entity"}'],
    [200, type, "<h1>error</h1>"],
    [503, type, '{"errorCode":404}'],
  ]) assert.equal(interpretRdapResponse(status, contentType, body, "fresh.com"), "unknown");
});

test("registry response reader enforces size limits for declared and streamed bodies", async () => {
  await assert.rejects(readRegistryResponse(new Response("xxxxxxxx", { headers: { "content-length": "8" } }), 4), /exceeds limit/);
  await assert.rejects(readRegistryResponse(new Response("xxxxxxxx"), 4), /exceeds limit/);
  assert.equal(await readRegistryResponse(new Response("test"), 4), "test");
});

test("registry cooldown honors Retry-After seconds and HTTP dates", () => {
  const now = Date.parse("2026-09-08T10:00:00Z");
  assert.equal(registryRetryAt("120", now), now + 120_000);
  assert.equal(registryRetryAt("Tue, 08 Sep 2026 10:05:00 GMT", now), now + 300_000);
  assert.equal(registryRetryAt(null, now), now + 60_000);
});

test("public API rejects unsupported references and contradictory constraints before registry work", async () => {
  const fetchBefore = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("No provider request should occur"); };
  try {
    const unsupported = await request({ theme: "你好", tlds: ["com"] });
    assert.equal(unsupported.status, 400);
    assert.equal(unsupported.body.code, "unsupported_reference");
    const contradictory = await request({ theme: "hav", tlds: ["com"], advanced: true, brief: "Svenska havsnära produkter", criteria: { ...criteria, includeWords: ["hav"], excludeWords: ["hav"] } });
    assert.equal(contradictory.status, 400);
    const invalidExact = await request({ domains: ["https://localhost/admin"], tlds: ["com"] });
    assert.equal(invalidExact.status, 400);
    assert.equal((await request({ domains: [], tlds: ["com"] })).status, 400);
  } finally { globalThis.fetch = fetchBefore; }
});

test("public API preserves ranking, unknown failures and truthful price/value fields", async () => {
  const fetchBefore = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const domain = decodeURIComponent(String(url).split("/domain/").at(-1));
    if (domain.startsWith("fixturetaken")) return new Response(JSON.stringify({ objectClassName: "domain", ldhName: domain.toUpperCase() }), { status: 200, headers: { "content-type": "application/rdap+json" } });
    if (domain.startsWith("fixturebroken")) return new Response("<h1>Not found</h1>", { status: 404, headers: { "content-type": "text/html" } });
    return new Response("", { status: 404, headers: { "content-type": "application/rdap+json" } });
  };
  try {
    const result = await request({ domains: ["fixturetaken.com", "fixturefresh.com", "fixturebroken.com"], providers: ["cloudflare"] });
    assert.equal(result.status, 200);
    assert.deepEqual(result.body.results.map((item) => item.status), ["taken", "available", "unknown"]);
    assert.deepEqual(result.body.results.map((item) => item.rankingPosition), [1, 2, 3]);
    assert.equal(result.body.results[2].authoritative, false);
    assert.ok(result.body.results.every((item) => item.estimatedValue === 0 && item.registrarPrice === 0 && item.registrarOffers.every((offer) => offer.priceVerified === false)));
    assert.equal(result.headers["cache-control"], "no-store");
    const creative = await request({ theme: "hav", tlds: ["com"], count: 8, advanced: false, swipe: false, criteria: undefined, providers: ["cloudflare"] });
    // A JSON wire body omits undefined properties; exercise that exact shape.
    const wireCreative = await request(JSON.parse(JSON.stringify({ theme: "hav", tlds: ["com"], count: 8, advanced: false, swipe: false, criteria: undefined, providers: ["cloudflare"] })));
    assert.equal(wireCreative.status, 200);
    assert.equal(wireCreative.body.results.length, 8);
    assert.equal(creative.status, 400, "non-JSON internal undefined fields must not bypass criteria validation");
  } finally { globalThis.fetch = fetchBefore; }
});

test("Swedish national registries fail closed without an approved secure connector", async () => {
  const result = await request({ domains: ["fixtureprobe.se", "fixtureprobe.nu"], providers: ["cloudflare"] });
  assert.equal(result.status, 200);
  assert.ok(result.body.results.every((item) => item.status === "unknown" && item.authoritative === false));
});

test("cached registry evidence retains its observation timestamp instead of inheriting response time", async () => {
  const originalFetch = globalThis.fetch, originalNow = Date.now;
  let now = originalNow(), providerCalls = 0;
  Date.now = () => now;
  globalThis.fetch = async () => {
    providerCalls++;
    return new Response("", { status: 404, headers: { "content-type": "application/rdap+json" } });
  };
  try {
    const first = await request({ domains: ["fixtureobservationclock.com"], providers: ["cloudflare"] });
    assert.equal(first.body.results[0].status, "available");
    assert.ok(Number.isFinite(Date.parse(first.body.results[0].checkedAt)));
    now += 30_000;
    const second = await request({ domains: ["fixtureobservationclock.com"], providers: ["cloudflare"] });
    assert.equal(providerCalls, 1);
    assert.equal(second.body.results[0].checkedAt, first.body.results[0].checkedAt);
  } finally { globalThis.fetch = originalFetch; Date.now = originalNow; }
});

test("a rate-limited registry is not hammered by subsequent requests to another suffix on that endpoint", async () => {
  const fetchBefore = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response('{"errorCode":429}', { status: 429, headers: { "content-type": "application/rdap+json", "retry-after": "120" } });
  };
  try {
    const first = await request({ domains: ["fixtureratelimit.app"], providers: ["cloudflare"] });
    const second = await request({ domains: ["fixtureratelimit.dev"], providers: ["cloudflare"] });
    assert.equal(calls, 1);
    assert.equal(first.body.results[0].status, "unknown");
    assert.equal(second.body.results[0].status, "unknown");
  } finally { globalThis.fetch = fetchBefore; }
});
