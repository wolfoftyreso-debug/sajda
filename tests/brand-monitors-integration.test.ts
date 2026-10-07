import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv-provider.js";
import { createAccountApiHandler } from "../api/v1/account.js";
import { createMcpProductExecutor } from "../api/_shared/mcp-product.js";
import { productOperationInputJsonSchema } from "../api/_shared/mcp-tools.js";
import { readDelegatedAccount } from "../api/_shared/delegated-account.js";
import { nativeAccountRoute } from "../api/native/account.js";
import type { ApiKeyPrincipal } from "../api/_shared/developer-api-keys.js";

const reportId = randomUUID();
function recorder() {
  return { code: 0, body: undefined as unknown, headers: new Map<string, string | number>(),
    setHeader(name: string, value: string | number) { this.headers.set(name.toLowerCase(), value); },
    status(code: number) { this.code = code; return this; }, json(value: unknown) { this.body = value; } };
}
const principal: ApiKeyPrincipal = { userId: "synthetic-monitor-adapter", keyId: randomUUID(),
  environment: process.env.VERCEL_ENV || "development", scopes: ["projects:read", "projects:write", "domains:search"] };

test("machine configure schema accepts every real action branch and rejects mixed or forged actions", () => {
  const validate = new AjvJsonSchemaValidator().getValidator(productOperationInputJsonSchema("brand_monitors_configure"));
  const base = { reportId, requestKey: randomUUID() };
  const enable = { ...base, action: "enable", expectedReportVersion: 1, expectedMonitorVersion: 0 };
  const resume = { ...base, action: "resume", expectedMonitorVersion: 1 };
  const rebind = { ...base, action: "rebind", expectedMonitorVersion: 1, expectedReportVersion: 2 };
  for (const input of [enable, resume, rebind]) assert.equal(validate(input).valid, true, input.action);
  for (const input of [{ ...enable, expectedMonitorVersion: 1 }, { ...resume, expectedMonitorVersion: 0 },
    { ...resume, expectedReportVersion: 2 }, { ...rebind, expectedReportVersion: undefined },
    { ...enable, action: "pause" }, { ...enable, plan: "trading" }]) assert.equal(validate(input).valid, false);
});

test("monitor REST uses strict per-action scopes before quotas or product work", async () => {
  let owner = principal, quotas = 0;
  const calls: { operation: string; args: unknown }[] = [];
  const handler = createAccountApiHandler({ authorize: async () => owner, requestOrigin: () => "https://sajda.test",
    quota: async () => { quotas++; return { allowed: true, remaining: 100, resetAt: Date.now() + 60000 }; },
    execute: async (operation, args) => { calls.push({ operation, args }); return { status: 200, data: { accountId: owner.userId } }; } });
  async function call(method: string, body?: unknown, query: Record<string, unknown> = {}) {
    const response = recorder();
    await handler({ method, headers: { "content-type": "application/json" }, query: { resource: "brand-monitors", ...query }, body }, response);
    return response;
  }
  assert.equal((await call("GET", undefined, { reportId, alertOffset: "1", alertLimit: "20" })).code, 200);
  assert.deepEqual(calls.at(-1), { operation: "brand_monitors_get", args: { reportId, alertOffset: 1, alertLimit: 20 } });
  const enable = { reportId, requestKey: randomUUID(), action: "enable", expectedReportVersion: 1, expectedMonitorVersion: 0 };
  assert.equal((await call("POST", enable)).code, 200);
  assert.deepEqual(calls.at(-1), { operation: "brand_monitors_configure", args: enable });
  for (const action of ["resume", "rebind"]) {
    const input = { reportId, requestKey: randomUUID(), action, expectedMonitorVersion: 1, ...(action === "rebind" ? { expectedReportVersion: 2 } : {}) };
    assert.equal((await call("POST", input)).code, 200);
    assert.deepEqual(calls.at(-1), { operation: "brand_monitors_configure", args: input });
  }
  for (const scopes of [["projects:write"], ["domains:search"]]) {
    owner = { ...principal, scopes: scopes as ApiKeyPrincipal["scopes"] };
    const before = quotas;
    assert.equal((await call("POST", enable)).code, 403);
    assert.equal(quotas, before, "An insufficient key never reaches quotas or scheduled work");
  }
  owner = { ...principal, scopes: ["projects:write"] };
  for (const action of ["pause", "ack"]) {
    const input = { reportId, requestKey: randomUUID(), action,
      ...(action === "pause" ? { expectedMonitorVersion: 1 } : { alertId: randomUUID() }) };
    assert.equal((await call("POST", input)).code, 200);
    assert.deepEqual(calls.at(-1), { operation: action === "pause" ? "brand_monitors_pause" : "brand_monitor_alerts_acknowledge", args: input });
  }
  owner = principal;
  const before = calls.length;
  for (const query of [{ reportId, ownerId: "foreign" }, { reportId: [reportId, reportId] },
    { reportId, alertOffset: "2000" }, { reportId, alertLimit: "21" }, { reportId, version: "1" }]) {
    assert.equal((await call("GET", undefined, query)).code, 400);
  }
  for (const body of [{ ...enable, verified: true }, { ...enable, plan: "trading" }, { ...enable, action: "buy" },
    { ...enable, expectedMonitorVersion: 1 }]) assert.equal((await call("POST", body)).code, 400);
  assert.equal((await call("DELETE")).code, 405);
  assert.equal(calls.length, before);
});

