import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { workspaceSearchAllowed } from "../scripts/name-workspace-policy.mjs";

const label = "sajdaqa123456abcdef";
const search = () => ({ tlds: ["com", "ai"], count: 2, theme: label, locale: "en", advanced: false,
  domains: [`${label}.com`, `${label}.ai`], swipe: false, creativeMode: "medium" });

test("real workspace probe allows only two explicit two-domain checks, never generated or AI requests", () => {
  assert.equal(workspaceSearchAllowed(search(), label, 0), true);
  assert.equal(workspaceSearchAllowed(search(), label, 1), true);
  for (const count of [2, 3, -1, NaN]) assert.equal(workspaceSearchAllowed(search(), label, count), false);
  for (const override of [{ domains: undefined }, { domains: ["unrelated.com", `${label}.ai`] }, { count: 50 },
    { theme: "generate valuable names" }, { advanced: true }, { swipe: true }, { namePackages: true },
    { aiConsent: { granted: true } }, { tlds: ["com", "net"] }, { locale: "sv" }, { brief: "private brief" }]) {
    assert.equal(workspaceSearchAllowed({ ...search(), ...override }, label, 0), false, JSON.stringify(override));
  }
  for (const body of [null, [], "bad", {}]) assert.equal(workspaceSearchAllowed(body, label, 0), false);
});

test("workspace probe keeps credentials in memory, fresh exact Preview fences, no mocks and bounded cleanup", () => {
  const source = readFileSync(new URL("../scripts/check-name-workspace-preview.mjs", import.meta.url), "utf8");
  assert.match(source, /SAJDA_NAME_WORKSPACE_PREVIEW_TEST/u);
  assert.match(source, /authLifecycleConfiguration/u);
  assert.match(source, /reviewedDatabaseTarget/u);
  assert.match(source, /await reconcileTarget\(\)/u);
  assert.match(source, /target\.origin !== protectedOrigin/u);
  assert.match(source, /workspaceSearchAllowed/u);
  assert.match(source, /maxRedirects: 0, maxRetries: 0/u);
  assert.doesNotMatch(source, /--header|--data-binary|\.unroute\(|unrouteAll|\.screenshot\(|tracing\./u);
  assert.match(source, /WHERE email=ANY\(\$1::text\[\]\)/u);
  assert.match(source, /WHERE id=\$1 AND email=\$2 RETURNING id/u);
  assert.match(source, /scope='name-projects' AND subject_hash=\$1/u);
  assert.match(source, /routeMocks: false/u);
});
