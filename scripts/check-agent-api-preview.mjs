/** Explicit preview, two bounded public searches. No account mutations or purchases. */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { businessNamesResultSchema } from "../api/_shared/business-names-contract.ts";
const origin = process.env.SAJDA_TEST_ORIGIN, cli = process.env.SAJDA_VERCEL_CLI;
if (!cli || !/^https:\/\/sajda-[a-z0-9]+-hypbit\.vercel\.app$/u.test(origin ?? "")) throw new Error("Select the Sajda preview and CLI explicitly.");
const execute = promisify(execFile);
async function request(path, body) {
  const args = [cli, "curl", path, "--deployment", origin, "--", "--silent", "--show-error", "--include",
    "--max-time", "45", "--request", body ? "POST" : "GET"];
  if (body) args.push("--header", "Content-Type: application/json", "--header", "Accept: application/json, text/event-stream",
    "--header", "MCP-Protocol-Version: 2025-11-25", "--data", JSON.stringify(body));
  let raw;
  try { raw = (await execute(process.execPath, args, { windowsHide: true, timeout: 60000, maxBuffer: 5000000,
    env: { ...process.env, NO_UPDATE_NOTIFIER: "1" } })).stdout; }
  catch { throw new Error(`Preview request failed: ${path}`); }
  let status, headers;
  do {
    const boundary = raw.search(/\r?\n\r?\n/u); assert.ok(boundary >= 0);
    const lines = raw.slice(0, boundary).split(/\r?\n/u);
    raw = raw.slice(boundary).replace(/^\r?\n\r?\n/u, "");
    status = Number(lines.shift()?.match(/^HTTP\/\S+ (\d{3})/u)?.[1]); headers = new Headers();
    for (const line of lines) { const colon = line.indexOf(":"); if (colon > 0) headers.append(line.slice(0, colon), line.slice(colon + 1).trim()); }
  } while (raw.startsWith("HTTP/"));
  assert.match(headers.get("content-type") ?? "", /application\/json/u, path);
  console.log(JSON.stringify({ event: "preview_response", path, status }));
  return { status, headers, data: JSON.parse(raw) };
}
const discovery = await request("/api/v1/capabilities");
assert.equal(discovery.status, 200); assert.equal(discovery.data.capabilities.length, 21);
const spec = await request("/api/openapi");
assert.equal(spec.status, 200); assert.ok(spec.data.paths["/api/v1/public/business-names"]);
assert.ok(spec.data.paths["/api/v1/business-names"]);
const init = await request("/api/mcp/public", { jsonrpc: "2.0", id: 1, method: "initialize",
  params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "sajda-api-preview-check", version: "1.0.0" } } });
assert.equal(init.data.result.serverInfo.version, "1.6.0");
const prompts = await request("/api/mcp/public", { jsonrpc: "2.0", id: 4, method: "prompts/list", params: {} });
assert.equal(prompts.data.result.prompts.length, 2);
const policy = await request("/api/mcp/public", { jsonrpc: "2.0", id: 5, method: "resources/read", params: { uri: "sajda://connector/policy" } });
assert.equal(JSON.parse(policy.data.result.contents[0].text).background_chat_access, false);
const list = await request("/api/mcp/public", { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
assert.equal(list.data.result.tools.length, 6);
assert.ok(list.data.result.tools.some(tool => tool.name === "business_names_recommend" && tool.outputSchema));
const invalid = await request("/api/v1/public/business-names", { businessDescription: "", count: 11 });
assert.equal(invalid.status, 400);
const input = { businessDescription: "Software for small businesses to plan delivery routes and reduce logistics administration",
  nameLanguage: "fr", count: 10, tlds: ["com"], platforms: ["github"], markets: ["US", "FR"], providers: ["loopia"] };
const privateResult = await request("/api/v1/business-names", input);
assert.equal(privateResult.status, 401);
const privateState = await request("/api/v1/account?resource=name-projects");
assert.equal(privateState.status, 401);
function checkResult(value, language) {
  const result = businessNamesResultSchema.parse(value);
  assert.equal(result.requirements.name_language, language);
  assert.equal(result.requested_count, 10); assert.equal(result.methodology.ai_used, false);
  assert.equal(result.result_summary.counts.returned, result.returned_count);
  assert.equal(result.result_summary.counts.missing, 10 - result.returned_count);
  if (result.returned_count < 10) assert.ok(result.result_summary.reasons.length > 0);
  assert.equal(result.intelligence.market_coverage.automated_checks_available, false);
  for (const row of result.recommendations) {
    assert.ok(row.package.brand_index.score <= 70);
    assert.equal(row.package.brand_index.legalClearance, false);
    assert.ok(row.available_domains.length > 0);
  }
  return { count: result.returned_count, completeness: result.completeness, summary: result.result_summary,
    names: result.recommendations.map(row => ({ name: row.name, domains: row.available_domains, index: row.package.brand_index.score })) };
}
const rest = await request("/api/v1/public/business-names", input);
assert.equal(rest.status, 200); const restResult = checkResult(rest.data, "fr");
const mcp = await request("/api/mcp/public", { jsonrpc: "2.0", id: 3, method: "tools/call",
  params: { name: "business_names_recommend", arguments: { ...input, nameLanguage: "sv", locale: "sv" } } });
assert.equal(mcp.status, 200); assert.equal(mcp.data.result.structuredContent.ok, true);
const mcpResult = checkResult(mcp.data.result.structuredContent.data, "sv");
const firstText = mcp.data.result.content[0];
assert.equal(firstText.type, "text");
assert.ok(firstText.text.startsWith(mcpResult.summary.headline));
assert.ok(firstText.text.includes(mcpResult.summary.explanation));
assert.match(firstText.text, /^Vi hittade/u);
console.log(JSON.stringify({ event: "agent_api_preview_verified", origin, rest: restResult, mcp: mcpResult,
  publicSearches: 2, authenticatedAccountWrites: 0, purchases: 0 }));
