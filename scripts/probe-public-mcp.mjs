/** Anonymous MCP conformance probe. --live makes two bounded read-only searches
 * against real registry/registrar providers. Never uses preview bypass or keys. */
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const origin = new URL(process.env.SAJDA_TEST_ORIGIN || "http://127.0.0.1:8095");
assert.ok((origin.protocol === "https:" || (origin.protocol === "http:" && origin.hostname === "127.0.0.1")) &&
  !origin.username && !origin.password && !origin.search && !origin.hash && origin.pathname === "/", "Use a clean HTTPS origin or loopback QA origin.");
const client = new Client({ name: "sajda-public-connector-probe", version: "1.0.0" });
const transport = new StreamableHTTPClientTransport(new URL("/api/mcp/public", origin), {
  fetch: (url, options) => fetch(url, { ...options, redirect: "error", signal: AbortSignal.timeout(65_000) }),
});
try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(tool => tool.name), ["domains_suggest", "domains_check"]);
  assert.ok(tools.every(tool => tool.annotations?.readOnlyHint && !tool.annotations?.destructiveHint));
  console.log(JSON.stringify({ event: "anonymous_mcp_discovery_pass", origin: origin.origin, tools: tools.map(tool => tool.name) }));
  if (process.argv.includes("--live")) {
    const result = await client.callTool({ name: "domains_suggest", arguments: {
      query: "calm planning app for independent founders", tlds: ["com", "app", "dev"], count: 10, locale: "en",
      budget: { amount: 30, currency: "USD", period: "first_year" },
    } }, undefined, { timeout: 65_000 });
    const output = result.structuredContent;
    assert.equal(output?.ok, true, JSON.stringify(output));
    const data = output.data;
    assert.equal(data.purchasePerformed, false);
    assert.equal(data.requestedCount, 10);
    assert.ok(data.returnedCount <= 10);
    assert.equal(data.items.length, data.returnedCount);
    assert.equal(data.shortfall, 10 - data.returnedCount);
    assert.equal(data.confirmedCount, data.returnedCount);
    assert.ok(data.items.every(item => item.evidenceType === "confirmed_exact_offer"));
    assert.equal(data.provisionalCount, data.provisionalItems.length);
    assert.ok(data.provisionalItems.every(item => item.evidenceType === "conditional_tld_estimate"));
    assert.ok(data.search.candidatePoolSize > 10 && data.search.candidatePoolSize <= 120);
    assert.ok(data.search.quoteBatches <= 6);
    // A conforming partial/empty response is NOT acceptance of the ten-exact-
    // matches product goal. Keep that readiness result separate from protocol QA.
    console.log(JSON.stringify({ event: "ten_exact_budget_matches", achieved: data.confirmedCount === 10,
      confirmed: data.confirmedCount, provisional: data.provisionalCount, stopReason: data.search.stopReason }));
    console.log(JSON.stringify({ event: "live_budget_shortlist", data }));
    const exact = await client.callTool({ name: "domains_check", arguments: { domains: ["example.com"], locale: "en" } }, undefined, { timeout: 65_000 });
    assert.equal(exact.structuredContent?.ok, true);
    const checked = exact.structuredContent.data;
    assert.equal(checked.purchasePerformed, false);
    assert.equal(checked.results.length, 1);
    assert.equal(checked.results[0].domain, "example.com");
    assert.equal(checked.results[0].status, "taken", "Known registered domain must not be recommended as available.");
    console.log(JSON.stringify({ event: "live_exact_check", domain: checked.results[0].domain,
      status: checked.results[0].status, source: checked.results[0].source, checkedAt: checked.results[0].checkedAt }));
  }
} finally { await client.close(); }
