import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { AccountAccessError } from "../api/_shared/account-error.js";
import { API_KEY_SCOPES, type ApiKeyPrincipal } from "../api/_shared/developer-api-keys.js";
import { readDelegatedAccount } from "../api/_shared/delegated-account.js";
import { createMcpProductExecutor } from "../api/_shared/mcp-product.js";
import { createPublicMcpExecutor, createPublicMcpServer } from "../api/_shared/public-mcp-tools.js";
import { createSajdaMcpServer, parseProductOperationInput, productOperationCatalogue, productOperationInputJsonSchema } from "../api/_shared/mcp-tools.js";
import { createAccountApiHandler } from "../api/v1/account.js";
import { createBusinessNamesApiHandler } from "../api/v1/business-names.js";
import { createPublicBusinessNamesApiHandler } from "../api/v1/public/business-names.js";
import { createNameProjectsHandler } from "../api/account/name-projects.js";
import { createTradingScenariosHandler } from "../api/account/trading-scenarios.js";
import { businessNamesResultSchema } from "../api/_shared/business-names-contract.js";

const environment = process.env.VERCEL_ENV || "development";
assert.ok(environment === "development" || environment === "preview" || environment === "production");
const principal: ApiKeyPrincipal = { userId: "parity-owner", keyId: "parity-key", environment, scopes: [...API_KEY_SCOPES] };
const quota = async () => ({ allowed: true, remaining: 10, resetAt: Date.now() + 60000 });
const input = { businessDescription: "A bakery making artisan bread", nameLanguage: "fr", tlds: ["com"], platforms: ["github"], count: 3 };
const headers = { "content-type": "application/json" };
const project = { id: "10000000-0000-4000-8000-000000000001", expectedVersion: 0, title: "Bread brand",
  description: "", audience: "", desiredStyle: "", languages: ["fr"], archived: false, shortlistDomains: [],
  budget: { currency: "USD", maxFirstYearCents: null, maxAnnualRenewalCents: null } };
const scenario = { id: "10000000-0000-4000-8000-000000000002", expectedVersion: 0, domain: "example.com", title: "Thesis",
  thesis: "", catalyst: "", invalidation: "", reviewOn: "2026-12-01", stance: "neutral", analysisMode: "balanced",
  assumptions: { acquisitionUsd: 10, annualRenewalUsd: 12, otherCostsUsd: 0, holdingMonths: 12,
    sellingFeePercent: 10, saleProbabilityPercent: 10, bearSaleUsd: 10, baseSaleUsd: 100, bullSaleUsd: 1000 } };
function response() {
  return { code: 200, body: undefined as unknown, headers: new Map<string, string | number>(),
    status(code: number) { this.code = code; return this; },
    setHeader(key: string, value: string | number) { this.headers.set(key.toLowerCase(), value); },
    json(body: unknown) { this.body = body; }, end(body?: string) { this.body = body; } };
}

test("business recommendation reuses exactly one bounded domain call and quota, without forwarding credentials", async () => {
  let searches = 0, quotas = 0;
  const execute = createMcpProductExecutor({ quota: async (_owner, bucket) => { quotas++; assert.equal(bucket, "domains"); return quota(); },
    domainSearch: async (request, res) => {
      searches++; assert.deepEqual(request.headers, {});
      const domains = Object.getOwnPropertySymbols(request).map(symbol => Reflect.get(request, symbol)).find(Array.isArray) as string[];
      assert.ok(domains.length <= 110);
      assert.equal(request.body.count, 10);
      assert.equal("aiConsent" in request.body, false);
      res.status(200).json({ checkedAt: new Date().toISOString(), results: domains.map((domain, index) => ({
        domain, status: index < 2 ? "available" : "unknown", authoritative: index < 2, checkMethod: "rdap",
        source: "registry", checkedAt: new Date().toISOString(), namingScore: 80,
      })) });
    } });
  await assert.rejects(execute("business_names_recommend", { ...input, userId: "other" }, principal), AccountAccessError);
  await assert.rejects(execute("business_names_recommend", input, { ...principal, scopes: [] }), AccountAccessError);
  assert.equal(searches, 0); assert.equal(quotas, 0);
  const output = await execute("business_names_recommend", input, principal);
  assert.equal(output.status, 200); assert.equal(searches, 1); assert.equal(quotas, 1);
  const result = businessNamesResultSchema.parse(output.data);
  assert.equal(result.requested_count, 3); assert.equal(result.returned_count, 2); assert.equal(result.completeness, "partial");
  assert.equal(result.requirements.name_language, "fr"); assert.equal(result.methodology.ai_used, false);
  const denied = createMcpProductExecutor({ quota: async () => ({ allowed: false, remaining: 0, resetAt: Date.now() + 60000 }),
    domainSearch: async () => assert.fail("quota rejection must stop external work") });
  await assert.rejects(denied("business_names_recommend", input, principal), error => error instanceof AccountAccessError
    && error.status === 429 && "retryAfterSeconds" in error && Number(error.retryAfterSeconds) > 0);
});

