import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { ApiKeyPrincipal } from "../api/_shared/developer-api-keys.js";
import { createSajdaMcpServer } from "../api/_shared/mcp-tools.js";
import { createPublicMcpServer } from "../api/_shared/public-mcp-tools.js";
import { executeBusinessNamesRecommendation } from "../api/_shared/business-names.js";
import { businessNamesResultSchema } from "../api/_shared/business-names-contract.js";
import { generateNamePackageCandidates } from "../api/_shared/name-package-candidates.js";
import { projectNamePackageIntelligence } from "../shared/name-package-intelligence.js";
import { mcpResultContent } from "../api/_shared/mcp-result-summary.js";
import { buildConnectorResultSummary } from "../api/_shared/connector-result-summary.js";

const principal: ApiKeyPrincipal = { userId: "clarity-owner", keyId: "clarity-key", scopes: ["domains:search"], environment: "development" };
const brief = { businessDescription: "An artisan bakery making fresh bread", count: 10 };

async function resultFor(statuses: string[], locale: "en" | "sv" = "en") {
  return executeBusinessNamesRecommendation({ ...brief, locale }, async input => {
    const now = Date.now();
    return projectNamePackageIntelligence({ results: generateNamePackageCandidates(input).domains.map((domain, index) => ({
      domain, status: statuses[index] ?? "available", authoritative: statuses[index] !== "unknown",
      checkMethod: statuses[index] === "unknown" ? "none" : "rdap", source: "registry",
      checkedAt: statuses[index] === "unknown" ? null : new Date(now).toISOString(),
    })) }, { platforms: input.platforms, requiredTlds: input.tlds, markets: input.markets, limit: input.count, now });
  });
}

async function sdk(t: TestContext, mode: "public" | "private", data: Awaited<ReturnType<typeof resultFor>>) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = mode === "public" ? createPublicMcpServer(async () => data, "req_clarity_public")
    : createSajdaMcpServer(principal, async () => ({ status: 200, data }), "req_clarity_private");
  await server.connect(serverTransport);
  const client = new Client({ name: "result-clarity-test", version: "1.0.0" });
  await client.connect(clientTransport);
  t.after(async () => { await client.close(); await server.close(); });
  const catalogue = await client.listTools();
  assert.match(catalogue.tools.find(tool => tool.name === "business_names_recommend")!.description!, /prominently.*BEFORE/u);
  assert.match(client.getInstructions() ?? "", /Never call a partial result a complete top ten/u);
  return client;
}

for (const mode of ["public", "private"] as const) {
  test(`${mode} MCP explains six of ten before the JSON and preserves the exact evidence`, async t => {
    const data = await resultFor(["available", "available", "available", "available", "available", "available", "taken", "taken", "unknown", "unknown"]);
    const client = await sdk(t, mode, data);
    const result = await client.callTool({ name: "business_names_recommend", arguments: brief });
    assert.equal(result.isError, undefined);
    const structured = result.structuredContent as { ok: boolean; data: unknown };
    const parsed = businessNamesResultSchema.parse(structured.data);
    assert.equal(parsed.requested_count, 10); assert.equal(parsed.returned_count, 6);
    assert.equal(parsed.completeness, "partial"); assert.equal(parsed.recommendations.length, 6);
    assert.deepEqual(structured.data, data, "Presentation must not alter evidence, eligibility or counts.");
    const content = result.content as Array<{ type: string; text: string }>;
    assert.equal(content.length, 2); assert.equal(content[0].type, "text");
    assert.match(content[0].text, /6\D+10/u);
    assert.ok(content[0].text.startsWith(parsed.result_summary.headline));
    assert.ok(content[0].text.includes(parsed.result_summary.explanation));
    for (const step of parsed.result_summary.next_steps) assert.ok(content[0].text.includes(step.label));
    assert.deepEqual(JSON.parse(content[1].text), structured, "Machine clients still receive the complete JSON text envelope.");
  });

  test(`${mode} MCP explains complete and empty results as well as a Swedish shortfall`, async t => {
    for (const [statuses, expected, locale] of [
      [Array(10).fill("available"), 10, "en"], [Array(10).fill("unknown"), 0, "en"],
      [[...Array(6).fill("available"), ...Array(4).fill("unknown")], 6, "sv"],
    ] as const) {
      const data = await resultFor(statuses, locale);
      const client = await sdk(t, mode, data);
      const result = await client.callTool({ name: "business_names_recommend", arguments: { ...brief, locale } });
      const content = result.content as Array<{ type: string; text: string }>;
      assert.equal(content.length, 2); assert.ok(content[0].text.startsWith(data.result_summary.headline));
      assert.equal(data.returned_count, expected);
      assert.deepEqual(JSON.parse(content[1].text), result.structuredContent);
    }
  });
}

