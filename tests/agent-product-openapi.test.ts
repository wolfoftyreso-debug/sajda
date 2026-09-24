import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { generateAgentProductOpenApiSchemas } from "../scripts/generate-agent-product-openapi.js";
import { productOperationCatalogue, productOperationInputJsonSchema } from "../api/_shared/mcp-tools.js";
import { openApiDocument } from "../api/_shared/openapi-document.mjs";
import { DEVELOPER_API_SCOPES } from "../shared/developer-scopes.js";
import { BRAND_NAME_LANGUAGES } from "../shared/name-languages.js";

test("checked-in agent catalogue and schemas match actual MCP/runtime contracts without secrets", async () => {
  const stored = JSON.parse(await readFile(new URL("../api/_shared/agent-product-openapi.json", import.meta.url), "utf8"));
  assert.deepEqual(stored, generateAgentProductOpenApiSchemas());
  assert.deepEqual(stored.catalogue, productOperationCatalogue());
  assert.deepEqual(stored.scopes, [...DEVELOPER_API_SCOPES]);
  assert.equal(stored.scopes.length, 11);
  for (const operation of productOperationCatalogue()) {
    assert.deepEqual(stored.inputs[operation.name], productOperationInputJsonSchema(operation.name));
    assert.ok(stored.schemas[`AgentInput_${operation.name}`]);
    assert.ok(stored.scopes.includes(operation.scope));
  }
  assert.doesNotMatch(JSON.stringify(stored), /postgres(?:ql)?:\/\/|sj_(?:live|test)_[A-Za-z0-9_-]{16}_|sk_(?:live|test)_/u);
});

test("business-name OpenAPI uses shared strict schemas, language defaults and true completeness semantics", () => {
  const document = JSON.parse(JSON.stringify(openApiDocument));
  const request = document.components.schemas.BusinessNamesRequest;
  assert.equal(request.additionalProperties, false);
  assert.deepEqual(request.required, ["businessDescription"]);
  assert.equal(request.properties.businessDescription.maxLength, 1000);
  assert.deepEqual(request.properties.nameLanguage.enum, [...BRAND_NAME_LANGUAGES]);
  assert.equal(request.properties.nameLanguage.default, "en");
  assert.equal(request.properties.count.maximum, 10);
  assert.equal(request.properties.budget, undefined);
  const result = document.components.schemas.BusinessNamesResponse;
  assert.equal(result.additionalProperties, false);
  assert.deepEqual(result.properties.completeness.enum, ["complete", "partial", "none"]);
  assert.ok(result.required.includes("shortfall_reason"));
  assert.ok(result.required.includes("intelligence"));
  assert.ok(result.required.includes("result_summary"));
  const summary = result.properties.result_summary;
  assert.equal(summary.additionalProperties, false);
  assert.deepEqual(summary.required, ["locale", "headline", "explanation", "counts", "reasons", "next_steps"]);
  assert.deepEqual(summary.properties.locale.enum, ["en", "sv", "es", "fr", "zh"]);
  assert.ok(summary.properties.counts.required.includes("missing"));
  assert.ok(summary.properties.counts.required.includes("registered_only_candidates"));
  assert.ok(summary.properties.counts.required.includes("unconfirmed_candidates"));
  assert.ok(summary.properties.counts.required.includes("unassessed_candidates"));
  assert.deepEqual(summary.properties.reasons.items.properties.code.enum, [
    "requested_domains_taken", "availability_unconfirmed", "candidates_not_assessed", "insufficient_candidates_generated",
  ]);
  assert.equal(summary.properties.next_steps.minItems, 1);
  assert.match(summary.description, /before the recommendations/u);
  for (const path of ["/api/v1/business-names", "/api/v1/public/business-names"]) {
    const operation = document.paths[path].post;
    assert.equal(operation["x-sajda-mcp-tool"], "business_names_recommend");
    assert.equal(operation["x-request-body-limit-bytes"], 6144);
    assert.equal(operation.requestBody.content["application/json"].schema.$ref, "#/components/schemas/BusinessNamesRequest");
    assert.equal(operation.responses[200].content["application/json"].schema.$ref, "#/components/schemas/BusinessNamesResponse");
    assert.match(operation.description, /not an exhaustive search/u);
    assert.match(operation.description, /partial|shortfall/u);
  }
  assert.deepEqual(document.paths["/api/v1/public/business-names"].post.security, []);
  assert.deepEqual(document.paths["/api/v1/business-names"].post.security, [{ SajdaApiKey: [] }]);
  assert.deepEqual(document.paths["/api/v1/business-names"].post["x-sajda-required-scopes"], ["domains:search"]);
});

