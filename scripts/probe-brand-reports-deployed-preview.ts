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
import { brandReportHistoryResponseSchema, brandReportResponseSchema, brandReportsListResponseSchema,
  type BrandReportSaveInput } from "../shared/brand-reports.js";
import { parseVercelHttpResponse } from "./runtime-http.mjs";
import { assertBrandPreviewFixturesAvailable, brandPreviewDatabaseTarget, brandPreviewFixture, cleanupBrandPreviewFixtures } from "./brand-preview-policy.mjs";

// This is an opt-in deployed-transport probe, not a login/email verification.
// Secrets exist only in memory and curl's stdin, never args/files/logs. Fixtures
// are unique synthetic accounts; cleanup is fenced by exact IDs AND emails.
let phase = "configuration", cleanupFailed = false, cleanupVerified = false, fixturesAttempted = 0;
function check(condition: unknown): asserts condition { assert.ok(condition); }
const curlQuote = (value: string) => `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')
  .replaceAll("\n", "\\n").replaceAll("\r", "\\r").replaceAll("\t", "\\t")}"`;
async function main() {
  check(process.env.SAJDA_BRAND_REPORTS_PREVIEW_TEST === "1" && !process.env.VERCEL);
  const args = new Map(process.argv.slice(2).map(argument => {
    const separator = argument.indexOf("="); check(separator > 0);
    return [argument.slice(0, separator), argument.slice(separator + 1)] as const;
  }));
  const keys = ["--preview-env", "--production-env", "--preview-host", "--preview-origin", "--vercel-cli"];
  check(process.argv.slice(2).length === keys.length && args.size === keys.length && [...args.keys()].every(key => keys.includes(key)));
  const exportsRoot = await realpath(path.resolve(".vercel"));
  const loadExport = async (key: string, basename: string) => {
    const filename = await realpath(path.resolve(args.get(key) ?? ""));
    check(filename === path.join(exportsRoot, basename));
    return parseEnv(await readFile(filename, "utf8"));
  };
  const preview = await loadExport("--preview-env", ".env.brand-reports.preview.local"), production = await loadExport("--production-env", ".env.brand-reports.production.local");
  check(preview.DATABASE_URL && production.DATABASE_URL && preview.SAJDA_BRAND_REPORTS_ENABLED === "true");
  const origin = new URL(args.get("--preview-origin") ?? "");
  check(origin.protocol === "https:" && /^sajda-[a-z0-9]{9}-hypbit\.vercel\.app$/u.test(origin.hostname)
    && origin.pathname === "/" && !origin.search && !origin.hash && !origin.username && !origin.password && !origin.port);
  const cli = await realpath(path.resolve(args.get("--vercel-cli") ?? ""));
  check(cli.replaceAll("\\", "/").endsWith("/node_modules/vercel/dist/vc.js"));
  const linked = JSON.parse(await readFile(path.join(exportsRoot, "project.json"), "utf8"));
  check(linked.projectId === "prj_UO900Jp4qJF1eS4hkOrebIzwMVlI" && linked.orgId === "team_GP2MTfBKmxj8ajYLvQtV7clA");
  async function databaseFence(expectedFingerprint?: string) {
    const manifest = async (basename: string) => {
      const filename = await realpath(path.join(exportsRoot, basename)); check(filename === path.join(exportsRoot, basename));
      return JSON.parse(await readFile(filename, "utf8"));
    };
    return brandPreviewDatabaseTarget({
      preview: await loadExport("--preview-env", ".env.brand-reports.preview.local"),
      production: await loadExport("--production-env", ".env.brand-reports.production.local"),
      linkedProject: JSON.parse(await readFile(path.join(exportsRoot, "project.json"), "utf8")),
      previewManifest: await manifest("migration-target.preview.json"), productionManifest: await manifest("migration-target.production.json"),
      expectedHost: args.get("--preview-host"), expectedFingerprint,
    });
  }
  const capturedTarget = await databaseFence();
  let restCalls = 0, mcpCalls = 0;
  async function request(route: string, options: { method?: string; headers?: HeadersInit; body?: string } = {}): Promise<Response> {
    const target = new URL(route, origin);
    check(target.origin === origin.origin && route.startsWith("/api/") && !target.hash);
    const headers = new Headers(options.headers);
    check([...headers.keys()].every(name => ["authorization", "content-type", "accept", "mcp-protocol-version", "mcp-session-id"].includes(name)));
    const token = headers.get("authorization");
    check(!token || /^Bearer sj_test_[A-Za-z0-9_-]{16}_[A-Za-z0-9_-]{43}$/u.test(token));
    if (target.pathname === "/api/mcp") mcpCalls++; else restCalls++;
    const config = ["silent", "show-error", "include", "max-time = 45", `request = ${curlQuote(options.method ?? "GET")}`,
      ...[...headers].map(([name, value]) => `header = ${curlQuote(`${name}: ${value}`)}`),
      ...(options.body === undefined ? [] : [`data-binary = ${curlQuote(options.body)}`])].join("\n") + "\n";
    const stdout = await new Promise<string>((resolve, reject) => {
      // CLI 62.5.0 advertises the global --non-interactive flag, but its curl
      // parser rejects it. The linked project is already fenced above; pipe
      // stdin/non-TTY and agent mode retain non-interactive protected access.
      const child = spawn(process.execPath, [cli, "curl", `${target.pathname}${target.search}`, "--deployment", origin.origin,
        "--", "--config", "-"], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
      const chunks: Buffer[] = []; let bytes = 0, ended = false;
      const finish = (failure: boolean) => {
        if (ended) return; ended = true; clearTimeout(timer);
        if (failure) { child.kill(); reject(new Error("Protected preview transport unavailable")); }
        else resolve(Buffer.concat(chunks).toString("utf8"));
      };
      const timer = setTimeout(() => finish(true), 60_000);
      child.stdout.on("data", (chunk: Buffer) => { bytes += chunk.length; if (bytes > 4 * 1024 * 1024) finish(true); else chunks.push(chunk); });
      child.stderr.on("data", () => { /* Drain without logging private CLI state. */ });
      child.once("error", () => finish(true)); child.once("close", code => finish(code !== 0));
      child.stdin.once("error", () => finish(true)); child.stdin.end(config);
    });
    return parseVercelHttpResponse(stdout);
  }
  phase = "protected_preview_stdin_preflight";
  const healthy = await request("/api/health"); check(healthy.status === 200);
  const pool = new Pool({ connectionString: capturedTarget.connectionString, max: 3, connectionTimeoutMillis: 8000, query_timeout: 10000, statement_timeout: 5000 });
  const owner = randomUUID(), other = randomUUID(), reportId = randomUUID();
  const fixtures = [brandPreviewFixture(owner), brandPreviewFixture(other)], attemptedFixtures: { id: string; email: string }[] = [];
  const clients: Client[] = [];
  let verification: Record<string, unknown> | undefined;
  try {
    phase = "synthetic_preview_setup";
    const ready = await pool.query(`SELECT to_regclass('sajda.brand_reports') IS NOT NULL
      AND to_regclass('sajda.brand_report_requests') IS NOT NULL AS ready`);
    check(ready.rows[0].ready === true);
    check((await databaseFence(capturedTarget.fingerprint)).connectionString === capturedTarget.connectionString);
    await assertBrandPreviewFixturesAvailable(pool, fixtures);
    for (const fixture of fixtures) {
      // Record BEFORE I/O: the INSERT may commit without an acknowledgment.
      attemptedFixtures.push(fixture); fixturesAttempted++;
      await pool.query(`INSERT INTO public.sajda_auth_user(id,name,email,"emailVerified")
        VALUES($1,'Synthetic deployed brand-report fixture',$2,true)`, [fixture.id, fixture.email]);
    }
    const keyService = createDeveloperApiKeyService({ pool, environment: () => ({ VERCEL: "1", VERCEL_ENV: "preview" }) });
    const full = await keyService.create({ id: owner, emailVerified: true }, { name: "Synthetic preview report read-write", scopes: ["projects:read", "projects:write"], expiresInDays: 1 });
    const readonly = await keyService.create({ id: owner, emailVerified: true }, { name: "Synthetic preview report read-only", scopes: ["projects:read"], expiresInDays: 1 });
    const foreign = await keyService.create({ id: other, emailVerified: true }, { name: "Synthetic preview other owner", scopes: ["projects:read"], expiresInDays: 1 });
    const authenticated = (apiKey: string, body?: unknown) => ({ headers: { authorization: `Bearer ${apiKey}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }) }, ...(body === undefined ? {} : { method: "POST", body: JSON.stringify(body) }) });
    const at = new Date().toISOString();
    const original: BrandReportSaveInput = { id: reportId, requestKey: randomUUID(), expectedVersion: 0, title: "Synthetic deployed report",
      assessment: { brand_name: "Example", identity_label: "example", primary_domain: "example.com", domains: ["example.com"],
        socials: [{ platform: "github", handle: "example" }], markets: ["SE"], observations: [
          { target_id: "domain:example.com", status: "reported_owned", reported_at: at, source_url: "https://example.com/about" },
        ] } };
    phase = "rest_save_version_1";
    const savedResponse = await request("/api/v1/account?resource=brand-reports", authenticated(full.apiKey, { report: original }));
    check(savedResponse.status === 200 && savedResponse.headers.get("cache-control") === "private, no-store");
    const first = brandReportResponseSchema.parse(await savedResponse.json());
    check(first.accountId === owner && first.report.version === 1 && first.report.result.index.verified_score === null);
    assert.deepEqual(first.report.assessment, original.assessment);
    phase = "rest_read_history_owner_scope_boundaries";
    const [getResponse, listResponse, historyResponse, foreignResponse, readonlyWrite, browserCookieOnly] = await Promise.all([
      request(`/api/v1/account?resource=brand-reports&id=${reportId}`, authenticated(full.apiKey)),
      request("/api/v1/account?resource=brand-reports", authenticated(full.apiKey)),
      request(`/api/v1/account?resource=brand-reports&id=${reportId}&history=true`, authenticated(full.apiKey)),
      request(`/api/v1/account?resource=brand-reports&id=${reportId}`, authenticated(foreign.apiKey)),
      request("/api/v1/account?resource=brand-reports", authenticated(readonly.apiKey, { report: { ...original, requestKey: randomUUID(), expectedVersion: 1 } })),
      request("/api/account/brand-reports", authenticated(full.apiKey)),
    ]);
    check(getResponse.status === 200 && listResponse.status === 200 && historyResponse.status === 200
      && foreignResponse.status === 404 && readonlyWrite.status === 403 && browserCookieOnly.status === 401);
    const loaded = brandReportResponseSchema.parse(await getResponse.json());
    assert.deepEqual(loaded.report.assessment, original.assessment); check(loaded.report.savedAt === first.report.savedAt);
    const listing = brandReportsListResponseSchema.parse(await listResponse.json()); check(listing.accountId === owner && listing.reports.length === 1);
    const history = brandReportHistoryResponseSchema.parse(await historyResponse.json()); check(history.accountId === owner && history.versions.length === 1);
    phase = "rest_version_2_and_late_immutable_receipt";
    const edit = { ...original, requestKey: randomUUID(), expectedVersion: 1, title: "Synthetic second revision" };
    const edited = await request("/api/v1/account?resource=brand-reports", authenticated(full.apiKey, { report: edit })); check(edited.status === 200);
    const second = brandReportResponseSchema.parse(await edited.json()); check(second.report.version === 2);
    const replayed = await request("/api/v1/account?resource=brand-reports", authenticated(full.apiKey, { report: original })); check(replayed.status === 200);
    const replay = brandReportResponseSchema.parse(await replayed.json());
    check(replay.report.version === 1 && replay.report.savedAt === first.report.savedAt && replay.report.title === original.title);
    assert.deepEqual(replay.report.assessment, original.assessment);
    const latest = await request(`/api/v1/account?resource=brand-reports&id=${reportId}`, authenticated(full.apiKey)); check(latest.status === 200);
    check(brandReportResponseSchema.parse(await latest.json()).report.version === 2);
    async function connectMcp(apiKey: string) {
      const client = new Client({ name: "sajda-synthetic-preview-probe", version: "1.0.0" }); clients.push(client);
      const cliFetch: typeof fetch = async (input, init) => {
        const supplied = new Request(input, init), url = new URL(supplied.url); check(url.origin === origin.origin);
        return request(`${url.pathname}${url.search}`, { method: supplied.method, headers: supplied.headers,
          ...(["GET", "HEAD"].includes(supplied.method) ? {} : { body: await supplied.text() }) });
      };
      await client.connect(new StreamableHTTPClientTransport(new URL("/api/mcp", origin), {
        requestInit: { headers: { authorization: `Bearer ${apiKey}` } }, fetch: cliFetch,
      }));
      return client;
    }
    phase = "private_mcp_initialize_discovery_and_typed_historical_read";
    const client = await connectMcp(full.apiKey);
    const catalogue = await client.listTools();
    for (const name of ["brand_reports_list", "brand_reports_get", "brand_reports_history", "brand_reports_save"]) {
      check(catalogue.tools.some(tool => tool.name === name && tool.outputSchema));
    }
    const mcpGet = await client.callTool({ name: "brand_reports_get", arguments: { id: reportId, version: 1 } });
    const typed = mcpGet.structuredContent as { ok?: unknown; status?: unknown; data?: unknown };
    check(!mcpGet.isError && typed?.ok === true && typed.status === 200);
    const historical = brandReportResponseSchema.parse(typed.data);
    check(historical.accountId === owner && historical.report.version === 1 && historical.report.savedAt === first.report.savedAt);
    assert.deepEqual(historical.report.assessment, original.assessment);
    phase = "private_mcp_positive_list_and_history";
    const mcpList = await client.callTool({ name: "brand_reports_list", arguments: {} });
    const listEnvelope = mcpList.structuredContent as { ok?: unknown; status?: unknown; data?: unknown };
    check(!mcpList.isError && listEnvelope?.ok === true && listEnvelope.status === 200);
    const mcpListing = brandReportsListResponseSchema.parse(listEnvelope.data);
    check(mcpListing.accountId === owner && mcpListing.reports.length === 1
      && mcpListing.reports[0].id === reportId && mcpListing.reports[0].version === 2);
    const mcpHistory = await client.callTool({ name: "brand_reports_history", arguments: { id: reportId } });
    const historyEnvelope = mcpHistory.structuredContent as { ok?: unknown; status?: unknown; data?: unknown };
    check(!mcpHistory.isError && historyEnvelope?.ok === true && historyEnvelope.status === 200);
    const mcpVersions = brandReportHistoryResponseSchema.parse(historyEnvelope.data);
    check(mcpVersions.accountId === owner && mcpVersions.versions.length === 2
      && mcpVersions.versions.every(version => version.id === reportId));
    assert.deepEqual(mcpVersions.versions.map(version => version.version), [2, 1]);
    check(mcpVersions.versions[1].savedAt === first.report.savedAt);
    phase = "private_mcp_positive_save_version_3";
    const thirdInput = { ...original, requestKey: randomUUID(), expectedVersion: 2, title: "Synthetic third revision via MCP" };
    const mcpSaved = await client.callTool({ name: "brand_reports_save", arguments: { report: thirdInput } });
    const saveEnvelope = mcpSaved.structuredContent as { ok?: unknown; status?: unknown; data?: unknown };
    check(!mcpSaved.isError && saveEnvelope?.ok === true && saveEnvelope.status === 200);
    const third = brandReportResponseSchema.parse(saveEnvelope.data);
    check(third.accountId === owner && third.report.id === reportId && third.report.version === 3
      && third.report.title === thirdInput.title && third.report.result.index.verified_score === null);
    assert.deepEqual(third.report.assessment, original.assessment);
    check(third.report.result.targets.find(target => target.id === "domain:example.com")?.reported_at === at);
    phase = "private_mcp_latest_version_and_complete_history";
    const latestMcp = await client.callTool({ name: "brand_reports_get", arguments: { id: reportId } });
    const latestEnvelope = latestMcp.structuredContent as { ok?: unknown; status?: unknown; data?: unknown };
    check(!latestMcp.isError && latestEnvelope?.ok === true && latestEnvelope.status === 200);
    const latestThird = brandReportResponseSchema.parse(latestEnvelope.data);
    check(latestThird.accountId === owner && latestThird.report.version === 3 && latestThird.report.savedAt === third.report.savedAt);
    const historyThird = await client.callTool({ name: "brand_reports_history", arguments: { id: reportId } });
    const historyThirdEnvelope = historyThird.structuredContent as { ok?: unknown; status?: unknown; data?: unknown };
    check(!historyThird.isError && historyThirdEnvelope?.ok === true && historyThirdEnvelope.status === 200);
    const completeHistory = brandReportHistoryResponseSchema.parse(historyThirdEnvelope.data);
    check(completeHistory.accountId === owner && completeHistory.versions.length === 3
      && completeHistory.versions.every(version => version.id === reportId));
    assert.deepEqual(completeHistory.versions.map(version => version.version), [3, 2, 1]);
    check(completeHistory.versions[2].savedAt === first.report.savedAt);
    phase = "private_mcp_missing_write_scope";
    const readClient = await connectMcp(readonly.apiKey);
    const denied = await readClient.callTool({ name: "brand_reports_save", arguments: { report: { ...thirdInput, requestKey: randomUUID(), expectedVersion: 3 } } });
    const denial = denied.structuredContent as { ok?: unknown; status?: unknown; error?: { code?: unknown } };
    check(denied.isError === true && denial.ok === false && denial.status === 403 && denial.error?.code === "insufficient_scope");
    phase = "database_transport_state_agreement";
    const rows = await pool.query(`SELECT version,title FROM sajda.brand_reports WHERE namespace='preview' AND owner_id=$1 AND id=$2`, [owner, reportId]);
    check(rows.rows.length === 1 && rows.rows[0].version === 3 && rows.rows[0].title === thirdInput.title);
    const versions = await pool.query(`SELECT assessment,saved_at FROM sajda.brand_report_versions WHERE namespace='preview'
      AND owner_id=$1 AND report_id=$2 ORDER BY version`, [owner, reportId]);
    check(versions.rows.length === 3);
    assert.deepEqual(versions.rows[0].assessment, original.assessment); assert.deepEqual(versions.rows[2].assessment, original.assessment);
    verification = { event: "brand_reports_deployed_preview_verified", restCalls, mcpCalls, restAndDatabaseAgreement: true,
      privateMcpInitialization: true, discoveredTools: catalogue.tools.length, allFourPrivateTools: true, typedHistoricalRead: true, immutableLateRetry: true,
      ownerIsolation: true, scopedWriteDenied: true, browserRequiresSession: true, actualBrowserLoginTested: false,
      providerCalls: 0, emailCalls: 0, productionWrites: 0 };
  } finally {
    for (const client of clients) await client.close().catch(() => undefined);
    try {
      check((await databaseFence(capturedTarget.fingerprint)).connectionString === capturedTarget.connectionString);
      const removed = await cleanupBrandPreviewFixtures(pool, attemptedFixtures);
      if (attemptedFixtures.length) {
        const allocated = attemptedFixtures.map(fixture => fixture.id);
        const developerHashes = allocated.map(account => createHash("sha256").update(`account:${account}`).digest("hex"));
        const reportHashes = allocated.map(account => createHash("sha256").update(`brand-reports:preview:${account}`).digest("hex"));
        await pool.query("DELETE FROM sajda.developer_api_quotas WHERE namespace='preview' AND subject_hash=ANY($1::text[])", [developerHashes]);
        await pool.query("DELETE FROM sajda.function_rate_limits WHERE scope='brand-reports' AND subject_hash=ANY($1::text[])", [reportHashes]);
        check((await pool.query("SELECT count(*)::integer AS count FROM public.sajda_auth_user WHERE id=ANY($1::text[])", [allocated])).rows[0].count === 0);
        for (const table of ["developer_api_keys", "brand_reports", "brand_report_versions", "brand_report_requests"]) {
          check((await pool.query(`SELECT count(*)::integer AS count FROM sajda.${table} WHERE owner_id=ANY($1::text[])`, [allocated])).rows[0].count === 0);
        }
        check((await pool.query("SELECT count(*)::integer AS count FROM sajda.developer_api_quotas WHERE namespace='preview' AND subject_hash=ANY($1::text[])", [developerHashes])).rows[0].count === 0);
        check((await pool.query("SELECT count(*)::integer AS count FROM sajda.function_rate_limits WHERE scope='brand-reports' AND subject_hash=ANY($1::text[])", [reportHashes])).rows[0].count === 0);
      }
      cleanupVerified = true;
      console.info(JSON.stringify({ event: "brand_reports_deployed_preview_cleanup_verified", ...removed }));
    } catch { cleanupFailed = true; }
    finally { await pool.end().catch(() => { cleanupFailed = true; }); }
  }
  if (cleanupFailed) throw new Error("Synthetic preview cleanup could not be confirmed");
  check(cleanupVerified && verification); console.info(JSON.stringify(verification));
}
main().catch(() => {
  console.error(JSON.stringify({ event: "brand_reports_deployed_preview_probe_failed", phase,
    cleanupRequired: fixturesAttempted > 0, cleanupConfirmed: fixturesAttempted === 0 || cleanupVerified && !cleanupFailed,
    rawProviderDetailsSuppressed: true }));
  process.exitCode = 1;
});
