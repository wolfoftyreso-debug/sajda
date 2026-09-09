import { createHmac, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { Pool } from "pg";

type Headers = Record<string, string | string[] | undefined>;
export interface ContactGuardClient {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  release(destroy?: boolean): void;
}
export interface ContactGuardPool { connect(): Promise<ContactGuardClient> }
export type ContactReservation =
  | { kind: "send"; finish(accepted: boolean): Promise<boolean> }
  | { kind: "accepted" | "conflict" | "expired" | "unavailable" }
  | { kind: "in_progress" | "rate_limited"; retryAfterSeconds: number };

let runtimePool: Pool | undefined;
let runtimeConnection: string | undefined;
function getPool(connectionString: string): ContactGuardPool {
  if (runtimePool && runtimeConnection === connectionString) return runtimePool;
  if (runtimePool) void runtimePool.end().catch(() => undefined);
  const url = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("Invalid database configuration");
  url.searchParams.set("sslmode", "verify-full");
  url.searchParams.delete("options");
  runtimePool = new Pool({ connectionString: url.toString(), max: 2, connectionTimeoutMillis: 1_500,
    query_timeout: 1_500, idleTimeoutMillis: 10_000, allowExitOnIdle: true });
  runtimePool.on("error", () => console.error(JSON.stringify({ event: "contact_database_connection_failed" })));
  runtimeConnection = connectionString;
  return runtimePool;
}

function normalizedIp(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 64) return undefined;
  const ip = value.trim();
  if (isIP(ip) === 4) return ip;
  if (isIP(ip) !== 6 || ip.includes("%")) return undefined;
  const canonical = new URL(`http://[${ip}]/`).hostname.slice(1, -1).toLowerCase();
  const mapped = /^::ffff:([a-f0-9]{1,4}):([a-f0-9]{1,4})$/u.exec(canonical);
  if (!mapped) return canonical;
  const high = parseInt(mapped[1], 16), low = parseInt(mapped[2], 16);
  return [high >> 8, high & 255, low >> 8, low & 255].join(".");
}

function trustedIdentity(headers: Headers, env: NodeJS.ProcessEnv, remoteAddress?: string): string | undefined {
  if (env.VERCEL) {
    const entries = Object.entries(headers).filter(([key]) => key.toLowerCase() === "x-vercel-forwarded-for");
    return entries.length === 1 ? normalizedIp(entries[0][1]) : undefined;
  }
  const ip = normalizedIp(remoteAddress);
  return ip === "::1" || ip?.startsWith("127.") ? ip : undefined;
}

function milliseconds(value: unknown): number {
  const number = value instanceof Date ? value.getTime() : typeof value === "string" ? Date.parse(value) : NaN;
  if (!Number.isFinite(number)) throw new Error("Invalid contact timestamp");
  return number;
}
function count(value: unknown): number {
  const number = typeof value === "number" ? value : typeof value === "string" && /^\d+$/u.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(number) || number < 0) throw new Error("Invalid contact counter");
  return number;
}

