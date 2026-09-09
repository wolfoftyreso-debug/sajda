import assert from "node:assert/strict";
import test from "node:test";
import { assertProductionConfiguration, productionConfigurationIssues } from "../scripts/release-configuration.mjs";
import { createVercelBuildEnvironment } from "../scripts/build-vercel.mjs";

const ready = () => ({
  VERCEL_ENV: "production", SAJDA_CANONICAL_ORIGIN: "https://sajda-eight.vercel.app",
  BETTER_AUTH_URL: "https://sajda-eight.vercel.app", BETTER_AUTH_SECRET: "test-only-secret-".repeat(3),
  NEON_PROJECT_ID: "test-production", SAJDA_PRODUCTION_NEON_PROJECT: "test-production",
  DATABASE_URL: "postgresql://user:fixture@ep-production-pooler.eu.neon.tech/app",
  DATABASE_URL_UNPOOLED: "postgresql://user:fixture@ep-production.eu.neon.tech/app",
  RESEND_API_KEY: "re_fixtureNotARealKey", SAJDA_EMAIL_FROM: "Sajda <hello@sajda.dev>",
});

test("production builds reject missing account/email dependencies without exposing values", () => {
  const issues = productionConfigurationIssues({ VERCEL_ENV: "production" });
  assert.ok(issues.includes("production_email_key_required"));
  assert.ok(issues.includes("production_auth_secret_required"));
  assert.ok(issues.includes("production_database_identity_not_confirmed"));
  assert.throws(() => createVercelBuildEnvironment({ VERCEL_ENV: "production" }), /Production release blocked/u);
  assert.doesNotThrow(() => createVercelBuildEnvironment({ VERCEL_ENV: "preview" }));
  const sensitive = { ...ready(), DATABASE_URL: "private-do-not-log", BETTER_AUTH_SECRET: "private" };
  assert.throws(() => assertProductionConfiguration(sensitive), error => !error.message.includes("private"));
});

test("production target, pooled connection and canonical cannot silently drift", () => {
  assert.deepEqual(productionConfigurationIssues(ready()), []);
  for (const change of [
    { NEON_PROJECT_ID: "preview" }, { DATABASE_URL_UNPOOLED: ready().DATABASE_URL },
    { DATABASE_URL: "postgresql://user:fixture@ep-preview-pooler.eu.neon.tech/app" },
    { BETTER_AUTH_URL: "https://preview.vercel.app" }, { SAJDA_CANONICAL_ORIGIN: "http://localhost" },
    { SAJDA_CANONICAL_ORIGIN: "" }, { SAJDA_EMAIL_FROM: "test@sajda.test" },
    { SAJDA_EMAIL_FROM: "Sajda <sender@host.dev>\r\nBcc: extra@host.dev" },
  ]) assert.ok(productionConfigurationIssues({ ...ready(), ...change }).length > 0, JSON.stringify(Object.keys(change)));
});

test("automated crawling and real checkout require their independent configuration", () => {
  assert.ok(productionConfigurationIssues({ ...ready(), SAJDA_LOST_DOMAINS_CRON_ENABLED: "true" }).includes("production_cron_requires_engine"));
  assert.ok(productionConfigurationIssues({ ...ready(), STRIPE_CHECKOUT_ENABLED: "true", STRIPE_SECRET_KEY: "sk_test_fixture" }).includes("production_billing_requires_live_configuration"));
  assert.deepEqual(productionConfigurationIssues({ ...ready(), STRIPE_CHECKOUT_ENABLED: "false" }), []);
});

test("an enabled Trading scheduler needs a real bounded Vercel schedule, not just environment flags", () => {
  const env = { ...ready(), SAJDA_LOST_DOMAINS_ENABLED: "true", SAJDA_LOST_DOMAINS_CRON_ENABLED: "true", CRON_SECRET: "scheduler-only-test-secret-".repeat(2) };
  const config = { crons: [{ path: "/api/cron/lost-domains", schedule: "* * * * *" }], functions: { "api/cron/lost-domains.ts": { maxDuration: 60 } } };
  assert.deepEqual(productionConfigurationIssues(env, config), []);
  assert.throws(() => createVercelBuildEnvironment(env), /production_trading_worker_schedule_required/u);
  assert.doesNotThrow(() => createVercelBuildEnvironment(env, config));
  for (const crons of [undefined, [], [{ path: "/api/cron/lost-domains", schedule: "0 0 * * *" }],
    [{ path: "/api/cron/another", schedule: "* * * * *" }], [...config.crons, ...config.crons],
    [{ path: "/api/cron/lost-domains", schedule: "*/10 * * * *" }]]) {
    assert.ok(productionConfigurationIssues(env, { ...config, crons }).includes("production_trading_worker_schedule_required"));
  }
  assert.ok(productionConfigurationIssues(env, { ...config, functions: {} }).includes("production_trading_worker_duration_invalid"));
  for (const secret of [" ".repeat(64), "x".repeat(257), "x".repeat(32) + "\n", env.BETTER_AUTH_SECRET]) {
    assert.ok(productionConfigurationIssues({ ...env, CRON_SECRET: secret }, config).includes("production_cron_secret_required"));
  }
});

test("exact price refresh cannot be advertised as enabled with missing or sandbox credentials", () => {
  const env = { ...ready(), SAJDA_LOST_DOMAINS_ENABLED: "true", SAJDA_LOST_DOMAINS_REGISTRAR_ENABLED: "true", PORKBUN_API_KEY: "pk1_" + "a".repeat(32), PORKBUN_SECRET_API_KEY: "sk1_" + "b".repeat(32) };
  assert.deepEqual(productionConfigurationIssues(env), []);
  for (const change of [{ PORKBUN_API_KEY: "" }, { PORKBUN_SECRET_API_KEY: "" },
    { PORKBUN_API_KEY: "pk1_sb_" + "a".repeat(32) }, { PORKBUN_SECRET_API_KEY: "sk1_sb_" + "b".repeat(32) }]) {
    assert.ok(productionConfigurationIssues({ ...env, ...change }).includes("production_registrar_credentials_required"));
  }
  assert.ok(productionConfigurationIssues({ ...env, SAJDA_LOST_DOMAINS_ENABLED: "false" }).includes("production_registrar_requires_engine"));
  assert.throws(() => assertProductionConfiguration({ ...env, PORKBUN_SECRET_API_KEY: "private-do-not-print" }), error => !error.message.includes("private-do-not-print"));
});
