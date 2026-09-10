import { createHash } from "node:crypto";
import type { AccountMembership } from "../../shared/account-membership.js";
import { AccountAccessError, type VerifiedAccount } from "./account-auth.js";
import { getNeonSql } from "./neon.js";
import { refreshNativeCommerceMembership } from "./native-commerce-service.js";

const REQUESTS_PER_MINUTE = 120;
type MembershipQuery = (text: string, params: unknown[]) => Promise<Record<string, unknown>[]>;

/** One read model for account presentation and fresh feature authorization.
 * It neither creates subscriptions nor copies higher-tier permissions into
 * legacy grants. Expiry/revocation therefore immediately remove inheritance.
 */
export function createAccountMembershipReader(deps: {
  query?: MembershipQuery;
  environment?: () => NodeJS.ProcessEnv;
} = {}) {
  return async function readMembership(account: VerifiedAccount): Promise<AccountMembership> {
    if (typeof account?.id !== "string" || !account.id.trim() || account.id.length > 200) {
      throw new AccountAccessError("invalid_session", 401, "Sign in to your Sajda account again.");
    }
    if (account.emailVerified !== true) {
      throw new AccountAccessError("email_verification_required", 403, "Confirm your email address before using this account feature.");
    }
    const env = deps.environment?.() ?? process.env;
    const namespace = env.VERCEL ? env.VERCEL_ENV : "development";
    if (!namespace || !["development", "preview", "production"].includes(namespace)) {
      throw new Error("Invalid membership environment");
    }
    const subject = createHash("sha256").update(`account-membership:${namespace}:${account.id}`).digest("hex");
    const query: MembershipQuery = deps.query ?? ((text, params) => getNeonSql().query(text, params, {
      fetchOptions: { signal: AbortSignal.timeout(3_500) },
    }));
    const rows = await query(`/* account:membership */
      WITH rate_limit AS (
        INSERT INTO sajda.function_rate_limits (scope, subject_hash, window_started_at, request_count)
        VALUES ('account-membership', $1, date_trunc('minute', statement_timestamp()), 1)
        ON CONFLICT (scope, subject_hash, window_started_at)
        DO UPDATE SET request_count = sajda.function_rate_limits.request_count + 1,
                      updated_at = statement_timestamp()
        RETURNING request_count
      ), account_owner AS (
        SELECT id, "emailVerified" AS verified FROM public.sajda_auth_user WHERE id = $2
      ), grants AS (
        SELECT 2 AS tier, 'premium'::text AS plan,
          -- Legacy grants have no subscription/namespace relationship. Keep
          -- their existing capability but never present them as Stripe billing.
          'operator'::text AS access_source,
          entitlement.expires_at
        FROM sajda.account_entitlements entitlement JOIN account_owner u ON u.id = entitlement.user_id
        WHERE entitlement.user_id = $2 AND entitlement.capability = 'swipe_undo'
          AND entitlement.grant_source IN ('operator', 'billing') AND u.verified = true
          AND entitlement.revoked_at IS NULL AND entitlement.valid_from <= statement_timestamp()
          AND entitlement.expires_at > statement_timestamp()
        UNION ALL
        SELECT CASE WHEN a.plan='premium' THEN 2 ELSE 1 END AS tier, a.plan,
          'subscription'::text AS access_source, LEAST(a.expires_at,a.verified_at+interval '24 hours') AS expires_at
        FROM sajda.native_commerce_subscriptions a JOIN account_owner u ON u.id=a.owner_id
        WHERE a.namespace=$4 AND a.owner_id=$2 AND a.plan IN ('basic','premium') AND u.verified=true
          AND a.status IN (1,4) AND a.revoked_at IS NULL AND a.valid_from<=statement_timestamp()
          AND a.expires_at>statement_timestamp() AND a.verified_at>statement_timestamp()-interval '24 hours'
          AND (a.namespace='production')=(a.environment='Production')
        UNION ALL
        SELECT 3 AS tier, 'trading'::text AS plan,
          CASE WHEN EXISTS (
            SELECT 1 FROM sajda.lost_domain_access operator_grant
            WHERE operator_grant.owner_id = a.owner_id AND operator_grant.grant_source = 'operator'
              AND operator_grant.valid_from = a.valid_from AND operator_grant.expires_at = a.expires_at
              AND operator_grant.revoked_at IS NULL
          ) THEN 'operator' ELSE 'subscription' END AS access_source,
          a.expires_at
        FROM sajda.lost_domain_effective_access a JOIN account_owner u ON u.id = a.owner_id
        WHERE a.owner_id = $2 AND a.namespace = $4 AND u.verified = true
          AND a.revoked_at IS NULL AND a.valid_from <= statement_timestamp()
          AND a.expires_at > statement_timestamp()
      )
      SELECT rate_limit.request_count, u.id AS account_id, u.verified, $4::text AS namespace,
        statement_timestamp() AS checked_at, selected.plan, selected.access_source, selected.expires_at
      FROM rate_limit LEFT JOIN account_owner u ON true
      LEFT JOIN LATERAL (
        SELECT plan, access_source, expires_at FROM grants WHERE rate_limit.request_count <= $3
        ORDER BY tier DESC, expires_at DESC, access_source ASC LIMIT 1
      ) selected ON true
    `, [subject, account.id, REQUESTS_PER_MINUTE, namespace]);
    if (rows.length !== 1) throw new Error("Invalid membership response");
    const row = rows[0];
    const count = typeof row.request_count === "number" || typeof row.request_count === "string" && /^\d+$/u.test(row.request_count)
      ? Number(row.request_count) : NaN;
    if (!Number.isSafeInteger(count) || count < 1) throw new Error("Invalid membership rate-limit response");
    if (count > REQUESTS_PER_MINUTE) {
      throw new AccountAccessError("rate_limited", 429, "Too many account checks. Wait a moment and try again.");
    }
    if (row.account_id !== account.id || row.namespace !== namespace) throw new Error("Invalid membership owner response");
    if (row.verified !== true) {
      throw new AccountAccessError("email_verification_required", 403, "Confirm your email address before using this account feature.");
    }
    // Authenticate/rate-limit in PostgreSQL before any external Apple request.
    // A refreshed state gets one new read; the injected query prevents recursion.
    if (!deps.query && await refreshNativeCommerceMembership(account.id)) {
      return createAccountMembershipReader({ query, environment: () => env })(account);
    }
    if (row.plan === null && row.access_source === null && row.expires_at === null) {
      return { plan: "free", accessSource: "free", expiresAt: null,
        capabilities: { save_domains: true, swipe_undo: false, trading: false } };
    }
    const checkedAt = timestamp(row.checked_at);
    const expiresAt = timestamp(row.expires_at);
    if (typeof row.plan !== "string" || !["basic", "premium", "trading"].includes(row.plan)
      || typeof row.access_source !== "string" || !["operator", "subscription"].includes(row.access_source)
      || row.plan === "basic" && row.access_source !== "subscription"
      || !Number.isFinite(checkedAt) || !Number.isFinite(expiresAt) || expiresAt <= checkedAt) {
      throw new Error("Invalid membership grant response");
    }
    return { plan: row.plan as "basic" | "premium" | "trading", accessSource: row.access_source as "operator" | "subscription",
      expiresAt: new Date(expiresAt).toISOString(),
      capabilities: { save_domains: true, swipe_undo: row.plan === "premium" || row.plan === "trading", trading: row.plan === "trading" } };
  };
}

function timestamp(value: unknown): number {
  return value instanceof Date ? value.getTime() : typeof value === "string" ? Date.parse(value) : NaN;
}

export const getAccountMembership = createAccountMembershipReader();
