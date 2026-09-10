import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createAccountApiHandler } from "../api/v1/account.js";
import { AccountAccessError } from "../api/_shared/account-error.js";
import { API_KEY_SCOPES, type ApiKeyPrincipal } from "../api/_shared/developer-api-keys.js";

const principal: ApiKeyPrincipal = { userId: "rest-owner", keyId: randomUUID(), environment: "development", scopes: [...API_KEY_SCOPES] };
const headers = { authorization: "Bearer test", "content-type": "application/json" };
function recorder() {
  return { code: 0, body: undefined as unknown, headers: new Map<string, string | number>(),
    setHeader(name: string, value: string | number) { this.headers.set(name.toLowerCase(), value); },
    status(code: number) { this.code = code; return this; }, json(value: unknown) { this.body = value; } };
}
function fixture(overrides: Parameters<typeof createAccountApiHandler>[0] = {}) {
  const calls: { operation: string; args: Record<string, unknown>; owner: string }[] = [];
  const handler = createAccountApiHandler({ authorize: async () => principal,
    requestOrigin: () => "https://sajda.test", quota: async () => ({ allowed: true, remaining: 100, resetAt: Date.now() + 60_000 }),
    execute: async (operation, args, account) => {
      calls.push({ operation, args, owner: account.userId });
      return { status: 200, data: { accountId: account.userId, value: "shared-product-response" } };
    }, ...overrides });
  async function call(resource: string, method = "GET", body?: unknown, query: Record<string, unknown> = {}) {
    const response = recorder();
    await handler({ method, headers, body, query: { resource, ...query } }, response);
    return response;
  }
  return { calls, handler, call };
}

test("account REST reads map only to matching passive shared operations", async () => {
  const api = fixture();
  for (const [resource, operation] of [["membership", "account_membership"], ["saved-domains", "saved_domains_list"],
    ["trading", "trading_report"], ["trading-status", "trading_status"]]) {
    const response = await api.call(resource);
    assert.equal(response.code, 200);
    assert.equal(api.calls.at(-1)?.operation, operation);
    assert.equal(api.calls.at(-1)?.owner, principal.userId);
    assert.equal((response.body as { value: string }).value, "shared-product-response");
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("access-control-allow-origin"), undefined);
  }
  await api.call("saved-domains", "GET", undefined, { cursor: "123" });
  assert.deepEqual(api.calls.at(-1)?.args, { cursor: "123" });
  await api.call("trading", "GET", undefined, { offset: "2", limit: "1" });
  assert.deepEqual(api.calls.at(-1)?.args, { offset: 2, limit: 1 });
  assert.equal(api.calls.some(call => /start|advance|quote/.test(call.operation)), false);
});

test("explicit REST actions preserve run and idempotency identifiers through the product boundary", async () => {
  const api = fixture();
  const requestKey = randomUUID(), runId = randomUUID();
  for (const [action, fields, operation] of [
    ["start", { requestKey }, "trading_start"], ["advance", { runId }, "trading_advance"],
    ["cancel", { runId }, "trading_stop"], ["refresh_quote", { runId, domain: "example.com", requestKey }, "trading_refresh_quote"],
  ] as const) {
    const response = await api.call("trading", "POST", { action, ...fields });
    assert.equal(response.code, 200);
    assert.deepEqual(api.calls.at(-1), { operation, args: fields, owner: principal.userId });
  }
  assert.equal((await api.call("saved-domains", "POST", { domain: "example.com", rationale: "Research note" })).code, 200);
  assert.equal(api.calls.at(-1)?.operation, "saved_domains_save");
  assert.equal((await api.call("saved-domains", "DELETE", { domain: "example.com" })).code, 200);
  assert.equal(api.calls.at(-1)?.operation, "saved_domains_remove");
});

