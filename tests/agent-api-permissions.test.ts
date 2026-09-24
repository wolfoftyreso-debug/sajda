import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DEVELOPER_API_SCOPES } from "../shared/developer-scopes.js";
import { API_KEY_SCOPES, assertApiKeyScopes, parseCreateDeveloperApiKey, type ApiKeyPrincipal, type ApiKeyScope } from "../api/_shared/developer-api-keys.js";
import { createMcpProductExecutor } from "../api/_shared/mcp-product.js";
import { productOperationScope, type McpOperation } from "../api/_shared/mcp-tools.js";

const oldScopes = ["domains:search", "account:read", "saved:read", "saved:write", "trading:read", "trading:run", "trading:quote"] as const;
const newScopes = ["projects:read", "projects:write", "social:check", "trading:write"] as const;
const newOperations: Array<[McpOperation, ApiKeyScope]> = [
  ["name_projects_list", "projects:read"], ["name_projects_save", "projects:write"],
  ["social_profiles_check", "social:check"], ["trading_scenarios_save", "trading:write"],
];
const principal = (scopes: readonly ApiKeyScope[]): ApiKeyPrincipal => ({
  userId: "permission-test-owner", keyId: "permission-test-key", environment: "development", scopes: [...scopes],
});

test("server and developer permission picker use one public scope catalogue", async () => {
  assert.strictEqual(API_KEY_SCOPES, DEVELOPER_API_SCOPES);
  assert.deepEqual(DEVELOPER_API_SCOPES, [...oldScopes, ...newScopes]);
  assert.equal(new Set(DEVELOPER_API_SCOPES).size, 11);
  const ui = await readFile(new URL("../src/pages/Developers.tsx", import.meta.url), "utf8");
  assert.match(ui, /import\s*\{\s*DEVELOPER_API_SCOPES\s*\}\s*from\s*["']\.\.\/\.\.\/shared\/developer-scopes(?:\.js)?["']/u);
  assert.match(ui, /const\s+permissionScopes\s*=\s*DEVELOPER_API_SCOPES\s*;/u);
  assert.doesNotMatch(ui, /const\s+permissionScopes\s*=\s*\[/u);
});

test("new scopes are opt-in: omitted permissions still grant only domain search", () => {
  assert.deepEqual(parseCreateDeveloperApiKey({ name: "Agent" }), {
    name: "Agent", scopes: ["domains:search"], expiresInDays: 90,
  });
  for (const scope of newScopes) {
    assert.deepEqual(parseCreateDeveloperApiKey({ name: "Opt-in", scopes: [scope] }).scopes, [scope]);
  }
  for (const scopes of [oldScopes, ["saved:read", "saved:write"] as const, ["trading:run"] as const]) {
    const parsed = parseCreateDeveloperApiKey({ name: "Existing permissions", scopes: [...scopes] });
    assert.deepEqual(parsed.scopes, scopes);
    assert.equal(parsed.scopes.some(scope => (newScopes as readonly string[]).includes(scope)), false);
  }
  for (const scopes of [["projects:*"], ["social:*"], ["trading:*"], ["projects:read", "projects:read"], []]) {
    assert.throws(() => parseCreateDeveloperApiKey({ name: "Rejected", scopes }), { code: "invalid_scopes" });
  }
});

test("product operations require precise permissions without implied write or provider access", () => {
  for (const [operation, scope] of newOperations) {
    assert.equal(productOperationScope(operation), scope);
    assert.doesNotThrow(() => assertApiKeyScopes(principal([scope]), [scope]));
    for (const other of DEVELOPER_API_SCOPES.filter(value => value !== scope)) {
      assert.throws(() => assertApiKeyScopes(principal([other]), [scope]), { code: "insufficient_scope", status: 403 });
    }
  }
  assert.equal(productOperationScope("trading_scenarios_list"), "trading:read");
  assert.equal(productOperationScope("trading_start"), "trading:run");
  assert.equal(productOperationScope("trading_refresh_quote"), "trading:quote");
  assert.equal(productOperationScope("business_names_recommend"), "domains:search");
  assert.throws(() => assertApiKeyScopes(principal(["trading:write"]), ["trading:run"]), { status: 403 });
  assert.throws(() => assertApiKeyScopes(principal(["projects:write"]), ["projects:read"]), { status: 403 });
});

test("old keys are rejected at the product boundary before any new workspace or provider operation", async () => {
  // No credentials, database or provider calls are made: authorization precedes
  // input parsing, quota consumption, delegation and handler dispatch.
  const execute = createMcpProductExecutor();
  for (const scopes of [["domains:search"], ["saved:read", "saved:write"], ["trading:run"], [...oldScopes]] as ApiKeyScope[][]) {
    for (const [operation] of newOperations) {
      await assert.rejects(execute(operation, {}, principal(scopes)), { code: "insufficient_scope", status: 403 });
    }
  }
});

test("scope migration expands only the constraint and never rewrites existing keys or weakens RLS", async () => {
  const sql = await readFile(new URL("../db/migrations/0020_agent_product_scopes.sql", import.meta.url), "utf8");
  const statements = sql.replace(/--[^\r\n]*/gu, "");
  const allowedValues = /scopes\s*<@\s*ARRAY\[([\s\S]*?)\]::text\[\]/u.exec(statements);
  assert.ok(allowedValues, "The migration retains a closed scope allow-list.");
  const permissions = [...allowedValues[1].matchAll(/'([^']+)'/gu)].map(match => match[1]);
  assert.deepEqual(permissions, [...DEVELOPER_API_SCOPES]);
  assert.match(statements, /cardinality\(scopes\)\s+BETWEEN\s+1\s+AND\s+11/iu);
  assert.match(statements, /array_position\(scopes,\s*NULL\)\s+IS\s+NULL/iu);
  assert.match(statements, /ADD\s+CONSTRAINT\s+developer_api_keys_scopes_check\s+CHECK/iu);
  assert.deepEqual([...statements.matchAll(/DROP\s+CONSTRAINT\s+(\w+)/giu)].map(match => match[1]), ["developer_api_keys_scopes_check"]);
  assert.doesNotMatch(statements, /\b(?:UPDATE|INSERT|DELETE|TRUNCATE|GRANT|CREATE\s+POLICY|ALTER\s+POLICY|DROP\s+POLICY|DROP\s+TABLE)\b/iu);
  assert.doesNotMatch(statements, /\bDISABLE\s+ROW\s+LEVEL\s+SECURITY\b|\bNO\s+FORCE\s+ROW\s+LEVEL\s+SECURITY\b/iu);
  assert.equal([...statements.matchAll(/ALTER\s+TABLE\s+([\w.]+)/giu)].every(match => match[1] === "sajda.developer_api_keys"), true);
  const original = await readFile(new URL("../db/migrations/0013_developer_api_keys.sql", import.meta.url), "utf8");
  assert.match(original, /cardinality\(scopes\)\s+BETWEEN\s+1\s+AND\s+7/iu, "An applied migration must not be rewritten.");
  assert.match(original, /ALTER TABLE sajda\.developer_api_keys ENABLE ROW LEVEL SECURITY/u);
  assert.match(original, /REVOKE ALL ON sajda\.developer_api_keys, sajda\.developer_api_quotas FROM PUBLIC/u);
});
