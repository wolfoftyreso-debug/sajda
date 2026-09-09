import assert from "node:assert/strict";
import test from "node:test";
import handler from "../api/domain-search.js";

const verifiedTlds = ["com", "net", "org", "app", "dev", "ai", "xyz", "info", "biz"];
let sequence = 0;
type Card = { domain: string; tld: string; status: string; checkMethod: string; authoritative: boolean; rankingPosition: number; estimatedValue: number };
type Deck = { requested: number; checked: number; unknown: number; available: number; swipe: boolean; results: Card[]; code?: string };
async function request(body: Record<string, unknown>) {
  const result = { status: 0, body: {} as Deck };
  const response = { setHeader() {}, status(code: number) { result.status = code; return this; }, json(value: unknown) { result.body = value as Deck; }, end() {} };
  await handler({ method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `swipe-fixture-${++sequence}` },
    body: { swipe: true, count: 18, minLength: 7, maxLength: 8, providers: ["cloudflare"], ...body } }, response);
  return result;
}
const negativeRdap = () => Response.json({ errorCode: 404 }, { status: 404, headers: { "content-type": "application/rdap+json" } });
function domainFrom(url: string | URL | Request) {
  const parsed = new URL(String(url));
  assert.equal(parsed.protocol, "https:", "No unauthenticated registry transport");
  assert.match(parsed.pathname, /\/domain\//, "Swipe must not invoke AI or scrape provider prices");
  return decodeURIComponent(parsed.pathname.split("/domain/").at(-1)!);
}

test("every verified non-com ending can produce a standalone Swipe deck", async () => {
  const original = globalThis.fetch;
  try {
    for (const tld of verifiedTlds.filter(value => value !== "com")) {
      const queried: string[] = [];
      globalThis.fetch = async url => {
        const domain = domainFrom(url); queried.push(domain);
        return tld === "xyz" ? Response.json({ objectClassName: "error", errorCode: 404 },
          { status: 404, headers: { "content-type": "application/rdap+json" } }) : negativeRdap();
      };
      const result = await request({ tlds: [tld], count: 12 });
      assert.equal(result.status, 200); assert.equal(result.body.results.length, 12, tld);
      assert.ok(queried.every(domain => domain.endsWith(`.${tld}`)));
      assert.ok(result.body.results.every(card => card.tld === tld && card.domain.endsWith(`.${tld}`) && card.authoritative && card.status === "available"));
    }
  } finally { globalThis.fetch = original; }
});

test("mixed Swipe honors all selected suffixes, unique labels, requested length/count and fixed request budget", async () => {
  const original = globalThis.fetch, queried: string[] = [];
  globalThis.fetch = async url => { queried.push(domainFrom(url)); return negativeRdap(); };
  try {
    const result = await request({ tlds: verifiedTlds, count: 100, minLength: 8, maxLength: 8 });
    assert.equal(result.status, 200); assert.equal(result.body.swipe, true); assert.equal(result.body.results.length, 100);
    assert.equal(new Set(result.body.results.map(card => card.domain.split(".")[0])).size, 100);
    const counts = verifiedTlds.map(tld => result.body.results.filter(card => card.tld === tld).length);
    assert.ok(Math.min(...counts) > 0); assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, JSON.stringify(counts));
    assert.ok(result.body.results.every((card, index) => /^[a-z]{8}\.(com|net|org|app|dev|ai|xyz|info|biz)$/.test(card.domain)
      && card.checkMethod === "rdap" && card.authoritative && card.estimatedValue === 0 && card.rankingPosition === index + 1));
    assert.ok(queried.length <= 109, `Only target100 + already-in-flight9: ${queried.length}`);
    assert.equal(result.body.checked, queried.length);
  } finally { globalThis.fetch = original; }
});

test("a slow selected registry remains represented instead of losing every card to a fast registry", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async url => {
    const domain = domainFrom(url);
    if (domain.endsWith(".com")) await new Promise(resolve => setTimeout(resolve, 25));
    return negativeRdap();
  };
  try {
    const result = await request({ tlds: ["com", "dev"], count: 5 });
    assert.equal(result.status, 200); assert.equal(result.body.results.length, 5);
    const counts = ["com", "dev"].map(tld => result.body.results.filter(card => card.tld === tld).length);
    assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, `Latency must not choose the suffix: ${counts}`);
  } finally { globalThis.fetch = original; }
});

test("taken/unsafe/unverifiable suffixes never turn into Swipe cards or .com fallbacks", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async url => {
    const domain = domainFrom(url);
    if (domain.endsWith(".net")) return Response.json({ objectClassName: "domain", ldhName: domain }, { headers: { "content-type": "application/rdap+json" } });
    if (domain.endsWith(".org")) return new Response("<h1>Not found</h1>", { status: 404, headers: { "content-type": "text/html" } });
    return negativeRdap();
  };
  try {
    const result = await request({ tlds: ["dev", "net", "org", "se", "nu"], count: 12 });
    assert.equal(result.status, 200); assert.ok(result.body.results.length > 0);
    assert.ok(result.body.results.every(card => card.tld === "dev")); assert.ok(result.body.unknown > 0);
    for (const tlds of [["se"], ["nu"]]) {
      const unsupported = await request({ tlds, count: 5 });
      assert.equal(unsupported.status, 200); assert.equal(unsupported.body.results.length, 0); assert.equal(unsupported.body.unknown, unsupported.body.checked);
    }
    assert.equal((await request({ tlds: ["io"] })).status, 400);
  } finally { globalThis.fetch = original; }
});

test("Swipe normalizes selected suffixes, clamps deck size, and rejects invalid lengths without registry work", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async url => { calls++; assert.ok(domainFrom(url).endsWith(".dev")); return negativeRdap(); };
  try {
    const result = await request({ tlds: [" .DEV ", "dev", "not-real"], count: 999, minLength: 3, maxLength: 3 });
    assert.equal(result.status, 200); assert.equal(result.body.requested, 100); assert.equal(result.body.results.length, 100);
    assert.ok(result.body.results.every(card => /^[a-z]{3}\.dev$/.test(card.domain)));
    const before = calls;
    for (const range of [{ minLength: 2 }, { maxLength: 10 }, { minLength: 9, maxLength: 3 }, { minLength: "3" }]) {
      assert.equal((await request({ tlds: ["dev"], ...range })).status, 400);
    }
    assert.equal(calls, before);
  } finally { globalThis.fetch = original; }
});

test("an unavailable registry produces an honest empty deck within the 180-candidate hard cap", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async url => { domainFrom(url); calls++; return new Response("temporary provider failure", { status: 503 }); };
  try {
    const result = await request({ tlds: ["app", "biz"], count: 100 });
    assert.equal(result.status, 200); assert.equal(result.body.results.length, 0);
    assert.equal(result.body.checked, 180); assert.equal(result.body.unknown, 180); assert.equal(calls, 180);
  } finally { globalThis.fetch = original; }
});

test("Swipe stops launching registry work at the request's 22-second budget and keeps verified partial results", async () => {
  const original = globalThis.fetch, originalNow = Date.now;
  let now = originalNow(), calls = 0;
  Date.now = () => now;
  globalThis.fetch = async url => { domainFrom(url); calls++; now += 4_000; return negativeRdap(); };
  try {
    const result = await request({ tlds: ["dev", "xyz"], count: 100 });
    assert.equal(result.status, 200); assert.equal(calls, 6);
    assert.equal(result.body.checked, calls); assert.equal(result.body.results.length, calls);
    assert.ok(result.body.results.every(card => card.authoritative && card.status === "available"));
  } finally { globalThis.fetch = original; Date.now = originalNow; }
});
