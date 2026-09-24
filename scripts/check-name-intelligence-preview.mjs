/** Explicit Sajda preview only. One bounded public REST search and one MCP
 * search; no app login, saved data, social checks or purchases. */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const origin = process.env.SAJDA_TEST_ORIGIN, cli = process.env.SAJDA_VERCEL_CLI;
if (!cli || !/^https:\/\/sajda-[a-z0-9]+-hypbit\.vercel\.app$/u.test(origin ?? "")) {
  throw new Error("Select the Sajda preview and CLI explicitly.");
}
const execute = promisify(execFile);
async function request(path, body) {
  const startedAt = Date.now();
  const args = [cli, "curl", path, "--deployment", origin, "--", "--silent", "--show-error", "--include",
    "--max-time", "40", "--request", body ? "POST" : "GET"];
  if (body) args.push("--header", "Content-Type: application/json", "--header",
    "Accept: application/json, text/event-stream", "--header", "MCP-Protocol-Version: 2025-11-25", "--data", JSON.stringify(body));
  let raw;
  try {
    raw = (await execute(process.execPath, args, { windowsHide: true, timeout: 60000, maxBuffer: 2000000,
      env: { ...process.env, NO_UPDATE_NOTIFIER: "1" } })).stdout;
  } catch (error) {
    console.error(JSON.stringify({ event: "preview_request_failed", path, elapsed_ms: Date.now() - startedAt,
      code: typeof error.code === "number" || typeof error.code === "string" ? error.code : null,
      signal: typeof error.signal === "string" ? error.signal : null, killed: error.killed === true }));
    throw new Error("Preview request failed: " + path);
  }
  let status, headers;
  do {
    const boundary = raw.search(/\r?\n\r?\n/u);
    assert.ok(boundary >= 0);
    const lines = raw.slice(0, boundary).split(/\r?\n/u);
    raw = raw.slice(boundary).replace(/^\r?\n\r?\n/u, "");
    status = Number(lines.shift()?.match(/^HTTP\/\S+ (\d{3})/u)?.[1]);
    headers = new Headers();
    for (const line of lines) {
      const colon = line.indexOf(":");
      if (colon > 0) headers.append(line.slice(0, colon), line.slice(colon + 1).trim());
    }
  } while (raw.startsWith("HTTP/"));
  assert.match(headers.get("content-type") ?? "", /application\/json/u, path);
  console.log(JSON.stringify({ event: "preview_request_verified", path, status, elapsed_ms: Date.now() - startedAt }));
  return { status, headers, data: JSON.parse(raw) };
}
function assertIntelligence(value) {
  assert.equal(value.schema_version, "sajda.name-package-intelligence.v1");
  assert.equal(value.methodology_version, "name-package-1.0.0");
  assert.equal(value.requested_count, 1);
  assert.equal(value.returned_count, value.packages.length);
  assert.deepEqual(value.market_coverage.requested_markets, ["US", "DE", "SE"]);
  assert.deepEqual(value.market_coverage.checked_markets, []);
  assert.equal(value.market_coverage.automated_checks_available, false);
  assert.ok(value.market_coverage.checks.every(check => check.company.status === "not_checked" && check.trademark.status === "not_checked"));
  assert.ok(value.returned_count > 0 && value.returned_count <= 1);
  for (const item of value.packages) {
    assert.equal(item.entity_type, "name_candidate");
    assert.equal(item.canonical_url, null);
    const evidence = [...item.evidence.domains, ...item.evidence.socials, item.evidence.company, item.evidence.trademark];
    assert.ok(evidence.every(evidence => evidence.verified_at === null && evidence.confidence === null));
    assert.equal(item.evidence.company.status, "not_checked");
    assert.equal(item.evidence.trademark.status, "not_checked");
    assert.ok(item.index.score <= 70);
    assert.equal(item.brand_index.schemaVersion, "sajda.brand-index.candidate.v1");
    assert.equal(item.brand_index.mode, "candidate");
    assert.equal(item.brand_index.score, item.index.score);
    assert.equal(item.brand_index.ownershipVerified, false);
    assert.equal(item.brand_index.legalClearance, false);
  }
}
const specification = await request("/api/openapi");
assert.equal(specification.status, 200);
assert.ok(specification.data.paths["/api/v1/public/name-packages"]);
const initialized = await request("/api/mcp/public", { jsonrpc: "2.0", id: 1, method: "initialize",
  params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "sajda-preview-check", version: "1.0.0" } } });
assert.equal(initialized.status, 200);
assert.equal(initialized.data.result.serverInfo.version, "1.5.1");
const catalogue = await request("/api/mcp/public", { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
const tool = catalogue.data.result.tools.find(tool => tool.name === "name_packages_search");
assert.ok(tool?.outputSchema);
assert.equal(tool.annotations.readOnlyHint, true);
assert.equal(tool.annotations.destructiveHint, false);
const input = { query: "logistics software", tlds: ["com"], platforms: ["github"], markets: ["US", "SE", "DE"], count: 1, providers: ["loopia"] };
const rest = await request("/api/v1/public/name-packages", input);
assert.equal(rest.status, 200, "Public REST search should complete");
assert.match(rest.headers.get("cache-control") ?? "", /no-store/u);
assertIntelligence(rest.data);
const mcp = await request("/api/mcp/public", { jsonrpc: "2.0", id: 3, method: "tools/call",
  params: { name: "name_packages_search", arguments: input } });
assert.equal(mcp.status, 200);
assert.equal(mcp.data.result.structuredContent.ok, true);
assertIntelligence(mcp.data.result.structuredContent.data);
const protectedRoute = await request("/api/v1/name-packages", input);
assert.equal(protectedRoute.status, 401);
console.log(JSON.stringify({ event: "name_intelligence_preview_verified", origin, rest: rest.status, mcp: mcp.status,
  privateUnauthenticated: protectedRoute.status, schemaVersion: rest.data.schema_version,
  restPackages: rest.data.returned_count, mcpPackages: mcp.data.result.structuredContent.data.returned_count,
  publicSearches: 2, authenticatedAppSession: false, socialChecks: 0, purchases: 0 }));
