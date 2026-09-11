import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createElement as h } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { createServer } from "vite";
import { buildSearchRefinement, FIRST_RESULTS_COUNT, getVisibleSearchResults, nextSearchResultCount, normalizeRefinementNames, REFINEMENT_REASONS } from "../src/lib/searchRefinement";
import { getSearchGenerationNote, refinementText, searchRefinementCopy } from "../src/i18n/searchRefinementCopy";
import { isRefinementDomainName, parseSearchRefinement, type RefinementReason, type SearchRefinement as SearchRefinementPayload } from "../shared/search-refinement";

const languages = ["en", "sv", "es", "fr", "zh"] as const;
const names = Array.from({ length: 60 }, (_, index) => `example${index}.com`);
function text(node: ReactTestInstance): string {
  return node.children.map(child => typeof child === "string" ? child : text(child)).join(" ").replace(/\s+/g, " ").trim();
}

test("the first result view is small and revealing more preserves existing ranking", () => {
  const original = [...names];
  assert.equal(FIRST_RESULTS_COUNT, 10);
  assert.deepEqual(getVisibleSearchResults(names), names.slice(0, 10));
  assert.deepEqual(getVisibleSearchResults(names, 20), names.slice(0, 20));
  assert.deepEqual(getVisibleSearchResults(names, Number.NaN), names.slice(0, 10));
  assert.deepEqual(getVisibleSearchResults(names, -1), []);
  assert.equal(nextSearchResultCount(10, 50), 20);
  assert.equal(nextSearchResultCount(20, 23), 23);
  assert.equal(nextSearchResultCount(10, 5), 5);
  assert.equal(nextSearchResultCount(10, Number.NaN), 0);
  assert.deepEqual(names, original);
});

test("explicit feedback is bounded, deduplicated and limited to names in this result set", () => {
  assert.deepEqual(normalizeRefinementNames(["  EXAMPLE.COM ", "example.com", "example.se", "not a domain", "bad-.com", "-bad.com", "https://example.com", "x<script>.com", "åland.se"]), ["example.com", "example.se"]);
  assert.equal(normalizeRefinementNames(names).length, 50);
  const unsupported = ["a.se", "ab.com", "has-hyphen.com", "sub.example.com", "averylongdomainlabelthatexceeds22.com", "0start.com"];
  for (const name of unsupported) assert.equal(isRefinementDomainName(name), false);
  assert.deepEqual(normalizeRefinementNames(unsupported), []);
  const reasonOnly = buildSearchRefinement(names, ["too_long", "too_long", "too_generic"], []);
  assert.deepEqual(reasonOnly?.reasons, ["too_generic", "too_long"]);
  assert.equal(reasonOnly?.previousNames.length, 50);
  assert.deepEqual(reasonOnly?.likedNames, []);
  assert.deepEqual(parseSearchRefinement(reasonOnly), reasonOnly, "UI and server share the same generated-name contract");
  const likesOnly = buildSearchRefinement(names, [], ["NOT-IN-RESULTS.com", "EXAMPLE0.COM", ...names.slice(0, 8), names[59]]);
  assert.deepEqual(likesOnly?.likedNames, names.slice(0, 5));
  assert.deepEqual(likesOnly?.reasons, []);
  assert.equal(buildSearchRefinement([], ["wrong_tone"], []), undefined);
  assert.equal(buildSearchRefinement(names, [], []), undefined);
  assert.equal(buildSearchRefinement(names, [], ["outside.com"]), undefined);
  assert.equal(buildSearchRefinement(names, ["cheaper" as RefinementReason], []), undefined);
});

