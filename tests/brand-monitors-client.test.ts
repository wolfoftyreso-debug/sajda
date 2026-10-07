import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createServer } from "vite";
import { BRAND_MONITOR_METHODOLOGY_VERSION, type BrandMonitor, type BrandMonitorAlert, type BrandMonitorsMutationInput } from "../shared/brand-monitors";

const reportId = "abcdbbbb-0000-4000-8000-000000000001", requestKey = "abcdbbbb-0000-4000-8000-000000000002", alertId = "abcdbbbb-0000-4000-8000-000000000003";
const owner = "account-a", requestId = "req_0123456789abcdef", at = "2026-10-07T12:00:00.000Z", earlier = "2026-10-06T12:00:00.000Z", source = "https://rdap.verisign.com/com/v1/domain/example.com";
const input: BrandMonitorsMutationInput = { reportId, requestKey, action: "enable", expectedReportVersion: 1, expectedMonitorVersion: 0 };
function monitor(): BrandMonitor { return { reportId, reportVersion: 1, version: 1, status: "active", pauseReason: null, targets: ["example.com"], createdAt: at, updatedAt: at, nextDueAt: at, lastAttemptAt: null, lastRunId: null, lastRunStatus: null, lastFailureCode: null, lastRunCoverage: null, lastSuccessfulAt: null, baselineCount: 0, methodologyVersion: BRAND_MONITOR_METHODOLOGY_VERSION }; }
function alert(): BrandMonitorAlert { return { id: alertId, reportId, reportVersion: 1, monitorVersion: 1, runId: requestKey, target: "example.com", kind: "registration_changed", previous: { status: "registered", sourceUrl: source, observedAt: earlier }, current: { status: "available", sourceUrl: source, observedAt: at }, createdAt: at, acknowledgedAt: null, methodologyVersion: BRAND_MONITOR_METHODOLOGY_VERSION }; }
function page() { return { accountId: owner, requestId, monitor: monitor(), currentPlan: "premium", capacity: { active: 1, limit: 5 }, intervalHours: 24, cronScheduled: false, alerts: [alert()], total: 1, alertOffset: 0, alertLimit: 20, hasMore: false }; }

