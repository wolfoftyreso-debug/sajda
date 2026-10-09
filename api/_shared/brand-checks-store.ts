import { createHash } from "node:crypto";
import { Pool } from "pg";
import { z } from "zod/v4";
import { brandIndexInputSchema } from "../../shared/brand-presence-index.js";
import { createBrandEvidenceReport, type BrandEvidenceEntry } from "../../shared/brand-evidence.js";
import { BRAND_CHECK_DAILY_LIMIT, BRAND_CHECK_DOMAIN_LIMIT, BRAND_CHECK_METHODOLOGY_VERSION, BRAND_CHECK_RUN_LIMIT,
  brandCheckEntrySchema, brandCheckRunSchema, brandChecksHistorySelectorSchema, brandChecksStartSchema,
  type BrandCheckRun, type BrandChecksHistorySelector, type BrandChecksStartInput } from "../../shared/brand-checks.js";
import { AccountAccessError } from "./account-error.js";
import { checkBrandReportDomains } from "./brand-registry-check.js";
import type { BrandReportsClient, BrandReportsPool } from "./brand-reports-store.js";

const unavailable = () => new AccountAccessError("brand_checks_unavailable", 503,
  "Registry check status is temporarily unavailable. The check may have started; retry the same request before starting another.");
const notFound = () => new AccountAccessError("report_not_found", 404, "This saved report is not available in your account.");
const invalid = () => new AccountAccessError("invalid_request", 400, "Use a saved report ID, its latest version and one check request identifier.");
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
let pool: Pool | undefined, poolUrl: string | undefined;
function runtimePool(connection: string): BrandReportsPool {
  if (pool && poolUrl === connection) return pool;
  const url = new URL(connection);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw unavailable();
  url.searchParams.set("sslmode", "verify-full"); url.searchParams.delete("options");
  if (pool) void pool.end().catch(() => undefined);
  pool = new Pool({ connectionString: url.toString(), max: 2, connectionTimeoutMillis: 3000,
    query_timeout: 5000, idleTimeoutMillis: 10000, allowExitOnIdle: true });
  pool.on("error", () => console.error(JSON.stringify({ event: "brand_checks_database_failed" })));
  poolUrl = connection; return pool;
}
function ownerId(value: string): string {
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
const columns = `r.namespace,r.owner_id,r.id::text,r.report_id::text,r.report_version,r.input_hash,r.targets,
  r.status,r.requested_at,r.lease_expires_at,r.completed_at,r.methodology_version,r.entries,r.failure_code,v.assessment`;
const versionJoin = `JOIN sajda.brand_report_versions v ON v.namespace=r.namespace AND v.owner_id=r.owner_id
  AND v.report_id=r.report_id AND v.version=r.report_version`;
function savedTargets(assessment: unknown): string[] {
  const targets = [...brandIndexInputSchema.parse(assessment).domains].sort();
  if (!targets.length || targets.length > BRAND_CHECK_DOMAIN_LIMIT || new Set(targets).size !== targets.length) throw unavailable();
  return targets;
}
function scopeEntries(raw: unknown, targets: readonly string[], now: number): BrandEvidenceEntry[] {
  const entries = z.array(brandCheckEntrySchema).length(targets.length).parse(raw);
  if (JSON.stringify(entries.map(entry => entry.target).sort()) !== JSON.stringify(targets)) throw new Error("invalid_registry_targets");
  return createBrandEvidenceReport(entries, now).entries;
}
function runFromRow(row: Record<string, unknown>, owner: string, namespace: string, now: number): BrandCheckRun {
  if (row.owner_id !== owner || row.namespace !== namespace) throw unavailable();
  const targets = savedTargets(row.assessment);
  if (JSON.stringify(row.targets) !== JSON.stringify(targets)) throw unavailable();
  const status = row.status;
  // Result age is evaluated now, but original provider dates and URLs are never renewed.
  const entries = status === "completed" ? scopeEntries(row.entries, targets, now) : row.entries;
  return brandCheckRunSchema.parse({ id: row.id, reportId: row.report_id, reportVersion: row.report_version,
    status, requestedAt: instant(row.requested_at), completedAt: row.completed_at === null ? null : instant(row.completed_at),
    methodologyVersion: row.methodology_version, entries, failureCode: row.failure_code });
}

export function createBrandChecksStore(deps: {
  pool?: BrandReportsPool; environment?: () => NodeJS.ProcessEnv; now?: () => number;
  checker?: (domains: readonly string[]) => Promise<BrandEvidenceEntry[]>;
} = {}) {
  const now = () => deps.now?.() ?? Date.now();
  async function transaction<T>(run: (client: BrandReportsClient, namespace: string) => Promise<T>): Promise<T> {
    let client: BrandReportsClient | undefined, destroy = false;
    try {
      const env = deps.environment?.() ?? process.env, namespace = env.VERCEL ? env.VERCEL_ENV : "development";
      if (!namespace || !["development", "preview", "production"].includes(namespace) || !deps.pool && !env.DATABASE_URL) throw unavailable();
      client = await (deps.pool ?? runtimePool(env.DATABASE_URL!)).connect();
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout='1500ms'; SET LOCAL statement_timeout='4000ms'; SET LOCAL idle_in_transaction_session_timeout='8000ms'");
      const value = await run(client, namespace); await client.query("COMMIT"); return value;
    } catch (error) {
      try { await client?.query("ROLLBACK"); } catch { destroy = true; }
      if (error instanceof AccountAccessError) throw error;
      throw unavailable();
    } finally { client?.release(destroy); }
  }
  async function lockOwner(client: BrandReportsClient, owner: string, namespace: string) {
    // Share the report writer's lock: reservation compares the latest version atomically.
    await client.query("/* brand-checks:lock */ SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`sajda.brand-reports.v1:${namespace}:${owner}`]);
    const result = await client.query(`/* brand-checks:owner */ SELECT id AS owner_id FROM public.sajda_auth_user
      WHERE id=$1 AND "emailVerified"=true FOR KEY SHARE`, [owner]);
    if (result.rows.length !== 1 || result.rows[0].owner_id !== owner) {
      throw new AccountAccessError("invalid_session", 401, "Sign in with your verified Sajda account again.");
    }
  }
  async function report(client: BrandReportsClient, owner: string, namespace: string, id: string, version?: number) {
    const result = await client.query(`/* brand-checks:report */ SELECT p.namespace,p.owner_id,p.id::text,p.version,v.version AS saved_version,v.assessment
      FROM sajda.brand_reports p JOIN sajda.brand_report_versions v ON v.namespace=p.namespace AND v.owner_id=p.owner_id AND v.report_id=p.id
      WHERE p.owner_id=$1 AND p.namespace=$2 AND p.id=$3::uuid AND v.version=COALESCE($4::integer,p.version)`, [owner, namespace, id, version ?? null]);
    if (!result.rows.length) throw notFound();
    const row = result.rows[0];
    if (result.rows.length !== 1 || row.owner_id !== owner || row.namespace !== namespace || row.id !== id) throw unavailable();
    return row;
  }
  async function expire(client: BrandReportsClient, owner: string, namespace: string, reportId: string) {
    // Materialize interruption only; GET never executes a provider or changes observation dates.
    await client.query(`/* brand-checks:expire */ UPDATE sajda.brand_check_runs SET status='failed',
      completed_at=lease_expires_at,failure_code='check_interrupted'
      WHERE owner_id=$1 AND namespace=$2 AND report_id=$3::uuid AND status='pending' AND lease_expires_at<=statement_timestamp()`, [owner, namespace, reportId]);
  }
  async function receipt(client: BrandReportsClient, owner: string, namespace: string, id: string) {
    const result = await client.query(`/* brand-checks:receipt */ SELECT ${columns} FROM sajda.brand_check_runs r ${versionJoin}
      WHERE r.owner_id=$1 AND r.namespace=$2 AND r.id=$3::uuid`, [owner, namespace, id]);
    if (result.rows.length > 1) throw unavailable();
    return result.rows[0] ?? null;
  }
  return {
    async limit(rawOwner: string): Promise<void> {
      const owner = ownerId(rawOwner);
      const count = await transaction(async (client, namespace) => {
        const result = await client.query(`/* brand-checks:limit */ INSERT INTO sajda.function_rate_limits(scope,subject_hash,window_started_at,request_count)
          VALUES('brand-checks',$1,date_trunc('minute',statement_timestamp()),1)
          ON CONFLICT(scope,subject_hash,window_started_at) DO UPDATE SET
            request_count=LEAST(sajda.function_rate_limits.request_count+1,61),updated_at=statement_timestamp() RETURNING request_count`,
        [hash(`brand-checks:${namespace}:${owner}`)]);
        const value = Number(result.rows[0]?.request_count);
        if (!Number.isSafeInteger(value) || value < 1) throw unavailable(); return value;
      });
      if (count > 60) throw new AccountAccessError("rate_limited", 429, "Too many check-status requests. Wait a minute and retry.");
    },
    async history(rawOwner: string, raw: BrandChecksHistorySelector) {
      const owner = ownerId(rawOwner), parsed = brandChecksHistorySelectorSchema.safeParse(raw);
      if (!parsed.success) throw invalid(); const input = parsed.data;
      return transaction(async (client, namespace) => {
        await lockOwner(client, owner, namespace); await report(client, owner, namespace, input.reportId, input.version);
        await expire(client, owner, namespace, input.reportId);
        const totalRows = await client.query(`/* brand-checks:history-count */ SELECT count(*)::integer AS total FROM sajda.brand_check_runs
          WHERE owner_id=$1 AND namespace=$2 AND report_id=$3::uuid AND ($4::integer IS NULL OR report_version=$4)`,
        [owner, namespace, input.reportId, input.version ?? null]);
        const total = totalRows.rows[0]?.total;
        if (!Number.isSafeInteger(total) || Number(total) < 0 || Number(total) > BRAND_CHECK_RUN_LIMIT) throw unavailable();
        const result = await client.query(`/* brand-checks:history */ SELECT ${columns} FROM sajda.brand_check_runs r ${versionJoin}
          WHERE r.owner_id=$1 AND r.namespace=$2 AND r.report_id=$3::uuid AND ($4::integer IS NULL OR r.report_version=$4)
          ORDER BY r.requested_at DESC,r.id DESC OFFSET $5 LIMIT $6`, [owner, namespace, input.reportId, input.version ?? null, input.offset, input.limit]);
        const runs = result.rows.map(row => runFromRow(row, owner, namespace, now()));
        if (runs.length !== Math.min(input.limit, Math.max(0, Number(total) - input.offset))
          || new Set(runs.map(run => run.id)).size !== runs.length) throw unavailable();
        return { runs, total: Number(total), offset: input.offset, limit: input.limit, hasMore: input.offset + runs.length < Number(total) };
      });
    },
    async start(rawOwner: string, raw: BrandChecksStartInput): Promise<BrandCheckRun> {
      const owner = ownerId(rawOwner), parsed = brandChecksStartSchema.safeParse(raw);
      if (!parsed.success) throw invalid(); const input = parsed.data, inputHash = hash(JSON.stringify(input));
      const reservation = await transaction(async (client, namespace) => {
        await lockOwner(client, owner, namespace);
        const original = await receipt(client, owner, namespace, input.requestKey);
        if (original) {
          if (original.input_hash !== inputHash) throw new AccountAccessError("check_request_conflict", 409,
            "This check identifier was used for a different report or version. Reload before starting a new check.");
          await expire(client, owner, namespace, input.reportId);
          const retained = await receipt(client, owner, namespace, input.requestKey);
          if (!retained) throw unavailable();
          return { created: false, namespace, run: runFromRow(retained, owner, namespace, now()), targets: savedTargets(retained.assessment) };
        }
        const saved = await report(client, owner, namespace, input.reportId);
        if (saved.version !== input.expectedVersion) throw new AccountAccessError("report_conflict", 409,
          "This report changed in another session. Load its latest saved version before checking.");
        const targets = savedTargets(saved.assessment); await expire(client, owner, namespace, input.reportId);
        const counters = await client.query(`/* brand-checks:capacity */ SELECT
          count(*) FILTER (WHERE report_id=$3::uuid)::integer AS report_total,
          count(*) FILTER (WHERE report_id=$3::uuid AND status='pending')::integer AS pending,
          count(*) FILTER (WHERE requested_at >= (date_trunc('day',statement_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')
            AND requested_at < (date_trunc('day',statement_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') + interval '1 day')::integer AS daily
          FROM sajda.brand_check_runs WHERE owner_id=$1 AND namespace=$2`, [owner, namespace, input.reportId]);
        const values = counters.rows[0];
        if (!values || ![values.report_total, values.pending, values.daily].every(value => Number.isSafeInteger(value) && Number(value) >= 0)) throw unavailable();
        if (Number(values.pending) > 0) throw new AccountAccessError("check_pending", 409, "A check of this report is already running. Follow its status instead of starting another.");
        if (Number(values.report_total) >= BRAND_CHECK_RUN_LIMIT) throw new AccountAccessError("check_limit_reached", 409,
          "This report has reached its 100-check history limit. Existing observations are retained.");
        if (Number(values.daily) >= BRAND_CHECK_DAILY_LIMIT) throw new AccountAccessError("check_daily_limit", 429,
          "Your account has used its 10 new checks for today (UTC). Existing check history remains available.");
        const inserted = await client.query(`/* brand-checks:reserve */ INSERT INTO sajda.brand_check_runs
          (namespace,owner_id,id,report_id,report_version,input_hash,targets,methodology_version)
          VALUES($2,$1,$3::uuid,$4::uuid,$5,$6,$7::jsonb,$8) RETURNING id::text`,
        [owner, namespace, input.requestKey, input.reportId, input.expectedVersion, inputHash, JSON.stringify(targets), BRAND_CHECK_METHODOLOGY_VERSION]);
        if (inserted.rows.length !== 1 || inserted.rows[0].id !== input.requestKey) throw unavailable();
        const row = await receipt(client, owner, namespace, input.requestKey); if (!row) throw unavailable();
        return { created: true, namespace, run: runFromRow(row, owner, namespace, now()), targets };
      });
      if (!reservation.created) return reservation.run;
      // Only the invocation that received a confirmed reservation COMMIT may call
      // the provider. Ambiguous commits and retries never restart external work.
      let entries: BrandEvidenceEntry[] = [], failureCode: BrandCheckRun["failureCode"] = null;
      try {
        const observed = await (deps.checker ?? checkBrandReportDomains)(Object.freeze([...reservation.targets]));
        try { entries = scopeEntries(observed, reservation.targets, now()); }
        catch { failureCode = "invalid_evidence"; }
      } catch { failureCode = "provider_unavailable"; }
      return transaction(async (client, namespace) => {
        if (namespace !== reservation.namespace) throw unavailable();
        await lockOwner(client, owner, namespace); await expire(client, owner, namespace, input.reportId);
        const retained = await receipt(client, owner, namespace, input.requestKey); if (!retained) throw notFound();
        if (retained.input_hash !== inputHash) throw unavailable();
        const current = runFromRow(retained, owner, namespace, now());
        if (current.status !== "pending") return current;
        const result = await client.query(`/* brand-checks:complete */ UPDATE sajda.brand_check_runs
          SET status=$6,completed_at=statement_timestamp(),entries=$7::jsonb,failure_code=$8
          WHERE owner_id=$1 AND namespace=$2 AND id=$3::uuid AND report_id=$4::uuid AND report_version=$5
            AND input_hash=$9 AND status='pending' AND lease_expires_at>statement_timestamp() RETURNING id::text`,
        [owner, namespace, input.requestKey, input.reportId, input.expectedVersion, failureCode ? "failed" : "completed",
          JSON.stringify(failureCode ? [] : entries), failureCode, inputHash]);
        if (result.rows.length !== 1 || result.rows[0].id !== input.requestKey) {
          await expire(client, owner, namespace, input.reportId);
        }
        const completed = await receipt(client, owner, namespace, input.requestKey); if (!completed) throw notFound();
        return runFromRow(completed, owner, namespace, now());
      });
    },
  };
}
export const brandChecksStore = createBrandChecksStore();
