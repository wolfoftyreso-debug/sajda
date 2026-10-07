import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createAccountApiHandler } from "../api/v1/account.js";
import { createMcpProductExecutor } from "../api/_shared/mcp-product.js";
import { productOperationInputJsonSchema, productOperationScope } from "../api/_shared/mcp-tools.js";
import { readDelegatedAccount } from "../api/_shared/delegated-account.js";
import { nativeAccountRoute, nativeAccountJson } from "../api/native/account.js";
import { type ApiKeyPrincipal } from "../api/_shared/developer-api-keys.js";

const principal: ApiKeyPrincipal = { userId: "brand-report-integration", keyId: randomUUID(),
  environment: process.env.VERCEL_ENV || "development", scopes: ["projects:read", "projects:write"] };
const id = randomUUID();
const report = { id, requestKey: randomUUID(), expectedVersion: 0, title: "Recorded assessment",
  assessment: { brand_name: "Example", identity_label: "example", primary_domain: "example.com",
    domains: ["example.com"], socials: [{ platform: "github", handle: "example" }], markets: ["US"],
    observations: [{ target_id: "domain:example.com", status: "reported_owned", reported_at: "2026-01-01T12:00:00Z" }] } };
function recorder() {
  return { code: 0, body: undefined as unknown, headers: new Map<string, string | number>(),
    setHeader(name: string, value: string | number) { this.headers.set(name.toLowerCase(), value); },
    status(code: number) { this.code = code; return this; }, json(value: unknown) { this.body = value; } };
}
test("REST brand-report list/get/history/save dispatch strict scoped private operations", async () => {
  const calls: { operation: string; args: unknown }[] = [];
  const handler = createAccountApiHandler({ authorize: async () => principal,
    requestOrigin: () => "https://sajda.test", quota: async () => ({ allowed: true, remaining: 100, resetAt: Date.now() + 60000 }),
    execute: async (operation, args) => { calls.push({ operation, args }); return { status: 200, data: { accountId: principal.userId } }; } });
  async function call(method: string, query: Record<string, unknown> = {}, body?: unknown) {
    const response = recorder();
    await handler({ method, headers: { "content-type": "application/json" }, query: { resource: "brand-reports", ...query }, body }, response);
    return response;
  }
  assert.equal((await call("GET")).code, 200);
  assert.equal(calls.at(-1)?.operation, "brand_reports_list");
  assert.equal((await call("GET", { id, version: "1" })).code, 200);
  assert.deepEqual(calls.at(-1), { operation: "brand_reports_get", args: { id, version: 1 } });
  assert.equal((await call("GET", { id, history: "true" })).code, 200);
  assert.deepEqual(calls.at(-1), { operation: "brand_reports_history", args: { id } });
  assert.equal((await call("POST", {}, { report })).code, 200);
  assert.equal(calls.at(-1)?.operation, "brand_reports_save");
  const before = calls.length;
  for (const query of [{ version: "1" }, { id, history: "true", version: "1" }, { id, history: "false" },
    { id: ["first", "second"] }, { id, version: "0" }, { id, ownerId: "foreign" }]) {
    assert.equal((await call("GET", query)).code, 400);
  }
  assert.equal((await call("POST", {}, { report: { ...report, verified: true } })).code, 400);
  assert.equal(calls.length, before);
  assert.equal((await call("DELETE")).code, 405);
});
test("MCP bridge preserves report request key and dated self reports without forwarding credential values", async () => {
  const seen: unknown[] = [];
  const execute = createMcpProductExecutor({ brandReports: async (request, response) => {
    const delegation = readDelegatedAccount(request.headers!, request.method);
    assert.equal(delegation?.userId, principal.userId);
    assert.equal("authorization" in request.headers!, false);
    seen.push({ method: request.method, query: request.query, body: request.body });
    response.status(200).json({ accountId: principal.userId, report: { id } });
  } });
  await execute("brand_reports_get", { id, version: 1 }, principal);
  assert.deepEqual(seen.at(-1), { method: "GET", query: { id, version: "1" }, body: undefined });
  await execute("brand_reports_history", { id }, principal);
  assert.deepEqual(seen.at(-1), { method: "GET", query: { id, history: "true" }, body: undefined });
  await execute("brand_reports_save", { report }, principal);
  assert.equal((seen.at(-1) as { body: { report: typeof report } }).body.report.requestKey, report.requestKey);
  assert.equal((seen.at(-1) as { body: { report: typeof report } }).body.report.assessment.observations[0].reported_at, "2026-01-01T12:00:00Z");
  await assert.rejects(() => execute("brand_reports_list", {}, { ...principal, scopes: ["projects:write"] }), { code: "insufficient_scope" });
  await assert.rejects(() => execute("brand_reports_save", { report }, { ...principal, scopes: ["projects:read"] }), { code: "insufficient_scope" });
  assert.equal(productOperationScope("brand_reports_save"), "projects:write");
  assert.ok(productOperationInputJsonSchema("brand_reports_save").properties?.report);
});
test("native account allowlist exposes only canonical private report actions with bounded envelopes", async () => {
  assert.equal(nativeAccountRoute("/api/account/brand-reports", "POST").scope, "saved:write");
  assert.deepEqual(nativeAccountRoute(`/api/account/brand-reports?id=${id}&version=1`, "GET").query, { id, version: "1" });
  for (const route of ["/api/account/brand-reports?ownerId=foreign", `/api/account/brand-reports?id=${id}&id=${id}`]) {
    assert.throws(() => nativeAccountRoute(route, "GET"), { code: "invalid_request" });
  }
  assert.throws(() => nativeAccountRoute(`/api/account/brand-reports?id=${id}`, "POST"), { code: "invalid_request" });
  assert.throws(() => nativeAccountRoute("/api/account/brand-reports", "DELETE"), { code: "unsupported_native_action" });
  const body = { path: "/api/account/brand-reports", method: "POST", accountId: principal.userId,
    body: { report, padding: "x".repeat(17000) } };
  assert.deepEqual(await nativeAccountJson({ headers: { "content-type": "application/json" }, body }), body);
  await assert.rejects(() => nativeAccountJson({ headers: { "content-type": "application/json" }, body: { ...body, path: "/api/account/membership" } }),
    { code: "request_too_large" });
});

