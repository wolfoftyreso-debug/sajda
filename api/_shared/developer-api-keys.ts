import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { Pool } from "pg";
import { createAccountPool } from "./account-server.js";
import { AccountAccessError } from "./account-error.js";
import type { VerifiedAccount } from "./account-auth.js";
import type { AccountHeaders } from "./account-origin.js";

export const API_KEY_SCOPES = ["domains:search", "account:read", "saved:read", "saved:write", "trading:read", "trading:run", "trading:quote"] as const;
export type ApiKeyScope = typeof API_KEY_SCOPES[number];
export type ApiKeyEnvironment = "development" | "preview" | "production";
export interface ApiKeyPrincipal {
  userId: string; keyId: string; scopes: ApiKeyScope[]; environment: ApiKeyEnvironment;
}
/** Non-secret engine identity, shared by REST/MCP and unchanged by key rotation.
 * 192 hash bits leave a 56-character ID inside the engine's 64-character cap.
 * This identifies a throttle bucket only; it never authenticates a request.
 */
export function apiKeyEngineClientId(principal: Pick<ApiKeyPrincipal, "userId" | "environment">): string {
  return `account_${createHash("sha256").update(`${principal.environment}:${principal.userId}`).digest("hex").slice(0, 48)}`;
}
export interface DeveloperApiKey {
  id: string; name: string; keyPrefix: string; lastFour: string;
  environment: ApiKeyEnvironment; scopes: ApiKeyScope[];
  createdAt: string; expiresAt: string; lastUsedAt: string | null; revokedAt: string | null;
}
export interface CreateDeveloperApiKeyInput { name: string; scopes: ApiKeyScope[]; expiresInDays: number }
export type PersistedApiKeyAuthentication =
  | { status: "authenticated"; principal: ApiKeyPrincipal; clientId: string }
  | { status: "not_applicable" | "invalid" | "unavailable" | "insufficient_scope" };
export interface ApiKeyQuota { allowed: boolean; remaining: number; resetAt: number }
export const API_KEY_LIMITS = { maxActiveKeys: 10, defaultExpiryDays: 90, maxExpiryDays: 365, requestsPerMinute: 120, domainsPerMinute: 4 } as const;

interface KeyClient {
  query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  release(): void;
}
export interface DeveloperApiKeyPool { connect(): Promise<KeyClient> }
type KeyQuery = (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;
type QuotaBucket = "requests" | "domains" | "management";
const TOKEN = /^sj_(test|live)_([A-Za-z0-9_-]{16})_([A-Za-z0-9_-]{43})$/u;
const KEY_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const SELECT_METADATA = "id::text, owner_id, namespace, name, key_prefix, last_four, scopes, created_at, expires_at, last_used_at, revoked_at";
let runtimePool: Pool | undefined;
let runtimeConnection: string | undefined;

function storageUnavailable(): AccountAccessError {
  return new AccountAccessError("developer_keys_unavailable", 503, "API key access is temporarily unavailable. Please try again.");
}
function getPool(): DeveloperApiKeyPool {
  const connection = process.env.DATABASE_URL?.trim();
  if (!connection) throw storageUnavailable();
  if (!runtimePool || runtimeConnection !== connection) {
    if (runtimePool) void runtimePool.end().catch(() => undefined);
    runtimePool = createAccountPool(connection);
    runtimePool.on("error", () => console.error(JSON.stringify({ event: "developer_keys_database_unavailable" })));
    runtimeConnection = connection;
  }
  return runtimePool;
}
export function apiKeyEnvironment(env: NodeJS.ProcessEnv = process.env): ApiKeyEnvironment {
  const stage = env.VERCEL ? env.VERCEL_ENV : "development";
  if (stage !== "development" && stage !== "preview" && stage !== "production") throw storageUnavailable();
  return stage;
}
function validOwner(value: unknown): value is string {
  return typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= 200;
}
function scopes(value: unknown): ApiKeyScope[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > API_KEY_SCOPES.length
    || value.some(scope => typeof scope !== "string" || !API_KEY_SCOPES.includes(scope as ApiKeyScope))
    || new Set(value).size !== value.length) {
    throw new AccountAccessError("invalid_scopes", 400, "Select at least one supported API key permission.");
  }
  return API_KEY_SCOPES.filter(scope => value.includes(scope));
}
export function parseCreateDeveloperApiKey(value: unknown): CreateDeveloperApiKeyInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AccountAccessError("invalid_request", 400, "Send a valid API key request.");
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some(key => !["name", "scopes", "expiresInDays"].includes(key))
    || typeof input.name !== "string" || !input.name.trim() || input.name.trim().length > 80 || /[\p{Cc}\p{Cf}]/u.test(input.name)) {
    throw new AccountAccessError("invalid_request", 400, "Use a key name of 1–80 characters and supported key settings.");
  }
  const expiresInDays = input.expiresInDays === undefined ? API_KEY_LIMITS.defaultExpiryDays : input.expiresInDays;
  if (typeof expiresInDays !== "number" || !Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > API_KEY_LIMITS.maxExpiryDays) {
    throw new AccountAccessError("invalid_expiry", 400, "API keys must expire in 1–365 days.");
  }
  return { name: input.name.trim(), scopes: scopes(input.scopes === undefined ? ["domains:search"] : input.scopes), expiresInDays };
}
export function assertApiKeyScopes(principal: ApiKeyPrincipal, required: readonly ApiKeyScope[]): void {
  if (required.some(scope => !API_KEY_SCOPES.includes(scope) || !principal.scopes.includes(scope))) {
    throw new AccountAccessError("insufficient_scope", 403, "This API key does not have the required permission.");
  }
}
function iso(value: unknown): string {
  const timestamp = value instanceof Date ? value.getTime() : typeof value === "string" ? Date.parse(value) : NaN;
  if (!Number.isFinite(timestamp)) throw storageUnavailable();
  return new Date(timestamp).toISOString();
}
function metadata(row: Record<string, unknown>, owner: string, environment: ApiKeyEnvironment): DeveloperApiKey {
  if (row.owner_id !== owner || row.namespace !== environment || typeof row.id !== "string" || !KEY_ID.test(row.id)
    || typeof row.name !== "string" || typeof row.key_prefix !== "string" || typeof row.last_four !== "string") throw storageUnavailable();
  return { id: row.id, name: row.name, keyPrefix: row.key_prefix, lastFour: row.last_four, environment,
    scopes: scopes(row.scopes), createdAt: iso(row.created_at), expiresAt: iso(row.expires_at),
    lastUsedAt: row.last_used_at == null ? null : iso(row.last_used_at), revokedAt: row.revoked_at == null ? null : iso(row.revoked_at) };
}

