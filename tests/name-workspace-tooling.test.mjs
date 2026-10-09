import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { workspaceSearchAllowed, workspaceRegistryEvidence } from "../scripts/name-workspace-policy.mjs";

const label = "sajdaqa123456abcdef";
const search = () => ({ tlds: ["com", "ai"], count: 2, theme: label, locale: "en", advanced: false,
  domains: [`${label}.com`, `${label}.ai`], swipe: false, creativeMode: "medium" });

test("workspace registry proof requires the exact pair and a fresh authoritative observation, not the envelope date", () => {
  const now = Date.parse("2026-10-09T01:00:00Z");
  const row = tld => ({ domain: `${label}.${tld}`, tld, status: "available", authoritative: true,
    checkMethod: "rdap", source: tld === "com" ? "verisign-rdap" : "identity-digital-rdap", checkedAt: new Date(now - 30_000).toISOString() });
  const payload = () => ({ results: [row("com"), row("ai")], checkedAt: new Date(now).toISOString() });
  assert.equal(workspaceRegistryEvidence(payload(), label, now).length, 2);
  for (const checkedAt of [undefined, "not a timestamp", new Date(now + 1).toISOString(), new Date(now - 300_001).toISOString()]) {
    const value = payload(); value.results.forEach(result => { result.checkedAt = checkedAt; });
    assert.equal(workspaceRegistryEvidence(value, label, now), null);
  }
  for (const override of [{ domain: "unrelated.com" }, { tld: "net" }, { checkMethod: "none" },
    { source: "invented-registry" }, { status: "unknown" }]) {
    const value = payload(); Object.assign(value.results[0], override);
    assert.equal(workspaceRegistryEvidence(value, label, now), null);
  }
  assert.equal(workspaceRegistryEvidence({ results: [row("com"), row("com")] }, label, now), null);
  assert.equal(workspaceRegistryEvidence({ results: [row("com")] }, label, now), null);
  const partial = payload(); Object.assign(partial.results[1], { status: "unknown", authoritative: false, checkMethod: "none" });
  const evidence = workspaceRegistryEvidence(partial, label, now);
  assert.equal(evidence.length, 2); assert.equal(evidence[1].freshAuthoritative, false);
  assert.equal(workspaceRegistryEvidence({}, label, now), null);
});

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
  const cleanup = readFileSync(new URL("../scripts/name-workspace-cleanup.mjs", import.meta.url), "utf8");
  assert.match(source, /SAJDA_NAME_WORKSPACE_PREVIEW_TEST/u);
  assert.match(source, /authLifecycleConfiguration/u);
  assert.match(source, /reviewedDatabaseTarget/u);
  assert.match(source, /await reconcileTarget\(\)/u);
  assert.match(source, /target\.origin !== protectedOrigin/u);
  assert.match(source, /workspaceSearchAllowed/u);
  assert.match(source, /maxRedirects: 0, maxRetries: 0/u);
  assert.doesNotMatch(source, /--header|--data-binary|\.unroute\(|unrouteAll|\.screenshot\(|tracing\./u);
  assert.match(source, /WHERE email=ANY\(\$1::text\[\]\)/u);
  assert.match(source, /await cleanupNameWorkspaceFixtures\(pool, \{ runId, users, testIp \}\)/u);
  assert.match(cleanup, /WHERE id=\$1 AND email=\$2 RETURNING id/u);
  assert.match(cleanup, /scope='name-projects' AND subject_hash=\$1/u);
  assert.equal((source.match(/event: "name_workspace_preview_failed", runId/gu) ?? []).length, 3);
  assert.match(source, /routeMocks: false/u);
});
