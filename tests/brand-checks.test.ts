import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createBrandChecksHandler } from "../api/account/brand-checks.js";
import { createBrandChecksStore } from "../api/_shared/brand-checks-store.js";
import { AccountAccessError } from "../api/_shared/account-error.js";
import type { BrandReportsClient } from "../api/_shared/brand-reports-store.js";
import { BRAND_CHECK_PENDING_LEASE_MS, brandCheckRunSchema, brandChecksHistoryResponseSchema,
  brandChecksHistorySelectorSchema, brandChecksStartSchema } from "../shared/brand-checks.js";
import { brandRegistrySourceUrl, type BrandEvidenceEntry } from "../shared/brand-evidence.js";
import type { BrandIndexInput } from "../shared/brand-presence-index.js";
import { NAME_PACKAGE_EVIDENCE_MAX_AGE_MS } from "../shared/name-packages.js";

const initial = Date.parse("2026-10-07T12:00:00.000Z");
function declared(): BrandIndexInput {
  return { brand_name: "Example", identity_label: "example", primary_domain: "example.com", domains: ["example.com", "example.net"],
    socials: [{ platform: "github", handle: "example" }], markets: ["SE"], observations: [{ target_id: "domain:example.com",
      status: "reported_owned", reported_at: new Date(initial - 1000).toISOString(), source_url: "https://example.com/about" }] };
}
function entries(domains: readonly string[], at = initial): BrandEvidenceEntry[] {
  return domains.map(target => ({ id: `check:domain:${target}`, target, kind: "domain", state: "checked", freshness: "current",
    source_url: brandRegistrySourceUrl(target, "verisign-rdap", "rdap"),
    observed_at: new Date(at).toISOString(), statement: "domain_registered", origin: "provider_observation" }));
}
function fixture(checker?: (targets: readonly string[]) => Promise<BrandEvidenceEntry[]>) {
  let currentTime = initial, runs = new Map<string, Record<string, unknown>>(), locked = false;
  const waiters: (() => void)[] = [];
  let failMarker = "", ambiguousCommit = false, rate = 1;
  const reportId = randomUUID(), owners = new Set(["owner-a", "owner-b"]), declarations = new Map<string, Record<string, unknown>>(),
    versions = new Map<string, Record<string, unknown>>();
  const calls: { sql: string; values: unknown[] }[] = [], checked: readonly string[][] = [];
  function seed(owner = "owner-a", namespace = "development", version = 1, assessment = declared()) {
    const saved = { namespace, owner_id: owner, id: reportId, version, saved_version: version, assessment: structuredClone(assessment) };
    declarations.set(`${namespace}:${owner}:${reportId}`, saved);
    versions.set(`${namespace}:${owner}:${reportId}:${version}`, structuredClone(saved));
  }
  seed();
  const key = (values: unknown[]) => `${values[1]}:${values[0]}:${values[2]}`;
  const scoped = (values: unknown[]) => [...runs.values()].filter(row => row.owner_id === values[0] && row.namespace === values[1]);
  function savedRow(row: Record<string, unknown>) {
    const saved = versions.get(`${row.namespace}:${row.owner_id}:${row.report_id}:${row.report_version}`);
    return saved ? { ...structuredClone(row), assessment: structuredClone(saved.assessment) } : null;
  }
  const pool = { async connect(): Promise<BrandReportsClient> {
    let acquired = false, backup = structuredClone(runs);
    function releaseLock() {
      if (!acquired) return; acquired = false;
      const next = waiters.shift(); if (next) next(); else locked = false;
    }
    return { release() { releaseLock(); }, async query(sql, values = []) {
      calls.push({ sql, values });
      if (sql === "BEGIN") { backup = structuredClone(runs); return { rows: [] }; }
      if (sql === "ROLLBACK") { runs = backup; releaseLock(); return { rows: [] }; }
      if (failMarker && sql.includes(failMarker)) {
        if (sql === "COMMIT" && ambiguousCommit) backup = structuredClone(runs);
        throw new Error("postgres://private SQL secret");
      }
      if (sql === "COMMIT") { releaseLock(); return { rows: [] }; }
      if (sql.startsWith("SET LOCAL")) return { rows: [] };
      if (sql.includes("brand-checks:lock")) {
        if (locked) await new Promise<void>(resolve => waiters.push(resolve)); else locked = true;
        acquired = true; backup = structuredClone(runs); return { rows: [] };
      }
      if (sql.includes("brand-checks:owner")) return { rows: owners.has(String(values[0])) ? [{ owner_id: values[0] }] : [] };
      if (sql.includes("brand-checks:limit")) return { rows: [{ request_count: rate }] };
      if (sql.includes("brand-checks:report")) {
        const row = declarations.get(key(values));
        const saved = row ? versions.get(`${key(values)}:${values[3] ?? row.version}`) : null;
        return { rows: row && saved ? [{ ...structuredClone(row), saved_version: saved.saved_version, assessment: structuredClone(saved.assessment) }] : [] };
      }
      if (sql.includes("brand-checks:expire")) {
        for (const row of scoped(values).filter(row => row.report_id === values[2] && row.status === "pending" && Number(new Date(String(row.lease_expires_at))) <= currentTime)) {
          row.status = "failed"; row.completed_at = row.lease_expires_at; row.failure_code = "check_interrupted";
        }
        return { rows: [] };
      }
      if (sql.includes("brand-checks:receipt")) { const row = runs.get(key(values)); return { rows: row && savedRow(row) ? [savedRow(row)!] : [] }; }
      if (sql.includes("brand-checks:capacity")) {
        const all = scoped(values), day = new Date(currentTime).toISOString().slice(0, 10);
        return { rows: [{ report_total: all.filter(row => row.report_id === values[2]).length,
          pending: all.filter(row => row.report_id === values[2] && row.status === "pending").length,
          daily: all.filter(row => new Date(String(row.requested_at)).toISOString().startsWith(day)).length }] };
      }
      if (sql.includes("brand-checks:reserve")) {
        const row = { namespace: values[1], owner_id: values[0], id: values[2], report_id: values[3], report_version: values[4],
          input_hash: values[5], targets: JSON.parse(String(values[6])), methodology_version: values[7], status: "pending",
          requested_at: new Date(currentTime), lease_expires_at: new Date(currentTime + BRAND_CHECK_PENDING_LEASE_MS),
          completed_at: null, entries: [], failure_code: null };
        assert.equal(runs.has(key(values)), false); runs.set(key(values), row); return { rows: [{ id: values[2] }] };
      }
      if (sql.includes("brand-checks:complete")) {
        const row = runs.get(key(values));
        if (!row || row.status !== "pending" || row.report_id !== values[3] || row.report_version !== values[4]
          || row.input_hash !== values[8] || Number(new Date(String(row.lease_expires_at))) <= currentTime) return { rows: [] };
        row.status = values[5]; row.completed_at = new Date(currentTime); row.entries = JSON.parse(String(values[6])); row.failure_code = values[7];
        return { rows: [{ id: values[2] }] };
      }
      const selected = scoped(values).filter(row => row.report_id === values[2] && (values[3] === null || row.report_version === values[3]));
      if (sql.includes("brand-checks:history-count")) return { rows: [{ total: selected.length }] };
      if (sql.includes("brand-checks:history")) return { rows: selected.sort((a, b) => Number(new Date(String(b.requested_at))) - Number(new Date(String(a.requested_at)))
        || String(b.id).localeCompare(String(a.id))).slice(Number(values[4]), Number(values[4]) + Number(values[5])).map(row => savedRow(row)!) };
      throw new Error(`Unexpected SQL marker: ${sql.slice(0, 45)}`);
    } };
  } };
  const makeStore = (namespace = "development") => createBrandChecksStore({ pool, environment: () => ({ VERCEL: "1", VERCEL_ENV: namespace }),
    now: () => currentTime, checker: async targets => {
      assert.equal(locked, false, "External provider never runs while a database lock is held");
      assert.equal(calls.at(-1)?.sql, "COMMIT", "Reservation commit is acknowledged before provider work");
      (checked as string[][]).push([...targets]); return checker ? checker(targets) : entries(targets, currentTime);
    } });
  const input = () => ({ reportId, expectedVersion: Number(declarations.get(`development:owner-a:${reportId}`)!.version), requestKey: randomUUID() });
  return { store: makeStore(), makeStore, input, reportId, owners, calls, checked, declarations, seed,
    runs: () => runs, time(value: number) { currentTime = value; }, rate(value: number) { rate = value; },
    fail(marker: string, ambiguous = false) { failMarker = marker; ambiguousCommit = ambiguous; } };
}
const history = (reportId: string, version?: number, offset = 0, limit = 10) => ({ reportId, version, offset, limit });

