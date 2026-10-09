import assert from "node:assert/strict";
import test from "node:test";
import { BRAND_NAME_LANGUAGES } from "../shared/name-languages";
import { projectNamingLanguage } from "../src/lib/projectNamingLanguage";
import { projectNamingLanguageCopy } from "../src/i18n/projectNamingLanguageCopy";

test("a single supported project language is retained, not inferred from interface locale", () => {
  for (const language of BRAND_NAME_LANGUAGES) assert.deepEqual(projectNamingLanguage([language]), {
    initialLanguage: language, requiresChoice: false, unsupported: false,
  });
});

test("legacy Chinese and multiple project languages require an explicit primary generation language", () => {
  assert.deepEqual(projectNamingLanguage(["zh"]), { initialLanguage: "en", requiresChoice: true, unsupported: true });
  assert.deepEqual(projectNamingLanguage(["fr", "de"]), { initialLanguage: "en", requiresChoice: true, unsupported: false });
  const preferences = ["zh", "en"] as const;
  assert.deepEqual(projectNamingLanguage(preferences), { initialLanguage: "en", requiresChoice: true, unsupported: true });
  assert.deepEqual(preferences, ["zh", "en"], "The saved requirements are not rewritten by the generation draft");
  assert.deepEqual(projectNamingLanguage(null), { initialLanguage: "en", requiresChoice: false, unsupported: false });
});

test("project-language handoff explanations cover every interface locale and keep their placeholders", () => {
  for (const locale of ["en", "sv", "es", "fr", "zh"] as const) {
    const copy = projectNamingLanguageCopy[locale];
    assert.deepEqual(Object.keys(copy), Object.keys(projectNamingLanguageCopy.en));
    assert.ok(Object.values(copy).every(value => value.length > 0));
    assert.match(copy.requested, /\{languages\}/u);
    assert.match(copy.selected, /\{language\}/u);
    if (locale !== "en") for (const key of Object.keys(copy) as Array<keyof typeof copy>) assert.notEqual(copy[key], projectNamingLanguageCopy.en[key]);
  }
});
