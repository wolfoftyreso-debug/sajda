import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createElement as h } from "react";
import { MemoryRouter } from "react-router-dom";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { createServer } from "vite";

const languages = ["en", "sv", "es", "fr", "zh"] as const;

function text(node: ReactTestInstance): string {
  return node.children.map(child => typeof child === "string" ? child : text(child)).join(" ").replace(/\s+/gu, " ").trim();
}

// Native details keeps its content in HTML, but exposes only its summary until
// the user opens it. This is a DOM contract, not a browser layout assertion.
function isInitiallyExposed(node: ReactTestInstance): boolean {
  let current = node;
  while (current.parent) {
    const parent = current.parent;
    if (parent.type === "details" && !parent.props.open && current.type !== "summary") return false;
    current = parent;
  }
  return true;
}

function initiallyExposedText(node: ReactTestInstance): string {
  if (node.props["aria-hidden"] === "true" || node.props["aria-hidden"] === true || /(?:^|\s)sr-only(?:\s|$)/u.test(String(node.props.className ?? ""))) return "";
  if (node.type === "details" && !node.props.open) return initiallyExposedText(node.findByType("summary"));
  return node.children.map(child => typeof child === "string" ? child : initiallyExposedText(child)).join(" ").replace(/\s+/gu, " ").trim();
}

const caveats: Record<typeof languages[number], { unknown: RegExp; finalPrice: RegExp; valuation: RegExp; legal: RegExp }> = {
  en: { unknown: /unknown|no verified price|no current price|no fresh source|no reliable price/iu, finalPrice: /checkout|before (?:you buy|payment)/iu, valuation: /not (?:a |an )?(?:financial )?valuation/iu, legal: /trademark|legal advice/iu },
  sv: { unknown: /okänd|inget verifierat pris|saknas.*(?:pris|källa)/iu, finalPrice: /kassa|före (?:köp|betalning)/iu, valuation: /inte en (?:ekonomisk )?värdering/iu, legal: /varumärke|juridisk rådgivning/iu },
  es: { unknown: /desconocid[oa]|sin precio verificado|sin (?:una )?fuente/iu, finalPrice: /checkout|antes de (?:comprar|pagar)|pago/iu, valuation: /no (?:es )?una valoración/iu, legal: /marcas|asesoramiento legal/iu },
  fr: { unknown: /inconnu|aucun prix vérifié|sans source/iu, finalPrice: /paiement|avant (?:l’achat|d’acheter)/iu, valuation: /pas une évaluation|non une estimation financière|sans estimation financière/iu, legal: /marque|conseil juridique/iu },
  zh: { unknown: /未知|没有已核验价格|无.*价格|没有.*来源/u, finalPrice: /结账|付款前|购买前/u, valuation: /不是估值|并非估值|不是.*估值/u, legal: /商标|法律意见/u },
};

