import assert from "node:assert/strict";
import test from "node:test";
import { createAppSessionsHandler } from "../api/account/app-sessions.js";
import { AccountAccessError } from "../api/_shared/account-error.js";
import { createDelegatedAccountHeaders } from "../api/_shared/delegated-account.js";
import type { NativeSessionsService } from "../api/_shared/native-sessions.js";
import type { requireAccount } from "../api/_shared/account-auth.js";

const id = "a7cef891-82b8-4c18-8009-0123456789ab";
const owner = { id: "qa-account", emailVerified: true };
const headers = { "content-type": "application/json" };
function fixture(authorize: typeof requireAccount = async (_headers, options) => {
  assert.equal(options?.verifiedEmail, true);
  return owner;
}) {
  const calls: { action: string; value: unknown }[] = [];
  const service: NativeSessionsService = {
    list: async (account, cursor) => { assert.deepEqual(account, owner); calls.push({ action: "list", value: cursor }); return { items: [], nextCursor: null }; },
    revoke: async (account, value) => { assert.deepEqual(account, owner); calls.push({ action: "revoke", value }); return { ok: true }; },
  };
  const handler = createAppSessionsHandler(authorize, service);
  const response = { code: 0, body: {} as Record<string, unknown>, headers: {} as Record<string, string | number>,
    setHeader(name: string, value: string | number) { this.headers[name] = value; },
    status(code: number) { this.code = code; return this; },
    json(body: unknown) { this.body = body as Record<string, unknown>; },
  };
  return { handler, response, calls, service };
}

test("browser app-session GET provides stable envelope without a current native session", async () => {
  const f = fixture();
  await f.handler({ method: "GET", headers }, f.response);
  assert.equal(f.response.code, 200);
  assert.deepEqual(f.response.body.items, []);
  assert.equal(f.response.body.nextCursor, null);
  assert.equal(f.response.body.currentSessionId, null);
  assert.equal(f.response.body.accountId, owner.id);
  assert.equal(typeof f.response.body.requestId, "string");
  assert.equal(f.response.headers["Cache-Control"], "private, no-store");
  assert.equal(f.response.headers["X-Robots-Tag"], "noindex, nofollow");
  assert.equal(f.response.headers.Vary, "Cookie, Authorization");
  assert.equal(f.response.headers["Access-Control-Allow-Origin"], undefined);
});

test("native management requires explicit internal session scope and identifies only its own credential", async () => {
  const principal = { userId: owner.id, credentialId: id, environment: process.env.VERCEL_ENV || "development", source: "native" as const, scopes: ["sessions:manage"] };
  const f = fixture();
  const delegated = createDelegatedAccountHeaders(principal, "sessions:manage", "GET");
  await f.handler({ method: "GET", headers: delegated }, f.response);
  assert.equal(f.response.code, 200);
  assert.equal(f.response.body.currentSessionId, id);
  const weak = fixture();
  await weak.handler({ method: "GET", headers: createDelegatedAccountHeaders({ ...principal, scopes: ["account:read"] }, "account:read", "GET") }, weak.response);
  assert.equal(weak.response.code, 403);
  assert.equal(weak.calls.length, 0);
});

test("API-key delegation cannot list/revoke native sessions even with a forged internal scope", async () => {
  for (const method of ["GET", "DELETE"]) {
    const f = fixture(async () => { throw new Error("Must block before authorization"); });
    const delegated = createDelegatedAccountHeaders({ userId: owner.id, credentialId: id, environment: process.env.VERCEL_ENV || "development", source: "api-key", scopes: ["sessions:manage"] }, "sessions:manage", method);
    await f.handler({ method, headers: delegated, body: { id } }, f.response);
    assert.equal(f.response.code, 403);
    assert.equal(f.response.body.code, "insufficient_scope");
    assert.equal(f.calls.length, 0);
  }
});

test("DELETE accepts parsed/string/buffer JSON and returns idempotent success", async () => {
  for (const body of [{ id }, JSON.stringify({ id }), Buffer.from(JSON.stringify({ id }))]) {
    const f = fixture();
    await f.handler({ method: "DELETE", headers, body }, f.response);
    assert.equal(f.response.code, 200);
    assert.equal(f.response.body.ok, true);
    assert.deepEqual(f.calls, [{ action: "revoke", value: id }]);
    assert.equal(f.response.body.accountId, owner.id);
  }
});

test("strict query/body validation rejects extra fields, wrong types and malformed lazy bodies", async () => {
  const cases = [
    { method: "GET", query: { cursor: ["duplicate", "cursor"] } },
    { method: "GET", query: { userId: "another" } },
    { method: "GET", query: { cursor: "broken" } },
    { method: "DELETE", query: { id }, body: { id } },
    { method: "DELETE", body: { id, userId: "another" } },
    { method: "DELETE", body: { id: [id] } },
    { method: "DELETE", body: { id: "broken" } },
    { method: "DELETE", body: null },
    { method: "DELETE", body: [] },
    { method: "DELETE", body: undefined },
    { method: "DELETE", body: "{" },
    { method: "DELETE", get body() { throw new Error("malformed JSON contains private content"); } },
  ];
  for (const value of cases) {
    const f = fixture();
    // Preserve the getter instead of object-spreading and invoking it early.
    Object.defineProperty(value, "headers", { value: headers });
    await f.handler(value, f.response);
    assert.equal(f.response.code, 400);
    assert.equal(f.calls.length, 0);
    assert.doesNotMatch(JSON.stringify(f.response.body), /private content/u);
  }
});

test("unsupported media, oversized input and unsupported method are bounded", async () => {
  for (const [request, code] of [
    [{ method: "DELETE", headers: {}, body: { id } }, 415],
    [{ method: "DELETE", headers, body: " ".repeat(1025) }, 413],
    [{ method: "POST", headers, body: { id } }, 405],
  ] as const) {
    const f = fixture(); await f.handler(request, f.response);
    assert.equal(f.response.code, code);
    assert.equal(f.calls.length, 0);
  }
});

test("real auth rejects missing/forged browser credentials before service work", async () => {
  const f = fixture();
  const handler = createAppSessionsHandler(undefined, f.service);
  for (const authorization of [undefined, "Bearer sjn_" + "A".repeat(43), "Bearer sj_test_fake"]) {
    await handler({ method: "GET", headers: { authorization, "x-sajda-account": owner.id } }, f.response);
    assert.equal(f.response.code, 401);
  }
  assert.equal(f.calls.length, 0);
});

test("revocation failure is safely retryable and quota failure carries Retry-After", async () => {
  for (const error of [new Error("postgres://password@test with private payload"), new AccountAccessError("rate_limited", 429, "Wait a minute.")]) {
    const f = fixture();
    f.service.revoke = async () => { throw error; };
    const logs: string[] = [], original = console.error;
    console.error = (value: string) => { logs.push(value); };
    try { await f.handler({ method: "DELETE", headers, body: { id } }, f.response); } finally { console.error = original; }
    assert.equal(f.response.code, error instanceof AccountAccessError ? 429 : 503);
    assert.doesNotMatch(JSON.stringify(f.response.body) + logs.join(""), /postgres|password|private payload/u);
    assert.equal(f.response.body.ok, undefined);
    if (f.response.code === 429) assert.equal(f.response.headers["Retry-After"], 60);
    else { assert.equal(logs.length, 1); assert.equal(JSON.parse(logs[0]).event, "app_sessions_failed"); }
  }
});
