import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createBrandMonitorsHandler } from "../api/account/brand-monitors.js";
import { createBrandMonitorsCronHandler, validBrandMonitorsCronSecret } from "../api/cron/brand-monitors.js";
import { deriveBrandMonitorChanges } from "../api/_shared/brand-monitors-store.js";
import { brandMonitorsMutationSchema, brandMonitorsSelectorSchema, brandMonitorAlertSchema,
  brandMonitorSchema, BRAND_MONITOR_ACTIVE_LIMITS } from "../shared/brand-monitors.js";
import { brandRegistrySourceUrl, type BrandEvidenceEntry } from "../shared/brand-evidence.js";

const at = Date.parse("2026-10-07T12:00:00.000Z"), date = (offset = 0) => new Date(at + offset).toISOString();
const source = brandRegistrySourceUrl("example.com", "verisign-rdap", "rdap")!;
function entry(status: "available" | "registered" | "unknown", offset = 0): BrandEvidenceEntry {
  return { id: "check:domain:example.com", target: "example.com", kind: "domain", state: status === "unknown" ? "unknown" : "checked",
    freshness: status === "unknown" ? "unknown" : "current", source_url: status === "unknown" ? null : source,
    observed_at: status === "unknown" ? null : date(offset), statement: status === "unknown" ? "domain_check_unavailable"
      : status === "available" ? "domain_available" : "domain_registered", origin: status === "unknown" ? "none" : "provider_observation" };
}
function monitor() {
  return { reportId: randomUUID(), reportVersion: 1, version: 1, status: "active", pauseReason: null, targets: ["example.com"],
    createdAt: date(), updatedAt: date(), nextDueAt: date(), lastAttemptAt: null, lastRunId: null, lastRunStatus: null,
    lastFailureCode: null, lastRunCoverage: null, lastSuccessfulAt: null, baselineCount: 0, methodologyVersion: "sajda.registry-monitor.v1" };
}
test("monitor mutations are strict, action-specific account commands and cannot submit source, plan or score", () => {
  const reportId = randomUUID(), requestKey = randomUUID();
  const enable = { action: "enable", reportId, requestKey, expectedReportVersion: 1, expectedMonitorVersion: 0 };
  assert.deepEqual(brandMonitorsMutationSchema.parse(enable), enable);
  for (const extra of [{ ownerId: "victim" }, { plan: "trading" }, { baseline: {} }, { source: source }, { score: 99 },
    { targets: ["evil.com"] }, { intervalHours: 1 }, { nextDueAt: date() }]) assert.equal(brandMonitorsMutationSchema.safeParse({ ...enable, ...extra }).success, false);
  for (const value of [{ ...enable, expectedMonitorVersion: 1 }, { ...enable, expectedReportVersion: 0 },
    { action: "resume", reportId, requestKey, expectedMonitorVersion: 0 }, { action: "ack", reportId, requestKey },
    { action: "rebind", reportId, requestKey, expectedMonitorVersion: 1 }]) assert.equal(brandMonitorsMutationSchema.safeParse(value).success, false);
  assert.equal(brandMonitorsSelectorSchema.safeParse({ reportId, alertLimit: 21 }).success, false);
  assert.equal(brandMonitorsSelectorSchema.safeParse({ reportId, alertOffset: 2000 }).success, false);
  assert.deepEqual(BRAND_MONITOR_ACTIVE_LIMITS, { free: 0, basic: 1, premium: 5, trading: 10 });
});
test("first definitive source is a baseline; daily comparisons use original historical timestamps after30-minute freshness expires", () => {
  const first = deriveBrandMonitorChanges({}, [entry("available")], date()); assert.equal(first.changes.length, 0);
  const later = deriveBrandMonitorChanges(first.baseline, [entry("registered", 86400000)], date(86400000 + 1000));
  assert.equal(later.changes.length, 1); assert.equal(later.changes[0].previous.observedAt, date());
  assert.equal(later.changes[0].current.observedAt, date(86400000)); assert.deepEqual(later.coverage, { total: 1, checked: 1, unknown: 0 });
});
test("unknown, unavailable, future and expired samples do not replace a known baseline or fabricate a change", () => {
  const initial = deriveBrandMonitorChanges({}, [entry("available")], date());
  for (const result of [deriveBrandMonitorChanges(initial.baseline, [entry("unknown")], date(86400000)),
    deriveBrandMonitorChanges(initial.baseline, [entry("registered", 86400000 + 1000)], date(86400000)),
    deriveBrandMonitorChanges(initial.baseline, [entry("registered", 1000)], date(86400000))]) {
    assert.deepEqual(result.baseline, initial.baseline); assert.equal(result.changes.length, 0);
    assert.deepEqual(result.coverage, { total: 1, checked: 0, unknown: 1 });
  }
  const unknown = deriveBrandMonitorChanges(initial.baseline, [entry("unknown")], date(86400000));
  const restored = deriveBrandMonitorChanges(unknown.baseline, [entry("registered", 2 * 86400000)], date(2 * 86400000));
  assert.equal(restored.changes.length, 1); assert.equal(restored.changes[0].previous.observedAt, date());
});
test("same-time or older cache cannot advance baseline or create a second signal; next newer same status only advances sample", () => {
  const initial = deriveBrandMonitorChanges({}, [entry("available")], date());
  for (const offset of [0, -1]) {
    const result = deriveBrandMonitorChanges(initial.baseline, [entry("registered", offset)], date());
    assert.equal(result.changes.length, 0); assert.deepEqual(result.baseline, initial.baseline);
  }
  const later = deriveBrandMonitorChanges(initial.baseline, [entry("available", 1000)], date(1000));
  assert.equal(later.changes.length, 0); assert.equal(later.baseline["example.com"].observedAt, date(1000));
});
test("alert contract demands exact registry target/source, original increasing dates and one-way dated acknowledgment", () => {
  const candidate = { id: randomUUID(), reportId: randomUUID(), reportVersion: 1, monitorVersion: 1, runId: randomUUID(),
    target: "example.com", kind: "registration_changed", previous: { status: "available", observedAt: date(), sourceUrl: source },
    current: { status: "registered", observedAt: date(1000), sourceUrl: source }, createdAt: date(2000), acknowledgedAt: null,
    methodologyVersion: "sajda.registry-monitor.v1" };
  assert.equal(brandMonitorAlertSchema.safeParse(candidate).success, true);
  for (const changed of [{ ...candidate, current: { ...candidate.current, status: "available" } },
    { ...candidate, current: { ...candidate.current, observedAt: date() } }, { ...candidate, target: "other.com" },
    { ...candidate, current: { ...candidate.current, sourceUrl: "https://evil.com/" } },
    { ...candidate, acknowledgedAt: date() }, { ...candidate, ownershipVerified: true }]) assert.equal(brandMonitorAlertSchema.safeParse(changed).success, false);
});
test("monitor contract distinguishes completed unknown coverage from no attempt, paused and failed states", () => {
  const m = monitor(); assert.equal(brandMonitorSchema.safeParse(m).success, true);
  const completed = { ...m, lastAttemptAt: date(), lastRunId: randomUUID(), lastRunStatus: "completed", lastRunCoverage: { total: 1, checked: 0, unknown: 1 } };
  assert.equal(brandMonitorSchema.safeParse(completed).success, true);
  for (const invalid of [{ ...completed, lastRunCoverage: null }, { ...completed, lastRunCoverage: { total: 1, checked: 1, unknown: 1 } },
    { ...m, status: "paused" }, { ...m, status: "paused", pauseReason: "user" }, { ...completed, lastRunStatus: "failed" }]) assert.equal(brandMonitorSchema.safeParse(invalid).success, false);
});
function response() { return { code: 0, data: undefined as unknown, headers: new Map<string, string | number>(),
  setHeader(name: string, value: string | number) { this.headers.set(name.toLowerCase(), value); },
  status(code: number) { this.code = code; return this; }, json(value: unknown) { this.data = value; } }; }
