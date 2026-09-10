import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createElement as h } from "react";
import { MemoryRouter } from "react-router-dom";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { createServer } from "vite";

const label = (node: ReactTestInstance): string => node.children.map(child => typeof child === "string" ? child : label(child)).join("");
const classes = (node: ReactTestInstance) => new Set(String(node.props.className ?? "").split(/\s+/u));
const codes = ["en", "sv", "es", "fr", "zh"];
const fullNames = {
  en: ["English", "Svenska", "Español", "Français", "简体中文"],
  sv: ["English", "Svenska", "Español", "Français", "简体中文"],
  es: ["English", "Svenska", "Español", "Français", "简体中文"],
  fr: ["Anglais", "Suédois", "Espagnol", "Français", "Chinois simplifié"],
  zh: ["英语", "瑞典语", "西班牙语", "法语", "简体中文"],
};
const storageKey = "name-quest.language.v2";

test("compact native language selection uses the real shared language provider", async t => {
  const originals = new Map(["window", "document"].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const originalFetch = globalThis.fetch;
  const storage = new Map<string, string>();
  const metadata = new Map<string, string>();
  const documentFixture = {
    documentElement: { lang: "" }, title: "",
    querySelector(selector: string) { return { setAttribute(name: string, value: string) { metadata.set(`${selector}:${name}`, value); } }; },
  };
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    location: { pathname: "/account" }, history: { state: { idx: 0 } }, setTimeout, clearTimeout,
    localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) },
  } });
  Object.defineProperty(globalThis, "document", { configurable: true, value: documentFixture });
  globalThis.fetch = async () => { throw new Error("Language controls must not call a backend"); };
  const vite = await createServer({
    configFile: false, appType: "custom",
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    resolve: { alias: { "@": path.resolve("src") } },
    optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" },
  });
  let renderer: ReactTestRenderer | undefined;
  const root = () => renderer!.root;
  try {
    const { LanguageProvider } = await vite.ssrLoadModule("/src/i18n/LanguageProvider.tsx");
    const { default: NativeLanguageSwitcher } = await vite.ssrLoadModule("/src/app/NativeLanguageSwitcher.tsx");
    const { default: NativeShell } = await vite.ssrLoadModule("/src/app/NativeShell.tsx");
    const { default: WebLanguageSwitcher } = await vite.ssrLoadModule("/src/components/LanguageSwitcher.tsx");
    const mount = async (child: ReturnType<typeof h>) => {
      if (renderer) await act(async () => renderer!.unmount());
      await act(async () => { renderer = create(h(LanguageProvider, null, child)); });
    };

    await t.test("one controlled system select retains localized full names and touch/focus classes", async () => {
      await mount(h(NativeLanguageSwitcher));
      const select = root().findByType("select");
      assert.equal(root().findAllByType("select").length, 1);
      assert.equal(root().findAllByType("button").length, 0);
      assert.equal(select.props.value, "en");
      assert.equal(select.props["aria-label"], "Language");
      const options = select.findAllByType("option");
      assert.deepEqual(options.map(option => option.props.value), codes);
      assert.equal(options.every(option => option.props.lang === undefined), true, "Localized option labels inherit the document language");
      assert.deepEqual(options.map(label), fullNames.en);
      for (const name of ["relative", "h-11", "w-16", "shrink-0", "focus-within:ring-2"]) assert.ok(classes(select.parent!).has(name), name);
      for (const name of ["absolute", "inset-0", "h-full", "w-full", "min-h-11", "min-w-11", "text-base", "opacity-0", "cursor-pointer"]) assert.ok(classes(select).has(name), name);
      assert.equal(root().findByType("span").props["aria-hidden"], "true");
      assert.equal(root().findByType("svg").props["aria-hidden"], "true");
    });

    await t.test("all five changes update selected value, localized label, metadata and existing preference key", async () => {
      for (const [code, accessible, short, htmlLang, locale] of [
        ["en", "Language", "EN", "en", "en_US"], ["sv", "Språk", "SV", "sv", "sv_SE"],
        ["es", "Idioma", "ES", "es", "es_ES"], ["fr", "Langue", "FR", "fr", "fr_FR"],
        ["zh", "语言", "中文", "zh-Hans", "zh_CN"],
      ]) {
        await act(async () => root().findByType("select").props.onChange({ target: { value: code } }));
        const select = root().findByType("select");
        assert.equal(select.props.value, code);
        assert.equal(select.props["aria-label"], accessible);
        assert.deepEqual(select.findAllByType("option").map(label), fullNames[code as keyof typeof fullNames]);
        assert.equal(label(root().findByType("span")), short);
        assert.deepEqual([...storage], [[storageKey, code]]);
        assert.equal(documentFixture.documentElement.lang, htmlLang);
        assert.equal(metadata.get("meta[property='og:locale']:content"), locale);
        assert.ok(documentFixture.title.startsWith("Sajda"));
        assert.ok(metadata.get("meta[name='description']:content"));
      }
    });

    await t.test("unexpected values are ignored and remount restores the stored language", async () => {
      for (const invalid of ["de", "", "__proto__", "EN"]) {
        await act(async () => root().findByType("select").props.onChange({ target: { value: invalid } }));
        assert.equal(root().findByType("select").props.value, "zh");
        assert.equal(storage.get(storageKey), "zh");
        assert.equal(documentFixture.documentElement.lang, "zh-Hans");
      }
      await mount(h(NativeLanguageSwitcher));
      assert.equal(root().findByType("select").props.value, "zh");
      assert.equal(root().findByType("select").props["aria-label"], "语言");
    });

    await t.test("the account header retains back, logo, language, help and more within its source-class width budget", async () => {
      await mount(h(MemoryRouter, { initialEntries: ["/account"] }, h(NativeShell, null, h("main", null, "Account content"))));
      const header = root().findByType("header");
      const back = header.findByType("button");
      const links = header.findAllByType("a");
      const select = header.findByType("select");
      assert.deepEqual(links.map(link => link.props.href), ["/", "/help", "/more"]);
      assert.ok(back.props["aria-label"]);
      assert.equal(links[0].props["aria-label"], "Sajda");
      for (const control of [back, ...links]) {
        assert.ok(control.props["aria-label"]);
        assert.ok(classes(control).has("h-11") || classes(control).has("min-h-11"));
        assert.ok(classes(control).has("shrink-0"));
        assert.ok(classes(control).has("focus-visible:ring-2"));
      }
      assert.ok(classes(back).has("w-11"));
      for (const link of links.slice(1)) assert.ok(classes(link).has("w-11"));
      assert.ok(classes(select.parent!).has("h-11"));
      assert.ok(classes(select.parent!).has("w-16"));
      assert.ok(classes(links[0].findByType("img")).has("w-[76px]"));
      const row = header.children[0] as ReactTestInstance;
      const left = back.parent!;
      let right = links[1].parent!;
      while (typeof right.type !== "string") right = right.parent!;
      assert.ok(classes(row).has("px-3"));
      assert.ok(classes(row).has("gap-2"));
      assert.ok(classes(left).has("gap-1"));
      assert.ok(classes(right).has("gap-1"));
      // Tailwind default spacing, source/rendered-prop contract only; this is
      // deliberately not a browser/simulator pixel measurement or visual QA.
      const sourceClassBudget = 24 + 44 + 4 + 76 + 8 + 64 + 8 + 44 + 44;
      assert.equal(sourceClassBudget, 316);
      assert.ok(sourceClassBudget <= 320);
      assert.deepEqual(root().findByType("nav").findAllByType("a").map(link => link.props.href), ["/", "/swipe", "/watchlist", "/plus", "/account"]);
    });

    await t.test("the website keeps its five-button language switcher and shares the same saved preference", async () => {
      await mount(h(WebLanguageSwitcher));
      assert.equal(root().findAllByType("select").length, 0);
      const buttons = root().findAllByType("button");
      assert.equal(buttons.length, 5);
      assert.deepEqual(buttons.map(label), ["EN", "SV", "ES", "FR", "中文"]);
      assert.deepEqual(buttons.map(button => button.props["aria-label"]), fullNames.zh);
      assert.equal(buttons[4].props["aria-pressed"], true);
      await act(async () => buttons[3].props.onClick());
      assert.equal(storage.get(storageKey), "fr");
      assert.equal(documentFixture.documentElement.lang, "fr");
      assert.equal(root().findAllByType("button")[3].props["aria-pressed"], true);
      await mount(h(NativeLanguageSwitcher));
      assert.equal(root().findByType("select").props.value, "fr");
    });
  } finally {
    if (renderer) await act(async () => renderer!.unmount());
    await vite.close();
    globalThis.fetch = originalFetch;
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});