test("registry starts accept only saved report identity and reject caller evidence, source URLs, owners and scores", () => {
  const f = fixture(), input = f.input();
  assert.deepEqual(brandChecksStartSchema.parse(input), input);
  for (const extra of [{ entries: [] }, { domains: ["evil.com"] }, { observations: [] }, { source_url: "https://evil.com/" },
    { ownerId: "victim" }, { score: 99 }, { verified_score: 99 }, { run: {} }, { report: input }]) {
    assert.equal(brandChecksStartSchema.safeParse({ ...input, ...extra }).success, false);
  }
  for (const expectedVersion of [0, 101, 1.1, NaN]) assert.equal(brandChecksStartSchema.safeParse({ ...input, expectedVersion }).success, false);
  assert.equal(brandChecksHistorySelectorSchema.safeParse({ reportId: f.reportId, offset: 100 }).success, false);
  assert.equal(brandChecksHistorySelectorSchema.safeParse({ reportId: f.reportId, limit: 21 }).success, false);
});

test("checks persist separate source history, exact canonical saved targets and provider dates without altering declarations", async () => {
  const f = fixture(), original = structuredClone(f.declarations), input = f.input();
  const run = await f.store.start("owner-a", input);
  assert.equal(run.status, "completed"); assert.equal(run.id, input.requestKey); assert.equal(run.reportVersion, 1);
  assert.deepEqual(f.checked, [["example.com", "example.net"]]); assert.deepEqual(f.declarations, original);
  assert.equal(run.entries[0].observed_at, new Date(initial).toISOString()); assert.equal(run.entries[0].state, "checked");
  assert.deepEqual(await f.store.start("owner-a", input), run); assert.equal(f.checked.length, 1);
  f.time(initial + NAME_PACKAGE_EVIDENCE_MAX_AGE_MS + 1);
  const page = await f.store.history("owner-a", history(f.reportId));
  assert.equal(page.runs[0].entries[0].freshness, "stale"); assert.equal(page.runs[0].entries[0].state, "unknown");
  assert.equal(page.runs[0].entries[0].observed_at, run.entries[0].observed_at);
  assert.equal(page.runs[0].entries[0].source_url, run.entries[0].source_url);
  assert.equal(page.runs[0].requestedAt, run.requestedAt); assert.equal(page.runs[0].completedAt, run.completedAt);
  assert.equal(f.checked.length, 1); assert.deepEqual(f.declarations, original);
  assert.equal(brandChecksHistoryResponseSchema.safeParse({ accountId: "owner-a", ...page, requestId: "req" }).success, true);
});

