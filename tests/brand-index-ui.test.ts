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
import { SOCIAL_PLATFORMS } from "../shared/name-packages";

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

test("mounted existing-brand worksheet keeps all evidence self-reported, local and fixed-scope", async t => {
  const key = "__SAJDA_BRAND_INDEX_UI__";
  const originals = new Map([key, "window"].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const originalFetch = globalThis.fetch, originalNow = Date.now;
  let now = Date.parse("2026-09-13T12:00:00.000Z"), calls = 0;
  Date.now = () => now;
  const fixture = { language: "en", checks: 0, completed: 0, released: 0, mode: "success", releaseCheck: null as (() => void) | null }, events = new Map<string, () => void>();
  Object.defineProperty(globalThis, key, { configurable: true, value: fixture });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { setInterval: () => 1, clearInterval() {}, addEventListener: (event: string, callback: () => void) => events.set(event, callback), removeEventListener: (event: string) => events.delete(event) } });
  globalThis.fetch = async () => { calls++; throw new Error("Local brand assessment may never query external services"); };
  const vite = await createServer({ configFile: false, appType: "custom", server: { middlewareMode: true, watch: null, hmr: false, ws: false }, resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" },
    plugins: [{ name: "brand-index-presentation-boundaries", enforce: "pre", load(id) {
      const file = id.replaceAll("\\", "/");
      if (file.endsWith("/src/i18n/LanguageProvider.tsx")) return `export const useLanguage=()=>({language:globalThis.${key}.language});`;
      if (file.endsWith("/src/components/LanguageSwitcher.tsx")) return "export default function LanguageSwitcher(){return null;}";
      if (file.endsWith("/src/contexts/ScanContext.tsx")) return `export const useScan=()=>({isScanning:false,requestAnonymousSearchAccess:()=>globalThis.${key}.mode==='denied'?null:({complete:()=>globalThis.${key}.completed++,release:()=>globalThis.${key}.released++})});`;
      if (file.endsWith("/src/components/FreeSearchGate.tsx")) return "export default function FreeSearchGate(){return null;}";
      if (file.endsWith("/src/lib/localTestSearch.ts")) return `export const runAnonymousSearch=async(_tlds,_count,_theme,_language,options)=>{const f=globalThis.${key};f.checks++;if(f.mode==='fail')throw new Error('Synthetic provider failure');const value={results:options.domains.map(domain=>({domain,status:'taken',authoritative:true,checkMethod:'rdap',source:'verisign-rdap',checkedAt:new Date(Date.now()).toISOString()}))};if(f.mode==='hold')return new Promise(resolve=>{f.releaseCheck=()=>resolve(value);});return value;};`;
    } }],
  });
  let renderer: ReactTestRenderer | undefined;
  try {
    const Page = (await vite.ssrLoadModule("/src/pages/BrandIndexAssessment.tsx")).default;
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
    const mount = async () => { if (renderer) await act(async () => renderer!.unmount()); fixture.language = "en"; fixture.mode = "success"; fixture.releaseCheck = null; now = Date.parse("2026-09-13T12:00:00.000Z"); calls = 0; await act(async () => { renderer = create(tree()); }); };
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
  } finally {
    if (renderer) await act(async () => renderer!.unmount());
    await vite.close(); globalThis.fetch = originalFetch; Date.now = originalNow;
    for (const [name, descriptor] of originals) if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name);
  }
});