test("public business names keep only platform network identity, one check and honest empty evidence", async () => {
  let searches = 0;
  const execute = createPublicMcpExecutor({ ...headers, cookie: "private", authorization: "Bearer private",
    "x-sajda-account": "forged", "x-forwarded-for": "192.0.2.19" }, "req_paritypublic0001", {
    search: async (request, res) => {
      searches++;
      assert.deepEqual(request.headers, { "content-type": "application/json", "x-forwarded-for": "192.0.2.19" });
      res.status(200).json({ results: [] });
    }, quote: async () => assert.fail("recommendations must not pretend budget qualification"),
  });
  const result = businessNamesResultSchema.parse(await execute("business_names_recommend", input));
  assert.equal(searches, 1); assert.equal(result.returned_count, 0); assert.equal(result.completeness, "none");
  assert.equal(result.shortfall_reason, "no_fresh_available_domains");
});

test("REST recommendation endpoints enforce media/auth/scope/origin/input limits and preserve retry semantics", async () => {
  let requests = 0, executions = 0;
  const privateHandler = createBusinessNamesApiHandler({ authorize: async () => principal, requestOrigin: () => "https://sajda.test",
    quota: async () => { requests++; return quota(); }, execute: async (operation, args) => {
      executions++; assert.equal(operation, "business_names_recommend"); assert.equal(args.nameLanguage, "fr");
      const error = new AccountAccessError("rate_limited", 429, "Wait."); Object.assign(error, { retryAfterSeconds: 17 }); throw error;
    } });
  for (const invalid of [{ body: { ...input, aiConsent: true }, headers }, { body: input, headers: { ...headers, origin: "https://evil.test" } },
    { body: input, headers: { "content-type": "text/plain" } }, { body: "x".repeat(9000), headers }]) {
    const res = response(); await privateHandler({ method: "POST", ...invalid }, res);
    assert.ok(res.code >= 400 && res.code < 500);
  }
  assert.equal(requests, 0); assert.equal(executions, 0);
  const limited = response(); await privateHandler({ method: "POST", headers, body: input }, limited);
  assert.equal(limited.code, 429); assert.equal(limited.headers.get("retry-after"), 17); assert.equal(requests, 1); assert.equal(executions, 1);
  const publicHandler = createPublicBusinessNamesApiHandler({ execute: async () => { assert.fail("invalid public request must not execute"); } });
  for (const supplied of [{ ...headers, Authorization: "Bearer key" }, { ...headers, authorization: "Bearer key" }]) {
    const res = response(); await publicHandler({ method: "POST", headers: supplied, body: input }, res); assert.equal(res.code, 400);
  }
  const options = response(); await publicHandler({ method: "OPTIONS", headers: {} }, options); assert.equal(options.code, 204);
  const noScope = createBusinessNamesApiHandler({ authorize: async () => ({ ...principal, scopes: [] }), requestOrigin: () => "https://sajda.test" });
  const denied = response(); await noScope({ method: "POST", headers, body: input }, denied); assert.equal(denied.code, 403);
});

