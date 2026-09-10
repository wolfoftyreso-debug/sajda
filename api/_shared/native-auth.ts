import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { AccountAccessError } from "./account-error.js";
import type { AccountHeaders } from "./account-origin.js";
import { getNeonSql } from "./neon.js";
import type { DelegatedAccountPrincipal } from "./delegated-account.js";

export const NATIVE_CALLBACK = "com.hypbit.sajda://auth/callback";
export const nativeAuthorizeInput = z.object({
  action: z.literal("authorize"),
  challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  state: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/),
}).strict();
export const nativeExchangeInput = z.object({
  action: z.literal("exchange"),
  code: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  verifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/),
}).strict();
export const hashNativeSecret = (value: string) => createHash("sha256").update(value).digest("hex");
export const nativeChallenge = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");
export const nativeEnvironment = () => process.env.VERCEL_ENV || "development";

export function requireNativeEnabled() {
  if (process.env.SAJDA_NATIVE_ENABLED !== "true") {
    throw new AccountAccessError("native_not_enabled", 503, "App account access is not enabled on this deployment.");
  }
}
export async function limitNative(subject: string, limit = 60) {
  const sql = getNeonSql();
  const hash = hashNativeSecret(`native:${nativeEnvironment()}:${subject}`);
  const rows = await sql`
    INSERT INTO sajda.function_rate_limits(scope,subject_hash,window_started_at,request_count)
    VALUES ('native',${hash},date_trunc('minute',now()),1)
    ON CONFLICT(scope,subject_hash,window_started_at) DO UPDATE
    SET request_count = LEAST(sajda.function_rate_limits.request_count + 1, 1001), updated_at=now()
    RETURNING request_count
  `;
  if (!rows[0] || Number(rows[0].request_count) > limit) {
    throw new AccountAccessError("rate_limited", 429, "Too many app requests. Wait a minute and try again.");
  }
}

export async function issueNativeCode(userId: string, sessionId: string, challenge: string) {
  const code = randomBytes(32).toString("base64url");
  const sql = getNeonSql();
  const rows = await sql`
    INSERT INTO sajda.native_authorization_codes(code_hash,user_id,session_id,environment,challenge,expires_at)
    SELECT ${hashNativeSecret(code)},u.id,s.id,${nativeEnvironment()},${challenge},now()+interval '2 minutes'
    FROM public.sajda_auth_user u JOIN public.sajda_auth_session s ON s."userId"=u.id
    WHERE u.id=${userId} AND s.id=${sessionId} AND u."emailVerified"=true AND s."expiresAt">now()
    RETURNING code_hash
  `;
  if (rows.length !== 1) throw new AccountAccessError("invalid_session", 401, "Sign in again before connecting the app.");
  return code;
}

export async function exchangeNativeCode(code: string, verifier: string) {
  const sql = getNeonSql();
  const token = `sjn_${randomBytes(32).toString("base64url")}`;
  // One atomic statement: parallel exchanges cannot both consume the same code.
  const rows = await sql`
    WITH consumed AS (
      DELETE FROM sajda.native_authorization_codes c
      USING public.sajda_auth_session s, public.sajda_auth_user u
      WHERE c.code_hash=${hashNativeSecret(code)} AND c.challenge=${nativeChallenge(verifier)}
        AND c.environment=${nativeEnvironment()} AND c.expires_at>now()
        AND s.id=c.session_id AND s."userId"=c.user_id AND s."expiresAt">now()
        AND u.id=c.user_id AND u."emailVerified"=true
      RETURNING c.user_id,c.session_id,s."expiresAt" AS source_expiry
    )
    INSERT INTO sajda.native_sessions(id,token_hash,user_id,session_id,environment,expires_at)
    SELECT ${randomUUID()}::uuid,${hashNativeSecret(token)},user_id,session_id,${nativeEnvironment()},
      LEAST(source_expiry,now()+interval '7 days') FROM consumed
    RETURNING expires_at
  `;
  if (!rows[0]) throw new AccountAccessError("invalid_grant", 401, "This app sign-in link expired or was already used. Start again.");
  return { token, expiresAt: new Date(String(rows[0].expires_at)).toISOString() };
}

export async function requireNativeSession(headers: AccountHeaders) {
  requireNativeEnabled();
  const header = headers.authorization;
  if (typeof header !== "string" || !/^Bearer sjn_[A-Za-z0-9_-]{43}$/.test(header)) {
    throw new AccountAccessError("authentication_required", 401, "Sign in to the Sajda app.");
  }
  const sql = getNeonSql();
  const rows = await sql`
    SELECT n.id,n.user_id,n.expires_at,n.created_at,u.email,u."emailVerified",u."createdAt" AS user_created
    FROM sajda.native_sessions n JOIN public.sajda_auth_session s ON s.id=n.session_id
    JOIN public.sajda_auth_user u ON u.id=n.user_id
    WHERE n.token_hash=${hashNativeSecret(header.slice(7))} AND n.environment=${nativeEnvironment()}
      AND n.revoked_at IS NULL AND n.expires_at>now() AND s."expiresAt">now()
      AND s."userId"=n.user_id AND u."emailVerified"=true
  `;
  if (!rows[0]) throw new AccountAccessError("invalid_session", 401, "Your app session expired. Sign in again.");
  const row = rows[0];
  const principal: DelegatedAccountPrincipal = {
    userId: String(row.user_id), credentialId: String(row.id), environment: nativeEnvironment(), source: "native",
    scopes: ["account:read","saved:read","saved:write","trading:read","trading:run","trading:quote","swipe:write","keys:manage","sessions:manage"],
  };
  return {
    principal,
    session: {
      user: { id: principal.userId, email: String(row.email), email_verified: true,
        created_at: new Date(String(row.user_created)).toISOString(),
        last_sign_in_at: new Date(String(row.created_at)).toISOString() },
      expires_at: Math.floor(new Date(String(row.expires_at)).getTime()/1000),
    },
  };
}
export async function revokeNativeSession(id: string, userId: string) {
  const sql = getNeonSql();
  await sql`UPDATE sajda.native_sessions SET revoked_at=COALESCE(revoked_at,now())
    WHERE id=${id}::uuid AND user_id=${userId} AND environment=${nativeEnvironment()}`;
}
