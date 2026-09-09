import { createHash } from "node:crypto";
import { AccountAccessError, type VerifiedAccount } from "./account-auth.js";
import { getNeonSql } from "./neon.js";

export interface AccountCapabilities { swipe_undo: boolean }
const REQUESTS_PER_MINUTE = 120;

/**
 * A fresh, server-owned grant is the only source of premium access. Sessions,
 * verified email, client roles and UI flags are not payment/entitlement data.
 * The database clock decides validity; no browser timestamp is accepted.
 */
export async function getAccountCapabilities(account: VerifiedAccount): Promise<AccountCapabilities> {
  const subject = createHash("sha256").update(`account-capabilities:${account.id}`).digest("hex");
  const rows = await getNeonSql().query(`
    WITH rate_limit AS (
      INSERT INTO sajda.function_rate_limits (scope, subject_hash, window_started_at, request_count)
      VALUES ('account-capabilities', $1, date_trunc('minute', statement_timestamp()), 1)
      ON CONFLICT (scope, subject_hash, window_started_at)
      DO UPDATE SET request_count = sajda.function_rate_limits.request_count + 1,
                    updated_at = statement_timestamp()
      RETURNING request_count
    )
    SELECT rate_limit.request_count, entitlement.user_id, entitlement.capability,
           (entitlement.revoked_at IS NULL
             AND entitlement.valid_from <= statement_timestamp()
             AND entitlement.expires_at > statement_timestamp()) AS active
    FROM rate_limit
    LEFT JOIN sajda.account_entitlements AS entitlement
      ON entitlement.user_id = $2 AND entitlement.capability = 'swipe_undo'
         AND rate_limit.request_count <= $3
  `, [subject, account.id, REQUESTS_PER_MINUTE], {
    fetchOptions: { signal: AbortSignal.timeout(3_500) },
  });

  if (rows.length !== 1) throw new Error("Invalid capability response");
  const row = rows[0];
  const count = Number(row.request_count);
  if (!Number.isSafeInteger(count) || count < 1) throw new Error("Invalid capability rate-limit response");
  if (count > REQUESTS_PER_MINUTE) {
    throw new AccountAccessError("rate_limited", 429, "Too many account checks. Wait a moment and try again.");
  }
  if (row.user_id === null && row.capability === null && row.active === null) {
    return { swipe_undo: false };
  }
  if (row.user_id !== account.id || row.capability !== "swipe_undo" || typeof row.active !== "boolean") {
    throw new Error("Invalid account entitlement response");
  }
  return { swipe_undo: row.active };
}