test("all five languages preserve limits, interpolation and non-guaranteed naming provenance", () => {
  const english = searchRefinementCopy.en;
  const tokens = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
  for (const language of languages) {
    const copy = searchRefinementCopy[language];
    assert.deepEqual(Object.keys(copy), Object.keys(english));
    assert.deepEqual(Object.keys(copy.reasons), REFINEMENT_REASONS);
    for (const key of Object.keys(english) as (keyof typeof english)[]) {
      if (key === "reasons") continue;
      assert.ok(copy[key].trim());
      assert.deepEqual(tokens(copy[key]), tokens(english[key]));
    }
    assert.ok(copy.namesHint.includes("5"));
    assert.ok(copy.selectedLimit.includes("5"));
    assert.notEqual(copy.modeLocal, copy.modeAi);
    assert.notEqual(copy.modeLocalNote, copy.modeAiNote);
    assert.notEqual(copy.modeAiUnavailableNote, copy.modeLocalNote);
    assert.notEqual(copy.modeAiUnavailableNote, copy.modeAiNote);
    const fallbackEvidence = { en: ["AI could not", "local rules"], sv: ["AI kunde inte", "lokala regler"],
      es: ["IA no pudo", "reglas locales"], fr: ["L’IA n’a pas", "règles locales"], zh: ["AI 未能", "本地规则"] };
    for (const phrase of fallbackEvidence[language]) assert.ok(copy.modeAiUnavailableNote.includes(phrase));
    assert.doesNotMatch(copy.modeAiUnavailableNote, /50|unlimited|guarantee|premium/iu);
    assert.doesNotMatch(refinementText(copy.shown, { shown: 10, total: 50 }), /\{/);
  }
  assert.match(english.modeLocalNote, /may not be interpreted precisely/);
  assert.match(english.requestNote, /limits still apply/);
  assert.match(english.noGuarantee, /does not guarantee/);
});

test("generation notices distinguish quota, busy and unavailable without claiming AI or fixed allowances", () => {
  for (const language of languages) {
    const copy = searchRefinementCopy[language];
    const reasonNotes = {
      ai_daily_limit: copy.modeAiDailyLimitNote,
      ai_busy: copy.modeAiBusyNote,
      ai_unavailable: copy.modeAiUnavailableNote,
    } as const;
    assert.equal(new Set(Object.values(reasonNotes)).size, 3);
    for (const [reason, expected] of Object.entries(reasonNotes)) {
      assert.equal(getSearchGenerationNote(language, { source: "rules", refinementApplied: false,
        fallbackReason: reason as keyof typeof reasonNotes }), expected);
      assert.notEqual(expected, copy.modeAiNote);
      assert.doesNotMatch(expected.replace("00:00 UTC", ""), /\b(?:3|20)\b/u);
    }
    assert.match(copy.modeAiDailyLimitNote, /00:00 UTC/u);
    assert.doesNotMatch(copy.modeAiBusyNote, /00:00 UTC/u);
    for (const fallbackReason of [undefined, "ai_off", "no_context"] as const) {
      assert.equal(getSearchGenerationNote(language, { source: "rules", refinementApplied: false, fallbackReason }), copy.modeLocalNote);
    }
    assert.equal(getSearchGenerationNote(language, { source: "ai", refinementApplied: true }), copy.modeAiNote);
  }
  assert.match(searchRefinementCopy.en.modeAiDailyLimitNote, /still use these rule-based suggestions/u);
  assert.match(searchRefinementCopy.en.modeAiBusyNote, /Try again shortly/u);
});

test("feedback is explicit, accessible, retryable and never starts network work on selection", async t => {
  const vite = await createServer({
    configFile: false, appType: "custom",
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    resolve: { alias: { "@": path.resolve("src") } },
    optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" },
  });
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests++; throw new Error("The refinement component cannot send requests itself"); };
  let renderer: ReactTestRenderer | undefined;
  try {
    const { default: SearchRefinement } = await vite.ssrLoadModule("/src/components/SearchRefinement.tsx");
    const mount = async (props: Record<string, unknown>) => {
      if (renderer) await act(async () => renderer!.unmount());
      await act(async () => { renderer = create(h(SearchRefinement, { language: "en", previousNames: names, candidateNames: names.slice(0, 10), onRefine: () => {}, ...props })); });
    };
    const button = (label: string) => renderer!.root.findAllByType("button").find(node => text(node) === label)!;

    for (const language of languages) {
      await t.test(`${language}: native controls, collapsed optional names, explicit submit`, async () => {
        let calls = 0;
        await mount({ language, onRefine: () => { calls++; } });
        const copy = searchRefinementCopy[language];
        const root = renderer!.root;
        assert.equal(root.findByType("h3").children.join(""), copy.title);
        assert.equal(root.findByType("details").props.open, undefined);
        assert.match(root.findByType("summary").props.className, /min-h-11/);
        for (const node of root.findAllByType("button")) {
          assert.equal(node.props.type, "button");
          assert.match(node.props.className, /min-h-11/);
          assert.match(node.props.className, /min-w-11/);
          assert.ok(text(node).length > 1);
        }
        assert.equal(button(copy.submit).props.disabled, true);
        await act(async () => button(copy.reasons.too_generic).props.onClick());
        assert.equal(button(copy.reasons.too_generic).props["aria-pressed"], true);
        assert.equal(button(copy.submit).props.disabled, false);
        await act(async () => button(names[0]).props.onClick());
        assert.equal(calls, 0, "selecting feedback is not a search or an AI request");
        assert.equal(requests, 0);
        await act(async () => button(copy.submit).props.onClick());
        assert.equal(calls, 1);
      });
    }

    await t.test("only five liked names; selected names remain removable", async () => {
      let payload: SearchRefinementPayload | undefined;
      await mount({ onRefine: (value: SearchRefinementPayload) => { payload = value; } });
      for (const name of names.slice(0, 5)) await act(async () => button(name).props.onClick());
      assert.equal(button(names[5]).props.disabled, true);
      assert.equal(button(names[0]).props.disabled, false);
      assert.match(text(renderer!.root.findByProps({ role: "status" })), /5 selected/);
      await act(async () => button(names[0]).props.onClick());
      assert.equal(button(names[5]).props.disabled, false);
      await act(async () => button(names[5]).props.onClick());
      await act(async () => button(searchRefinementCopy.en.submit).props.onClick());
      assert.deepEqual(payload?.likedNames, names.slice(1, 6));
      assert.deepEqual(payload?.reasons, []);
      await act(async () => button(searchRefinementCopy.en.clear).props.onClick());
      assert.equal(button(searchRefinementCopy.en.submit).props.disabled, true);
    });

    await t.test("double submits are suppressed before React renders busy state", async () => {
      let calls = 0;
      let resolve: () => void = () => {};
      const promise = new Promise<void>(done => { resolve = done; });
      await mount({ onRefine: () => { calls++; return promise; } });
      await act(async () => button(searchRefinementCopy.en.reasons.too_long).props.onClick());
      const submit = button(searchRefinementCopy.en.submit).props.onClick;
      await act(async () => { submit(); submit(); });
      assert.equal(calls, 1);
      assert.equal(renderer!.root.findByType("section").props["aria-busy"], true);
      assert.equal(button(searchRefinementCopy.en.submitting).props.disabled, true);
      await act(async () => resolve());
      assert.equal(renderer!.root.findByType("section").props["aria-busy"], false);
    });

    await t.test("failed requests retain feedback and hide raw errors; retry is explicit", async () => {
      let attempts = 0;
      await mount({ onRefine: async () => { attempts++; if (attempts === 1) throw new Error("PRIVATE_BACKEND_DETAIL"); } });
      await act(async () => button(searchRefinementCopy.en.reasons.hard_to_spell).props.onClick());
      await act(async () => button(names[1]).props.onClick());
      await act(async () => button(searchRefinementCopy.en.submit).props.onClick());
      assert.equal(text(renderer!.root.findByProps({ role: "alert" })), searchRefinementCopy.en.failed);
      assert.doesNotMatch(text(renderer!.root), /PRIVATE_BACKEND_DETAIL/);
      assert.equal(button(names[1]).props["aria-pressed"], true);
      assert.equal(button(searchRefinementCopy.en.reasons.hard_to_spell).props["aria-pressed"], true);
      assert.equal(attempts, 1);
      await act(async () => button(searchRefinementCopy.en.submit).props.onClick());
      assert.equal(attempts, 2);
      assert.equal(renderer!.root.findAllByProps({ role: "alert" }).length, 0);
    });

    await t.test("caller access or consent boundaries disable work; empty history renders nothing", async () => {
      let calls = 0;
      await mount({ disabled: true, unavailableReason: "Access boundary fixture", onRefine: () => { calls++; } });
      assert.ok(text(renderer!.root).includes("Access boundary fixture"));
      for (const node of renderer!.root.findAllByType("button")) assert.equal(node.props.disabled, true);
      await act(async () => button(searchRefinementCopy.en.reasons.wrong_tone).props.onClick());
      await act(async () => button(searchRefinementCopy.en.submit).props.onClick());
      assert.equal(calls, 0);
      await mount({ previousNames: [] });
      assert.equal(renderer!.toJSON(), null);
    });

    await t.test("a keyed new result set resets choices instead of leaking prior feedback", async () => {
      await mount({ key: "first" });
      await act(async () => button(names[2]).props.onClick());
      await act(async () => {
        renderer!.update(h(SearchRefinement, { key: "second", language: "en", previousNames: ["new.test"], candidateNames: ["new.test"], onRefine: () => {} }));
      });
      assert.equal(button("new.test").props["aria-pressed"], false);
      assert.equal(button(searchRefinementCopy.en.submit).props.disabled, true);
      assert.doesNotMatch(text(renderer!.root), /example2\.com/);
    });
    assert.equal(requests, 0);
  } finally {
    if (renderer) await act(async () => renderer!.unmount());
    await vite.close();
    globalThis.fetch = originalFetch;
  }
});