test("MCP monitor adapters preserve exact intents and trusted owner without forwarding API secrets", async () => {
  const seen: unknown[] = [];
  const execute = createMcpProductExecutor({ brandMonitors: async (request, response) => {
    assert.equal(readDelegatedAccount(request.headers!, request.method)?.userId, principal.userId);
    assert.equal("authorization" in request.headers!, false);
    seen.push({ method: request.method, query: request.query, body: request.body });
    response.status(200).json({ accountId: principal.userId });
  } });
  await execute("brand_monitors_get", { reportId, alertOffset: 0, alertLimit: 10 }, principal);
  assert.deepEqual(seen.at(-1), { method: "GET", query: { reportId, alertOffset: "0", alertLimit: "10" }, body: undefined });
  const enable = { reportId, requestKey: randomUUID(), action: "enable", expectedReportVersion: 1, expectedMonitorVersion: 0 };
  await execute("brand_monitors_configure", enable, principal);
  assert.deepEqual(seen.at(-1), { method: "POST", query: undefined, body: enable });
  const count = seen.length;
  await assert.rejects(() => execute("brand_monitors_configure", enable, { ...principal, scopes: ["projects:write"] }), { code: "insufficient_scope" });
  assert.equal(seen.length, count);
  assert.equal(productOperationInputJsonSchema("brand_monitors_configure").type, "object");
  for (const [operation, body] of [["brand_monitors_pause", { reportId, requestKey: randomUUID(), action: "pause", expectedMonitorVersion: 1 }],
    ["brand_monitor_alerts_acknowledge", { reportId, requestKey: randomUUID(), action: "ack", alertId: randomUUID() }]] as const) {
    await execute(operation, body, { ...principal, scopes: ["projects:write"] });
    assert.deepEqual(seen.at(-1), { method: "POST", query: undefined, body });
  }
});

test("native monitor allowlist accepts only bounded canonical account actions", () => {
  assert.equal(nativeAccountRoute("/api/account/brand-monitors", "POST").scope, "saved:write");
  assert.equal(nativeAccountRoute(`/api/account/brand-monitors?reportId=${reportId}&alertOffset=0&alertLimit=20`, "GET").scope, "saved:read");
  for (const path of [`/api/account/brand-monitors?reportId=${reportId}&reportId=${reportId}`,
    "/api/account/brand-monitors?ownerId=foreign", "/api/account/brand-monitors#fragment"]) {
    assert.throws(() => nativeAccountRoute(path, "GET"), { code: "invalid_request" });
  }
  assert.throws(() => nativeAccountRoute(`/api/account/brand-monitors?reportId=${reportId}`, "POST"), { code: "invalid_request" });
  assert.throws(() => nativeAccountRoute("/api/account/brand-monitors", "DELETE"), { code: "unsupported_native_action" });
});
