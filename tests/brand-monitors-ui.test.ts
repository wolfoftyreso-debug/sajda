import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createElement as h } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { createServer } from "vite";
import { brandMonitorsCopy } from "../src/i18n/brandMonitorsCopy";
import { BRAND_MONITOR_METHODOLOGY_VERSION, type BrandMonitor, type BrandMonitorAlert, type BrandMonitorsMutationInput } from "../shared/brand-monitors";

function text(node: ReactTestInstance): string { return node.children.map(child => typeof child === "string" ? child : text(child)).join(""); }
const reportId = "abcdbbbb-0000-4000-8000-000000000001", at = "2026-10-07T12:00:00.000Z", earlier = "2026-10-06T12:00:00.000Z", source = "https://rdap.verisign.com/com/v1/domain/example.com";
function monitor(): BrandMonitor { return { reportId, reportVersion: 1, version: 1, status: "active", pauseReason: null, targets: ["example.com", "example.co.uk"], createdAt: at, updatedAt: at, nextDueAt: at, lastAttemptAt: null, lastRunId: null, lastRunStatus: null, lastFailureCode: null, lastRunCoverage: null, lastSuccessfulAt: null, baselineCount: 0, methodologyVersion: BRAND_MONITOR_METHODOLOGY_VERSION }; }
function alert(index = 1): BrandMonitorAlert { return { id: `abcdbbbb-0000-4000-8000-${String(index + 100).padStart(12, "0")}`, reportId, reportVersion: 1, monitorVersion: 1, runId: reportId, target: "example.com", kind: "registration_changed", previous: { status: "registered", sourceUrl: source, observedAt: earlier }, current: { status: "available", sourceUrl: source, observedAt: at }, createdAt: at, acknowledgedAt: null, methodologyVersion: BRAND_MONITOR_METHODOLOGY_VERSION }; }

