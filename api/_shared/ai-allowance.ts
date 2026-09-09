import { createHmac, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { Pool } from "pg";

type RequestHeaders = Record<string, string | string[] | undefined>;
type AllowanceReason = "allowed" | "disabled" | "not_configured" | "missing_identity"
  | "daily_limit" | "ip_daily_limit" | "ip_minute_limit" | "concurrency_limit" | "storage_unavailable";

export interface AiAllowance {
  allowed: boolean;
  reason: AllowanceReason;
  /** Always call in finally. Counters are not refunded, even on provider failure. */
  release: () => Promise<void>;
}

export interface AiAllowanceClient {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  release(destroy?: boolean): void;
}

export interface AiAllowancePool {
  connect(): Promise<AiAllowanceClient>;
}

interface Configuration {
  connectionString: string;
  namespace: string;
  secret: string;
  dailyLimit: number;
}

const MAX_DAILY_REQUESTS = 100;
const DEFAULT_DAILY_REQUESTS = 50;
const IP_DAILY_REQUESTS = 3;
const MAX_CONCURRENT_REQUESTS = 2;
const LEASE_SECONDS = 20;
const noopRelease = async (): Promise<void> => {};
const denied = (reason: AllowanceReason): AiAllowance => ({ allowed: false, reason, release: noopRelease });

let runtimePool: Pool | undefined;
let runtimeConnection: string | undefined;

function getRuntimePool(connectionString: string): AiAllowancePool {
  if (runtimePool && runtimeConnection === connectionString) return runtimePool;
  // Environment changes normally restart a Vercel instance. If a test/dev
  // process changes its configuration, do not silently use the previous DB.
  if (runtimePool) void runtimePool.end().catch(() => undefined);
  const url = new URL(connectionString);
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") throw new Error("Invalid database configuration");
  url.searchParams.set("sslmode", "verify-full");
  url.searchParams.delete("options"); // Neon transaction pools reject search_path startup options.
  runtimePool = new Pool({
    connectionString: url.toString(), max: 2, connectionTimeoutMillis: 1_500,
    query_timeout: 1_500, idleTimeoutMillis: 10_000, allowExitOnIdle: true,
  });
  runtimePool.on("error", () => {
    console.error(JSON.stringify({ event: "ai_allowance_connection_failed" }));
  });
  runtimeConnection = connectionString;
  return runtimePool;
}

function configuration(environment: NodeJS.ProcessEnv): Configuration | undefined {
  const connectionString = environment.DATABASE_URL?.trim();
  const secret = environment.BETTER_AUTH_SECRET?.trim();
  const stage = environment.VERCEL ? environment.VERCEL_ENV : "development";
  if (!connectionString || !secret || secret.length < 32
    || !["development", "preview", "production"].includes(stage ?? "")) return undefined;
  const rawLimit = environment.SAJDA_AI_DAILY_LIMIT?.trim();
  if (rawLimit && !/^\d{1,6}$/u.test(rawLimit)) return undefined;
  return {
    connectionString, secret,
    // All deployments/tasks in one environment share the same allowance.
    // Never namespace by a request hostname or a rotating deployment URL.
    namespace: `sajda.ai.v1:${stage}`,
    dailyLimit: rawLimit ? Math.min(MAX_DAILY_REQUESTS, Number(rawLimit)) : DEFAULT_DAILY_REQUESTS,
  };
}

function normalizeIp(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 64) return undefined;
  const ip = value.trim();
  const family = isIP(ip);
  if (family === 4) return ip;
  if (family !== 6 || ip.includes("%")) return undefined;
  const canonical = new URL(`http://[${ip}]/`).hostname.slice(1, -1).toLowerCase();
  // IPv4-mapped IPv6 must share the IPv4 caller's budget.
  const mapped = /^::ffff:([a-f0-9]{1,4}):([a-f0-9]{1,4})$/u.exec(canonical);
  if (!mapped) return canonical;
  const high = parseInt(mapped[1], 16);
  const low = parseInt(mapped[2], 16);
  return [high >> 8, high & 255, low >> 8, low & 255].join(".");
}

function callerIp(headers: RequestHeaders, environment: NodeJS.ProcessEnv, remoteAddress?: string): string | undefined {
  if (environment.VERCEL) {
    const matches = Object.entries(headers).filter(([name]) => name.toLowerCase() === "x-vercel-forwarded-for");
    // No x-forwarded-for fallback, arrays, multiple headers, ports or IP chains.
    return matches.length === 1 ? normalizeIp(matches[0][1]) : undefined;
  }
  const address = normalizeIp(remoteAddress);
  return address === "::1" || address?.startsWith("127.") ? address : undefined;
}

function integer(value: unknown): number {
  const result = typeof value === "number" ? value
    : typeof value === "string" && /^\d+$/u.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(result) || result < 0) throw new Error("Invalid allowance state");
  return result;
}

function timestamp(value: unknown): number {
  const result = value instanceof Date ? value.getTime() : typeof value === "string" ? Date.parse(value) : NaN;
  if (!Number.isFinite(result)) throw new Error("Invalid allowance timestamp");
  return result;
}

