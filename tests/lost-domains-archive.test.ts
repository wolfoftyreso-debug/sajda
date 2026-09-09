import assert from "node:assert/strict";
import test from "node:test";
import { buildDomainArchiveQuery, createArchiveInspector, isArchiveEnrichmentEnabled } from "../api/_shared/lost-domains-archive.js";
import { LostDomainsFetchError, type SafeFetchOptions, type SafeFetchResponse } from "../api/_shared/lost-domains-fetch.js";
import { isTradingArchiveEvidence } from "../shared/trading-archive.js";

const startedAt = Date.parse("2026-09-09T10:00:00.000Z");
const collection = "CC-MAIN-2026-34", domain = "publisher.com";
const sample = (url = "https://publisher.com/", timestamp = "20260820120000", status = "200") => ({ url, timestamp, status });
const jsonl = (rows: unknown[]) => rows.map(row => JSON.stringify(row)).join("\n");
const collections = JSON.stringify([{ id: "CC-MAIN-2026-30" }, { id: collection, "cdx-api": "https://127.0.0.1/warc" }, { id: "../../bad" }]);
const response = (url: string, body: string, status = 200): SafeFetchResponse => ({ url, body, status,
  headers: { "content-type": "application/json" }, observedAt: new Date(startedAt).toISOString() });
function harness(input: { body?: string; reply?: (url: string) => SafeFetchResponse; enabled?: boolean } = {}) {
  let time = startedAt;
  const calls: { url: string; at: number; options?: SafeFetchOptions }[] = [];
  const inspect = createArchiveInspector({ now: () => time, enabled: () => input.enabled ?? true,
    wait: async milliseconds => { time += milliseconds; }, fetch: async (url, options) => {
      calls.push({ url, options, at: time });
      return input.reply?.(url) ?? response(url, url.endsWith("collinfo.json") ? collections : input.body ?? jsonl([sample()]));
    } });
  return { inspect, calls, advance: (milliseconds: number) => { time += milliseconds; } };
}

test("archive enrichment is opt in and disabled calls never touch the network", async () => {
  assert.equal(isArchiveEnrichmentEnabled({}), false);
  for (const flag of ["false", "1", "TRUE", " true "]) assert.equal(isArchiveEnrichmentEnabled({ SAJDA_LOST_DOMAINS_ARCHIVE_ENABLED: flag }), false);
  assert.equal(isArchiveEnrichmentEnabled({ SAJDA_LOST_DOMAINS_ARCHIVE_ENABLED: "true" }), true);
  const { inspect, calls } = harness({ enabled: false });
  const value = await inspect(domain);
  assert.equal(value.status, "disabled"); assert.equal(value.priorExistence, null); assert.equal(value.sampleCount, null);
  assert.equal(value.sourceUrl, null); assert.equal(isTradingArchiveEvidence(value), true); assert.equal(calls.length, 0);
});

test("query scope is one ICANN apex and one fixed index with five metadata rows", async () => {
  const query = buildDomainArchiveQuery(domain, collection);
  assert.equal(query.origin, "https://index.commoncrawl.org");
  assert.deepEqual(Object.fromEntries(query.searchParams), { url: domain, matchType: "host", output: "json", limit: "5", fl: "url,timestamp,status" });
  for (const invalid of ["localhost", "127.0.0.1", "169.254.169.254", "com", "user.github.io", "sub.publisher.com",
    "*.publisher.com", "https://publisher.com", "publisher.com/path", "publisher.com?url=other.com", "publisher.com.",
    "publisher.com@127.0.0.1", "example.com", "publisher.internal", "PUBLISHER.com", "publisher.com:443"]) {
    assert.throws(() => buildDomainArchiveQuery(invalid, collection));
    const { inspect, calls } = harness();
    assert.equal((await inspect(invalid)).reason, "invalid_domain"); assert.equal(calls.length, 0);
  }
  for (const invalid of ["../../warc", "CC-MAIN-2026-99", "CC-MAIN-2026-34-index", "https://evil.com"]) {
    assert.throws(() => buildDomainArchiveQuery(domain, invalid));
  }
  assert.equal(buildDomainArchiveQuery("publisher.co.uk", collection).searchParams.get("url"), "publisher.co.uk");
});