test("account discovery describes exact project/social/scenario request shapes and narrow permissions", () => {
  const document = JSON.parse(JSON.stringify(openApiDocument));
  const account = document.paths["/api/v1/account"];
  assert.ok(account.get.parameters[0].schema.enum.includes("name-projects"));
  assert.ok(account.get.parameters[0].schema.enum.includes("trading-scenarios"));
  assert.equal(account.get.parameters[0].schema.enum.includes("social-profiles"), false);
  assert.equal(account.get["x-sajda-resource-scopes"]["name-projects"], "projects:read");
  assert.equal(account.post["x-sajda-action-scopes"].name_projects_save, "projects:write");
  assert.equal(account.post["x-sajda-action-scopes"].trading_scenarios_save, "trading:write");
  assert.equal(account.post["x-sajda-action-scopes"].social_profiles_check, "social:check");
  assert.deepEqual(account.post["x-sajda-resource-body-limit-bytes"], {
    "saved-domains": 8192, trading: 8192, "name-projects": 32768, "trading-scenarios": 16384, "social-profiles": 4096,
  });
  const schemas = document.components.schemas;
  const project = schemas.NameProjectsSaveRequest;
  assert.equal(project.additionalProperties, false); assert.deepEqual(project.required, ["project"]);
  assert.equal(project.properties.project.additionalProperties, false);
  assert.ok(project.properties.project.required.includes("expectedVersion"));
  assert.ok(project.properties.project.required.includes("shortlistDomains"));
  assert.ok(project.properties.project.properties.brandShortlist.items.properties.nameLanguage);
  const scenario = schemas.TradingScenariosSaveRequest;
  assert.equal(scenario.additionalProperties, false); assert.deepEqual(scenario.required, ["scenario"]);
  assert.ok(scenario.properties.scenario.required.includes("expectedVersion"));
  assert.ok(scenario.properties.scenario.required.includes("assumptions"));
  const social = schemas.SocialProfilesCheckRequest;
  assert.equal(social.additionalProperties, false); assert.deepEqual(social.required, ["handles"]);
  assert.equal(social.properties.handles.maxItems, 5);
  assert.equal(schemas.SocialProfilesResponse.properties.observations.items.properties.platform.const, "github");
  assert.match(account.post.description, /absent profile is not registrability or ownership proof/u);
  assert.match(account.post.description, /Stale writes conflict/u);
});

test("public documentation runtime imports only static schemas and discovery is not live entitlement", async () => {
  const source = await readFile(new URL("../api/_shared/openapi-document.mjs", import.meta.url), "utf8");
  for (const statement of source.matchAll(/^import .*$/gmu)) assert.match(statement[0], /\.json["'] with \{ type: ["']json["'] \}/u);
  const document = JSON.parse(JSON.stringify(openApiDocument));
  assert.deepEqual(document.paths["/api/v1/capabilities"].get.security, []);
  assert.match(document.paths["/api/v1/capabilities"].get.description, /does not read an account, prove entitlement/u);
  assert.equal(document.paths["/api/mcp"], undefined);
  assert.equal(document.paths["/api/mcp/public"], undefined);
});