test("private handler closes feature flags and rejects malformed commands before touching storage", async () => {
  let touched = 0, authorized = 0;
  const store = { limit: async () => { touched++; }, get: async () => { touched++; return {}; }, mutate: async () => { touched++; return {}; }, tick: async () => ({ processed: 0, alerts: 0, busy: false }) };
  const authorize = async () => { authorized++; return { id: "owner", emailVerified: true }; };
  const enabled = createBrandMonitorsHandler({ enabled: () => true, authorize, store: store as never });
  const hidden = createBrandMonitorsHandler({ enabled: () => false, authorize, store: store as never });
  const dark = response(); await hidden({ method: "GET" }, dark); assert.equal(dark.code, 404); assert.equal(authorized, 0);
  const reportId = randomUUID();
  for (const request of [{ method: "GET", query: { reportId: [reportId, reportId] } },
    { method: "GET", url: `/api/account/brand-monitors?reportId=${reportId}&reportId=${reportId}` },
    { method: "GET", query: { reportId, alertOffset: "2000" } }, { method: "POST", body: {} },
    { method: "POST", body: "x".repeat(4097) }, { method: "POST", body: undefined },
    { method: "POST", body: { reportId }, query: { reportId } }]) {
    const res = response(); await enabled({ ...request, headers: { "content-type": "application/json" } }, res);
    assert.ok([400, 413].includes(res.code)); assert.equal(res.headers.get("cache-control"), "private, no-store");
    assert.equal(res.headers.get("x-robots-tag"), "noindex, nofollow");
  }
  assert.equal(touched, 0);
});
test("cron only advances with exact bounded secret, both flags and no caller-supplied account/scope; output excludes domain data", async () => {
  const secret = "s".repeat(32); let calls = 0;
  assert.equal(validBrandMonitorsCronSecret(`Bearer ${secret}`, secret), true);
  for (const [header, value] of [[`bearer ${secret}`, secret], [`Bearer ${secret} `, secret], [[`Bearer ${secret}`], secret], [`Bearer ${"s".repeat(31)}`, "s".repeat(31)]]) assert.equal(validBrandMonitorsCronSecret(header, value), false);
  const make = (enabled = true) => createBrandMonitorsCronHandler({ secret: () => secret, enabled: () => enabled, cronEnabled: () => true,
    store: { tick: async () => { calls++; return { processed: 2, alerts: 1, busy: false }; } } });
  const blocked = response(); await make()({ method: "GET", headers: {} }, blocked); assert.equal(blocked.code, 401);
  const forged = response(); await make()({ method: "GET", headers: { authorization: `Bearer ${secret}` }, query: { ownerId: "victim" } }, forged); assert.equal(forged.code, 400);
  const paused = response(); await make(false)({ method: "GET", headers: { authorization: `Bearer ${secret}` } }, paused); assert.equal(paused.code, 200); assert.equal(calls, 0);
  const pass = response(); await make()({ method: "GET", headers: { authorization: `Bearer ${secret}` } }, pass); assert.equal(calls, 1);
  assert.deepEqual({ ...(pass.data as object), requestId: "redacted" }, { state: "advanced", processed: 2, alerts: 1, requestId: "redacted" });
});
test("migration is additive owner/environment scoped with immutable one-way alert acknowledgment", () => {
  const sql = readFileSync(new URL("../db/migrations/0024_brand_monitors.sql", import.meta.url), "utf8");
  assert.match(sql, /REFERENCES public.sajda_auth_user\(id\) ON DELETE CASCADE/u);
  assert.match(sql, /PRIMARY KEY\(namespace,owner_id,report_id\)/u);
  assert.match(sql, /UNIQUE\(namespace,owner_id,report_id,run_id,target\)/u);
  assert.match(sql, /OLD.acknowledged_at IS NOT NULL/u); assert.match(sql, /AS \$\$ BEGIN/u);
  assert.doesNotMatch(sql, /DROP TABLE|DELETE FROM|UPDATE sajda\./u);
});