test("latest collection metadata cannot choose a destination; samples preserve limited provenance", async () => {
  const { inspect, calls } = harness({ body: jsonl([sample(), sample("http://publisher.com/contact?token=secret", "20260821123000", "404"), sample()]) });
  const value = await inspect(domain);
  assert.equal(calls.length, 2); assert.equal(calls[0].url, "https://index.commoncrawl.org/collinfo.json");
  assert.equal(calls[1].url, buildDomainArchiveQuery(domain, collection).href);
  assert.ok(calls[1].at - calls[0].at >= 1_000);
  for (const call of calls) {
    assert.equal(new URL(call.url).hostname, "index.commoncrawl.org"); assert.equal(call.options?.maxRedirects, 0);
    assert.deepEqual(call.options?.allowedHosts, ["index.commoncrawl.org"]);
    assert.equal(call.options?.deadline, startedAt + 10_000); assert.ok(call.options?.signal);
  }
  assert.equal(calls[0].options?.maxBytes, 131_072); assert.equal(calls[1].options?.maxBytes, 32_768);
  assert.equal(value.collection, collection); assert.equal(value.status, "observed"); assert.equal(value.priorExistence, true);
  assert.equal(value.sampleCount, 2); assert.equal(value.earliestSampleAt, "2026-08-20T12:00:00.000Z");
  assert.equal(value.latestSampleAt, "2026-08-21T12:30:00.000Z"); assert.deepEqual(value.sampleStatuses, [200, 404]);
  assert.equal(value.sampleLimit, 5); assert.equal(value.collectionLimit, 1); assert.equal(isTradingArchiveEvidence(value), true);
  assert.doesNotMatch(JSON.stringify(value), /secret|127\.0\.0\.1|warc|backlink|ownership|authority|available/u);
});

test("empty samples mean unknown and never establish historical nonexistence", async () => {
  const { inspect } = harness({ body: "\n" });
  const value = await inspect(domain);
  assert.equal(value.reason, "no_sightings"); assert.equal(value.status, "unknown"); assert.equal(value.priorExistence, null);
  assert.equal(value.sampleCount, 0); assert.equal(value.earliestSampleAt, null); assert.equal(value.latestSampleAt, null);
  assert.equal(isTradingArchiveEvidence(value), true);
});

test("apex attribution rejects subdomains, credentials, private addresses and off-host metadata", async () => {
  for (const bad of ["https://www.publisher.com/", "https://sub.publisher.com/", "https://publisher.com.evil.com/",
    "https://127.0.0.1/", "https://user:pass@publisher.com/", "https://publisher.com:8443/", "javascript:alert(1)"]) {
    const { inspect, calls } = harness({ body: jsonl([sample(bad)]) });
    const value = await inspect(domain);
    assert.equal(value.status, "unknown"); assert.equal(value.sampleCount, null); assert.equal(value.priorExistence, null);
    assert.equal(calls.length, 2); assert.equal(isTradingArchiveEvidence(value), true);
  }
});

test("invalid timestamps, row overflow and malformed metadata fail closed", async () => {
  for (const body of [jsonl([sample(undefined, "20260231120000")]), jsonl([sample(undefined, "20270909120000")]),
    jsonl([sample(undefined, "20260821120000", "oops")]), jsonl([sample(undefined, "20260821120000", "600")]),
    jsonl(Array(6).fill(sample())), "{" , "null", "[]", " ".repeat(32_769)]) {
    const { inspect } = harness({ body });
    const value = await inspect(domain);
    assert.equal(value.reason, "invalid_response"); assert.equal(value.sampleCount, null); assert.equal(value.priorExistence, null);
  }
});

test("non-JSON, redirects and HTTP failures cannot masquerade as empty evidence", async () => {
  for (const change of [{ status: 404 }, { status: 500 }, { status: 302, headers: { location: "https://private.internal/" } },
    { headers: { "content-type": "text/html" } }, { url: "https://evil.com/" }]) {
    const { inspect, calls } = harness({ reply: url => ({ ...response(url, collections), ...change }) });
    const value = await inspect(domain);
    assert.equal(value.status, "unknown"); assert.equal(value.sampleCount, null); assert.equal(value.priorExistence, null);
    assert.equal(calls.length, 1);
  }
});

