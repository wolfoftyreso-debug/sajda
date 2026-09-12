import { createHash } from "node:crypto";
import { Pool } from "pg";
import { tradingScenarioInputSchema, tradingScenarioSchema, type TradingScenario, type TradingScenarioInput } from "../../shared/trading-scenarios.js";
import { AccountAccessError } from "./account-error.js";

export interface TradingScenariosClient {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  release(destroy?: boolean): void;
}
export interface TradingScenariosPool { connect(): Promise<TradingScenariosClient> }
export const MAX_TRADING_SCENARIOS = 100;
const unavailable = () => new AccountAccessError("trading_scenarios_unavailable", 503,
  "Your scenario journal is temporarily unavailable. A save may have completed; retry the same save before making more changes.");
const conflict = () => new AccountAccessError("scenario_conflict", 409,
  "This scenario changed in another session. Reload your journal before saving again.");
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
let runtimePool: Pool | undefined;
let runtimeUrl: string | undefined;
function poolFor(connectionString: string): TradingScenariosPool {
  if (runtimePool && runtimeUrl === connectionString) return runtimePool;
  const url = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw unavailable();
  // Preserve authenticated TLS, including on pooled Neon/Vercel connections.
  url.searchParams.set("sslmode", "verify-full"); url.searchParams.delete("options");
  if (runtimePool) void runtimePool.end().catch(() => undefined);
  runtimePool = new Pool({ connectionString: url.toString(), max: 2, connectionTimeoutMillis: 3000,
    query_timeout: 5000, idleTimeoutMillis: 10000, allowExitOnIdle: true });
  runtimePool.on("error", () => console.error(JSON.stringify({ event: "trading_scenarios_database_failed" })));
  runtimeUrl = connectionString;
  return runtimePool;
}
function checkedOwner(value: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 200) {
    throw new AccountAccessError("invalid_session", 401, "Sign in to your Sajda account again.");
  }
  return value;
}
function instant(value: unknown): string {
  const date = value instanceof Date ? value : typeof value === "string" ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) throw unavailable();
  return date.toISOString();
}
const columns = "namespace, owner_id, id::text, payload, version, last_input_hash, created_at, updated_at";
function parsedRow(row: Record<string, unknown>, owner: string, namespace: string): TradingScenario {
  if (row.owner_id !== owner || row.namespace !== namespace || typeof row.payload !== "object" || row.payload === null
    || Array.isArray(row.payload) || typeof row.last_input_hash !== "string" || !/^[a-f0-9]{64}$/u.test(row.last_input_hash)) throw unavailable();
  const createdAt = instant(row.created_at), updatedAt = instant(row.updated_at);
  if (updatedAt < createdAt) throw unavailable();
  return tradingScenarioSchema.parse({ ...row.payload, id: row.id, version: row.version, createdAt, updatedAt }) as TradingScenario;
}

/** Hypotheses belong to an account and deployment namespace, never to a browser
 * or client-provided owner. They are not evidence, valuations or order execution. */