test("private parity delegates exact owner and method without spoofable HTTP credentials", async () => {
  const calls: { name: string; body: unknown }[] = [];
  const handler = (name: string) => async (request: { method?: string; headers?: Record<string, string | string[] | undefined>; body?: unknown }, res: ReturnType<typeof response>) => {
    assert.ok(request.headers); const delegated = readDelegatedAccount(request.headers, request.method);
    assert.equal(delegated?.userId, principal.userId); assert.equal(delegated?.credentialId, principal.keyId);
    assert.equal(request.headers.authorization, undefined); assert.equal(request.headers.cookie, undefined);
    calls.push({ name, body: request.body }); res.status(200).json({ accountId: delegated?.userId,
      projects: [project, { id: "unrelated", title: "private project" }], scenarios: [scenario, { id: "unrelated", title: "private scenario" }] });
  };
  const execute = createMcpProductExecutor({ nameProjects: handler("projects"), socialProfiles: handler("social"), tradingScenarios: handler("scenarios") });
  await assert.rejects(execute("name_projects_list", {}, {
    ...principal, environment: environment === "preview" ? "production" : "preview",
  }), error => error instanceof AccountAccessError && error.code === "insufficient_scope" && error.status === 403);
  assert.equal(calls.length, 0, "Credentials from another deployment must never reach an account handler.");
  for (const [operation, args, name, body] of [
    ["name_projects_list", {}, "projects", undefined], ["name_projects_save", { project }, "projects", { action: "save", project }],
    ["social_profiles_check", { handles: [" OctoCat "] }, "social", { handles: ["octocat"] }],
    ["trading_scenarios_list", {}, "scenarios", undefined], ["trading_scenarios_save", { scenario }, "scenarios", { action: "save", scenario }],
  ] as const) {
    const result = await execute(operation, args, principal); assert.equal(result.status, 200);
    if (operation.endsWith("_save")) assert.doesNotMatch(JSON.stringify(result.data), /unrelated|private project|private scenario/u);
    assert.deepEqual(calls.at(-1), { name, body });
    await assert.rejects(execute(operation, args, { ...principal, scopes: [] }), AccountAccessError);
  }
  assert.equal(calls.length, 5);
  for (const [operation, args, scope] of [["name_projects_save", { project }, "projects:write"],
    ["trading_scenarios_save", { scenario }, "trading:write"]] as const) {
    const result = await execute(operation, args, { ...principal, scopes: [scope] });
    assert.equal(result.status, 200); assert.doesNotMatch(JSON.stringify(result.data), /unrelated|private project|private scenario/u);
  }
  await assert.rejects(execute("name_projects_save", { project: { ...project, owner: "other" } }, principal), AccountAccessError);
  await assert.rejects(execute("social_profiles_check", { handles: ["octocat"], url: "https://internal" }, principal), AccountAccessError);
});

test("parity retains feature flags and server-side Trading entitlement", async () => {
  const execute = createMcpProductExecutor({ nameProjects: createNameProjectsHandler({ enabled: () => false }),
    tradingScenarios: createTradingScenariosHandler({
      authorize: async (headers, options) => { const owner = readDelegatedAccount(headers!, options?.method); assert.equal(owner?.userId, principal.userId); return { id: principal.userId, emailVerified: true }; },
      membership: async () => ({ plan: "free", accessSource: "none", expiresAt: null,
        capabilities: { save_domains: false, swipe_undo: false, trading: false } }),
      store: { limit: async () => assert.fail("no Trading storage without entitlement"), read: async () => [], save: async () => [] },
    }),
  });
  assert.equal((await execute("name_projects_list", {}, principal)).status, 404);
  assert.equal((await execute("trading_scenarios_list", {}, principal)).status, 403);
  assert.equal((await execute("trading_scenarios_save", { scenario }, principal)).status, 403);
});

