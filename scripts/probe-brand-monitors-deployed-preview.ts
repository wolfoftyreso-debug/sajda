import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { parseEnv } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Pool } from "pg";
import { createDeveloperApiKeyService } from "../api/_shared/developer-api-keys.js";
import { brandMonitorsMutationSchema, brandMonitorsResponseSchema, brandMonitorMutationResponseSchema } from "../shared/brand-monitors.js";
import { brandReportResponseSchema } from "../shared/brand-reports.js";
import { parseVercelHttpResponse } from "./runtime-http.mjs";

// Exact protected preview only; operator independently verifies preview target
// and Git SHA. Secrets are read from runtime memory and curl stdin only. This
// executes two bounded real registry attempts plus one explicitly synthetic
// alert acknowledgment fixture, not an asserted real-world status change.
let phase = "configuration", setupAttempted = false, cleanupConfirmed = false;
function check(value: unknown): asserts value { assert.ok(value); }
const quote = (value: string) => `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", "\\n").replaceAll("\r", "\\r").replaceAll("\t", "\\t")}"`;
async function main() {
  check(process.env.SAJDA_BRAND_MONITORS_PREVIEW_TEST === "1" && !process.env.VERCEL);
  const secret = process.env.SAJDA_BRAND_MONITOR_CRON_SECRET;
  check(typeof secret === "string" && secret.length >= 32 && secret.length <= 256);
  const args = new Map(process.argv.slice(2).map(value => { const split = value.indexOf("="); check(split > 0); return [value.slice(0, split), value.slice(split + 1)]; }));
  const keys = ["--preview-env", "--production-env", "--preview-host", "--preview-origin", "--vercel-cli"];
  check(args.size === 5 && process.argv.slice(2).length === 5 && [...args.keys()].every(key => keys.includes(key)));
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
  const origin = new URL(args.get("--preview-origin") ?? "");
  check(origin.protocol === "https:" && /^sajda-[a-z0-9]{9}-hypbit\.vercel\.app$/u.test(origin.hostname)
    && origin.pathname === "/" && !origin.search && !origin.hash && !origin.username && !origin.password && !origin.port);
  const cli = await realpath(path.resolve(args.get("--vercel-cli") ?? "")); check(cli.replaceAll("\\", "/").endsWith("/node_modules/vercel/dist/vc.js"));
  const project = JSON.parse(await readFile(path.join(exportsRoot, "project.json"), "utf8"));
  check(project.projectId === "prj_UO900Jp4qJF1eS4hkOrebIzwMVlI" && project.orgId === "team_GP2MTfBKmxj8ajYLvQtV7clA");
  let restCalls = 0, mcpCalls = 0, cronCalls = 0;
  async function request(route: string, options: { method?: string; headers?: HeadersInit; body?: string } = {}): Promise<Response> {
    const target = new URL(route, origin); check(target.origin === origin.origin && route.startsWith("/api/") && !target.hash);
    const headers = new Headers(options.headers), pairs: [string, string][] = []; headers.forEach((value, key) => { pairs.push([key, value]); });
    check(pairs.every(([key]) => ["authorization", "content-type", "accept", "mcp-protocol-version", "mcp-session-id"].includes(key)));
    const authorization = headers.get("authorization");
    if (authorization) check(target.pathname === "/api/cron/brand-monitors" ? authorization === `Bearer ${secret}`
      : /^Bearer sj_test_[A-Za-z0-9_-]{16}_[A-Za-z0-9_-]{43}$/u.test(authorization));
    if (target.pathname === "/api/mcp") mcpCalls++; else if (target.pathname === "/api/cron/brand-monitors") cronCalls++; else restCalls++;
    const config = ["silent", "show-error", "include", "max-time = 180", `request = ${quote(options.method ?? "GET")}`,
      ...pairs.map(([key, value]) => `header = ${quote(`${key}: ${value}`)}`), ...(options.body === undefined ? [] : [`data-binary = ${quote(options.body)}`])].join("\n") + "\n";
    const raw = await new Promise<string>((resolve, reject) => {
      const child = spawn(process.execPath, [cli, "curl", `${target.pathname}${target.search}`, "--deployment", origin.origin, "--", "--config", "-"],
        { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
      const chunks: Buffer[] = []; let bytes = 0, ended = false;
      const finish = (failed: boolean) => { if (ended) return; ended = true; clearTimeout(timer);
        if (failed) { child.kill(); reject(new Error("Protected preview transport unavailable")); } else resolve(Buffer.concat(chunks).toString("utf8")); };
      const timer = setTimeout(() => finish(true), 195000);
      child.stdout.on("data", (chunk: Buffer) => { bytes += chunk.length; if (bytes > 4 * 1024 * 1024) finish(true); else chunks.push(chunk); });
      child.stderr.on("data", () => { /* Drain without exposing credentials or CLI state. */ });
      child.once("error", () => finish(true)); child.once("close", code => finish(code !== 0)); child.stdin.once("error", () => finish(true)); child.stdin.end(config);
    });
    return parseVercelHttpResponse(raw);
  }
  phase = "protected_preview_health"; check((await request("/api/health")).status === 200);
  database.searchParams.set("sslmode", "verify-full"); database.searchParams.delete("options");
  const db = new Pool({ connectionString: database.toString(), max: 3, connectionTimeoutMillis: 8000, query_timeout: 10000 });
  const owner = randomUUID(), other = randomUUID(), allocated = [owner, other], reportId = randomUUID(), clients: Client[] = [];
  const email = (id: string) => `brand-monitor-deployed-${id}@example.test`;
  try {
    phase = "synthetic_setup";
    check((await db.query("SELECT to_regclass('sajda.brand_monitors') IS NOT NULL AS ready")).rows[0].ready === true);
    check((await db.query("SELECT count(*)::integer AS total FROM sajda.brand_monitor_worker_leases WHERE namespace='preview'")).rows[0].total === 0);
    for (const id of allocated) { setupAttempted = true; await db.query('INSERT INTO public.sajda_auth_user(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [id, "Synthetic deployed monitor fixture", email(id)]); }
    await db.query("INSERT INTO sajda.commerce_customers(namespace,owner_id,customer_key) VALUES('preview',$1,$2)", [owner, randomUUID()]);
    await db.query(`INSERT INTO sajda.commerce_access(namespace,owner_id,subscription_id,price_id,invoice_id,livemode,valid_from,expires_at,plan)
      VALUES('preview',$1,'sub_SyntheticDeployedMonitor','price_SyntheticDeployedMonitor','in_SyntheticDeployedMonitor',false,
        statement_timestamp()-interval '1 minute',statement_timestamp()+interval '1 day','premium')`, [owner]);
    const keyService = createDeveloperApiKeyService({ pool: db, environment: () => ({ VERCEL: "1", VERCEL_ENV: "preview" }) });
    const full = await keyService.create({ id: owner, emailVerified: true }, { name: "Synthetic monitor full", scopes: ["projects:read", "projects:write", "domains:search"], expiresInDays: 1 });
    const noDomain = await keyService.create({ id: owner, emailVerified: true }, { name: "Synthetic monitor account-only", scopes: ["projects:read", "projects:write"], expiresInDays: 1 });
    const foreign = await keyService.create({ id: other, emailVerified: true }, { name: "Synthetic monitor foreign", scopes: ["projects:read", "projects:write", "domains:search"], expiresInDays: 1 });
    const authenticated = (key: string, body?: unknown) => ({ headers: { authorization: `Bearer ${key}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
      ...(body === undefined ? {} : { method: "POST", body: JSON.stringify(body) }) });
    const report = { id: reportId, requestKey: randomUUID(), expectedVersion: 0, title: "Synthetic deployed daily monitor",
      assessment: { brand_name: "Example", identity_label: "example", primary_domain: "example.com", domains: ["example.com", "example.co.uk"],
        socials: [{ platform: "github", handle: "example" }], markets: ["US"], observations: [] } };
    phase = "REST_enable_scope_and_private_boundaries";
    const saved = await request("/api/v1/account?resource=brand-reports", authenticated(full.apiKey, { report })); check(saved.status === 200);
    check(brandReportResponseSchema.parse(await saved.json()).report.result.index.verified_score === null);
    const command = { action: "enable", reportId, expectedReportVersion: 1, expectedMonitorVersion: 0, requestKey: randomUUID() };
    check((await request("/api/v1/account?resource=brand-monitors", authenticated(noDomain.apiKey, command))).status === 403);
    const enabledResponse = await request("/api/v1/account?resource=brand-monitors", authenticated(full.apiKey, command)); check(enabledResponse.status === 200);
    const enabled = brandMonitorMutationResponseSchema.parse(await enabledResponse.json()); check(enabled.monitor.version === 1);
    check((await request(`/api/v1/account?resource=brand-monitors&reportId=${reportId}`, authenticated(foreign.apiKey))).status === 404);
    check((await request(`/api/account/brand-monitors?reportId=${reportId}`, authenticated(full.apiKey))).status === 401);
    check((await request("/api/v1/account?resource=brand-monitors", authenticated(full.apiKey, { ...command, baseline: {} }))).status === 400);
    const read = async () => { const res = await request(`/api/v1/account?resource=brand-monitors&reportId=${reportId}`, authenticated(full.apiKey)); check(res.status === 200); return brandMonitorsResponseSchema.parse(await res.json()); };
    check((await read()).cronScheduled === false);
    phase = "explicit_preview_cron_real_registry_baseline";
    check((await request("/api/cron/brand-monitors")).status === 401);
    check((await request("/api/cron/brand-monitors?ownerId=forged", { headers: { authorization: `Bearer ${secret}` } })).status === 400);
    // Never let this test's actual cron invocation select a real customer.
    check((await db.query("SELECT count(*)::integer AS total FROM sajda.brand_monitors WHERE namespace='preview' AND owner_id<>ALL($1::text[]) AND status='active' AND next_due_at<=statement_timestamp()", [allocated])).rows[0].total === 0);
    const firstTick = await request("/api/cron/brand-monitors", { headers: { authorization: `Bearer ${secret}` } }); check(firstTick.status === 200);
    const firstTickData = await firstTick.json(); check(firstTickData.processed === 1 && firstTickData.alerts === 0);
    const first = await read(); check(first.monitor?.lastRunStatus === "completed" && first.total === 0 && first.monitor.lastRunId && first.monitor.lastRunCoverage);
    const sourceRows = await db.query("SELECT entries,completed_at FROM sajda.brand_check_runs WHERE namespace='preview' AND owner_id=$1 AND id=$2", [owner, first.monitor.lastRunId]);
    check(sourceRows.rows.length === 1 && sourceRows.rows[0].entries.length === 2);
    const unsupported = sourceRows.rows[0].entries.find((item: { target: string }) => item.target === "example.co.uk");
    check(unsupported.state === "unknown" && unsupported.observed_at === null && unsupported.source_url === null);
    phase = "private_MCP_catalogue_pause_without_domain_scope_resume_and_receipt";
    async function connect(key: string) {
      const client = new Client({ name: "sajda-synthetic-monitor-preview", version: "1.0.0" }); clients.push(client);
      const cliFetch: typeof fetch = async (input, init) => { const req = new Request(input, init), target = new URL(req.url); check(target.origin === origin.origin);
        return request(`${target.pathname}${target.search}`, { method: req.method, headers: req.headers, ...(["GET", "HEAD"].includes(req.method) ? {} : { body: await req.text() }) }); };
      await client.connect(new StreamableHTTPClientTransport(new URL("/api/mcp", origin), { requestInit: { headers: { authorization: `Bearer ${key}` } }, fetch: cliFetch })); return client;
    }
    const client = await connect(full.apiKey), limited = await connect(noDomain.apiKey), catalogue = await client.listTools(); check(catalogue.tools.length === 31);
    for (const name of ["brand_monitors_get", "brand_monitors_configure", "brand_monitors_pause", "brand_monitor_alerts_acknowledge"]) check(catalogue.tools.some(tool => tool.name === name && tool.outputSchema));
    async function call(tool: string, input: Record<string, unknown>, selected = client) {
      const result = await selected.callTool({ name: tool, arguments: input });
      const envelope = result.structuredContent as { ok: boolean; status: number; data: unknown }; check(!result.isError && envelope.ok && envelope.status === 200); return envelope.data;
    }
    const mcpRead = brandMonitorsResponseSchema.parse(await call("brand_monitors_get", { reportId })); check(mcpRead.monitor?.lastRunId === first.monitor.lastRunId);
    const pause = brandMonitorsMutationSchema.parse({ action: "pause", reportId, expectedMonitorVersion: 1, requestKey: randomUUID() });
    const paused = brandMonitorMutationResponseSchema.parse(await call("brand_monitors_pause", pause, limited)); check(paused.monitor.version === 2 && paused.monitor.status === "paused");
    const resume = { action: "resume", reportId, expectedMonitorVersion: 2, requestKey: randomUUID() };
    const rejected = await limited.callTool({ name: "brand_monitors_configure", arguments: resume }); check(rejected.isError === true && (rejected.structuredContent as { status: number }).status === 403);
    const resumed = brandMonitorMutationResponseSchema.parse(await call("brand_monitors_configure", resume)); check(resumed.monitor.version === 3 && resumed.monitor.status === "active");
    assert.deepEqual(brandMonitorMutationResponseSchema.parse(await call("brand_monitors_configure", resume)).monitor, resumed.monitor);
    check(Date.parse(resumed.monitor.nextDueAt!) >= Date.parse(resumed.monitor.lastAttemptAt!) + 86400000);
    phase = "explicit_unknown_only_rebind_and_original_scope_history";
    const edited = await request("/api/v1/account?resource=brand-reports", authenticated(full.apiKey, { report: { ...report, expectedVersion: 1, requestKey: randomUUID(),
      assessment: { ...report.assessment, primary_domain: "example.co.uk", domains: ["example.co.uk"] } } })); check(edited.status === 200);
    const oldScope = await read(); check(oldScope.monitor?.pauseReason === "report_changed");
    const rebound = brandMonitorMutationResponseSchema.parse(await call("brand_monitors_configure", { action: "rebind", reportId,
      expectedMonitorVersion: oldScope.monitor.version, expectedReportVersion: 2, requestKey: randomUUID() })); check(rebound.monitor.baselineCount === 0);
    check((await db.query("SELECT count(*)::integer AS total FROM sajda.brand_monitors WHERE namespace='preview' AND owner_id<>ALL($1::text[]) AND status='active' AND next_due_at<=statement_timestamp()", [allocated])).rows[0].total === 0);
    const secondTick = await request("/api/cron/brand-monitors", { headers: { authorization: `Bearer ${secret}` } }); check(secondTick.status === 200);
    const secondData = await secondTick.json(); check(secondData.processed === 1 && secondData.alerts === 0);
    const unknown = await read(); check(unknown.monitor?.lastRunCoverage?.checked === 0 && unknown.monitor.lastRunCoverage.unknown === 1 && unknown.monitor.baselineCount === 0 && unknown.total === 0);
    phase = "synthetic_alert_acknowledgment_and_Free_retained_history";
    const alertId = randomUUID(), source = "https://rdap.verisign.com/com/v1/domain/example.com", previous = new Date(Date.now() - 86400000).toISOString(), current = new Date(Date.now() - 60000).toISOString();
    await db.query(`INSERT INTO sajda.brand_monitor_alerts(namespace,owner_id,id,report_id,report_version,monitor_version,run_id,target,previous_observation,current_observation)
      VALUES('preview',$1,$2,$3,1,1,$4,'example.com',$5::jsonb,$6::jsonb)`, [owner, alertId, reportId, first.monitor.lastRunId,
      JSON.stringify({ status: "available", observedAt: previous, sourceUrl: source }), JSON.stringify({ status: "registered", observedAt: current, sourceUrl: source })]);
    await db.query("DELETE FROM sajda.commerce_access WHERE namespace='preview' AND owner_id=$1", [owner]);
    const free = await read(); check(free.currentPlan === "free" && free.monitor?.pauseReason === "plan_limit" && free.total === 1);
    const acknowledgment = brandMonitorsMutationSchema.parse({ action: "ack", reportId, alertId, requestKey: randomUUID() });
    const ack = brandMonitorMutationResponseSchema.parse(await call("brand_monitor_alerts_acknowledge", acknowledgment, limited));
    check(ack.acknowledgedAlert?.id === alertId && ack.acknowledgedAlert.acknowledgedAt && ack.acknowledgedAlert.reportVersion === 1);
    console.info(JSON.stringify({ event: "brand_monitors_deployed_preview_verified", restCalls, mcpCalls, cronCalls, discoveredTools: 31,
      actualRuntimeRegistryAttempts: 2, firstCheckCoverage: first.monitor.lastRunCoverage, secondCheckCoverage: unknown.monitor.lastRunCoverage,
      firstSampleNoAlert: true, unknownOnlyNotCalledUnchanged: true, explicitPreviewTickNotAutomaticSchedule: true,
      actualMembershipDowngrade: true, configureRequiresDomainScope: true, pauseAndAckWithoutDomainScope: true,
      exactMutationReceipt: true, resumeCadenceEnforced: true, oldVersionHistoryRetained: true,
      syntheticAlertFixtures: 1, assertedRealRegistrationChanges: 0, actualBrowserLoginTested: false, emailCalls: 0, paymentCalls: 0, productionWrites: 0 }));
  } finally {
    const savedPhase = phase; phase = "fixture_cleanup"; for (const client of clients) await client.close().catch(() => undefined);
    try {
      let retired = 0; for (const id of allocated) retired += (await db.query("DELETE FROM public.sajda_auth_user WHERE id=$1 AND email=$2", [id, email(id)])).rowCount ?? 0;
      const quotas = allocated.map(id => createHash("sha256").update(`account:${id}`).digest("hex"));
      await db.query("DELETE FROM sajda.developer_api_quotas WHERE namespace='preview' AND subject_hash=ANY($1::text[])", [quotas]);
      check((await db.query("SELECT count(*)::integer AS total FROM sajda.developer_api_quotas WHERE namespace='preview' AND subject_hash=ANY($1::text[])", [quotas])).rows[0].total === 0);
      for (const scope of ["brand-reports", "brand-checks", "brand-monitors", "account-membership"]) {
        const hashes = allocated.map(id => createHash("sha256").update(`${scope}:preview:${id}`).digest("hex"));
        await db.query("DELETE FROM sajda.function_rate_limits WHERE scope=$1 AND subject_hash=ANY($2::text[])", [scope, hashes]);
        check((await db.query("SELECT count(*)::integer AS total FROM sajda.function_rate_limits WHERE scope=$1 AND subject_hash=ANY($2::text[])", [scope, hashes])).rows[0].total === 0);
      }
      check((await db.query("SELECT count(*)::integer AS total FROM public.sajda_auth_user WHERE id=ANY($1::text[])", [allocated])).rows[0].total === 0);
      for (const table of ["developer_api_keys", "brand_reports", "brand_report_versions", "brand_report_requests", "brand_check_runs", "brand_monitors", "brand_monitor_alerts", "brand_monitor_requests", "commerce_customers", "commerce_access"]) {
        check((await db.query(`SELECT count(*)::integer AS total FROM sajda.${table} WHERE owner_id=ANY($1::text[])`, [allocated])).rows[0].total === 0);
      }
      // A scheduler lease is not account-owned. Never delete an unidentified
      // token after an ambiguous network outcome. The server's exact token
      // release or five-minute expiry must resolve it before this probe passes.
      check((await db.query("SELECT count(*)::integer AS total FROM sajda.brand_monitor_worker_leases WHERE namespace='preview'")).rows[0].total === 0);
      cleanupConfirmed = true; console.info(JSON.stringify({ event: "brand_monitors_deployed_preview_cleanup_verified", retiredFixtures: retired, remainingFixtures: 0 })); phase = savedPhase;
    } finally { await db.end(); }
  }
}
main().catch(() => { console.error(JSON.stringify({ event: "brand_monitors_deployed_preview_probe_failed", phase, cleanupRequired: setupAttempted,
  cleanupConfirmed: !setupAttempted || cleanupConfirmed, rawPrivateDetailsSuppressed: true })); process.exitCode = 1; });
