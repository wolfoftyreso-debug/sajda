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
  RESEND_API_KEY: "re_fixtureNotARealKey", SAJDA_EMAIL_FROM: "Sajda <noreply@mail.sajda.com>",
  GOOGLE_CLIENT_ID: "google-fixture-id", GOOGLE_CLIENT_SECRET: "google-fixture-secret",
  GITHUB_CLIENT_ID: "github-fixture-id", GITHUB_CLIENT_SECRET: "github-fixture-secret",
  TWITTER_CLIENT_ID: "twitter-fixture-id", TWITTER_CLIENT_SECRET: "twitter-fixture-secret",
  APPLE_CLIENT_ID: "apple-fixture-id", APPLE_CLIENT_SECRET: "apple.fixture.secret",
});

test("production builds reject missing account/email dependencies without exposing values", () => {
  const issues = productionConfigurationIssues({ VERCEL_ENV: "production" });
  assert.ok(issues.includes("production_email_key_required"));
  assert.ok(issues.includes("production_auth_secret_required"));
  assert.ok(issues.includes("production_database_identity_not_confirmed"));
  assert.ok(issues.includes("production_google_oauth_required"));
  assert.ok(issues.includes("production_apple_oauth_required"));
  assert.throws(() => createVercelBuildEnvironment({ VERCEL_ENV: "production" }), /Production release blocked/u);
  assert.doesNotThrow(() => createVercelBuildEnvironment({ VERCEL_ENV: "preview" }));
  const sensitive = { ...ready(), DATABASE_URL: "private-do-not-log", BETTER_AUTH_SECRET: "private" };
  assert.throws(() => assertProductionConfiguration(sensitive), error => !error.message.includes("private"));
});

