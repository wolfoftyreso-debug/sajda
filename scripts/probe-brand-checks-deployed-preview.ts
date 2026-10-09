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
import { brandCheckResponseSchema, brandChecksHistoryResponseSchema, type BrandCheckRun } from "../shared/brand-checks.js";
import { brandReportResponseSchema } from "../shared/brand-reports.js";
import { parseVercelHttpResponse } from "./runtime-http.mjs";

// Exact protected preview only. Tokens/request bodies remain in curl stdin,
// never process arguments/files/logs. Two disposable account fixtures; no auth
// session, email, payment, production mutation or uncontrolled scraping.
// Operator precondition: independently inspect the selected deployment's Git
// SHA and preview target before execution. This script fences its exact supplied
// hostname, linked project and isolated database; it does not verify Git SHA.
let phase = "configuration", setupAttempted = false, cleanupVerified = false, cleanupFailed = false;
function check(condition: unknown): asserts condition { assert.ok(condition); }
const curlQuote = (value: string) => `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')
  .replaceAll("\n", "\\n").replaceAll("\r", "\\r").replaceAll("\t", "\\t")}"`;
function validateRun(run: BrandCheckRun, reportId: string, requestKey: string, version: number) {
  check(run.id === requestKey && run.reportId === reportId && run.reportVersion === version && run.status !== "pending");
  if (run.status === "completed") {
    assert.deepEqual(run.entries.map(entry => entry.target).sort(), ["example.co.uk", "example.com"]);
    const unsupported = run.entries.find(entry => entry.target === "example.co.uk")!;
    check(unsupported.state === "unknown" && unsupported.origin === "none" && unsupported.observed_at === null && unsupported.source_url === null);
    const com = run.entries.find(entry => entry.target === "example.com")!;
    if (com.state === "checked") check(com.statement === "domain_registered" && com.origin === "provider_observation"
      && com.source_url === "https://rdap.verisign.com/com/v1/domain/example.com" && com.observed_at !== null);
  } else check(run.entries.length === 0 && run.failureCode !== null);
}
async function main() {
  check(process.env.SAJDA_BRAND_CHECKS_PREVIEW_TEST === "1" && !process.env.VERCEL);
  const keys = ["--preview-env", "--production-env", "--preview-host", "--preview-origin", "--vercel-cli"];
  const args = new Map(process.argv.slice(2).map(argument => {
    const separator = argument.indexOf("="); check(separator > 0);
    return [argument.slice(0, separator), argument.slice(separator + 1)] as const;
  }));
  check(process.argv.slice(2).length === 5 && args.size === 5 && [...args.keys()].every(key => keys.includes(key)));
  const exportsRoot = await realpath(path.resolve(".vercel"));
  async function load(key: string, name: string) {
    const filename = await realpath(path.resolve(args.get(key) ?? "")); check(filename === path.join(exportsRoot, name));
    return parseEnv(await readFile(filename, "utf8"));
  }
  const preview = await load("--preview-env", ".env.brand-checks.preview.local"), production = await load("--production-env", ".env.brand-checks.production.local");
  check(preview.DATABASE_URL && production.DATABASE_URL && preview.SAJDA_BRAND_REPORTS_ENABLED === "true" && preview.SAJDA_BRAND_CHECKS_ENABLED === "true");
  const database = new URL(preview.DATABASE_URL), productionDatabase = new URL(production.DATABASE_URL);
  check(["postgres:", "postgresql:"].includes(database.protocol) && database.hostname.endsWith(".neon.tech") && database.hostname === args.get("--preview-host"));
  check(`${database.hostname.replace("-pooler.", ".")}${database.pathname}` !== `${productionDatabase.hostname.replace("-pooler.", ".")}${productionDatabase.pathname}`);
  const origin = new URL(args.get("--preview-origin") ?? "");
  check(origin.protocol === "https:" && /^sajda-[a-z0-9]{9}-hypbit\.vercel\.app$/u.test(origin.hostname)
    && origin.pathname === "/" && !origin.search && !origin.hash && !origin.username && !origin.password && !origin.port);
  const cli = await realpath(path.resolve(args.get("--vercel-cli") ?? "")); check(cli.replaceAll("\\", "/").endsWith("/node_modules/vercel/dist/vc.js"));
  const linked = JSON.parse(await readFile(path.join(exportsRoot, "project.json"), "utf8"));
  check(linked.projectId === "prj_UO900Jp4qJF1eS4hkOrebIzwMVlI" && linked.orgId === "team_GP2MTfBKmxj8ajYLvQtV7clA");
  let restCalls = 0, mcpCalls = 0;
  async function request(route: string, options: { method?: string; headers?: HeadersInit; body?: string } = {}): Promise<Response> {
    const target = new URL(route, origin); check(target.origin === origin.origin && route.startsWith("/api/") && !target.hash);
    const headers = new Headers(options.headers);
    const headerPairs: [string, string][] = [];
    headers.forEach((value, name) => { headerPairs.push([name, value]); });
    check(headerPairs.every(([name]) => ["authorization", "content-type", "accept", "mcp-protocol-version", "mcp-session-id"].includes(name)));
    const token = headers.get("authorization"); check(!token || /^Bearer sj_test_[A-Za-z0-9_-]{16}_[A-Za-z0-9_-]{43}$/u.test(token));
    if (target.pathname === "/api/mcp") mcpCalls++; else restCalls++;
    const config = ["silent", "show-error", "include", "max-time = 60", `request = ${curlQuote(options.method ?? "GET")}`,
      ...headerPairs.map(([name, value]) => `header = ${curlQuote(`${name}: ${value}`)}`),
      ...(options.body === undefined ? [] : [`data-binary = ${curlQuote(options.body)}`])].join("\n") + "\n";
    const stdout = await new Promise<string>((resolve, reject) => {
      // The installed CLI rejects --non-interactive for curl. Pipe/non-TTY,
      // authenticated linked-project fencing and exact deployment are retained.
      const child = spawn(process.execPath, [cli, "curl", `${target.pathname}${target.search}`, "--deployment", origin.origin,
        "--", "--config", "-"], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
      const chunks: Buffer[] = []; let bytes = 0, ended = false;
      const finish = (failure: boolean) => {
        if (ended) return; ended = true; clearTimeout(timer);
        if (failure) { child.kill(); reject(new Error("Protected preview transport unavailable")); }
        else resolve(Buffer.concat(chunks).toString("utf8"));
      };
      const timer = setTimeout(() => finish(true), 75_000);
      child.stdout.on("data", (chunk: Buffer) => { bytes += chunk.length; if (bytes > 4 * 1024 * 1024) finish(true); else chunks.push(chunk); });
      child.stderr.on("data", () => { /* Drain; never expose private CLI state. */ });
      child.once("error", () => finish(true)); child.once("close", code => finish(code !== 0));
      child.stdin.once("error", () => finish(true)); child.stdin.end(config);
    });
    return parseVercelHttpResponse(stdout);
  }
  phase = "protected_preview_stdin_health"; check((await request("/api/health")).status === 200);
  database.searchParams.set("sslmode", "verify-full"); database.searchParams.delete("options");
  const pool = new Pool({ connectionString: database.toString(), max: 3, connectionTimeoutMillis: 8000, query_timeout: 10000 });
  const owner = randomUUID(), other = randomUUID(), reportId = randomUUID(), allocated = [owner, other], clients: Client[] = [];
  const email = (account: string) => `brand-check-deployed-${account}@example.test`;
  try {
    phase = "synthetic_setup"; check((await pool.query("SELECT to_regclass('sajda.brand_check_runs') IS NOT NULL AS ready")).rows[0].ready === true);
    for (const account of allocated) {
      setupAttempted = true;
      await pool.query('INSERT INTO public.sajda_auth_user(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [account, "Synthetic deployed brand-check fixture", email(account)]);
    }
    const keyService = createDeveloperApiKeyService({ pool, environment: () => ({ VERCEL: "1", VERCEL_ENV: "preview" }) });
    const full = await keyService.create({ id: owner, emailVerified: true }, { name: "Synthetic checks full", scopes: ["projects:read", "projects:write", "domains:search"], expiresInDays: 1 });
    const readonly = await keyService.create({ id: owner, emailVerified: true }, { name: "Synthetic checks read", scopes: ["projects:read"], expiresInDays: 1 });
    const noDomain = await keyService.create({ id: owner, emailVerified: true }, { name: "Synthetic checks missing domain scope", scopes: ["projects:read", "projects:write"], expiresInDays: 1 });
    const foreign = await keyService.create({ id: other, emailVerified: true }, { name: "Synthetic checks foreign", scopes: ["projects:read", "projects:write", "domains:search"], expiresInDays: 1 });
    const authenticated = (apiKey: string, body?: unknown) => ({ headers: { authorization: `Bearer ${apiKey}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }) }, ...(body === undefined ? {} : { method: "POST", body: JSON.stringify(body) }) });
    const at = new Date().toISOString(), report = { id: reportId, requestKey: randomUUID(), expectedVersion: 0, title: "Synthetic source provenance",
      assessment: { brand_name: "Example", identity_label: "example", primary_domain: "example.com", domains: ["example.com", "example.co.uk"],
        socials: [{ platform: "github", handle: "example" }], markets: ["SE"], observations: [{ target_id: "domain:example.com",
          status: "reported_owned", reported_at: at, source_url: "https://example.com/about" }] } };
    phase = "rest_save_and_registry_check_v1";
    const savedResponse = await request("/api/v1/account?resource=brand-reports", authenticated(full.apiKey, { report })); check(savedResponse.status === 200);
    const saved = brandReportResponseSchema.parse(await savedResponse.json()); check(saved.accountId === owner && saved.report.version === 1 && saved.report.result.index.verified_score === null);
    const checkInput = { reportId, expectedVersion: 1, requestKey: randomUUID() };
    const firstResponse = await request("/api/v1/account?resource=brand-checks", authenticated(full.apiKey, checkInput)); check(firstResponse.status === 200);
    const first = brandCheckResponseSchema.parse(await firstResponse.json()); check(first.accountId === owner);
    validateRun(first.run, reportId, checkInput.requestKey, 1);
    phase = "rest_history_scope_cookie_and_write_boundaries";
    const [historyResponse, foreignHistory, foreignStart, scopeDenied, readonlyDenied, browserCookieOnly, forged] = await Promise.all([
      request(`/api/v1/account?resource=brand-checks&reportId=${reportId}&version=1&offset=0&limit=20`, authenticated(full.apiKey)),
      request(`/api/v1/account?resource=brand-checks&reportId=${reportId}`, authenticated(foreign.apiKey)),
      request("/api/v1/account?resource=brand-checks", authenticated(foreign.apiKey, { ...checkInput, requestKey: randomUUID() })),
      request("/api/v1/account?resource=brand-checks", authenticated(noDomain.apiKey, { ...checkInput, requestKey: randomUUID() })),
      request("/api/v1/account?resource=brand-checks", authenticated(readonly.apiKey, { ...checkInput, requestKey: randomUUID() })),
      request(`/api/account/brand-checks?reportId=${reportId}`, authenticated(full.apiKey)),
      request("/api/v1/account?resource=brand-checks", authenticated(full.apiKey, { ...checkInput, entries: [{ state: "checked" }] })),
    ]);
    check(historyResponse.status === 200 && foreignHistory.status === 404 && foreignStart.status === 404 && scopeDenied.status === 403
      && readonlyDenied.status === 403 && browserCookieOnly.status === 401 && forged.status === 400);
    const history = brandChecksHistoryResponseSchema.parse(await historyResponse.json()); check(history.accountId === owner && history.total === 1 && history.runs.length === 1);
    assert.deepEqual(history.runs[0], first.run);
    phase = "rest_report_v2_and_immutable_late_retry";
    const edited = await request("/api/v1/account?resource=brand-reports", authenticated(full.apiKey,
      { report: { ...report, title: "Synthetic second source scope", expectedVersion: 1, requestKey: randomUUID() } })); check(edited.status === 200);
    const secondReport = brandReportResponseSchema.parse(await edited.json()); check(secondReport.report.version === 2);
    const replayResponse = await request("/api/v1/account?resource=brand-checks", authenticated(full.apiKey, checkInput)); check(replayResponse.status === 200);
    const replay = brandCheckResponseSchema.parse(await replayResponse.json()); assert.deepEqual(replay.run, first.run);
    const conflict = await request("/api/v1/account?resource=brand-checks", authenticated(full.apiKey, { ...checkInput, expectedVersion: 2 })); check(conflict.status === 409);
    const stale = await request("/api/v1/account?resource=brand-checks", authenticated(full.apiKey, { ...checkInput, requestKey: randomUUID() })); check(stale.status === 409);
    async function connectMcp(apiKey: string) {
      const client = new Client({ name: "sajda-synthetic-registry-preview", version: "1.0.0" }); clients.push(client);
      const cliFetch: typeof fetch = async (input, init) => {
        const supplied = new Request(input, init), url = new URL(supplied.url); check(url.origin === origin.origin);
        return request(`${url.pathname}${url.search}`, { method: supplied.method, headers: supplied.headers,
          ...(["GET", "HEAD"].includes(supplied.method) ? {} : { body: await supplied.text() }) });
      };
      await client.connect(new StreamableHTTPClientTransport(new URL("/api/mcp", origin), { requestInit: { headers: { authorization: `Bearer ${apiKey}` } }, fetch: cliFetch }));
      return client;
    }
    phase = "private_mcp_discovery_and_typed_history";
    const client = await connectMcp(full.apiKey), catalogue = await client.listTools(); check(catalogue.tools.length === 27);
    for (const name of ["brand_checks_history", "brand_checks_start"]) check(catalogue.tools.some(tool => tool.name === name && tool.outputSchema));
    const read = await client.callTool({ name: "brand_checks_history", arguments: { reportId, version: 1, offset: 0, limit: 20 } });
    const envelope = read.structuredContent as { ok?: unknown; status?: unknown; data?: unknown };
    check(!read.isError && envelope.ok === true && envelope.status === 200);
    const typed = brandChecksHistoryResponseSchema.parse(envelope.data); check(typed.accountId === owner && typed.total === 1); assert.deepEqual(typed.runs[0], first.run);
    phase = "private_mcp_positive_check_v2_and_receipt";
    const secondInput = { reportId, expectedVersion: 2, requestKey: randomUUID() };
    const started = await client.callTool({ name: "brand_checks_start", arguments: secondInput });
    const startedEnvelope = started.structuredContent as { ok?: unknown; status?: unknown; data?: unknown };
    check(!started.isError && startedEnvelope.ok === true && startedEnvelope.status === 200);
    const second = brandCheckResponseSchema.parse(startedEnvelope.data); check(second.accountId === owner); validateRun(second.run, reportId, secondInput.requestKey, 2);
    const mcpRetry = await client.callTool({ name: "brand_checks_start", arguments: secondInput });
    const retryEnvelope = mcpRetry.structuredContent as { ok?: unknown; status?: unknown; data?: unknown };
    check(!mcpRetry.isError && retryEnvelope.ok === true && retryEnvelope.status === 200);
    assert.deepEqual(brandCheckResponseSchema.parse(retryEnvelope.data).run, second.run);
    phase = "private_mcp_missing_required_domain_scope";
    const scoped = await connectMcp(noDomain.apiKey);
    const denied = await scoped.callTool({ name: "brand_checks_start", arguments: { ...secondInput, requestKey: randomUUID() } });
    const denial = denied.structuredContent as { ok?: unknown; status?: unknown; error?: { code?: unknown } };
    check(denied.isError === true && denial.ok === false && denial.status === 403 && denial.error?.code === "insufficient_scope");
    phase = "database_rest_mcp_agreement_and_preserved_report";
    const allResponse = await request(`/api/v1/account?resource=brand-checks&reportId=${reportId}&limit=20`, authenticated(full.apiKey)); check(allResponse.status === 200);
    const all = brandChecksHistoryResponseSchema.parse(await allResponse.json()); check(all.total === 2 && all.runs.length === 2 && all.runs.every(run => run.reportId === reportId));
    const rows = await pool.query("SELECT id::text,report_version,entries,status FROM sajda.brand_check_runs WHERE namespace='preview' AND owner_id=$1 AND report_id=$2 ORDER BY report_version", [owner, reportId]);
    check(rows.rows.length === 2 && rows.rows[0].report_version === 1 && rows.rows[1].report_version === 2);
    assert.deepEqual(rows.rows[0].entries, first.run.entries); assert.deepEqual(rows.rows[1].entries, second.run.entries);
    const retainedReport = await request(`/api/v1/account?resource=brand-reports&id=${reportId}`, authenticated(full.apiKey)); check(retainedReport.status === 200);
    const retained = brandReportResponseSchema.parse(await retainedReport.json()); assert.deepEqual(retained.report.assessment, report.assessment);
    check(retained.report.version === 2 && retained.report.result.index.verified_score === null);
    console.info(JSON.stringify({ event: "brand_checks_deployed_preview_verified", restCalls, mcpCalls, discoveredTools: 27,
      bothPrivateCheckTools: true, restMcpDatabaseAgreement: true, realBoundedRegistryCheckRuns: 2,
      firstRunStatus: first.run.status, secondRunStatus: second.run.status,
      checkedObservations: [first.run, second.run].flatMap(run => run.entries).filter(entry => entry.state === "checked").length,
      unknownObservations: [first.run, second.run].flatMap(run => run.entries).filter(entry => entry.state === "unknown").length,
      unsupportedSuffixRetained: true, originalProviderDatesPreserved: true, lateRequestNoNewRun: true,
      ownerIsolation: true, additionalDomainScopeEnforced: true, callerEvidenceDenied: true, browserRequiresSession: true,
      reportDeclarationsUnchanged: true, ownershipVerified: false, legalClearance: false, continuousMonitoring: false,
      actualBrowserLoginTested: false, emailCalls: 0, paymentCalls: 0, productionWrites: 0 }));
  } finally {
    const checkPhase = phase; phase = "fixture_cleanup";
    for (const client of clients) await client.close().catch(() => undefined);
    try {
      let removed = 0;
      for (const account of allocated) removed += (await pool.query("DELETE FROM public.sajda_auth_user WHERE id=$1 AND email=$2", [account, email(account)])).rowCount ?? 0;
      const developerHashes = allocated.map(account => createHash("sha256").update(`account:${account}`).digest("hex"));
      await pool.query("DELETE FROM sajda.developer_api_quotas WHERE namespace='preview' AND subject_hash=ANY($1::text[])", [developerHashes]);
      check((await pool.query("SELECT count(*)::integer AS total FROM sajda.developer_api_quotas WHERE namespace='preview' AND subject_hash=ANY($1::text[])", [developerHashes])).rows[0].total === 0);
      for (const scope of ["brand-reports", "brand-checks"]) {
        const hashes = allocated.map(account => createHash("sha256").update(`${scope}:preview:${account}`).digest("hex"));
        await pool.query("DELETE FROM sajda.function_rate_limits WHERE scope=$1 AND subject_hash=ANY($2::text[])", [scope, hashes]);
        check((await pool.query("SELECT count(*)::integer AS total FROM sajda.function_rate_limits WHERE scope=$1 AND subject_hash=ANY($2::text[])", [scope, hashes])).rows[0].total === 0);
      }
      check((await pool.query("SELECT count(*)::integer AS total FROM public.sajda_auth_user WHERE id=ANY($1::text[])", [allocated])).rows[0].total === 0);
      for (const table of ["developer_api_keys", "brand_reports", "brand_report_versions", "brand_report_requests", "brand_check_runs"]) {
        check((await pool.query(`SELECT count(*)::integer AS total FROM sajda.${table} WHERE owner_id=ANY($1::text[])`, [allocated])).rows[0].total === 0);
      }
      cleanupVerified = true; phase = checkPhase;
      console.info(JSON.stringify({ event: "brand_checks_deployed_preview_cleanup_verified", retiredFixtures: removed, remainingFixtures: 0 }));
    } catch { cleanupFailed = true; }
    finally { await pool.end().catch(() => { cleanupFailed = true; }); }
  }
  if (cleanupFailed) throw new Error("Synthetic preview cleanup could not be confirmed");
}
main().catch(() => {
  console.error(JSON.stringify({ event: "brand_checks_deployed_preview_probe_failed", phase,
    cleanupRequired: setupAttempted, cleanupConfirmed: !setupAttempted || cleanupVerified && !cleanupFailed,
    rawPrivateDetailsSuppressed: true })); process.exitCode = 1;
});