test("REST source checks enforce both permissions, closed inputs and exact versioned pagination", async () => {
  const calls: unknown[] = [];
  const owner = { ...principal, scopes: ["projects:read", "projects:write", "domains:search"] as ApiKeyPrincipal["scopes"] };
  const input = { reportId: id, expectedVersion: 1, requestKey: randomUUID() };
  const handler = createAccountApiHandler({ authorize: async () => owner, requestOrigin: () => "https://sajda.test",
    quota: async () => ({ allowed: true, remaining: 100, resetAt: Date.now() + 60000 }),
    execute: async (operation, args) => { calls.push({ operation, args }); return { status: 200, data: { accountId: owner.userId } }; } });
  const start = recorder(); await handler({ method: "POST", headers: { "content-type": "application/json" }, query: { resource: "brand-checks" }, body: input }, start);
  assert.equal(start.code, 200); assert.deepEqual(calls[0], { operation: "brand_checks_start", args: input });
  const history = recorder(); await handler({ method: "GET", headers: {}, query: { resource: "brand-checks", reportId: id, version: "1", offset: "0", limit: "20" } }, history);
  assert.equal(history.code, 200); assert.deepEqual(calls[1], { operation: "brand_checks_history", args: { reportId: id, version: 1, offset: 0, limit: 20 } });
  for (const scopes of [["projects:write"], ["domains:search"]]) {
    owner.scopes = scopes as ApiKeyPrincipal["scopes"];
    const denied = recorder(); await handler({ method: "POST", headers: { "content-type": "application/json" }, query: { resource: "brand-checks" }, body: input }, denied);
    assert.equal(denied.code, 403);
  }
  owner.scopes = ["projects:read", "projects:write", "domains:search"];
  for (const query of [{ reportId: id, version: "0" }, { reportId: id, offset: "100" }, { reportId: id, limit: "21" }, { reportId: id, ownerId: "foreign" }, { reportId: [id, id] }]) {
    const invalid = recorder(); await handler({ method: "GET", headers: {}, query: { resource: "brand-checks", ...query } }, invalid); assert.equal(invalid.code, 400);
  }
  const forged = recorder(); await handler({ method: "POST", headers: { "content-type": "application/json" }, query: { resource: "brand-checks" }, body: { ...input, entries: [] } }, forged);
  assert.equal(forged.code, 400); assert.equal(calls.length, 2);
});

test("native source-history routing accepts only documented methods and query keys", () => {
  assert.equal(nativeAccountRoute("/api/account/brand-checks", "POST").scope, "saved:write");
  assert.equal(nativeAccountRoute(`/api/account/brand-checks?reportId=${id}&version=1&offset=0&limit=20`, "GET").scope, "saved:read");
  for (const path of [`/api/account/brand-checks?reportId=${id}&reportId=${id}`, "/api/account/brand-checks?ownerId=foreign", "/api/account/brand-checks#fragment"]) {
    assert.throws(() => nativeAccountRoute(path, "GET"), { code: "invalid_request" });
  }
  assert.throws(() => nativeAccountRoute(`/api/account/brand-checks?reportId=${id}`, "POST"), { code: "invalid_request" });
  assert.throws(() => nativeAccountRoute("/api/account/brand-checks", "DELETE"), { code: "unsupported_native_action" });
});
