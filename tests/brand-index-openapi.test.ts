import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { generateBrandIndexOpenApiSchemas } from "../scripts/generate-brand-index-openapi.js";
import { openApiDocument } from "../api/_shared/openapi-document.mjs";
import { PUBLIC_MCP_VERSION } from "../api/_shared/public-mcp-tools.js";
import { SAJDA_MCP_VERSION } from "../api/_shared/mcp-tools.js";
import { NAME_PACKAGE_MARKET_CODES } from "../shared/name-package-markets.js";

test("brand OpenAPI schemas match runtime validators and explicitly prohibit caller verification", async () => {
  const stored = JSON.parse(await readFile(new URL("../api/_shared/brand-index-openapi.json", import.meta.url), "utf8"));
  assert.deepEqual(stored, generateBrandIndexOpenApiSchemas());
  assert.equal(stored.request.additionalProperties, false); assert.equal(stored.response.additionalProperties, false);
  for (const field of ["domains", "socials", "markets", "observations"]) assert.equal(stored.request.properties[field].uniqueItems, true);
  assert.equal(stored.request.properties.verified, undefined); assert.equal(stored.request.properties.verified_score, undefined);
  assert.equal(stored.request.properties.observations.items.additionalProperties, false);
  assert.deepEqual(stored.request.properties.markets.items.enum, [...NAME_PACKAGE_MARKET_CODES]);
  assert.equal(stored.request.properties.observations.maxItems, 20 + 6 + NAME_PACKAGE_MARKET_CODES.length);
  assert.equal(stored.response.properties.index.properties.verified_score.type, "null");
  assert.equal(stored.response.properties.index.properties.classification.const, "SELF_ASSESSMENT");
  assert.equal(stored.response.properties.targets.items.properties.classification.const, "USER_SUPPLIED");
  const document = JSON.parse(JSON.stringify(openApiDocument));
  assert.deepEqual(document.components.schemas.BrandIndexAssessmentRequest, stored.request);
  assert.deepEqual(document.components.schemas.BrandIndexAssessmentResponse, stored.response);
  const path = document.paths["/api/v1/public/brand-index"];
  assert.deepEqual(Object.keys(path), ["post", "options"]); assert.deepEqual(path.post.security, []);
  assert.equal(path.post["x-request-body-limit-bytes"], 65536);
  assert.equal(path.post.responses["200"].content["application/json"].schema.$ref, "#/components/schemas/BrandIndexAssessmentResponse");
  assert.equal(document["x-sajda-mcp"].serverVersion, SAJDA_MCP_VERSION);
  assert.equal(document["x-sajda-public-mcp"].serverVersion, PUBLIC_MCP_VERSION);
  assert.ok(document["x-sajda-public-mcp"].tools.includes("brand_index_assess"));
  assert.equal(document["x-sajda-public-mcp"].requestBodyLimitBytes, 16384);
});

test("brand page is a private noindex SPA route and the REST adapter retains its own stream bound", async () => {
  const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.ok(config.rewrites.some((route: { source: string; destination: string }) => route.source === "/brand-index" && route.destination === "/"));
  const page = config.headers.find((entry: { source: string }) => entry.source === "/brand-index");
  assert.ok(page);
  const headers = Object.fromEntries(page.headers.map((header: { key: string; value: string }) => [header.key, header.value]));
  assert.equal(headers["X-Robots-Tag"], "noindex, nofollow"); assert.equal(headers["Cache-Control"], "private, no-store");
  assert.equal(config.functions["api/v1/public/brand-index.ts"].maxDuration, 10);
  const adapter = await readFile(new URL("../scripts/serve-vercel-local.ts", import.meta.url), "utf8");
  assert.match(adapter, /\["\/api\/v1\/public\/brand-index", publicBrandIndex\]/u);
  assert.match(adapter, /path\.startsWith\("\/api\/account\/"\) \|\| path === "\/api\/developer\/api-keys"/u,
    "Only account routes enter the local 16 KiB pre-parser; public brand REST uses its own tested 64 KiB reader.");
});
