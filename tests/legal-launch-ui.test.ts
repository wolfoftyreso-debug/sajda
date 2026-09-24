import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createElement as h } from "react";
import { MemoryRouter } from "react-router-dom";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { createServer } from "vite";
import { authPresentationCopy } from "../src/i18n/authPresentationCopy";
import { legalRightsCopy, IMY_COMPLAINT_URL } from "../src/i18n/legalRightsCopy";

const languages = ["en", "sv", "es", "fr", "zh"] as const;
function text(node: ReactTestInstance): string {
  return node.children.map(child => typeof child === "string" ? child : text(child)).join("");
}

test("legal guidance is available in every language without presenting the privacy notice as consent", async () => {
  for (const language of languages) {
    assert.deepEqual(Object.keys(legalRightsCopy[language]).sort(), Object.keys(legalRightsCopy.en).sort());
    assert.match(legalRightsCopy[language].request, /dev@hypbit\.com/);
    assert.match(legalRightsCopy[language].complaint, /IMY/);
    assert.ok(authPresentationCopy[language].legalLead.length > 0);
    assert.equal("consent" in authPresentationCopy[language], false);
    if (language !== "en") assert.notEqual(legalRightsCopy[language].rights, legalRightsCopy.en.rights);
  }
  const auth = await readFile(new URL("../src/pages/Auth.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(auth, /By continuing, you agree|Genom att fortsätta godkänner|Al continuar, aceptas|En continuant, vous acceptez|继续即表示你同意/u);
});

test("mounted legal and auth surfaces expose actionable rights and neutral links in five languages", async t => {
  const fixtureKey = "__SAJDA_LEGAL_TEST_LANGUAGE__";
  const originalFixture = Object.getOwnPropertyDescriptor(globalThis, fixtureKey);
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const originalFetch = globalThis.fetch;
  const setLanguage = (language: string) => Object.defineProperty(globalThis, fixtureKey, { configurable: true, value: language });
  setLanguage("en");
  Object.defineProperty(globalThis, "document", { configurable: true, value: { title: "Sajda" } });
  globalThis.fetch = async () => { throw new Error("Reading legal notices must not call a provider or create consent"); };
  const vite = await createServer({ configFile: false, appType: "custom",
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" },
    plugins: [{ name: "legal-test-language-boundary", enforce: "pre", load(id) {
      const file = id.replaceAll("\\", "/");
      if (file.endsWith("/src/i18n/LanguageProvider.tsx")) return `export const useLanguage=()=>({language:globalThis.${fixtureKey}});`;
      if (file.endsWith("/src/components/LanguageSwitcher.tsx")) return "export default function LanguageSwitcher(){return null;}";
      if (file.endsWith("/src/components/AiPrivacyControl.tsx")) return "export default function AiPrivacyControl(){return null;}";
    } }],
  });
  let renderer: ReactTestRenderer | undefined;
  async function mount(element: ReturnType<typeof h>) {
    if (renderer) await act(async () => renderer!.unmount());
    await act(async () => { renderer = create(h(MemoryRouter, { future: { v7_startTransition: true, v7_relativeSplatPath: true } }, element)); });
    return renderer!.root;
  }
  try {
    const [{ default: Legal }, { default: AuthLayout }] = await Promise.all([
      vite.ssrLoadModule("/src/pages/Legal.tsx"), vite.ssrLoadModule("/src/components/auth/AuthLayout.tsx"),
    ]);
    for (const language of languages) await t.test(`${language}: rights and authority links work without an account`, async () => {
      setLanguage(language);
      const legal = await mount(h(Legal));
      const rights = legal.findByProps({ "aria-labelledby": "privacy-rights-title" });
      const copy = legalRightsCopy[language];
      assert.equal(text(rights.findByType("h3")), copy.title);
      assert.deepEqual(rights.findAllByType("p").map(text), [copy.rights, copy.request, copy.complaint]);
      const links = rights.findAllByType("a");
      assert.deepEqual(links.map(link => link.props.href), ["mailto:dev@hypbit.com", IMY_COMPLAINT_URL]);
      assert.deepEqual(links.map(text), [copy.requestAction, copy.complaintAction]);
      for (const link of links) assert.match(link.props.className, /min-h-11.*focus-visible:ring-2/);
      assert.match(text(legal.findByProps({ "aria-labelledby": "legal-operator" })), /Landvex AB.*559141-7042/u);
      assert.equal(legal.findAllByType("h1").length, 1);
      assert.equal(legal.findAllByType("main").length, 1);
      const auth = await mount(h(AuthLayout, { screen: "request-reset", backLabel: "Back" }, h("h1", { id: "auth-heading" }, "Reset")));
      const footer = auth.findByType("footer");
      assert.ok(text(footer).startsWith(authPresentationCopy[language].legalLead));
      assert.deepEqual(footer.findAllByType("a").map(link => link.props.href), ["/legal#terms", "/legal#privacy"]);
      assert.equal(footer.findAllByType("input").length, 0, "A privacy-policy link is not a consent checkbox");
    });
  } finally {
    if (renderer) await act(async () => renderer!.unmount());
    await vite.close();
    globalThis.fetch = originalFetch;
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument); else delete (globalThis as { document?: unknown }).document;
    if (originalFixture) Object.defineProperty(globalThis, fixtureKey, originalFixture); else delete (globalThis as Record<string, unknown>)[fixtureKey];
  }
});
