import assert from "node:assert/strict";
import test from "node:test";
import { createBrandReportsHandler } from "../api/account/brand-reports.js";
import { AccountAccessError } from "../api/_shared/account-error.js";
import { assessBrandPresence, buildBrandIndexTargets, BRAND_INDEX_REPORT_MAX_AGE_MS } from "../shared/brand-presence-index.js";
import { brandReportSaveSchema, brandReportSnapshotSchema, type BrandReportSaveInput } from "../shared/brand-reports.js";
import { brandWorksheetCopy } from "../src/i18n/brandWorksheetCopy.js";

const ID = "df20749a-5960-4f2b-85cb-dbe3c3c7ff62";
const KEY = "88a89c9e-738b-4bdd-83b1-0332a39d4c2a";
const AT = "2026-10-07T09:00:00.000Z";
const NOW = Date.parse(AT);
function input(): BrandReportSaveInput {
  const assessment = {
    brand_name: "Synthetic boundary brand", identity_label: "example", primary_domain: "example.com", domains: ["example.com"],
    socials: [{ platform: "github" as const, handle: "example" }], markets: ["US" as const], observations: [],
  };
  return brandReportSaveSchema.parse({ id: ID, requestKey: KEY, expectedVersion: 0, title: "Synthetic report",
    assessment: { ...assessment, observations: buildBrandIndexTargets(assessment).map(target => ({ target_id: target.id,
      status: "reported_owned", source_url: "https://example.com/about", reported_at: AT })) } });
}
function snapshot(value = input(), now = NOW) {
  return { id: value.id, title: value.title, version: value.expectedVersion + 1, savedAt: AT,
    assessment: value.assessment, result: assessBrandPresence(value.assessment, now) };
}
function response() {
  let status = 200, payload: unknown;
  const headers = new Map<string, string>();
  const res = { setHeader(key: string, value: string | number) { headers.set(key, String(value)); },
    status(code: number) { status = code; return res; }, json(value: unknown) { payload = value; } };
  return { res, headers, result: () => ({ status, payload: payload as Record<string, unknown> }) };
}

test("saved report input cannot smuggle ownership authority or checked provider evidence", () => {
  for (const extra of [{ ownerId: "another-owner" }, { accountId: "another-owner" }, { namespace: "production" },
    { verified_score: 99 }, { result: snapshot().result }, { evidence_report: snapshot().result.evidence_report }]) {
    assert.equal(brandReportSaveSchema.safeParse({ ...input(), ...extra }).success, false);
    assert.equal(brandReportSaveSchema.safeParse({ ...input(), assessment: { ...input().assessment, ...extra } }).success, false);
  }
  for (const extra of [{ verified: true }, { state: "checked" }, { origin: "provider_observation" }, { verified_at: AT }]) {
    const value = input();
    Object.assign(value.assessment.observations[0], extra);
    assert.equal(brandReportSaveSchema.safeParse(value).success, false);
  }
});

test("saving and later evaluation retain original dates, sources and user-report provenance", () => {
  const original = input();
  const current = brandReportSnapshotSchema.parse(snapshot(original));
  const later = brandReportSnapshotSchema.parse(snapshot(original, NOW + BRAND_INDEX_REPORT_MAX_AGE_MS + 1));
  assert.deepEqual(later.assessment, original.assessment);
  assert.equal(later.savedAt, AT);
  assert.equal(current.result.index.reported_score, 100);
  assert.equal(later.result.index.reported_score, null);
  assert.equal(later.result.index.verified_score, null);
  assert.equal(later.result.evidence_report.summary.checked, 0);
  for (const row of later.result.targets) {
    assert.equal(row.reported_at, AT);
    assert.equal(row.source_url, "https://example.com/about");
    assert.equal(row.classification, "USER_SUPPLIED");
    assert.equal(row.status_freshness, "stale");
  }
});

test("future and missing user-report dates cannot become checked evidence when persisted", () => {
  for (const date of [null, new Date(NOW + 1).toISOString()]) {
    const value = input();
    value.assessment.observations.forEach(row => { row.reported_at = date; });
    const parsed = brandReportSnapshotSchema.parse(snapshot(value));
    assert.equal(parsed.result.index.reported_score, null);
    assert.equal(parsed.result.evidence_report.summary.checked, 0);
    assert.equal(parsed.result.evidence_report.summary.reported, 0);
    assert.ok(parsed.result.targets.every(row => row.reported_at === date));
  }
});

test("a saved snapshot rejects even individually valid results from a different scope", () => {
  const value = input(), different = input();
  different.assessment.brand_name = "Another synthetic brand";
  assert.equal(brandReportSnapshotSchema.safeParse({ ...snapshot(value), result: assessBrandPresence(different.assessment, NOW) }).success, false);
  assert.equal(brandReportSnapshotSchema.safeParse({ ...snapshot(value), result: { ...snapshot(value).result,
    index: { ...snapshot(value).result.index, verified_score: 100 } } }).success, false);
});

test("persistent input rejects JSONB-hostile text instead of retrying an impossible save", () => {
  for (const value of ["Report\u0000", "Report\ud800", "Report\udfff"]) {
    assert.equal(brandReportSaveSchema.safeParse({ ...input(), title: value }).success, false);
  }
  const value = input(); value.title = "Report 🧭";
  assert.equal(brandReportSaveSchema.safeParse(value).success, true);
});