test("same-key concurrent retry receives pending without duplicate provider work; competing new key cannot bypass pending", async () => {
  let finish!: (value: BrandEvidenceEntry[]) => void, ready!: () => void;
  const waiting = new Promise<void>(resolve => { ready = resolve; });
  const f = fixture(async () => { ready(); return new Promise(resolve => { finish = resolve; }); }), input = f.input();
  const first = f.store.start("owner-a", input); await waiting;
  const retry = await f.store.start("owner-a", input); assert.equal(retry.status, "pending"); assert.deepEqual(retry.entries, []);
  await assert.rejects(() => f.store.start("owner-a", { ...input, requestKey: randomUUID() }), { code: "check_pending", status: 409 });
  finish(entries(["example.com", "example.net"])); assert.equal((await first).status, "completed");
  assert.equal(f.checked.length, 1); assert.equal(f.runs().size, 1);
});

test("request key reuse is rejected, new keys require latest version, late original receipt remains original", async () => {
  const f = fixture(), input = f.input(), original = await f.store.start("owner-a", input);
  f.seed("owner-a", "development", 2);
  assert.deepEqual(await f.store.start("owner-a", input), original, "Later report revisions do not change original check receipts");
  await assert.rejects(() => f.store.start("owner-a", { ...input, expectedVersion: 2 }), { code: "check_request_conflict" });
  await assert.rejects(() => f.store.start("owner-a", { ...input, reportId: randomUUID() }), { code: "check_request_conflict" });
  await assert.rejects(() => f.store.start("owner-a", { ...input, requestKey: randomUUID() }), { code: "report_conflict" });
  const second = await f.store.start("owner-a", f.input()); assert.equal(second.reportVersion, 2);
  assert.equal((await f.store.history("owner-a", history(f.reportId, 2))).total, 1);
  assert.equal((await f.store.history("owner-a", history(f.reportId))).total, 2);
});