test("how it works is scannable in every locale, with truthful detail available on demand", async t => {
  const fixtureKey = "__SAJDA_HOW_CLARITY_LANGUAGE__";
  const originalFixture = Object.getOwnPropertyDescriptor(globalThis, fixtureKey);
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalFetch = globalThis.fetch;
  const documentFixture = { title: "Original page title" };
  let networkAttempts = 0;
  const setLanguage = (language: string) => Object.defineProperty(globalThis, fixtureKey, { configurable: true, value: language });
  setLanguage("en");
  Object.defineProperty(globalThis, "document", { configurable: true, value: documentFixture });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { pathname: "/how-it-works" } } });
  globalThis.fetch = async () => { networkAttempts++; throw new Error("Reading how Sajda works must not request private account data or start commerce actions"); };
  const vite = await createServer({
    configFile: false, appType: "custom",
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    resolve: { alias: { "@": path.resolve("src") } },
    optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" },
    plugins: [{ name: "how-it-works-clarity-language", enforce: "pre", load(id) {
      const normalized = id.replaceAll("\\", "/");
      if (normalized.endsWith("/src/i18n/LanguageProvider.tsx")) return `export const useLanguage=()=>({language:globalThis.${fixtureKey}});`;
      if (normalized.endsWith("/src/components/LanguageSwitcher.tsx")) return "export default function LanguageSwitcher(){return null;}";
    } }],
  });
  let renderer: ReactTestRenderer | undefined;
  try {
    const { default: HowItWorks } = await vite.ssrLoadModule("/src/pages/HowItWorks.tsx");
    for (const language of languages) {
      await t.test(`${language}: concrete headings, closed disclosures, and retained uncertainty`, async () => {
        setLanguage(language);
        if (renderer) await act(async () => renderer!.unmount());
        assert.equal(documentFixture.title, "Original page title", "page metadata must restore on unmount");
        await act(async () => { renderer = create(h(MemoryRouter, { initialEntries: ["/how-it-works"] }, h(HowItWorks))); });
        const root = renderer!.root;
        const main = root.findByType("main");
        assert.equal(main.findAllByType("h1").length, 1);
        assert.match(documentFixture.title, /Sajda/u);
        const headings = main.findAll(node => typeof node.type === "string" && /^h[1-6]$/u.test(node.type));
        let previousLevel = 0;
        for (const heading of headings) {
          const level = Number(String(heading.type).slice(1));
          assert.ok(level <= previousLevel + 1, `heading level jumps at ${text(heading)}`);
          assert.ok(text(heading).length > 0, "headings must have an accessible name");
          previousLevel = level;
        }

        const direction = main.findByProps({ id: "direction" });
        const cards = direction.findAllByType("article");
        assert.equal(cards.length, 3, "each supported search path has one card");
        assert.deepEqual(cards.map(card => card.props["data-search-path"]), [0, 1, 2]);
        const cardTitles = cards.map(card => text(card.findByType("h3")));
        assert.equal(new Set(cardTitles).size, 3, "the three paths must have distinct headings");
        for (const card of cards) {
          const title = card.findByType("h3");
          assert.ok(text(title).length <= 64, `search title is a long explanation: ${text(title)}`);
          const visibleParagraphs = card.findAllByType("p").filter(isInitiallyExposed);
          assert.equal(visibleParagraphs.length, 1, "a search card should expose one explanation, not competing labels and paragraphs");
          assert.ok(text(visibleParagraphs[0]).length <= 210, "the initial explanation must stay concise");
          const disclosures = card.findAllByType("details");
          assert.equal(disclosures.length, 1, "technical search details remain available on demand");
          assert.ok(initiallyExposedText(card).length < text(card).length, "the collapsed card must actually hide secondary detail");
        }

        const disclosures = main.findAllByType("details");
        assert.ok(disclosures.length >= 3, "secondary detail uses native disclosures");
        const disclosureNames: string[] = [];
        for (const disclosure of disclosures) {
          assert.ok(disclosure.props.open === undefined || disclosure.props.open === false, "disclosures start closed");
          const summaries = disclosure.children.filter(child => typeof child !== "string" && child.type === "summary") as ReactTestInstance[];
          assert.equal(summaries.length, 1, "a native summary is a direct child of details");
          const summary = summaries[0];
          const accessibleName = String(summary.props["aria-label"] ?? text(summary)).trim();
          assert.ok(accessibleName.length > 2, "disclosure controls have a useful name");
          assert.ok(initiallyExposedText(summary).length > 1, "disclosure controls need visible text, not only a screen-reader label or icon");
          assert.equal(summary.props.tabIndex === -1, false, "the native disclosure stays keyboard reachable");
          assert.equal(summary.findAll(node => node.type === "a" || node.type === "button" || node.type === "input").length, 0, "do not nest competing controls inside a summary");
          disclosureNames.push(accessibleName);
        }
        assert.equal(new Set(disclosureNames).size, disclosureNames.length, "disclosure controls have distinct accessible names");

        const fullText = text(main);
        for (const [obligation, pattern] of Object.entries(caveats[language])) assert.match(fullText, pattern, `${language} retains ${obligation} caveat`);
        assert.match(fullText, /RDAP|DAS|WHOIS/u, "registry detail is preserved, not deleted to reduce text");
        assert.match(fullText, /12/u, "exact-search input limit remains discoverable");
        assert.match(fullText, /250/u, "brief length remains discoverable");
        const fullCardLength = cards.reduce((sum, card) => sum + text(card).length, 0);
        const exposedCardLength = cards.reduce((sum, card) => sum + initiallyExposedText(card).length, 0);
        assert.ok(exposedCardLength < fullCardLength * 0.8, "the default search-card scan should be substantially shorter than the full explanation");

        const ids = new Set(root.findAll(node => typeof node.type === "string" && typeof node.props.id === "string").map(node => node.props.id));
        for (const link of root.findAllByType("a")) {
          const href = String(link.props.href);
          assert.match(href, /^(?:\/(?!\/)|#[A-Za-z][\w-]*$)/u, "links remain safe internal navigation");
          if (href.startsWith("#")) assert.ok(ids.has(href.slice(1)), `anchor target exists for ${href}`);
          assert.ok(String(link.props["aria-label"] ?? text(link)).trim().length > 0, "links have an accessible name");
        }
        assert.equal(root.findAllByType("form").length, 0, "the explanation page has no account or payment forms");
        assert.equal(networkAttempts, 0, "reading the explanation has no network or commerce side effects");
      });
    }
  } finally {
    if (renderer) await act(async () => renderer!.unmount());
    await vite.close();
    globalThis.fetch = originalFetch;
    if (originalFixture) Object.defineProperty(globalThis, fixtureKey, originalFixture); else Reflect.deleteProperty(globalThis, fixtureKey);
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument); else Reflect.deleteProperty(globalThis, "document");
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow); else Reflect.deleteProperty(globalThis, "window");
  }
});