export function createTradingScenariosStore(deps: { pool?: TradingScenariosPool; environment?: () => NodeJS.ProcessEnv } = {}) {
  async function transaction<T>(mutate: boolean, run: (client: TradingScenariosClient, namespace: string) => Promise<T>): Promise<T> {
    let client: TradingScenariosClient | undefined, destroy = false;
    try {
      const env = deps.environment?.() ?? process.env;
      const namespace = env.VERCEL ? env.VERCEL_ENV : "development";
      if (!namespace || !["development", "preview", "production"].includes(namespace) || (!deps.pool && !env.DATABASE_URL)) throw unavailable();
      client = await (deps.pool ?? poolFor(env.DATABASE_URL!)).connect();
      await client.query(mutate ? "BEGIN" : "BEGIN READ ONLY");
      await client.query("SET LOCAL lock_timeout='1500ms'; SET LOCAL statement_timeout='4000ms'; SET LOCAL idle_in_transaction_session_timeout='8000ms'");
      const result = await run(client, namespace);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try { await client?.query("ROLLBACK"); } catch { destroy = true; }
      if (error instanceof AccountAccessError) throw error;
      throw unavailable();
    } finally { client?.release(destroy); }
  }
  async function requireTrading(client: TradingScenariosClient, owner: string, namespace: string) {
    const result = await client.query(`/* scenarios:access */
      SELECT u.id AS owner_id, EXISTS (
        SELECT 1 FROM sajda.lost_domain_effective_access a
        WHERE a.owner_id=$1 AND a.namespace=$2 AND a.revoked_at IS NULL
          AND a.valid_from<=statement_timestamp() AND a.expires_at>statement_timestamp()
      ) AS allowed FROM public.sajda_auth_user u WHERE u.id=$1 AND u."emailVerified"=true`, [owner, namespace]);
    if (result.rows.length !== 1 || result.rows[0].owner_id !== owner || result.rows[0].allowed !== true) {
      throw new AccountAccessError("trading_required", 403, "An active Trading account is required for the scenario journal.");
    }
  }
  async function list(client: TradingScenariosClient, owner: string, namespace: string): Promise<TradingScenario[]> {
    const result = await client.query(`/* scenarios:list */ SELECT ${columns} FROM sajda.trading_scenarios
      WHERE owner_id=$1 AND namespace=$2 ORDER BY updated_at DESC, id DESC LIMIT $3`, [owner, namespace, MAX_TRADING_SCENARIOS]);
    if (result.rows.length > MAX_TRADING_SCENARIOS) throw unavailable();
    const parsed = result.rows.map(row => parsedRow(row, owner, namespace));
    if (new Set(parsed.map(row => row.id)).size !== parsed.length) throw unavailable();
    return parsed;
  }
  return {
    async limit(ownerId: string): Promise<void> {
      const owner = checkedOwner(ownerId);
      await transaction(true, async (client, namespace) => {
        const subject = hash(`trading-scenarios:${namespace}:${owner}`);
        const result = await client.query(`/* scenarios:limit */
          INSERT INTO sajda.function_rate_limits(scope, subject_hash, window_started_at, request_count)
          VALUES ('trading-scenarios', $1, date_trunc('minute', statement_timestamp()), 1)
          ON CONFLICT(scope, subject_hash, window_started_at) DO UPDATE SET
            request_count=LEAST(sajda.function_rate_limits.request_count+1, 61), updated_at=statement_timestamp()
          RETURNING request_count`, [subject]);
        const count = Number(result.rows[0]?.request_count);
        if (!Number.isSafeInteger(count) || count < 1) throw unavailable();
        // Commit the saturated count even when the caller must be denied.
        return count;
      }).then(count => {
        if (count > 60) throw new AccountAccessError("rate_limited", 429, "Too many journal requests. Wait a minute and try again.");
      });
    },
    async read(ownerId: string): Promise<TradingScenario[]> {
      const owner = checkedOwner(ownerId);
      return transaction(false, async (client, namespace) => {
        await requireTrading(client, owner, namespace);
        return list(client, owner, namespace);
      });
    },
    async save(ownerId: string, raw: TradingScenarioInput): Promise<TradingScenario[]> {
      const owner = checkedOwner(ownerId);
      const parsed = tradingScenarioInputSchema.safeParse(raw);
      if (!parsed.success) throw new AccountAccessError("invalid_request", 400, "Enter valid scenario details and assumptions.");
      const input = parsed.data;
      const { expectedVersion, id, ...payload } = input;
      const inputHash = hash(JSON.stringify(input));
      const encoded = JSON.stringify(payload);
      return transaction(true, async (client, namespace) => {
        // All creates/updates for this account share a transaction lock. Thus
        // two tabs cannot each see slot 100 free and both insert slot 101.
        await client.query("/* scenarios:lock */ SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`sajda.scenarios.v1:${namespace}:${owner}`]);
        await requireTrading(client, owner, namespace);
        const current = await client.query(`/* scenarios:current */ SELECT ${columns} FROM sajda.trading_scenarios
          WHERE owner_id=$1 AND namespace=$2 AND id=$3::uuid FOR UPDATE`, [owner, namespace, id]);
        if (current.rows.length > 1) throw unavailable();
        const existing = current.rows[0];
        if (existing) {
          const scenario = parsedRow(existing, owner, namespace);
          if (scenario.version !== expectedVersion) {
            // Only the last identical, committed operation is a valid retry.
            // Older operations never overwrite a newer edit or add a version.
            const normalized = tradingScenarioInputSchema.parse({ ...existing.payload as object, id, expectedVersion });
            if (scenario.version !== expectedVersion + 1 || existing.last_input_hash !== inputHash
              || JSON.stringify(normalized) !== JSON.stringify(input)) throw conflict();
            return list(client, owner, namespace);
          }
          if (expectedVersion >= 2_147_483_646) throw conflict();
          const saved = await client.query(`/* scenarios:update */ UPDATE sajda.trading_scenarios
            SET payload=$4::jsonb, last_input_hash=$5, version=version+1, updated_at=statement_timestamp()
            WHERE owner_id=$1 AND namespace=$2 AND id=$3::uuid AND version=$6
            RETURNING ${columns}`, [owner, namespace, id, encoded, inputHash, expectedVersion]);
          if (saved.rows.length !== 1) throw conflict();
          parsedRow(saved.rows[0], owner, namespace);
        } else {
          if (expectedVersion !== 0) throw conflict();
          const total = await client.query("/* scenarios:count */ SELECT count(*)::integer AS count FROM sajda.trading_scenarios WHERE owner_id=$1 AND namespace=$2", [owner, namespace]);
          const count = total.rows[0]?.count;
          if (!Number.isSafeInteger(count) || Number(count) < 0) throw unavailable();
          if (Number(count) >= MAX_TRADING_SCENARIOS) throw new AccountAccessError("scenario_limit", 409, "Your journal contains 100 scenarios. Edit an existing scenario to continue.");
          const saved = await client.query(`/* scenarios:insert */ INSERT INTO sajda.trading_scenarios
            (namespace, owner_id, id, payload, last_input_hash) VALUES ($2,$1,$3::uuid,$4::jsonb,$5)
            RETURNING ${columns}`, [owner, namespace, id, encoded, inputHash]);
          if (saved.rows.length !== 1) throw unavailable();
          parsedRow(saved.rows[0], owner, namespace);
        }
        // The receipt is read inside the committing transaction, not a later
        // fetch that could fail after a successful save and lose its result.
        return list(client, owner, namespace);
      });
    },
  };
}

export const tradingScenariosStore = createTradingScenariosStore();