/** All contact instances share one atomic limiter, never AI quota or in-memory fallback. */
export function createContactReserver(deps: {
  environment?: () => NodeJS.ProcessEnv;
  pool?: (connectionString: string) => ContactGuardPool;
} = {}) {
  return async (submission: { id: string; canonicalBody: string }, headers: Headers, remoteAddress?: string): Promise<ContactReservation> => {
    const env = deps.environment?.() ?? process.env;
    const databaseUrl = env.DATABASE_URL?.trim(), secret = env.BETTER_AUTH_SECRET?.trim();
    const stage = env.VERCEL ? env.VERCEL_ENV : "development";
    if (!databaseUrl || !secret || secret.length < 32 || !["development", "preview", "production"].includes(stage ?? "")
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(submission.id)
      || Buffer.byteLength(submission.canonicalBody, "utf8") > 24_576) return { kind: "unavailable" };
    const ip = trustedIdentity(headers, env, remoteAddress);
    if (!ip) return { kind: "unavailable" };
    const namespace = `sajda.contact.v1:${stage}`;
    const hash = (purpose: string, value: string) => createHmac("sha256", secret).update(`${namespace}\0${purpose}\0${value}`).digest("hex");
    const payloadHash = hash("payload", submission.canonicalBody), identityHash = hash("ip", ip);
    const id = submission.id.toLowerCase(), lease = randomUUID();
    let client: ContactGuardClient | undefined;
    let destroy = false;
    try {
      const pool = (deps.pool ?? getPool)(databaseUrl);
      client = await pool.connect();
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout = '750ms'; SET LOCAL statement_timeout = '1500ms'; SET LOCAL idle_in_transaction_session_timeout = '3000ms'");
      await client.query("/* contact:lock */ SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [namespace]);
      const clock = await client.query("/* contact:clock */ SELECT clock_timestamp() AS now");
      const now = milliseconds(clock.rows[0]?.now), instant = new Date(now).toISOString();
      await client.query(`/* contact:cleanup */ DELETE FROM public.sajda_contact_submissions WHERE ctid IN (
        SELECT ctid FROM public.sajda_contact_submissions WHERE namespace = $1
        AND created_at < $2::timestamptz - interval '30 days' ORDER BY created_at LIMIT 100
      )`, [namespace, instant]);
      const previous = await client.query(`/* contact:existing */ SELECT submission_id::text, payload_hash, identity_hash,
        status, attempts, created_at, last_attempt_at, lease_until FROM public.sajda_contact_submissions
        WHERE namespace = $1 AND submission_id = $2::uuid`, [namespace, id]);
      const existing = previous.rows[0];
      const deny = async (result: ContactReservation) => { await client!.query("ROLLBACK"); return result; };
      if (existing) {
        if (existing.payload_hash !== payloadHash) return await deny({ kind: "conflict" });
        if (existing.status === "accepted") return await deny({ kind: "accepted" });
        if (existing.status !== "pending") throw new Error("Invalid contact state");
        // Resend idempotency lasts 24h. Never retry near/after that boundary.
        if (now - milliseconds(existing.created_at) >= 23 * 3_600_000 || count(existing.attempts) >= 3) return await deny({ kind: "expired" });
        if (existing.lease_until && milliseconds(existing.lease_until) > now) return await deny({ kind: "in_progress", retryAfterSeconds: 60 });
      }
      // Retry of an identical message can survive a mobile IP change, but it
      // remains charged to the original identity instead of resetting limits.
      const quotaIdentity = existing?.identity_hash ?? identityHash;
      if (typeof quotaIdentity !== "string" || !/^[a-f0-9]{64}$/u.test(quotaIdentity)) throw new Error("Invalid contact identity");
      const usage = await client.query(`/* contact:usage */ SELECT
        COALESCE(sum(attempts), 0)::integer AS global_count,
        COALESCE(sum(attempts) FILTER (WHERE identity_hash = $2), 0)::integer AS ip_count,
        max(last_attempt_at) FILTER (WHERE identity_hash = $2) AS last_ip_attempt,
        count(*) FILTER (WHERE status = 'pending' AND lease_until > $3::timestamptz)::integer AS active
        FROM public.sajda_contact_submissions WHERE namespace = $1
        AND last_attempt_at >= $3::timestamptz - interval '24 hours'`, [namespace, quotaIdentity, instant]);
      const state = usage.rows[0];
      if (count(state?.global_count) >= 50 || count(state?.ip_count) >= 3) return await deny({ kind: "rate_limited", retryAfterSeconds: 86_400 });
      if (state.last_ip_attempt && now - milliseconds(state.last_ip_attempt) < 60_000) return await deny({ kind: "rate_limited", retryAfterSeconds: 60 });
      if (count(state.active) >= 2) return await deny({ kind: "in_progress", retryAfterSeconds: 30 });
      await client.query(`/* contact:reserve */ INSERT INTO public.sajda_contact_submissions
        (namespace, submission_id, payload_hash, identity_hash, status, attempts, created_at, last_attempt_at, lease_token, lease_until)
        VALUES ($1, $2::uuid, $3, $4, 'pending', 1, $5::timestamptz, $5::timestamptz, $6::uuid, clock_timestamp() + interval '30 seconds')
        ON CONFLICT (namespace, submission_id) DO UPDATE SET
          attempts = public.sajda_contact_submissions.attempts + 1,
          last_attempt_at = EXCLUDED.last_attempt_at, lease_token = EXCLUDED.lease_token, lease_until = EXCLUDED.lease_until`,
      [namespace, id, payloadHash, identityHash, instant, lease]);
      await client.query("COMMIT");
      let finished = false;
      return { kind: "send", finish: async (accepted) => {
        if (finished) return false;
        finished = true;
        let completion: ContactGuardClient | undefined;
        let discard = false;
        try {
          completion = await pool.connect();
          const result = await completion.query(`/* contact:finish */ UPDATE public.sajda_contact_submissions
            SET status = CASE WHEN $4::boolean THEN 'accepted' ELSE 'pending' END,
                accepted_at = CASE WHEN $4::boolean THEN clock_timestamp() ELSE NULL END,
                lease_token = NULL, lease_until = NULL
            WHERE namespace = $1 AND submission_id = $2::uuid AND lease_token = $3::uuid AND status = 'pending'
            RETURNING submission_id`, [namespace, id, lease, accepted]);
          return result.rows.length === 1;
        } catch { discard = true; return false; }
        finally { completion?.release(discard); }
      } };
    } catch { destroy = true; return { kind: "unavailable" }; }
    finally { client?.release(destroy); }
  };
}

export const reserveContactSubmission = createContactReserver();
