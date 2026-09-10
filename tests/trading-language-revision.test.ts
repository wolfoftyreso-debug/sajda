import assert from "node:assert/strict";
import test from "node:test";
import { getLostDomainsCopy } from "../src/i18n/lostDomainsCopy";
import { tradingLocale, tradingPhrases, tradingText, tradingRunCapacity, tradingOmittedRows, tradingShowMore } from "../src/i18n/tradingEvidenceCopy";

function leafPaths(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) return value.flatMap((item, index) => leafPaths(item, `${prefix}[${index}]`));
  if (value && typeof value === "object") return Object.entries(value).flatMap(([key, item]) => leafPaths(item, `${prefix}.${key}`));
  assert.equal(typeof value, "string", `Expected text at ${prefix}`);
  assert.ok((value as string).trim(), `Empty text at ${prefix}`);
  return [prefix];
}

test("Trading has complete five-language copy using English as the canonical shape and fallback", () => {
  const english = getLostDomainsCopy("en"), expected = leafPaths(english).sort();
  for (const language of ["en", "sv", "es", "fr", "zh"] as const) {
    const copy = getLostDomainsCopy(language);
    assert.equal(copy.locale, language);
    assert.deepEqual(leafPaths(copy).sort(), expected);
    for (const number of ["24", "600", "30", "3", "2", "72"]) assert.ok(copy.limits.includes(number));
    for (const number of ["20", "2", "12"]) assert.ok(copy.deepSchedule.includes(number));
    if (language !== "en") assert.notEqual(copy.reviewWarning, english.reviewWarning);
    assert.match(copy.lockedBody, /Trading/);
  }
  assert.equal(getLostDomainsCopy("de"), english);
  assert.equal(getLostDomainsCopy(""), english);
  assert.equal(tradingLocale.en, "en-US");
});

test("Every Trading evidence phrase includes four explicit translations and a canonical English string", () => {
  assert.ok(Object.keys(tradingPhrases).length > 150);
  for (const english of Object.keys(tradingPhrases) as (keyof typeof tradingPhrases)[]) {
    assert.equal(tradingText("en", english), english);
    assert.equal(tradingText("de", english), english);
    for (const [index, language] of ["sv", "es", "fr", "zh"].entries()) {
      const translated = tradingPhrases[english][index];
      assert.ok(translated.trim(), `${language}: ${english}`);
      assert.equal(tradingText(language, english), translated);
      if (!["DNS", "Status", "Extension", "Taxes"].includes(english)) assert.notEqual(translated, english, `${language}: untranslated phrase ${english}`);
    }
  }
});

test("Localized variable messages retain only the actual run counts and report subset disclosure", () => {
  for (const language of ["en", "sv", "es", "fr", "zh"]) {
    assert.match(tradingRunCapacity(language, 17, 351, 3), /17/);
    assert.match(tradingRunCapacity(language, 17, 351, 3), /351/);
    assert.match(tradingRunCapacity(language, 17, 351, 3), /30/);
    assert.match(tradingOmittedRows(language, 19), /19/);
    assert.match(tradingOmittedRows(language, 19), /CSV/);
    assert.match(tradingShowMore(language, 23), /23/);
  }
});
