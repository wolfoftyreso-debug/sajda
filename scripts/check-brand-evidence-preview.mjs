/** Explicit preview: three bounded Sajda reads; underlying providers may retry.
 * No login, save or purchase. */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { namePackageIntelligenceSchema } from "../shared/name-package-intelligence.ts";
import { projectBrandDomainEvidence } from "../src/lib/brandDomainEvidence.ts";
import { generateNamePackageCandidates } from "../api/_shared/name-package-candidates.ts";
import { parseNamePackageSearchRequest } from "../api/_shared/name-package-contract.ts";
import { NAME_PACKAGE_EVIDENCE_MAX_AGE_MS } from "../shared/name-packages.ts";

const origin = process.env.SAJDA_TEST_ORIGIN, cli = process.env.SAJDA_VERCEL_CLI;
if (!cli || !/^https:\/\/sajda-[a-z0-9]+-hypbit\.vercel\.app$/u.test(origin ?? "")) throw new Error("Select the Sajda preview and CLI explicitly.");
const execute = promisify(execFile);
async function request(path, body) {
  const args = [cli, "curl", path, "--deployment", origin, "--", "--silent", "--show-error", "--include",
    "--max-time", "45", "--request", "POST", "--header", "Content-Type: application/json",
    "--header", "Accept: application/json, text/event-stream", "--header", "MCP-Protocol-Version: 2025-11-25", "--data", JSON.stringify(body)];
  let raw;
  try { raw = (await execute(process.execPath, args, { windowsHide: true, timeout: 60000, maxBuffer: 3000000,
    env: { ...process.env, NO_UPDATE_NOTIFIER: "1" } })).stdout; }
  catch { throw new Error(`Preview request failed: ${path}`); }
  let status, headers;
  do {
    const boundary = raw.search(/\r?\n\r?\n/u); assert.ok(boundary >= 0);
    const lines = raw.slice(0, boundary).split(/\r?\n/u); raw = raw.slice(boundary).replace(/^\r?\n\r?\n/u, "");
    status = Number(lines.shift()?.match(/^HTTP\/\S+ (\d{3})/u)?.[1]); headers = new Headers();
    for (const line of lines) { const colon = line.indexOf(":"); if (colon > 0) headers.append(line.slice(0, colon), line.slice(colon + 1).trim()); }
  } while (raw.startsWith("HTTP/"));
  assert.equal(status, 200, path); assert.match(headers.get("content-type") ?? "", /application\/json/u);
  assert.match(headers.get("cache-control") ?? "", /no-store/u);
  console.log(JSON.stringify({ path, status, request_id: headers.get("x-request-id") }));
  return JSON.parse(raw);
}
const raw = await request("/api/domain-search", { domains: ["example.com"], count: 1, tlds: [], theme: "", locale: "en", advanced: false, swipe: false });
assert.equal(raw.results.length, 1); const row = raw.results[0];
assert.equal(row.domain, "example.com"); assert.equal(row.status, "taken"); assert.equal(row.authoritative, true);
const checked = projectBrandDomainEvidence(["example.com"], [{ ...row, availabilityVerified: row.authoritative }]);
assert.equal(checked.summary.checked, 1); assert.equal(checked.entries[0].statement, "domain_registered");
assert.equal(checked.entries[0].observed_at, row.checkedAt);
assert.equal(checked.entries[0].source_url, "https://rdap.verisign.com/com/v1/domain/example.com");
assert.equal(checked.entries[0].origin, "provider_observation"); assert.equal(checked.entries[0].freshness, "current");
assert.equal(checked.ownership_verified, false); assert.equal(checked.legal_clearance, false); assert.equal(checked.continuous_monitoring, false);
const aged = projectBrandDomainEvidence(["example.com"], [{ ...row, availabilityVerified: row.authoritative }],
  Date.parse(row.checkedAt) + NAME_PACKAGE_EVIDENCE_MAX_AGE_MS + 1);
assert.equal(aged.summary.checked, 0); assert.equal(aged.entries[0].state, "unknown"); assert.equal(aged.entries[0].freshness, "stale");
assert.equal(aged.entries[0].observed_at, checked.entries[0].observed_at); assert.equal(aged.entries[0].source_url, checked.entries[0].source_url);

const input = { query: "calm scheduling for independent founders", tlds: ["com"], platforms: ["github"], markets: ["US"], count: 1, locale: "en" };
const candidate = generateNamePackageCandidates(parseNamePackageSearchRequest(input));
function assertPackage(value) {
  const result = namePackageIntelligenceSchema.parse(value);
  assert.equal(result.returned_count, 1); const pkg = result.packages[0];
  assert.equal(pkg.canonical_name, candidate.labels[0]); assert.equal(pkg.brand_index.identityLabel, candidate.labels[0]);
  const evidence = pkg.brand_index.evidence_report;
  assert.deepEqual(evidence.summary, { total: 6, checked: 1, reported: 0, listed: 0, unknown: 5, checked_coverage_percent: 16 });
  const observed = evidence.entries.find(entry => entry.kind === "domain");
  assert.equal(observed.target, candidate.domains[0]);
  assert.ok(["domain_available", "domain_registered"].includes(observed.statement));
  assert.equal(observed.source_url, `https://rdap.verisign.com/com/v1/domain/${candidate.domains[0]}`);
  assert.equal(evidence.entries.find(entry => entry.kind === "social").state, "unknown");
  assert.equal(evidence.ownership_verified, false); assert.equal(evidence.legal_clearance, false); assert.equal(evidence.continuous_monitoring, false);
  return evidence.summary;
}
const rest = assertPackage(await request("/api/v1/public/name-packages", input));
const mcp = await request("/api/mcp/public", { jsonrpc: "2.0", id: 1, method: "tools/call",
  params: { name: "name_packages_search", arguments: input } });
assert.equal(mcp.result.structuredContent.ok, true);
assert.deepEqual(assertPackage(mcp.result.structuredContent.data), rest);
console.log(JSON.stringify({ verdict: "PASS", origin, source: row.source, observed_at: row.checkedAt,
  registry_status: "registered", ownership_verified: false, rest: true, mcp: true, writes: false, purchases: false }));
