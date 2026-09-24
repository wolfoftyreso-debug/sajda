import { createHash } from "node:crypto";
import { z } from "zod";
import { getNeonSql } from "./neon.js";
import { AccountAccessError } from "./account-error.js";
import type { SocialObservation } from "../../shared/name-packages.js";

export const githubHandleSchema = z.string().trim().toLowerCase()
  .regex(/^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/u).refine(value => !value.includes("--"));
export const packageSocialInputSchema = z.object({
  handles: z.array(githubHandleSchema).min(1).max(5).refine(values => new Set(values).size === values.length),
}).strict();
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

/** Durable, conservative no-token GitHub budget. Count names, not requests.
 * Rejections/failures do not refund reservations and cannot amplify traffic.
 * No username, brief or profile payload is persisted. */
export async function consumePackageSocialQuota(owner: string, count: number) {
  const namespace = process.env.VERCEL ? process.env.VERCEL_ENV : "development";
  if (!namespace || !["development", "preview", "production"].includes(namespace)
    || !Number.isInteger(count) || count < 1 || count > 5) throw new AccountAccessError("social_unavailable", 503, "Profile checks are unavailable.");
  const accountHash = hash(`name-package-social:${namespace}:${owner}`);
  const globalHash = hash("name-package-social:github-public-egress");
  const sql = getNeonSql();
  const rows = await sql`
    WITH account_budget AS (
      INSERT INTO sajda.function_rate_limits(scope,subject_hash,window_started_at,request_count)
      VALUES ('name-package-social',${accountHash},date_trunc('hour',statement_timestamp()),${count})
      ON CONFLICT(scope,subject_hash,window_started_at) DO UPDATE
      SET request_count=LEAST(sajda.function_rate_limits.request_count+${count},20),updated_at=statement_timestamp()
      RETURNING subject_hash,request_count
    ), global_budget AS (
      INSERT INTO sajda.function_rate_limits(scope,subject_hash,window_started_at,request_count)
      SELECT 'name-package-social',${globalHash},date_trunc('hour',statement_timestamp()),${count}
      FROM account_budget WHERE request_count<=15
      ON CONFLICT(scope,subject_hash,window_started_at) DO UPDATE
      SET request_count=LEAST(sajda.function_rate_limits.request_count+${count},46),updated_at=statement_timestamp()
      RETURNING subject_hash,request_count
    ), pruned AS (
      DELETE FROM sajda.function_rate_limits WHERE ctid IN (
        SELECT ctid FROM sajda.function_rate_limits WHERE scope='name-package-social'
          AND window_started_at < statement_timestamp()-interval '30 days' LIMIT 100
      )
    )
    SELECT subject_hash,request_count FROM account_budget
    UNION ALL SELECT subject_hash,request_count FROM global_budget
  `;
  const accountRow = rows.find(row => row.subject_hash === accountHash);
  if (accountRow && Number.isSafeInteger(Number(accountRow.request_count)) && Number(accountRow.request_count) > 15) {
    throw new AccountAccessError("rate_limited", 429, "The profile-check allowance is used. Try again after the next hour.");
  }
  if (rows.length !== 2 || ![accountHash, globalHash].every(subject => rows.some(row => row.subject_hash === subject))
    || rows.some(row => !Number.isSafeInteger(Number(row.request_count)) || Number(row.request_count) < count)) {
    throw new AccountAccessError("social_unavailable", 503, "Profile checks are unavailable.");
  }
  if (rows.some(row => Number(row.request_count) > (row.subject_hash === accountHash ? 15 : 40))) {
    throw new AccountAccessError("rate_limited", 429, "The profile-check allowance is used. Try again after the next hour.");
  }
}

async function boundedJson(response: Response) {
  if (!response.headers.get("content-type")?.toLowerCase().includes("application/json")
    || Number(response.headers.get("content-length") || 0) > 65_536 || !response.body) throw new Error("invalid_response");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65_536) { void reader.cancel().catch(() => undefined); throw new Error("invalid_response"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const buffer = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer)) as unknown;
}

/** Official public API, GET only. A 404 is NOT proof of registrability.
 * Discard the provider's bio, email, avatar and all other personal data. */
export async function observeGithubHandle(raw: string, deps: {
  fetch?: typeof fetch; now?: () => number; timeoutMs?: number;
} = {}): Promise<SocialObservation> {
  const handle = githubHandleSchema.parse(raw);
  const sourceUrl = `https://api.github.com/users/${handle}`;
  const now = deps.now ?? Date.now;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const unknown = (): SocialObservation => ({ platform: "github", handle, status: "unknown", checkedAt: new Date(now()).toISOString(), sourceUrl });
  try {
    return await Promise.race([
      (async (): Promise<SocialObservation> => {
        const response = await (deps.fetch ?? fetch)(sourceUrl, {
          method: "GET", redirect: "manual", signal: controller.signal,
          headers: { Accept: "application/vnd.github+json", "User-Agent": "Sajda-Name-Packages", "X-GitHub-Api-Version": "2026-03-10" },
        });
        if (response.redirected || (response.url && response.url !== sourceUrl) || ![200, 404].includes(response.status)) return unknown();
        const value = await boundedJson(response);
        if (!value || typeof value !== "object" || Array.isArray(value)) return unknown();
        const row = value as Record<string, unknown>;
        let status: SocialObservation["status"] = "unknown";
        if (response.status === 200 && typeof row.login === "string" && row.login.toLowerCase() === handle
          && typeof row.id === "number" && Number.isSafeInteger(row.id) && row.id > 0
          && ["User", "Organization", "Bot"].includes(String(row.type))) status = "profile_found";
        if (response.status === 404 && row.message === "Not Found") status = "not_found";
        return { platform: "github", handle, status, checkedAt: new Date(now()).toISOString(), sourceUrl };
      })(),
      new Promise<SocialObservation>(resolve => {
        timer = setTimeout(() => { controller.abort(); resolve(unknown()); }, deps.timeoutMs ?? 4_000);
      }),
    ]);
  } catch { return unknown(); }
  finally { if (timer) clearTimeout(timer); controller.abort(); }
}
