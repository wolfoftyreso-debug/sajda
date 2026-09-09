/** Configuration validation is a release prerequisite, not an E2E sign-off.
 * Return variable names / issue codes only. Never include supplied values.
 */
function httpsOrigin(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port
      || url.pathname !== "/" || url.search || url.hash
      || ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return null;
    return url.origin;
  } catch { return null; }
}

export function productionConfigurationIssues(env = process.env, deployment = {}) {
  if (env.VERCEL_ENV !== "production") return [];
  const issues = [];
  const canonical = httpsOrigin(env.SAJDA_CANONICAL_ORIGIN);
  if (!canonical) issues.push("production_canonical_origin_required");
  if (!canonical || httpsOrigin(env.BETTER_AUTH_URL) !== canonical) {
    issues.push("production_auth_origin_must_match_canonical");
  }
  if (!env.SAJDA_PRODUCTION_NEON_PROJECT?.trim()
    || env.NEON_PROJECT_ID !== env.SAJDA_PRODUCTION_NEON_PROJECT) {
    issues.push("production_database_identity_not_confirmed");
  }
  try {
    const pooled = new URL(env.DATABASE_URL);
    const direct = new URL(env.DATABASE_URL_UNPOOLED);
    if (!["postgres:", "postgresql:"].includes(pooled.protocol)
      || !["postgres:", "postgresql:"].includes(direct.protocol)
      || !pooled.hostname.endsWith(".neon.tech") || !direct.hostname.endsWith(".neon.tech")
      || !pooled.hostname.split(".")[0].endsWith("-pooler")
      || direct.hostname.split(".")[0].endsWith("-pooler")
      || pooled.hostname.replace("-pooler.", ".") !== direct.hostname
      || !pooled.username || pooled.username !== direct.username
      || pooled.pathname !== direct.pathname) {
      issues.push("production_database_connections_invalid");
    }
  } catch { issues.push("production_database_connections_invalid"); }
  if ((env.BETTER_AUTH_SECRET?.trim().length ?? 0) < 32) issues.push("production_auth_secret_required");
  if (!/^re_[A-Za-z0-9_-]{10,}$/u.test(env.RESEND_API_KEY?.trim() ?? "")) {
    issues.push("production_email_key_required");
  }
  const from = env.SAJDA_EMAIL_FROM?.trim() ?? "";
  if (!from || /[\r\n]/u.test(from) || !/^[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+$/u.test(from.replace(/^Sajda\s*<([^<>]+)>$/u, "$1"))
    || /@[^>]*\.(?:test|invalid|example)(?:>|$)/iu.test(from)) {
    issues.push("production_email_sender_required");
  }
  if (env.SAJDA_LOST_DOMAINS_CRON_ENABLED === "true") {
    if (env.SAJDA_LOST_DOMAINS_ENABLED !== "true") issues.push("production_cron_requires_engine");
    if (typeof env.CRON_SECRET !== "string" || !/^[\x21-\x7E]{32,256}$/u.test(env.CRON_SECRET)
      || env.CRON_SECRET === env.BETTER_AUTH_SECRET) issues.push("production_cron_secret_required");
    // An enabled flag and an exported function do not create a Vercel schedule.
    // This profile needs frequent short ticks; one daily call cannot drain the queue.
    const schedules = Array.isArray(deployment.crons)
      ? deployment.crons.filter(entry => entry?.path === "/api/cron/lost-domains") : [];
    if (schedules.length !== 1 || !/^(?:\*|\*\/[1-5]) \* \* \* \*$/u.test(schedules[0]?.schedule ?? "")) {
      issues.push("production_trading_worker_schedule_required");
    }
    if (deployment.functions?.["api/cron/lost-domains.ts"]?.maxDuration !== 60) {
      issues.push("production_trading_worker_duration_invalid");
    }
  }
  if (env.SAJDA_LOST_DOMAINS_REGISTRAR_ENABLED === "true") {
    if (env.SAJDA_LOST_DOMAINS_ENABLED !== "true") issues.push("production_registrar_requires_engine");
    if (!/^pk1_[A-Za-z0-9_-]{16,256}$/u.test(env.PORKBUN_API_KEY ?? "")
      || !/^sk1_[A-Za-z0-9_-]{16,256}$/u.test(env.PORKBUN_SECRET_API_KEY ?? "")
      || env.PORKBUN_API_KEY?.startsWith("pk1_sb_") || env.PORKBUN_SECRET_API_KEY?.startsWith("sk1_sb_")) {
      issues.push("production_registrar_credentials_required");
    }
  }
  if (env.STRIPE_CHECKOUT_ENABLED === "true" && (env.STRIPE_MODE !== "live"
    || env.STRIPE_LIVE_ENABLED !== "true" || !/^sk_live_/u.test(env.STRIPE_SECRET_KEY ?? "")
    || !/^whsec_/u.test(env.STRIPE_WEBHOOK_SECRET ?? "")
    || !/^price_/u.test(env.STRIPE_PLUS_PRICE_ID ?? "")
    || !/^bpc_/u.test(env.STRIPE_PORTAL_CONFIGURATION_ID ?? ""))) {
    issues.push("production_billing_requires_live_configuration");
  }
  return issues;
}

export function assertProductionConfiguration(env = process.env, deployment = {}) {
  const issues = productionConfigurationIssues(env, deployment);
  if (issues.length) throw new Error(`Production release blocked: ${issues.join(", ")}. Configuration alone does not verify delivery, payments or product quality.`);
}
