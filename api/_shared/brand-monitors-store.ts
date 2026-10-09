import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { z } from "zod/v4";
import { brandIndexInputSchema } from "../../shared/brand-presence-index.js";
import { createBrandEvidenceReport, brandRegistrySourceUrl, type BrandEvidenceEntry } from "../../shared/brand-evidence.js";
import { brandCheckEntrySchema, type BrandCheckRun } from "../../shared/brand-checks.js";
import { BRAND_MONITOR_ACTIVE_LIMITS, BRAND_MONITOR_INTERVAL_HOURS, BRAND_MONITOR_METHODOLOGY_VERSION,
  BRAND_MONITOR_TICK_LIMIT, brandMonitorAlertSchema, brandMonitorMutationResponseSchema, brandMonitorObservationSchema,
  brandMonitorSchema, brandMonitorsMutationSchema, brandMonitorsSelectorSchema,
  type BrandMonitor, type BrandMonitorsMutationInput, type BrandMonitorsSelector } from "../../shared/brand-monitors.js";
import { createAccountMembershipReader } from "./account-membership.js";
import { AccountAccessError } from "./account-error.js";
import { createBrandChecksStore } from "./brand-checks-store.js";
import type { BrandReportsClient, BrandReportsPool } from "./brand-reports-store.js";

const unavailable = () => new AccountAccessError("brand_monitors_unavailable", 503,
  "Monitor status is temporarily unavailable. A change may have been saved; retry the same request before changing it again.");
const notFound = () => new AccountAccessError("report_not_found", 404, "This saved report is not available in your account.");
const conflict = () => new AccountAccessError("monitor_conflict", 409, "This monitor changed. Reload it before changing its schedule.");
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
type Baseline = Record<string, z.infer<typeof brandMonitorObservationSchema>>;
let runtime: Pool | undefined, runtimeUrl: string | undefined;
function runtimePool(connection: string): BrandReportsPool {
  if (runtime && runtimeUrl === connection) return runtime;
  const url = new URL(connection);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw unavailable();
  url.searchParams.set("sslmode", "verify-full"); url.searchParams.delete("options");
  if (runtime) void runtime.end().catch(() => undefined);
  runtime = new Pool({ connectionString: url.toString(), max: 2, connectionTimeoutMillis: 3000,
    query_timeout: 5000, idleTimeoutMillis: 10000, allowExitOnIdle: true });
  runtime.on("error", () => console.error(JSON.stringify({ event: "brand_monitors_database_failed" })));
  runtimeUrl = connection; return runtime;
}
function ownerId(value: string) {
  if (typeof value !== "string" || !value.trim() || value.length > 200) throw new AccountAccessError("invalid_session", 401, "Sign in to your Sajda account again.");
  return value;
}
function instant(value: unknown): string {
  const at = value instanceof Date ? value : typeof value === "string" ? new Date(value) : null;
  if (!at || !Number.isFinite(at.getTime())) throw unavailable(); return at.toISOString();
}
const nullableInstant = (value: unknown) => value === null ? null : instant(value);
function baselineFrom(value: unknown, targets: readonly string[]): Baseline {
  const baseline = z.record(z.string(), brandMonitorObservationSchema).parse(value);
  for (const [target, observation] of Object.entries(baseline)) {
    if (!targets.includes(target) || brandRegistrySourceUrl(target, observation.sourceUrl, "rdap") !== observation.sourceUrl) throw unavailable();
  }
  return baseline;
}
function monitorFrom(row: Record<string, unknown>, owner: string, namespace: string): BrandMonitor {
  if (row.owner_id !== owner || row.namespace !== namespace) throw unavailable();
  const targets = z.array(z.string()).min(1).max(20).parse(row.targets), baseline = baselineFrom(row.baseline, targets);
  return brandMonitorSchema.parse({ reportId: row.report_id, reportVersion: row.report_version, version: row.version,
    status: row.status, pauseReason: row.pause_reason, targets, createdAt: instant(row.created_at), updatedAt: instant(row.updated_at),
    nextDueAt: nullableInstant(row.next_due_at), lastAttemptAt: nullableInstant(row.last_attempt_at), lastRunId: row.last_run_id,
    lastRunStatus: row.last_run_status, lastFailureCode: row.last_failure_code, lastRunCoverage: row.last_coverage,
    lastSuccessfulAt: nullableInstant(row.last_successful_at), baselineCount: Object.keys(baseline).length,
    methodologyVersion: row.methodology_version });
}
function alertFrom(row: Record<string, unknown>, owner: string, namespace: string) {
  if (row.owner_id !== owner || row.namespace !== namespace) throw unavailable();
  return brandMonitorAlertSchema.parse({ id: row.id, reportId: row.report_id, reportVersion: row.report_version,
    monitorVersion: row.monitor_version, runId: row.run_id, target: row.target, kind: "registration_changed",
    previous: row.previous_observation, current: row.current_observation, createdAt: instant(row.created_at),
    acknowledgedAt: nullableInstant(row.acknowledged_at), methodologyVersion: BRAND_MONITOR_METHODOLOGY_VERSION });
}
const monitorColumns = `namespace,owner_id,report_id::text,report_version,version,status,pause_reason,targets,baseline,
  created_at,updated_at,next_due_at,claim_version,lease_expires_at,last_attempt_at,last_run_id::text,last_run_status,
  last_failure_code,last_coverage,last_successful_at,methodology_version`;