test("bounded collection response errors never start an index lookup", async () => {
  for (const body of ["{}", "null", "{", "[]", JSON.stringify([{ id: "https://evil.com" }]),
    JSON.stringify(Array(501).fill({ id: collection })), " ".repeat(131_073)]) {
    const { inspect, calls } = harness({ reply: url => response(url, body) });
    const value = await inspect(domain);
    assert.equal(value.status, "unknown"); assert.equal(value.sampleCount, null); assert.equal(calls.length, 1);
  }
});

test("cache preserves the original check timestamp and cannot be mutated by a caller", async () => {
  const { inspect, calls, advance } = harness();
  const first = await inspect(domain);
  first.sampleStatuses.push(500); advance(60_000);
  const cached = await inspect(domain);
  assert.equal(calls.length, 2); assert.equal(cached.checkedAt, first.checkedAt); assert.deepEqual(cached.sampleStatuses, [200]);
  await inspect("publisher.net"); assert.equal(calls.length, 3);
  advance(86_400_000); await inspect(domain); assert.equal(calls.length, 5);
});

test("429 and 503 trigger a 24-hour provider cooldown across candidate domains", async () => {
  for (const status of [429, 503]) {
    const { inspect, calls, advance } = harness({ reply: url => response(url, "busy", status) });
    assert.equal((await inspect(domain)).reason, "rate_limited");
    assert.equal((await inspect("publisher.net")).reason, "rate_limited"); assert.equal(calls.length, 1);
    advance(86_399_000); await inspect("publisher.org"); assert.equal(calls.length, 1);
    advance(1_000); await inspect("publisher.org"); assert.equal(calls.length, 2);
  }
});

test("one inspection runs at a time; cancellation releases it without a second request", async () => {
  const abort = new AbortController(); let calls = 0;
  const inspect = createArchiveInspector({ enabled: () => true, fetch: async () => { calls++; return new Promise<SafeFetchResponse>(() => {}); } });
  const pending = inspect(domain, { signal: abort.signal });
  assert.equal((await inspect("publisher.net")).reason, "busy");
  abort.abort(); assert.equal((await pending).reason, "aborted"); assert.equal(calls, 1);
  const timedOut = await inspect("publisher.net", { deadline: Date.now() - 1 });
  assert.equal(timedOut.reason, "timeout"); assert.equal(calls, 1);
});

test("DNS/network errors stay unknown and are cached briefly", async () => {
  let calls = 0;
  const inspect = createArchiveInspector({ enabled: () => true, fetch: async () => { calls++; throw new LostDomainsFetchError("blocked_address"); } });
  const value = await inspect(domain); await inspect(domain);
  assert.equal(value.reason, "unavailable"); assert.equal(value.priorExistence, null); assert.equal(value.sampleCount, null); assert.equal(calls, 1);
});

test("active request timeout returns unknown within the caller's deadline", async () => {
  let calls = 0;
  const start = Date.now();
  const inspect = createArchiveInspector({ enabled: () => true, fetch: async url => {
    calls++;
    return new Promise<SafeFetchResponse>(resolve => { setTimeout(() => resolve(response(url, collections)), 100); });
  } });
  const value = await inspect(domain, { deadline: start + 20 });
  assert.equal(value.reason, "timeout"); assert.equal(value.priorExistence, null); assert.equal(value.sampleCount, null);
  assert.equal(calls, 1);
});

test("persisted evidence validator rejects fabricated counts, certainty, dates and source links", async () => {
  const value = await harness().inspect(domain);
  for (const change of [{ sampleCount: 500 }, { sampleCount: 0 }, { sampleStatuses: [200, 200] }, { priorExistence: false },
    { sourceUrl: "https://evil.com" }, { sourceUrl: value.sourceUrl + "&page=2" }, { collection: "../../bad" },
    { latestSampleAt: "2027-09-09T10:00:00.000Z" }, { earliestSampleAt: "bad" }, { sampleLimit: 100 }, { collectionLimit: 10 },
    { status: "unknown" }, { reason: "no_sightings" }, { ownershipVerified: true }]) assert.equal(isTradingArchiveEvidence({ ...value, ...change }), false);
  for (const domain of ["127.0.0.1", "publisher.internal", "sub.publisher.com", "user.github.io"]) {
    const sourceUrl = new URL(value.sourceUrl!); sourceUrl.searchParams.set("url", domain);
    assert.equal(isTradingArchiveEvidence({ ...value, domain, sourceUrl: sourceUrl.href }), false);
  }
});