test("REST account dispatcher exposes strict shared project/social/scenario mappings", async () => {
  const calls: string[] = [];
  const handler = createAccountApiHandler({ authorize: async () => principal, quota, requestOrigin: () => "https://sajda.test",
    execute: async (operation, args) => { calls.push(operation); return { status: 200, data: args }; } });
  for (const [resource, method, body, operation] of [
    ["name-projects", "GET", undefined, "name_projects_list"], ["name-projects", "POST", { project }, "name_projects_save"],
    ["social-profiles", "POST", { handles: ["octocat"] }, "social_profiles_check"],
    ["trading-scenarios", "GET", undefined, "trading_scenarios_list"], ["trading-scenarios", "POST", { scenario }, "trading_scenarios_save"],
  ] as const) {
    const res = response(); await handler({ method, headers, body, query: { resource } }, res);
    assert.equal(res.code, 200); assert.equal(calls.at(-1), operation);
  }
  for (const request of [
    { method: "GET", query: { resource: "social-profiles" } },
    { method: "GET", query: { resource: "name-projects", userId: "other" } },
    { method: "DELETE", query: { resource: "trading-scenarios" } },
    { method: "POST", query: { resource: "name-projects" }, body: { project, verified: true } },
  ]) { const res = response(); await handler({ ...request, headers }, res); assert.ok(res.code >= 400); }
  assert.equal(calls.length, 5);
});

test("real SDK discovery exposes bounded legacy schemas and protects private tools from public access", async t => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  let calls = 0;
  const server = createSajdaMcpServer(principal, async () => { calls++; return { status: 200, data: {} }; }, "req_paritycatalog1");
  await server.connect(serverTransport);
  const client = new Client({ name: "parity-test", version: "1.0.0" }); await client.connect(clientTransport);
  t.after(async () => { await client.close(); await server.close(); });
  const catalogue = await client.listTools(); assert.equal(catalogue.tools.length, 21); assert.equal(calls, 0);
  const schemas = ["name_projects_save", "trading_scenarios_save", "social_profiles_check"] as const;
  for (const operation of schemas) {
    const schema = productOperationInputJsonSchema(operation);
    assert.equal(schema.type, "object"); assert.equal(schema.additionalProperties, false);
    assert.ok(Object.keys(schema.properties ?? {}).length);
    assert.deepEqual(catalogue.tools.find(tool => tool.name === operation)?.inputSchema, schema);
  }
  assert.equal(productOperationCatalogue().find(tool => tool.name === "name_projects_save")?.scope, "projects:write");
  assert.throws(() => parseProductOperationInput("name_projects_save", { project: { ...project, expectedVersion: -1 } }), AccountAccessError);
  assert.throws(() => parseProductOperationInput("trading_scenarios_save", { scenario: { ...scenario, reviewOn: "2026-02-31" } }), AccountAccessError);
  await assert.rejects(client.callTool({ name: "name_projects_save", arguments: { project: { ...project, ownerId: "other" } } }));
  assert.equal(calls, 0);
  await client.callTool({ name: "name_projects_save", arguments: { project } }); assert.equal(calls, 1);
  const [publicClientTransport, publicServerTransport] = InMemoryTransport.createLinkedPair();
  let publicSearches = 0;
  const publicExecute = createPublicMcpExecutor({}, "req_paritypublic0001", {
    search: async (_request, res) => { publicSearches++; res.status(200).json({ results: [] }); },
  });
  const publicServer = createPublicMcpServer(publicExecute, "req_paritypublic0001"); await publicServer.connect(publicServerTransport);
  const publicClient = new Client({ name: "parity-public", version: "1.0.0" }); await publicClient.connect(publicClientTransport);
  t.after(async () => { await publicClient.close(); await publicServer.close(); });
  const publicTools = await publicClient.listTools(); assert.equal(publicTools.tools.length, 6);
  assert.ok(publicTools.tools.some(tool => tool.name === "business_names_recommend"));
  for (const name of schemas) await assert.rejects(publicClient.callTool({ name, arguments: {} }));
  await assert.rejects(publicClient.callTool({ name: "business_names_recommend", arguments: { ...input, aiConsent: true } }));
  assert.equal(publicSearches, 0);
  const recommendation = await publicClient.callTool({ name: "business_names_recommend", arguments: input });
  assert.equal(recommendation.isError, undefined); assert.equal(publicSearches, 1);
  const structured = recommendation.structuredContent as { data: unknown };
  assert.equal(businessNamesResultSchema.parse(structured.data).returned_count, 0);
});
