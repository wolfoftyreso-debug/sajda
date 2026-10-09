import assert from "node:assert/strict";
import test from "node:test";
import handler, { capabilities } from "../api/v1/capabilities.js";
import { openApiDocument } from "../api/_shared/openapi-document.mjs";
import { readFileSync } from "node:fs";

test("all advertised account tools map to documented REST routes and exact input schemas", () => {
  assert.equal(capabilities.capabilities.length, 31);
  assert.equal(new Set(capabilities.capabilities.map(tool => tool.name)).size, 31);
  for (const tool of capabilities.capabilities) {
    assert.ok(tool.rest, tool.name);
    const path = tool.rest.path.split("?")[0];
    assert.ok(Object.hasOwn(openApiDocument.paths, path), path);
    const schema = tool.input_schema.split("/").at(-1)!;
    assert.ok(Object.hasOwn(openApiDocument.components.schemas, schema), schema);
    assert.ok(tool.scope && tool.conditions.length);
  }
  assert.equal(capabilities.additional_public_tools[0].rest, null);
  assert.equal(capabilities.capabilities.filter(tool => tool.public_mcp).length, 5);
  for (const [name, method, path] of [
    ["brand_reports_list", "GET", "/api/v1/account?resource=brand-reports"],
    ["brand_reports_get", "GET", "/api/v1/account?resource=brand-reports&id={id}"],
    ["brand_reports_history", "GET", "/api/v1/account?resource=brand-reports&id={id}&history=true"],
    ["brand_reports_save", "POST", "/api/v1/account?resource=brand-reports"],
  ]) {
    const tool = capabilities.capabilities.find(item => item.name === name)!;
    assert.deepEqual(tool.rest, { method, path });
    assert.deepEqual(tool.conditions, ["verified_account", "brand_reports_feature_enabled"]);
    assert.equal(tool.public_rest, null);
    assert.equal(tool.public_mcp, false);
    assert.equal(tool.scope, method === "POST" ? "projects:write" : "projects:read");
  }
});

test("private source-history discovery declares archive boundaries and all required permissions", () => {
  for (const [name, method, path] of [["brand_checks_history", "GET", "/api/v1/account?resource=brand-checks&reportId={reportId}"],
    ["brand_checks_start", "POST", "/api/v1/account?resource=brand-checks"]]) {
    const tool = capabilities.capabilities.find(item => item.name === name)!;
    assert.deepEqual(tool.rest, { method, path }); assert.equal(tool.public_mcp, false); assert.equal(tool.public_rest, null);
    assert.deepEqual(tool.conditions, ["verified_account", "brand_reports_feature_enabled", "brand_checks_feature_enabled"]);
    if (name === "brand_checks_start") { assert.equal(tool.scope, "projects:write"); assert.deepEqual(tool.additionalScopes, ["domains:search"]); }
    else assert.equal(tool.scope, "projects:read");
  }
});

test("capability discovery has no account/provider runtime imports and no side effects", () => {
  const source = readFileSync(new URL("../api/v1/capabilities.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /from ["'][^"']*(?:mcp-product|mcp-tools|neon|account\/|developer-api-keys)/u);
  for (const method of ["GET", "OPTIONS", "POST"]) {
    let status = 0, payload: unknown;
    const headers = new Map<string, string | number>();
    const response = { setHeader: (name: string, value: string | number) => headers.set(name, value),
      status: (code: number) => { status = code; return response; },
      json: (value: unknown) => { payload = value; }, end: () => undefined };
    handler({ method }, response);
    assert.equal(status, method === "GET" ? 200 : method === "OPTIONS" ? 204 : 405);
    assert.equal(headers.get("Access-Control-Allow-Origin"), "*");
    assert.equal(headers.has("Access-Control-Allow-Credentials"), false);
    assert.equal(headers.get("Cache-Control"), "no-store");
    if (method === "GET") assert.equal(payload, capabilities);
  }
});