test("raw HTTP identity headers cannot impersonate a verified saved-report owner", async () => {
  const handler = createBrandReportsHandler({ enabled: () => true });
  for (const method of ["GET", "POST"]) {
    const reply = response();
    await handler({ method, headers: { "x-sajda-account": "victim-account", "x-sajda-scope": "projects:write",
      "content-type": "application/json" }, body: { report: input() } }, reply.res);
    assert.equal(reply.result().status, 401);
    assert.equal(reply.result().payload.code, "authentication_required");
    assert.equal(reply.headers.get("Cache-Control"), "private, no-store");
    assert.equal(reply.headers.get("X-Robots-Tag"), "noindex, nofollow");
    assert.ok(!JSON.stringify(reply.result().payload).includes("victim-account"));
  }
});

test("handler validates mutation ownership fields before any store work", async () => {
  let storeCalled = false;
  const base = { async limit() { storeCalled = true; }, async list() { storeCalled = true; return []; },
    async get() { storeCalled = true; return snapshot(); }, async history() { storeCalled = true; return []; },
    async save() { storeCalled = true; return snapshot(); } };
  const handler = createBrandReportsHandler({ enabled: () => true, authorize: async () => ({ id: "caller", emailVerified: true }), store: base });
  const reply = response();
  await handler({ method: "POST", headers: { "content-type": "application/json" },
    body: { report: { ...input(), ownerId: "victim" } } }, reply.res);
  assert.equal(reply.result().status, 400);
  assert.equal(storeCalled, false);
});

test("save receipt contains only the affected report and never invokes list or history", async () => {
  const calls: string[] = [];
  const store = { async limit(owner: string) { calls.push(`limit:${owner}`); }, async list() { throw new Error("Must not list unrelated report titles"); },
    async get() { throw new Error("Must not read unrelated versions"); }, async history() { throw new Error("Must not read unrelated history"); },
    async save(owner: string, value: BrandReportSaveInput) { calls.push(`save:${owner}`); assert.deepEqual(value, input()); return snapshot(value); } };
  const handler = createBrandReportsHandler({ enabled: () => true, authorize: async () => ({ id: "authenticated-owner", emailVerified: true }), store });
  const reply = response();
  await handler({ method: "POST", headers: { "content-type": "application/json" }, body: { report: input() } }, reply.res);
  assert.equal(reply.result().status, 200);
  assert.deepEqual(calls, ["limit:authenticated-owner", "save:authenticated-owner"]);
  assert.deepEqual(Object.keys(reply.result().payload).sort(), ["accountId", "report", "requestId"]);
  assert.equal((reply.result().payload.report as { id: string }).id, ID);
});

test("unknown database write outcome is explicit, retry-safe and does not expose internal details", async () => {
  const store = { async limit() {}, async list() { return []; }, async get() { return snapshot(); }, async history() { return []; },
    async save() { throw new Error("postgres://private-host/internal-credential"); } };
  const handler = createBrandReportsHandler({ enabled: () => true, authorize: async () => ({ id: "caller", emailVerified: true }), store });
  const reply = response();
  await handler({ method: "POST", headers: { "content-type": "application/json" }, body: { report: input() } }, reply.res);
  assert.equal(reply.result().status, 503);
  assert.match(String(reply.result().payload.error), /save may have completed; retry the same save/iu);
  assert.ok(!JSON.stringify(reply.result().payload).includes("private-host"));
});

test("unavailable account-owned IDs do not reveal another owner's report or namespace", async () => {
  const store = { async limit() {}, async list() { return []; }, async get() { throw new AccountAccessError("report_not_found", 404, "This report is not available in your account."); },
    async history() { return []; }, async save() { return snapshot(); } };
  const handler = createBrandReportsHandler({ enabled: () => true, authorize: async () => ({ id: "caller", emailVerified: true }), store });
  const reply = response();
  await handler({ method: "GET", headers: {}, query: { id: ID } }, reply.res);
  assert.equal(reply.result().status, 404);
  assert.deepEqual(Object.keys(reply.result().payload).sort(), ["code", "error", "requestId"]);
  assert.ok(!JSON.stringify(reply.result().payload).includes(ID));
});

test("local-check leave warnings distinguish unsaved data from retained account versions in every language", () => {
  const retained = { en: "Saved account versions are not removed", sv: "Sparade versioner på kontot tas inte bort",
    es: "Las versiones guardadas en tu cuenta no se eliminan", fr: "Les versions sauvegardées dans votre compte ne sont pas supprimées",
    zh: "账号中已保存的版本不会被删除" };
  const obsolete = { en: "Your worksheet is only held on this page", sv: "Arbetsbladet finns bara på denna sida",
    es: "La hoja solo está en esta página", fr: "La feuille existe uniquement sur cette page", zh: "工作表仅保留在此页面上" };
  for (const language of ["en", "sv", "es", "fr", "zh"] as const) {
    assert.ok(brandWorksheetCopy[language].leaveBody.includes(retained[language]));
    assert.ok(!brandWorksheetCopy[language].leaveBody.includes(obsolete[language]));
  }
  assert.match(brandWorksheetCopy.en.leaveBody, /unsaved declarations, unrecorded field edits and page-only registry checks/iu);
  assert.match(brandWorksheetCopy.en.leaveBody, /Exporting does not create or update an account version/iu);
});
