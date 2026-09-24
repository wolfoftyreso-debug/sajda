import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { generateBrandLookupOpenApiSchemas } from "../scripts/generate-brand-lookup-openapi.js";
import { openApiDocument } from "../api/_shared/openapi-document.mjs";
import { PUBLIC_MCP_VERSION } from "../api/_shared/public-mcp-tools.js";
import { SAJDA_MCP_VERSION } from "../api/_shared/mcp-tools.js";

test("brand lookup OpenAPI preserves strict operation unions, null scores and actual endpoint compatibility", async () => {
  const stored = JSON.parse(await readFile(new URL("../api/_shared/brand-lookup-openapi.json", import.meta.url), "utf8"));
  assert.deepEqual(stored, generateBrandLookupOpenApiSchemas());
  assert.equal(stored.request.type, "object"); assert.equal(stored.request.additionalProperties, false);
  assert.deepEqual(stored.request.properties.operation.enum, ["search", "profile"]);
  assert.equal(stored.request.anyOf.length, 2);
  for (const branch of stored.request.anyOf) assert.equal(branch.additionalProperties, false);
  const search = stored.request.anyOf.find((branch: { properties: { operation: { const: string } } }) => branch.properties.operation.const === "search");
  const profile = stored.request.anyOf.find((branch: { properties: { operation: { const: string } } }) => branch.properties.operation.const === "profile");
  assert.deepEqual(search.required, ["operation", "query"]); assert.deepEqual(profile.required, ["operation", "entity_id"]);
  assert.equal(search.properties.locale.default, "en"); assert.equal(search.properties.verified, undefined);
  for (const branch of stored.response.anyOf) assert.equal(branch.additionalProperties, false);
  const result = stored.response.anyOf.find((branch: { properties: { operation: { const: string } } }) => branch.properties.operation.const === "profile");
  assert.equal(result.properties.index.properties.score.type, "null");
  assert.equal(result.properties.assertions.items.properties.classification.const, "DATABASE_ASSERTION");
  const document = JSON.parse(JSON.stringify(openApiDocument));
  assert.deepEqual(document.components.schemas.BrandLookupRequest, stored.request);
  assert.deepEqual(document.components.schemas.BrandLookupResponse, stored.response);
  assert.equal(document["x-sajda-public-mcp"].serverVersion, PUBLIC_MCP_VERSION); assert.equal(document["x-sajda-mcp"].serverVersion, SAJDA_MCP_VERSION);
  assert.ok(document["x-sajda-public-mcp"].tools.includes("brand_lookup"));
  const route = document.paths["/api/v1/public/brand-lookup"];
  assert.deepEqual(Object.keys(route), ["post", "options"]); assert.deepEqual(route.post.security, []);
  assert.equal(route.post["x-request-body-limit-bytes"], 6144);
  assert.equal(route.post.responses["200"].content["application/json"].schema.$ref, "#/components/schemas/BrandLookupResponse");
  assert.ok(route.post.responses["404"]); assert.ok(route.post.responses["429"]);
});

test("brand lookup and separate assessment keep distinct public SPA routes and privacy headers", async () => {
  const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
  for (const path of ["/brand-index", "/brand-index/assessment"]) {
    assert.ok(config.rewrites.some((route: { source: string; destination: string }) => route.source === path && route.destination === "/"));
    const page = config.headers.find((entry: { source: string }) => entry.source === path);
    const headers = Object.fromEntries(page.headers.map((header: { key: string; value: string }) => [header.key, header.value]));
    assert.equal(headers["X-Robots-Tag"], "noindex, nofollow"); assert.equal(headers["Cache-Control"], "private, no-store");
  }
  assert.equal(config.functions["api/v1/public/brand-lookup.ts"].maxDuration, 15);
  const adapter = await readFile(new URL("../scripts/serve-vercel-local.ts", import.meta.url), "utf8");
  assert.match(adapter, /\["\/api\/v1\/public\/brand-lookup", publicBrandLookup\]/u);
});