test("daily monitoring UI keeps narrow coverage and explicit recoverable account actions", async t => {
  const key = "__BRAND_MONITOR_UI__", original = Object.getOwnPropertyDescriptor(globalThis, key);
  const fixture = { current: null as BrandMonitor | null, alerts: [] as BrandMonitorAlert[], plan: "premium", active: 0, limit: 5, scheduled: false, mode: "success", readFails: false,
    reads: [] as { alertOffset: number; alertLimit: number }[], mutations: [] as BrandMonitorsMutationInput[], activities: [] as boolean[], release: null as (() => void) | null,
    async get(_scope: unknown, selector: { alertOffset: number; alertLimit: number }) { fixture.reads.push(selector); if (fixture.readFails) throw { code: "unavailable" }; return { accountId: "account-a", requestId: "req_0123456789abcdef", monitor: structuredClone(fixture.current), currentPlan: fixture.plan, capacity: { active: fixture.active, limit: fixture.limit }, intervalHours: 24, cronScheduled: fixture.scheduled, alerts: structuredClone(fixture.alerts.slice(selector.alertOffset, selector.alertOffset + selector.alertLimit)), total: fixture.alerts.length, alertOffset: selector.alertOffset, alertLimit: selector.alertLimit, hasMore: selector.alertOffset + selector.alertLimit < fixture.alerts.length }; },
    async mutate(_scope: unknown, input: BrandMonitorsMutationInput) {
      fixture.mutations.push(structuredClone(input)); if (fixture.mode === "hold") await new Promise<void>(resolve => { fixture.release = resolve; });
      if (fixture.mode === "uncertain") throw { code: "unavailable" };
      if (fixture.mode === "conflict") { fixture.current = { ...monitor(), version: 3, status: "paused", pauseReason: "user", nextDueAt: null }; throw { code: "conflict" }; }
      let acknowledgedAlert: BrandMonitorAlert | null = null;
      if (input.action === "enable") { fixture.current = { ...monitor(), reportId: input.reportId, reportVersion: input.expectedReportVersion }; fixture.active++; }
      else if (input.action === "ack") { fixture.alerts = fixture.alerts.map(value => value.id === input.alertId ? { ...value, acknowledgedAt: at } : value); acknowledgedAlert = fixture.alerts.find(value => value.id === input.alertId) ?? null; }
      else { const current = fixture.current!; fixture.current = { ...current, version: input.action === "pause" ? Math.min(input.expectedMonitorVersion + 1, 10000) : input.expectedMonitorVersion + 1, status: input.action === "pause" ? "paused" : "active", pauseReason: input.action === "pause" ? "user" : null, nextDueAt: input.action === "pause" ? null : at, ...(input.action === "rebind" ? { reportVersion: input.expectedReportVersion, baselineCount: 0 } : {}) }; fixture.active = fixture.current.status === "active" ? 1 : 0; }
      return { accountId: "account-a", requestId: "req_0123456789abcdef", monitor: structuredClone(fixture.current), acknowledgedAlert };
    },
  };
  Object.defineProperty(globalThis, key, { configurable: true, value: fixture });
  const vite = await createServer({ configFile: false, appType: "custom", server: { middlewareMode: true, watch: null, hmr: false, ws: false }, resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" }, plugins: [{ name: "monitor-presentation-boundary", enforce: "pre", load(raw) {
    if (raw.replaceAll("\\", "/").endsWith("/src/lib/brandMonitorsClient.ts")) return `const f=globalThis.${key};export class BrandMonitorsError extends Error{constructor(code){super(code);this.code=code;}};const wrap=async(fn,args)=>{try{return await fn(...args);}catch(error){throw new BrandMonitorsError(error.code||'unavailable');}};export const getBrandMonitors=(...args)=>wrap(f.get,args);export const changeBrandMonitor=(...args)=>wrap(f.mutate,args);export const brandMonitorFailureIsUncertain=error=>error.code==='unavailable';`;
  } }] });
  let renderer: ReactTestRenderer | undefined;
  const activity = (value: boolean) => fixture.activities.push(value);
  let props = { ownerId: "account-a", reportId, reportVersion: 1, historical: false, latest: true, clean: true, blocked: false, language: "en", now: Date.parse(at), onUnsettledChange: activity };
  try {
    const Component = (await vite.ssrLoadModule("/src/components/BrandReportMonitoring.tsx")).default;
    const tree = () => h(Component, { ...props, key: `${props.ownerId}:${props.reportId}:${props.reportVersion}` });
    const root = () => renderer!.root, button = (attribute: string) => root().findAllByType("button").find(node => node.props[attribute])!;
    const click = async (attribute: string) => { await act(async () => button(attribute).props.onClick()); };
    const mount = async (value: BrandMonitor | null = null) => { if (renderer) await act(async () => renderer!.unmount()); fixture.current = value; fixture.alerts = []; fixture.active = value?.status === "active" ? 1 : 0; fixture.plan = "premium"; fixture.limit = 5; fixture.scheduled = false; fixture.mode = "success"; fixture.readFails = false; fixture.reads = []; fixture.mutations = []; fixture.activities = []; fixture.release = null; props = { ...props, ownerId: "account-a", reportId, reportVersion: 1, historical: false, latest: true, clean: true, blocked: false, language: "en", now: Date.parse(at) }; await act(async () => { renderer = create(tree()); }); };
    await t.test("enable is explicit, clean latest scope only and explains unavailable scheduling in five languages", async () => {
      await mount(); assert.equal(fixture.mutations.length, 0); assert.deepEqual(fixture.reads[0], { reportId, alertOffset: 0, alertLimit: 20 });
      for (const language of ["en", "sv", "es", "fr", "zh"] as const) { props.language = language; await act(async () => renderer!.update(tree())); assert.ok(text(root()).includes(brandMonitorsCopy[language].help)); assert.ok(text(root()).includes(brandMonitorsCopy[language].scheduleOff)); assert.ok(text(root()).includes(brandMonitorsCopy[language].limits)); }
      props.clean = false; await act(async () => renderer!.update(tree())); assert.equal(button("data-brand-monitor-enable").props.disabled, true); await click("data-brand-monitor-enable"); assert.equal(fixture.mutations.length, 0);
      props.clean = true; props.latest = false; await act(async () => renderer!.update(tree())); assert.equal(button("data-brand-monitor-enable").props.disabled, true);
      props.latest = true; props.historical = true; await act(async () => renderer!.update(tree())); assert.equal(root().findAllByType("button").filter(node => node.props["data-brand-monitor-enable"]).length, 0);
    });
    await t.test("Free and saturated allowance do not pretend an enabled monitor is purchasable", async () => {
      await mount(); fixture.plan = "free"; fixture.limit = 0; await click("data-brand-monitor-refresh"); assert.ok(text(root()).includes(brandMonitorsCopy.en.noAllowance)); assert.equal(button("data-brand-monitor-enable").props.disabled, true);
      fixture.plan = "basic"; fixture.limit = 1; fixture.active = 1; await click("data-brand-monitor-refresh"); assert.ok(text(root()).includes(brandMonitorsCopy.en.capacity)); await click("data-brand-monitor-enable"); assert.equal(fixture.mutations.length, 0);
    });
    await t.test("scope changes need explicit rebind; pause and resume use actual monitor revision", async () => {
      await mount({ ...monitor(), reportVersion: 1, status: "paused", pauseReason: "report_changed", nextDueAt: null }); props.reportVersion = 2; await act(async () => renderer!.update(tree()));
      assert.ok(text(root()).includes(brandMonitorsCopy.en.scopeDifferent)); assert.equal(button("data-brand-monitor-resume").props.disabled, true);
      await click("data-brand-monitor-rebind"); assert.equal(fixture.mutations[0].action, "rebind"); assert.equal((fixture.mutations[0] as { expectedReportVersion: number }).expectedReportVersion, 2); assert.equal(fixture.current!.version, 2);
      await click("data-brand-monitor-pause"); assert.equal(fixture.mutations[1].action, "pause"); assert.equal(fixture.current!.version, 3); assert.equal(fixture.current!.status, "paused");
      await click("data-brand-monitor-resume"); assert.equal(fixture.mutations[2].action, "resume"); assert.equal(fixture.current!.version, 4); assert.equal(fixture.current!.status, "active");
    });
    await t.test("stopping an active pinned monitor does not require saving unrelated edits or leaving history", async () => {
      await mount(monitor()); props.clean = false; props.latest = false; props.historical = true; await act(async () => renderer!.update(tree()));
      assert.equal(button("data-brand-monitor-pause").props.disabled, false); await click("data-brand-monitor-pause"); assert.equal(fixture.current!.status, "paused");
      assert.equal(fixture.mutations[0].action, "pause"); assert.equal(root().findAllByType("button").filter(node => node.props["data-brand-monitor-resume"]).length, 0);
      await mount({ ...monitor(), version: 10000 }); await click("data-brand-monitor-pause"); assert.equal(fixture.current!.version, 10000); assert.equal(fixture.current!.status, "paused");
    });
    await t.test("unknown coverage failed attempts baseline and original timestamps remain distinct", async () => {
      await mount({ ...monitor(), lastAttemptAt: at, lastRunId: reportId, lastRunStatus: "completed", lastRunCoverage: { total: 2, checked: 0, unknown: 2 }, baselineCount: 0 });
      assert.ok(text(root()).includes(`${brandMonitorsCopy.en.checked}: 0 / 2`)); assert.ok(text(root()).includes(`${brandMonitorsCopy.en.unknownDomains}: 2`)); assert.ok(text(root()).includes(brandMonitorsCopy.en.unknownHelp));
      assert.equal(root().findAllByProps({ "data-brand-monitor-last-attempt": true })[0].props.dateTime, at); assert.equal(root().findAllByProps({ "data-brand-monitor-last-success": true }).length, 0);
      fixture.current = { ...monitor(), lastAttemptAt: at, lastRunId: reportId, lastRunStatus: "failed", lastFailureCode: "provider_unavailable", lastSuccessfulAt: earlier, baselineCount: 1 }; await click("data-brand-monitor-refresh");
      assert.ok(text(root()).includes(brandMonitorsCopy.en.failed)); assert.equal(root().findAllByProps({ "data-brand-monitor-last-success": true })[0].props.dateTime, earlier);
      fixture.current = { ...monitor(), lastSuccessfulAt: earlier, baselineCount: 1 }; await click("data-brand-monitor-refresh"); assert.ok(text(root()).includes(brandMonitorsCopy.en.noAttempt)); assert.equal(root().findAllByProps({ "data-brand-monitor-last-success": true })[0].props.dateTime, earlier);
      await mount(monitor()); assert.ok(text(root()).includes(brandMonitorsCopy.en.noAttempt)); fixture.scheduled = true; props.now += 5000; await act(async () => renderer!.update(tree())); await click("data-brand-monitor-refresh"); assert.ok(text(root()).includes(brandMonitorsCopy.en.overdue));
    });
    await t.test("alert history preserves previous and current source dates, read receipt and paging", async () => {
      await mount(monitor()); fixture.alerts = Array.from({ length: 21 }, (_, index) => alert(index + 1)); await click("data-brand-monitor-refresh");
      const first = root().findAllByProps({ "data-brand-monitor-alert": alert().id })[0]; assert.equal(first.findAllByType("time").filter(node => node.props.dateTime === earlier).length, 1); assert.equal(first.findAllByType("a").every(node => node.props.href === source && node.props.rel === "noopener noreferrer"), true);
      await click("data-brand-alert-ack"); assert.equal(fixture.mutations[0].action, "ack"); assert.equal(root().findAllByProps({ "data-brand-monitor-alert": alert().id })[0].props["data-brand-alert-read"], true);
      await click("data-brand-alert-next"); assert.equal(fixture.reads.at(-1)!.alertOffset, 20); assert.equal(root().findAllByProps({ "data-brand-monitor-alert": alert(21).id }).length, 1);
      await click("data-brand-alert-previous"); assert.equal(fixture.reads.at(-1)!.alertOffset, 0); assert.equal(fixture.mutations.length, 1);
    });
    await t.test("unknown configure write keeps exact key after GET and blocks any new mutation", async () => {
      await mount(); fixture.mode = "uncertain"; await click("data-brand-monitor-enable"); assert.ok(text(root()).includes(brandMonitorsCopy.en.uncertain)); assert.equal(fixture.activities.at(-1), true);
      fixture.current = monitor(); await click("data-brand-monitor-refresh"); assert.ok(text(root()).includes(brandMonitorsCopy.en.uncertain)); assert.equal(root().findAllByType("button").filter(node => node.props["data-brand-monitor-pause"]).length, 0);
      fixture.mode = "success"; await click("data-brand-monitor-retry"); assert.deepEqual(fixture.mutations[0], fixture.mutations[1]); assert.equal(fixture.activities.at(-1), false);
      await mount(monitor()); fixture.mode = "conflict"; await click("data-brand-monitor-pause"); assert.ok(text(root()).includes(brandMonitorsCopy.en.conflict)); assert.ok(fixture.reads.length >= 2); assert.equal(fixture.current!.version, 3);
    });
    await t.test("double click and account or report replacement fence late writes", async () => {
      await mount(); fixture.mode = "hold"; await act(async () => { button("data-brand-monitor-enable").props.onClick(); button("data-brand-monitor-enable").props.onClick(); }); assert.equal(fixture.mutations.length, 1);
      props.ownerId = "account-b"; fixture.current = null; await act(async () => renderer!.update(tree())); await act(async () => fixture.release?.());
      assert.equal(root().findAllByProps({ "data-brand-monitor-status": "active" }).length, 0); assert.ok(text(root()).includes(brandMonitorsCopy.en.empty));
    });
  } finally { if (renderer) await act(async () => renderer!.unmount()); await vite.close(); if (original) Object.defineProperty(globalThis, key, original); else Reflect.deleteProperty(globalThis, key); }
});
