import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { AUTH_LIFECYCLE_PROJECT, authLifecycleConfiguration } from "../scripts/auth-lifecycle-policy.mjs";

const now = 1_800_000_000_000;
function configuration() {
  const claims = { project_id: AUTH_LIFECYCLE_PROJECT.projectId, owner_id: AUTH_LIFECYCLE_PROJECT.orgId, environment: "development", exp: now / 1000 + 3600 };
  return { preview: { DATABASE_URL: "postgresql://fixture:fixture@ep-preview-pooler.eu.neon.tech/preview?sslmode=require&options=discard" },
    production: { DATABASE_URL: "postgresql://fixture:fixture@ep-production.eu.neon.tech/production" },
    development: { VERCEL_OIDC_TOKEN: `synthetic.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.synthetic` },
    linkedProject: AUTH_LIFECYCLE_PROJECT, origin: "https://sajda-123456789-hypbit.vercel.app", expectedHost: "ep-preview-pooler.eu.neon.tech",
    expectedCommit: "a".repeat(40), actualCommit: "a".repeat(40), now };
}

test("auth lifecycle fences accept only the pinned project, exact Preview origin and distinct Neon identity", () => {
  const value = authLifecycleConfiguration(configuration());
  assert.equal(value.origin, "https://sajda-123456789-hypbit.vercel.app");
  const url = new URL(value.database); assert.equal(url.searchParams.get("sslmode"), "verify-full"); assert.equal(url.searchParams.has("options"), false);
  for (const linkedProject of [{ ...AUTH_LIFECYCLE_PROJECT, orgId: "other-team" }, { ...AUTH_LIFECYCLE_PROJECT, projectId: "other-project" }, undefined]) {
    assert.throws(() => authLifecycleConfiguration({ ...configuration(), linkedProject }), /wrong_project/u);
  }
  for (const origin of ["https://sajda-eight.vercel.app", "https://sajda-connector.vercel.app", "http://sajda-123456789-hypbit.vercel.app", "https://sajda-123456789-hypbit.vercel.app/path", "https://sajda-123456789-hypbit.vercel.app/?query=1", "https://sajda-123456789-hypbit.vercel.app/#fragment", "https://user:private@sajda-123456789-hypbit.vercel.app"]) {
    assert.throws(() => authLifecycleConfiguration({ ...configuration(), origin }), /invalid_preview_origin/u);
  }
  assert.throws(() => authLifecycleConfiguration({ ...configuration(), expectedHost: "ep-production.eu.neon.tech" }), /preview_database_mismatch/u);
});

test("pooler aliases of the same Production database, unknown credentials and stale source are rejected", () => {
  for (const DATABASE_URL of ["postgresql://fixture:fixture@ep-preview.eu.neon.tech/preview", "postgresql://fixture:fixture@ep-preview-pooler.eu.neon.tech/preview"]) {
    assert.throws(() => authLifecycleConfiguration({ ...configuration(), production: { DATABASE_URL } }), /production_database_forbidden/u);
  }
  for (const DATABASE_URL of ["postgresql://fixture@ep-preview-pooler.eu.neon.tech/preview", "postgresql://fixture:fixture@production.invalid/preview", "not-a-database"]) {
    assert.throws(() => authLifecycleConfiguration({ ...configuration(), preview: { DATABASE_URL } }));
  }
  for (const actualCommit of ["b".repeat(40), "a".repeat(7), undefined]) assert.throws(() => authLifecycleConfiguration({ ...configuration(), actualCommit }), /source_commit_mismatch/u);
});

test("development protection access must be fresh and belong to the exact linked Preview project", () => {
  for (const override of [{ environment: "production" }, { project_id: "other" }, { owner_id: "other" }, { exp: now / 1000 + 300 }, { exp: "never" }]) {
    const base = configuration(), claims = { project_id: AUTH_LIFECYCLE_PROJECT.projectId, owner_id: AUTH_LIFECYCLE_PROJECT.orgId, environment: "development", exp: now / 1000 + 3600, ...override };
    base.development.VERCEL_OIDC_TOKEN = `synthetic.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.synthetic`;
    assert.throws(() => authLifecycleConfiguration(base), /invalid_development_access/u);
  }
  assert.throws(() => authLifecycleConfiguration({ ...configuration(), development: {} }), /invalid_private_configuration/u);
});

test("auth verification tooling never sends passwords/cookies/tokens through CLI arguments and legacy unsafe runner cannot execute", () => {
  const read = file => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const legacy = read("scripts/check-account-runtime.ts");
  assert.match(legacy, /throw new Error/u); assert.doesNotMatch(legacy, /execFile|spawn|createAccountAuth|pool\.query/u);
  const probe = read("scripts/check-auth-lifecycle-preview.mjs");
  assert.match(probe, /promisify\(execFile\)\("git", \["rev-parse", "HEAD"\]/u);
  assert.doesNotMatch(probe, /execFile\)\([^)]*curl|--header|--data-binary|console\.[a-z]+\(.*(?:cookie|password|protectionToken)\b/u);
  assert.match(probe, /target\.origin !== protectedOrigin/u); assert.match(probe, /maxRedirects: 0, maxRetries: 0/u);
  assert.doesNotMatch(probe, /unrouteAll|\.unroute\(/u);
  assert.ok(probe.indexOf("closing = true;") < probe.indexOf("await browser?.close()"));
  assert.match(probe, /Promise\.allSettled\(\[\.\.\.activeRoutes\]\)/u);
  assert.match(probe, /20_000/u);
  assert.match(probe, /activeRoutesAfterClose: activeRoutes\.size/u);
  assert.match(probe, /inboxDelivery: false, providerEmailsSent: 0/u);
  assert.match(probe, /deployedSignup: false/u);
  assert.match(probe, /WHERE id=\$1 AND email=\$2 RETURNING id/u);
});

test("direct-deployment exclusion policy explicitly denies private Vercel artifacts and repository credentials", () => {
  const ignored = readFileSync(new URL("../.vercelignore", import.meta.url), "utf8");
  for (const pattern of [".vercel", ".git", ".env", ".env.*"]) {
    assert.ok(ignored.split(/\r?\n/u).includes(pattern), `${pattern} must be explicitly excluded`);
  }
  assert.doesNotMatch(ignored, /^\s*!/mu, "a later include must not re-enable private deployment files");
});
