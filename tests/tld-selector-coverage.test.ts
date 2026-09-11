import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createElement as h } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { createServer } from "vite";
import { translate } from "../src/i18n/LanguageProvider";

const languages = ["en", "sv", "es", "fr", "zh"] as const;
function text(node: ReactTestInstance): string {
  return node.children.map(child => typeof child === "string" ? child : text(child)).join(" ");
}

test("unconnected extensions stay unselectable and a private manual lookup is clear in five languages", async () => {
  const fixtureKey = "__SAJDA_TLD_COVERAGE_FIXTURE__";
  const originalFixture = Object.getOwnPropertyDescriptor(globalThis, fixtureKey);
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalFetch = globalThis.fetch;
  const fixture = { language: "en" as typeof languages[number], translate, local: false };
  Object.defineProperty(globalThis, fixtureKey, { configurable: true, value: fixture });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { hostname: "sajda-test-hypbit.vercel.app" } } });
  let fetches = 0;
  globalThis.fetch = async () => { fetches++; throw new Error("The selector must not query an external service"); };
  const vite = await createServer({
    configFile: false, appType: "custom",
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    resolve: { alias: { "@": path.resolve("src") } },
    define: { "import.meta.env.VITE_PUBLIC_SEARCH_MODE": '"true"' },
    optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" },
    plugins: [{ name: "tld-coverage-fixtures", enforce: "pre", load(id) {
      const file = id.replaceAll("\\", "/");
      if (file.endsWith("/src/i18n/LanguageProvider.tsx")) return `export const useLanguage=()=>{
        const fixture=globalThis.${fixtureKey};
        return {language:fixture.language,t:(key,values)=>fixture.translate(fixture.language,key,values)};
      };`;
      if (file.endsWith("/src/lib/localTestMode.ts")) return `export const isLocalTestMode=()=>globalThis.${fixtureKey}.local;`;
    } }],
  });
  let renderer: ReactTestRenderer | undefined;
  try {
    const { default: TLDSelector } = await vite.ssrLoadModule("/src/components/TLDSelector.tsx");
    const { PUBLIC_SEARCH_TLD_IDS, getAnonymousSearchTlds } = await vite.ssrLoadModule("/src/lib/anonymousSearchMode.ts");
    assert.ok(["se", "nu", "io"].every(tld => !PUBLIC_SEARCH_TLD_IDS.includes(tld)));
    for (const local of [false, true]) {
      fixture.local = local;
      for (const language of languages) {
        fixture.language = language;
        if (renderer) await act(async () => renderer!.unmount());
        const toggled: string[] = [];
        await act(async () => { renderer = create(h(TLDSelector, { selectedTLDs: ["com"], onToggleTLD: (tld: string) => toggled.push(tld) })); });
        const root = renderer!.root;
        const notice = root.findByProps({ role: "note" });
        const expected = translate(language, "search.unconnectedExtensions", { endings: ".io, .se, .nu" });
        assert.ok(text(notice).includes(expected), `${language}: coverage visible before expansion`);
        assert.doesNotMatch(text(notice), /\{endings\}/);
        const link = root.findByType("a");
        assert.equal(link.props.href, "https://internetstiftelsen.se/sok-doman/");
        const url = new URL(link.props.href);
        assert.equal(url.search, "");
        assert.equal(url.hash, "");
        assert.equal(link.props.target, "_blank");
        assert.equal(link.props.rel, "noopener noreferrer");
        assert.equal(link.props.referrerPolicy, "no-referrer");
        assert.equal(text(link).trim(), translate(language, "search.manualSeNuCheck"));
        assert.ok(link.props["aria-label"].includes(translate(language, "search.externalNewTab")));
        assert.equal(link.props.onClick, undefined, "manual external link has no search side effect");
        await act(async () => root.findByType("button").props.onClick());
        const choices = root.findAllByType("button").filter(button => typeof button.props["aria-pressed"] === "boolean");
        assert.equal(choices.length, getAnonymousSearchTlds().length);
        for (const tld of ["se", "nu", "io"]) assert.ok(!choices.some(button => text(button).trim().startsWith(`.${tld} `)));
        const com = choices.find(button => text(button).trim().startsWith(".com "))!;
        assert.equal(com.props.disabled, true, "the final selected supported extension stays selected");
        const ai = choices.find(button => text(button).trim().startsWith(".ai "))!;
        await act(async () => ai.props.onClick());
        assert.deepEqual(toggled, ["ai"]);
        await act(async () => renderer!.update(h(TLDSelector, { selectedTLDs: ["com"], onToggleTLD: () => {}, disabled: true })));
        assert.ok(root.findAllByType("button").every(button => button.props.disabled));
      }
    }
    assert.equal(fetches, 0);
  } finally {
    if (renderer) await act(async () => renderer!.unmount());
    await vite.close();
    globalThis.fetch = originalFetch;
    if (originalFixture) Object.defineProperty(globalThis, fixtureKey, originalFixture); else Reflect.deleteProperty(globalThis, fixtureKey);
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow); else Reflect.deleteProperty(globalThis, "window");
  }
});
