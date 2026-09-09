import assert from "node:assert/strict";
import test from "node:test";
import { AccountAccessError } from "../api/_shared/account-auth";
import { createLostDomainsHandler } from "../api/account/lost-domains";
import { createLostDomainsCronHandler, validLostDomainsCronSecret } from "../api/cron/lost-domains";
import { lostDomainsService } from "../api/_shared/lost-domains-service";

const id = "10000000-0000-4000-8000-000000000001";
const account = { id: "owner-a", emailVerified: true };
const snapshot = { access: true, sourcesAvailable: 0, activeRun: null, latestRun: null, latestAttempt: null, candidates: [] };
function recorder() {
  return { code: 200, body: undefined as unknown, headers: new Map<string, string | number>(),
    setHeader(key: string, value: string | number) { this.headers.set(key.toLowerCase(), value); },
    status(code: number) { this.code = code; return this; }, json(body: unknown) { this.body = body; } };
}
function fakeService() {
  const calls: unknown[] = [];
  const service: typeof lostDomainsService = {
    refreshQuote:async(owner,run,domain,key)=>{calls.push(["refresh_quote",owner,run,domain,key]);return true;},
    read: async owner => { calls.push(["read", owner]); return snapshot; },
    start: async (owner, key) => { calls.push(["start", owner, key]); return { reused: false, run: {} as never }; },
    advance: async (owner, run) => { calls.push(["advance", owner, run]); return true; },
    cancel: async (owner, run) => { calls.push(["cancel", owner, run]); return true; },
    tick: async () => { calls.push(["tick"]); return true; },
  };
  return { service, calls };
}
async function call(handler: ReturnType<typeof createLostDomainsHandler>, method = "GET", body?: unknown) {
  const response = recorder();
  await handler({ method, body, headers: { "content-type": "application/json", "x-sajda-account": account.id } }, response);
  return response;
}
test("Lost Domains anonymous/forged plan access never reaches database or engine", async () => {
  const { service, calls } = fakeService();
  const handler = createLostDomainsHandler({ service, limit: async () => { throw new Error("must not run"); } });
  for (const method of ["GET", "POST"]) {
    const response = recorder();
    await handler({ method, headers: { authorization: "Bearer forged", "x-plan": "plus", "x-sajda-account": account.id }, body: { action: "start", requestKey: id } }, response);
    assert.equal(response.code, 401);
    assert.match(String(response.headers.get("cache-control")), /private, no-store/);
    assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
    assert.equal(response.headers.has("access-control-allow-origin"), false);
    assert.equal("accountId" in (response.body as object), false);
  }
  assert.deepEqual(calls, []);
});
test("Lost Domains explicitly checks verified session, initiating account and actual method", async () => {
  const { service, calls } = fakeService();
  const methods: string[] = [];
  const handler = createLostDomainsHandler({ service, enabled: () => true, limit: async owner => assert.equal(owner, account.id),
    authorize: async (headers, options) => { assert.equal(headers?.["x-sajda-account"], account.id); assert.equal(options?.verifiedEmail, true); methods.push(options!.method!); return account; } });
  assert.equal((await call(handler)).code, 200);
  assert.equal((await call(handler, "POST", { action: "start", requestKey: id })).code, 200);
  assert.deepEqual(methods, ["GET", "POST"]);
  assert.deepEqual(calls[1], ["start", account.id, id]);
});
test("start, advance and cancel remain owner-scoped, with safe correlation receipts", async () => {
  const { service, calls } = fakeService();
  const handler = createLostDomainsHandler({ service, enabled: () => true, limit: async () => {}, authorize: async () => account });
  for (const action of ["start", "advance", "cancel"]) {
    const response = await call(handler, "POST", action === "start" ? { action, requestKey: id } : { action, runId: id });
    assert.equal(response.code, 200);
    const payload = response.body as { accountId: string; requestId: string };
    assert.equal(payload.accountId, account.id);
    assert.equal(payload.requestId, response.headers.get("x-request-id"));
    assert.match(payload.requestId, /^req_[A-Za-z0-9_-]{16}$/);
  }
  assert.deepEqual(calls.filter(row => (row as string[])[0] !== "read"), [["start", account.id, id], ["advance", account.id, id], ["cancel", account.id, id]]);
});
test("kill switch blocks new work but not reading or cancelling durable state", async () => {
  const { service, calls } = fakeService();
  const handler = createLostDomainsHandler({ service, enabled: () => false, limit: async () => {}, authorize: async () => account });
  assert.equal((await call(handler)).code, 200);
  assert.equal((await call(handler, "POST", { action: "start", requestKey: id })).code, 503);
  assert.equal((await call(handler, "POST", { action: "advance", runId: id })).code, 503);
  assert.equal((await call(handler, "POST", { action: "cancel", runId: id })).code, 200);
  assert.equal(calls.some(row => ["start", "advance"].includes((row as string[])[0])), false);
});
test("unsupported methods and caller-provided source/evidence cannot invoke work", async () => {
  const { service, calls } = fakeService();
  const handler = createLostDomainsHandler({ service, enabled: () => true, limit: async () => {}, authorize: async () => account });
  for (const method of ["PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"]) assert.equal((await call(handler, method)).code, 405);
  assert.equal((await call(handler, "POST", { action: "start", requestKey: id, url: "https://evil.invalid" })).code, 400);
  assert.deepEqual(calls, []);
});
test("expired access and rejected account identity produce no work", async () => {
  for (const [status, code] of [[401, "invalid_session"], [403, "email_verification_required"], [409, "account_changed"]] as const) {
    const { service, calls } = fakeService();
    const handler = createLostDomainsHandler({ service, limit: async () => {}, authorize: async () => { throw new AccountAccessError(code, status, "Sign in again."); } });
    assert.equal((await call(handler, "POST", { action: "advance", runId: id })).code, status);
    assert.deepEqual(calls, []);
  }
});
test("database/network errors never leak provider messages, SQL or secrets", async () => {
  const { service } = fakeService();
  service.read = async () => { throw new Error("postgres://secret SQL SELECT session_token"); };
  const handler = createLostDomainsHandler({ service, limit: async () => {}, authorize: async () => account });
  const response = await call(handler);
  assert.equal(response.code, 503);
  assert.doesNotMatch(JSON.stringify(response.body), /postgres|secret|SQL|session_token/);
});
test("rate-limited requests cannot reach the engine", async () => {
  const { service, calls } = fakeService();
  const handler = createLostDomainsHandler({ service, enabled: () => true, authorize: async () => account,
    limit: async () => { throw new AccountAccessError("rate_limited", 429, "Wait before trying again."); } });
  const response = await call(handler, "POST", { action: "start", requestKey: id });
  assert.equal(response.code, 429); assert.equal(response.headers.get("retry-after"), 60); assert.deepEqual(calls, []);
});
test("cron requires a strong exact secret and refuses unauthenticated or POST dispatch", async () => {
  const secret = "a".repeat(32), { service, calls } = fakeService();
  const handler = createLostDomainsCronHandler({ service, secret: () => secret, enabled: () => true, scheduled: () => true });
  for (const auth of [undefined, "Bearer wrong", `bearer ${secret}`, [`Bearer ${secret}`]]) {
    const response = recorder(); await handler({ method: "GET", headers: { authorization: auth } }, response); assert.equal(response.code, 401);
  }
  const response = recorder(); await handler({ method: "POST", headers: { authorization: `Bearer ${secret}` } }, response); assert.equal(response.code, 405);
  assert.deepEqual(calls, []);
  assert.equal(validLostDomainsCronSecret("Bearer short", "short"), false);
  assert.equal(validLostDomainsCronSecret(`Bearer ${secret}`, secret), true);
});
test("cron never runs while paused, and returns no customer/domain data when enabled", async () => {
  const secret = "b".repeat(32), { service, calls } = fakeService();
  for (const scheduled of [false, true]) {
    const handler = createLostDomainsCronHandler({ service, secret: () => secret, enabled: () => true, scheduled: () => scheduled });
    const response = recorder(); await handler({ method: "GET", headers: { authorization: `Bearer ${secret}` } }, response);
    assert.equal(response.code, 200); assert.deepEqual(Object.keys(response.body as object).sort(), ["requestId", "state"]);
    assert.equal((response.body as { state: string }).state, scheduled ? "advanced" : "paused");
  }
  assert.deepEqual(calls, [["tick"]]);
});