test("monitor client preserves account scope, strict mutations and immutable receipts", async t => {
  const key = "__BRAND_MONITOR_CLIENT__";
  type Request = { accountId: string; method?: string; body?: BrandMonitorsMutationInput; signal?: AbortSignal };
  const requests: { path: string; options: Request }[] = [];
  const fixture = { owner, verified: true, expires: Date.now() / 1000 + 3600, reply: async (_path: string, _request: Request): Promise<unknown> => ({ accountId: owner, requestId, monitor: monitor(), acknowledgedAlert: null }),
    request: async (path: string, options: Request) => { requests.push({ path, options }); return fixture.reply(path, options); }, session: async () => ({ user: { id: fixture.owner, email_verified: fixture.verified }, expires_at: fixture.expires }) };
  Object.defineProperty(globalThis, key, { configurable: true, value: fixture });
  const vite = await createServer({ configFile: false, appType: "custom", server: { middlewareMode: true, watch: null, hmr: false, ws: false }, resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] }, plugins: [{ name: "monitor-account-boundary", enforce: "pre", load(id) {
    if (id.replaceAll("\\", "/").endsWith("/src/integrations/neon/auth.ts")) return `export const accountRequest=(path,options)=>globalThis.${key}.request(path,options);export const readAccountSession=()=>globalThis.${key}.session();`;
  } }] });
  try {
    const client = await vite.ssrLoadModule("/src/lib/brandMonitorsClient.ts");
    const code = (expected: string) => (error: { code?: string }) => { assert.equal(error.code, expected); return true; };
    const reset = () => { requests.length = 0; fixture.owner = owner; fixture.verified = true; fixture.expires = Date.now() / 1000 + 3600; fixture.reply = async () => ({ accountId: owner, requestId, monitor: monitor(), acknowledgedAlert: null }); };
    await t.test("strict selectors and mutation claims cannot reach transport", async () => {
      reset(); for (const value of [{ ...input, targets: ["evil.com"] }, { ...input, expectedMonitorVersion: 1 }, { ...input, reportId: "bad" }, { ...input, action: "run_now" }]) await assert.rejects(client.changeBrandMonitor({ accountId: owner }, value), code("invalid"));
      for (const value of [undefined, { reportId, alertLimit: 21 }, { reportId, alertOffset: 2000 }, { reportId, requestKey }]) await assert.rejects(client.getBrandMonitors({ accountId: owner }, value), code("invalid"));
      const controller = new AbortController(); controller.abort(); await assert.rejects(client.changeBrandMonitor({ accountId: owner, signal: controller.signal }, input)); assert.equal(requests.length, 0);
    });
    await t.test("history GET is bounded, owner-scoped and never configures or checks domains", async () => {
      reset(); fixture.reply = async () => page(); const value = await client.getBrandMonitors({ accountId: owner }, { reportId, alertOffset: 0, alertLimit: 20 });
      assert.equal(value.alerts[0].previous.observedAt, earlier); assert.equal(value.cronScheduled, false); assert.equal(requests[0].path, `/api/account/brand-monitors?reportId=${reportId}&alertOffset=0&alertLimit=20`); assert.equal(requests[0].options.body, undefined); assert.equal(requests[0].options.method, undefined);
      for (const value of [{ ...page(), capacity: { active: 1, limit: 10 } }, { ...page(), alerts: [{ ...alert(), reportId: requestKey }] }, { ...page(), monitor: { ...monitor(), reportId: requestKey } }, { ...page(), alertOffset: 1 }]) { fixture.reply = async () => value; await assert.rejects(client.getBrandMonitors({ accountId: owner }, { reportId, alertOffset: 0, alertLimit: 20 }), code("invalid_response")); }
    });
    await t.test("mutation snapshot survives caller edits and exact action receipts are checked", async () => {
      reset(); let finish!: (value: unknown) => void; fixture.reply = async () => new Promise(resolve => { finish = resolve; });
      const raw = { ...input }, scope = { accountId: owner }; const pending = client.changeBrandMonitor(scope, raw); raw.requestKey = reportId; scope.accountId = "account-b";
      assert.deepEqual(requests[0].options.body, input); finish({ accountId: owner, requestId, monitor: monitor(), acknowledgedAlert: null }); assert.equal((await pending).monitor.version, 1);
      for (const value of [{ ...monitor(), version: 2 }, { ...monitor(), reportVersion: 2 }, { ...monitor(), status: "paused", pauseReason: "user", nextDueAt: null }]) {
        fixture.reply = async () => ({ accountId: owner, requestId, monitor: value, acknowledgedAlert: null }); let error: unknown; try { await client.changeBrandMonitor({ accountId: owner }, input); } catch (caught) { error = caught; }
        assert.equal((error as { code: string }).code, "invalid_response"); assert.equal(client.brandMonitorFailureIsUncertain(error), true);
      }
    });
    await t.test("pause resume rebind and acknowledgment receipts cannot masquerade as each other", async () => {
      reset(); const paused = { ...monitor(), version: 2, status: "paused", pauseReason: "user", nextDueAt: null };
      fixture.reply = async () => ({ accountId: owner, requestId, monitor: paused, acknowledgedAlert: null }); await client.changeBrandMonitor({ accountId: owner }, { reportId, requestKey, action: "pause", expectedMonitorVersion: 1 });
      await assert.rejects(client.changeBrandMonitor({ accountId: owner }, { reportId, requestKey, action: "resume", expectedMonitorVersion: 1 }), code("invalid_response"));
      fixture.reply = async () => ({ accountId: owner, requestId, monitor: { ...paused, version: 10000 }, acknowledgedAlert: null }); await client.changeBrandMonitor({ accountId: owner }, { reportId, requestKey, action: "pause", expectedMonitorVersion: 10000 });
      fixture.reply = async () => ({ accountId: owner, requestId, monitor: { ...monitor(), version: 2, reportVersion: 2 }, acknowledgedAlert: null }); await client.changeBrandMonitor({ accountId: owner }, { reportId, requestKey, action: "rebind", expectedMonitorVersion: 1, expectedReportVersion: 2 });
      fixture.reply = async () => ({ accountId: owner, requestId, monitor: monitor(), acknowledgedAlert: { ...alert(), acknowledgedAt: at } }); await client.changeBrandMonitor({ accountId: owner }, { reportId, requestKey, action: "ack", alertId });
      fixture.reply = async () => ({ accountId: owner, requestId, monitor: monitor(), acknowledgedAlert: alert() }); await assert.rejects(client.changeBrandMonitor({ accountId: owner }, { reportId, requestKey, action: "ack", alertId }), code("invalid_response"));
    });
    await t.test("late account replacement expiry and failed verification cannot confirm a write", async () => {
      reset(); fixture.owner = "account-b"; await assert.rejects(client.changeBrandMonitor({ accountId: owner }, input), code("account_changed"));
      reset(); fixture.expires = 1; await assert.rejects(client.changeBrandMonitor({ accountId: owner }, input), code("unauthenticated"));
      reset(); fixture.verified = false; let error: unknown; try { await client.changeBrandMonitor({ accountId: owner }, input); } catch (caught) { error = caught; }
      assert.equal((error as { code: string }).code, "verification_required"); assert.equal(client.brandMonitorFailureIsUncertain(error), true);
      reset(); fixture.reply = async () => ({ ...page(), accountId: "account-b" }); await assert.rejects(client.getBrandMonitors({ accountId: owner }, { reportId, alertOffset: 0, alertLimit: 20 }), code("account_changed"));
    });
    await t.test("admission failure differs from ambiguous transport and provider text is not leaked", async () => {
      reset(); fixture.reply = async () => { throw { status: 503, message: "secret diagnostic" }; }; let failure: unknown;
      try { await client.changeBrandMonitor({ accountId: owner }, input); } catch (error) { failure = error; } assert.equal(client.brandMonitorFailureIsUncertain(failure), true); assert.equal(String(failure).includes("secret"), false);
      fixture.reply = async () => ({ accountId: owner, requestId, monitor: monitor(), acknowledgedAlert: null }); await client.changeBrandMonitor({ accountId: owner }, input); assert.deepEqual(requests[0].options.body, requests[1].options.body);
      for (const [detail, expected] of [[{ status: 403, code: "monitor_plan_required" }, "entitlement_required"], [{ status: 409, code: "monitor_plan_limit" }, "entitlement_required"], [{ status: 409, code: "monitor_history_full" }, "history_full"], [{ status: 409, code: "monitor_version_limit" }, "version_limit"], [{ status: 409, code: "monitor_request_limit" }, "request_limit"], [{ status: 409, code: "monitor_report_changed" }, "conflict"], [{ status: 409, code: "monitor_request_conflict" }, "request_conflict"], [{ status: 404, code: "alert_not_found" }, "not_found"], [{ status: 404 }, "disabled"], [{ status: 409 }, "conflict"], [{ status: 429 }, "rate_limited"]] as const) {
        fixture.reply = async () => { throw detail; }; let error: unknown; try { await client.changeBrandMonitor({ accountId: owner }, input); } catch (caught) { error = caught; } assert.equal((error as { code: string }).code, expected); assert.equal(client.brandMonitorFailureIsUncertain(error), false);
      }
    });
  } finally { await vite.close(); Reflect.deleteProperty(globalThis, key); }
});
