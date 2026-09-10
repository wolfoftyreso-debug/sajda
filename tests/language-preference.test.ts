import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createElement as h, Fragment } from "react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { createServer } from "vite";
import { LANGUAGE_STORAGE_KEY, languageForPath, resolveDeviceLanguage } from "../src/i18n/languagePreference";

test("device language negotiation respects preference order and English fallback", () => {
  for (const [input, expected] of [
    [["en-US"], "en"], [["en-GB", "sv-SE"], "en"], [["sv-SE", "en-US"], "sv"],
    [["sv-FI"], "sv"], [["es-MX"], "es"], [["fr-CA"], "fr"], [["zh-CN"], "zh"],
    [["zh-Hans-SG"], "zh"], [["zh-Hant-TW"], "zh"], [[" SV-se "], "sv"],
    [["de-DE", "fr-FR", "en-US"], "fr"], [["en-US", "fr-FR"], "en"],
    [["de-DE", "ja-JP"], "en"], [[], "en"],
    [[null, {}, 4, "", "sv_XX", "sv-", "swedish", "__proto__"], "en"],
    [["bad_tag", "es-ES"], "es"],
  ] as const) assert.equal(resolveDeviceLanguage(input), expected, JSON.stringify(input));
});

test("only the explicit Swedish URL family overrides device or manual language", () => {
  for (const url of ["/se", "/se/", "/se/sok-doman", "/se/sa-fungerar-sajda"]) assert.equal(languageForPath("fr", url), "sv");
  for (const url of ["/", "/account", "/search", "/security", "/seller", "/secrets", "/SE"]) assert.equal(languageForPath("fr", url), "fr");
});