test("changing saved domain scope during a check preserves its immutable original version and separately checks the new scope", async () => {
  let finish!: (value: BrandEvidenceEntry[]) => void, ready!: () => void, invocation = 0;
  const waiting = new Promise<void>(resolve => { ready = resolve; });
  const f = fixture(async targets => {
    if (++invocation === 1) { ready(); return new Promise(resolve => { finish = resolve; }); }
    return entries(targets);
  }), input = f.input();
  const firstPromise = f.store.start("owner-a", input); await waiting;
  f.seed("owner-a", "development", 2, { ...declared(), primary_domain: "changed.com", domains: ["changed.com"], observations: [] });
  finish(entries(["example.com", "example.net"])); const original = await firstPromise;
  assert.equal(original.reportVersion, 1); assert.deepEqual(original.entries.map(entry => entry.target), ["example.com", "example.net"]);
  assert.deepEqual(await f.store.start("owner-a", input), original);
  const changed = await f.store.start("owner-a", f.input());
  assert.equal(changed.reportVersion, 2); assert.deepEqual(changed.entries.map(entry => entry.target), ["changed.com"]);
  assert.deepEqual((await f.store.history("owner-a", history(f.reportId, 1))).runs[0], original);
  assert.deepEqual((await f.store.history("owner-a", history(f.reportId, 2))).runs[0], changed);
  assert.deepEqual(f.checked, [["example.com", "example.net"], ["changed.com"]]);
});

test("every history and reservation isolates owner and environment; unverified identity fails closed", async () => {
  const f = fixture(), input = f.input(); await f.store.start("owner-a", input);
  for (const run of [() => f.store.history("owner-b", history(f.reportId)), () => f.store.start("owner-b", input),
    () => f.makeStore("preview").history("owner-a", history(f.reportId)), () => f.makeStore("preview").start("owner-a", input)]) {
    await assert.rejects(run, { code: "report_not_found", status: 404 });
  }
  f.seed("owner-b"); assert.equal((await f.store.start("owner-b", input)).status, "completed");
  f.seed("owner-a", "preview"); assert.equal((await f.makeStore("preview").start("owner-a", input)).status, "completed");
  assert.equal(f.runs().size, 3);
  f.owners.delete("owner-a"); await assert.rejects(() => f.store.history("owner-a", history(f.reportId)), { code: "invalid_session" });
  await assert.rejects(() => f.store.start("owner-a", input), { code: "invalid_session" });
  await assert.rejects(() => f.makeStore("wrong").history("owner-b", history(f.reportId)), { code: "brand_checks_unavailable" });
});

test("ambiguous initial commit never invokes a provider; expiry is terminal and late provider completion cannot revive it", async () => {
  const f = fixture(), input = f.input(); f.fail("COMMIT", true);
  await assert.rejects(() => f.store.start("owner-a", input), { code: "brand_checks_unavailable", status: 503 });
  assert.equal(f.checked.length, 0); assert.equal(f.runs().size, 1);
  f.fail(""); assert.equal((await f.store.start("owner-a", input)).status, "pending"); assert.equal(f.checked.length, 0);
  f.time(initial + BRAND_CHECK_PENDING_LEASE_MS);
  const expired = (await f.store.history("owner-a", history(f.reportId))).runs[0];
  assert.equal(expired.status, "failed"); assert.equal(expired.failureCode, "check_interrupted"); assert.deepEqual(expired.entries, []);
  assert.deepEqual(await f.store.start("owner-a", input), expired); assert.equal(f.checked.length, 0);

  let finish!: (value: BrandEvidenceEntry[]) => void, ready!: () => void;
  const waiting = new Promise<void>(resolve => { ready = resolve; });
  const slow = fixture(async () => { ready(); return new Promise(resolve => { finish = resolve; }); }), slowInput = slow.input();
  const pending = slow.store.start("owner-a", slowInput); await waiting; slow.time(initial + BRAND_CHECK_PENDING_LEASE_MS + 1);
  const interrupted = (await slow.store.history("owner-a", history(slow.reportId))).runs[0];
  finish(entries(["example.com", "example.net"])); assert.deepEqual(await pending, interrupted);
  assert.equal(interrupted.status, "failed"); assert.equal(slow.checked.length, 1);
});