test("a durable provider gate precedes both collection discovery and metadata requests", async () => {
  let time = startedAt; const events: string[] = [];
  const inspect = createArchiveInspector({ enabled: () => true, now: () => time,
    wait: async milliseconds => { time += milliseconds; },
    gate: async signal => { assert.equal(signal.aborted, false); events.push("gate"); return true; },
    fetch: async url => { events.push(url.endsWith("collinfo.json") ? "collections" : "metadata");
      return response(url, url.endsWith("collinfo.json") ? collections : jsonl([sample()])); } });
  assert.equal((await inspect(domain)).status, "observed");
  assert.deepEqual(events, ["gate", "collections", "gate", "metadata"]);
  await inspect(domain); assert.equal(events.length, 4);
});

test("a denied or unavailable durable gate returns unknown without a provider request", async () => {
  for (const broken of [false, true]) {
    let fetched = 0, gates = 0;
    const inspect = createArchiveInspector({ enabled: () => true,
      gate: async () => { gates++; if (broken) throw new Error("Private database error"); return false; },
      fetch: async url => { fetched++; return response(url, collections); } });
    const value = await inspect(domain);
    assert.equal(value.status, "unknown"); assert.equal(value.reason, broken ? "unavailable" : "rate_limited");
    assert.equal(value.priorExistence, null); assert.equal(fetched, 0); assert.equal(gates, 1);
    assert.doesNotMatch(JSON.stringify(value), /Private database/u);
  }
});

test("persisted 429/503 cooldown survives a new inspector and keeps the provider idle", async () => {
  for (const status of [429, 503]) {
    let blockedUntil = 0, fetched = 0, backoffs = 0;
    const deps = { enabled: () => true, now: () => startedAt,
      gate: async (signal: AbortSignal) => { assert.equal(signal.aborted, false); return blockedUntil <= startedAt; },
      backoff: async (retryAt: number, signal: AbortSignal) => {
        backoffs++; assert.equal(signal.aborted, false); blockedUntil = Math.max(blockedUntil, retryAt);
      },
      fetch: async (url: string) => { fetched++; return response(url, "Busy", status); } };
    const first = await createArchiveInspector(deps)(domain);
    assert.equal(first.reason, "rate_limited"); assert.equal(backoffs, 1); assert.equal(blockedUntil, startedAt + 86_400_000);
    const cold = await createArchiveInspector(deps)("publisher.net");
    assert.equal(cold.reason, "rate_limited"); assert.equal(cold.priorExistence, null); assert.equal(fetched, 1);
  }
});

test("deadline also bounds pending durable gates and backoff writes", async () => {
  let fetched = 0;
  const slowGate = createArchiveInspector({ enabled: () => true,
    gate: async () => new Promise<boolean>(resolve => { setTimeout(() => resolve(true), 100); }),
    fetch: async url => { fetched++; return response(url, collections); } });
  const gated = await slowGate(domain, { deadline: Date.now() + 20 });
  assert.equal(gated.reason, "timeout"); assert.equal(fetched, 0);
  let backoffs = 0;
  const slowBackoff = createArchiveInspector({ enabled: () => true, gate: async () => true,
    fetch: async url => { fetched++; return response(url, "Busy", 503); },
    backoff: async () => { backoffs++; return new Promise<void>(resolve => { setTimeout(resolve, 100); }); } });
  const value = await slowBackoff(domain, { deadline: Date.now() + 20 });
  assert.equal(value.reason, "rate_limited"); assert.equal(value.priorExistence, null); assert.equal(backoffs, 1);
  assert.equal((await slowBackoff("publisher.net")).reason, "rate_limited"); assert.equal(fetched, 1);
});

test("failed backoff persistence retains local cooldown and unknown rate-limit evidence", async () => {
  let fetched = 0;
  const inspect = createArchiveInspector({ enabled: () => true, gate: async () => true,
    fetch: async url => { fetched++; return response(url, "Busy", 429); },
    backoff: async () => { throw new Error("Private persistence failure"); } });
  const value = await inspect(domain);
  assert.equal(value.status, "unknown"); assert.equal(value.reason, "rate_limited"); assert.equal(value.priorExistence, null);
  assert.equal((await inspect("publisher.net")).reason, "rate_limited"); assert.equal(fetched, 1);
  assert.doesNotMatch(JSON.stringify(value), /Private persistence/u);
});
