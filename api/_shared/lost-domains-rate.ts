import { createHash } from "node:crypto";
import { AccountAccessError } from "./account-auth.js";
import { getNeonSql } from "./neon.js";

/** A shared database limiter; multiple Vercel instances cannot reset it. */
export async function limitLostDomainsAccount(ownerId: string): Promise<void> {
  const subject = createHash("sha256").update(`lost-domains:${ownerId}`).digest("hex");
  const rows = await getNeonSql().query(`
    INSERT INTO sajda.function_rate_limits (scope, subject_hash, window_started_at, request_count)
    VALUES ('lost-domains', $1, date_trunc('minute', statement_timestamp()), 1)
    ON CONFLICT (scope, subject_hash, window_started_at)
    DO UPDATE SET request_count = sajda.function_rate_limits.request_count + 1, updated_at = statement_timestamp()
    RETURNING request_count
  `, [subject], { fetchOptions: { signal: AbortSignal.timeout(3_500) } });
  const count = Number(rows[0]?.request_count);
  if (!Number.isSafeInteger(count) || count < 1) throw new Error("Invalid Lost Domains limiter");
  if (count > 60) throw new AccountAccessError("rate_limited", 429, "Too many review requests. Wait a minute and retry.");
}
