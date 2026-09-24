import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { createElement as h } from "react";
import { MemoryRouter } from "react-router-dom";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { createServer } from "vite";
import { brandLookupCopy } from "../src/i18n/brandLookupCopy";
import { syntheticBrandMatches, syntheticBrandProfile } from "./fixtures/brand-lookup";
const text = (node: ReactTestInstance): string => node.children.map(child => typeof child === "string" ? child : text(child)).join("");

test("mounted brand lookup is search-first, explicit, cancellable and never independent verification", async t => {
  const key = "__SAJDA_BRAND_LOOKUP_TEST__", originalFetch = globalThis.fetch;
  const originals = new Map([key, "window"].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const fixture = { language: "en" }, requests: Array<{ body: Record<string, string>; signal: AbortSignal }> = [], replies: Array<() => Promise<Response>> = [];
  Object.defineProperty(globalThis, key, { configurable: true, value: fixture });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { setTimeout, clearTimeout } });
  globalThis.fetch = async (_url, init) => { requests.push({ body: JSON.parse(String(init?.body)), signal: init?.signal as AbortSignal }); const reply = replies.shift(); assert.ok(reply, "Unexpected network request"); return reply(); };
  const vite = await createServer({ configFile: false, appType: "custom", server: { middlewareMode: true, watch: null, hmr: false, ws: false }, resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" },
    plugins: [{ name: "brand-lookup-presentation", enforce: "pre", load(id) { const file = id.replaceAll("\\", "/");
      if (file.endsWith("/src/i18n/LanguageProvider.tsx")) return `export const useLanguage=()=>({language:globalThis.${key}.language});`;
      if (file.endsWith("/src/components/LanguageSwitcher.tsx")) return "export default function LanguageSwitcher(){return null;}";
    } }],
  });
  let renderer: ReactTestRenderer | undefined;
  try {
    const Page = (await vite.ssrLoadModule("/src/pages/BrandIndex.tsx")).default;
    const tree = () => h(MemoryRouter, { initialEntries: ["/brand-index"] }, h(Page));
    const root = () => renderer!.root, c = brandLookupCopy.en;
    const change = async (value: string) => { await act(async () => root().findByProps({ id: "brand-lookup-query" }).props.onChange({ target: { value } })); };
    const submit = async () => { await act(async () => root().findByType("form").props.onSubmit({ preventDefault() {} })); };
    const click = async (label: string) => { const button = root().findAllByType("button").find(node => text(node) === label); assert.ok(button, label); await act(async () => button.props.onClick()); };
    const choose = async (id: string) => { const candidate = root().findByProps({ "data-brand-match": id }); await act(async () => candidate.findByType("button").props.onClick()); };
    const response = (value: unknown, status = 200) => replies.push(async () => Response.json(value, { status }));
    const mount = async () => { if (renderer) await act(async () => renderer!.unmount()); requests.length = 0; replies.length = 0; fixture.language = "en"; await act(async () => { renderer = create(tree()); }); };

    await t.test("blank form explains the external lookup and does not request or auto-select anything", async () => {
      await mount(); assert.equal(requests.length, 0); assert.equal(root().findAllByType("input").length, 1); assert.ok(text(root()).includes(c.disclosure));
      await submit(); assert.ok(text(root().findByProps({ role: "alert" })).includes(c.invalid)); assert.equal(requests.length, 0);
      await change("ExampleBrand"); response(syntheticBrandMatches()); await submit();
      assert.equal(requests.length, 1); assert.equal(root().findAllByType("article").length, 5); assert.equal(root().findAllByProps({ "data-brand-lookup-profile": "Q901" }).length, 0);
      assert.equal(root().findAllByType("a").filter(node => node.props.href === "/brand-index/assessment").length, 1);
    });
    await t.test("only an explicit chosen entity loads a profile; source statements never produce a verified index", async () => {
      await mount(); await change("ExampleBrand"); response(syntheticBrandMatches()); await submit();
      const profile = syntheticBrandProfile("Q902"); profile.assertions[0].url = "javascript:alert(1)";
      response(profile); await choose("Q902"); assert.deepEqual(requests[1].body, { operation: "profile", entity_id: "Q902", locale: "en" });
      assert.equal(root().findByProps({ "data-brand-lookup-index": "unavailable" }).children.join(""), c.notVerified);
      assert.equal(text(root().findByProps({ "data-brand-verified-count": true })), "0"); assert.ok(text(root()).includes(c.sourceClaims));
      assert.ok(text(root()).indexOf(c.sourceClaims) < text(root()).indexOf(c.websites), "A clear non-verification label precedes the source data");
      assert.ok(text(root()).indexOf(c.websites) < text(root()).indexOf(c.verifiedIndex), "Actual source data precedes the unavailable index");
      assert.ok(root().findAllByType("time").some(node => node.props.dateTime === "2022-01-02T12:00:00.000Z"));
      assert.ok(!root().findAllByType("a").some(node => String(node.props.href).startsWith("javascript:")));
      await change("Another name"); assert.equal(root().findAllByProps({ "data-brand-lookup-profile": "Q902" }).length, 0); assert.equal(requests.length, 2);
    });
    await t.test("no matches and source unavailable remain distinct and retry recovers", async () => {
      await mount(); await change("ExampleBrand"); response(syntheticBrandMatches("ExampleBrand", "en", true)); await submit();
      assert.ok(text(root()).includes(c.noMatches)); assert.ok(!text(root()).includes(c.unavailable));
      await change("Failure"); response({ error: "source_unavailable" }, 503); await submit();
      assert.ok(text(root().findByProps({ role: "alert" })).includes(c.unavailable)); assert.ok(!text(root()).includes(c.noMatches));
      response(syntheticBrandMatches("Failure")); await click(c.retry); assert.equal(root().findAllByType("article").length, 5);
    });
    await t.test("query edits abort and stale responses cannot overwrite a later search", async () => {
      await mount(); let release: ((value: Response) => void) | undefined;
      replies.push(() => new Promise(resolve => { release = resolve; })); await change("First name"); await submit();
      await change("Second name"); assert.equal(requests[0].signal.aborted, true); response(syntheticBrandMatches("Second name")); await submit();
      assert.ok(text(root()).includes("Second name · synthetic"));
      await act(async () => release!(Response.json(syntheticBrandMatches("First name"))));
      assert.ok(!text(root()).includes("First name · synthetic")); assert.ok(text(root()).includes("Second name · synthetic"));
    });
    await t.test("cancel and unmount abort pending work, without an error or automatic retry", async () => {
      await mount(); let release: ((value: Response) => void) | undefined;
      replies.push(() => new Promise(resolve => { release = resolve; })); await change("ExampleBrand"); await submit(); await click(c.cancel);
      assert.equal(requests[0].signal.aborted, true); assert.ok(text(root()).includes(c.cancelled));
      await act(async () => release!(Response.json(syntheticBrandMatches()))); assert.equal(root().findAllByType("article").length, 0);
      replies.push(() => new Promise(resolve => { release = resolve; })); await submit(); await act(async () => renderer!.unmount()); renderer = undefined;
      assert.equal(requests[1].signal.aborted, true); await act(async () => release!(Response.json(syntheticBrandMatches())));
    });
    await t.test("all five languages expose the same simple query and trust boundary", async () => {
      await mount();
      for (const language of ["en", "sv", "es", "fr", "zh"] as const) {
        fixture.language = language; await act(async () => renderer!.update(tree()));
        assert.equal(text(root().findByType("h1")), brandLookupCopy[language].title);
        assert.ok(text(root()).includes(brandLookupCopy[language].disclosure)); assert.equal(root().findAllByType("input").length, 1);
      }
      assert.equal(requests.length, 0);
    });
  } finally {
    if (renderer) await act(async () => renderer!.unmount()); await vite.close(); globalThis.fetch = originalFetch;
    for (const [name, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name); }
  }
});
