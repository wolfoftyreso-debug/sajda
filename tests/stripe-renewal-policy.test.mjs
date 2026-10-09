import assert from "node:assert/strict";
import test from "node:test";
import { renewalDatabaseTarget, RENEWAL_DATABASE_TARGETS, renewalNavigationFence } from "../scripts/stripe-renewal-policy.mjs";
import { MIGRATION_PROJECT } from "../scripts/migrate-neon.mjs";

function fixture() {
  const manifest = environment => ({ version: 1, environment, vercelProjectId: MIGRATION_PROJECT.projectId, vercelOrgId: MIGRATION_PROJECT.orgId,
    neonProjectId: RENEWAL_DATABASE_TARGETS[environment].neonProjectId, directHostname: RENEWAL_DATABASE_TARGETS[environment].directHostname,
    databaseName: RENEWAL_DATABASE_TARGETS.databaseName, role: RENEWAL_DATABASE_TARGETS.role,
    productionHostname: RENEWAL_DATABASE_TARGETS.production.directHostname, productionDatabaseName: RENEWAL_DATABASE_TARGETS.databaseName });
  const environment = target => ({ VERCEL_ENV: target.environment, NEON_PROJECT_ID: target.neonProjectId,
    ...(target.environment === "production" ? { SAJDA_PRODUCTION_NEON_PROJECT: target.neonProjectId } : {}),
    DATABASE_URL_UNPOOLED: `postgresql://${target.role}:synthetic-fixture-password@${target.directHostname}/${target.databaseName}?sslmode=require`,
    DATABASE_URL: `postgresql://${target.role}:synthetic-fixture-password@${target.directHostname.replace(".", "-pooler.")}/${target.databaseName}?sslmode=require` });
  const previewManifest = manifest("preview"), productionManifest = manifest("production"), preview = environment(previewManifest), production = environment(productionManifest);
  return { previewManifest, productionManifest, preview, production, freshPreview: structuredClone(preview), linkedProject: { ...MIGRATION_PROJECT } };
}

test("renewal target requires the exact reviewed Preview/Production pair and fresh injected Preview agreement", () => {
  const f = fixture(), target = renewalDatabaseTarget(f);
  assert.equal(target.database.hostname, f.previewManifest.directHostname.replace(".", "-pooler."));
  assert.equal(target.database.searchParams.get("sslmode"), "verify-full");
  assert.match(target.fingerprint, /^[a-f0-9]{64}$/u);
  assert.equal(renewalDatabaseTarget({ ...f, expectedFingerprint: target.fingerprint }).fingerprint, target.fingerprint);
  const reordered = Object.fromEntries(Object.entries(f.previewManifest).reverse());
  assert.equal(renewalDatabaseTarget({ ...f, previewManifest: reordered, expectedFingerprint: target.fingerprint }).fingerprint, target.fingerprint);
});

test("all foreign navigation stays aborted; only exact blocked return and non-top-level known Stripe embeds are benign", () => {
  const token = "synthetic-secret-capability";
  for (const origin of ["https://js.stripe.com", "https://r.stripe.com", "https://m.stripe.network"]) {
    const frame = renewalNavigationFence(`${origin}/${token}?secret=${token}`, false);
    assert.equal(frame.abort, true); assert.equal(frame.unexpected, false); assert.equal(frame.category, "known_stripe_embed");
    assert.equal(renewalNavigationFence(`${origin}/${token}`, true).unexpected, true);
    assert.equal(JSON.stringify(frame).includes(token), false);
  }
  const stopped = renewalNavigationFence("https://sajda.example.test/plus?billing=return", true);
  assert.equal(stopped.abort, true); assert.equal(stopped.unexpected, false); assert.equal(stopped.expectedSafeReturn, true);
  assert.equal(renewalNavigationFence("https://sajda.example.test/plus?billing=return", false).unexpected, true);
  for (const url of ["https://sajda.example.test/plus?billing=other", "https://sajda.example.test/plus?billing=return#secret",
    "https://js.stripe.com.attacker.test/x", "http://js.stripe.com/x", "https://user:password@js.stripe.com/x", "not-a-url", `https://unknown.test/${token}?secret=${token}`]) {
    const denied = renewalNavigationFence(url, false);
    assert.equal(denied.abort, true); assert.equal(denied.unexpected, true);
    assert.equal(JSON.stringify(denied).includes(token), false); assert.equal(JSON.stringify(denied).includes("password"), false);
  }
  assert.equal(renewalNavigationFence(`https://billing.stripe.com/p/session/${token}`, true).abort, false);
  assert.equal(renewalNavigationFence("https://js.stripe.com/x", undefined).unexpected, true);
});

test("swapped, stale, missing, pooled-production and wrong-owner configurations are denied without I/O or secret errors", () => {
  const cases = [
    f => { [f.preview, f.production] = [f.production, f.preview]; },
    f => { [f.previewManifest, f.productionManifest] = [f.productionManifest, f.previewManifest]; },
    f => { f.linkedProject.projectId = "prj_other"; },
    f => { f.linkedProject.orgId = "team_other"; },
    f => { f.preview.NEON_PROJECT_ID = "stale-project"; },
    f => { f.production.NEON_PROJECT_ID = "stale-project"; },
    f => { f.freshPreview.NEON_PROJECT_ID = "stale-project"; },
    f => { delete f.preview.VERCEL_ENV; },
    f => { delete f.production.VERCEL_ENV; },
    f => { delete f.freshPreview.VERCEL_ENV; },
    f => { f.preview.VERCEL_PROJECT_ID = "prj_other"; },
    f => { f.production.VERCEL_ORG_ID = "team_other"; },
    f => { f.freshPreview.VERCEL_ENV = "production"; },
    f => { f.production.SAJDA_PRODUCTION_NEON_PROJECT = "stale-project"; },
    f => { f.preview.DATABASE_URL = f.production.DATABASE_URL; f.preview.DATABASE_URL_UNPOOLED = f.production.DATABASE_URL_UNPOOLED; },
    f => { f.previewManifest.directHostname = f.productionManifest.directHostname; },
    f => { f.previewManifest.productionHostname = f.previewManifest.directHostname; },
    f => { f.productionManifest.role = "wrong_owner"; },
    f => { f.preview.DATABASE_URL = f.preview.DATABASE_URL.replace("neondb_owner:", "other_role:"); },
    f => { f.preview.DATABASE_URL_UNPOOLED = f.preview.DATABASE_URL_UNPOOLED.replace("/neondb?", "/wrong_db?"); },
    f => { f.freshPreview.DATABASE_URL_UNPOOLED = f.freshPreview.DATABASE_URL_UNPOOLED.replace("synthetic-fixture-password", "different-fixture-password"); f.freshPreview.DATABASE_URL = f.freshPreview.DATABASE_URL.replace("synthetic-fixture-password", "different-fixture-password"); },
    f => { f.preview.DATABASE_URL = "[SENSITIVE]"; },
    f => { f.production.DATABASE_URL_UNPOOLED = "[SENSITIVE]"; },
    f => { f.preview.DATABASE_URL += "&options=unsafe"; },
    f => { f.preview.DATABASE_URL_UNPOOLED = f.preview.DATABASE_URL; },
    f => { f.expectedFingerprint = "0".repeat(64); },
  ];
  for (const mutate of cases) {
    const f = fixture(); mutate(f);
    assert.throws(() => renewalDatabaseTarget(f), error => error instanceof Error && error.message === "renewal_database_target_mismatch");
  }
});
