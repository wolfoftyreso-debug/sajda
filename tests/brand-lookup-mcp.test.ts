import assert from "node:assert/strict";
import { createServer } from "node:http";
import test, { type TestContext } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { createMcpHandler } from "../api/mcp.js";
import { createPublicMcpHandler } from "../api/mcp/public.js";
import { createMcpProductExecutor } from "../api/_shared/mcp-product.js";
import { createPublicMcpExecutor } from "../api/_shared/public-mcp-tools.js";
import { createBrandLookupExecutor, type executeBrandLookup } from "../api/_shared/brand-lookup.js";
import { AccountAccessError } from "../api/_shared/account-error.js";
import { accountRequestOrigin } from "../api/_shared/account-origin.js";
import type { ApiKeyScope } from "../api/_shared/developer-api-keys.js";
import { brandLookupResultSchema } from "../shared/brand-lookup.js";
import { lookupFixture } from "./brand-lookup-fixtures.js";

async function serve(t: TestContext, isPublic: boolean, options: { lookup?: typeof executeBrandLookup; scopes?: ApiKeyScope[] } = {}) {
  let origin = "", calls = 0, requestQuotas = 0;
  const lookup = async (value: unknown) => { calls++; return (options.lookup ?? lookupFixture)(value); };
  const forbidden = async () => { assert.fail("Lookup cannot invoke domain, registrar, AI or account product work"); };
  const requestOrigin = (headers: Record<string, string | string[] | undefined>) => accountRequestOrigin(headers, { BETTER_AUTH_URL: origin });
  const handler = isPublic ? createPublicMcpHandler({ requestOrigin,
    execute: createPublicMcpExecutor({}, "req_lookupsdkpublic1", { lookup, search: forbidden, fx: forbidden, quote: forbidden }) })
    : createMcpHandler({ requestOrigin,
      authorize: async headers => {
        assert.equal(headers.authorization, "Bearer fixture-key");
        return { userId: "lookup-sdk-owner", keyId: "lookup-sdk-key", scopes: options.scopes ?? ["domains:search"], environment: "development" };
      }, quota: async () => { requestQuotas++; return { allowed: true, remaining: 100, resetAt: Date.now() + 60000 }; },
      execute: createMcpProductExecutor({ lookup, quota: forbidden, domainSearch: forbidden, membership: forbidden, savedDomains: forbidden, trading: forbidden }),
    });
  const server = createServer((request, response) => { void handler(request, response); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string"); origin = `http://127.0.0.1:${address.port}`;
  t.after(async () => { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });
  const client = new Client({ name: "brand-lookup-sdk-test", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${origin}${isPublic ? "/api/mcp/public" : "/api/mcp"}`),
    isPublic ? undefined : { requestInit: { headers: { authorization: "Bearer fixture-key" } } }));
  t.after(() => client.close());
  return { client, counts: () => ({ calls, requestQuotas }) };
}

for (const isPublic of [true, false]) test(`${isPublic ? "public" : "scoped"} SDK validates lookup discovery, both operation branches and database trust labels`, async t => {
  const fixture = await serve(t, isPublic), { client } = fixture;
  const catalogue = await client.listTools();
  const expected = isPublic
    ? ["business_names_recommend", "domains_suggest", "domains_check", "name_packages_search", "brand_index_assess", "brand_lookup"]
    : ["business_names_recommend", "domains_check", "domains_search", "name_packages_search", "brand_index_assess", "brand_lookup",
      "account_membership", "name_projects_list", "name_projects_save", "social_profiles_check", "trading_scenarios_list", "trading_scenarios_save",
      "saved_domains_list", "saved_domains_save", "saved_domains_remove", "trading_status", "trading_report", "trading_start", "trading_advance",
      "trading_stop", "trading_refresh_quote"];
  assert.deepEqual(catalogue.tools.map(tool => tool.name).sort(), expected.sort(), "Discovery must match the published product operations");
  const tool = catalogue.tools.find(tool => tool.name === "brand_lookup")!;
  assert.equal(tool.inputSchema.type, "object"); assert.equal(tool.inputSchema.additionalProperties, false);
  assert.equal((tool.inputSchema.anyOf as unknown[]).length, 2);
  assert.equal(tool.annotations?.readOnlyHint, true); assert.equal(tool.annotations?.destructiveHint, false);
  assert.equal(tool.annotations?.openWorldHint, true); assert.equal(tool.annotations?.idempotentHint, false);
  assert.match(tool.description!, /not verified ownership|not ownership proof/u);
  assert.equal(fixture.counts().calls, 0, "Discovery cannot search or select an entity");
  const result = await client.callTool({ name: "brand_lookup", arguments: { operation: "search", query: "名称" } });
  assert.equal(result.structuredContent?.ok, true); assert.equal(fixture.counts().calls, 1);
  const search = brandLookupResultSchema.parse(result.structuredContent!.data);
  assert.equal(search.operation, "search"); if (search.operation !== "search") assert.fail();
  assert.equal(search.candidates.length, 2); assert.equal(search.verified_index, null);
  const selected = await client.callTool({ name: "brand_lookup", arguments: { operation: "profile", entity_id: "Q2" } });
  const profile = brandLookupResultSchema.parse(selected.structuredContent!.data);
  assert.equal(profile.operation, "profile"); if (profile.operation !== "profile") assert.fail();
  assert.equal(profile.requested_entity_id, "Q2"); assert.equal(profile.index.score, null);
  assert.equal(profile.assertions[0].relationship, "not_verified"); assert.equal(profile.assertions[0].classification, "DATABASE_ASSERTION");
  for (const args of [{ operation: "search", query: "IKEA", verified: true }, { operation: "profile", entity_id: "Q2", query: "IKEA" },
    { operation: "search", query: "IKEA", entity_id: "Q2" }, { operation: "profile", entity_id: "Q0" },
    { operation: "profile", entity_id: "Q2", source_url: "http://127.0.0.1" }]) {
    await assert.rejects(client.callTool({ name: "brand_lookup", arguments: args }), error => error instanceof McpError && error.code === ErrorCode.InvalidParams);
  }
  assert.equal(fixture.counts().calls, 2); if (!isPublic) assert.ok(fixture.counts().requestQuotas > 0);
});

test("scoped SDK lookup enforces scope and both surfaces preserve sanitized upstream retry hints", async t => {
  const denied = await serve(t, false, { scopes: [] });
  const result = await denied.client.callTool({ name: "brand_lookup", arguments: { operation: "profile", entity_id: "Q2" } });
  assert.equal(result.isError, true); assert.equal(result.structuredContent?.status, 403); assert.equal(denied.counts().calls, 0);
  for (const isPublic of [true, false]) {
    const fixture = await serve(t, isPublic, { lookup: async () => {
      throw Object.assign(new AccountAccessError("rate_limited", 429, "private upstream token"), { retryAfterSeconds: 7200 });
    } });
    const failed = await fixture.client.callTool({ name: "brand_lookup", arguments: { operation: "profile", entity_id: "Q2" } });
    assert.equal(failed.isError, true); assert.equal((failed.structuredContent?.error as { retryAfterSeconds: number }).retryAfterSeconds, 7200);
    assert.doesNotMatch(JSON.stringify(failed), /private upstream|token/u);
  }
});

test("real public SDK reaches only the fixed mocked database adapter and retains retrieval timestamps", async t => {
  let fetches = 0;
  const lookup = createBrandLookupExecutor({ now: () => Date.parse("2026-09-13T12:00:00Z"),
    reserve: async () => ({ release: async () => {}, backoff: async () => {} }),
    fetch: async (url, init) => {
      fetches++; const target = new URL(String(url)); assert.equal(target.origin, "https://www.wikidata.org");
      assert.equal(target.pathname, "/w/api.php"); assert.equal(init?.redirect, "manual");
      if (target.searchParams.get("action") === "wbgetentities") {
        assert.equal(target.searchParams.get("ids"), "Q54078");
        return new Response(JSON.stringify({ success: 1, entities: { Q54078: { id: "Q54078", type: "item",
          claims: { P31: [{ rank: "normal", mainsnak: { property: "P31", snaktype: "value", datavalue: { value: { "entity-type": "item", id: "Q4830453" } } } }] } } } }),
        { headers: { "content-type": "application/json" } });
      }
      assert.equal(target.searchParams.get("action"), "wbsearchentities"); assert.equal(target.searchParams.get("search"), "IKEA");
      return new Response(JSON.stringify({ success: 1, search: [{ id: "Q54078", label: "IKEA", description: "Mock database record, not ownership evidence" }] }),
        { headers: { "content-type": "application/json" } });
    } });
  const { client } = await serve(t, true, { lookup });
  const result = await client.callTool({ name: "brand_lookup", arguments: { operation: "search", query: "IKEA" } });
  assert.equal(result.structuredContent?.ok, true); assert.equal(fetches, 2);
  const data = brandLookupResultSchema.parse(result.structuredContent!.data);
  assert.equal(data.retrieved_at, "2026-09-13T12:00:00.000Z"); assert.equal(data.coverage, "wikidata_only");
});
