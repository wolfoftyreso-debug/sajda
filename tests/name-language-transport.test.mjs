import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { build } from "esbuild";

test("real anonymous search serializer keeps name language separate from locale and exact checks", async () => {
  const requests = [], key = "__sajdaNameLanguageTransport";
  const originals = new Map([key, "window"].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  Object.defineProperty(globalThis, key, { configurable: true, value: requests });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { setTimeout, clearTimeout } });
  try {
    const result = await build({ entryPoints: ["src/lib/localTestSearch.ts"], bundle: true, write: false, platform: "node", format: "esm",
      alias: { "@": path.resolve("src") }, plugins: [{ name: "isolated-name-language-transport", setup(builder) {
        builder.onLoad({ filter: /[/\\]productFetch\.ts$/ }, () => ({ contents: `export async function productFetch(url, init) { globalThis.${key}.push({url, body:JSON.parse(init.body)}); return {ok:true,json:async()=>({results:[]})}; }`, loader: "ts" }));
        builder.onLoad({ filter: /[/\\]anonymousSearchMode\.ts$/ }, () => ({ contents: 'export const getAnonymousSearchEndpoint=()=>"/api/domain-search"; export const isAnonymousSearchMode=()=>true;', loader: "ts" }));
        builder.onLoad({ filter: /[/\\]LanguageProvider\.tsx$/ }, () => ({ contents: "export const translate=(_language,key)=>key;", loader: "ts" }));
      } }] });
    const { runAnonymousSearch } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
    for (const nameLanguage of ["en", "sv", "fr", "es", "de", "it", "pt"]) {
      await runAnonymousSearch(["com"], 10, "bakery", "sv", { namePackages: true, nameLanguage });
      assert.equal(requests.at(-1).body.nameLanguage, nameLanguage);
      assert.equal(requests.at(-1).body.locale, "sv");
      assert.equal(requests.at(-1).body.advanced, false);
      assert.equal(requests.at(-1).body.aiConsent, undefined);
    }
    await runAnonymousSearch(["com"], 1, "atelier", "en", { namePackages: true, nameLanguage: "fr", domains: ["atelier.com"] });
    assert.deepEqual(requests.at(-1).body.domains, ["atelier.com"]);
    assert.equal("nameLanguage" in requests.at(-1).body, false);
    await runAnonymousSearch(["com"], 10, "bakery", "en", { nameLanguage: "fr" });
    assert.equal("nameLanguage" in requests.at(-1).body, false, "Ordinary search keeps its existing contract");
  } finally {
    for (const [name, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; }
  }
});
