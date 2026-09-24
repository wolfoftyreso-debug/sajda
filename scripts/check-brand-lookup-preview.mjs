/** Real, bounded public-source lookup on an explicitly selected Sajda preview.
 * No login, ownership assertion, database writes or commercial actions. */
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
for (const path of ["/brand-index", "/brand-index/assessment"]) {
  const response = await request(path); assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/html/u);
  assert.match(response.headers.get("x-robots-tag") ?? "", /noindex/u);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/u);
}
const spec = await request("/api/openapi"); assert.equal(spec.status, 200); assert.ok(spec.data.paths["/api/v1/public/brand-lookup"]?.post);
const query = { operation: "search", query: "IKEA", locale: "en" };
const found = await request("/api/v1/public/brand-lookup", query);
assert.equal(found.status, 200); assert.equal(found.data.operation, "search"); assert.equal(found.data.status, "matches");
assert.equal(found.data.verified_index, null); assert.equal(found.data.coverage, "wikidata_only");
assert.ok(found.data.candidates.some(row => row.entity_id === "Q54078"), "Expected the real Wikidata company record among disambiguation matches");
assert.equal(found.headers.get("access-control-allow-origin"), "*"); assert.match(found.headers.get("cache-control") ?? "", /no-store/u);
const profile = await request("/api/v1/public/brand-lookup", { operation: "profile", entity_id: "Q54078", locale: "en" });
assert.equal(profile.status, 200); assert.equal(profile.data.entity.entity_id, "Q54078");
assert.ok(profile.data.assertions.length > 0); assert.equal(profile.data.index.score, null); assert.equal(profile.data.index.verified_assertions, 0);
assert.ok(profile.data.assertions.every(row => row.classification === "DATABASE_ASSERTION" && row.relationship === "not_verified"));
console.log(JSON.stringify({ entity: profile.data.entity.entity_id, revision: profile.data.entity.revision_id,
  source_modified_at: profile.data.entity.source_modified_at, retrieved_at: profile.data.retrieved_at,
  assertions: profile.data.assertions.length, verified_index: profile.data.index.score }));
const invalid = await request("/api/v1/public/brand-lookup", { ...query, verified_score: 99 });
assert.equal(invalid.status, 400); assert.equal(invalid.data.code, "invalid_request");
const init = await request("/api/mcp/public", { jsonrpc: "2.0", id: 1, method: "initialize",
  params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "sajda-brand-lookup-smoke", version: "1.0.0" } } });
assert.equal(init.status, 200); assert.equal(init.data.result.serverInfo.version, "1.5.1");
const discovery = await request("/api/mcp/public", { jsonrpc: "2.0", id: 2, method: "tools/list" });
assert.equal(discovery.status, 200); const tool = discovery.data.result.tools.find(tool => tool.name === "brand_lookup");
assert.ok(tool); assert.equal(tool.annotations.readOnlyHint, true); assert.equal(tool.annotations.openWorldHint, true);
const call = await request("/api/mcp/public", { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "brand_lookup", arguments: query } });
assert.equal(call.status, 200); assert.equal(call.data.result.structuredContent.ok, true);
assert.equal(call.data.result.structuredContent.data.operation, "search"); assert.equal(call.data.result.structuredContent.data.verified_index, null);
console.log(JSON.stringify({ verdict: "PASS", origin, real_public_source: "Wikidata", rest: true, mcp: true,
  independent_ownership_verification: false, global_brand_coverage: false, writes: false }));
