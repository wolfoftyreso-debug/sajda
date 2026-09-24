/** Bounded synthetic self-assessment smoke test on an explicitly selected Sajda preview.
 * No company audit, login, storage, external registry lookup or commercial action. */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const origin = process.env.SAJDA_TEST_ORIGIN, cli = process.env.SAJDA_VERCEL_CLI;
if (!cli || !/^https:\/\/sajda-[a-z0-9]+-hypbit\.vercel\.app$/u.test(origin ?? "")) throw new Error("Select the Sajda preview and CLI explicitly.");
const execute = promisify(execFile);
async function request(path, body) {
  const args = [cli, "curl", path, "--deployment", origin, "--", "--silent", "--show-error", "--include", "--max-time", "40", "--request", body ? "POST" : "GET"];
  if (body) args.push("--header", "Content-Type: application/json", "--header", "Accept: application/json, text/event-stream",
    "--header", "MCP-Protocol-Version: 2025-11-25", "--data", JSON.stringify(body));
  let raw;
  try { raw = (await execute(process.execPath, args, { windowsHide: true, timeout: 60000, maxBuffer: 3000000, env: { ...process.env, NO_UPDATE_NOTIFIER: "1" } })).stdout; }
  catch (error) { throw new Error(`Preview request failed for ${path} (code ${String(error.code ?? "unknown")}).`); }
  let status, headers;
  do {
    const boundary = raw.search(/\r?\n\r?\n/u); assert.ok(boundary >= 0, "Missing HTTP headers");
    const lines = raw.slice(0, boundary).split(/\r?\n/u); raw = raw.slice(boundary).replace(/^\r?\n\r?\n/u, "");
    status = Number(lines.shift()?.match(/^HTTP\/\S+ (\d{3})/u)?.[1]); headers = new Headers();
    for (const line of lines) { const colon = line.indexOf(":"); if (colon > 0) headers.append(line.slice(0, colon), line.slice(colon + 1).trim()); }
  } while (raw.startsWith("HTTP/"));
  console.log(JSON.stringify({ path, status, request_id: headers.get("x-request-id") }));
  return { status, headers, data: headers.get("content-type")?.includes("application/json") ? JSON.parse(raw) : raw };
}
const fixture = { brand_name: "Example Brand", identity_label: "example", primary_domain: "example.com", domains: ["example.com"],
  socials: [{ platform: "github", handle: "example" }], markets: ["US"], observations: [] };
function assertReport(report, expectedScore) {
  assert.equal(report.schema_version, "sajda.brand-presence-index.v1");
  assert.equal(report.methodology_version, "brand-presence-1.0.0");
  assert.equal(report.index.reported_score, expectedScore);
  assert.equal(report.index.classification, "SELF_ASSESSMENT");
  assert.equal(report.index.verified_score, null); assert.equal(report.index.verified_coverage_percent, 0);
  assert.equal(report.index.confidence, null); assert.equal(report.scope.is_global_score, false);
  assert.equal(report.targets.length, 3); assert.ok(report.targets.every(target => target.classification === "USER_SUPPLIED"));
  assert.ok(report.limitations.includes("no_external_lookups_performed"));
}
const page = await request("/brand-index/assessment");
assert.equal(page.status, 200); assert.match(page.headers.get("content-type") ?? "", /text\/html/u);
assert.match(page.headers.get("x-robots-tag") ?? "", /noindex/u); assert.match(page.headers.get("cache-control") ?? "", /no-store/u);
const spec = await request("/api/openapi"); assert.equal(spec.status, 200);
assert.ok(spec.data.paths["/api/v1/public/brand-index"]?.post);
const empty = await request("/api/v1/public/brand-index", fixture);
assert.equal(empty.status, 200); assertReport(empty.data, null);
assert.match(empty.headers.get("cache-control") ?? "", /no-store/u);
assert.equal(empty.headers.get("access-control-allow-origin"), "*");
const full = { ...fixture, observations: ["domain:example.com", "social:github:example", "market:US"]
  .map(target_id => ({ target_id, status: "reported_owned", reported_at: new Date().toISOString() })) };
const assessed = await request("/api/v1/public/brand-index", full); assert.equal(assessed.status, 200); assertReport(assessed.data, 100);
assert.equal(assessed.data.index.reported_coverage_percent, 100);
for (const invalid of [{ ...fixture, verified: true }, { ...full, observations: full.observations.map(item => ({ ...item, reported_at: "2026-09-13T12:00:00+99:99" })) }]) {
  const result = await request("/api/v1/public/brand-index", invalid); assert.equal(result.status, 400);
  assert.equal(result.data.code, "invalid_request"); assert.ok(!("index" in result.data));
}
const init = await request("/api/mcp/public", { jsonrpc: "2.0", id: 1, method: "initialize",
  params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "sajda-brand-preview-smoke", version: "1.0.0" } } });
assert.equal(init.status, 200); assert.equal(init.data.result.serverInfo.version, "1.5.1");
const discovery = await request("/api/mcp/public", { jsonrpc: "2.0", id: 2, method: "tools/list" });
assert.equal(discovery.status, 200); const tool = discovery.data.result.tools.find(tool => tool.name === "brand_index_assess");
assert.ok(tool); assert.equal(tool.annotations.readOnlyHint, true); assert.equal(tool.annotations.openWorldHint, false);
const called = await request("/api/mcp/public", { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "brand_index_assess", arguments: full } });
assert.equal(called.status, 200); assert.equal(called.data.result.structuredContent.ok, true);
assertReport(called.data.result.structuredContent.data, 100);
assert.equal(called.data.result.structuredContent.data.scope.comparison_key, assessed.data.scope.comparison_key);
console.log(JSON.stringify({ verdict: "PASS", origin, synthetic_only: true, page: true, rest: true, mcp: true,
  invalid_claims_rejected: true, invalid_dates_rejected: true, independent_verification_performed: false, persisted: false }));
