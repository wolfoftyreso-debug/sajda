import assert from "node:assert/strict";
import test from "node:test";
import { BRAND_NAME_LANGUAGES } from "../shared/name-languages.js";
import { generateConnectorCandidates } from "../api/_shared/connector-candidates.js";
import { generateNamePackageCandidates } from "../api/_shared/name-package-candidates.js";
import { parseNamePackageSearchRequest } from "../api/_shared/name-package-contract.js";
import { createDomainSearchHandler } from "../api/domain-search.js";
import type { NamingInput } from "../api/_shared/contextual-naming.js";
import { AI_CONSENT_VERSION } from "../shared/ai-consent.js";

const request = { query: "creative design studio", tlds: ["com", "ai"], platforms: ["github"], count: 10 };

test("seven requested name languages generate distinct complete non-AI packages independent of UI locale", () => {
  const signatures = new Set<string>();
  const roots = { en: /form|pixel|canvas|frame|craft|shape|color|studio/, sv: /form|farg|linje|ram|skiss|atelje|yta|bild/,
    fr: /forme|toile|cadre|atelier|ligne|dessin/, es: /forma|lienzo|marco|taller|trazo|diseno/,
    de: /form|farbe|rahmen|werk|linie|bild/, it: /forma|tela|cornice|bottega|linea|disegno/,
    pt: /forma|tela|moldura|oficina|linha|desenho/ };
  for (const nameLanguage of BRAND_NAME_LANGUAGES) {
    const input = parseNamePackageSearchRequest({ ...request, nameLanguage, locale: "zh" });
    const result = generateNamePackageCandidates(input);
    assert.equal(result.labels.length, 10, nameLanguage); assert.equal(result.domains.length, 20);
    assert.ok(result.labels.every(label => roots[nameLanguage].test(label)), `${nameLanguage}: ${result.labels}`);
    assert.ok(result.labels.every(label => /^[a-z]{6,20}$/.test(label)));
    assert.deepEqual(generateNamePackageCandidates({ ...input, locale: "sv" }), result);
    signatures.add(result.labels.join(","));
  }
  assert.equal(signatures.size, 7);
});

test("English is the package default; invalid languages fail closed and brief language can differ", () => {
  assert.equal(parseNamePackageSearchRequest({ ...request, locale: "sv" }).nameLanguage, "en");
  for (const nameLanguage of ["auto", "mixed", "zh", "FR", " fr", "", null, 1, {}]) {
    assert.throws(() => parseNamePackageSearchRequest({ ...request, nameLanguage }));
  }
  const french = generateConnectorCandidates({ query: "calm planning tool", nameLanguage: "fr", tlds: ["com"], count: 10 });
  assert.equal(french.length, 10); assert.ok(french.every(item => /plan|cap|rythme|agenda|jour|elan|repere/.test(item.label)));
  assert.ok(french.every(item => !/calmhub|planning|tool|grove|nest/.test(item.label)));
  const german = generateConnectorCandidates({ query: "Bäckerei und Kaffee", nameLanguage: "de", tlds: ["com"], count: 10 });
  assert.equal(german.length, 10); assert.ok(german.every(item => /tisch|korn|brot|kueche|ofen|genuss/.test(item.label)));
});

let sequence = 0;
async function invoke(handler: ReturnType<typeof createDomainSearchHandler>, body: Record<string, unknown>) {
  let status = 0, data: Record<string, unknown> = {};
  await handler({ method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `language-fixture-${++sequence}` }, body }, {
    setHeader() {}, status(value) { status = value; return this; }, json(value) { data = value as Record<string, unknown>; }, end() {},
  });
  return { status, data };
}

test("browser handler honours explicit language for rules and consented AI, but never translates exact names", async () => {
  const originalFetch = globalThis.fetch;
  const seen: NamingInput[] = [];
  globalThis.fetch = async () => new Response("fixture unavailable", { status: 503 });
  const handler = createDomainSearchHandler(async input => { seen.push(input); return ["atelierclair", "toilevive", "cadrefin", "lignepure"]
    .map(label => ({ label, direction: "compound" as const })); });
  const body = { theme: "creative design studio", namePackages: true, nameLanguage: "fr", locale: "sv", tlds: ["com", "ai"], providers: ["cloudflare"], count: 50 };
  try {
    const rules = await invoke(handler, body);
    assert.equal(rules.status, 200); assert.equal(seen.length, 0);
    const expected = generateNamePackageCandidates(parseNamePackageSearchRequest({ ...request, nameLanguage: "fr" }));
    assert.deepEqual((rules.data.results as { domain: string }[]).map(row => row.domain), expected.domains);
    const ai = await invoke(handler, { ...body, aiConsent: { version: AI_CONSENT_VERSION, accepted: true } });
    assert.equal(ai.status, 200); assert.equal(seen[0].constraints?.nameLanguage, "fr"); assert.equal(seen[0].locale, "sv");
    const projectRules = await invoke(handler, { ...body, advanced: true,
      brief: "A calm creative design studio making visual identities for independent founders and small businesses." });
    assert.equal(projectRules.status, 200);
    assert.ok((projectRules.data.results as { domain: string }[]).length > 0,
      "Project title words in another language must not become mandatory untranslated prefixes.");
    const exact = await invoke(handler, { ...body, domains: ["alreadyselected.com"] });
    assert.equal(exact.status, 200); assert.deepEqual((exact.data.results as { domain: string }[]).map(row => row.domain), ["alreadyselected.com"]);
    assert.equal(seen.length, 1);
    assert.equal((await invoke(handler, { ...body, nameLanguage: "zz" })).status, 400);
  } finally { globalThis.fetch = originalFetch; }
});
