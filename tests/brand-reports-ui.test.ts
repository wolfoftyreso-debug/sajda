import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createElement as h } from "react";
import { MemoryRouter } from "react-router-dom";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { createServer } from "vite";
import { assessBrandPresence, type BrandIndexInput } from "../shared/brand-presence-index";
import type { BrandReportSaveInput, BrandReportSnapshot, BrandReportSummary } from "../shared/brand-reports";
import { brandReportsCopy } from "../src/i18n/brandReportsCopy";
import { SOCIAL_PLATFORMS } from "../shared/name-packages";

function label(node: ReactTestInstance): string { return node.children.map(child => typeof child === "string" ? child : label(child)).join(""); }
const savedAt = "2026-09-01T12:00:00.000Z", id = "abcdaaaa-0000-4000-8000-000000000001";
const assessment: BrandIndexInput = { brand_name: "Existing Brand", identity_label: "existingbrand", primary_domain: "existingbrand.com", domains: ["existingbrand.com"], socials: [{ platform: "github", handle: "existingbrand" }], markets: ["US"], observations: [{ target_id: "domain:existingbrand.com", status: "reported_owned", source_url: "https://example.com/evidence", reported_at: savedAt }] };
function snapshot(version = 1): BrandReportSnapshot { return { id, title: assessment.brand_name, version, savedAt, assessment: structuredClone(assessment), result: assessBrandPresence(assessment, Date.now()) }; }
function summary(version = 1): BrandReportSummary { return { id, title: assessment.brand_name, version, createdAt: savedAt, updatedAt: savedAt }; }