/** PostgreSQL owns all state; injected dependencies are only a server-side test seam. */
export function createDeveloperApiKeyService(deps: { pool?: DeveloperApiKeyPool; environment?: () => NodeJS.ProcessEnv } = {}) {
  const environment = () => apiKeyEnvironment(deps.environment?.() ?? process.env);
  const query: KeyQuery = async (text, params = []) => {
    const client = await (deps.pool ?? getPool()).connect();
    try { return (await client.query(text, params)).rows; } finally { client.release(); }
  };
  const accountOwner = (account: VerifiedAccount) => {
    if (!validOwner(account.id) || account.emailVerified !== true) throw new AccountAccessError("authentication_required", 401, "Sign in with a verified Sajda account.");
    return account.id;
  };
  const consumeQuota = async (owner: string, bucket: QuotaBucket, namespace = environment(), legacy = false): Promise<ApiKeyQuota> => {
    if (!validOwner(owner) || namespace !== environment()) throw storageUnavailable();
    const limit = bucket === "domains" ? API_KEY_LIMITS.domainsPerMinute : bucket === "management" ? 20 : API_KEY_LIMITS.requestsPerMinute;
    const subject = createHash("sha256").update(`${legacy ? "operator" : "account"}:${owner}`).digest("hex");
    const rows = await query(`/* keys:quota */
      INSERT INTO sajda.developer_api_quotas(namespace, subject_hash, bucket, window_started_at, request_count)
      VALUES ($1, $2, $3, date_trunc('minute', statement_timestamp()), 1)
      ON CONFLICT (namespace, subject_hash, bucket) DO UPDATE SET
        window_started_at = date_trunc('minute', statement_timestamp()),
        request_count = CASE WHEN sajda.developer_api_quotas.window_started_at < date_trunc('minute', statement_timestamp())
          THEN 1 ELSE LEAST(sajda.developer_api_quotas.request_count + 1, $4 + 1) END
      RETURNING request_count, window_started_at + interval '1 minute' AS reset_at
    `, [namespace, subject, bucket, limit]);
    const count = Number(rows[0]?.request_count), resetAt = Date.parse(iso(rows[0]?.reset_at));
    if (rows.length !== 1 || !Number.isSafeInteger(count) || count < 1 || count > limit + 1) throw storageUnavailable();
    return { allowed: count <= limit, remaining: Math.max(0, limit - count), resetAt };
  };
  const managementQuota = async (owner: string) => {
    if (!(await consumeQuota(owner, "management")).allowed) throw new AccountAccessError("rate_limited", 429, "Too many API key requests. Wait a minute and try again.");
  };
  return {
    async list(account: VerifiedAccount): Promise<DeveloperApiKey[]> {
      const owner = accountOwner(account), namespace = environment();
      await managementQuota(owner);
      const rows = await query(`/* keys:list */ SELECT ${SELECT_METADATA} FROM sajda.developer_api_keys
        WHERE owner_id = $1 AND namespace = $2
          AND EXISTS (SELECT 1 FROM public.sajda_auth_user WHERE id = $1 AND "emailVerified" = true)
        ORDER BY (revoked_at IS NULL AND expires_at > statement_timestamp()) DESC, created_at DESC, id DESC LIMIT 100`, [owner, namespace]);
      return rows.map(row => metadata(row, owner, namespace));
    },
    async create(account: VerifiedAccount, value: unknown): Promise<{ key: DeveloperApiKey; apiKey: string }> {
      const owner = accountOwner(account), namespace = environment(), input = parseCreateDeveloperApiKey(value);
      await managementQuota(owner);
      const id = randomUUID(), lookup = randomBytes(12).toString("base64url");
      const prefix = `sj_${namespace === "production" ? "live" : "test"}_${lookup}_`;
      const apiKey = `${prefix}${randomBytes(32).toString("base64url")}`;
      const hash = createHash("sha256").update(apiKey).digest("hex");
      const client = await (deps.pool ?? getPool()).connect();
      try {
        await client.query("BEGIN");
        // A separate count statement after the lock obtains a fresh snapshot.
        // A count in the same statement as a waiting lock could exceed the cap.
        const locked = await client.query(`/* keys:owner-lock */ SELECT id FROM public.sajda_auth_user WHERE id = $1 AND "emailVerified" = true FOR UPDATE`, [owner]);
        if (locked.rows[0]?.id !== owner) throw new AccountAccessError("authentication_required", 401, "Sign in with a verified Sajda account.");
        const active = await client.query(`/* keys:active */ SELECT count(*)::integer AS count FROM sajda.developer_api_keys
          WHERE owner_id = $1 AND namespace = $2 AND revoked_at IS NULL AND expires_at > statement_timestamp()`, [owner, namespace]);
        const count = Number(active.rows[0]?.count);
        if (!Number.isSafeInteger(count) || count < 0) throw storageUnavailable();
        if (count >= API_KEY_LIMITS.maxActiveKeys) throw new AccountAccessError("api_key_limit", 409, "Revoke an active key before creating another. Each account can have 10 active keys.");
        const inserted = await client.query(`/* keys:create */ INSERT INTO sajda.developer_api_keys
          (id, namespace, owner_id, name, lookup_id, secret_hash, key_prefix, last_four, scopes, expires_at)
          VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9::text[], statement_timestamp() + $10 * interval '1 day')
          RETURNING ${SELECT_METADATA}`, [id, namespace, owner, input.name, lookup, hash, prefix, apiKey.slice(-4), input.scopes, input.expiresInDays]);
        const key = metadata(inserted.rows[0] ?? {}, owner, namespace);
        await client.query("COMMIT");
        return { key, apiKey };
      } catch (error) {
        try { await client.query("ROLLBACK"); } catch { /* Preserve a safe original error. */ }
        if (error instanceof AccountAccessError) throw error;
        throw storageUnavailable();
      } finally { client.release(); }
    },
    async revoke(account: VerifiedAccount, id: unknown): Promise<DeveloperApiKey> {
      const owner = accountOwner(account), namespace = environment();
      if (typeof id !== "string" || !KEY_ID.test(id)) throw new AccountAccessError("invalid_key_id", 400, "Choose a valid API key.");
      await managementQuota(owner);
      const rows = await query(`/* keys:revoke */ UPDATE sajda.developer_api_keys SET revoked_at = COALESCE(revoked_at, statement_timestamp())
        WHERE id = $1::uuid AND owner_id = $2 AND namespace = $3
          AND EXISTS (SELECT 1 FROM public.sajda_auth_user WHERE id = $2 AND "emailVerified" = true)
        RETURNING ${SELECT_METADATA}`, [id, owner, namespace]);
      if (rows.length !== 1) throw new AccountAccessError("api_key_not_found", 404, "This API key was not found.");
      return metadata(rows[0], owner, namespace);
    },
    async authenticate(token: string, required: readonly ApiKeyScope[] = []): Promise<PersistedApiKeyAuthentication> {
      const parsed = typeof token === "string" ? TOKEN.exec(token) : null;
      if (!parsed) return { status: typeof token === "string" && token.startsWith("sj_") ? "invalid" : "not_applicable" };
      try {
        const namespace = environment();
        if (parsed[1] !== (namespace === "production" ? "live" : "test")) return { status: "invalid" };
        const rows = await query(`/* keys:authenticate */ SELECT k.id::text, k.owner_id, k.namespace, k.secret_hash, k.scopes,
          k.expires_at, k.revoked_at, u."emailVerified" AS verified, statement_timestamp() AS checked_at
          FROM sajda.developer_api_keys k JOIN public.sajda_auth_user u ON u.id = k.owner_id
          WHERE k.lookup_id = $1 AND k.namespace = $2 AND k.revoked_at IS NULL
            AND k.expires_at > statement_timestamp() AND u."emailVerified" = true LIMIT 1`, [parsed[2], namespace]);
        const row = rows[0];
        if (rows.length !== 1 || !row || row.namespace !== namespace || !validOwner(row.owner_id)
          || typeof row.id !== "string" || !KEY_ID.test(row.id) || row.verified !== true || row.revoked_at != null
          || Date.parse(iso(row.expires_at)) <= Date.parse(iso(row.checked_at))
          || typeof row.secret_hash !== "string" || !/^[a-f0-9]{64}$/u.test(row.secret_hash)) return { status: "invalid" };
        if (!timingSafeEqual(createHash("sha256").update(token).digest(), Buffer.from(row.secret_hash, "hex"))) return { status: "invalid" };
        const principal: ApiKeyPrincipal = { userId: row.owner_id, keyId: row.id, environment: namespace, scopes: scopes(row.scopes) };
        try { assertApiKeyScopes(principal, required); } catch { return { status: "insufficient_scope" }; }
        // Conditional update closes revocation/expiry during verification.
        const touched = await query(`/* keys:touch */ UPDATE sajda.developer_api_keys SET last_used_at = statement_timestamp()
          WHERE id = $1::uuid AND owner_id = $2 AND namespace = $3 AND secret_hash = $4
            AND revoked_at IS NULL AND expires_at > statement_timestamp()
            AND EXISTS (SELECT 1 FROM public.sajda_auth_user WHERE id = $2 AND "emailVerified" = true)
          RETURNING id::text`, [principal.keyId, principal.userId, namespace, row.secret_hash]);
        if (touched[0]?.id !== principal.keyId) return { status: "invalid" };
        const clientId = apiKeyEngineClientId(principal);
        return { status: "authenticated", principal, clientId };
      } catch { return { status: "unavailable" }; }
    },
    consumeApiKeyQuota(principal: ApiKeyPrincipal, bucket: "requests" | "domains" = "requests") { return consumeQuota(principal.userId, bucket, principal.environment); },
    consumeLegacyDomainsQuota(id: string) { return consumeQuota(id, "domains", environment(), true); },
  };
}
const runtimeService = createDeveloperApiKeyService();
export const authenticatePersistedApiKey = runtimeService.authenticate;
export const consumeApiKeyQuota = runtimeService.consumeApiKeyQuota;
export const consumeLegacyDomainsQuota = runtimeService.consumeLegacyDomainsQuota;

/** Static operator keys and caller owner claims never enter this boundary. */
export async function requireApiKey(headers: AccountHeaders, required: readonly ApiKeyScope[] = []): Promise<ApiKeyPrincipal> {
  const entries = Object.entries(headers).filter(([name]) => name.toLowerCase() === "authorization");
  const authorization = entries.length === 1 ? entries[0][1] : undefined;
  if (typeof authorization !== "string" || !/^Bearer [^\s,]+$/u.test(authorization) || authorization.length > 256) throw new AccountAccessError("invalid_api_key", 401, "A valid Sajda API key is required.");
  const result = await authenticatePersistedApiKey(authorization.slice(7), required);
  if (result.status === "authenticated") return result.principal;
  if (result.status === "unavailable") throw storageUnavailable();
  if (result.status === "insufficient_scope") throw new AccountAccessError("insufficient_scope", 403, "This API key does not have the required permission.");
  throw new AccountAccessError("invalid_api_key", 401, "A valid Sajda API key is required.");
}
