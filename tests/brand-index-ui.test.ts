import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { createElement as h } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { createServer } from "vite";
import { brandIndexCopy } from "../src/i18n/brandIndexCopy";
import { brandDomainCheckCopy } from "../src/i18n/brandDomainCheckCopy";
import { brandWorksheetCopy } from "../src/i18n/brandWorksheetCopy";
import { SOCIAL_PLATFORMS } from "../shared/name-packages";
import { applyDocumentMetadata } from "../src/i18n/LanguageProvider";
import { isPrivateResultPath, isPublicIndexPath } from "../src/lib/seoDocuments";

function label(node: ReactTestInstance): string { return node.children.map(child => typeof child === "string" ? child : label(child)).join(""); }

test("brand index has a public local route and entries distinct from name discovery", async () => {
  const routes = await readFile("src/app/ProductRoutes.tsx", "utf8");
  assert.match(routes, /<Route path="\/brand-index" element=\{<BrandIndex \/>\} \/>/);
  assert.match(routes, /<Route path="\/brand-index\/assessment" element=\{<BrandIndexAssessment \/>\} \/>/);
  assert.match(routes, /path="\/account" element=\{<ProtectedRoute>/);
  assert.match(await readFile("src/pages/NamePackages.tsx", "utf8"), /to="\/brand-index"/);
  const developers = await readFile("src/pages/Developers.tsx", "utf8");
  assert.equal([...developers.matchAll(/<BrandIndexApiGuide language=\{language\} \/>/g)].length, 2, "Both web and native developer surfaces expose the worksheet guide");
  assert.match(await readFile("src/components/BrandIndexApiGuide.tsx", "utf8"), /href="\/brand-index\/assessment"/);
});

test("assessment metadata describes the local audit in every language without becoming indexable", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "document");
  const metadata = new Map<string, string>();
  const document = { title: "", documentElement: { lang: "" }, querySelector: (selector: string) => ({ setAttribute: (_key: string, value: string) => metadata.set(selector, value) }) };
  Object.defineProperty(globalThis, "document", { configurable: true, value: document });
  try {
    for (const language of ["en", "sv", "es", "fr", "zh"] as const) for (const path of ["/brand-index/assessment", "/brand-index/assessment/"]) {
      applyDocumentMetadata(language, path);
      assert.equal(document.title, `${brandIndexCopy[language].title} — Sajda`);
      assert.equal(metadata.get("meta[name='description']"), brandIndexCopy[language].intro);
      assert.equal(metadata.get("meta[property='og:title']"), document.title);
      assert.equal(metadata.get("meta[name='twitter:title']"), document.title);
      assert.equal(isPrivateResultPath(path), true); assert.equal(isPublicIndexPath(path), false);
    }
  } finally { if (original) Object.defineProperty(globalThis, "document", original); else Reflect.deleteProperty(globalThis, "document"); }
});

