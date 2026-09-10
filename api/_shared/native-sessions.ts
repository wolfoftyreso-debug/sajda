import { createHash } from "node:crypto";
import type { VerifiedAccount } from "./account-auth.js";
import { AccountAccessError } from "./account-error.js";
import { getNeonSql } from "./neon.js";
import { nativeEnvironment } from "./native-auth.js";

export interface AppSession { id: string; createdAt: string; expiresAt: string }
export interface AppSessionPage { items: AppSession[]; nextCursor: string | null }
export const APP_SESSION_PAGE_SIZE = 25;
export const APP_SESSION_MANAGEMENT_LIMIT = 20;
export type NativeSessionsQuery = (text: string, params: unknown[]) => Promise<Record<string, unknown>[]>;

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const PRECISE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/u;
type Cursor = { createdAt: string; id: string };
const unavailable = () => new AccountAccessError("app_sessions_unavailable", 503, "Your app connections are temporarily unavailable. Try again.");
const invalidCursor = () => new AccountAccessError("invalid_cursor", 400, "Use a valid app-connection page cursor.");

function preciseTime(value: unknown): value is string {
  if (typeof value !== "string" || !PRECISE_TIME.test(value)) return false;
  const millis = `${value.slice(0, 23)}Z`, parsed = new Date(millis);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === millis;
}
function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify([cursor.createdAt, cursor.id]), "utf8").toString("base64url");
}
export function parseAppSessionCursor(value: unknown): Cursor | null {
  if (value === undefined) return null;
  if (typeof value !== "string" || value.length > 200 || !/^[A-Za-z0-9_-]+$/u.test(value)) throw invalidCursor();
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!Array.isArray(parsed) || parsed.length !== 2 || !preciseTime(parsed[0]) || typeof parsed[1] !== "string" || !UUID.test(parsed[1])) throw invalidCursor();
    const cursor = { createdAt: parsed[0], id: parsed[1] };
    if (encodeCursor(cursor) !== value) throw invalidCursor();
    return cursor;
  } catch { throw invalidCursor(); }
}
export function parseAppSessionId(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) {
    throw new AccountAccessError("invalid_request", 400, "Choose one app connection to disconnect.");
  }
  return value;
}
function ownerFor(account: VerifiedAccount): string {
  if (typeof account.id !== "string" || !account.id.trim() || account.id.trim() !== account.id || account.id.length > 200 || account.emailVerified !== true) {
    throw new AccountAccessError("authentication_required", 401, "Sign in with a verified Sajda account.");
  }
  return account.id;
}
function iso(value: unknown): string {
  const date = value instanceof Date ? value : typeof value === "string" ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) throw unavailable();
  return date.toISOString();
}

/** Read/revoke only. This service never issues credentials or touches browser
 * sessions, saved domains, subscriptions, or the shared account itself. */
export function createNativeSessionsService(deps: { query?: NativeSessionsQuery; environment?: () => string } = {}) {
  const query: NativeSessionsQuery = deps.query ?? (async (text, params) => getNeonSql().query(text, params));
  const environment = () => {
    const value = (deps.environment ?? nativeEnvironment)();
    if (!["development", "preview", "production"].includes(value)) throw unavailable();
    return value;
  };
  async function limit(owner: string, namespace: string) {
    const subject = createHash("sha256").update(`app-session-management:${owner}`).digest("hex");
    // One saturating row per owner/environment, shared by GET and DELETE and
    // all browser/app sessions. Reloading or rotating credentials cannot reset it.
    const rows = await query(`/* app-sessions:quota */
      INSERT INTO sajda.developer_api_quotas(namespace,subject_hash,bucket,window_started_at,request_count)
      VALUES ($1,$2,'management',date_trunc('minute',statement_timestamp()),1)
      ON CONFLICT(namespace,subject_hash,bucket) DO UPDATE SET
        window_started_at=date_trunc('minute',statement_timestamp()),
        request_count=CASE WHEN sajda.developer_api_quotas.window_started_at<date_trunc('minute',statement_timestamp())
          THEN 1 ELSE LEAST(sajda.developer_api_quotas.request_count+1,$3+1) END
      RETURNING request_count`, [namespace, subject, APP_SESSION_MANAGEMENT_LIMIT]);
    const count = Number(rows[0]?.request_count);
    if (rows.length !== 1 || !Number.isSafeInteger(count) || count < 1 || count > APP_SESSION_MANAGEMENT_LIMIT + 1) throw unavailable();
    if (count > APP_SESSION_MANAGEMENT_LIMIT) throw new AccountAccessError("rate_limited", 429, "Too many app-connection requests. Wait a minute and try again.");
  }
  return {
    async list(account: VerifiedAccount, rawCursor?: unknown): Promise<AppSessionPage> {
      const owner = ownerFor(account), namespace = environment(), cursor = parseAppSessionCursor(rawCursor);
      await limit(owner, namespace);
      const rows = await query(`/* app-sessions:list */
        SELECT n.id::text,n.user_id,n.environment,
          to_char(n.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at,
          LEAST(n.expires_at,s."expiresAt") AS expires_at
        FROM sajda.native_sessions n
        JOIN public.sajda_auth_session s ON s.id=n.session_id AND s."userId"=n.user_id
        JOIN public.sajda_auth_user u ON u.id=n.user_id
        WHERE n.user_id=$1 AND n.environment=$2 AND n.revoked_at IS NULL
          AND n.expires_at>statement_timestamp() AND s."expiresAt">statement_timestamp() AND u."emailVerified"=true
          AND ($3::timestamptz IS NULL OR (n.created_at,n.id)<($3::timestamptz,$4::uuid))
        ORDER BY n.created_at DESC,n.id DESC LIMIT $5`,
      [owner, namespace, cursor?.createdAt ?? null, cursor?.id ?? null, APP_SESSION_PAGE_SIZE + 1]);
      if (rows.length > APP_SESSION_PAGE_SIZE + 1) throw unavailable();
      // Validate the extra pagination row too; never expose an unexpected shape.
      for (const row of rows) {
        if (row.user_id !== owner || row.environment !== namespace || typeof row.id !== "string" || !UUID.test(row.id) || !preciseTime(row.created_at)) throw unavailable();
        if (Date.parse(iso(row.expires_at)) <= Date.parse(row.created_at)) throw unavailable();
      }
      const page = rows.slice(0, APP_SESSION_PAGE_SIZE);
      return {
        items: page.map(row => ({ id: String(row.id), createdAt: iso(row.created_at), expiresAt: iso(row.expires_at) })),
        nextCursor: rows.length > APP_SESSION_PAGE_SIZE
          ? encodeCursor({ createdAt: String(page[page.length - 1].created_at), id: String(page[page.length - 1].id) }) : null,
      };
    },
    async revoke(account: VerifiedAccount, rawId: unknown): Promise<{ ok: true }> {
      const owner = ownerFor(account), namespace = environment(), id = parseAppSessionId(rawId);
      await limit(owner, namespace);
      await query(`/* app-sessions:revoke */
        UPDATE sajda.native_sessions n SET revoked_at=COALESCE(n.revoked_at,statement_timestamp())
        WHERE n.id=$1::uuid AND n.user_id=$2 AND n.environment=$3
          AND EXISTS(SELECT 1 FROM public.sajda_auth_user u WHERE u.id=$2 AND u."emailVerified"=true)`, [id, owner, namespace]);
      // Same result for a foreign, absent, expired, or already revoked ID.
      return { ok: true };
    },
  };
}
export type NativeSessionsService = ReturnType<typeof createNativeSessionsService>;
