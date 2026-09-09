import assert from "node:assert/strict";
import test from "node:test";
import { buildSourceIndexQuery, discoverIndexedSources, listSourceIndexCollections } from "../api/_shared/lost-domains-source-index.js";
import type { SafeFetchResponse } from "../api/_shared/lost-domains-fetch.js";

const now = Date.parse("2026-09-09T10:00:00Z"), input = { host: "publisher.com", pathPrefix: "/resources/", collection: "CC-MAIN-2026-34" };
const row = (url = "https://publisher.com/resources/article", timestamp = "20260820120000") => ({ url, timestamp, status: "200", mime: "text/html" });
function response(body: string, status = 200): SafeFetchResponse { return { url: buildSourceIndexQuery(input).href, status,
  headers: { "content-type": "text/x-ndjson" }, body, observedAt: new Date(now).toISOString() }; }

test("CDX scope is one exact host, one collection, a non-root prefix and ten index records", () => {
  const query = buildSourceIndexQuery(input);
  assert.equal(query.hostname, "index.commoncrawl.org"); assert.equal(query.searchParams.get("url"), "https://publisher.com/resources/");
  assert.equal(query.searchParams.get("matchType"), "prefix"); assert.equal(query.searchParams.get("limit"), "10");
  assert.deepEqual(query.searchParams.getAll("filter"), ["=status:200", "=mime:text/html"]);
  assert.equal(query.searchParams.has("page"), false); assert.equal(query.searchParams.has("sort"), false);
  for (const change of [{ host: "*.com" }, { host: "com" }, { host: "127.0.0.1" }, { host: "user.github.io" },
    { pathPrefix: "/" }, { pathPrefix: "/a?query/" }, { pathPrefix: "/a/../b/" }, { pathPrefix: "/%6cogin/" },
    { collection: "../../metadata" }, { collection: "CC-MAIN-2026-99" }]) assert.throws(() => buildSourceIndexQuery({ ...input, ...change }));
});

test("index records remain historical hints, with no target fetch, approval or invented link evidence", async () => {
  let calls = 0;
  const result = await discoverIndexedSources(input, { now: () => now, fetch: async (url, options) => {
    calls++; assert.equal(new URL(url).hostname, "index.commoncrawl.org"); assert.equal(options?.maxRedirects, 0);
    assert.deepEqual(options?.allowedHosts, ["index.commoncrawl.org"]); assert.equal(options?.maxBytes, 131072);
    return response([row(), row(undefined, "20260821120000"), row("https://publisher.com/resources/other")].map(value => JSON.stringify(value)).join("\n"));
  } });
  assert.equal(calls, 1); assert.equal(result.hints.length, 2); assert.equal(result.hints[0].capturedAt, "2026-08-21T12:00:00.000Z");
  assert.equal(result.hints[0].observedAt, new Date(now).toISOString()); assert.equal(result.targetPagesFetched, 0);
  assert.equal(result.sourcesRegistered, 0); assert.equal(result.outgoingLinksVerified, false);
  assert.ok(result.hints.every(value => !value.liveVerified && !value.policyApproved));
});

test("index output cannot escape approved scope or inject sensitive URLs", async () => {
  const records = [row("https://attacker.com/resources/a"), row("https://publisher.com.evil.com/resources/a"),
    row("https://publisher.com/resources-elsewhere/a"), row("https://publisher.com/resources/a?token=secret"),
    row("https://publisher.com/resources/%6cogin/"), row("https://publisher.com/resources/%zz"), row("https://user:secret@publisher.com/resources/a"),
    row("http://publisher.com/resources/a"), row(undefined, "20261339129900"), row(undefined, "20270909100000")];
  const result = await discoverIndexedSources(input, { now: () => now, fetch: async () => response(records.map(value => JSON.stringify(value)).join("\n")) });
  assert.deepEqual(result.hints, []); assert.doesNotMatch(JSON.stringify(result), /secret|attacker/u);
});

test("provider failures and response overflow never become successful empty discovery", async () => {
  for (const value of [response("no records", 404), response("{}", 429), response("{}", 503), response("invalid json"),
    response(Array(11).fill(JSON.stringify(row())).join("\n")), response(" ".repeat(131073)),
    { ...response("<html>Error</html>"), headers: { "content-type": "text/html" } }]) {
    await assert.rejects(discoverIndexedSources(input, { now: () => now, fetch: async () => value }));
  }
});

test("collection metadata is bounded and cannot supply an arbitrary provider URL", async () => {
  let calls = 0;
  const values = await listSourceIndexCollections({ now: () => now, fetch: async (url, options) => {
    calls++; assert.equal(url, "https://index.commoncrawl.org/collinfo.json"); assert.equal(options?.maxRedirects, 0);
    return { ...response(JSON.stringify([{ id: "CC-MAIN-2026-34", "cdx-api": "https://127.0.0.1/" }, { id: "CC-MAIN-2026-30" },
      { id: "../../bad" }, { id: "CC-MAIN-2026-34" }])), headers: { "content-type": "application/json" } };
  } });
  assert.equal(calls, 1); assert.deepEqual(values, ["CC-MAIN-2026-34", "CC-MAIN-2026-30"]);
});