test("the real web/native language provider detects without persisting automatic decisions", async t => {
  const originals = new Map(["window", "document"].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const originalFetch = globalThis.fetch;
  const stored = new Map<string, string>();
  const listeners = new Set<() => void>();
  const navigator = { languages: ["sv-SE", "en-US"], language: "sv-SE" };
  let blockStorage = false;
  let writes = 0;
  const doc = { documentElement: { lang: "en" }, title: "", querySelector: () => ({ setAttribute() {} }) };
  const fixture = {
    navigator, location: { pathname: "/" },
    localStorage: {
      getItem(key: string) { if (blockStorage) throw new Error("storage blocked"); return stored.get(key) ?? null; },
      setItem(key: string, value: string) { if (blockStorage) throw new Error("storage blocked"); writes++; stored.set(key, value); },
    },
    addEventListener(event: string, listener: () => void) { if (event === "languagechange") listeners.add(listener); },
    removeEventListener(event: string, listener: () => void) { if (event === "languagechange") listeners.delete(listener); },
  };
  Object.defineProperty(globalThis, "window", { configurable: true, value: fixture });
  Object.defineProperty(globalThis, "document", { configurable: true, value: doc });
  globalThis.fetch = async () => { throw new Error("Language detection must not call external services"); };
  const vite = await createServer({ configFile: false, appType: "custom",
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    resolve: { alias: { "@": path.resolve("src") } },
    optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" },
  });
  let renderer: ReactTestRenderer | undefined;
  try {
    const { LanguageProvider, LanguageRouteSync, useLanguage, getStoredLanguage } = await vite.ssrLoadModule("/src/i18n/LanguageProvider.tsx");
    const { default: WebSwitcher } = await vite.ssrLoadModule("/src/components/LanguageSwitcher.tsx");
    const { default: NativeSwitcher } = await vite.ssrLoadModule("/src/app/NativeLanguageSwitcher.tsx");
    let context: ReturnType<typeof useLanguage>;
    let navigate: ReturnType<typeof useNavigate>;
    function Probe() { context = useLanguage(); navigate = useNavigate(); return h("output", null, context.language); }
    const mount = async (pathname = "/", native = false) => {
      if (renderer) await act(async () => renderer!.unmount());
      fixture.location.pathname = pathname;
      await act(async () => { renderer = create(h(LanguageProvider, null, h(MemoryRouter, { initialEntries: [pathname] },
        h(Fragment, null, h(LanguageRouteSync), h(Probe), h(native ? NativeSwitcher : WebSwitcher))))); });
    };
    const changeDevice = async (...languages: string[]) => {
      navigator.languages = languages; navigator.language = languages[0] ?? "";
      await act(async () => { for (const listener of listeners) listener(); });
    };

    await t.test("Swedish OS starts web in Swedish without a persisted override", async () => {
      await mount();
      assert.equal(context.language, "sv"); assert.equal(doc.documentElement.lang, "sv");
      assert.equal(renderer!.root.findByProps({ "aria-pressed": true }).props["aria-label"], "Svenska");
      assert.equal(stored.size, 0); assert.equal(writes, 0); assert.equal(getStoredLanguage(), "sv");
    });
    await t.test("native uses the same first-run preference, including regional variants", async () => {
      await changeDevice("fr-CA", "en-US"); await mount("/account", true);
      assert.equal(context.language, "fr"); assert.equal(renderer!.root.findByType("select").props.value, "fr");
      assert.equal(stored.size, 0); assert.equal(doc.documentElement.lang, "fr");
    });
    await t.test("unsupported device languages default to English", async () => {
      await changeDevice("de-DE", "ja-JP"); await mount("/account", true);
      assert.equal(context.language, "en"); assert.equal(doc.documentElement.lang, "en");
      assert.equal(stored.size, 0);
    });
    await t.test("navigator.language works when no languages array entries are available", async () => {
      navigator.languages = []; navigator.language = "es-AR"; await mount();
      assert.equal(context.language, "es"); assert.equal(getStoredLanguage(), "es");
    });
    await t.test("languagechange follows the device until a manual choice is made", async () => {
      await changeDevice("sv-SE"); assert.equal(context.language, "sv");
      await changeDevice("en-US"); assert.equal(context.language, "en");
      assert.equal(stored.size, 0);
    });
    await t.test("explicit English is stored even when it was already the fallback", async () => {
      await act(async () => context.setLanguage("en"));
      assert.equal(stored.get(LANGUAGE_STORAGE_KEY), "en");
      await changeDevice("sv-SE"); assert.equal(context.language, "en");
      await mount(); assert.equal(context.language, "en"); assert.equal(getStoredLanguage(), "en");
    });
    await t.test("every supported existing v2 preference is preserved over the OS", async () => {
      for (const language of ["en", "sv", "es", "fr", "zh"]) {
        stored.set(LANGUAGE_STORAGE_KEY, language); await mount(); assert.equal(context.language, language);
      }
    });
    await t.test("invalid storage does not force English over a supported device language", async () => {
      stored.set(LANGUAGE_STORAGE_KEY, "__proto__"); await changeDevice("es-MX"); await mount();
      assert.equal(context.language, "es"); assert.equal(getStoredLanguage(), "es");
    });
    await t.test("blocked storage still allows device detection and an in-memory manual choice", async () => {
      blockStorage = true; await changeDevice("fr-FR"); await mount();
      assert.equal(context.language, "fr");
      await act(async () => context.setLanguage("sv")); assert.equal(context.language, "sv");
      await changeDevice("en-GB"); assert.equal(context.language, "sv");
      blockStorage = false; stored.clear();
    });
    await t.test("a Swedish market visit never changes the chosen language and leaving restores it", async () => {
      stored.set(LANGUAGE_STORAGE_KEY, "fr"); await mount(); const before = writes;
      await act(async () => navigate("/se/sok-doman"));
      assert.equal(context.language, "sv"); assert.equal(context.selectedLanguage, "fr");
      assert.equal(doc.documentElement.lang, "sv-SE");
      doc.title = "Sök domän — Sajda Sverige";
      await changeDevice("es-ES"); assert.equal(doc.title, "Sök domän — Sajda Sverige");
      await act(async () => navigate("/account"));
      assert.equal(context.language, "fr"); assert.equal(doc.documentElement.lang, "fr");
      assert.equal(stored.get(LANGUAGE_STORAGE_KEY), "fr"); assert.equal(writes, before);
    });
    await t.test("direct Swedish entry does not pin returning product views to Swedish", async () => {
      stored.clear(); await changeDevice("es-ES"); await mount("/se/sa-fungerar-sajda");
      assert.equal(context.language, "sv");
      await act(async () => navigate("/")); assert.equal(context.language, "es");
      assert.equal(stored.size, 0);
    });
    await t.test("invalid manual language values are ignored", async () => {
      await act(async () => context.setLanguage("__proto__"));
      assert.equal(context.language, "es"); assert.equal(stored.size, 0);
    });
    await t.test("listener is removed on unmount and server fallback is English", async () => {
      assert.equal(listeners.size, 1);
      await act(async () => renderer!.unmount()); renderer = undefined;
      assert.equal(listeners.size, 0);
      Reflect.deleteProperty(globalThis, "window"); assert.equal(getStoredLanguage(), "en");
    });
  } finally {
    if (renderer) await act(async () => renderer!.unmount());
    await vite.close(); globalThis.fetch = originalFetch;
    for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
  }
});
