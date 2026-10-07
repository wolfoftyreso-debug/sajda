import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createBrandReportsHandler } from "../api/account/brand-reports.js";
import { createBrandReportsStore, type BrandReportsClient } from "../api/_shared/brand-reports-store.js";
import { AccountAccessError } from "../api/_shared/account-error.js";
import { BRAND_REPORT_LIMIT, BRAND_REPORT_VERSION_LIMIT, brandReportSaveSchema, brandReportSnapshotSchema,
  type BrandReportSaveInput } from "../shared/brand-reports.js";
import { buildBrandIndexTargets, type BrandIndexInput } from "../shared/brand-presence-index.js";
import { NAME_PACKAGE_MARKET_CODES } from "../shared/name-package-markets.js";

const firstAt = "2026-10-07T12:00:00.000Z";
function assessment(): BrandIndexInput {
  return { brand_name: "Aurora", identity_label: "aurora", primary_domain: "aurora.com", domains: ["aurora.com"],
    socials: [{ platform: "github", handle: "aurora" }], markets: ["SE"], observations: [
      { target_id: "domain:aurora.com", status: "reported_owned", source_url: "https://aurora.com/about", reported_at: firstAt },
      { target_id: "social:github:aurora", status: "reported_authorized", source_url: "https://github.com/aurora", reported_at: firstAt },
      { target_id: "market:SE", status: "reported_owned", source_url: null, reported_at: firstAt },
    ] };
}
function report(overrides: Partial<BrandReportSaveInput> = {}): BrandReportSaveInput {
  return { id: randomUUID(), requestKey: randomUUID(), expectedVersion: 0, title: "Aurora launch", assessment: assessment(), ...overrides };
}
function fixture() {
  let reports = new Map<string, Record<string, unknown>>(), versions = new Map<string, Record<string, unknown>>(),
    requests = new Map<string, Record<string, unknown>>();
  let backup = { reports: structuredClone(reports), versions: structuredClone(versions), requests: structuredClone(requests) };
  let now = Date.parse(firstAt), rate = 1, failMarker = "", ambiguousCommit = false, rollbackFails = false;
  const owners = new Set(["owner-a", "owner-b"]), calls: { sql: string; values: unknown[] }[] = [], releases: boolean[] = [];
  const key = (values: unknown[]) => `${values[1]}:${values[0]}:${values[2]}`;
  const owned = (rows: Map<string, Record<string, unknown>>, values: unknown[]) => [...rows.values()]
    .filter(row => row.owner_id === values[0] && row.namespace === values[1]);
  const client: BrandReportsClient = { release(destroy) { releases.push(Boolean(destroy)); }, async query(sql, values = []) {
    calls.push({ sql, values });
    if (sql === "BEGIN" || sql === "BEGIN READ ONLY") {
      backup = { reports: structuredClone(reports), versions: structuredClone(versions), requests: structuredClone(requests) };
      return { rows: [] };
    }
    if (sql === "ROLLBACK") {
      if (rollbackFails) throw new Error("fixture connection lost");
      reports = backup.reports; versions = backup.versions; requests = backup.requests; return { rows: [] };
    }
    if (failMarker && sql.includes(failMarker)) {
      if (sql === "COMMIT" && ambiguousCommit) {
        backup = { reports: structuredClone(reports), versions: structuredClone(versions), requests: structuredClone(requests) };
      }
      throw new Error("postgres://secret private database failure");
    }
    if (sql === "COMMIT" || sql.startsWith("SET LOCAL") || sql.includes("brand-reports:lock")) return { rows: [] };
    if (sql.includes("brand-reports:owner")) return { rows: owners.has(String(values[0])) ? [{ owner_id: values[0] }] : [] };
    if (sql.includes("brand-reports:limit")) return { rows: [{ request_count: rate }] };
    if (sql.includes("brand-reports:list")) return { rows: owned(reports, values).slice(0, Number(values[2])).map(row => structuredClone(row)) };
    if (sql.includes("brand-reports:count")) return { rows: [{ count: owned(reports, values).length }] };
    if (sql.includes("brand-reports:current")) {
      const row = reports.get(key(values)); return { rows: row ? [structuredClone(row)] : [] };
    }
    if (sql.includes("brand-reports:receipt")) {
      const receipt = requests.get(key(values));
      const saved = receipt ? versions.get(`${values[1]}:${values[0]}:${receipt.report_id}:${receipt.version}`) : null;
      return { rows: saved ? [{ ...structuredClone(saved), input_hash: receipt!.input_hash }] : [] };
    }
    if (sql.includes("brand-reports:get")) {
      const header = reports.get(key(values));
      const saved = header ? versions.get(`${key(values)}:${values[3] ?? header.version}`) : undefined;
      return { rows: saved ? [structuredClone(saved)] : [] };
    }
    if (sql.includes("brand-reports:history")) return { rows: owned(versions, values).filter(row => row.report_id === values[2])
      .sort((a, b) => Number(b.version) - Number(a.version)).slice(0, Number(values[3])).map(row => structuredClone(row)) };
    if (sql.includes("brand-reports:insert") || sql.includes("brand-reports:update")) {
      const previous = reports.get(key(values));
      if (sql.includes("brand-reports:update") && (!previous || previous.version !== values[5])) return { rows: [] };
      reports.set(key(values), { namespace: values[1], owner_id: values[0], id: values[2], title: values[3], version: values[4],
        created_at: previous?.created_at ?? new Date(now), updated_at: new Date(now) });
      return { rows: [{ id: values[2] }] };
    }
    if (sql.includes("brand-reports:version")) {
      const row = { namespace: values[1], owner_id: values[0], report_id: values[2], version: values[3], title: values[4],
        assessment: JSON.parse(String(values[5])), saved_at: new Date(now) };
      versions.set(`${key(values)}:${values[3]}`, row); return { rows: [structuredClone(row)] };
    }
    if (sql.includes("brand-reports:record-receipt")) {
      requests.set(key(values), { namespace: values[1], owner_id: values[0], request_key: values[2], report_id: values[3], version: values[4], input_hash: values[5] });
      return { rows: [{ request_key: values[2] }] };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  } };
  const makeStore = (namespace = "development") => createBrandReportsStore({ pool: { connect: async () => client },
    environment: () => ({ VERCEL: "1", VERCEL_ENV: namespace }), now: () => now });
  return { store: makeStore(), makeStore, calls, owners, releases, reports: () => reports, versions: () => versions, requests: () => requests,
    time: (value: number) => { now = value; }, rate: (value: number) => { rate = value; },
    fail: (marker: string, commit = false, rollback = false) => { failMarker = marker; ambiguousCommit = commit; rollbackFails = rollback; } };
}

test("brand report input accepts original declarations but rejects any asserted score, provider evidence or owner", () => {
  const valid = report({ title: "  Café 🧭  " });
  assert.equal(brandReportSaveSchema.parse(valid).title, "Café 🧭");
  assert.equal(brandReportSaveSchema.parse(valid).assessment.observations[0].reported_at, firstAt);
  for (const input of [
    { ...valid, title: " " }, { ...valid, title: "x".repeat(121) }, { ...valid, id: "wrong" }, { ...valid, requestKey: "wrong" },
    { ...valid, expectedVersion: -1 }, { ...valid, expectedVersion: 1.5 }, { ...valid, expectedVersion: 101 },
    { ...valid, ownerId: "victim" }, { ...valid, accountId: "victim" }, { ...valid, verified_score: 99 },
    { ...valid, result: {} }, { ...valid, evidence: [] }, { ...valid, domainRows: [] },
    { ...valid, assessment: { ...valid.assessment, score: 99 } },
    { ...valid, assessment: { ...valid.assessment, observations: [{ ...valid.assessment.observations[0], verified_at: firstAt }] } },
    { ...valid, assessment: { ...valid.assessment, observations: [{ ...valid.assessment.observations[0], status: "verified_owned" }] } },
    { ...valid, assessment: { ...valid.assessment, observations: [{ ...valid.assessment.observations[0], target_id: "domain:foreign.com" }] } },
  ]) assert.equal(brandReportSaveSchema.safeParse(input).success, false, JSON.stringify(input));
  for (const malformed of ["NUL\u0000text", "lone\ud800", "lone\udc00", "\ud800x\udc00"]) {
    assert.equal(brandReportSaveSchema.safeParse({ ...valid, title: malformed }).success, false);
    assert.equal(brandReportSaveSchema.safeParse({ ...valid, assessment: { ...valid.assessment, brand_name: malformed } }).success, false);
  }
});

test("brand reports persist exact original dates, source URLs and immutable revisions", async () => {
  const f = fixture(), input = report();
  const first = await f.store.save("owner-a", input);
  assert.equal(first.version, 1); assert.equal(first.title, input.title);
  assert.deepEqual(first.assessment, input.assessment);
  assert.equal(first.result.index.classification, "SELF_ASSESSMENT"); assert.equal(first.result.index.verified_score, null);
  assert.equal(first.result.index.reported_score, 100);
  assert.deepEqual(await f.store.get("owner-a", { id: input.id }), first);
  assert.deepEqual(await f.store.save("owner-a", input), first);
  f.time(Date.parse(firstAt) + 60_000);
  const edit = { ...input, requestKey: randomUUID(), expectedVersion: 1, title: "Second revision" };
  const second = await f.store.save("owner-a", edit);
  assert.equal(second.version, 2); assert.equal(second.title, edit.title);
  const replay = await f.store.save("owner-a", input);
  assert.equal(replay.version, 1); assert.equal(replay.title, input.title); assert.equal(replay.savedAt, first.savedAt);
  assert.deepEqual(replay.assessment, first.assessment);
  assert.equal((await f.store.get("owner-a", { id: input.id })).version, 2, "Late replay never restores stale data");
  assert.deepEqual(await f.store.get("owner-a", { id: input.id, version: 1 }), replay);
  const history = await f.store.history("owner-a", input.id);
  assert.deepEqual(history.map(value => value.version), [2, 1]);
  assert.equal(history[1].savedAt, first.savedAt);
  const list = await f.store.list("owner-a");
  assert.equal(list[0].createdAt, first.savedAt); assert.equal(list[0].updatedAt, second.savedAt);
  assert.equal(f.requests().size, 2); assert.equal(f.versions().size, 2);
  const lock = f.calls.findIndex(call => call.sql.includes("brand-reports:lock"));
  const receipt = f.calls.findIndex(call => call.sql.includes("brand-reports:receipt"));
  assert.ok(lock >= 0 && receipt > lock, "Account lock precedes request replay/capacity/version checks");
});

test("brand report reading and resaving ages evidence instead of renewing it or converting unknown into verification", async () => {
  const f = fixture(), input = report();
  const original = await f.store.save("owner-a", input);
  f.time(Date.parse(firstAt) + 31 * 24 * 60 * 60 * 1000);
  const loaded = await f.store.get("owner-a", { id: input.id });
  assert.equal(loaded.savedAt, original.savedAt);
  assert.deepEqual(loaded.assessment, original.assessment);
  assert.equal(loaded.result.index.reported_score, null);
  assert.equal(loaded.result.counts.stale, 3);
  assert.ok(loaded.result.targets.every(target => target.classification === "USER_SUPPLIED" && target.status_freshness === "stale"));
  const saved = await f.store.save("owner-a", { ...input, requestKey: randomUUID(), expectedVersion: 1 });
  assert.deepEqual(saved.assessment, original.assessment); assert.equal(saved.result.index.reported_score, null);
  assert.ok(saved.result.targets.every(target => target.reported_at === firstAt));
  const unknown = await f.store.save("owner-a", report({ assessment: { ...assessment(), observations: [] } }));
  assert.ok(unknown.result.targets.every(target => target.reported_status === "unknown" && target.reported_at === null));
  assert.equal(unknown.result.index.verified_score, null);
  f.time(Date.parse(firstAt) - 1);
  assert.ok((await f.store.get("owner-a", { id: input.id })).result.targets.every(target => target.status_freshness === "future"));
});

test("valid but oversized UTF-8 declarations are rejected before starting a database write", async () => {
  const f = fixture(), expanded: BrandIndexInput = { ...assessment(), primary_domain: "aurora0.com",
    domains: Array.from({ length: 20 }, (_, index) => `aurora${index}.com`), markets: [...NAME_PACKAGE_MARKET_CODES], observations: [] };
  expanded.observations = buildBrandIndexTargets(expanded).map(target => ({ target_id: target.id, status: "unknown",
    reported_at: firstAt, source_url: `https://example.com/${"界".repeat(490)}` }));
  const input = report({ assessment: expanded });
  assert.equal(brandReportSaveSchema.safeParse(input).success, true, "The error is payload size, not an invented invalid domain or Unicode restriction");
  await assert.rejects(() => f.store.save("owner-a", input), { code: "request_too_large", status: 413 });
  assert.equal(f.calls.length, 0);
});

test("report request keys cannot be reused with different details, IDs or expected versions", async () => {
  const f = fixture(), input = report();
  await f.store.save("owner-a", input);
  for (const changed of [
    { ...input, title: "Changed" }, { ...input, expectedVersion: 1 }, { ...input, id: randomUUID() },
    { ...input, assessment: { ...input.assessment, brand_name: "Altered" } },
  ]) await assert.rejects(() => f.store.save("owner-a", changed), { code: "report_request_conflict", status: 409 });
  await assert.rejects(() => f.store.save("owner-a", { ...input, requestKey: randomUUID() }), { code: "report_conflict", status: 409 });
  assert.equal(f.versions().size, 1);
});

test("all report, version, history and request records isolate both owner and namespace", async () => {
  const f = fixture(), input = report();
  await f.store.save("owner-a", input);
  assert.deepEqual(await f.store.list("owner-b"), []);
  for (const run of [
    () => f.store.get("owner-b", { id: input.id }), () => f.store.get("owner-b", { id: input.id, version: 1 }),
    () => f.store.history("owner-b", input.id), () => f.store.save("owner-b", { ...input, expectedVersion: 1 }),
    () => f.makeStore("preview").get("owner-a", { id: input.id }),
  ]) await assert.rejects(run, { code: "report_not_found", status: 404 });
  assert.deepEqual(await f.makeStore("preview").list("owner-a"), []);
  assert.equal((await f.store.save("owner-b", input)).version, 1, "Same UUID/key in another account represents a separate report");
  assert.equal((await f.makeStore("preview").save("owner-a", input)).version, 1);
  assert.equal(f.requests().size, 3);
  await assert.rejects(() => f.makeStore("unknown").list("owner-a"), { code: "brand_reports_unavailable" });
});

test("report caps are explicit, do not truncate history, and allow receipts or existing edits at capacity", async () => {
  const f = fixture();
  const input = report(); await f.store.save("owner-a", input);
  for (let i = 1; i < BRAND_REPORT_LIMIT; i++) await f.store.save("owner-a", report());
  await assert.rejects(() => f.store.save("owner-a", report()), { code: "report_limit", status: 409 });
  assert.equal((await f.store.list("owner-a")).length, BRAND_REPORT_LIMIT);
  for (let version = 1; version < BRAND_REPORT_VERSION_LIMIT; version++) {
    await f.store.save("owner-a", { ...input, requestKey: randomUUID(), expectedVersion: version, title: `Revision ${version + 1}` });
  }
  await assert.rejects(() => f.store.save("owner-a", { ...input, requestKey: randomUUID(), expectedVersion: 100 }), { code: "report_version_limit" });
  assert.equal((await f.store.history("owner-a", input.id)).length, BRAND_REPORT_VERSION_LIMIT);
  assert.equal((await f.store.save("owner-a", input)).version, 1, "Capacity must not block an original receipt replay");
  assert.equal((await f.store.get("owner-a", { id: input.id })).version, 100);
});

test("failed receipt writes roll back all data; ambiguous committed writes safely return their original receipt", async () => {
  const f = fixture(), input = report();
  f.fail("brand-reports:record-receipt");
  await assert.rejects(() => f.store.save("owner-a", input), { code: "brand_reports_unavailable", status: 503 });
  assert.equal(f.reports().size, 0); assert.equal(f.versions().size, 0); assert.equal(f.requests().size, 0);
  f.fail("COMMIT", true);
  await assert.rejects(() => f.store.save("owner-a", input), { code: "brand_reports_unavailable" });
  assert.equal(f.versions().size, 1, "Simulate lost COMMIT acknowledgement after successful database commit");
  f.fail("");
  assert.equal((await f.store.save("owner-a", input)).version, 1);
  assert.equal(f.versions().size, 1); assert.equal(f.requests().size, 1);
  f.fail("brand-reports:get", false, true);
  await assert.rejects(() => f.store.get("owner-a", { id: input.id }), { code: "brand_reports_unavailable" });
  assert.equal(f.releases.at(-1), true);
});

test("storage revalidates verified identity and corrupt persisted declarations, and never leaks database failures", async () => {
  const f = fixture(), input = report();
  await assert.rejects(() => f.store.list(""), { code: "invalid_session" });
  await assert.rejects(() => f.store.save("unknown", input), { code: "invalid_session" });
  await f.store.save("owner-a", input);
  f.owners.delete("owner-a");
  await assert.rejects(() => f.store.list("owner-a"), { code: "invalid_session" });
  await assert.rejects(() => f.store.get("owner-a", { id: input.id }), { code: "invalid_session" });
  await assert.rejects(() => f.store.save("owner-a", input), { code: "invalid_session" });
  f.owners.add("owner-a");
  f.versions().values().next().value!.assessment = { ...assessment(), score: 99 };
  await assert.rejects(() => f.store.get("owner-a", { id: input.id }), { code: "brand_reports_unavailable" });
  const raw = { ...input, title: "bad\ud800" };
  const before = f.calls.length;
  await assert.rejects(() => f.store.save("owner-a", raw), { code: "invalid_request" });
  assert.equal(f.calls.length, before, "Invalid UTF-16 is rejected before opening a PostgreSQL transaction");
});

test("snapshot schema rejects an unrelated result even when it is a valid self-assessment result", async () => {
  const f = fixture(), original = await f.store.save("owner-a", report());
  const other = await f.store.save("owner-a", report({ assessment: { ...assessment(), brand_name: "Other" } }));
  assert.equal(brandReportSnapshotSchema.safeParse({ ...original, result: other.result }).success, false);
});

test("report rate limits commit denials and separate account/environment buckets", async () => {
  const f = fixture();
  await f.store.limit("owner-a"); await f.store.limit("owner-b"); await f.makeStore("preview").limit("owner-a");
  assert.equal(new Set(f.calls.filter(call => call.sql.includes("brand-reports:limit")).map(call => call.values[0])).size, 3);
  f.rate(61); await assert.rejects(() => f.store.limit("owner-a"), { code: "rate_limited", status: 429 });
  assert.equal(f.calls.at(-1)?.sql, "COMMIT");
  f.rate(NaN); await assert.rejects(() => f.store.limit("owner-a"), { code: "brand_reports_unavailable" });
});

const headers = { "content-type": "application/json", origin: "https://sajda.test" };
function response() { return { code: 0, data: undefined as unknown, headers: new Map<string, string | number>(),
  setHeader(name: string, value: string | number) { this.headers.set(name.toLowerCase(), value); },
  status(code: number) { this.code = code; return this; }, json(data: unknown) { this.data = data; } }; }
function apiFixture(overrides: Parameters<typeof createBrandReportsHandler>[0] = {}) {
  const f = fixture(), actions: string[] = [];
  const handler = createBrandReportsHandler({ enabled: () => true, authorize: async (_headers, options) => {
    assert.equal(options?.verifiedEmail, true); actions.push(`authorize:${options?.method}`); return { id: "owner-a", emailVerified: true };
  }, store: f.store, ...overrides });
  const call = async (method = "GET", body?: unknown, query?: Record<string, unknown>, url?: string) => {
    const res = response(); await handler({ method, headers, body, query, url }, res); return res;
  };
  return { handler, actions, call, f };
}

test("brand reports API is dark by default, requires verified identity and returns private owner-fenced responses", async () => {
  const dark = apiFixture({ enabled: () => false });
  assert.equal((await dark.call()).code, 404); assert.deepEqual(dark.actions, []); assert.equal(dark.f.calls.length, 0);
  const f = apiFixture(), input = report();
  const save = await f.call("POST", { report: input });
  assert.equal(save.code, 200); assert.equal((save.data as { accountId: string }).accountId, "owner-a");
  assert.equal((await f.call()).code, 200);
  assert.equal((await f.call("GET", undefined, { id: input.id })).code, 200);
  assert.equal((await f.call("GET", undefined, { id: input.id, version: "1" })).code, 200);
  assert.equal((await f.call("GET", undefined, { id: input.id, history: "true" })).code, 200);
  assert.equal((await f.call("GET", undefined, undefined, `/api/account/brand-reports?id=${input.id}&version=1`)).code, 200);
  assert.equal(save.headers.get("cache-control"), "private, no-store"); assert.equal(save.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.equal(save.headers.get("access-control-allow-origin"), undefined);
});

test("report API rejects selectors, duplicated query values, malformed JSON, excess fields and oversized bodies before storage", async () => {
  const f = apiFixture(), input = report();
  for (const query of [
    { ownerId: "victim" }, { id: input.id, history: "false" }, { id: input.id, history: "true", version: "1" },
    { id: input.id, version: "0" }, { id: input.id, version: "101" }, { id: input.id, version: "1.0" },
    { id: input.id, version: 1 }, { id: [input.id, input.id] }, { id: "wrong" }, { history: "true" },
  ]) assert.equal((await f.call("GET", undefined, query)).code, 400, JSON.stringify(query));
  assert.equal((await f.call("GET", undefined, undefined, `/api/account/brand-reports?id=${input.id}&id=${input.id}`)).code, 400);
  assert.equal((await f.call("POST", { report: input }, { id: input.id })).code, 400);
  for (const value of ["{", { report: input, userId: "victim" }, { report: { ...input, result: {} } }, { action: "save", report: input }]) {
    assert.equal((await f.call("POST", value)).code, 400);
  }
  assert.equal((await f.call("POST", "x".repeat(65_537))).code, 413);
  const wrongType = response(); await f.handler({ method: "POST", headers: { "content-type": "text/plain" }, body: {} }, wrongType);
  assert.equal(wrongType.code, 415);
  assert.equal((await f.call("DELETE")).code, 405);
  const malformed = response(); await f.handler({ method: "POST", headers, get body() { throw new SyntaxError("parser"); } }, malformed);
  assert.equal(malformed.code, 400);
  assert.equal(f.f.calls.length, 0, "No invalid request reaches the rate-limit counter or storage");
});

test("report API preserves account/conflict/rate errors and redacts unexpected provider failures", async () => {
  for (const [status, code] of [[401, "authentication_required"], [403, "invalid_origin"], [429, "rate_limited"], [409, "report_conflict"]] as const) {
    const f = apiFixture({ authorize: async () => { throw new AccountAccessError(code, status, "Retry safely."); } });
    const res = await f.call(); assert.equal(res.code, status); assert.equal(res.headers.get("retry-after"), status === 429 ? 60 : undefined);
    assert.equal(f.f.calls.length, 0);
  }
  const f = apiFixture({ authorize: async () => { throw new Error("postgres://secret SQL PII"); } });
  const res = await f.call(); assert.equal(res.code, 503); assert.doesNotMatch(JSON.stringify(res.data), /postgres|secret|SQL|PII/u);
});

test("brand report migration creates only additive owner-scoped immutable history with account-deletion cascades", () => {
  const sql = readFileSync(new URL("../db/migrations/0022_brand_reports.sql", import.meta.url), "utf8");
  assert.match(sql, /REFERENCES public.sajda_auth_user\(id\) ON DELETE CASCADE/u);
  assert.match(sql, /PRIMARY KEY \(namespace, owner_id, request_key\)/u);
  assert.match(sql, /UNIQUE \(namespace, owner_id, report_id, version\)/u);
  assert.match(sql, /REFERENCES sajda.brand_report_versions\(namespace, owner_id, report_id, version\) ON DELETE CASCADE/u);
  assert.equal((sql.match(/ENABLE ROW LEVEL SECURITY/gu) ?? []).length, 3);
  assert.match(sql, /BEFORE UPDATE ON sajda.brand_report_versions/u);
  assert.match(sql, /BEFORE UPDATE ON sajda.brand_report_requests/u);
  assert.doesNotMatch(sql, /DROP TABLE|DELETE FROM|UPDATE sajda\./u);
  const publicTools = readFileSync(new URL("../api/mcp/public.ts", import.meta.url), "utf8");
  assert.doesNotMatch(publicTools, /brand-reports|brandReports/u);
});
