import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createElement as h } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { createServer } from "vite";
import { namePackagesCopy } from "../src/i18n/namePackagesCopy";
import { escapePackageHtml, exportNamePackageReport } from "../src/lib/namePackageExport";
import { buildNamePackages, type PackageDomainInput, type SocialObservation } from "../shared/name-packages";
import { DEFAULT_NAME_PACKAGE_MARKETS, NAME_PACKAGE_MARKET_CODES } from "../shared/name-package-markets";
import { namePackageMarketsCopy } from "../src/i18n/namePackageMarketsCopy";
import { brandWorkspaceCopy } from "../src/i18n/brandWorkspaceCopy";
import { nameLanguageCopy } from "../src/i18n/nameLanguageCopy";
import { namePackageResultCopy } from "../src/i18n/namePackageResultCopy";
import { BRAND_NAME_LANGUAGES } from "../shared/name-languages";
import type { AnonymousSearchResponse, AnonymousSearchResult } from "../src/lib/localTestSearch";
import type { StartScanOptions } from "../src/contexts/ScanContext";

const c = namePackagesCopy.en;
const w = brandWorkspaceCopy.en;
const pause = () => new Promise(resolve => setTimeout(resolve, 0));
function label(node: ReactTestInstance): string { return node.children.map(child => typeof child === "string" ? child : label(child)).join(""); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
const domain = (name: string): PackageDomainInput => ({ domain: name, status: "available", availabilityVerified: true,
  checkMethod: "rdap", checkedAt: new Date().toISOString(), source: "registry-test-fixture", namingScore: 85 });
const searchRow = (name: string): AnonymousSearchResult => ({ domain: name, status: "available", authoritative: true,
  checkMethod: "rdap", checkedAt: new Date().toISOString(), source: "registry-test-fixture", namingScore: 85,
  tld: name.split(".").at(-1)!, registrarPrice: 0, estimatedValue: 0, confidenceScore: 0, rationale: "Offline fixture" });

test("name-package reports escape input, keep uncertainty and do not invent verification timestamps", () => {
  const at = new Date().toISOString();
  const packages = buildNamePackages([{ ...domain("nomera.com"), checkedAt: null }], { platforms: ["github", "instagram"], observedAt: null });
  packages[0].displayName = '<script>alert("private")</script>';
  const html = exportNamePackageReport(packages, "en", at);
  assert.ok(html.includes("&lt;script&gt;alert(&quot;private&quot;)&lt;/script&gt;"));
  assert.ok(!html.includes("<script>")); assert.ok(!html.includes("<iframe"));
  assert.ok(html.includes(c.noTime)); assert.ok(html.includes(c.unknown)); assert.ok(html.includes(c.manual));
  assert.ok(html.includes(c.scoreLimit)); assert.ok(html.includes(c.riskPenalty));
  assert.ok(html.includes("default-src 'none'")); assert.ok(html.includes("noindex,nofollow"));
  assert.equal(escapePackageHtml("&<>'\""), "&amp;&lt;&gt;&#39;&quot;");
  for (const language of ["en", "sv", "es", "fr", "zh"] as const) {
    const report = exportNamePackageReport(packages, language, at);
    assert.ok(report.includes(escapePackageHtml(namePackagesCopy[language].title)));
    assert.ok(report.includes(escapePackageHtml(namePackagesCopy[language].manual)));
  }
});

test("mounted name packages preserve consent, owner boundaries and honest availability", async t => {
  const key = "__NAME_PACKAGES_UI__";
  const originals = new Map([key, "window", "document", "IS_REACT_ACT_ENVIRONMENT"].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const requests: { accountId: string; signal: AbortSignal; handles: string[] }[] = [], scans: unknown[] = [];
  const exacts: { domains: string[]; signal: AbortSignal }[] = [];
  const events = new Map<string, () => void>();
  const fixture = {
    owner: "account-a" as string | null, verified: true, language: "en", stopped: 0, focused: 0, scrolled: 0,
    accessAllowed: true, reservations: 0, completed: 0, released: 0,
    scan: { domains: [domain("nomera.com"), domain("nomera.se"), domain("tavora.com")], isScanning: false, restoredResults: false, resultsCheckedAt: new Date().toISOString() as string | null, lastSearchOptions: { theme: "Original search" } as StartScanOptions },
    start: async (options: StartScanOptions) => { scans.push(options); fixture.scan.lastSearchOptions = options; return true; },
    exact: async (options: { domains: string[]; signal: AbortSignal }): Promise<AnonymousSearchResponse> => {
      exacts.push(options);
      return { results: options.domains.map(searchRow) };
    },
    check: async (scope: { accountId: string; signal: AbortSignal }, handles: string[]): Promise<SocialObservation[]> => {
      requests.push({ ...scope, handles });
      return handles.map(handle => ({ platform: "github", handle, status: "not_found", checkedAt: new Date().toISOString(), sourceUrl: `https://api.github.com/users/${handle}` }));
    },
  };
  const set = (name: string, value: unknown) => Object.defineProperty(globalThis, name, { configurable: true, value });
  set(key, fixture); set("IS_REACT_ACT_ENVIRONMENT", true);
  set("window", { setInterval: () => 1, clearInterval() {}, addEventListener: (name: string, callback: () => void) => events.set(name, callback), removeEventListener: (name: string) => events.delete(name) });
  set("document", { addEventListener: (name: string, callback: () => void) => events.set(name, callback), removeEventListener: (name: string) => events.delete(name) });
  const vite = await createServer({ configFile: false, appType: "custom", server: { middlewareMode: true, watch: null, hmr: false, ws: false }, resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" },
    plugins: [{ name: "name-packages-mounted-fixture", enforce: "pre", load(id) {
      const file = id.replaceAll("\\", "/");
      if (file.endsWith("/src/contexts/AuthContext.tsx")) return `export const useAuth=()=>({user:globalThis.${key}.owner?{id:globalThis.${key}.owner,email_verified:globalThis.${key}.verified}:null,loading:false});`;
      if (file.endsWith("/src/i18n/LanguageProvider.tsx")) return `export const useLanguage=()=>({language:globalThis.${key}.language});`;
      if (file.endsWith("/src/contexts/ScanContext.tsx")) return `export const useScan=()=>({...globalThis.${key}.scan,startScan:options=>globalThis.${key}.start(options),stopScan:()=>globalThis.${key}.stopped++,requestAnonymousSearchAccess:()=>{const f=globalThis.${key};if(!f.accessAllowed)return null;f.reservations++;return {complete:()=>f.completed++,release:()=>f.released++};}});`;
      if (file.endsWith("/src/lib/localTestSearch.ts")) return `export const runAnonymousSearch=(_tlds,_count,_theme,_language,options)=>globalThis.${key}.exact(options);`;
      if (file.endsWith("/src/components/SaveBrandPackageButton.tsx")) return "export const SaveBrandPackageButton=()=>null;";
      if (file.endsWith("/src/lib/namePackageSocialClient.ts")) return `export const checkPackageSocials=(scope,handles)=>globalThis.${key}.check(scope,handles);`;
      if (file.endsWith("/src/components/AiPrivacyControl.tsx")) return `import React from 'react';export default ()=>React.createElement('p',{'data-consent-control':true},'AI consent control');`;
      if (file.endsWith("/src/components/FreeSearchGate.tsx")) return "export default ()=>null;";
      if (file.endsWith("/src/components/TLDSelector.tsx")) return `import React from 'react';export default p=>React.createElement('div',null,...['com','se','ai'].map(tld=>React.createElement('button',{type:'button',key:tld,onClick:()=>p.onToggleTLD(tld)},tld)));`;
      if (file.endsWith("/src/lib/appSurface.ts")) return "export const isNativeApp=false;";
      if (file.endsWith("/src/lib/nativeTransport.ts")) return "export const nativeShareFile=()=>{throw new Error('No native transport in this fixture')};";
    } }],
  });
  let renderer: ReactTestRenderer | undefined;
  try {
    const Page = (await vite.ssrLoadModule("/src/pages/NamePackages.tsx")).default;
    function LocationProbe() { const location = useLocation(); return h("output", { "data-location": true }, JSON.stringify({ pathname: location.pathname, search: location.search, state: location.state })); }
    const tree = (state: unknown = null) => h(MemoryRouter, { initialEntries: [{ pathname: "/name-packages", state }] }, h(Page), h(LocationProbe));
    const root = () => renderer!.root;
    const text = () => label(root());
    const button = (name: string) => { const node = root().findAllByType("button").find(item => label(item) === name); assert.ok(node, name); return node; };
    const input = (name: string) => root().findAll(node => ["input", "textarea"].includes(String(node.type)) && node.props.name === name)[0];
    const openSearch = async () => { if (!root().findAllByType("form").length) await act(async () => { button(namePackagesCopy[fixture.language as keyof typeof namePackagesCopy].editSearch).props.onClick(); }); };
    const change = async (name: string, value: string) => { await openSearch(); await act(async () => { input(name).props.onChange({ target: { value } }); }); };
    const click = async (name: string) => { await act(async () => { button(name).props.onClick(); await pause(); }); };
    const submit = async (twice = false) => { await openSearch(); await act(async () => { const action = root().findByType("form").props.onSubmit; action({ preventDefault() {} }); if (twice) action({ preventDefault() {} }); await pause(); }); };
    const healthy = fixture.check, healthyExact = fixture.exact, healthyStart = fixture.start;
    const mount = async (state: unknown = null) => {
      await act(async () => { renderer?.unmount(); }); requests.length = 0; scans.length = 0; exacts.length = 0;
      fixture.owner = "account-a"; fixture.verified = true; fixture.language = "en"; fixture.check = healthy; fixture.focused = 0; fixture.scrolled = 0;
      fixture.exact = healthyExact; fixture.start = healthyStart; fixture.accessAllowed = true; fixture.reservations = 0; fixture.completed = 0; fixture.released = 0;
      fixture.scan = { domains: [domain("nomera.com"), domain("nomera.se"), domain("tavora.com")], isScanning: false, restoredResults: false, resultsCheckedAt: new Date().toISOString(), lastSearchOptions: { theme: "Original search" } };
      await act(async () => { renderer = create(tree(state), { createNodeMock: element => element.props.id === "package-results-title" ? { focus: () => fixture.focused++, scrollIntoView: () => fixture.scrolled++ } : null }); await pause(); });
    };
    await t.test("opening and editing never sends a search or social request", async () => {
      await mount(); assert.equal(requests.length, 0); assert.equal(scans.length, 0);
      assert.ok(text().includes(c.available)); assert.ok(text().includes(c.notChecked)); assert.ok(text().includes(c.manual));
      assert.ok(text().includes(w.ceiling)); assert.ok(text().includes(w.coverage));
      assert.equal(root().findAllByType("h1").length, 1);
      await change("theme", "Private founder idea"); await change("brief", "Exact private customer description");
      assert.equal(requests.length, 0); assert.equal(scans.length, 0);
      assert.ok(text().includes("Original search"));
      const location = root().findByType("output").children.join(""); assert.ok(!location.includes("Private"));
      await submit(true); assert.equal(scans.length, 1);
      assert.deepEqual(scans[0], { theme: "Private founder idea", brief: "Exact private customer description", advanced: true, tlds: ["com", "ai"], namePackages: true, nameLanguage: "en" });
    });
    await t.test("partial results explain candidate counts and their next action opens the real editor", async () => {
      await mount();
      fixture.scan.lastSearchOptions = { theme: "Six-name search", namePackages: true, tlds: ["com"] };
      fixture.scan.domains = [domain("first.com"), domain("second.com"), domain("third.com"), domain("fourth.com"), { ...domain("fifth.com"), status: "taken" }, { ...domain("sixth.com"), status: "unknown", availabilityVerified: false }];
      fixture.scan.resultsCheckedAt = new Date().toISOString();
      await act(async () => renderer!.update(tree()));
      const summary = root().findAll(node => typeof node.type === "string" && node.props["data-package-result-summary"] !== undefined)[0];
      assert.match(label(summary), /6 of 10 candidate name packages/u);
      assert.match(label(summary), /currently verified available domain: 4 of 6/u);
      assert.match(label(summary), /Only registered domains among the selected extensions: 1/u);
      assert.match(label(summary), /No confirmed available domain: 1/u);
      assert.equal(root().findAllByType("form").length, 0);
      await click(namePackageResultCopy.en.adjust);
      assert.equal(root().findAllByType("form").length, 1);
      assert.equal(scans.length, 0, "The recovery action must not silently run another search");
    });
    await t.test("failed searches label retained results and do not show a first-visit empty state", async () => {
      await mount(); fixture.start = async () => false;
      await change("theme", "A different business"); await submit();
      assert.ok(text().includes(namePackageResultCopy.en.failedRetained));
      assert.ok(text().includes("Original search"));
      fixture.scan.domains = []; await act(async () => renderer!.update(tree()));
      assert.ok(text().includes(namePackageResultCopy.en.failedEmpty));
      assert.ok(text().includes(namePackageResultCopy.en.failedTitle));
      assert.ok(text().includes(namePackageResultCopy.en.failedNext));
      assert.ok(!text().includes(c.empty));
    });
    await t.test("name language defaults to English, survives UI-language changes, and never translates an exact check", async () => {
      await mount(); await openSearch();
      const selector = () => root().findByProps({ id: "package-name-language" });
      assert.equal(selector().props.value, "en");
      assert.deepEqual(selector().findAllByType("option").map(option => option.props.value), [...BRAND_NAME_LANGUAGES]);
      await act(async () => { selector().props.onChange({ target: { value: "fr" } }); });
      assert.equal(scans.length, 0, "Choosing language does not trigger or pay for a search");
      fixture.language = "sv"; await act(async () => renderer!.update(tree()));
      assert.equal(selector().props.value, "fr");
      assert.ok(text().includes(nameLanguageCopy.sv.label));
      await change("theme", "bakery"); await submit();
      assert.equal((scans.at(-1) as { nameLanguage: string }).nameLanguage, "fr");
      assert.equal((scans.at(-1) as { advanced: boolean }).advanced, false);
      assert.equal(root().findByProps({ "data-name-language": "fr" }).children.join(""), "Namnspråk: Franska");
      await openSearch();
      await act(async () => { selector().props.onChange({ target: { value: "sv" } }); });
      assert.equal(root().findAllByProps({ "data-name-language": "fr" }).length, 1, "Editing the next query must not relabel previous results");
      fixture.language = "en"; await act(async () => renderer!.update(tree()));
      await click(w.exact); await change("theme", "atelier"); await submit();
      const exact = scans.at(-1) as Record<string, unknown>;
      assert.deepEqual(exact.domains, ["atelier.com", "atelier.ai"]);
      assert.equal(exact.nameLanguage, undefined); assert.equal(exact.criteria, undefined);
      assert.equal(root().findAll(node => Boolean(node.props["data-name-language"])).length, 0, "An unrelated exact check must not inherit the earlier generated-name language");
      await openSearch(); assert.equal(root().findAllByProps({ id: "package-name-language" }).length, 0);
      await click(w.create);
      assert.equal(selector().props.value, "sv");
    });
    await t.test("results start with a collapsed editor and only an explicit successful search moves focus", async () => {
      await mount(); assert.equal(root().findAllByType("form").length, 0); assert.equal(fixture.focused, 0); assert.equal(fixture.scrolled, 0);
      assert.equal(button(c.editSearch).props["aria-expanded"], false);
      await change("theme", "Remember this theme"); await change("brief", "Remember this brief");
      assert.equal(button(c.hideSearch).props["aria-expanded"], true); assert.equal(fixture.scrolled, 0);
      await submit(); assert.equal(root().findAllByType("form").length, 0); assert.equal(fixture.focused, 1); assert.equal(fixture.scrolled, 1);
      await openSearch(); assert.equal(input("theme").props.value, "Remember this theme"); assert.equal(input("brief").props.value, "Remember this brief"); assert.equal(fixture.scrolled, 1);
    });
    await t.test("country presets and individual choices are local, have no legal points and reset on owner changes", async () => {
      await mount(); await openSearch();
      const selected = () => root().findAll(node => typeof node.type === "string" && node.props["data-selected-markets"] !== undefined)[0].props["data-selected-markets"].split(",");
      const coverage = () => root().findAll(node => typeof node.type === "string" && node.props["data-market-coverage"] !== undefined)[0];
      const preset = async (id: string) => { await act(async () => root().findAllByType("button").find(node => node.props["data-market-preset"] === id)!.props.onClick()); };
      const country = (code: string) => root().findAllByType("input").find(node => node.props["data-market-code"] === code)!;
      const before = root().findAllByType("article").map(label), receipt = fixture.scan.resultsCheckedAt;
      const originalLocation = root().findByType("output").children.join("");
      assert.deepEqual(selected(), [...DEFAULT_NAME_PACKAGE_MARKETS]);
      assert.equal(root().findAllByType("input").filter(node => node.props["data-market-code"]).length, NAME_PACKAGE_MARKET_CODES.length);
      assert.equal(coverage().props["data-checked-markets"], 0);
      assert.equal(root().findAllByProps({ id: "package-market-review" }).length, 1);
      await preset("all"); assert.deepEqual(selected(), [...NAME_PACKAGE_MARKET_CODES]);
      assert.equal(coverage().props["data-requested-markets"], NAME_PACKAGE_MARKET_CODES.length);
      await preset("us-eu"); assert.deepEqual(selected(), [...DEFAULT_NAME_PACKAGE_MARKETS]);
      await preset("eu"); assert.equal(selected().length, 27); assert.ok(!selected().includes("US"));
      await preset("us"); assert.deepEqual(selected(), ["US"]); assert.equal(country("US").props.disabled, true);
      await act(async () => country("US").props.onChange()); assert.deepEqual(selected(), ["US"], "Even a synthetic disabled callback cannot remove the last country");
      await act(async () => country("SE").props.onChange()); assert.equal(selected().length, 2);
      await act(async () => country("US").props.onChange()); assert.deepEqual(selected(), ["SE"]);
      assert.equal(country("SE").props.disabled, true); assert.equal(coverage().props["data-checked-markets"], 0);
      assert.deepEqual(root().findAllByType("article").map(label), before);
      assert.equal(fixture.scan.resultsCheckedAt, receipt); assert.equal(scans.length, 0); assert.equal(requests.length, 0);
      assert.equal(root().findByType("output").children.join(""), originalLocation, "Market choices are not written into browser history or URLs");
      const review = root().findByProps({ id: "package-market-review" });
      assert.ok(review.findAllByType("a").every(node => node.props.href.startsWith("https://") && !node.props.href.includes("nomera")));
      assert.ok(root().findAllByType("article").every(card => card.findAllByType("a").filter(node => node.props.href === "#package-market-review").length === 2));
      for (const language of ["en", "sv", "es", "fr", "zh"] as const) {
        fixture.language = language; await act(async () => renderer!.update(tree()));
        assert.deepEqual(selected(), ["SE"], "Language is not market selection");
        assert.ok(text().includes(namePackageMarketsCopy[language].help));
        assert.ok(text().includes(namePackageMarketsCopy[language].incomplete));
      }
      fixture.owner = "account-b"; await act(async () => renderer!.update(tree()));
      await openSearch();
      assert.deepEqual(selected(), [...DEFAULT_NAME_PACKAGE_MARKETS]);
      assert.equal(scans.length, 0); assert.equal(requests.length, 0);
    });
    await t.test("validation blocks empty search and empty extensions", async () => {
      await mount(); await submit(); assert.equal(scans.length, 0); assert.ok(text().includes(c.invalid));
      await change("theme", "A valid theme"); await click("com"); await click("ai"); await submit(); assert.equal(scans.length, 0);
    });
    await t.test("restored evidence and expired evidence cannot look like current availability", async () => {
      await mount(); fixture.scan.resultsCheckedAt = null;
      await act(async () => { renderer!.update(tree()); });
      assert.ok(text().includes(c.noTime)); assert.ok(text().includes(c.unknown)); assert.ok(!text().includes(c.available));
      fixture.scan.resultsCheckedAt = new Date().toISOString();
      fixture.scan.domains = fixture.scan.domains.map(row => ({ ...row, checkedAt: new Date(Date.now() - 31 * 60_000).toISOString() }));
      await act(async () => { renderer!.update(tree()); events.get("focus")?.(); });
      assert.ok(text().includes(c.stale)); assert.ok(!text().includes(c.available));
    });
    await t.test("missing, malformed, future and restored row timestamps cannot inherit a live receipt", async () => {
      await mount();
      for (const checkedAt of [undefined, null, "invalid", new Date(Date.now() + 60_000).toISOString()]) {
        fixture.scan.domains = [{ ...domain("nomera.com"), checkedAt }];
        await act(async () => { renderer!.update(tree()); });
        assert.ok(!text().includes(c.available), String(checkedAt));
      }
      fixture.scan.domains = [domain("nomera.com")]; fixture.scan.restoredResults = true;
      await act(async () => { renderer!.update(tree()); });
      assert.ok(text().includes(c.unknown)); assert.ok(!text().includes(c.available));
    });
    await t.test("explicit GitHub action sends at most five handles, never the brief; 404 stays unknown availability", async () => {
      await mount(); await change("brief", "Never send this brief to GitHub"); await click(c.github);
      assert.equal(requests.length, 1); assert.equal(requests[0].accountId, "account-a");
      assert.deepEqual(requests[0].handles.slice().sort(), ["nomera", "tavora"]);
      assert.ok(text().includes(c.notFound)); assert.ok(text().includes(c.githubDone)); assert.ok(text().includes(c.manual));
      const perCard = root().findAllByType("button").find(node => label(node) === c.githubOne)!;
      await act(async () => { perCard.props.onClick(); await pause(); }); assert.equal(requests.length, 2); assert.equal(requests[1].handles.length, 1);
    });
    await t.test("batch checks stop at five and a lower-ranked package remains individually checkable", async () => {
      await mount(); fixture.scan.domains = ["namero", "namaro", "nomero", "navaro", "navero", "novaro", "novelo"].map(name => domain(`${name}.com`));
      await act(async () => { renderer!.update(tree()); }); await click(c.github);
      assert.equal(requests[0].handles.length, 5);
      const cards = root().findAllByType("article");
      const lastCard = cards.at(-1)!;
      const target = lastCard.findAllByType("button").find(node => label(node) === c.githubOne)!;
      await act(async () => { target.props.onClick(); await pause(); });
      assert.equal(requests[1].handles.length, 1); assert.ok(!requests[0].handles.includes(requests[1].handles[0]));
    });
    await t.test("focus re-evaluates old evidence without creating a new check time", async () => {
      await mount(); const realNow = Date.now; const receipt = fixture.scan.resultsCheckedAt;
      try {
        Date.now = () => Date.parse(receipt!) + 31 * 60_000;
        await act(async () => { events.get("focus")?.(); });
        assert.ok(text().includes(c.stale)); assert.ok(!text().includes(c.available)); assert.equal(fixture.scan.resultsCheckedAt, receipt);
      } finally { Date.now = realNow; }
    });
    await t.test("guests and unverified accounts have no GitHub request control", async () => {
      await mount(); fixture.owner = null; await act(async () => { renderer!.update(tree()); });
      assert.ok(text().includes(c.githubSignIn)); assert.equal(root().findAllByType("button").filter(node => label(node) === c.github).length, 0);
      fixture.owner = "account-a"; fixture.verified = false; await act(async () => { renderer!.update(tree()); });
      assert.equal(root().findAllByType("button").filter(node => label(node) === c.githubOne).length, 0); assert.equal(requests.length, 0);
    });
    await t.test("account changes and unmount abort late private responses", async () => {
      await mount(); const pending = deferred<SocialObservation[]>();
      fixture.check = async (scope, handles) => { requests.push({ ...scope, handles }); return pending.promise; };
      await change("brief", "Owner A private brief"); await click(c.github); const old = requests[0];
      fixture.owner = "account-b"; await act(async () => { renderer!.update(tree()); });
      assert.equal(old.signal.aborted, true); await openSearch(); assert.equal(input("brief").props.value, "");
      await act(async () => { pending.resolve([{ platform: "github", handle: "nomera", status: "profile_found", checkedAt: new Date().toISOString(), sourceUrl: "https://api.github.com/users/nomera" }]); await pause(); });
      assert.ok(!text().includes(c.profileFound));
      const next = deferred<SocialObservation[]>(); fixture.check = async (scope, handles) => { requests.push({ ...scope, handles }); return next.promise; };
      await click(c.github); await act(async () => { renderer!.unmount(); }); assert.equal(requests.at(-1)!.signal.aborted, true);
      next.resolve([]); await pause(); renderer = undefined;
    });
    await t.test("new searches and platform changes cancel in-flight social lookups", async () => {
      await mount(); const pending = deferred<SocialObservation[]>(); fixture.check = async (scope, handles) => { requests.push({ ...scope, handles }); return pending.promise; };
      await click(c.github); await change("theme", "New search"); await submit(); assert.equal(requests[0].signal.aborted, true);
      await click(c.github); await openSearch(); const toggle = root().findAllByType("label").find(node => label(node) === "GitHub")!;
      await act(async () => { toggle.findByType("input").props.onChange(); }); assert.equal(requests[1].signal.aborted, true);
      pending.resolve([]); await pause();
    });
    await t.test("provider failure leaves real domain evidence and all languages stay localized", async () => {
      await mount(); fixture.check = async () => { throw new Error("provider unavailable"); }; await click(c.github);
      assert.ok(text().includes(c.githubError)); assert.ok(text().includes(c.available));
      for (const language of ["en", "sv", "es", "fr", "zh"] as const) { const copy = namePackagesCopy[language]; fixture.language = language; await act(async () => { renderer!.update(tree()); }); assert.ok(text().includes(brandWorkspaceCopy[language].title)); assert.ok(text().includes(copy.manual)); assert.ok(text().includes(copy.githubError)); }
      const external = root().findAllByType("a").filter(node => String(node.props.href).startsWith("https://"));
      assert.ok(external.length > 0); assert.ok(external.every(node => node.props.rel?.includes("noreferrer")));
    });
    await t.test("comparison is capped at three packages and does not perform checks or expose names in URLs", async () => {
      await mount(); fixture.scan.domains = ["nomera", "tavora", "virela", "lumaro"].map(name => domain(`${name}.com`));
      await act(async () => renderer!.update(tree()));
      const cards = () => root().findAllByType("article").filter(node => typeof node.props["aria-label"] === "string");
      const compare = (index: number) => cards()[index].findAllByType("button").find(node => [w.compare, w.comparing].includes(label(node)))!;
      const beforeLocation = root().findByType("output").children.join("");
      for (let index = 0; index < 3; index++) await act(async () => compare(index).props.onClick());
      assert.equal(compare(3).props.disabled, true);
      assert.equal(root().findByProps({ "data-package-comparison": true }).findAllByType("article").length, 3);
      await act(async () => compare(3).props.onClick());
      assert.equal(root().findByProps({ "data-package-comparison": true }).findAllByType("article").length, 3, "Synthetic disabled clicks do not evade the cap");
      await act(async () => compare(0).props.onClick());
      assert.equal(compare(3).props.disabled, false);
      await click(w.clear); assert.equal(root().findAllByProps({ "data-package-comparison": true }).length, 0);
      assert.equal(scans.length, 0); assert.equal(exacts.length, 0); assert.equal(requests.length, 0);
      assert.equal(root().findByType("output").children.join(""), beforeLocation);
    });
    await t.test("exact mode checks only one normalized name and never invokes contextual AI controls", async () => {
      await mount(); await openSearch(); await click(w.exact);
      assert.equal(root().findAllByProps({ "data-consent-control": true }).length, 0);
      assert.equal(root().findAllByType("textarea").length, 0);
      await change("theme", "A long description for my app"); await submit();
      assert.equal(scans.length, 0); assert.ok(text().includes(w.exactInvalid));
      await change("theme", "Northform.com"); await submit();
      assert.deepEqual(scans[0], { theme: "northform", brief: "", advanced: false,
        tlds: ["com", "ai"], domains: ["northform.com", "northform.ai"], namePackages: false });
      assert.equal(exacts.length, 0); assert.equal(requests.length, 0);
    });
    await t.test("a brand seed only prefills exact mode and is removed from history without automatic work", async () => {
      await mount({ brandPackageSeed: "Northform.com" });
      assert.equal(input("theme").props.value, "northform");
      assert.equal(root().findAllByType("textarea").length, 0);
      assert.equal(scans.length, 0); assert.equal(exacts.length, 0); assert.equal(requests.length, 0);
      assert.ok(root().findByType("output").children.join("").includes('"state":null'));
    });
    await t.test("per-card exact refresh preserves other packages, updates Brand Index and uses normal access accounting", async () => {
      await mount();
      const card = (name: string) => root().findAllByType("article").find(node => node.props["aria-label"] === name)!;
      const other = label(card("tavora"));
      fixture.exact = async options => {
        const response = await healthyExact(options);
        return { ...response, results: response.results.map(row => row.domain === "nomera.se" ? { ...row, status: "taken" } : row) };
      };
      await act(async () => { card("nomera").findAllByType("button").find(node => label(node) === w.check)!.props.onClick(); await pause(); });
      assert.equal(exacts.length, 1); assert.deepEqual(exacts[0].domains, ["nomera.com", "nomera.se"]);
      assert.ok(label(card("nomera")).includes(w.conflicts)); assert.ok(label(card("nomera")).includes(c.taken));
      assert.equal(label(card("tavora")), other, "A one-name check must not discard or rewrite unrelated packages");
      assert.equal(fixture.reservations, 1); assert.equal(fixture.completed, 1); assert.equal(fixture.released, 0);
      assert.equal(scans.length, 0); assert.equal(requests.length, 0);
      assert.ok(text().includes(w.checked));
      fixture.accessAllowed = false;
      await act(async () => { card("nomera").findAllByType("button").find(node => label(node) === w.check)!.props.onClick(); await pause(); });
      assert.equal(exacts.length, 1, "Denied quota must not reach the exact-domain client");
    });
    await t.test("duplicate exact clicks do not duplicate provider work and failures release the reservation", async () => {
      await mount(); const pending = deferred<AnonymousSearchResponse>();
      fixture.exact = async options => { exacts.push(options); return pending.promise; };
      const control = root().findAllByType("button").find(node => label(node) === w.check)!;
      await act(async () => { control.props.onClick(); control.props.onClick(); await pause(); });
      assert.equal(exacts.length, 1); assert.equal(fixture.reservations, 1);
      assert.ok(root().findAllByType("button").filter(node => [w.check, w.checking].includes(label(node))).every(node => node.props.disabled));
      await act(async () => { pending.resolve({ results: [] }); await pause(); });
      assert.equal(fixture.completed, 0); assert.equal(fixture.released, 1);
      fixture.exact = async () => { throw new Error("Fixture network failure"); };
      await click(w.check); assert.ok(text().includes(w.checkFailed));
      assert.equal(fixture.reservations, 2); assert.equal(fixture.released, 2);
      assert.ok(text().includes("tavora.com"));
    });
    await t.test("account changes, a new scan and unmount abort exact requests and discard late observations", async () => {
      await mount(); const pending = deferred<AnonymousSearchResponse>();
      fixture.exact = async options => { exacts.push(options); return pending.promise; };
      await click(w.check); const old = exacts[0];
      fixture.owner = "account-b"; await act(async () => renderer!.update(tree()));
      assert.equal(old.signal.aborted, true);
      await act(async () => { pending.resolve({ results: [{ ...searchRow(old.domains[0]), status: "taken", rationale: "Late fixture" }] }); await pause(); });
      assert.equal(fixture.completed, 0); assert.equal(fixture.released, 1);
      assert.ok(!text().includes(c.taken)); assert.ok(!text().includes(w.checked));
      const next = deferred<AnonymousSearchResponse>(); fixture.exact = async options => { exacts.push(options); return next.promise; };
      await click(w.check); fixture.scan.isScanning = true;
      await act(async () => renderer!.update(tree())); assert.equal(exacts.at(-1)!.signal.aborted, true);
      await act(async () => { next.resolve({ results: [] }); await pause(); });
      fixture.scan.isScanning = false; await act(async () => renderer!.update(tree()));
      const last = deferred<AnonymousSearchResponse>(); fixture.exact = async options => { exacts.push(options); return last.promise; };
      await click(w.check); await act(async () => renderer!.unmount());
      assert.equal(exacts.at(-1)!.signal.aborted, true);
      last.resolve({ results: [] }); await pause(); renderer = undefined;
    });
    await t.test("only owner-matched project handoffs prefill and history state is scrubbed without auto-search", async () => {
      const at = new Date().toISOString();
      const project = { id: "00000000-0000-4000-8000-000000000001", title: "Private project", description: "Private project description", audience: "Founders", desiredStyle: "Short", languages: ["en"], budget: { currency: "USD", maxFirstYearCents: 5000, maxAnnualRenewalCents: null }, archived: false, shortlistDomains: [], version: 1, createdAt: at, updatedAt: at };
      await mount({ nameProject: project, nameProjectAccountId: "account-a" });
      assert.equal(input("theme").props.value, "Private project"); assert.ok(input("brief").props.value.includes("Private project description"));
      assert.equal(scans.length, 0); assert.equal(requests.length, 0); assert.ok(root().findByType("output").children.join("").includes('"state":null'));
      await mount({ nameProject: project, nameProjectAccountId: "account-b" }); await openSearch(); assert.equal(input("theme").props.value, ""); assert.equal(input("brief").props.value, ""); assert.ok(root().findByType("output").children.join("").includes('"state":null'));
    });
    await t.test("saved naming language applies only to that exact package, not old or unrelated results", async () => {
      const at = new Date().toISOString();
      const entry = { label: "atelier", nameLanguage: "fr", requiredTlds: ["com", "ai"], platforms: ["github"], markets: ["FR"], source: "user_supplied" };
      const project = { id: "00000000-0000-4000-8000-000000000001", title: "French brand", description: "", audience: "", desiredStyle: "", languages: ["fr"], budget: { currency: "USD", maxFirstYearCents: null, maxAnnualRenewalCents: null }, archived: false, shortlistDomains: [], brandShortlist: [entry], version: 1, createdAt: at, updatedAt: at };
      await mount({ nameProject: project, nameProjectAccountId: "account-a", brandPackage: entry });
      assert.equal(input("theme").props.value, "atelier");
      assert.equal(scans.length, 0);
      assert.equal(root().findAll(node => Boolean(node.props["data-name-language"])).length, 0, "A saved-package handoff must not relabel existing search results");
      await submit();
      assert.equal((scans.at(-1) as StartScanOptions).nameLanguage, undefined, "Exact names are verified without translation");
      assert.equal(root().findByProps({ "data-name-language": "fr" }).children.join(""), "Name language: French");
      await change("theme", "unrelated"); await submit();
      assert.equal(root().findAll(node => Boolean(node.props["data-name-language"])).length, 0);
      await openSearch(); await click(w.create);
      assert.equal(root().findByProps({ id: "package-name-language" }).props.value, "fr", "The saved preference remains available for a new creative search");
      fixture.owner = "account-b"; await act(async () => renderer!.update(tree())); await openSearch();
      assert.equal(root().findByProps({ id: "package-name-language" }).props.value, "en", "An account switch clears another owner's naming preference");
    });
  } finally { await act(async () => { renderer?.unmount(); }); await vite.close(); for (const [name, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name); } }
});
