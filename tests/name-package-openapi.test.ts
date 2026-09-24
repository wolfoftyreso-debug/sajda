import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { generateNamePackageOpenApiSchemas } from "../scripts/generate-name-package-openapi.js";
import { openApiDocument } from "../api/_shared/openapi-document.mjs";
import { DEFAULT_NAME_PACKAGE_MARKETS, NAME_PACKAGE_MARKET_CATALOG_VERSION, NAME_PACKAGE_MARKET_CODES } from "../shared/name-package-markets.js";
import { BRAND_NAME_LANGUAGES } from "../shared/name-languages.js";

test("checked-in OpenAPI package schemas match runtime validators, including unique requirements", async () => {
  const stored = JSON.parse(await readFile(new URL("../api/_shared/name-package-openapi.json", import.meta.url), "utf8"));
  assert.deepEqual(stored, generateNamePackageOpenApiSchemas());
  assert.equal(stored.request.additionalProperties, false);
  assert.equal(stored.response.additionalProperties, false);
  assert.deepEqual(stored.request.properties.nameLanguage.enum, [...BRAND_NAME_LANGUAGES]);
  assert.equal(stored.request.properties.nameLanguage.default, "en");
  assert.equal(stored.request.required.includes("nameLanguage"), false);
  for (const field of ["tlds", "platforms", "providers", "markets"]) assert.equal(stored.request.properties[field].uniqueItems, true);
  const markets = stored.request.properties.markets;
  assert.equal(stored.request.required.includes("markets"), false);
  assert.deepEqual(markets.default, [...DEFAULT_NAME_PACKAGE_MARKETS]);
  assert.deepEqual(markets.items.enum, [...NAME_PACKAGE_MARKET_CODES]);
  assert.equal(markets.minItems, 1); assert.equal(markets.maxItems, NAME_PACKAGE_MARKET_CODES.length);
  const coverage = stored.response.properties.market_coverage;
  assert.equal(coverage.additionalProperties, false);
  assert.equal(coverage.properties.catalog_version.const, NAME_PACKAGE_MARKET_CATALOG_VERSION);
  assert.equal(coverage.properties.checked_markets.maxItems, 0);
  assert.equal(coverage.properties.automated_checks_available.const, false);
  const document = JSON.parse(JSON.stringify(openApiDocument));
  assert.deepEqual(document.components.schemas.NamePackageSearchRequest, stored.request);
  assert.deepEqual(document.components.schemas.NamePackageIntelligenceResponse, stored.response);
  assert.deepEqual(document.paths["/api/v1/public/name-packages"].post.security, []);
  assert.deepEqual(document.paths["/api/v1/name-packages"].post.security, [{ SajdaApiKey: [] }]);
  for (const path of ["/api/v1/public/name-packages", "/api/v1/name-packages"]) {
    assert.equal(document.paths[path].post.responses["200"].content["application/json"].schema.$ref,
      "#/components/schemas/NamePackageIntelligenceResponse");
  }
});