test("unknown resources, methods, identity injection and invalid pagination never reach product handlers", async () => {
  const api = fixture();
  for (const request of [
    ["billing", "POST", { action: "purchase" }, {}], ["trading", "POST", { action: "purchase", domain: "example.com" }, {}],
    ["trading", "POST", { action: "start", requestKey: randomUUID(), userId: "other" }, {}],
    ["trading", "POST", { action: "start" }, {}], ["saved-domains", "POST", { domain: "https://example.com" }, {}],
    ["membership", "GET", undefined, { userId: "other" }], ["trading", "GET", undefined, { offset: "-1" }],
    ["trading", "GET", undefined, { limit: "101" }], ["trading", "GET", undefined, { limit: ["1", "2"] }],
    ["saved-domains", "GET", undefined, { cursor: ["1", "2"] }],
  ] as [string, string, unknown, Record<string, unknown>][]) assert.equal((await api.call(...request)).code, 400);
  for (const [resource, method] of [["membership", "POST"], ["trading", "DELETE"], ["saved-domains", "PUT"]]) {
    const response = await api.call(resource, method, {});
    assert.equal(response.code, 405);
    assert.ok(response.headers.has("allow"));
  }
  const response = recorder();
  await api.handler({ method: "POST", headers: { ...headers, "content-type": "text/plain" }, query: { resource: "saved-domains" }, body: {} }, response);
  assert.equal(response.code, 415);
  assert.equal((await api.call("saved-domains", "POST", { domain: "example.com", rationale: "x".repeat(9000) })).code, 413);
  assert.deepEqual(api.calls, []);
});

test("scopes and authentication are checked before an account action", async () => {
  const api = fixture({ authorize: async () => ({ ...principal, scopes: ["account:read"] }) });
  assert.equal((await api.call("membership")).code, 200);
  assert.equal((await api.call("saved-domains")).code, 403);
  assert.equal((await api.call("trading", "POST", { action: "start", requestKey: randomUUID() })).code, 403);
  assert.deepEqual(api.calls.map(call => call.operation), ["account_membership"]);
  const invalid = fixture({ authorize: async () => { throw new AccountAccessError("invalid_api_key", 401, "Invalid API key."); } });
  const response = await invalid.call("membership");
  assert.equal(response.code, 401);
  assert.match(String(response.headers.get("www-authenticate")), /^Bearer /);
  assert.deepEqual(invalid.calls, []);
  const origin = recorder();
  await api.handler({ method: "GET", headers: { ...headers, origin: "https://attacker.invalid" }, query: { resource: "membership" } }, origin);
  assert.equal(origin.code, 403);
});

test("REST preserves product errors and retry receipts while sanitizing unexpected failures", async () => {
  const product = fixture({ execute: async () => ({ status: 429, data: { code: "quote_daily_limit", error: "Try tomorrow.", requestId: "req_product" }, retryAfterSeconds: 60 }) });
  const response = await product.call("trading");
  assert.equal(response.code, 429);
  assert.equal(response.headers.get("retry-after"), 60);
  assert.equal(response.headers.get("x-request-id"), "req_product");
  assert.equal((response.body as { code: string }).code, "quote_daily_limit");
  const quota = fixture({ quota: async () => ({ allowed: false, remaining: 0, resetAt: Date.now() + 60_000 }) });
  assert.equal((await quota.call("membership")).code, 429);
  assert.deepEqual(quota.calls, []);
  const broken = fixture({ execute: async () => { throw new Error("postgres://password SELECT private_secret"); } });
  const failure = await broken.call("membership");
  assert.equal(failure.code, 503);
  assert.doesNotMatch(JSON.stringify(failure.body), /postgres|password|SELECT|private_secret/);
});

test("Vercel malformed-JSON body getters remain a client error without dispatch", async () => {
  const api = fixture();
  const response = recorder();
  await api.handler({ method: "POST", headers, query: { resource: "saved-domains" },
    get body() { throw new SyntaxError("Unexpected end of JSON input"); } }, response);
  assert.equal(response.code, 400);
  assert.equal((response.body as { code: string }).code, "invalid_request");
  assert.deepEqual(api.calls, []);
});