test("account brand worksheet preserves immutable dates, retries and safe historical navigation", async t => {
  const key = "__BRAND_REPORTS_UI__", events = new Map<string, (event?: unknown) => void>();
  const originals = new Map([key, "window", "document"].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const fixture = {
    user: { id: "account-a", email_verified: true } as { id: string; email_verified: boolean } | null, language: "en",
    reports: [] as BrandReportSummary[], snapshots: new Map<string, BrandReportSnapshot>(), requests: [] as BrandReportSaveInput[],
    mode: "success", release: null as (() => void) | null, checkCalls: 0, listCalls: 0, historyCalls: 0, openCalls: 0,
    async list() { fixture.listCalls++; return { reports: fixture.reports }; },
    async open(_scope: unknown, selector: { id: string; version?: number }) { fixture.openCalls++; return { report: fixture.snapshots.get(`${selector.id}:${selector.version ?? fixture.reports.find(row => row.id === selector.id)!.version}`)! }; },
    async history() { fixture.historyCalls++; return { versions: [...fixture.snapshots.values()].map(row => ({ id: row.id, title: row.title, version: row.version, savedAt: row.savedAt })) }; },
    async save(_scope: unknown, raw: BrandReportSaveInput) {
      fixture.requests.push(structuredClone(raw)); const value: BrandReportSnapshot = { id: raw.id, title: raw.title, version: raw.expectedVersion + 1, savedAt, assessment: structuredClone(raw.assessment), result: assessBrandPresence(raw.assessment, Date.now()) };
      if (fixture.mode === "hold") await new Promise<void>(resolve => { fixture.release = resolve; });
      if (fixture.mode === "uncertain" || fixture.mode === "conflict") throw Object.assign(new Error("Synthetic failure"), { code: fixture.mode === "uncertain" ? "unavailable" : "conflict" });
      const current = fixture.reports.find(row => row.id === raw.id);
      fixture.snapshots.set(`${value.id}:${value.version}`, value);
      if (!current || current.version <= value.version) fixture.reports = [{ id: value.id, title: value.title, version: value.version, createdAt: savedAt, updatedAt: savedAt }, ...fixture.reports.filter(row => row.id !== value.id)];
      return { report: value };
    },
  };
  Object.defineProperty(globalThis, key, { configurable: true, value: fixture });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { pathname: "/brand-index/assessment" }, setInterval: () => 1, clearInterval() {}, setTimeout: () => 1, addEventListener: (event: string, callback: (event?: unknown) => void) => events.set(event, callback), removeEventListener: (event: string) => events.delete(event), get localStorage() { throw new Error("Private report must not use local storage"); } } });
  Object.defineProperty(globalThis, "document", { configurable: true, value: {} });
  const vite = await createServer({ configFile: false, appType: "custom", server: { middlewareMode: true, watch: null, hmr: false, ws: false }, resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" }, plugins: [{ name: "brand-report-view-boundaries", enforce: "pre", load(raw) {
    const file = raw.replaceAll("\\", "/");
    if (file.endsWith("/src/i18n/LanguageProvider.tsx")) return `export const useLanguage=()=>({language:globalThis.${key}.language});export const applyDocumentMetadata=()=>{};`;
    if (file.endsWith("/src/contexts/AuthContext.tsx")) return `export const useAuth=()=>({user:globalThis.${key}.user});`;
    if (file.endsWith("/src/lib/appSurface.ts")) return "export const isNativeApp=false;";
    if (file.endsWith("/src/lib/nativeTransport.ts")) return "export const nativeShareFile=async()=>({completed:false});";
    if (file.endsWith("/src/components/LanguageSwitcher.tsx") || file.endsWith("/src/components/FreeSearchGate.tsx")) return "export default function Hidden(){return null;}";
    if (file.endsWith("/src/contexts/ScanContext.tsx")) return `export const useScan=()=>({isScanning:false,requestAnonymousSearchAccess:()=>({complete(){},release(){}})});`;
    if (file.endsWith("/src/lib/localTestSearch.ts")) return `export const runAnonymousSearch=async(_tlds,_count,_theme,_language,options)=>{globalThis.${key}.checkCalls++;return {results:options.domains.map(domain=>({domain,status:'taken',authoritative:true,checkMethod:'rdap',source:'verisign-rdap',checkedAt:new Date(Date.now()).toISOString()}))};};`;
    if (file.endsWith("/src/lib/brandReportsClient.ts")) return `const f=globalThis.${key};export class BrandReportsError extends Error {constructor(code){super(code);this.code=code;}};const wrap=async(fn,args)=>{try{return await fn(...args);}catch(error){throw new BrandReportsError(error.code||'unavailable');}};export const getBrandReports=(...args)=>wrap(f.list,args);export const getBrandReport=(...args)=>wrap(f.open,args);export const getBrandReportHistory=(...args)=>wrap(f.history,args);export const saveBrandReport=(...args)=>wrap(f.save,args);export const brandReportSaveFailureIsUncertain=error=>error.code==='unavailable';`;
  } }] });
  let renderer: ReactTestRenderer | undefined;
  try {
    const Page = (await vite.ssrLoadModule("/src/pages/BrandIndexAssessment.tsx")).default;
    const tree = () => h(MemoryRouter, { initialEntries: ["/brand-index/assessment"] }, h(Page));
    const root = () => renderer!.root;
    const element = (attribute: string, value: unknown = true) => root().findAllByType("button").find(node => node.props[attribute] === value)!;
    const click = async (attribute: string, value?: unknown) => { await act(async () => element(attribute, value).props.onClick()); };
    const change = async (name: string, value: string) => { await act(async () => root().findByProps({ id: name }).props.onChange({ target: { value } })); };
    const target = (targetId: string) => root().findAllByType("details").find(node => node.props["data-brand-target"] === targetId)!;
    const mount = async (existing = false) => {
      if (renderer) await act(async () => renderer!.unmount()); fixture.user = { id: "account-a", email_verified: true }; fixture.language = "en"; fixture.mode = "success"; fixture.release = null; fixture.requests = []; fixture.reports = existing ? [summary()] : []; fixture.snapshots = existing ? new Map([[`${id}:1`, snapshot()]]) : new Map(); fixture.listCalls = 0; fixture.openCalls = 0; fixture.historyCalls = 0; fixture.checkCalls = 0;
      await act(async () => { renderer = create(tree()); });
    };
    const build = async () => {
      await change("brand-index-name", "New Brand"); await change("brand-index-identity", "newbrand"); await change("brand-index-primary", "newbrand.com");
      for (const platform of SOCIAL_PLATFORMS.filter(value => value !== "github")) await act(async () => root().findAllByType("input").find(node => node.props["data-brand-platform"] === platform)!.props.onChange());
      await act(async () => root().findAllByType("button").find(node => node.props["data-market-preset"] === "us")!.props.onClick());
      await act(async () => root().findByType("form").props.onSubmit({ preventDefault() {} }));
    };
    await t.test("guest and unverified modes remain honest local work in all five languages", async () => {
      await mount(); fixture.user = null; await act(async () => renderer!.update(tree())); const before = fixture.listCalls;
      for (const language of ["en", "sv", "es", "fr", "zh"] as const) {
        fixture.language = language; await act(async () => renderer!.update(tree())); assert.ok(label(root()).includes(brandReportsCopy[language].guest));
        const panel = root().findAllByType("section").find(node => node.props["data-brand-account-reports"])!;
        const details = panel.findByType("details"); assert.notEqual(details.props.open, true);
        assert.equal(label(details.findByType("summary")), brandReportsCopy[language].privacy);
        assert.ok(label(details).includes(brandReportsCopy[language].help)); assert.ok(label(details).includes(brandReportsCopy[language].sessionChecks));
      }
      assert.equal(fixture.listCalls, before); fixture.user = { id: "unverified", email_verified: false }; fixture.language = "en"; await act(async () => renderer!.update(tree()));
      assert.ok(label(root()).includes(brandReportsCopy.en.verify)); assert.equal(fixture.listCalls, before);
    });
    await t.test("recorded reports save once, clear account dirty state and load original dates without checks", async () => {
      await mount(); await build(); assert.equal(events.has("beforeunload"), true);
      const row = () => target("domain:newbrand.com");
      await act(async () => row().findByType("select").props.onChange({ target: { value: "reported_owned" } }));
      assert.equal(element("data-brand-report-save").props.disabled, true); assert.ok(label(root()).includes(brandReportsCopy.en.unrecorded));
      await act(async () => row().findByType("form").props.onSubmit({ preventDefault() {} }));
      const original = row().findByType("time").props.dateTime;
      await click("data-brand-report-save"); assert.equal(fixture.requests.length, 1); assert.equal(fixture.requests[0].assessment.observations[0].reported_at, original);
      assert.equal(events.has("beforeunload"), false); assert.equal(element("data-brand-report-save").props.disabled, true); assert.ok(label(root()).includes(brandReportsCopy.en.saved));
      const savedId = fixture.requests[0].id; await click("data-brand-report-open", savedId);
      assert.equal(row().findByType("time").props.dateTime, original); assert.equal(events.has("beforeunload"), false); assert.equal(fixture.checkCalls, 0);
      assert.equal(root().findAllByProps({ "data-brand-verified-score": "unavailable" }).length, 1);
    });
    await t.test("unrecorded changes and session checks cannot silently be discarded by loading another report", async () => {
      await mount(true); await build(); const opens = fixture.openCalls;
      await click("data-brand-report-open", id); assert.equal(fixture.openCalls, opens); assert.ok(label(root()).includes(brandReportsCopy.en.leaveBody));
      await act(async () => root().findAllByType("button").find(node => label(node) === brandReportsCopy.en.keep)!.props.onClick()); assert.equal(fixture.openCalls, opens);
      await click("data-brand-report-open", id); await click("data-brand-report-discard-open"); assert.equal(fixture.openCalls, opens + 1);
      assert.equal(target("domain:existingbrand.com").findByType("time").props.dateTime, savedAt);
      await click("data-brand-check-domains"); assert.equal(fixture.checkCalls, 1); assert.equal(events.has("beforeunload"), true);
      await click("data-brand-report-open", id); assert.equal(fixture.openCalls, opens + 1, "Session-only registry evidence needs explicit discard too");
      await click("data-brand-report-discard-open"); assert.equal(fixture.openCalls, opens + 2); assert.equal(events.has("beforeunload"), false);
      assert.equal(fixture.checkCalls, 1, "Reopening does not fetch new checks or restore browser-derived verified evidence");
      await act(async () => target("domain:existingbrand.com").findByType("input").props.onChange({ target: { value: "https://example.com/draft" } }));
      assert.equal(events.has("beforeunload"), true); assert.equal(element("data-brand-report-save").props.disabled, true);
      await click("data-brand-report-open", id); assert.equal(fixture.openCalls, opens + 2);
    });
    await t.test("history is read only; explicit copy retains original dates and gets a different report ID", async () => {
      await mount(true); await click("data-brand-report-open", id); await click("data-brand-report-history", id); await click("data-brand-report-version", 1);
      assert.ok(label(root()).includes(brandReportsCopy.en.historical)); assert.equal(target("domain:existingbrand.com").findByType("select").props.disabled, true);
      assert.equal(element("data-brand-check-domains").props.disabled, true); assert.equal(root().findAllByType("button").filter(node => node.props["data-brand-report-save"]).length, 0);
      await click("data-brand-report-copy"); assert.equal(target("domain:existingbrand.com").findByType("select").props.disabled, false);
      await click("data-brand-report-save"); assert.notEqual(fixture.requests[0].id, id); assert.equal(fixture.requests[0].expectedVersion, 0);
      assert.equal(fixture.requests[0].assessment.observations[0].reported_at, savedAt);
    });
    await t.test("API report titles survive updates and conflict-copy never drops unrecorded fields", async () => {
      await mount(true); const customTitle = "Existing Brand — European launch review";
      fixture.snapshots.set(`${id}:1`, { ...snapshot(), title: customTitle }); fixture.reports = [{ ...summary(), title: customTitle }];
      await click("data-brand-report-open", id);
      await act(async () => target("domain:existingbrand.com").findByType("select").props.onChange({ target: { value: "reported_conflict" } }));
      await act(async () => target("domain:existingbrand.com").findByType("form").props.onSubmit({ preventDefault() {} }));
      fixture.mode = "conflict"; await click("data-brand-report-save"); assert.equal(fixture.requests[0].title, customTitle);
      await act(async () => target("domain:existingbrand.com").findByType("input").props.onChange({ target: { value: "https://example.com/unsaved" } }));
      assert.equal(element("data-brand-report-conflict-copy").props.disabled, true);
      await click("data-brand-report-conflict-copy"); assert.equal(target("domain:existingbrand.com").findByType("input").props.value, "https://example.com/unsaved");
      assert.ok(label(root()).includes(brandReportsCopy.en.unrecorded));
      await act(async () => target("domain:existingbrand.com").findByType("form").props.onSubmit({ preventDefault() {} }));
      await click("data-brand-report-conflict-copy"); fixture.mode = "success"; await click("data-brand-report-save");
      assert.notEqual(fixture.requests[1].id, id); assert.equal(fixture.requests[1].assessment.observations[0].source_url, "https://example.com/unsaved");
    });
    await t.test("ambiguous saves lock editing, retry exact keys, and do not downgrade another tab’s newer version", async () => {
      await mount(true); await click("data-brand-report-open", id);
      await act(async () => target("domain:existingbrand.com").findByType("select").props.onChange({ target: { value: "reported_conflict" } }));
      await act(async () => target("domain:existingbrand.com").findByType("form").props.onSubmit({ preventDefault() {} }));
      fixture.mode = "uncertain"; await click("data-brand-report-save"); assert.ok(label(root()).includes(brandReportsCopy.en.pending));
      assert.equal(target("domain:existingbrand.com").findByType("select").props.disabled, true); assert.equal(element("data-brand-report-open", id).props.disabled, true);
      fixture.reports = [summary(3)]; fixture.snapshots.set(`${id}:3`, snapshot(3)); fixture.mode = "success";
      await click("data-brand-report-save"); assert.deepEqual(fixture.requests[0], fixture.requests[1]);
      assert.equal(fixture.requests[1].expectedVersion, 1); assert.ok(label(root().findAllByType("details").find(node => node.props["data-brand-report-list"])!).includes("Version 3"));
      assert.equal(events.has("beforeunload"), false);
    });
    await t.test("double-click and account switch ignore delayed responses and clear private drafts", async () => {
      await mount(); await build(); fixture.mode = "hold";
      await act(async () => { element("data-brand-report-save").props.onClick(); element("data-brand-report-save").props.onClick(); }); assert.equal(fixture.requests.length, 1);
      fixture.user = { id: "account-b", email_verified: true }; fixture.reports = []; await act(async () => renderer!.update(tree()));
      await act(async () => fixture.release?.()); assert.equal(root().findByProps({ id: "brand-index-name" }).props.value, "");
      assert.equal(root().findAllByProps({ "data-brand-index-result": true }).length, 0); assert.ok(!label(root()).includes(brandReportsCopy.en.saved));
    });
  } finally { if (renderer) await act(async () => renderer!.unmount()); await vite.close(); for (const [name, descriptor] of originals) if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name); }
});
