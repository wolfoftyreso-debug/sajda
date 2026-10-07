import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { createElement as h } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { createServer } from "vite";
import { brandChecksCopy } from "../src/i18n/brandChecksCopy";
import { BRAND_CHECK_METHODOLOGY_VERSION, type BrandCheckRun, type BrandChecksStartInput } from "../shared/brand-checks";
import { brandRegistrySourceUrl } from "../shared/brand-evidence";

function text(node: ReactTestInstance): string { return node.children.map(child => typeof child === "string" ? child : text(child)).join(""); }
const reportId = "abcdaaaa-0000-4000-8000-000000000001", at = "2026-10-07T12:00:00.000Z";
function completed(index = 1): BrandCheckRun { return { id: `abcdaaaa-0000-4000-8000-${String(index).padStart(12, "0")}`, reportId, reportVersion: 1, status: "completed", requestedAt: at, completedAt: at, methodologyVersion: BRAND_CHECK_METHODOLOGY_VERSION, failureCode: null,
  entries: [{ id: "check:domain:example.com", target: "example.com", kind: "domain", origin: "provider_observation", state: "checked", freshness: "current", statement: "domain_registered", source_url: brandRegistrySourceUrl("example.com", "verisign-rdap"), observed_at: at }] }; }

test("saved-check interface distinguishes latest attempts, dated history and uncertain requests", async t => {
  const key = "__BRAND_CHECK_UI__", originals = new Map([key, "window"].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const timers = new Map<number, () => void>(); let timerId = 0;
  const fixture = { rows: [] as BrandCheckRun[], reads: [] as { version: number; offset: number; limit: number }[], starts: [] as BrandChecksStartInput[], mode: "success", release: null as (() => void) | null, readFails: false, activities: [] as boolean[],
    async history(_scope: unknown, selector: { version: number; offset: number; limit: number }) { fixture.reads.push(selector); if (fixture.readFails) throw { code: "unavailable" }; return { runs: structuredClone(fixture.rows.slice(selector.offset, selector.offset + selector.limit)), total: fixture.rows.length, offset: selector.offset, limit: selector.limit, hasMore: selector.offset + selector.limit < fixture.rows.length }; },
    async start(_scope: unknown, input: BrandChecksStartInput) { fixture.starts.push(structuredClone(input));
      if (fixture.mode === "hold") await new Promise<void>(resolve => { fixture.release = resolve; });
      if (fixture.mode === "uncertain") throw { code: "unavailable" };
      if (fixture.mode === "pending_conflict") { fixture.rows = [{ ...completed(), status: "pending", completedAt: null, entries: [] }]; throw { code: "pending" }; }
      const value = { ...completed(), id: input.requestKey, reportId: input.reportId, reportVersion: input.expectedVersion }; fixture.rows = [value, ...fixture.rows.filter(run => run.id !== value.id)]; return { run: value };
    },
  };
  Object.defineProperty(globalThis, key, { configurable: true, value: fixture });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { setTimeout: (callback: () => void) => { const id = ++timerId; timers.set(id, callback); return id; }, clearTimeout: (id: number) => timers.delete(id) } });
  const vite = await createServer({ configFile: false, appType: "custom", server: { middlewareMode: true, watch: null, hmr: false, ws: false }, resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" }, plugins: [{ name: "archived-check-presentation-boundary", enforce: "pre", async load(raw) {
    const file = raw.replaceAll("\\", "/");
    if (file.endsWith("/src/pages/BrandIndexAssessment.tsx")) return (await readFile(file, "utf8")) + "\nexport { SavedBrandChecks };";
    if (file.endsWith("/src/contexts/AuthContext.tsx")) return "export const useAuth=()=>({user:null});";
    if (file.endsWith("/src/i18n/LanguageProvider.tsx")) return "export const useLanguage=()=>({language:'en'});export const applyDocumentMetadata=()=>{};";
    if (file.endsWith("/src/lib/appSurface.ts")) return "export const isNativeApp=false;";
    if (file.endsWith("/src/lib/nativeTransport.ts")) return "export const nativeShareFile=async()=>({completed:false});";
    if (file.endsWith("/src/components/LanguageSwitcher.tsx") || file.endsWith("/src/components/FreeSearchGate.tsx")) return "export default function Hidden(){return null;}";
    if (file.endsWith("/src/contexts/ScanContext.tsx")) return "export const useScan=()=>({isScanning:false});";
    if (file.endsWith("/src/lib/localTestSearch.ts")) return "export const runAnonymousSearch=async()=>({results:[]});";
    if (file.endsWith("/src/lib/brandReportsClient.ts")) return "export class BrandReportsError extends Error{};export const getBrandReports=async()=>({reports:[]});export const getBrandReport=async()=>({});export const getBrandReportHistory=async()=>({versions:[]});export const saveBrandReport=async()=>({});export const brandReportSaveFailureIsUncertain=()=>false;";
    if (file.endsWith("/src/lib/brandChecksClient.ts")) return `const f=globalThis.${key};export class BrandChecksError extends Error{constructor(code){super(code);this.code=code;}};const wrap=async(fn,args)=>{try{return await fn(...args);}catch(error){throw new BrandChecksError(error.code||'unavailable');}};export const getBrandChecks=(...args)=>wrap(f.history,args);export const startBrandCheck=(...args)=>wrap(f.start,args);export const brandCheckFailureIsUncertain=error=>error.code==='unavailable';`;
  } }] });
  let renderer: ReactTestRenderer | undefined;
  const activity = (value: boolean) => fixture.activities.push(value);
  let props = { ownerId: "account-a", reportId, reportVersion: 1, historical: false, latest: true, clean: true, blocked: false, language: "en", now: Date.parse(at), onUnsettledChange: activity };
  try {
    const Component = (await vite.ssrLoadModule("/src/pages/BrandIndexAssessment.tsx")).SavedBrandChecks;
    const tree = () => h(Component, { ...props, key: `${props.ownerId}:${props.reportId}:${props.reportVersion}` });
    const root = () => renderer!.root;
    const button = (attribute: string) => root().findAllByType("button").find(node => node.props[attribute])!;
    const click = async (attribute: string) => { await act(async () => button(attribute).props.onClick()); };
    const mount = async (rows: BrandCheckRun[] = []) => { if (renderer) await act(async () => renderer!.unmount()); fixture.rows = rows; fixture.reads = []; fixture.starts = []; fixture.mode = "success"; fixture.release = null; fixture.readFails = false; fixture.activities = []; timers.clear(); props = { ...props, ownerId: "account-a", reportId, reportVersion: 1, historical: false, latest: true, clean: true, blocked: false, language: "en", now: Date.parse(at) }; await act(async () => { renderer = create(tree()); }); };
    await t.test("new check requires clean latest saved report and is explicit in every language", async () => {
      await mount(); assert.equal(fixture.starts.length, 0); assert.equal(fixture.reads[0].version, 1); assert.equal(fixture.reads[0].limit, 20);
      for (const language of ["en", "sv", "es", "fr", "zh"] as const) { props.language = language; await act(async () => renderer!.update(tree())); assert.ok(text(root()).includes(brandChecksCopy[language].action)); assert.ok(text(root()).includes(brandChecksCopy[language].help)); }
      props.clean = false; await act(async () => renderer!.update(tree())); assert.equal(button("data-brand-archived-check-start").props.disabled, true); await click("data-brand-archived-check-start"); assert.equal(fixture.starts.length, 0);
      props.clean = true; props.historical = true; await act(async () => renderer!.update(tree())); assert.equal(root().findAllByType("button").filter(node => node.props["data-brand-archived-check-start"]).length, 0); assert.ok(text(root()).includes(brandChecksCopy.zh.historical));
    });
    await t.test("archive source dates remain original across refresh, aging and history paging", async () => {
      await mount(Array.from({ length: 21 }, (_, index) => completed(index + 1))); const latest = () => root().findAllByType("section").find(node => node.props["data-brand-latest-check-status"] === "completed")!;
      assert.equal(latest().findAllByType("time").filter(node => node.props.dateTime === at).length, 3);
      props.now += 40 * 86_400_000; await act(async () => renderer!.update(tree())); assert.equal(latest().findAllByProps({ "data-evidence-freshness": "stale" }).length, 1);
      await click("data-brand-check-next"); assert.equal(fixture.reads.at(-1)!.offset, 20); assert.equal(root().findAllByProps({ "data-brand-historical-check": completed(21).id }).length, 1);
      await click("data-brand-check-previous"); assert.equal(fixture.reads.at(-1)!.offset, 0); assert.equal(fixture.starts.length, 0); assert.equal(latest().findAllByType("time").at(-1)!.props.dateTime, at);
    });
    await t.test("failed latest attempt stays unknown and never displays earlier success as current", async () => {
      await mount([{ ...completed(2), status: "failed", completedAt: at, entries: [], failureCode: "provider_unavailable" }, completed(1)]);
      const latest = root().findAllByProps({ "data-brand-latest-check-status": "failed" })[0]; assert.ok(text(latest).includes(brandChecksCopy.en.failed)); assert.equal(latest.findAllByProps({ "data-brand-evidence": true }).length, 0);
      const history = root().findAllByType("details").find(node => node.props["data-brand-check-history"])!; assert.notEqual(history.props.open, true); assert.ok(text(history).includes(brandChecksCopy.en.historyCompleted));
    });
    await t.test("ambiguous request retries exact key; a read outage cannot create a fresh request", async () => {
      await mount(); fixture.mode = "uncertain"; await click("data-brand-archived-check-start"); assert.ok(text(root()).includes(brandChecksCopy.en.uncertain)); assert.equal(fixture.activities.at(-1), true);
      fixture.readFails = true; await click("data-brand-archived-check-refresh"); fixture.mode = "success"; await click("data-brand-archived-check-start");
      assert.deepEqual(fixture.starts[0], fixture.starts[1]); assert.equal(fixture.activities.at(-1), false);
    });
    await t.test("other-tab pending admission follows canonical GET and never starts a second request", async () => {
      await mount(); fixture.mode = "pending_conflict"; await click("data-brand-archived-check-start"); assert.ok(fixture.reads.length >= 2);
      assert.equal(button("data-brand-archived-check-start").props.disabled, true); await click("data-brand-archived-check-start"); assert.equal(fixture.starts.length, 1);
      for (let index = 0; index < 6; index++) { const [id, callback] = timers.entries().next().value ?? []; assert.ok(callback); timers.delete(id); await act(async () => callback()); }
      assert.ok(text(root()).includes(brandChecksCopy.en.wait)); assert.equal(fixture.starts.length, 1);
    });
    await t.test("double click and report/account replacement fence delayed responses", async () => {
      await mount(); fixture.mode = "hold"; await act(async () => { button("data-brand-archived-check-start").props.onClick(); button("data-brand-archived-check-start").props.onClick(); }); assert.equal(fixture.starts.length, 1);
      props.ownerId = "account-b"; fixture.rows = []; await act(async () => renderer!.update(tree())); await act(async () => fixture.release?.());
      assert.equal(root().findAllByProps({ "data-brand-latest-check-status": "completed" }).length, 0); assert.ok(text(root()).includes(brandChecksCopy.en.empty));
    });
  } finally { if (renderer) await act(async () => renderer!.unmount()); await vite.close(); for (const [name, descriptor] of originals) if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name); }
});
