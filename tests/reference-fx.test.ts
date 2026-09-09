import assert from "node:assert/strict";
import test from "node:test";
import { createReferenceFxHandler, REFERENCE_FX_API_URL } from "../api/reference-fx";
import { normaliseReferenceFx, REFERENCE_FX_CACHE_MS, REFERENCE_FX_MAX_DATE_AGE_MS, REFERENCE_FX_SOURCE, REFERENCE_FX_SOURCE_URL, type ReferenceFx } from "../shared/reference-fx";

const initialNow = Date.parse("2026-09-09T12:00:00Z");
const rows = [ { date: "2026-09-09", base: "USD", quote: "SEK", rate: 10 }, { date: "2026-09-09", base: "USD", quote: "EUR", rate: 0.8 } ];
function response() {
  return { code: 0, body: {} as { referenceFx: ReferenceFx; status: string }, headers: new Map<string, string | number>(),
    setHeader(name: string, value: string | number) { this.headers.set(name.toLowerCase(), value); },
    status(code: number) { this.code = code; return this; }, json(value: unknown) { this.body = value as typeof this.body; } };
}

test("reference FX uses the fixed ECB source, inverts USD quotes correctly, coalesces and expires its cache", async () => {
  let now = initialNow;
  let calls = 0;
  const handler = createReferenceFxHandler({ now: () => now, fetch: async (url, options) => {
    calls++;
    assert.equal(url, REFERENCE_FX_API_URL);
    assert.match(String(url), /base=USD&quotes=SEK,EUR,GBP/);
    assert.match(String(url), /&providers=ECB$/);
    assert.equal(options?.redirect, "error");
    assert.ok(options?.signal);
    return Response.json(rows);
  } });
  const [first, second] = [response(), response()];
  await Promise.all([handler({ method: "GET" }, first), handler({ method: "GET" }, second)]);
  assert.equal(calls, 1);
  assert.equal(first.code, 200);
  assert.deepEqual(second.body, first.body);
  assert.deepEqual(first.body.referenceFx.rates.SEK, { usdPerUnit: 0.1, date: "2026-09-09" });
  assert.equal(first.body.referenceFx.rates.EUR.usdPerUnit, 1.25);
  assert.equal(first.body.referenceFx.source, REFERENCE_FX_SOURCE);
  assert.equal(first.headers.get("cache-control"), "no-store");
  now += REFERENCE_FX_CACHE_MS + 1;
  await handler({ method: "GET" }, response());
  assert.equal(calls, 2);
});

test("FX outages discard expired conversions and cache failures briefly", async () => {
  let now = initialNow;
  let calls = 0;
  const handler = createReferenceFxHandler({ now: () => now, fetch: async () => {
    calls++;
    if (calls > 1) throw new Error("upstream internal detail");
    return Response.json(rows);
  } });
  await handler({ method: "GET" }, response());
  now += REFERENCE_FX_CACHE_MS + 1;
  const failed = response();
  await handler({ method: "GET" }, failed);
  assert.equal(failed.code, 503);
  assert.deepEqual(failed.body, { status: "unavailable", referenceFx: null });
  await handler({ method: "GET" }, response());
  assert.equal(calls, 2);
  now += 60_001;
  await handler({ method: "GET" }, response());
  assert.equal(calls, 3);
});

test("invalid, future, stale, duplicate, excessive and failed rate payloads cannot become USD conversions", async () => {
  const payloads = [
    [], { rates: rows }, [{ ...rows[0], rate: 0 }], [{ ...rows[0], rate: "10" }],
    [{ ...rows[0], base: "EUR" }], [{ ...rows[0], quote: "ZZZ" }], [rows[0], rows[0]],
    [{ ...rows[0], date: "2026-09-10" }], [{ ...rows[0], date: "2026-09-01" }],
    [{ ...rows[0], date: "2026-02-31" }], { padding: "x".repeat(17_000) },
  ];
  for (const payload of payloads) {
    const handler = createReferenceFxHandler({ now: () => initialNow, fetch: async () => Response.json(payload) });
    const res = response();
    await handler({ method: "GET" }, res);
    assert.equal(res.code, 503);
    assert.equal(res.body.referenceFx, null);
  }
  for (const upstream of [new Response("no", { status: 503 }), new Response("[]", { headers: { "Content-Type": "text/html" } })]) {
    const handler = createReferenceFxHandler({ now: () => initialNow, fetch: async () => upstream });
    const res = response();
    await handler({ method: "GET" }, res);
    assert.equal(res.code, 503);
  }
});

test("reference FX rejects writes without contacting upstream", async () => {
  const handler = createReferenceFxHandler({ fetch: async () => { throw new Error("Should not fetch"); } });
  const res = response();
  await handler({ method: "POST" }, res);
  assert.equal(res.code, 405);
  assert.equal(res.headers.get("allow"), "GET");
});

test("client validation rejects an expired fetch, old reference date and untrusted attribution", () => {
  const fixture = { source: REFERENCE_FX_SOURCE, sourceUrl: REFERENCE_FX_SOURCE_URL,
    fetchedAt: new Date(initialNow).toISOString(), rates: { SEK: { usdPerUnit: 0.1, date: "2026-09-09" } } };
  assert.ok(normaliseReferenceFx(fixture, initialNow));
  assert.equal(normaliseReferenceFx(fixture, initialNow + REFERENCE_FX_CACHE_MS + 1), null);
  assert.equal(normaliseReferenceFx(fixture, initialNow - 1), null);
  assert.equal(normaliseReferenceFx({ ...fixture, source: "live" }, initialNow), null);
  assert.equal(normaliseReferenceFx({ ...fixture, sourceUrl: "https://example.com" }, initialNow), null);
  const later = initialNow + REFERENCE_FX_MAX_DATE_AGE_MS + 1;
  assert.equal(normaliseReferenceFx({ ...fixture, fetchedAt: new Date(later).toISOString() }, later), null);
});