test("MCP errors and unrelated tool envelopes remain ordinary JSON, without a fabricated search summary", () => {
  for (const envelope of [
    { ok: false, error: { code: "rate_limited", message: "Wait before trying again.", retryAfterSeconds: 60 } },
    { ok: true, data: { membership: "free" } },
  ]) assert.deepEqual(mcpResultContent(envelope, true), [{ type: "text", text: JSON.stringify(envelope) }]);
  const envelope = { ok: true, data: { result_summary: { headline: "6 of 10", explanation: "Missing evidence", next_steps: [] } } };
  assert.equal(mcpResultContent(envelope).length, 1, "Only search tools explicitly opting in receive this presentation.");
});

test("budget summaries explain each stop reason in all five locales without changing shortlist evidence", () => {
  const stops = ["target_reached", "candidate_pool_exhausted", "work_limit", "provider_unavailable",
    "exact_pricing_not_configured", "registrar_authorization_required", "provider_rate_limited"];
  for (const locale of ["en", "sv", "es", "fr", "zh"] as const) {
    for (const stopReason of stops) {
      const confirmedCount = stopReason === "target_reached" ? 10 : 6;
      const input = { requestedCount: 10, confirmedCount, shortfall: 10 - confirmedCount, provisionalCount: 2,
        exclusions: { not_available: 2, unverified_availability: 1, stale_availability: 1, unpriced: 2, over_budget: 3 }, search: { stopReason } };
      const original = JSON.stringify(input);
      const summary = buildConnectorResultSummary(input, locale);
      assert.equal(JSON.stringify(input), original);
      assert.equal(summary.locale, locale); assert.equal(summary.counts.returned, confirmedCount);
      assert.equal(summary.counts.provisional, 2); assert.equal(summary.counts.missing, 10 - confirmedCount);
      assert.equal(summary.reasons.find(reason => reason.code === "availability_unconfirmed")?.observation_count, 4);
      assert.ok(summary.explanation.length > 100); assert.ok(summary.next_steps.length > 0);
      if (["exact_pricing_not_configured", "registrar_authorization_required"].includes(stopReason)) {
        assert.ok(summary.next_steps.some(step => step.action === "contact_support"));
        assert.equal(summary.next_steps.some(step => step.action === "retry_later"), false);
      }
      if (locale === "en") assert.match(summary.explanation, /Unknown or outdated status does not mean a domain is taken/u);
    }
  }
});

test("public SDK budget search leads with partial, empty and complete explanations while JSON remains unchanged", async t => {
  for (const confirmedCount of [0, 6, 10]) {
    const data = { requestedCount: 10, returnedCount: confirmedCount, confirmedCount, shortfall: 10 - confirmedCount,
      provisionalCount: 3, items: Array.from({ length: confirmedCount }, (_, i) => ({ domain: `example${i}.com` })),
      provisionalItems: [], exclusions: { not_available: 2 }, search: { stopReason: confirmedCount === 10 ? "target_reached" : "provider_unavailable" } };
    const presented = { ...data, result_summary: buildConnectorResultSummary(data, "en") };
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createPublicMcpServer(async () => presented, "req_budget_clarity");
    await server.connect(serverTransport);
    const client = new Client({ name: "budget-clarity", version: "1.0.0" }); await client.connect(clientTransport);
    t.after(async () => { await client.close(); await server.close(); });
    await client.listTools();
    const result = await client.callTool({ name: "domains_suggest", arguments: { query: "artisan bakery", count: 10,
      budget: { amount: 20, currency: "USD", period: "first_year" } } });
    const content = result.content as Array<{ type: string; text: string }>;
    assert.equal(content.length, 2); assert.ok(content[0].text.startsWith(`Found ${confirmedCount} of 10`));
    assert.ok(content[0].text.includes("do not count as confirmed budget matches"));
    assert.deepEqual(result.structuredContent?.data, presented);
    assert.deepEqual(JSON.parse(content[1].text), result.structuredContent);
  }
});
