import assert from "node:assert/strict";
import test from "node:test";
import { tradingPortalCopy } from "../src/i18n/tradingPortalCopy";

const languages = ["en", "sv", "es", "fr", "zh"] as const;

function strings(value: unknown, prefix = ""): Map<string, string> {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return new Map(Object.entries(value).flatMap(([key, item]) => [...strings(item, `${prefix}.${key}`)]));
  }
  assert.equal(typeof value, "string", `Non-string copy at ${prefix}`);
  assert.ok((value as string).trim().length > 0, `Empty copy at ${prefix}`);
  return new Map([[prefix, value as string]]);
}

test("Trading portal uses a complete English-source dictionary for all five languages", () => {
  const expected = [...strings(tradingPortalCopy.en).keys()].sort();
  assert.ok(expected.length > 100);
  assert.deepEqual(Object.keys(tradingPortalCopy).sort(), [...languages].sort());
  for (const language of languages) {
    const entries = strings(tradingPortalCopy[language]);
    assert.deepEqual([...entries.keys()].sort(), expected, language);
    for (const [key, value] of entries) {
      assert.equal(value, value.trim(), `${language}${key}: surrounding whitespace`);
      assert.doesNotMatch(value, /\{[a-zA-Z]\w*\}|<[^>]+>|\uFFFD/u, `${language}${key}: unresolved token, HTML or broken Unicode`);
    }
  }
});

test("analysis modes, evidence states and user outlooks have stable separate semantic keys", () => {
  for (const language of languages) {
    const copy = tradingPortalCopy[language];
    assert.deepEqual(Object.keys(copy.tabs), ["radar", "twin", "scenarios", "journal"]);
    assert.deepEqual(Object.keys(copy.modes), ["balanced", "brand", "acquisition", "risk"]);
    assert.deepEqual(Object.keys(copy.modeHelp), Object.keys(copy.modes));
    assert.deepEqual(Object.keys(copy.stanceLabels), ["bullish", "neutral", "bearish"]);
    assert.deepEqual(Object.keys(copy.stateLabels), ["registered", "registry_not_found", "unknown", "excluded", "stale"]);
    assert.equal(new Set([copy.observed, copy.assumed, copy.missing]).size, 3);
    assert.notEqual(copy.stateLabels.registry_not_found, copy.stateLabels.registered);
  }
  assert.equal(tradingPortalCopy.en.stateLabels.registry_not_found, "No registry record");
  assert.doesNotMatch(tradingPortalCopy.en.stateLabels.registry_not_found, /available|buy|free/iu);
});

test("scenario inputs state their units and match the holding-period and storage limits", () => {
  const moneyFields = ["acquisitionUsd", "annualRenewalUsd", "otherCostsUsd", "bearSaleUsd", "baseSaleUsd", "bullSaleUsd"] as const;
  for (const language of languages) {
    const copy = tradingPortalCopy[language];
    for (const field of moneyFields) assert.match(copy[field], /USD|美元/u, `${language}.${field}`);
    assert.match(copy.sellingFeePercent, /%/u);
    assert.match(copy.saleProbabilityPercent, /%/u);
    assert.match(copy.limitNotice, /100/u);
    assert.match(copy.renewalConvention, /12/u);
    assert.match(copy.renewalConvention, /24/u);
  }
});

test("analysis copy describes check coverage rather than a price sort and validation explains ordered scenarios", () => {
  const en = tradingPortalCopy.en;
  assert.equal(en.modes.acquisition, "Acquisition checks");
  assert.doesNotMatch(en.modeHelp.acquisition, /cost|price|cheap|value|return/iu);
  assert.doesNotMatch(en.modeHelp.balanced, /cost|price|cheap|value|return/iu);
  assert.match(en.modeHelp.acquisition, /availability evidence.*complete/u);
  assert.match(en.invalidInput, /selling fee below 100%/u);
  assert.match(en.invalidInput, /downside ≤ base ≤ upside/u);
  for (const language of languages) {
    const copy = tradingPortalCopy[language];
    assert.match(copy.freshSignals, /4/u);
    assert.match(copy.invalidInput, /100\s?%/u);
    assert.equal([...copy.invalidInput.matchAll(/≤/gu)].length, 2, `${language}: sale cases need an explicit ordering`);
  }
});

test("scenario outputs, coverage and evidence explain limitations instead of implying market predictions", () => {
  const en = tradingPortalCopy.en;
  assert.match(en.modeDisclaimer, /heuristics, not valuations or investment recommendations/u);
  assert.match(en.assumptionNotice, /your assumptions, not appraised values or market forecasts/u);
  assert.match(en.assumptionNotice, /may never sell/u);
  assert.match(en.cashflowNotice, /money spent, not the domain’s remaining value/u);
  assert.match(en.probabilityNotice, /cannot be calculated.*zero/u);
  assert.match(en.trendNote, /not a measure of market demand or price trends/u);
  assert.match(en.evidenceNotice, /does not establish.*available/u);
  for (const language of languages.filter(language => language !== "en")) {
    const copy = tradingPortalCopy[language];
    for (const field of ["modeDisclaimer", "assumptionNotice", "cashflowNotice", "probabilityNotice", "trendNote", "evidenceNotice", "renewalConvention"] as const) {
      assert.notEqual(copy[field], en[field], `${language}.${field}: missing explicit translation`);
    }
  }
});

test("persistence distinguishes confirmed saving, unsaved changes and conflict recovery", () => {
  for (const language of languages) {
    const copy = tradingPortalCopy[language];
    assert.equal(new Set([copy.loading, copy.saving, copy.saved, copy.unsaved, copy.saveError, copy.conflict]).size, 6);
    assert.notEqual(copy.retry, copy.reload);
    assert.match(copy.authRequired, /Sajda/u);
    assert.match(copy.accessRequired, /Trading/u);
  }
  assert.match(tradingPortalCopy.en.saveError, /could not confirm.*saved/u);
  assert.match(tradingPortalCopy.en.conflict, /another session.*latest version/u);
  assert.doesNotMatch(tradingPortalCopy.en.loadError, /saved|complete|success/iu);
});
