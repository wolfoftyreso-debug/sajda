import { randomUUID } from "node:crypto";
import type { BetterAuthRateLimitStorage } from "better-auth";
import { AccountAccessError } from "./account-error.js";

interface RateLimitDatabase {
  query(text: string, values: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}
const unavailable = () => new AccountAccessError("auth_unavailable", 503, "Account access is temporarily unavailable. Please retry.");
function integer(value: unknown): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" && /^\d+$/u.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw unavailable();
  return parsed;
}

/**
 * Better Auth 1.7.3's default database limiter advances lastRequest after every
 * accepted request. Consequently low-frequency session polling eventually hits
 * its lifetime count unless it pauses for a whole minute. Session reads instead
 * use a window anchored to the first request, without moving that anchor.
 * Credential, signup and recovery endpoints retain their stricter inactivity
 * windows and configured limits. Denied requests never extend either window.
 *
 * Uses the existing auth table/key so a deployment does not reset active limits.
 * One upsert performs the decision and increment under PostgreSQL's unique-key
 * lock: there is no separate read/check/write concurrency bypass. Database time
 * owns both expiration and Retry-After, not clocks on individual Vercel workers.
 */
export function createAccountRateLimitStorage(database: RateLimitDatabase): BetterAuthRateLimitStorage {
  return {
    async consume(key, rule) {
      if (typeof key !== "string" || !key || key.length > 2048
        || !Number.isSafeInteger(rule.window) || rule.window < 1 || rule.window > 3600
        || !Number.isSafeInteger(rule.max) || rule.max < 1 || rule.max > 10000) throw unavailable();
      const windowMs = rule.window * 1000;
      const anchored = key.endsWith("|/get-session");
      try {
        const result = await database.query(`/* account:auth-rate-limit */
          WITH clock AS MATERIALIZED (
            SELECT floor(extract(epoch FROM statement_timestamp()) * 1000)::bigint AS now_ms
          ), consumed AS (
            INSERT INTO public.sajda_auth_rate_limit AS budget (id, key, count, "lastRequest")
            SELECT $1, $2, 1, now_ms FROM clock
            ON CONFLICT (key) DO UPDATE SET
              count = CASE WHEN budget."lastRequest" <= (SELECT now_ms FROM clock) - $3::bigint
                THEN 1 ELSE LEAST(budget.count + 1, $4::integer + 1) END,
              "lastRequest" = CASE
                WHEN budget."lastRequest" <= (SELECT now_ms FROM clock) - $3::bigint
                  OR (NOT $5::boolean AND budget.count < $4::integer)
                THEN GREATEST(budget."lastRequest", (SELECT now_ms FROM clock)) ELSE budget."lastRequest" END
            RETURNING key, count, "lastRequest"
          ), pruned AS (
            DELETE FROM public.sajda_auth_rate_limit WHERE id IN (
              SELECT expired.id FROM public.sajda_auth_rate_limit expired, clock, consumed
              WHERE expired.key <> $2 AND expired."lastRequest" < clock.now_ms - 86400000
              ORDER BY expired."lastRequest" LIMIT 32 FOR UPDATE OF expired SKIP LOCKED
            )
          )
          SELECT consumed.key, consumed.count, consumed."lastRequest",
            GREATEST(consumed."lastRequest", clock.now_ms) AS now_ms
          FROM consumed CROSS JOIN clock`, [randomUUID(), key, windowMs, rule.max, anchored]);
        if (result.rows.length !== 1 || result.rows[0].key !== key) throw unavailable();
        const row = result.rows[0];
        const count = integer(row.count), started = integer(row.lastRequest), now = integer(row.now_ms);
        if (count < 1 || count > rule.max + 1 || started > now || now - started >= windowMs) throw unavailable();
        return count <= rule.max ? { allowed: true, retryAfter: null }
          : { allowed: false, retryAfter: Math.max(1, Math.ceil((started + windowMs - now) / 1000)) };
      } catch {
        // Do not leak SQL, connection information or the IP-derived SDK key.
        throw unavailable();
      }
    },
  };
}