test("mounted existing-brand worksheet keeps all evidence self-reported, local and fixed-scope", async t => {
  const key = "__SAJDA_BRAND_INDEX_UI__";
  const originals = new Map([key, "window", "document"].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const originalFetch = globalThis.fetch, originalNow = Date.now;
  const originalCreateUrl = URL.createObjectURL, originalRevokeUrl = URL.revokeObjectURL;
  let now = Date.parse("2026-09-13T12:00:00.000Z"), calls = 0;
  Date.now = () => now;
  const fixture = { language: "en", user: null as { id: string } | null, checks: 0, completed: 0, released: 0, mode: "success", releaseCheck: null as (() => void) | null,
    nativeMode: "success", exports: [] as { filename: string; content: string }[], releaseExport: null as (() => void) | null,
    blob: null as Blob | null, downloads: [] as string[], revoked: [] as string[], webFail: false, metadata: [] as [string, string][] }, events = new Map<string, (event?: unknown) => void>();
  Object.defineProperty(globalThis, key, { configurable: true, value: fixture });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { pathname: "/brand-index/assessment" }, setInterval: () => 1, clearInterval() {}, setTimeout: (callback: () => void) => { callback(); return 1; }, addEventListener: (event: string, callback: (event?: unknown) => void) => events.set(event, callback), removeEventListener: (event: string) => events.delete(event),
    get localStorage() { throw new Error("Local worksheet must not use browser storage"); }, get sessionStorage() { throw new Error("Local worksheet must not use browser storage"); } } });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { body: { append() {} }, createElement: () => {
    const link = { href: "", download: "", click() { if (fixture.webFail) throw new Error("Synthetic download failure"); fixture.downloads.push(link.download); }, remove() {} }; return link;
  } } });
  URL.createObjectURL = blob => { fixture.blob = blob as Blob; return "blob:unit-export"; }; URL.revokeObjectURL = url => { fixture.revoked.push(url); };
  globalThis.fetch = async () => { calls++; throw new Error("Local brand assessment may never query external services"); };
  const vite = await createServer({ configFile: false, appType: "custom", server: { middlewareMode: true, watch: null, hmr: false, ws: false }, resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" },
    plugins: [{ name: "brand-index-presentation-boundaries", enforce: "pre", load(id) {
      const file = id.replaceAll("\\", "/");
      if (file.endsWith("/src/i18n/LanguageProvider.tsx")) return `export const useLanguage=()=>({language:globalThis.${key}.language});export const applyDocumentMetadata=(...args)=>globalThis.${key}.metadata.push(args);`;
      if (file.endsWith("/src/contexts/AuthContext.tsx")) return `export const useAuth=()=>({user:globalThis.${key}.user});`;
      if (file.endsWith("/src/lib/appSurface.ts")) return "export let isNativeApp=false;export const setTestNative=value=>{isNativeApp=value;};";
      if (file.endsWith("/src/lib/nativeTransport.ts")) return `export const nativeShareFile=async(filename,content)=>{const f=globalThis.${key};f.exports.push({filename,content});if(f.nativeMode==='fail')throw new Error('Synthetic export failure');if(f.nativeMode==='hold')await new Promise(resolve=>{f.releaseExport=resolve;});return {completed:f.nativeMode!=='cancel'};};`;
      if (file.endsWith("/src/components/LanguageSwitcher.tsx")) return "export default function LanguageSwitcher(){return null;}";
      if (file.endsWith("/src/contexts/ScanContext.tsx")) return `export const useScan=()=>({isScanning:false,requestAnonymousSearchAccess:()=>globalThis.${key}.mode==='denied'?null:({complete:()=>globalThis.${key}.completed++,release:()=>globalThis.${key}.released++})});`;
      if (file.endsWith("/src/components/FreeSearchGate.tsx")) return "export default function FreeSearchGate(){return null;}";
      if (file.endsWith("/src/lib/localTestSearch.ts")) return `export const runAnonymousSearch=async(_tlds,_count,_theme,_language,options)=>{const f=globalThis.${key};f.checks++;if(f.mode==='fail')throw new Error('Synthetic provider failure');const value={results:options.domains.map(domain=>({domain,status:'taken',authoritative:true,checkMethod:'rdap',source:'verisign-rdap',checkedAt:new Date(Date.now()).toISOString()}))};if(f.mode==='hold')return new Promise(resolve=>{f.releaseCheck=()=>resolve(value);});return value;};`;
    } }],
  });
  let renderer: ReactTestRenderer | undefined;
  try {
    const Page = (await vite.ssrLoadModule("/src/pages/BrandIndexAssessment.tsx")).default;
    const { setTestNative } = await vite.ssrLoadModule("/src/lib/appSurface.ts");
    function LocationProbe() { const location = useLocation(); return h("output", null, JSON.stringify({ pathname: location.pathname, search: location.search, state: location.state })); }
    const tree = () => h(MemoryRouter, { initialEntries: ["/brand-index/assessment"] }, h(Page), h(LocationProbe));
    const root = () => renderer!.root;
    const c = brandIndexCopy.en;
    const element = (id: string) => root().findByProps({ id });
    const change = async (id: string, value: string) => { await act(async () => element(id).props.onChange({ target: { value } })); };
    const button = (text: string) => { const found = root().findAllByType("button").find(node => label(node) === text); assert.ok(found, text); return found; };
    const click = async (text: string) => { await act(async () => button(text).props.onClick()); };
    const target = (id: string) => root().findAllByType("details").find(node => node.props["data-brand-target"] === id)!;
    const score = () => root().findAllByType("p").find(node => node.props["data-brand-reported-score"] !== undefined)!;
    const mount = async () => { if (renderer) await act(async () => renderer!.unmount()); fixture.language = "en"; fixture.user = null; fixture.mode = "success"; fixture.releaseCheck = null; fixture.nativeMode = "success"; fixture.exports = []; fixture.releaseExport = null; fixture.blob = null; fixture.downloads = []; fixture.revoked = []; fixture.webFail = false; setTestNative(false); now = Date.parse("2026-09-13T12:00:00.000Z"); calls = 0; await act(async () => { renderer = create(tree()); }); };
    const build = async () => {
      await change("brand-index-name", "ExampleBrand"); await change("brand-index-identity", "examplebrand"); await change("brand-index-primary", "examplebrand.com");
      for (const platform of SOCIAL_PLATFORMS.filter(value => value !== "github")) await act(async () => root().findAllByType("input").find(node => node.props["data-brand-platform"] === platform)!.props.onChange());
      await act(async () => root().findAllByType("button").find(node => node.props["data-market-preset"] === "us")!.props.onClick());
      await act(async () => root().findByType("form").props.onSubmit({ preventDefault() {} }));
    };
    const record = async (id: string, status: string, source?: string) => {
      await act(async () => target(id).findByType("select").props.onChange({ target: { value: status } }));
      if (source !== undefined) await act(async () => target(id).findByType("input").props.onChange({ target: { value: source } }));
      await act(async () => target(id).findByType("form").props.onSubmit({ preventDefault() {} }));
    };

    await t.test("empty/invalid input is rejected and default scope does not invent reports", async () => {
      await mount(); assert.equal(root().findAllByType("h1").length, 1); assert.ok(label(root()).includes(brandDomainCheckCopy.en.privacy));
      assert.deepEqual(fixture.metadata.at(-1), ["en", "/brand-index/assessment"]);
      for (const href of ["/brand-index", "/name-packages"]) assert.equal(root().findAllByType("a").filter(node => node.props.href === href).length, 1, "Keep task navigation without duplicate promo links");
      await act(async () => root().findByType("form").props.onSubmit({ preventDefault() {} }));
      assert.equal(root().findAllByProps({ role: "alert" }).length, 1); assert.equal(root().findAllByProps({ "data-brand-index-result": true }).length, 0);
      await build(); assert.equal(score().props["data-brand-reported-score"], "unavailable"); assert.equal(label(score()), c.notEnough);
      assert.equal(root().findAllByProps({ "data-brand-verified-score": "unavailable" }).length, 1);
      assert.equal(target("social:github:examplebrand").findByType("select").props.value, "unknown");
      assert.equal(root().findAllByType("time").length, 0); assert.equal(calls, 0);
      assert.ok(!root().findByType("output").children.join("").includes("ExampleBrand"));
    });
    await t.test("explicit reports alone update timestamps; a ready score never becomes independently verified", async () => {
      await mount(); await build();
      const id = "domain:examplebrand.com";
      await act(async () => target(id).findByType("select").props.onChange({ target: { value: "reported_owned" } }));
      assert.equal(root().findAllByType("time").length, 0, "Draft choice is not a report");
      await record(id, "reported_owned", "https://example.com/ownership");
      const originalStamp = target(id).findByType("time").props.dateTime;
      now += 60_000;
      await act(async () => target(id).findByType("input").props.onChange({ target: { value: "https://example.com/other-source" } }));
      assert.equal(target(id).findByType("time").props.dateTime, originalStamp, "Editing a URL never freshens evidence");
      assert.equal(score().props["data-brand-reported-score"], "unavailable");
      await record("social:github:examplebrand", "reported_owned"); assert.equal(score().props["data-brand-reported-score"], "unavailable", "Every group needs a resolved report");
      await record("market:US", "reported_authorized"); assert.equal(score().props["data-brand-reported-score"], 100);
      assert.equal(root().findAllByProps({ "data-brand-verified-score": "unavailable" }).length, 1);
      assert.ok(label(root()).includes(c.warning)); assert.ok(label(root()).includes(c.reportedTime)); assert.equal(calls, 0);
      now += 31 * 24 * 60 * 60_000;
      await act(async () => events.get("focus")?.());
      assert.equal(score().props["data-brand-reported-score"], "unavailable"); assert.ok(label(target(id)).includes(c.freshness.stale));
      assert.equal(target(id).findByType("time").props.dateTime, originalStamp);
    });
    await t.test("name matching is not ownership and unsafe source URLs never apply", async () => {
      await mount(); await build();
      await record("domain:examplebrand.com", "matching_name_only");
      await record("social:github:examplebrand", "matching_name_only");
      await record("market:US", "unknown");
      assert.equal(score().props["data-brand-reported-score"], "unavailable");
      for (const source of ["http://example.com", "https://example.com/?secret=private", "https://name:password@example.com", "https://example.com/#proof", "https://127.0.0.1/"]) {
        await record("domain:examplebrand.com", "reported_owned", source);
        assert.ok(label(target("domain:examplebrand.com")).includes(c.invalidReport));
        assert.ok(label(target("domain:examplebrand.com").findByType("summary")).includes(c.statuses.matching_name_only));
      }
      assert.equal(calls, 0);
    });
    await t.test("scope edits require confirmation and clear every existing report", async () => {
      await mount(); await build(); await record("domain:examplebrand.com", "reported_owned");
      await click(c.edit); assert.ok(label(root()).includes(c.resetWarning));
      await click(c.cancel); assert.equal(target("domain:examplebrand.com").findAllByType("time").length, 1);
      await click(c.edit); await click(c.reset);
      assert.equal(root().findAllByType("time").length, 0); assert.equal(element("brand-index-name").props.value, "ExampleBrand");
      await change("brand-index-domains", "examplebrand.net");
      await act(async () => root().findByType("form").props.onSubmit({ preventDefault() {} }));
      assert.equal(root().findAllByType("details").filter(node => node.props["data-brand-target"]).length, 4);
      assert.equal(score().props["data-brand-reported-score"], "unavailable"); assert.equal(root().findAllByType("time").length, 0);
    });
    await t.test("all five languages retain scope and show the self-assessment boundary", async () => {
      await mount(); await build();
      for (const language of ["en", "sv", "es", "fr", "zh"] as const) {
        fixture.language = language; await act(async () => renderer!.update(tree()));
        const text = label(root()), copy = brandIndexCopy[language];
        assert.deepEqual(fixture.metadata.at(-1), [language, "/brand-index/assessment"]);
        for (const expected of [copy.title, copy.warning, copy.notEnough, copy.threshold, copy.fixed, copy.notVerified, copy.countryHelp]) assert.ok(text.includes(expected), `${language}: ${expected}`);
        assert.equal(root().findAllByType("details").filter(node => node.props["data-brand-target"]).length, 3);
        assert.equal(root().findAllByType("time").length, 0);
      }
      assert.equal(calls, 0);
      await mount(); assert.equal(element("brand-index-name").props.value, ""); assert.equal(root().findAllByProps({ "data-brand-index-result": true }).length, 0);
    });
    await t.test("optional real registry checks consume allowance but cannot prove ownership or alter self-reports", async () => {
      await mount(); await build();
      await record("domain:examplebrand.com", "reported_owned");
      await record("social:github:examplebrand", "reported_owned");
      await record("market:US", "reported_authorized");
      assert.equal(score().props["data-brand-reported-score"], 100);
      const before = fixture.checks, completed = fixture.completed;
      await act(async () => { await root().findAllByType("button").find(node => node.props["data-brand-check-domains"] !== undefined)!.props.onClick(); });
      assert.equal(fixture.checks, before + 1); assert.equal(fixture.completed, completed + 1);
      assert.equal(score().props["data-brand-reported-score"], 100);
      assert.equal(target("domain:examplebrand.com").findByType("select").props.value, "reported_owned");
      assert.equal(root().findAllByProps({ "data-brand-verified-score": "unavailable" }).length, 1);
      assert.ok(label(root()).includes(brandDomainCheckCopy.en.done)); assert.equal(calls, 0);
    });
    await t.test("denied allowance explains missing checks without sending a request or inventing completion", async () => {
      await mount(); await build(); fixture.mode = "denied";
      const before = fixture.checks, completed = fixture.completed;
      await act(async () => { await root().findAllByType("button").find(node => node.props["data-brand-check-domains"] !== undefined)!.props.onClick(); });
      assert.equal(fixture.checks, before); assert.equal(fixture.completed, completed);
      assert.ok(label(root()).includes(brandDomainCheckCopy.en.limited));
      assert.ok(!label(root()).includes(brandDomainCheckCopy.en.done));
    });
    await t.test("duplicate starts, cancellation and late provider responses cannot apply or consume completed allowance", async () => {
      await mount(); await build(); fixture.mode = "hold";
      const before = fixture.checks, completed = fixture.completed, released = fixture.released;
      const start = () => root().findAllByType("button").find(node => node.props["data-brand-check-domains"] !== undefined)!;
      await act(async () => { start().props.onClick(); start().props.onClick(); });
      assert.equal(fixture.checks, before + 1); assert.equal(start().props.disabled, true);
      await click(brandDomainCheckCopy.en.stop); assert.equal(start().props.disabled, false);
      await act(async () => { fixture.releaseCheck?.(); });
      assert.equal(fixture.completed, completed); assert.equal(fixture.released, released + 1);
      assert.ok(label(root()).includes(brandDomainCheckCopy.en.cancelled));
      assert.equal(score().props["data-brand-reported-score"], "unavailable");
      fixture.mode = "fail"; await act(async () => { start().props.onClick(); });
      assert.ok(label(root()).includes(brandDomainCheckCopy.en.failed)); assert.equal(start().props.disabled, false);
      fixture.mode = "success"; await act(async () => { start().props.onClick(); });
      assert.equal(fixture.completed, completed + 1); assert.ok(label(root()).includes(brandDomainCheckCopy.en.done));
    });
    await t.test("only meaningful edits guard reloads and owner changes clear all local work", async () => {
      await mount(); assert.equal(events.has("beforeunload"), false);
      await change("brand-index-name", "Private draft"); assert.equal(events.has("beforeunload"), true);
      let prevented = false; const event = { preventDefault() { prevented = true; }, returnValue: undefined as string | undefined };
      events.get("beforeunload")?.(event); assert.equal(prevented, true); assert.equal(event.returnValue, "");
      await change("brand-index-name", ""); assert.equal(events.has("beforeunload"), false);
      await build(); await record("domain:examplebrand.com", "reported_owned", "https://example.com/ownership");
      fixture.user = { id: "account-a" }; await act(async () => renderer!.update(tree()));
      assert.equal(element("brand-index-name").props.value, ""); assert.equal(events.has("beforeunload"), false);
      assert.equal(root().findAllByProps({ "data-brand-index-result": true }).length, 0);
      await build(); fixture.user = null; await act(async () => renderer!.update(tree()));
      assert.equal(element("brand-index-name").props.value, ""); assert.equal(events.has("beforeunload"), false); assert.equal(calls, 0);
    });
    await t.test("web download preserves local work, original evidence and cleanup on failure", async () => {
      await mount(); await build(); await record("domain:examplebrand.com", "reported_owned", "https://example.com/ownership");
      const originalStamp = target("domain:examplebrand.com").findByType("time").props.dateTime, before = fixture.checks;
      now += 60_000; await click(brandWorksheetCopy.en.download);
      assert.deepEqual(fixture.downloads, ["sajda-brand-assessment-2026-09-13.html"]); assert.deepEqual(fixture.revoked, ["blob:unit-export"]);
      const html = await fixture.blob!.text(); assert.ok(html.includes(originalStamp)); assert.ok(html.includes("https://example.com/ownership"));
      for (const state of ["checked", "reported", "listed", "unknown"]) assert.ok(html.includes(`data-evidence-group="${state}"`));
      assert.ok(label(root()).includes(brandWorksheetCopy.en.downloaded)); assert.equal(events.has("beforeunload"), true);
      assert.equal(target("domain:examplebrand.com").findByType("time").props.dateTime, originalStamp); assert.equal(fixture.checks, before); assert.equal(calls, 0);
      fixture.webFail = true; await click(brandWorksheetCopy.en.download);
      assert.ok(label(root()).includes(brandWorksheetCopy.en.failed)); assert.equal(fixture.revoked.length, 2); assert.equal(events.has("beforeunload"), true);
      fixture.webFail = false; now += 31 * 24 * 60 * 60_000; await click(brandWorksheetCopy.en.download);
      assert.ok(label(target("domain:examplebrand.com")).includes(c.freshness.stale));
      assert.equal(target("domain:examplebrand.com").findByType("time").props.dateTime, originalStamp);
    });
    await t.test("native cancellation, failure and double-click do not discard or falsely save the worksheet", async () => {
      await mount(); setTestNative(true); await build(); await record("domain:examplebrand.com", "reported_owned");
      const originalStamp = target("domain:examplebrand.com").findByType("time").props.dateTime;
      fixture.nativeMode = "cancel"; await click(brandWorksheetCopy.en.share);
      assert.ok(label(root()).includes(brandWorksheetCopy.en.cancelled)); assert.equal(events.has("beforeunload"), true);
      fixture.nativeMode = "fail"; await click(brandWorksheetCopy.en.share);
      assert.ok(label(root()).includes(brandWorksheetCopy.en.failed)); assert.equal(target("domain:examplebrand.com").findByType("time").props.dateTime, originalStamp);
      fixture.nativeMode = "hold"; const before = fixture.exports.length;
      const exportButton = () => root().findAllByType("button").find(node => node.props["data-brand-export"] !== undefined)!;
      await act(async () => { exportButton().props.onClick(); exportButton().props.onClick(); });
      assert.equal(fixture.exports.length, before + 1); assert.equal(exportButton().props.disabled, true);
      await act(async () => { fixture.releaseExport?.(); });
      assert.ok(label(root()).includes(brandWorksheetCopy.en.completed)); assert.equal(events.has("beforeunload"), true);
      assert.equal(fixture.downloads.length, 0); assert.equal(calls, 0);
      fixture.nativeMode = "hold"; await act(async () => { exportButton().props.onClick(); });
      fixture.user = { id: "account-b" }; await act(async () => renderer!.update(tree()));
      await act(async () => { fixture.releaseExport?.(); });
      assert.equal(element("brand-index-name").props.value, ""); assert.ok(!label(root()).includes(brandWorksheetCopy.en.completed));
    });
  } finally {
    if (renderer) await act(async () => renderer!.unmount());
    await vite.close(); globalThis.fetch = originalFetch; Date.now = originalNow; URL.createObjectURL = originalCreateUrl; URL.revokeObjectURL = originalRevokeUrl;
    for (const [name, descriptor] of originals) if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name);
  }
});
