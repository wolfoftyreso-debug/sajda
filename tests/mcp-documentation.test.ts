import assert from "node:assert/strict";
import test from "node:test";
import { openApiDocument } from "../api/_shared/openapi-document.mjs";
import { API_KEY_SCOPES, API_KEY_LIMITS } from "../api/_shared/developer-api-keys.js";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";

test("OpenAPI documents the implemented scoped account contract and actual MCP compatibility", () => {
  const document = JSON.parse(JSON.stringify(openApiDocument));
  assert.ok(document.paths["/api/v1/account"].get);
  assert.ok(document.paths["/api/v1/account"].post);
  assert.ok(document.paths["/api/v1/account"].delete);
  assert.equal(document.paths["/api/mcp"], undefined, "MCP is a protocol endpoint, not a fabricated REST action.");
  assert.equal(document["x-sajda-mcp"].endpoint, "/api/mcp");
  assert.ok(document["x-sajda-mcp"].testedProtocolVersions.includes(LATEST_PROTOCOL_VERSION));
  assert.equal(document["x-sajda-mcp"].oauth, false);
  assert.equal(document["x-sajda-public-mcp"].endpoint, "/api/mcp/public");
  assert.equal(document["x-sajda-public-mcp"].authentication, "none");
  assert.deepEqual(document["x-sajda-public-mcp"].tools, ["domains_suggest", "domains_check"]);
  assert.equal(document["x-sajda-public-mcp"].readOnly, true);
  assert.equal(document.components.securitySchemes.SajdaSession.in, "cookie");
  assert.equal(document.components.securitySchemes.SajdaApiKey.scheme, "bearer");
  assert.deepEqual(document.components.schemas.DeveloperApiKeyMetadata.properties.scopes.items.enum, [...API_KEY_SCOPES]);
  assert.deepEqual(document.components.schemas.DeveloperApiKeyMetadata.properties.environment.enum, ["development", "preview", "production"]);
  assert.equal(document.components.schemas.DeveloperApiKeyCreateRequest.properties.expiresInDays.maximum, API_KEY_LIMITS.maxExpiryDays);
  assert.equal(document.components.schemas.DeveloperApiKeyListResponse.properties.limits.properties.requestsPerMinute.const, API_KEY_LIMITS.requestsPerMinute);
  assert.equal(document.components.schemas.DeveloperApiKeyCreationResponse.properties.apiKey.readOnly, true);
  assert.doesNotMatch(document.info.description, /being migrated|not enabled for new accounts|control plane is being/);
  function verifyRefs(value: unknown): void {
    if (!value || typeof value !== "object") return;
    if ("$ref" in value && typeof value.$ref === "string" && value.$ref.startsWith("#/")) {
      let found: unknown = document;
      for (const part of value.$ref.slice(2).split("/")) {
        assert.ok(found && typeof found === "object" && part in found, `Unresolved reference ${value.$ref}`);
        found = (found as Record<string, unknown>)[part];
      }
    }
    for (const child of Object.values(value)) verifyRefs(child);
  }
  verifyRefs(document);
});
