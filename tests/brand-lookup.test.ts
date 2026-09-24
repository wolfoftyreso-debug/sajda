import assert from "node:assert/strict";
import test from "node:test";
import { brandLookupInputSchema, brandLookupResultSchema } from "../shared/brand-lookup";
import { createBrandLookupExecutor } from "../api/_shared/brand-lookup";
import { AccountAccessError } from "../api/_shared/account-error";
import { createBrandLookupBudget } from "../api/_shared/brand-lookup-budget";

const NOW = Date.parse("2026-09-13T12:00:00Z");
const json = (value: unknown, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json", ...headers } });
const noBudget = async () => ({ release: async () => {}, backoff: async (_seconds: number) => {} });
const search = { operation: "search", query: "IKEA", locale: "en" } as const;
const profile = { operation: "profile", entity_id: "Q54078", locale: "en" } as const;
const matches = { success: 1, search: [{ id: "Q54078", label: "IKEA", description: "Furniture retailer" }, { id: "Q18587732", label: "Ikea", description: "Genus of insects" }], "search-continue": 5 };
const typeClaim = (id = "Q4830453") => ({ rank: "normal", mainsnak: { property: "P31", snaktype: "value", datavalue: { value: { "entity-type": "item", id } } } });
const types = { success: 1, entities: Object.fromEntries(matches.search.map(row => [row.id, { id: row.id, type: "item", claims: { P31: [typeClaim()] } }])) };
const searchResponse = (url: unknown, value: unknown = matches) => new URL(String(url)).searchParams.get("props") === "claims" ? types : value;
function statement(property: string, value: string, extra: Record<string, unknown> = {}) {
  return { id: `Q54078$${property}-${value}`, rank: "normal", mainsnak: { property, snaktype: "value", datavalue: { value } }, ...extra };
}
function entity(claims: Record<string, unknown> = {}) {
  return { success: 1, entities: { Q54078: { id: "Q54078", type: "item", labels: { en: { value: "IKEA" } }, descriptions: { en: { value: "Furniture retailer" } },
    lastrevid: 123, modified: "2026-09-01T01:00:00Z", claims: { P31: [typeClaim()], ...claims } } } };
}
function runner(value: unknown) {
  return createBrandLookupExecutor({ fetch: async url => json(searchResponse(url, value)), now: () => NOW, reserve: noBudget });
}
const errorCode = (code: string, status: number) => (error: unknown) => error instanceof AccountAccessError && error.code === code && error.status === status;

test("strict name-first contract normalizes Unicode, defaults English, rejects control characters, URLs as QIDs and extra authority fields", () => {
  assert.deepEqual(brandLookupInputSchema.parse({ operation: "search", query: " Cafe\u0301 " }), { operation: "search", query: "Café", locale: "en" });
  for (const value of [{ ...search, query: "  " }, { ...search, query: "x\nq" }, { ...search, query: "x".repeat(101) }, { ...search, locale: "de" },
    { ...profile, entity_id: "https://127.0.0.1" }, { ...profile, entity_id: "Q0" }, { ...search, verified_score: 99 }]) assert.equal(brandLookupInputSchema.safeParse(value).success, false);
});
test("search preserves ambiguous identities and never chooses one or invents an index", async () => {
  const result = await runner(matches)(search);
  assert.equal(result.operation, "search");
  if (result.operation !== "search") return;
  assert.equal(result.status, "matches"); assert.equal(result.candidates.length, 2); assert.equal(result.verified_index, null); assert.equal(result.has_more, true);
  assert.equal(result.candidates[1].entity_id, "Q18587732"); assert.equal(result.coverage, "wikidata_only");
});
test("valid empty results are no_matches, malformed responses and provider errors are not", async () => {
  const empty = await runner({ success: 1, search: [] })(search);
  assert.equal(empty.operation === "search" && empty.status, "no_matches");
  for (const value of [{}, { success: 1 }, { success: 1, search: "none" }, { success: 0, search: [] },
    { success: 1, search: [{ id: "Q0", label: "Invalid" }] }, { success: 1, search: [matches.search[0], matches.search[0]] },
    { success: 1, error: { code: "badvalue" }, search: [] }]) await assert.rejects(runner(value)(search), errorCode("lookup_unavailable", 503));
});
test("only the fixed official API is requested, with contact UA, maxlag, no redirects or credentials", async () => {
  const execute = createBrandLookupExecutor({ reserve: noBudget, now: () => NOW, fetch: async (url, init) => {
    const parsed = new URL(String(url)); assert.equal(parsed.origin + parsed.pathname, "https://www.wikidata.org/w/api.php");
    assert.equal(parsed.searchParams.get("search"), "a&ids=Q1"); assert.equal(parsed.searchParams.get("maxlag"), "5");
    assert.equal(init?.method, "GET"); assert.equal(init?.redirect, "manual");
    assert.match(String((init?.headers as Record<string, string>)["User-Agent"]), /Sajda.*dev@hypbit.com/u);
    assert.equal((init?.headers as Record<string, string>).Authorization, undefined);
    return json({ success: 1, search: [] });
  } });
  await execute({ ...search, query: "a&ids=Q1" });
});
test("profiles distinguish dated source assertions from ownership, availability and legal clearance", async () => {
  const result = await runner(entity({ P856: [statement("P856", "https://www.ikea.com")], P2002: [statement("P2002", "IKEA")], P4264: [statement("P4264", "ikea")] }))(profile);
  assert.equal(result.operation, "profile"); if (result.operation !== "profile") return;
  assert.equal(result.index.score, null); assert.equal(result.index.verified_assertions, 0);
  assert.equal(result.entity.revision_id, 123); assert.equal(result.entity.source_modified_at, "2026-09-01T01:00:00.000Z");
  assert.notEqual(result.retrieved_at, result.entity.source_modified_at);
  assert.ok(result.assertions.every(row => row.classification === "DATABASE_ASSERTION" && row.relationship === "not_verified"));
  assert.equal(result.assertions[2].url, null); // No invented LinkedIn /company route.
  assert.equal(result.limitations.length, 5); assert.equal(brandLookupResultSchema.safeParse({ ...result, index: { ...result.index, score: 99 } }).success, false);
});
test("source URLs never trigger outgoing fetches and unsafe website values cannot become executable links", async () => {
  let calls = 0;
  const execute = createBrandLookupExecutor({ reserve: noBudget, now: () => NOW, fetch: async () => { calls++; return json(entity({ P856:
    ["javascript:alert(1)", "http://example.com", "https://127.0.0.1", "https://user:pass@example.com", "https://example.com:9000"].map(value => statement("P856", value)) })); } });
  const result = await execute(profile);
  assert.equal(calls, 1); assert.equal(result.operation, "profile");
  if (result.operation === "profile") assert.ok(result.assertions.every(row => row.url === null));
});
test("deprecated, ended, unknown date and future-start statements are excluded, qualifier presence remains visible", async () => {
  const time = (value: string) => [{ datavalue: { value: { time: value, precision: 11, calendarmodel: "http://www.wikidata.org/entity/Q1985727" } } }];
  const result = await runner(entity({ P2002: [
    statement("P2002", "old", { rank: "deprecated" }), statement("P2002", "ended", { qualifiers: { P582: time("+2025-01-01T00:00:00Z") } }),
    statement("P2002", "future", { qualifiers: { P580: time("+2030-01-01T00:00:00Z") } }), statement("P2002", "uncertain", { qualifiers: { P580: [{ snaktype: "somevalue" }] } }),
    statement("P2002", "dated", { qualifiers: { P580: time("+2020-01-01T00:00:00Z") } }), statement("P2002", "qualified", { qualifiers: { P407: [{}] } }),
  ] }))(profile);
  if (result.operation !== "profile") throw Error("wrong operation");
  assert.deepEqual(result.assertions.map(row => row.value), ["dated", "qualified"]); assert.equal(result.truncated, true);
  assert.ok(result.assertions.every(row => row.has_qualifiers && row.temporal_status === "not_established"));
});
test("duplicate assertions are deduplicated and over20 results explicitly marked incomplete", async () => {
  const result = await runner(entity({ P2002: [statement("P2002", "same"), statement("P2002", "same"), ...Array.from({ length: 25 }, (_, i) => statement("P2002", `name${i}`))] }))(profile);
  if (result.operation !== "profile") throw Error("wrong operation");
  assert.equal(result.assertions.length, 20); assert.equal(result.truncated, true);
});
test("mismatched echoed searches and cyclic, ambiguous or unfinished redirects fail closed", async () => {
  await assert.rejects(runner({ success: 1, searchinfo: { search: "NOT_THE_REQUEST" }, search: [] })(search), errorCode("lookup_unavailable", 503));
  for (const redirects of [[{ from: "Q1", to: "Q54078" }, { from: "Q54078", to: "Q1" }],
    [{ from: "Q1", to: "Q54078" }, { from: "Q1", to: "Q3" }],
    Array.from({ length: 6 }, (_, i) => ({ from: `Q${i + 1}`, to: `Q${i + 2}` }))]) {
    await assert.rejects(runner({ ...entity(), redirects })({ ...profile, entity_id: "Q1" }), errorCode("lookup_unavailable", 503));
  }
});
test("malformed qualifiers cannot silently become unqualified assertions", async () => {
  for (const qualifiers of ["broken", { P580: "broken" }, { P580: [] }, { invalid: [{}] }]) {
    const result = await runner(entity({ P2002: [statement("P2002", "uncertain", { qualifiers })] }))(profile);
    if (result.operation !== "profile") throw Error("wrong operation");
    assert.equal(result.assertions.length, 0); assert.equal(result.truncated, true);
  }
});
test("missing entity is404, a wrongly bound entity503, and explicit redirects preserve the requested and canonical IDs", async () => {
  await assert.rejects(runner({ success: 1, entities: { Q54078: { id: "Q54078", missing: "" } } })(profile), errorCode("profile_not_found", 404));
  const wrong = entity(); wrong.entities.Q54078.id = "Q2";
  await assert.rejects(runner(wrong)(profile), errorCode("lookup_unavailable", 503));
  const canonical = entity().entities.Q54078;
  const result = await runner({ success: 1, redirects: [{ from: "Q1", to: "Q54078" }], entities: { Q54078: canonical } })({ ...profile, entity_id: "Q1" });
  if (result.operation !== "profile") throw Error("wrong operation");
  assert.equal(result.requested_entity_id, "Q1"); assert.equal(result.entity.entity_id, "Q54078");
});
test("singleflight and bounded TTL cache preserve original retrieval dates and isolate returned objects", async () => {
  let now = NOW, calls = 0, reservations = 0;
  const execute = createBrandLookupExecutor({ now: () => now, reserve: async () => { reservations++; return noBudget(); }, fetch: async url => { calls++; return json(searchResponse(url)); } });
  const [a, b] = await Promise.all([execute(search), execute(search)]);
  assert.equal(calls, 2); assert.equal(reservations, 1); assert.notEqual(a, b);
  if (a.operation === "search") a.candidates[0].name = "Mutated";
  now += 20_000;
  const cached = await execute(search); assert.equal(cached.retrieved_at, b.retrieved_at); assert.equal(calls, 2);
  assert.equal(cached.operation === "search" && cached.candidates[0].name, "IKEA");
  now += 300_000; await execute(search); assert.equal(calls, 4);
});
test("invalid input and cache hits never reserve provider budget; failed requests are never cached", async () => {
  let calls = 0;
  const execute = createBrandLookupExecutor({ reserve: noBudget, fetch: async () => { calls++; return json({}, 500); } });
  await assert.rejects(execute({ operation: "search", query: "" }), errorCode("invalid_request", 400)); assert.equal(calls, 0);
  await assert.rejects(execute(search), errorCode("lookup_unavailable", 503)); await assert.rejects(execute(search), errorCode("lookup_unavailable", 503)); assert.equal(calls, 2);
});

test("classification requests are charged upfront without increasing the upstream hourly ceiling", async () => {
  let now = NOW;
  const reserve = createBrandLookupBudget({ now: () => now, maxPerHour: 3 });
  const execute = createBrandLookupExecutor({ now: () => now, reserve, fetch: async url => json(searchResponse(url)) });
  await execute(search); // two units: search plus classification
  now += 1000;
  await assert.rejects(execute({ ...search, query: "Other" }), errorCode("rate_limited", 429));
  const remaining = await reserve(1); await remaining.release();
  now += 1000;
  await assert.rejects(reserve(), errorCode("rate_limited", 429));
});
test("429,503 and maxlag respect backoff, always release, and never retry automatically", async () => {
  for (const response of [() => json({}, 429, { "retry-after": "120" }), () => json({}, 503, { "retry-after": "120" }), () => json({ error: { code: "maxlag" } }, 200, { "retry-after": "120" })]) {
    let calls = 0, released = 0; const cooldown: number[] = [];
    const execute = createBrandLookupExecutor({ now: () => NOW, reserve: async () => ({ release: async () => { released++; }, backoff: async seconds => { cooldown.push(seconds); } }), fetch: async () => { calls++; return response(); } });
    await assert.rejects(execute(search), errorCode("lookup_unavailable", 503)); assert.deepEqual(cooldown, [120]); assert.equal(released, 1); assert.equal(calls, 1);
  }
});
test("provider Retry-After beyond one day blocks real gate admission until the full deadline", async () => {
  for (const header of ["172800", new Date(NOW + 172_800_000).toUTCString()]) {
    let now = NOW, calls = 0;
    const execute = createBrandLookupExecutor({ now: () => now, reserve: createBrandLookupBudget({ now: () => now }),
      fetch: async url => { calls++; return calls === 1 ? json({}, 429, { "retry-after": header }) : json(searchResponse(url)); } });
    await assert.rejects(execute(search), errorCode("lookup_unavailable", 503));
    for (const elapsed of [86_400_000, 172_799_999]) {
      now = NOW + elapsed;
      await assert.rejects(execute(search), errorCode("rate_limited", 429));
    }
    assert.equal(calls, 1, "No upstream call is allowed at the former one-day clamp");
    now = NOW + 172_800_000;
    await execute(search);
    assert.equal(calls, 3);
  }
});

test("search excludes humans and unclassified records before returning or caching names", async () => {
  const candidates = { success: 1, search: [
    { id: "Q1", label: "Person", description: "Private social identity" },
    { id: "Q2", label: "Company" }, { id: "Q3", label: "Unclassified" },
  ] };
  const classifications = { success: 1, entities: {
    Q1: { id: "Q1", type: "item", claims: { P31: [typeClaim("Q5")] } },
    Q2: { id: "Q2", type: "item", claims: { P31: [typeClaim()] } },
    Q3: { id: "Q3", type: "item", claims: {} },
  } };
  let calls = 0;
  const execute = createBrandLookupExecutor({ now: () => NOW, reserve: noBudget, fetch: async url => {
    calls++; const params = new URL(String(url)).searchParams;
    if (params.get("action") === "wbgetentities") {
      assert.equal(params.get("ids"), "Q1|Q2|Q3"); assert.equal(params.get("props"), "claims");
      return json(classifications);
    }
    return json(candidates);
  } });
  for (const result of [await execute(search), await execute(search)]) {
    assert.equal(result.operation, "search");
    if (result.operation === "search") assert.deepEqual(result.candidates.map(row => row.entity_id), ["Q2"]);
    assert.doesNotMatch(JSON.stringify(result), /Person|Private social|Unclassified/u);
  }
  assert.equal(calls, 2, "Only the filtered result is cached");
});

test("direct and redirected human profiles and missing or malformed types fail closed", async () => {
  for (const P31 of [undefined, [], "invalid", [{}], [typeClaim("Q5")],
    [typeClaim(), typeClaim("Q5")], [{ ...typeClaim("Q5"), rank: "deprecated" }],
    [{ ...typeClaim(), rank: "deprecated" }]]) {
    const body = entity({ P31, P2002: [statement("P2002", "private_person")] });
    await assert.rejects(runner(body)(profile), errorCode("profile_not_found", 404));
    await assert.rejects(runner({ ...body, redirects: [{ from: "Q1", to: "Q54078" }] })({ ...profile, entity_id: "Q1" }), errorCode("profile_not_found", 404));
  }
});

test("search classification failures never expose unfiltered matches and apply provider cooldown", async () => {
  for (const response of [() => json({}, 503, { "retry-after": "120" }), () => json({ success: 1 }),
    () => json({ success: 1, entities: { Q54078: { id: "Q2", type: "item", claims: { P31: [typeClaim()] } } } })]) {
    let calls = 0, releases = 0; const cooldown: number[] = [];
    const execute = createBrandLookupExecutor({ now: () => NOW,
      reserve: async () => ({ release: async () => { releases++; }, backoff: async seconds => { cooldown.push(seconds); } }),
      fetch: async () => ++calls % 2 === 1 ? json(matches) : response(),
    });
    await assert.rejects(execute(search), errorCode("lookup_unavailable", 503));
    await assert.rejects(execute(search), errorCode("lookup_unavailable", 503));
    assert.equal(calls, 4); assert.equal(releases, 2);
    if (cooldown.length) assert.deepEqual(cooldown, [120, 120]);
  }
});

test("overflowing numeric Retry-After saturates the real gate instead of falling back to a short retry", async () => {
  let now = NOW, calls = 0;
  const execute = createBrandLookupExecutor({ now: () => now, reserve: createBrandLookupBudget({ now: () => now }),
    fetch: async () => { calls++; return json({}, 503, { "retry-after": "9".repeat(400) }); } });
  await assert.rejects(execute(search), errorCode("lookup_unavailable", 503));
  now = Number.MAX_SAFE_INTEGER - 86_400_000;
  await assert.rejects(execute(search), errorCode("rate_limited", 429));
  assert.equal(calls, 1);
});

test("timeouts abort the request and release the provider lease", async () => {
  let signal: AbortSignal | null | undefined; let released = 0;
  const execute = createBrandLookupExecutor({ timeoutMs: 10, reserve: async () => ({ release: async () => { released++; }, backoff: async () => {} }),
    fetch: async (_url, init) => { signal = init?.signal; return new Promise<Response>(() => {}); } });
  await assert.rejects(execute(search), errorCode("lookup_unavailable", 503)); assert.equal(signal?.aborted, true); assert.equal(released, 1);
});
test("redirects, HTML, oversized and malformed streaming JSON responses fail closed", async () => {
  for (const response of [() => json({}, 302), () => new Response("<html>blocked</html>"), () => json({}, 200, { "content-length": "1048577" }),
    () => new Response("{", { headers: { "content-type": "application/json" } }), () => new Response("x".repeat(1_048_577), { headers: { "content-type": "application/json" } })]) {
    const execute = createBrandLookupExecutor({ reserve: noBudget, fetch: async () => response() });
    await assert.rejects(execute(search), errorCode("lookup_unavailable", 503));
  }
});