test("provider failures and forged/internal mismatched observations retain failed runs with no verified results", async () => {
  for (const malformed of [entries(["other.com"]), [...entries(["example.com", "example.net"]), ...entries(["other.com"])],
    entries(["example.com", "example.net"]).map(entry => ({ ...entry, source_url: "https://example.com/fake-proof" })),
    entries(["example.com", "example.net"]).map(entry => ({ ...entry, owner_verified: true }))]) {
    const f = fixture(async () => malformed), input = f.input(), run = await f.store.start("owner-a", input);
    assert.equal(run.status, "failed"); assert.equal(run.failureCode, "invalid_evidence"); assert.deepEqual(run.entries, []);
    assert.deepEqual(await f.store.start("owner-a", input), run); assert.equal(f.checked.length, 1);
  }
  const f = fixture(async () => { throw new Error("secret provider response"); });
  const run = await f.store.start("owner-a", f.input()); assert.equal(run.failureCode, "provider_unavailable"); assert.deepEqual(run.entries, []);
  assert.doesNotMatch(JSON.stringify(run), /secret provider/u);
});

test("record and UTC daily caps are explicit; replay and history remain accessible at capacity", async () => {
  const f = fixture(), firstInput = f.input(), first = await f.store.start("owner-a", firstInput);
  for (let index = 1; index < 10; index++) { f.time(initial + index); await f.store.start("owner-a", f.input()); }
  await assert.rejects(() => f.store.start("owner-a", f.input()), { code: "check_daily_limit", status: 429 });
  assert.equal((await f.store.history("owner-a", history(f.reportId))).total, 10);
  assert.equal((await f.store.start("owner-a", firstInput)).id, first.id);
  for (let day = 1; day < 10; day++) for (let index = 0; index < 10; index++) {
    f.time(initial + day * 86400000 + index); await f.store.start("owner-a", f.input());
  }
  f.time(initial + 10 * 86400000);
  await assert.rejects(() => f.store.start("owner-a", f.input()), { code: "check_limit_reached", status: 409 });
  const page = await f.store.history("owner-a", history(f.reportId, undefined, 90, 10));
  assert.equal(page.total, 100); assert.equal(page.hasMore, false); assert.equal(page.runs.length, 10);
  assert.equal(f.checked.length, 100);
});

test("final persistence failure does not recheck; account removal during provider cannot resurrect records", async () => {
  const f = fixture(async targets => { f.fail("brand-checks:complete"); return entries(targets); }), input = f.input();
  await assert.rejects(() => f.store.start("owner-a", input), { code: "brand_checks_unavailable" });
  f.fail(""); assert.equal((await f.store.start("owner-a", input)).status, "pending"); assert.equal(f.checked.length, 1);
  const gone = fixture(async targets => { gone.owners.delete("owner-a"); return entries(targets); });
  await assert.rejects(() => gone.store.start("owner-a", gone.input()), { code: "invalid_session" });
  assert.ok([...gone.runs().values()].every(row => row.status === "pending"));
});

test("registry schemas reject false status authority and inconsistent pagination", async () => {
  const f = fixture(), run = await f.store.start("owner-a", f.input());
  for (const value of [{ ...run, status: "pending" }, { ...run, status: "failed", entries: [], failureCode: null },
    { ...run, entries: [] }, { ...run, verified_score: 99 }, { ...run, methodologyVersion: "made-up" }]) {
    assert.equal(brandCheckRunSchema.safeParse(value).success, false);
  }
  const page = await f.store.history("owner-a", history(f.reportId));
  assert.equal(brandChecksHistoryResponseSchema.safeParse({ accountId: "owner-a", ...page, total: 2, requestId: "req" }).success, false);
});

