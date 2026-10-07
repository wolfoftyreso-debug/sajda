import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { parseEnv } from "node:util";
import { Pool } from "pg";
import { createBrandChecksStore } from "../api/_shared/brand-checks-store.js";
import { createBrandReportsStore } from "../api/_shared/brand-reports-store.js";
import { BRAND_CHECK_METHODOLOGY_VERSION, brandChecksHistorySelectorSchema, brandChecksStartSchema } from "../shared/brand-checks.js";
import { brandRegistrySourceUrl, type BrandEvidenceEntry } from "../shared/brand-evidence.js";
import { NAME_PACKAGE_EVIDENCE_MAX_AGE_MS } from "../shared/name-packages.js";

// Explicit synthetic preview-only PostgreSQL probe. The injected checker is not
// a real registry verification: this tests persistence/concurrency and nothing
// about domain availability. No migration, mail, sessions or provider requests.
let phase = "configuration", setupAttempted = false, cleanupConfirmed = false;
function check(condition: unknown): asserts condition { assert.ok(condition); }
async function main() {
  check(process.env.SAJDA_BRAND_CHECKS_PREVIEW_TEST === "1" && !process.env.VERCEL);
  const keys = ["--preview-env", "--production-env", "--preview-host"];
  const args = new Map(process.argv.slice(2).map(argument => {
    const separator = argument.indexOf("="); check(separator > 0);
    return [argument.slice(0, separator), argument.slice(separator + 1)] as const;
  }));
  check(process.argv.slice(2).length === 3 && args.size === 3 && [...args.keys()].every(key => keys.includes(key)));
  const exportsRoot = await realpath(path.resolve(".vercel"));
  async function load(key: string, name: string) {
    const filename = await realpath(path.resolve(args.get(key) ?? ""));
    check(filename === path.join(exportsRoot, name)); return parseEnv(await readFile(filename, "utf8"));
  }
  const preview = await load("--preview-env", ".env.brand-checks.preview.local"), production = await load("--production-env", ".env.brand-checks.production.local");
  check(preview.DATABASE_URL && production.DATABASE_URL && preview.SAJDA_BRAND_REPORTS_ENABLED === "true" && preview.SAJDA_BRAND_CHECKS_ENABLED === "true");
  const database = new URL(preview.DATABASE_URL), productionDatabase = new URL(production.DATABASE_URL);
  check(["postgres:", "postgresql:"].includes(database.protocol) && database.hostname.endsWith(".neon.tech") && database.hostname === args.get("--preview-host"));
  check(`${database.hostname.replace("-pooler.", ".")}${database.pathname}` !== `${productionDatabase.hostname.replace("-pooler.", ".")}${productionDatabase.pathname}`);
  database.searchParams.set("sslmode", "verify-full"); database.searchParams.delete("options");
  const pool = new Pool({ connectionString: database.toString(), max: 4, connectionTimeoutMillis: 8000, query_timeout: 10000 });
  const owner = randomUUID(), other = randomUUID(), reportId = randomUUID(), allocated = [owner, other];
  const email = (id: string) => `brand-check-preview-${id}@example.test`;
  const environment = () => ({ VERCEL: "1", VERCEL_ENV: "preview" });
  let now = Date.now(), checkerCalls = 0, finish: (() => void) | undefined, entered!: () => void, inFlight: Promise<unknown> | undefined;
  const checkerEntered = new Promise<void>(resolve => { entered = resolve; });
  const sourceDate = new Date(now).toISOString();
  const reports = createBrandReportsStore({ pool, environment });
  const checks = createBrandChecksStore({ pool, environment, now: () => now, checker: async targets => {
    checkerCalls++;
    if (checkerCalls === 1) { entered(); await new Promise<void>(resolve => { finish = resolve; }); }
    return targets.map(target => target === "example.com" ? { id: `check:domain:${target}`, target, kind: "domain", state: "checked",
      freshness: "current", source_url: brandRegistrySourceUrl(target, "verisign-rdap", "rdap"), observed_at: sourceDate,
      statement: "domain_registered", origin: "provider_observation" } : { id: `check:domain:${target}`, target, kind: "domain",
      state: "unknown", freshness: "unknown", source_url: null, observed_at: null, statement: "domain_check_unavailable", origin: "none" });
  } });
  const developmentChecks = createBrandChecksStore({ pool, environment: () => ({ VERCEL: "1", VERCEL_ENV: "development" }), checker: async () => { throw new Error("Must not call provider"); } });
  const assessment = { brand_name: "Example", identity_label: "example", primary_domain: "example.com", domains: ["example.com", "example.co.uk"],
    socials: [{ platform: "github" as const, handle: "example" }], markets: ["SE" as const], observations: [{ target_id: "domain:example.com",
      status: "reported_owned" as const, reported_at: sourceDate, source_url: "https://example.com/about" }] };
  try {
    phase = "schema_and_synthetic_setup";
    check((await pool.query("SELECT to_regclass('sajda.brand_check_runs') IS NOT NULL AS ready")).rows[0].ready === true);
    for (const account of allocated) {
      setupAttempted = true;
      await pool.query('INSERT INTO public.sajda_auth_user(id,name,email,"emailVerified") VALUES($1,$2,$3,true)',
        [account, "Synthetic brand-check persistence fixture", email(account)]);
    }
    await reports.save(owner, { id: reportId, requestKey: randomUUID(), expectedVersion: 0, title: "Synthetic source history", assessment });
    const start = brandChecksStartSchema.parse({ reportId, expectedVersion: 1, requestKey: randomUUID() });
    phase = "atomic_reservation_concurrent_retry";
    const firstPromise = checks.start(owner, start); inFlight = firstPromise;
    await Promise.race([checkerEntered, firstPromise.then(() => { throw new Error("Synthetic checker did not enter its paused state"); })]);
    const retry = await checks.start(owner, start); check(retry.status === "pending" && retry.entries.length === 0);
    await assert.rejects(() => checks.start(owner, { ...start, requestKey: randomUUID() }), { code: "check_pending" });
    check(checkerCalls === 1);
    await reports.save(owner, { id: reportId, requestKey: randomUUID(), expectedVersion: 1, title: "Changed while source check runs", assessment });
    check(finish); finish(); const first = await firstPromise; check(first.status === "completed" && first.reportVersion === 1 && first.entries.length === 2);
    check(first.entries[0].observed_at === sourceDate || first.entries[1].observed_at === sourceDate);
    assert.deepEqual(await checks.start(owner, start), first);
    await assert.rejects(() => checks.start(owner, { ...start, expectedVersion: 2 }), { code: "check_request_conflict" });
    await assert.rejects(() => checks.start(owner, { ...start, requestKey: randomUUID() }), { code: "report_conflict" });
    phase = "ownership_namespace_and_immutable_terminal";
    for (const operation of [() => checks.start(other, start), () => checks.history(other, brandChecksHistorySelectorSchema.parse({ reportId })),
      () => developmentChecks.start(owner, start), () => developmentChecks.history(owner, brandChecksHistorySelectorSchema.parse({ reportId }))]) {
      await assert.rejects(operation, { code: "report_not_found" });
    }
    await assert.rejects(() => pool.query("UPDATE sajda.brand_check_runs SET entries='[]'::jsonb WHERE namespace='preview' AND owner_id=$1 AND id=$2", [owner, start.requestKey]));
    await assert.rejects(() => pool.query("UPDATE sajda.brand_check_runs SET report_version=2 WHERE namespace='preview' AND owner_id=$1 AND id=$2", [owner, start.requestKey]));
    phase = "stuck_reservation_expiry_without_provider_retry";
    const stuck = { reportId, expectedVersion: 2, requestKey: randomUUID() }, inputHash = createHash("sha256").update(JSON.stringify(stuck)).digest("hex");
    const expired = await pool.query(`INSERT INTO sajda.brand_check_runs(namespace,owner_id,id,report_id,report_version,input_hash,targets,methodology_version,
      requested_at,lease_expires_at) VALUES('preview',$1,$2,$3,2,$4,$5::jsonb,$6,statement_timestamp()-interval '6 minutes',statement_timestamp()-interval '1 minute')
      RETURNING requested_at,lease_expires_at`, [owner, stuck.requestKey, reportId, inputHash, JSON.stringify([...assessment.domains].sort()), BRAND_CHECK_METHODOLOGY_VERSION]);
    const retained = await checks.start(owner, stuck); check(retained.status === "failed" && retained.failureCode === "check_interrupted" && retained.entries.length === 0);
    check(retained.completedAt === expired.rows[0].lease_expires_at.toISOString() && checkerCalls === 1);
    assert.deepEqual(await checks.start(owner, stuck), retained);
    phase = "daily_atomic_limit_and_history_pages";
    for (let index = 0; index < 8; index++) await checks.start(owner, { reportId, expectedVersion: 2, requestKey: randomUUID() });
    await assert.rejects(() => checks.start(owner, { reportId, expectedVersion: 2, requestKey: randomUUID() }), { code: "check_daily_limit" });
    const page = await checks.history(owner, brandChecksHistorySelectorSchema.parse({ reportId, offset: 0, limit: 3 }));
    check(page.total === 10 && page.runs.length === 3 && page.hasMore);
    const last = await checks.history(owner, brandChecksHistorySelectorSchema.parse({ reportId, offset: 9, limit: 3 }));
    check(last.total === 10 && last.runs.length === 1 && !last.hasMore);
    phase = "timestamp_age_and_report_integrity";
    now += NAME_PACKAGE_EVIDENCE_MAX_AGE_MS + 1;
    const oldVersion = await checks.history(owner, brandChecksHistorySelectorSchema.parse({ reportId, version: 1 }));
    check(oldVersion.total === 1 && oldVersion.runs[0].completedAt === first.completedAt && oldVersion.runs[0].requestedAt === first.requestedAt);
    const aged = oldVersion.runs[0].entries.find(entry => entry.target === "example.com")!;
    check(aged.freshness === "stale" && aged.state === "unknown" && aged.observed_at === sourceDate
      && aged.source_url === brandRegistrySourceUrl("example.com", "verisign-rdap", "rdap"));
    check(Number(checkerCalls) === 9);
    const saved = await reports.get(owner, { id: reportId }); assert.deepEqual(saved.assessment, assessment); check(saved.result.index.verified_score === null);
    phase = "explicit_hundred_record_capacity";
    // Synthetic interrupted reservations fill only this disposable report's cap;
    // no provider calls or asserted checked observations are created here.
    for (let index = 0; index < 90; index++) {
      await pool.query(`INSERT INTO sajda.brand_check_runs(namespace,owner_id,id,report_id,report_version,input_hash,targets,methodology_version,status,
        requested_at,lease_expires_at,completed_at,failure_code) VALUES('preview',$1,$2,$3,2,$4,$5::jsonb,$6,'failed',
        statement_timestamp()-interval '2 days',statement_timestamp()-interval '2 days'+interval '5 minutes',
        statement_timestamp()-interval '2 days'+interval '5 minutes','check_interrupted')`,
      [owner, randomUUID(), reportId, "0".repeat(64), JSON.stringify([...assessment.domains].sort()), BRAND_CHECK_METHODOLOGY_VERSION]);
    }
    await assert.rejects(() => checks.start(owner, { reportId, expectedVersion: 2, requestKey: randomUUID() }), { code: "check_limit_reached" });
    check((await checks.history(owner, brandChecksHistorySelectorSchema.parse({ reportId, offset: 99, limit: 20 }))).runs.length === 1);
    console.info(JSON.stringify({ event: "brand_checks_preview_postgres_verified", reservationsSerialized: true, providerOutsideLocks: true,
      sameKeyNoDuplicateChecker: true, lateReceiptImmutable: true, exactSavedScope: true, latestVersionRequired: true,
      ownerAndNamespaceIsolated: true, terminalMutationRejected: true, expiredRunNoAutomaticRetry: true,
      originalDatesPreserved: true, dailyAndRecordCaps: true, paginationComplete: true,
      syntheticCheckerInvocations: checkerCalls, actualProviderCalls: 0, emailCalls: 0, productionWrites: 0 }));
  } finally {
    const checkPhase = phase;
    phase = "fixture_cleanup";
    try {
      // Drain a paused synthetic checker even after an assertion fails. Attach
      // rejection handling before waiting, so reservation failure reaches finally.
      finish?.(); await inFlight?.catch(() => undefined);
      let removed = 0;
      for (const account of allocated) removed += (await pool.query("DELETE FROM public.sajda_auth_user WHERE id=$1 AND email=$2", [account, email(account)])).rowCount ?? 0;
      const hashes = allocated.map(account => createHash("sha256").update(`brand-checks:preview:${account}`).digest("hex"));
      await pool.query("DELETE FROM sajda.function_rate_limits WHERE scope='brand-checks' AND subject_hash=ANY($1::text[])", [hashes]);
      check((await pool.query("SELECT count(*)::integer AS total FROM sajda.function_rate_limits WHERE scope='brand-checks' AND subject_hash=ANY($1::text[])", [hashes])).rows[0].total === 0);
      check((await pool.query("SELECT count(*)::integer AS total FROM public.sajda_auth_user WHERE id=ANY($1::text[])", [allocated])).rows[0].total === 0);
      for (const table of ["brand_reports", "brand_report_versions", "brand_report_requests", "brand_check_runs"]) {
        check((await pool.query(`SELECT count(*)::integer AS total FROM sajda.${table} WHERE owner_id=ANY($1::text[])`, [allocated])).rows[0].total === 0);
      }
      cleanupConfirmed = true;
      console.info(JSON.stringify({ event: "brand_checks_preview_cleanup_verified", retiredFixtures: removed, remainingFixtures: 0 }));
      phase = checkPhase;
    } finally { await pool.end(); }
  }
}
main().catch(() => {
  console.error(JSON.stringify({ event: "brand_checks_preview_probe_failed", phase, cleanupRequired: setupAttempted,
    cleanupConfirmed: !setupAttempted || cleanupConfirmed, rawPrivateDetailsSuppressed: true })); process.exitCode = 1;
});