/** The injectable factory is for isolated tests, not an HTTP-controlled bypass. */
export function createAiAllowanceReserver(dependencies: {
  environment?: () => NodeJS.ProcessEnv;
  pool?: (connectionString: string) => AiAllowancePool;
} = {}) {
  return async function reserve(
    headers: RequestHeaders,
    options: { remoteAddress?: string } = {},
  ): Promise<AiAllowance> {
    const environment = dependencies.environment?.() ?? process.env;
    const configured = configuration(environment);
    if (!configured) return denied("not_configured");
    if (configured.dailyLimit === 0) return denied("disabled");
    const ip = callerIp(headers, environment, options.remoteAddress);
    if (!ip) return denied("missing_identity");
    const identityHash = createHmac("sha256", configured.secret)
      .update(`sajda-ai-ip-v1\0${configured.namespace}\0${ip}`).digest("hex");
    const namespace = configured.namespace;
    const leaseId = randomUUID();
    let pool: AiAllowancePool;
    let client: AiAllowanceClient | undefined;
    let destroy = false;
    try {
      pool = (dependencies.pool ?? getRuntimePool)(configured.connectionString);
      client = await pool.connect();
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout = '750ms'; SET LOCAL statement_timeout = '1500ms'; SET LOCAL idle_in_transaction_session_timeout = '3000ms'");
      // Transaction-scoped, environment-wide lock makes all counter/lease
      // decisions atomic across instances, routes and simultaneous requests.
      await client.query("/* ai:lock */ SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [namespace]);
      const clock = await client.query("/* ai:clock */ WITH instant AS (SELECT clock_timestamp() AS now) SELECT now, to_char(now AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day FROM instant");
      const now = timestamp(clock.rows[0]?.now);
      const day = clock.rows[0]?.day;
      if (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(day)) throw new Error("Invalid allowance day");
      const instant = new Date(now).toISOString();
      await client.query(`/* ai:cleanup */
        WITH old_counters AS (
          DELETE FROM public.sajda_ai_allowance_counters WHERE ctid IN (
            SELECT ctid FROM public.sajda_ai_allowance_counters
            WHERE namespace = $1 AND usage_day < $2::date - 2 ORDER BY usage_day LIMIT 100
          ) RETURNING 1
        )
        DELETE FROM public.sajda_ai_allowance_leases WHERE ctid IN (
          SELECT ctid FROM public.sajda_ai_allowance_leases
          WHERE namespace = $1 AND expires_at <= $3::timestamptz ORDER BY expires_at LIMIT 100
        )`, [namespace, day, instant]);
      const counters = await client.query(`/* ai:counters */
        SELECT identity_hash, request_count, last_request_at, usage_day::text AS day
        FROM public.sajda_ai_allowance_counters
        WHERE namespace = $1 AND usage_day BETWEEN $2::date - 1 AND $2::date
          AND identity_hash IN ('global', $3)`, [namespace, day, identityHash]);
      const today = (identity: string) => counters.rows.find(row => row.day === day && row.identity_hash === identity);
      const globalCount = integer(today("global")?.request_count ?? 0);
      const ipCount = integer(today(identityHash)?.request_count ?? 0);
      // Include yesterday so the rolling minute cannot be bypassed at midnight.
      const recentIpRows = counters.rows.filter(row => row.identity_hash === identityHash);
      const lastRequest = recentIpRows.length ? Math.max(...recentIpRows.map(row => timestamp(row.last_request_at))) : -Infinity;
      let reason: AllowanceReason | undefined;
      if (globalCount >= configured.dailyLimit) reason = "daily_limit";
      else if (ipCount >= IP_DAILY_REQUESTS) reason = "ip_daily_limit";
      else if (now - lastRequest < 60_000) reason = "ip_minute_limit";
      else {
        const leases = await client.query("/* ai:active */ SELECT count(*)::integer AS active FROM public.sajda_ai_allowance_leases WHERE namespace = $1 AND expires_at > $2::timestamptz", [namespace, instant]);
        if (integer(leases.rows[0]?.active) >= MAX_CONCURRENT_REQUESTS) reason = "concurrency_limit";
      }
      if (reason) {
        await client.query("ROLLBACK");
        return denied(reason);
      }
      await client.query(`/* ai:consume */
        INSERT INTO public.sajda_ai_allowance_counters (namespace, usage_day, identity_hash, request_count, last_request_at)
        VALUES ($1, $2::date, 'global', 1, $4::timestamptz), ($1, $2::date, $3, 1, $4::timestamptz)
        ON CONFLICT (namespace, usage_day, identity_hash) DO UPDATE
        SET request_count = public.sajda_ai_allowance_counters.request_count + 1,
            last_request_at = EXCLUDED.last_request_at`, [namespace, day, identityHash, instant]);
      // Start the lease at insertion, not the earlier accounting clock: slow
      // counter/cleanup queries must not consume the provider's lease window.
      await client.query("/* ai:lease */ INSERT INTO public.sajda_ai_allowance_leases (namespace, lease_id, expires_at) VALUES ($1, $2::uuid, clock_timestamp() + interval '20 seconds')", [namespace, leaseId]);
      await client.query("COMMIT");
      let released = false;
      return {
        allowed: true, reason: "allowed",
        release: async () => {
          if (released) return;
          released = true;
          let releaseClient: AiAllowanceClient | undefined;
          let discard = false;
          try {
            releaseClient = await pool.connect();
            await releaseClient.query("/* ai:release */ DELETE FROM public.sajda_ai_allowance_leases WHERE namespace = $1 AND lease_id = $2::uuid", [namespace, leaseId]);
          } catch {
            // A failed release never refunds spend. Its short database lease
            // expires automatically; no raw database errors enter logs/UI.
            discard = true;
          } finally {
            releaseClient?.release(discard);
          }
        },
      };
    } catch {
      // Destroy an uncertain/failed transaction's connection: Postgres rolls
      // it back. If COMMIT already succeeded, the consumed quota stays spent.
      destroy = true;
      return denied("storage_unavailable");
    } finally {
      client?.release(destroy);
    }
  };
}

/** All paid AI tasks share this durable allowance. Missing DB never falls back. */
export const reserveAiAllowance = createAiAllowanceReserver();

/** Provider deadlines must remain shorter than the lease; no renewal is offered. */
export const AI_ALLOWANCE_LEASE_MS = LEASE_SECONDS * 1_000;