const headers = { "content-type": "application/json", origin: "https://sajda.test" };
function response() { return { code: 0, data: undefined as unknown, headers: new Map<string, string | number>(),
  setHeader(name: string, value: string | number) { this.headers.set(name.toLowerCase(), value); },
  status(code: number) { this.code = code; return this; }, json(value: unknown) { this.data = value; } }; }
function apiFixture(overrides: Parameters<typeof createBrandChecksHandler>[0] = {}) {
  const f = fixture(), auth: string[] = [], handler = createBrandChecksHandler({ enabled: () => true, store: f.store,
    authorize: async (_headers, options) => { assert.equal(options?.verifiedEmail, true); auth.push(String(options?.method)); return { id: "owner-a", emailVerified: true }; }, ...overrides });
  const call = async (method = "GET", body?: unknown, query?: Record<string, unknown>, url?: string) => {
    const res = response(); await handler({ method, headers, body, query, url }, res); return res;
  };
  return { f, handler, call, auth };
}
test("checks API is private, verified-account guarded, flag closed and strictly bounded before storage/provider", async () => {
  const dark = apiFixture({ enabled: () => false }); assert.equal((await dark.call()).code, 404); assert.deepEqual(dark.auth, []);
  const f = apiFixture(), input = f.f.input(), start = await f.call("POST", input);
  assert.equal(start.code, 200); assert.equal((start.data as { accountId: string }).accountId, "owner-a");
  assert.equal(start.headers.get("cache-control"), "private, no-store"); assert.equal(start.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.equal((await f.call("GET", undefined, { reportId: input.reportId, version: "1", offset: "0", limit: "10" })).code, 200);
  assert.equal((await f.call("GET", undefined, undefined, `/api/account/brand-checks?reportId=${input.reportId}&version=1`)).code, 200);
  const invalid = apiFixture();
  for (const query of [{ reportId: input.reportId, owner: "victim" }, { reportId: [input.reportId, input.reportId] },
    { reportId: input.reportId, offset: "100" }, { reportId: input.reportId, limit: "21" }, { reportId: input.reportId, version: "0" },
    { reportId: input.reportId, version: "1.0" }, { reportId: input.reportId, version: 1 }]) assert.equal((await invalid.call("GET", undefined, query)).code, 400);
  assert.equal((await invalid.call("GET", undefined, undefined, `/api/account/brand-checks?reportId=${input.reportId}&reportId=${input.reportId}`)).code, 400);
  for (const body of ["{", { ...input, entries: [] }, { report: input }, { ...input, source_url: "https://evil.com/" }]) assert.equal((await invalid.call("POST", body)).code, 400);
  assert.equal((await invalid.call("POST")).code, 400);
  assert.equal((await invalid.call("POST", input, { reportId: input.reportId })).code, 400);
  assert.equal((await invalid.call("POST", "x".repeat(1025))).code, 413); assert.equal((await invalid.call("DELETE")).code, 405);
  assert.equal(invalid.f.calls.length, 0); assert.equal(invalid.f.checked.length, 0);
  const denied = apiFixture({ authorize: async () => { throw new AccountAccessError("invalid_origin", 403, "Use your account."); } });
  assert.equal((await denied.call("POST", input)).code, 403); assert.equal(denied.f.calls.length, 0);
  const failed = apiFixture({ authorize: async () => { throw new Error("private postgres://secret"); } });
  assert.doesNotMatch(JSON.stringify((await failed.call()).data), /postgres|secret/u);
});

test("migration is additive, composite owner/version scoped, terminal immutable and cascades account deletion", () => {
  const sql = readFileSync(new URL("../db/migrations/0023_brand_checks.sql", import.meta.url), "utf8");
  assert.match(sql, /PRIMARY KEY \(namespace, owner_id, id\)/u);
  assert.match(sql, /REFERENCES public.sajda_auth_user\(id\) ON DELETE CASCADE/u);
  assert.match(sql, /REFERENCES sajda.brand_report_versions\(namespace, owner_id, report_id, version\) ON DELETE CASCADE/u);
  assert.match(sql, /CREATE UNIQUE INDEX brand_check_runs_one_pending_idx/u); assert.match(sql, /OLD.status <> 'pending'/u);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/u); assert.match(sql, /AS \$\$ BEGIN/u);
  assert.doesNotMatch(sql, /DROP TABLE|DELETE FROM|UPDATE sajda\./u);
});