const alertColumns = `namespace,owner_id,id::text,report_id::text,report_version,monitor_version,run_id::text,target,
  previous_observation,current_observation,created_at,acknowledged_at`;

/** Compare immutable original samples at completion time, never the read-time
 * 30-minute freshness of yesterday's sample. Unknown never replaces a baseline. */
export function deriveBrandMonitorChanges(baseline: Baseline, entries: readonly BrandEvidenceEntry[], completedAt: string) {
  const at = Date.parse(completedAt), current = createBrandEvidenceReport(entries, at).entries;
  const next = structuredClone(baseline), changes: { target: string; previous: Baseline[string]; current: Baseline[string] }[] = [];
  let checked = 0;
  for (const entry of current) {
    if (entry.state !== "checked" || entry.observed_at === null || entry.source_url === null
      || !["domain_available", "domain_registered"].includes(entry.statement)
      || brandRegistrySourceUrl(entry.target, entry.source_url, "rdap") !== entry.source_url) continue;
    checked++;
    const observed = brandMonitorObservationSchema.parse({ status: entry.statement === "domain_available" ? "available" : "registered",
      observedAt: entry.observed_at, sourceUrl: entry.source_url });
    const old = next[entry.target];
    if (old && Date.parse(observed.observedAt) <= Date.parse(old.observedAt)) continue;
    if (old && old.sourceUrl === observed.sourceUrl && old.status !== observed.status) changes.push({ target: entry.target, previous: old, current: observed });
    next[entry.target] = observed;
  }
  return { baseline: next, changes, coverage: { total: entries.length, checked, unknown: entries.length - checked } };
}