test("production requires every promised social sign-in provider and rejects partial pairs", () => {
  for (const [provider, key] of [["google", "GOOGLE_CLIENT_SECRET"], ["github", "GITHUB_CLIENT_ID"],
    ["twitter", "TWITTER_CLIENT_SECRET"], ["apple", "APPLE_CLIENT_ID"]]) {
    assert.ok(productionConfigurationIssues({ ...ready(), [key]: "" }).includes(`production_${provider}_oauth_required`));
  }
  assert.deepEqual(productionConfigurationIssues(ready()), []);
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

test("production email is bound to the operator-selected Sajda sending domain", () => {
  for (const sender of ["Sajda <noreply@hypbit.com>", "hello@sajda.dev", "Sajda <noreply@sub.mail.sajda.com>"]) {
    assert.ok(productionConfigurationIssues({ ...ready(), SAJDA_EMAIL_FROM: sender })
      .includes("production_email_sender_domain_required"), sender);
  }
  assert.deepEqual(productionConfigurationIssues({ ...ready(), SAJDA_EMAIL_FROM: "support@MAIL.SAJDA.COM" }), []);
});

test("an enabled IndexNow key requires its own server-only submit credential", () => {
  const enabled = { ...ready(), SAJDA_INDEXNOW_KEY: "abc123def456" };
  assert.ok(productionConfigurationIssues(enabled).includes("production_indexnow_submit_secret_required"));
  const accepted = { ...enabled, SAJDA_INDEXNOW_SUBMIT_SECRET: "indexnow-submit-only-credential-123456" };
  assert.deepEqual(productionConfigurationIssues(accepted), []);
  for (const secret of ["short", accepted.BETTER_AUTH_SECRET, "x".repeat(32) + "\n"]) {
    assert.ok(productionConfigurationIssues({ ...accepted, SAJDA_INDEXNOW_SUBMIT_SECRET: secret })
      .includes("production_indexnow_submit_secret_required"));
  }
});

test("automated crawling and real checkout require their independent configuration", () => {
  assert.ok(productionConfigurationIssues({ ...ready(), SAJDA_LOST_DOMAINS_CRON_ENABLED: "true" }).includes("production_cron_requires_engine"));
  assert.ok(productionConfigurationIssues({ ...ready(), STRIPE_CHECKOUT_ENABLED: "true", STRIPE_SECRET_KEY: "sk_test_fixture" }).includes("production_billing_requires_live_configuration"));
  assert.deepEqual(productionConfigurationIssues({ ...ready(), STRIPE_CHECKOUT_ENABLED: "false" }), []);
  assert.ok(productionConfigurationIssues({ ...ready(), STRIPE_BASIC_CHECKOUT_ENABLED: "true" }).includes("production_billing_requires_live_configuration"));
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

test("brand checks and monitors cannot be enabled without their report/check dependencies", () => {
  assert.ok(productionConfigurationIssues({ ...ready(), SAJDA_BRAND_CHECKS_ENABLED: "true" })
    .includes("production_brand_checks_require_reports"));
  for (const change of [{}, { SAJDA_BRAND_REPORTS_ENABLED: "true" }, { SAJDA_BRAND_CHECKS_ENABLED: "true" }]) {
    assert.ok(productionConfigurationIssues({ ...ready(), ...change, SAJDA_BRAND_MONITORS_ENABLED: "true" })
      .includes("production_brand_monitors_require_reports_and_checks"));
  }
  assert.deepEqual(productionConfigurationIssues({ ...ready(), SAJDA_BRAND_REPORTS_ENABLED: "true",
    SAJDA_BRAND_CHECKS_ENABLED: "true", SAJDA_BRAND_MONITORS_ENABLED: "true" }), []);
  // A paused scheduler needs no scheduler credential and does not imply automation.
  assert.deepEqual(productionConfigurationIssues({ ...ready(), SAJDA_BRAND_MONITORS_CRON_ENABLED: "false" }), []);
});

test("automated brand monitoring requires one bounded schedule and an independent scheduler credential", () => {
  const env = { ...ready(), SAJDA_BRAND_REPORTS_ENABLED: "true", SAJDA_BRAND_CHECKS_ENABLED: "true",
    SAJDA_BRAND_MONITORS_ENABLED: "true", SAJDA_BRAND_MONITORS_CRON_ENABLED: "true",
    CRON_SECRET: "scheduler-only-test-secret-".repeat(2) };
  const config = { crons: [{ path: "/api/cron/brand-monitors", schedule: "*/5 * * * *" }],
    functions: { "api/cron/brand-monitors.ts": { maxDuration: 180 } } };
  assert.deepEqual(productionConfigurationIssues(env, config), []);
  assert.doesNotThrow(() => createVercelBuildEnvironment(env, config));
  assert.throws(() => createVercelBuildEnvironment(env), /production_brand_monitor_worker_schedule_required/u);
  for (const flag of ["SAJDA_BRAND_REPORTS_ENABLED", "SAJDA_BRAND_CHECKS_ENABLED", "SAJDA_BRAND_MONITORS_ENABLED"]) {
    assert.ok(productionConfigurationIssues({ ...env, [flag]: "false" }, config)
      .includes("production_brand_monitor_cron_requires_monitors"));
  }
  for (const crons of [undefined, [], [{ path: "/api/cron/brand-monitors", schedule: "0 0 * * *" }],
    [{ path: "/api/cron/lost-domains", schedule: "*/5 * * * *" }], [...config.crons, ...config.crons],
    [{ path: "/api/cron/brand-monitors", schedule: "*/10 * * * *" }]]) {
    assert.ok(productionConfigurationIssues(env, { ...config, crons })
      .includes("production_brand_monitor_worker_schedule_required"));
  }
  for (const duration of [undefined, 20, 60, 300]) {
    assert.ok(productionConfigurationIssues(env, { ...config, functions: {
      "api/cron/brand-monitors.ts": { maxDuration: duration } } })
      .includes("production_brand_monitor_worker_duration_invalid"));
  }
  for (const secret of [undefined, " ".repeat(64), "x".repeat(257), "x".repeat(32) + "\n", env.BETTER_AUTH_SECRET]) {
    assert.ok(productionConfigurationIssues({ ...env, CRON_SECRET: secret }, config)
      .includes("production_brand_monitor_cron_secret_required"));
  }
  assert.throws(() => assertProductionConfiguration({ ...env, CRON_SECRET: "private-do-not-print" }, config),
    error => !error.message.includes("private-do-not-print"));
});

test("monitor and Trading workers validate independently in the actual Vercel schedule", () => {
  const env = { ...ready(), SAJDA_BRAND_REPORTS_ENABLED: "true", SAJDA_BRAND_CHECKS_ENABLED: "true",
    SAJDA_BRAND_MONITORS_ENABLED: "true", SAJDA_BRAND_MONITORS_CRON_ENABLED: "true",
    SAJDA_LOST_DOMAINS_ENABLED: "true", SAJDA_LOST_DOMAINS_CRON_ENABLED: "true",
    CRON_SECRET: "scheduler-only-test-secret-".repeat(2) };
  const config = { crons: [{ path: "/api/cron/brand-monitors", schedule: "*/5 * * * *" },
    { path: "/api/cron/lost-domains", schedule: "*/5 * * * *" }], functions: {
    "api/cron/brand-monitors.ts": { maxDuration: 180 }, "api/cron/lost-domains.ts": { maxDuration: 60 } } };
  assert.deepEqual(productionConfigurationIssues(env, config), []);
  const missingMonitor = productionConfigurationIssues(env, { ...config, crons: config.crons.slice(1) });
  assert.ok(missingMonitor.includes("production_brand_monitor_worker_schedule_required"));
  assert.ok(!missingMonitor.includes("production_trading_worker_schedule_required"));
  assert.deepEqual(productionConfigurationIssues({ ...env, VERCEL_ENV: "preview", CRON_SECRET: "" }), []);
});
