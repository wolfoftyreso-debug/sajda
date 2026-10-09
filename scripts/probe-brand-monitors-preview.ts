import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { parseEnv } from "node:util";
import { Pool } from "pg";
import { createBrandReportsStore, type BrandReportsPool } from "../api/_shared/brand-reports-store.js";
import { createBrandChecksStore } from "../api/_shared/brand-checks-store.js";
import { createBrandMonitorsStore } from "../api/_shared/brand-monitors-store.js";
import { BRAND_CHECK_METHODOLOGY_VERSION } from "../shared/brand-checks.js";
import { brandMonitorsSelectorSchema } from "../shared/brand-monitors.js";
import { brandRegistrySourceUrl, type BrandEvidenceEntry } from "../shared/brand-evidence.js";

// Opt-in synthetic preview PostgreSQL proof. No real provider, email, checkout,
// migration, password, production write or scheduler enablement is performed.
let phase = "configuration", setupAttempted = false, cleanupConfirmed = false;
function check(value: unknown): asserts value { assert.ok(value); }
async function main() {
  check(process.env.SAJDA_BRAND_MONITORS_PREVIEW_TEST === "1" && !process.env.VERCEL);
  const args = new Map(process.argv.slice(2).map(value => { const split = value.indexOf("="); check(split > 0); return [value.slice(0, split), value.slice(split + 1)]; }));
  check(args.size === 3 && process.argv.slice(2).length === 3 && [...args.keys()].every(key => ["--preview-env", "--production-env", "--preview-host"].includes(key)));
  const exportsRoot = await realpath(path.resolve(".vercel"));
  async function load(key: string, basename: string) {
    const file = await realpath(path.resolve(args.get(key) ?? "")); check(file === path.join(exportsRoot, basename));
    return parseEnv(await readFile(file, "utf8"));
  }
  const preview = await load("--preview-env", ".env.brand-monitors.preview.local"), production = await load("--production-env", ".env.brand-monitors.production.local");
  check(preview.DATABASE_URL && production.DATABASE_URL);
  const database = new URL(preview.DATABASE_URL), live = new URL(production.DATABASE_URL);
  check(["postgres:", "postgresql:"].includes(database.protocol) && database.hostname.endsWith(".neon.tech") && database.hostname === args.get("--preview-host"));
  check(`${database.hostname.replace("-pooler.", ".")}${database.pathname}` !== `${live.hostname.replace("-pooler.", ".")}${live.pathname}`);
  database.searchParams.set("sslmode", "verify-full"); database.searchParams.delete("options");
  const db = new Pool({ connectionString: database.toString(), max: 5, connectionTimeoutMillis: 8000, query_timeout: 10000 });
  const owner = randomUUID(), other = randomUUID(), allocated = [owner, other], reportId = randomUUID(), secondId = randomUUID();
  const email = (id: string) => `brand-monitor-preview-${id}@example.test`;
  const environment = () => ({ VERCEL: "1", VERCEL_ENV: "preview", SAJDA_BRAND_MONITORS_CRON_ENABLED: "true" });
  // Real queries/transactions; the fixture fence refuses to select a real
  // customer for this explicit preview-only scheduler simulation.
  const pool: BrandReportsPool = { async connect() {
    const client = await db.connect(); return { release(destroy) { client.release(destroy); }, async query(sql, values) {
      const result = await client.query(sql, values);
      if (sql.includes("brand-monitors:due")) check(result.rows.every(row => allocated.includes(row.owner_id)));
      return { rows: result.rows };
    } };
  } };
  const reports = createBrandReportsStore({ pool, environment });
  let checkerCalls = 0, mode: "available" | "registered" | "unknown" = "available", sourceDate = new Date(Date.now() - 10000).toISOString();
  const initialSourceDate = sourceDate;
  let hold = false, entered: (() => void) | undefined, finish: (() => void) | undefined, pending: Promise<unknown> | undefined;
  const checks = createBrandChecksStore({ pool, environment, checker: async targets => {
    check(targets.every(target => ["example.com", "example.net", "example.co.uk"].includes(target)));
    checkerCalls++;
    // Acquiring the same account advisory lock proves the provider is outside
    // a database transaction. No existing lock is released or forced here.
    const lockProbe = await db.connect();
    try {
      const key = `sajda.brand-reports.v1:preview:${owner}`;
      check((await lockProbe.query("SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS free", [key])).rows[0].free === true);
      await lockProbe.query("SELECT pg_advisory_unlock(hashtextextended($1,0))", [key]);
    } finally { lockProbe.release(); }
    if (hold) { entered?.(); await new Promise<void>(resolve => { finish = resolve; }); hold = false; }
    return targets.map(target => mode === "unknown" || target === "example.co.uk" ? { id: `check:domain:${target}`, target, kind: "domain",
      state: "unknown", freshness: "unknown", source_url: null, observed_at: null, statement: "domain_check_unavailable", origin: "none" }
      : { id: `check:domain:${target}`, target, kind: "domain", state: "checked", freshness: "current",
        source_url: brandRegistrySourceUrl(target, "verisign-rdap", "rdap"), observed_at: sourceDate,
        statement: mode === "available" ? "domain_available" : "domain_registered", origin: "provider_observation" }) as BrandEvidenceEntry[];
  } });
  const monitors = createBrandMonitorsStore({ pool, environment, checks });
  const assessment = { brand_name: "Example", identity_label: "example", primary_domain: "example.com", domains: ["example.com", "example.co.uk"],
    socials: [{ platform: "github" as const, handle: "example" }], markets: ["US" as const], observations: [] };
  const get = (id = reportId) => monitors.get(owner, brandMonitorsSelectorSchema.parse({ reportId: id }));
  const forceDue = () => db.query("UPDATE sajda.brand_monitors SET next_due_at=statement_timestamp()-interval '1 second' WHERE namespace='preview' AND owner_id=$1 AND report_id=$2 AND status='active'", [owner, reportId]);
  async function plan(value: "basic" | "premium" | null) {
    if (value === null) { await db.query("DELETE FROM sajda.commerce_access WHERE namespace='preview' AND owner_id=$1", [owner]); return; }
    await db.query(`INSERT INTO sajda.commerce_access(namespace,owner_id,subscription_id,price_id,invoice_id,livemode,valid_from,expires_at,plan)
      VALUES('preview',$1,'sub_SyntheticMonitorProbe','price_SyntheticMonitorProbe','in_SyntheticMonitorProbe',false,statement_timestamp()-interval '1 minute',statement_timestamp()+interval '1 day',$2)
      ON CONFLICT(namespace,owner_id) DO UPDATE SET plan=EXCLUDED.plan,expires_at=EXCLUDED.expires_at`, [owner, value]);
  }
  async function seedFailed(id: string, version: number, when: "today" | "old", count: number) {
    const targets = (await reports.get(owner, { id })).assessment.domains.slice().sort();
    for (let i = 0; i < count; i++) await db.query(`INSERT INTO sajda.brand_check_runs(namespace,owner_id,id,report_id,report_version,input_hash,targets,
      methodology_version,status,requested_at,lease_expires_at,completed_at,failure_code)
      VALUES('preview',$1,$2,$3,$4,$5,$6::jsonb,$7,'failed',statement_timestamp()-$8::interval,
        statement_timestamp()-$8::interval+interval '5 minutes',statement_timestamp()-$8::interval+interval '5 minutes','check_interrupted')`,
    [owner, randomUUID(), id, version, "0".repeat(64), JSON.stringify(targets), BRAND_CHECK_METHODOLOGY_VERSION, when === "today" ? "10 minutes" : "2 days"]);
  }
  try {
    phase = "schema_and_synthetic_setup";
    check((await db.query("SELECT to_regclass('sajda.brand_monitors') IS NOT NULL AS ready")).rows[0].ready === true);
    for (const id of allocated) { setupAttempted = true; await db.query('INSERT INTO public.sajda_auth_user(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [id, "Synthetic daily-monitor proof", email(id)]); }
    await db.query("INSERT INTO sajda.commerce_customers(namespace,owner_id,customer_key) VALUES('preview',$1,$2)", [owner, randomUUID()]); await plan("premium");
    await reports.save(owner, { id: reportId, expectedVersion: 0, requestKey: randomUUID(), title: "Synthetic monitored brand", assessment });
    const command = { action: "enable" as const, reportId, expectedReportVersion: 1, expectedMonitorVersion: 0 as const, requestKey: randomUUID() };
    phase = "configuration_receipt_CAS_and_boundaries";
    const [enabled, replay] = await Promise.all([monitors.mutate(owner, command), monitors.mutate(owner, command)]);
    assert.deepEqual(enabled, replay); check(enabled.monitor.version === 1 && enabled.monitor.status === "active");
    await assert.rejects(() => monitors.mutate(owner, { action: "pause", reportId, expectedMonitorVersion: 1, requestKey: command.requestKey }), { code: "monitor_request_conflict" });
    await assert.rejects(() => monitors.get(other, brandMonitorsSelectorSchema.parse({ reportId })), { code: "report_not_found" });
    const foreignEnvironment = createBrandMonitorsStore({ pool, checks, environment: () => ({ VERCEL: "1", VERCEL_ENV: "development" }) });
    await assert.rejects(() => foreignEnvironment.get(owner, brandMonitorsSelectorSchema.parse({ reportId })), { code: "report_not_found" });
    check((await get()).cronScheduled === false);
    phase = "first_baseline_global_claim_and_provider_outside_transaction";
    hold = true; const reached = new Promise<void>(resolve => { entered = resolve; });
    const first = monitors.tick(); pending = first;
    await Promise.race([reached, first.then(() => { throw new Error("Synthetic provider did not pause"); })]);
    check((await monitors.tick()).busy === true); check(checkerCalls === 1);
    const running = (await get()).monitor!; check(running.lastRunStatus === "pending" && running.lastRunId);
    await assert.rejects(() => checks.start(owner, { reportId, expectedVersion: 1, requestKey: randomUUID() }), { code: "check_pending" });
    const admittedLease = (await db.query("SELECT token::text FROM sajda.brand_monitor_worker_leases WHERE namespace='preview'")).rows[0]; check(admittedLease);
    await db.query("UPDATE sajda.brand_monitor_worker_leases SET expires_at=statement_timestamp()-interval '1 second' WHERE namespace='preview' AND token=$1", [admittedLease.token]);
    await db.query("UPDATE sajda.brand_monitors SET lease_expires_at=statement_timestamp()-interval '1 second' WHERE namespace='preview' AND owner_id=$1 AND report_id=$2 AND last_run_id=$3", [owner, reportId, running.lastRunId]);
    const overlap = await monitors.tick(); check(overlap.processed >= 1 && checkerCalls === 1);
    await reports.save(owner, { id: secondId, expectedVersion: 0, requestKey: randomUUID(), title: "Second disposable brand", assessment });
    finish?.(); check((await first).alerts === 0);
    const baseline = (await get()).monitor!; check(baseline.baselineCount === 1 && baseline.lastRunCoverage?.checked === 1 && baseline.lastRunCoverage.unknown === 1);
    check(baseline.lastSuccessfulAt && checkerCalls === 1);
    phase = "unknown_is_not_change_then_source_cited_change";
    mode = "unknown"; await forceDue(); check((await monitors.tick()).alerts === 0);
    const unknown = await get(); check(unknown.monitor!.baselineCount === 1 && unknown.monitor!.lastRunCoverage?.checked === 0 && unknown.total === 0);
    mode = "registered"; sourceDate = new Date(Date.now() - 1000).toISOString(); await forceDue(); check((await monitors.tick()).alerts === 1);
    const changed = await get(); check(changed.total === 1); const alert = changed.alerts[0];
    check(alert.previous.status === "available" && alert.current.status === "registered" && alert.previous.observedAt === initialSourceDate);
    check(Date.parse(alert.current.observedAt) > Date.parse(alert.previous.observedAt));
    mode = "available"; await forceDue(); check((await monitors.tick()).alerts === 0); check((await get()).total === 1);
    phase = "resume_cadence_scope_rebind_and_inflight_pause";
    const paused = await monitors.mutate(owner, { action: "pause", reportId, expectedMonitorVersion: 1, requestKey: randomUUID() });
    const resumed = await monitors.mutate(owner, { action: "resume", reportId, expectedMonitorVersion: paused.monitor.version, requestKey: randomUUID() });
    check(Date.parse(resumed.monitor.nextDueAt!) >= Date.parse(resumed.monitor.lastAttemptAt!) + 86400000);
    await assert.rejects(() => monitors.mutate(owner, { action: "rebind", reportId, expectedMonitorVersion: resumed.monitor.version, expectedReportVersion: 1, requestKey: randomUUID() }), { code: "monitor_rebind_unchanged" });
    const nextAssessment = { ...assessment, primary_domain: "example.net", domains: ["example.net", "example.co.uk"] };
    await reports.save(owner, { id: reportId, expectedVersion: 1, requestKey: randomUUID(), title: "Explicitly changed scope", assessment: nextAssessment });
    const changedScope = (await get()).monitor!; check(changedScope.status === "paused" && changedScope.pauseReason === "report_changed");
    const rebound = await monitors.mutate(owner, { action: "rebind", reportId, expectedReportVersion: 2, expectedMonitorVersion: changedScope.version, requestKey: randomUUID() });
    check(rebound.monitor.baselineCount === 0 && rebound.monitor.lastRunId === null);
    hold = true; sourceDate = new Date(Date.now() - 1000).toISOString(); const enteredAgain = new Promise<void>(resolve => { entered = resolve; });
    const interrupted = monitors.tick(); pending = interrupted;
    await Promise.race([enteredAgain, interrupted.then(() => { throw new Error("Synthetic provider did not pause"); })]);
    const stopped = await monitors.mutate(owner, { action: "pause", reportId, expectedMonitorVersion: rebound.monitor.version, requestKey: randomUUID() });
    finish?.(); check((await interrupted).alerts === 0);
    const retained = (await get()).monitor!; check(retained.status === "paused" && retained.version === stopped.monitor.version && retained.baselineCount === 0 && retained.lastRunStatus === "completed");
    phase = "inflight_pause_resume_preserves_daily_cadence";
    const restored = await monitors.mutate(owner, { action: "resume", reportId, expectedMonitorVersion: retained.version, requestKey: randomUUID() });
    hold = true; await forceDue(); const enteredRace = new Promise<void>(resolve => { entered = resolve; });
    const racedRun = monitors.tick(); pending = racedRun;
    await Promise.race([enteredRace, racedRun.then(() => { throw new Error("Synthetic provider did not pause"); })]);
    const racedPause = await monitors.mutate(owner, { action: "pause", reportId, expectedMonitorVersion: restored.monitor.version, requestKey: randomUUID() });
    const racedResume = await monitors.mutate(owner, { action: "resume", reportId, expectedMonitorVersion: racedPause.monitor.version, requestKey: randomUUID() });
    finish?.(); check((await racedRun).alerts === 0); const racedTerminal = (await get()).monitor!;
    check(racedTerminal.status === "active" && racedTerminal.baselineCount === 0
      && Date.parse(racedTerminal.nextDueAt!) >= Date.parse(racedTerminal.lastAttemptAt!) + 86400000);
    phase = "inflight_membership_revocation";
    hold = true; await forceDue(); const enteredRevocation = new Promise<void>(resolve => { entered = resolve; });
    const revokedRun = monitors.tick(); pending = revokedRun;
    await Promise.race([enteredRevocation, revokedRun.then(() => { throw new Error("Synthetic provider did not pause"); })]);
    await plan(null); finish?.(); check((await revokedRun).alerts === 0);
    const revoked = (await get()).monitor!; check(revoked.status === "paused" && revoked.pauseReason === "plan_limit" && revoked.baselineCount === 0);
    check(revoked.version > racedResume.monitor.version && revoked.lastRunStatus === "completed");
    phase = "fresh_plan_limits_downgrade_and_Free_ack";
    await plan("basic"); const active = await monitors.mutate(owner, { action: "resume", reportId, expectedMonitorVersion: revoked.version, requestKey: randomUUID() });
    await assert.rejects(() => monitors.mutate(owner, { action: "enable", reportId: secondId, expectedReportVersion: 1, expectedMonitorVersion: 0, requestKey: randomUUID() }), { code: "monitor_plan_limit" });
    await plan("premium"); await monitors.mutate(owner, { action: "enable", reportId: secondId, expectedReportVersion: 1, expectedMonitorVersion: 0, requestKey: randomUUID() });
    await plan("basic"); check((await get(secondId)).monitor!.pauseReason === "plan_limit"); check((await get()).monitor!.status === "active");
    await plan(null); check((await get()).monitor!.pauseReason === "plan_limit");
    const ackKey = randomUUID(), ack = { action: "ack" as const, reportId, alertId: alert.id, requestKey: ackKey };
    const acknowledged = await monitors.mutate(owner, ack); check(acknowledged.acknowledgedAlert?.acknowledgedAt);
    assert.deepEqual(await monitors.mutate(owner, ack), acknowledged);
    await assert.rejects(() => db.query("UPDATE sajda.brand_monitor_alerts SET target='other.com' WHERE namespace='preview' AND owner_id=$1 AND id=$2", [owner, alert.id]));
    phase = "history_capacity_and_daily_deferral";
    await plan("premium"); const current = (await get()).monitor!;
    await monitors.mutate(owner, { action: "resume", reportId, expectedMonitorVersion: current.version, requestKey: randomUUID() });
    const used = (await db.query("SELECT count(*)::integer AS total FROM sajda.brand_check_runs WHERE namespace='preview' AND owner_id=$1 AND report_id=$2", [owner, reportId])).rows[0].total;
    await seedFailed(reportId, 2, "old", 100 - used); await forceDue(); const beforeFull = checkerCalls;
    await monitors.tick(); check((await get()).monitor!.pauseReason === "history_full" && checkerCalls === beforeFull);
    const second = (await get(secondId)).monitor!; await monitors.mutate(owner, { action: "resume", reportId: secondId, expectedMonitorVersion: second.version, requestKey: randomUUID() });
    const daily = (await db.query("SELECT count(*)::integer AS total FROM sajda.brand_check_runs WHERE namespace='preview' AND owner_id=$1 AND requested_at>=(date_trunc('day',statement_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')", [owner])).rows[0].total;
    await seedFailed(secondId, 1, "today", 10 - daily); await monitors.tick(); const deferred = (await get(secondId)).monitor!;
    check(deferred.status === "active" && deferred.lastRunId === null && Date.parse(deferred.nextDueAt!) > Date.now()); check(checkerCalls === beforeFull);
    phase = "expired_exact_receipt_recovery_no_provider_repeat";
    const stuckKey = randomUUID(), start = { reportId: secondId, expectedVersion: 1, requestKey: stuckKey };
    await db.query(`INSERT INTO sajda.brand_check_runs(namespace,owner_id,id,report_id,report_version,input_hash,targets,methodology_version,requested_at,lease_expires_at)
      VALUES('preview',$1,$2,$3,1,$4,$5::jsonb,$6,statement_timestamp()-interval '6 minutes',statement_timestamp()-interval '1 minute')`,
    [owner, stuckKey, secondId, createHash("sha256").update(JSON.stringify(start)).digest("hex"), JSON.stringify(assessment.domains.slice().sort()), BRAND_CHECK_METHODOLOGY_VERSION]);
    await db.query(`UPDATE sajda.brand_monitors SET next_due_at=statement_timestamp()-interval '1 minute',claim_version=version,
      lease_expires_at=statement_timestamp()-interval '1 minute',last_attempt_at=statement_timestamp()-interval '6 minutes',last_run_id=$3,
      last_run_status='pending',last_failure_code=NULL,last_coverage=NULL WHERE namespace='preview' AND owner_id=$1 AND report_id=$2`, [owner, secondId, stuckKey]);
    await monitors.tick(); const recovered = (await get(secondId)).monitor!;
    check(recovered.lastRunStatus === "failed" && recovered.lastFailureCode === "check_interrupted" && checkerCalls === beforeFull);
    phase = "late_claimant_cannot_regress_terminal_due_date";
    const lateId = randomUUID();
    await reports.save(owner, { id: lateId, expectedVersion: 0, requestKey: randomUUID(), title: "Late receipt overlap fixture", assessment });
    await monitors.mutate(owner, { action: "enable", reportId: lateId, expectedReportVersion: 1, expectedMonitorVersion: 0, requestKey: randomUUID() });
    let enteredLate!: () => void, firstInjected = true;
    const lateEntered = new Promise<void>(resolve => { enteredLate = resolve; });
    const overlapping = createBrandMonitorsStore({ pool, environment, checks: { async start(account, input) {
      if (firstInjected) {
        firstInjected = false;
        // Create only this disposable receipt as already expired, preserving
        // the real check table's immutable reservation/date constraint.
        await db.query(`INSERT INTO sajda.brand_check_runs(namespace,owner_id,id,report_id,report_version,input_hash,targets,methodology_version,requested_at,lease_expires_at)
          VALUES('preview',$1,$2,$3,1,$4,$5::jsonb,$6,statement_timestamp()-interval '6 minutes',statement_timestamp()-interval '1 minute')`,
        [account, input.requestKey, input.reportId, createHash("sha256").update(JSON.stringify(input)).digest("hex"), JSON.stringify(assessment.domains.slice().sort()), BRAND_CHECK_METHODOLOGY_VERSION]);
        enteredLate(); await new Promise<void>(resolve => { finish = resolve; });
      }
      return checks.start(account, input);
    } } });
    const lateA = overlapping.tick(); pending = lateA;
    await Promise.race([lateEntered, lateA.then(() => { throw new Error("Synthetic receipt did not pause"); })]);
    const globalLate = (await db.query("SELECT token::text FROM sajda.brand_monitor_worker_leases WHERE namespace='preview'")).rows[0]; check(globalLate);
    await db.query("UPDATE sajda.brand_monitor_worker_leases SET expires_at=statement_timestamp()-interval '1 second' WHERE namespace='preview' AND token=$1", [globalLate.token]);
    await db.query("UPDATE sajda.brand_monitors SET lease_expires_at=statement_timestamp()-interval '1 second' WHERE namespace='preview' AND owner_id=$1 AND report_id=$2", [owner, lateId]);
    await overlapping.tick(); const finalized = (await get(lateId)).monitor!;
    check(finalized.lastRunStatus === "failed" && finalized.lastFailureCode === "check_interrupted");
    finish?.(); await lateA; const retainedTerminal = (await get(lateId)).monitor!;
    check(retainedTerminal.nextDueAt === finalized.nextDueAt && retainedTerminal.lastRunStatus === finalized.lastRunStatus && checkerCalls === beforeFull);
    phase = "downgrade_keeps_oldest_eligible_not_stale_scope";
    await reports.save(owner, { id: secondId, expectedVersion: 1, requestKey: randomUUID(), title: "Stale earlier monitor revision", assessment });
    await plan("basic"); check((await get(lateId)).monitor!.status === "active");
    check((await get(secondId)).monitor!.pauseReason === "report_changed");
    phase = "consent_withdrawal_at_version_and_receipt_safety_ceiling";
    await db.query("UPDATE sajda.brand_monitors SET version=10000 WHERE namespace='preview' AND owner_id=$1 AND report_id=$2 AND status='active'", [owner, lateId]);
    const maxed = (await get(lateId)).monitor!;
    const receipts = (await db.query("SELECT count(*)::integer AS total FROM sajda.brand_monitor_requests WHERE namespace='preview' AND owner_id=$1", [owner])).rows[0].total;
    await db.query(`INSERT INTO sajda.brand_monitor_requests(namespace,owner_id,request_key,report_id,input_hash,result)
      SELECT 'preview',$1,gen_random_uuid(),$2,$3,$4::jsonb FROM generate_series(1,$5::integer)`,
    [owner, lateId, "0".repeat(64), JSON.stringify({ monitor: maxed, acknowledgedAlert: null }), 10000 - receipts]);
    const ceilingPause = { action: "pause" as const, reportId: lateId, expectedMonitorVersion: 10000, requestKey: randomUUID() };
    const withdrawn = await monitors.mutate(owner, ceilingPause);
    check(withdrawn.monitor.status === "paused" && withdrawn.monitor.pauseReason === "user" && withdrawn.monitor.version === 10000 && withdrawn.monitor.nextDueAt === null);
    assert.deepEqual(await monitors.mutate(owner, ceilingPause), withdrawn);
    await assert.rejects(() => monitors.mutate(owner, { ...ceilingPause, requestKey: randomUUID() }), { code: "monitor_already_paused" });
    await assert.rejects(() => monitors.mutate(owner, { action: "resume", reportId: lateId, expectedMonitorVersion: 10000, requestKey: randomUUID() }), { code: "monitor_request_limit" });
    check((await db.query("SELECT count(*)::integer AS total FROM sajda.brand_monitor_requests WHERE namespace='preview' AND owner_id=$1", [owner])).rows[0].total === 10001);
    const saved = await reports.get(owner, { id: reportId }); assert.deepEqual(saved.assessment, nextAssessment); check(saved.result.index.verified_score === null);
    check(active.monitor.reportVersion === 2);
    console.info(JSON.stringify({ event: "brand_monitors_preview_postgres_verified", actualMembershipAndDowngrade: true,
      atomicMutationReceipts: true, ownerAndEnvironmentIsolated: true, globalLeaseNoDuplicateWorker: true,
      providerOutsideTransaction: true, firstSampleBaselineOnly: true, unknownPreservesBaseline: true,
      exactTimestampChangeCited: true, sameSampleNoFalseAlert: true, resumeCadenceEnforced: true,
      explicitScopeRebind: true, inFlightPauseNoAlert: true, inFlightMembershipRevocationNoAlert: true, expiredLeaseOverlapNoDuplicateProvider: true, FreeReadAndAck: true,
      inFlightPauseResumePreservesCadence: true,
      historyFullExplicitPause: true, dailyLimitDefersUntilUTCNextDay: true, expiredReceiptNoProviderRepeat: true,
      lateClaimantCannotRegressTerminalDueDate: true,
      downgradeKeepsOldestEligibleMonitor: true,
      consentWithdrawalAtVersionAndReceiptCeiling: true,
      syntheticCheckerInvocations: checkerCalls, realProviderCalls: 0, emailCalls: 0, productionWrites: 0 }));
  } finally {
    const savedPhase = phase; phase = "fixture_cleanup";
    try {
      finish?.(); await pending?.catch(() => undefined);
      let retired = 0; for (const id of allocated) retired += (await db.query("DELETE FROM public.sajda_auth_user WHERE id=$1 AND email=$2", [id, email(id)])).rowCount ?? 0;
      for (const scope of ["brand-reports", "brand-checks", "brand-monitors", "account-membership"]) {
        const hashes = allocated.map(id => createHash("sha256").update(`${scope}:preview:${id}`).digest("hex"));
        await db.query("DELETE FROM sajda.function_rate_limits WHERE scope=$1 AND subject_hash=ANY($2::text[])", [scope, hashes]);
      }
      check((await db.query("SELECT count(*)::integer AS total FROM public.sajda_auth_user WHERE id=ANY($1::text[])", [allocated])).rows[0].total === 0);
      for (const table of ["brand_reports", "brand_report_versions", "brand_report_requests", "brand_check_runs", "brand_monitors", "brand_monitor_alerts", "brand_monitor_requests", "commerce_customers", "commerce_access"]) {
        check((await db.query(`SELECT count(*)::integer AS total FROM sajda.${table} WHERE owner_id=ANY($1::text[])`, [allocated])).rows[0].total === 0);
      }
      cleanupConfirmed = true; console.info(JSON.stringify({ event: "brand_monitors_preview_cleanup_verified", retiredFixtures: retired, remainingFixtures: 0 })); phase = savedPhase;
    } finally { await db.end(); }
  }
}
main().catch(() => { console.error(JSON.stringify({ event: "brand_monitors_preview_probe_failed", phase, cleanupRequired: setupAttempted,
  cleanupConfirmed: !setupAttempted || cleanupConfirmed, rawPrivateDetailsSuppressed: true })); process.exitCode = 1; });