export function createBrandMonitorsStore(deps: {
  pool?: BrandReportsPool; environment?: () => NodeJS.ProcessEnv;
  checks?: Pick<ReturnType<typeof createBrandChecksStore>, "start">;
} = {}) {
  function context() {
    const env = deps.environment?.() ?? process.env, namespace = env.VERCEL ? env.VERCEL_ENV : "development";
    if (!namespace || !["development", "preview", "production"].includes(namespace) || !deps.pool && !env.DATABASE_URL) throw unavailable();
    return { env: { ...env }, namespace, pool: deps.pool ?? runtimePool(env.DATABASE_URL!) };
  }
  type Context = ReturnType<typeof context>;
  async function transaction<T>(captured: Context, operation: (client: BrandReportsClient) => Promise<T>): Promise<T> {
    let client: BrandReportsClient | undefined, destroy = false;
    try {
      if (context().namespace !== captured.namespace) throw unavailable();
      client = await captured.pool.connect(); await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout='1500ms'; SET LOCAL statement_timeout='4000ms'; SET LOCAL idle_in_transaction_session_timeout='8000ms'");
      const result = await operation(client); await client.query("COMMIT"); return result;
    } catch (error) {
      try { await client?.query("ROLLBACK"); } catch { destroy = true; }
      if (error instanceof AccountAccessError) throw error; throw unavailable();
    } finally { client?.release(destroy); }
  }
  async function lockOwner(client: BrandReportsClient, captured: Context, owner: string) {
    await client.query("/* brand-monitors:lock */ SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`sajda.brand-reports.v1:${captured.namespace}:${owner}`]);
    const result = await client.query(`/* brand-monitors:owner */ SELECT id AS owner_id FROM public.sajda_auth_user
      WHERE id=$1 AND "emailVerified"=true FOR KEY SHARE`, [owner]);
    if (result.rows.length !== 1 || result.rows[0].owner_id !== owner) throw new AccountAccessError("invalid_session", 401, "Sign in with your verified Sajda account again.");
  }
  async function membership(client: BrandReportsClient, captured: Context, owner: string) {
    // Use the actual commerce reader with this transaction's environment and
    // connection. No external Apple request while holding the account lock;
    // expired native proofs fail closed until separately refreshed.
    return createAccountMembershipReader({ environment: () => captured.env,
      query: async (sql, params) => (await client.query(sql, params)).rows })({ id: owner, emailVerified: true });
  }
  async function report(client: BrandReportsClient, captured: Context, owner: string, id: string) {
    const result = await client.query(`/* brand-monitors:report */ SELECT p.version,v.assessment FROM sajda.brand_reports p
      JOIN sajda.brand_report_versions v ON v.namespace=p.namespace AND v.owner_id=p.owner_id AND v.report_id=p.id AND v.version=p.version
      WHERE p.owner_id=$1 AND p.namespace=$2 AND p.id=$3::uuid`, [owner, captured.namespace, id]);
    if (!result.rows.length) throw notFound(); if (result.rows.length !== 1) throw unavailable();
    const row = result.rows[0], targets = [...brandIndexInputSchema.parse(row.assessment).domains].sort();
    return { version: z.number().int().min(1).max(100).parse(row.version), targets };
  }
  async function read(client: BrandReportsClient, captured: Context, owner: string, id: string) {
    const result = await client.query(`/* brand-monitors:get */ SELECT ${monitorColumns} FROM sajda.brand_monitors
      WHERE owner_id=$1 AND namespace=$2 AND report_id=$3::uuid`, [owner, captured.namespace, id]);
    if (result.rows.length > 1) throw unavailable(); return result.rows[0] ?? null;
  }
  async function reconcile(client: BrandReportsClient, captured: Context, owner: string, limit: number) {
    // Oldest enabled monitors survive a downgrade. Paused monitoring is never
    // resumed implicitly by an upgrade; read/pause/ack remain available on Free.
    await client.query(`/* brand-monitors:reconcile-scope */ UPDATE sajda.brand_monitors m SET status='paused',pause_reason='report_changed',
      next_due_at=NULL,version=LEAST(m.version+1,10000),updated_at=statement_timestamp() FROM sajda.brand_reports p
      WHERE m.owner_id=$1 AND m.namespace=$2 AND m.status='active' AND p.owner_id=m.owner_id AND p.namespace=m.namespace
        AND p.id=m.report_id AND p.version<>m.report_version`, [owner, captured.namespace]);
    await client.query(`/* brand-monitors:reconcile */ WITH ordered AS (
      SELECT report_id,row_number() OVER(ORDER BY created_at,report_id) AS position FROM sajda.brand_monitors
      WHERE owner_id=$1 AND namespace=$2 AND status='active')
      UPDATE sajda.brand_monitors m SET status='paused',pause_reason='plan_limit',
        next_due_at=NULL,version=LEAST(m.version+1,10000),updated_at=statement_timestamp()
      FROM ordered o WHERE m.owner_id=$1 AND m.namespace=$2 AND m.report_id=o.report_id AND o.position>$3`, [owner, captured.namespace, limit]);
  }
  async function capacity(client: BrandReportsClient, captured: Context, owner: string) {
    const result = await client.query(`/* brand-monitors:capacity */ SELECT count(*)::integer AS active FROM sajda.brand_monitors
      WHERE owner_id=$1 AND namespace=$2 AND status='active'`, [owner, captured.namespace]);
    return z.number().int().min(0).max(50).parse(result.rows[0]?.active);
  }
  async function ensureHistoryCapacity(client: BrandReportsClient, captured: Context, owner: string, id: string) {
    const result = await client.query(`/* brand-monitors:history-capacity */ SELECT count(*)::integer AS total FROM sajda.brand_check_runs
      WHERE owner_id=$1 AND namespace=$2 AND report_id=$3::uuid`, [owner, captured.namespace, id]);
    if (z.number().int().min(0).max(100).parse(result.rows[0]?.total) >= 100) {
      throw new AccountAccessError("monitor_history_full", 409, "This report's 100-check history is full. All observations are retained; choose a new report to monitor.");
    }
  }
  async function pauseSystem(client: BrandReportsClient, captured: Context, owner: string, id: string, reason: "history_full" | "report_changed" | "plan_limit") {
    await client.query(`/* brand-monitors:system-pause */ UPDATE sajda.brand_monitors SET status='paused',pause_reason=$4,next_due_at=NULL,
      version=LEAST(version+1,10000),updated_at=statement_timestamp() WHERE owner_id=$1 AND namespace=$2 AND report_id=$3::uuid AND status='active'`,
    [owner, captured.namespace, id, reason]);
  }
  return {
    async limit(rawOwner: string) {
      const owner = ownerId(rawOwner), captured = context();
      const count = await transaction(captured, async client => {
        const result = await client.query(`/* brand-monitors:limit */ INSERT INTO sajda.function_rate_limits(scope,subject_hash,window_started_at,request_count)
          VALUES('brand-monitors',$1,date_trunc('minute',statement_timestamp()),1)
          ON CONFLICT(scope,subject_hash,window_started_at) DO UPDATE SET request_count=LEAST(sajda.function_rate_limits.request_count+1,61),updated_at=statement_timestamp()
          RETURNING request_count`, [hash(`brand-monitors:${captured.namespace}:${owner}`)]);
        return z.number().int().min(1).parse(result.rows[0]?.request_count);
      });
      if (count > 60) throw new AccountAccessError("rate_limited", 429, "Too many monitor requests. Wait a minute and retry.");
    },
    async get(rawOwner: string, raw: BrandMonitorsSelector) {
      const owner = ownerId(rawOwner), input = brandMonitorsSelectorSchema.parse(raw), captured = context();
      return transaction(captured, async client => {
        await lockOwner(client, captured, owner); await report(client, captured, owner, input.reportId);
        const access = await membership(client, captured, owner), limit = BRAND_MONITOR_ACTIVE_LIMITS[access.plan];
        await reconcile(client, captured, owner, limit);
        const row = await read(client, captured, owner, input.reportId), active = await capacity(client, captured, owner);
        const counts = await client.query(`/* brand-monitors:alerts-count */ SELECT count(*)::integer AS total FROM sajda.brand_monitor_alerts
          WHERE owner_id=$1 AND namespace=$2 AND report_id=$3::uuid`, [owner, captured.namespace, input.reportId]);
        const total = z.number().int().min(0).max(2000).parse(counts.rows[0]?.total);
        const alerts = await client.query(`/* brand-monitors:alerts */ SELECT ${alertColumns} FROM sajda.brand_monitor_alerts
          WHERE owner_id=$1 AND namespace=$2 AND report_id=$3::uuid ORDER BY created_at DESC,id DESC OFFSET $4 LIMIT $5`,
        [owner, captured.namespace, input.reportId, input.alertOffset, input.alertLimit]);
        return { monitor: row ? monitorFrom(row, owner, captured.namespace) : null, currentPlan: access.plan,
          capacity: { active, limit }, intervalHours: BRAND_MONITOR_INTERVAL_HOURS,
          cronScheduled: captured.namespace === "production" && captured.env.SAJDA_BRAND_REPORTS_ENABLED === "true"
            && captured.env.SAJDA_BRAND_CHECKS_ENABLED === "true" && captured.env.SAJDA_BRAND_MONITORS_ENABLED === "true"
            && captured.env.SAJDA_BRAND_MONITORS_CRON_ENABLED === "true" && typeof captured.env.CRON_SECRET === "string"
            && captured.env.CRON_SECRET.length >= 32 && captured.env.CRON_SECRET.length <= 256,
          alerts: alerts.rows.map(alert => alertFrom(alert, owner, captured.namespace)), total,
          alertOffset: input.alertOffset, alertLimit: input.alertLimit, hasMore: input.alertOffset + alerts.rows.length < total };
      });
    },
    async mutate(rawOwner: string, raw: BrandMonitorsMutationInput) {
      const owner = ownerId(rawOwner), parsed = brandMonitorsMutationSchema.safeParse(raw);
      if (!parsed.success) throw new AccountAccessError("invalid_request", 400, "Select one report, action, current version and request identifier.");
      const input = parsed.data, captured = context(), inputHash = hash(JSON.stringify(input));
      return transaction(captured, async client => {
        await lockOwner(client, captured, owner);
        const receipt = await client.query(`/* brand-monitors:receipt */ SELECT input_hash,result FROM sajda.brand_monitor_requests
          WHERE owner_id=$1 AND namespace=$2 AND request_key=$3::uuid`, [owner, captured.namespace, input.requestKey]);
        if (receipt.rows.length > 1) throw unavailable();
        if (receipt.rows[0]) {
          if (receipt.rows[0].input_hash !== inputHash) throw new AccountAccessError("monitor_request_conflict", 409, "This request identifier was used for another monitor action. Reload before making a new change.");
          return brandMonitorMutationResponseSchema.omit({ accountId: true, requestId: true }).parse(receipt.rows[0].result);
        }
        const saved = await report(client, captured, owner, input.reportId), access = await membership(client, captured, owner), limit = BRAND_MONITOR_ACTIVE_LIMITS[access.plan];
        await reconcile(client, captured, owner, limit);
        let row = await read(client, captured, owner, input.reportId), acknowledgedAlert = null;
        const receiptCount = await client.query(`/* brand-monitors:requests-count */ SELECT count(*)::integer AS total FROM sajda.brand_monitor_requests
          WHERE owner_id=$1 AND namespace=$2`, [owner, captured.namespace]);
        const requests = z.number().int().min(0).parse(receiptCount.rows[0]?.total);
        // Consent withdrawal must not be blocked by bookkeeping capacity.
        // Once the ordinary receipt cap is full, ONLY active -> paused remains
        // allowed, at most once per saved report (50 reports/account). Resume,
        // rebind and enable stay blocked, so extra stop receipts remain bounded.
        if (requests >= 10000 && input.action !== "pause") throw new AccountAccessError("monitor_request_limit", 409, "The account's retained monitor action history is full. Active monitoring can still be paused.");
        if (input.action === "ack") {
          if (!row) throw notFound();
          await client.query(`/* brand-monitors:ack */ UPDATE sajda.brand_monitor_alerts SET acknowledged_at=statement_timestamp()
            WHERE owner_id=$1 AND namespace=$2 AND report_id=$3::uuid AND id=$4::uuid AND acknowledged_at IS NULL`, [owner, captured.namespace, input.reportId, input.alertId]);
          const alert = await client.query(`/* brand-monitors:alert */ SELECT ${alertColumns} FROM sajda.brand_monitor_alerts
            WHERE owner_id=$1 AND namespace=$2 AND report_id=$3::uuid AND id=$4::uuid`, [owner, captured.namespace, input.reportId, input.alertId]);
          if (alert.rows.length !== 1) throw new AccountAccessError("alert_not_found", 404, "This notice is not available in your account.");
          acknowledgedAlert = alertFrom(alert.rows[0], owner, captured.namespace);
        } else {
          if (input.expectedMonitorVersion !== (row?.version ?? 0)) throw conflict();
          if (row && Number(row.version) >= 10000 && input.action !== "pause") throw new AccountAccessError("monitor_version_limit", 409, "This monitor's configuration history is full. Active monitoring can still be paused.");
          if (input.action === "pause") {
            if (!row) throw notFound();
            if (row.status === "paused") throw new AccountAccessError("monitor_already_paused", 409, "Monitoring is already paused. No further provider requests are scheduled.");
            await client.query(`/* brand-monitors:pause */ UPDATE sajda.brand_monitors SET status='paused',pause_reason='user',next_due_at=NULL,
              version=LEAST(version+1,10000),updated_at=statement_timestamp() WHERE owner_id=$1 AND namespace=$2 AND report_id=$3::uuid`, [owner, captured.namespace, input.reportId]);
          } else {
            if (!limit) throw new AccountAccessError("monitor_plan_required", 403, "Daily registry monitoring requires Basic, Premium or Trading. Your saved history stays available.");
            if (await capacity(client, captured, owner) >= limit && row?.status !== "active") throw new AccountAccessError("monitor_plan_limit", 409, "Your plan's active-monitor limit is reached. Pause another monitor first.");
            await ensureHistoryCapacity(client, captured, owner, input.reportId);
            if (input.action === "resume") {
              if (!row || row.status !== "paused") throw conflict();
              if (saved.version !== row.report_version) throw new AccountAccessError("monitor_report_changed", 409, "Save and explicitly rebind this monitor to the latest report before resuming.");
              await client.query(`/* brand-monitors:resume */ UPDATE sajda.brand_monitors SET status='active',pause_reason=NULL,
                next_due_at=CASE WHEN last_run_status='pending' OR last_attempt_at IS NULL THEN statement_timestamp()
                  ELSE GREATEST(statement_timestamp(),last_attempt_at+interval '24 hours') END,
                version=version+1,updated_at=statement_timestamp() WHERE owner_id=$1 AND namespace=$2 AND report_id=$3::uuid`, [owner, captured.namespace, input.reportId]);
            } else {
              if (input.expectedReportVersion !== saved.version) throw new AccountAccessError("report_conflict", 409, "Load the latest saved report before changing monitoring scope.");
              if (input.action === "enable") {
                if (row) throw conflict();
                await client.query(`/* brand-monitors:enable */ INSERT INTO sajda.brand_monitors(namespace,owner_id,report_id,report_version,status,targets,next_due_at)
                  VALUES($2,$1,$3::uuid,$4,'active',$5::jsonb,statement_timestamp())`, [owner, captured.namespace, input.reportId, saved.version, JSON.stringify(saved.targets)]);
              } else {
                if (!row) throw notFound();
                if (saved.version === row.report_version) throw new AccountAccessError("monitor_rebind_unchanged", 409,
                  "This monitor already targets the latest saved version. Resume its existing schedule instead of resetting it.");
                await client.query(`/* brand-monitors:rebind */ UPDATE sajda.brand_monitors SET report_version=$4,targets=$5::jsonb,baseline='{}'::jsonb,
                  status='active',pause_reason=NULL,next_due_at=statement_timestamp(),version=version+1,updated_at=statement_timestamp(),
                  claim_version=NULL,lease_expires_at=NULL,last_attempt_at=NULL,last_run_id=NULL,last_run_status=NULL,last_failure_code=NULL,
                  last_coverage=NULL,last_successful_at=NULL WHERE owner_id=$1 AND namespace=$2 AND report_id=$3::uuid`,
                [owner, captured.namespace, input.reportId, saved.version, JSON.stringify(saved.targets)]);
              }
            }
          }
          row = await read(client, captured, owner, input.reportId);
        }
        if (!row) throw unavailable(); const result = { monitor: monitorFrom(row, owner, captured.namespace), acknowledgedAlert };
        await client.query(`/* brand-monitors:record-receipt */ INSERT INTO sajda.brand_monitor_requests(namespace,owner_id,request_key,report_id,input_hash,result)
          VALUES($2,$1,$3::uuid,$4::uuid,$5,$6::jsonb)`, [owner, captured.namespace, input.requestKey, input.reportId, inputHash, JSON.stringify(result)]);
        return result;
      });
    },
    async tick(): Promise<{ processed: number; alerts: number; busy: boolean }> {
      const captured = context(), token = randomUUID();
      const admitted = await transaction(captured, async client => {
        const result = await client.query(`/* brand-monitors:worker-admit */ INSERT INTO sajda.brand_monitor_worker_leases(namespace,token,expires_at)
          VALUES($1,$2::uuid,statement_timestamp()+interval '5 minutes') ON CONFLICT(namespace) DO UPDATE SET token=EXCLUDED.token,expires_at=EXCLUDED.expires_at
          WHERE sajda.brand_monitor_worker_leases.expires_at<=statement_timestamp() RETURNING token::text`, [captured.namespace, token]);
        return result.rows.length === 1 && result.rows[0].token === token;
      });
      if (!admitted) return { processed: 0, alerts: 0, busy: true };
      let processed = 0, notices = 0;
      const checks = deps.checks ?? createBrandChecksStore({ pool: captured.pool, environment: () => captured.env });
      try {
        for (let index = 0; index < BRAND_MONITOR_TICK_LIMIT; index++) {
          const claim = await transaction(captured, async client => {
            const live = await client.query(`/* brand-monitors:worker-live */ SELECT token::text FROM sajda.brand_monitor_worker_leases
              WHERE namespace=$1 AND token=$2::uuid AND expires_at>statement_timestamp()`, [captured.namespace, token]);
            if (live.rows.length !== 1) return null;
            const candidate = await client.query(`/* brand-monitors:due */ SELECT ${monitorColumns} FROM sajda.brand_monitors
              WHERE namespace=$1 AND status='active' AND next_due_at<=statement_timestamp()
                AND (lease_expires_at IS NULL OR lease_expires_at<=statement_timestamp())
                AND EXISTS(SELECT 1 FROM public.sajda_auth_user u WHERE u.id=owner_id AND u."emailVerified"=true)
              ORDER BY next_due_at,created_at,report_id LIMIT 1`, [captured.namespace]);
            if (!candidate.rows.length) return null; const selected = candidate.rows[0], owner = ownerId(String(selected.owner_id)), id = String(selected.report_id);
            await lockOwner(client, captured, owner); const access = await membership(client, captured, owner);
            await reconcile(client, captured, owner, BRAND_MONITOR_ACTIVE_LIMITS[access.plan]);
            const row = await read(client, captured, owner, id);
            if (!row || row.status !== "active") return { skipped: true } as const;
            const saved = await report(client, captured, owner, id);
            if (saved.version !== row.report_version) { await pauseSystem(client, captured, owner, id, "report_changed"); return { skipped: true } as const; }
            // Resume an expired durable slot with its original key, never a new
            // provider request. The check store resolves pending/terminal state.
            const runId = row.last_run_status === "pending" && row.last_run_id ? String(row.last_run_id) : randomUUID();
            const claimVersion = row.last_run_status === "pending" && row.claim_version !== null ? Number(row.claim_version) : Number(row.version);
            await client.query(`/* brand-monitors:claim */ UPDATE sajda.brand_monitors SET claim_version=$5,lease_expires_at=statement_timestamp()+interval '5 minutes',
              last_attempt_at=CASE WHEN last_run_status='pending' THEN last_attempt_at ELSE statement_timestamp() END,last_run_id=$4::uuid,
              last_run_status='pending',last_failure_code=NULL,last_coverage=NULL WHERE owner_id=$1 AND namespace=$2 AND report_id=$3::uuid`,
            [owner, captured.namespace, id, runId, claimVersion]);
            return { skipped: false, owner, reportId: id, reportVersion: Number(row.report_version), version: claimVersion, runId } as const;
          });
          if (!claim) break; if (claim.skipped) continue;
          processed++;
          let run: BrandCheckRun | null = null, admissionFailure = "";
          try { run = await checks.start(claim.owner, { reportId: claim.reportId, expectedVersion: claim.reportVersion, requestKey: claim.runId }); }
          catch (error) { admissionFailure = error instanceof AccountAccessError ? error.code : "brand_checks_unavailable"; }
          notices += await transaction(captured, async client => {
            // Recheck verified identity, membership, schedule and generation
            // after provider work. A late pause/rebind never generates a notice.
            await lockOwner(client, captured, claim.owner); const access = await membership(client, captured, claim.owner);
            await reconcile(client, captured, claim.owner, BRAND_MONITOR_ACTIVE_LIMITS[access.plan]);
            const row = await read(client, captured, claim.owner, claim.reportId);
            if (!row || row.last_run_id !== claim.runId) return 0;
            // An overlapping expired-lease invocation can observe a receipt
            // another claimant already finalized. Never regress its terminal
            // coverage or its next daily due date back to a recovery schedule.
            if (row.last_run_status !== "pending") return 0;
            if (!run) {
              if (admissionFailure === "check_limit_reached") { await pauseSystem(client, captured, claim.owner, claim.reportId, "history_full"); }
              else if (admissionFailure === "report_conflict") { await pauseSystem(client, captured, claim.owner, claim.reportId, "report_changed"); }
              // Known non-start admissions clear the slot. Unknown outcomes
              // retain it until lease expiry and exact-key reconciliation.
              if (["check_limit_reached", "report_conflict", "check_pending", "check_daily_limit"].includes(admissionFailure)) {
                await client.query(`/* brand-monitors:defer */ UPDATE sajda.brand_monitors SET claim_version=NULL,lease_expires_at=NULL,
                  last_run_id=NULL,last_attempt_at=NULL,last_run_status=NULL,last_failure_code=NULL,last_coverage=NULL,
                  next_due_at=CASE WHEN status='active' THEN CASE WHEN $4='check_daily_limit'
                    THEN (date_trunc('day',statement_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')+interval '1 day'
                    ELSE statement_timestamp()+interval '5 minutes' END ELSE NULL END
                  WHERE owner_id=$1 AND namespace=$2 AND report_id=$3::uuid AND last_run_id=$5::uuid`,
                [claim.owner, captured.namespace, claim.reportId, admissionFailure, claim.runId]);
              }
              return 0;
            }
            if (run.status === "pending") return 0;
            const archived = await client.query(`/* brand-monitors:archived-run */ SELECT status,entries,targets,completed_at,report_version FROM sajda.brand_check_runs
              WHERE owner_id=$1 AND namespace=$2 AND report_id=$3::uuid AND id=$4::uuid`, [claim.owner, captured.namespace, claim.reportId, claim.runId]);
            if (archived.rows.length !== 1 || archived.rows[0].status !== run.status || archived.rows[0].report_version !== claim.reportVersion
              || JSON.stringify(archived.rows[0].targets) !== JSON.stringify(row.targets)) throw unavailable();
            const sample = archived.rows[0], completedAt = instant(sample.completed_at);
            const entries = run.status === "completed" ? z.array(brandCheckEntrySchema).length((row.targets as unknown[]).length).parse(sample.entries) : [];
            if (run.status === "completed" && JSON.stringify(entries.map(entry => entry.target).sort()) !== JSON.stringify(row.targets)) throw unavailable();
            const eligible = row.status === "active" && row.version === claim.version && row.claim_version === claim.version;
            const compared = run.status === "completed" ? deriveBrandMonitorChanges(baselineFrom(row.baseline, row.targets as string[]), entries, completedAt) : null;
            if (eligible && compared) for (const change of compared.changes) {
              await client.query(`/* brand-monitors:record-alert */ INSERT INTO sajda.brand_monitor_alerts(namespace,owner_id,id,report_id,report_version,
                monitor_version,run_id,target,previous_observation,current_observation) VALUES($2,$1,$3::uuid,$4::uuid,$5,$6,$7::uuid,$8,$9::jsonb,$10::jsonb)
                ON CONFLICT(namespace,owner_id,report_id,run_id,target) DO NOTHING`, [claim.owner, captured.namespace, randomUUID(), claim.reportId,
                claim.reportVersion, claim.version, claim.runId, change.target, JSON.stringify(change.previous), JSON.stringify(change.current)]);
            }
            await client.query(`/* brand-monitors:finalize */ UPDATE sajda.brand_monitors SET claim_version=NULL,lease_expires_at=NULL,last_run_status=$5,
              last_failure_code=$6,last_coverage=$7::jsonb,baseline=CASE WHEN $8 THEN $9::jsonb ELSE baseline END,
              last_successful_at=CASE WHEN $8 AND $10 THEN $11::timestamptz ELSE last_successful_at END,
              next_due_at=CASE WHEN status='active' THEN statement_timestamp()+interval '24 hours' ELSE NULL END
              WHERE owner_id=$1 AND namespace=$2 AND report_id=$3::uuid AND last_run_id=$4::uuid`,
            [claim.owner, captured.namespace, claim.reportId, claim.runId, run.status, run.failureCode,
              compared ? JSON.stringify(compared.coverage) : null, eligible, JSON.stringify(compared?.baseline ?? {}),
              !!compared && compared.coverage.checked > 0, completedAt]);
            return eligible ? compared?.changes.length ?? 0 : 0;
          });
        }
        return { processed, alerts: notices, busy: false };
      } finally {
        await transaction(captured, async client => { await client.query(`/* brand-monitors:worker-release */ DELETE FROM sajda.brand_monitor_worker_leases
          WHERE namespace=$1 AND token=$2::uuid`, [captured.namespace, token]); });
      }
    },
  };
}
export const brandMonitorsStore = createBrandMonitorsStore();
