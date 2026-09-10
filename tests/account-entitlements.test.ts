import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { neonConfig } from "@neondatabase/serverless";
import { AccountAccessError, verifySessionAccount } from "../api/_shared/account-auth";
import { getAccountCapabilities } from "../api/_shared/account-entitlements";
import capabilitiesHandler, { createAccountCapabilitiesHandler } from "../api/account/capabilities";

type Handler = ReturnType<typeof createAccountCapabilitiesHandler>;
type Request = Parameters<Handler>[0];
const siteOrigin = "https://sajda.test";
const account = { id: "account-a", emailVerified: true };
const validBody = { capability: "swipe_undo" };

function responseRecorder() {
  return {
    code: 200, body: undefined as unknown, headers: new Map<string, string | number>(),
    setHeader(name: string, value: string | number) { this.headers.set(name.toLowerCase(), value); },
    status(code: number) { this.code = code; return this; },
    json(value: unknown) { this.body = value; },
  };
}

async function perform(handler: Handler, overrides: Partial<Request> = {}) {
  const response = responseRecorder();
  await handler({ method: "POST", body: validBody, headers: {
    host: "sajda.test", origin: siteOrigin, "content-type": "application/json",
    "x-sajda-account": account.id,
  }, ...overrides }, response);
  return response;
}

function bodyCode(response: ReturnType<typeof responseRecorder>): unknown {
  return (response.body as { code?: unknown }).code;
}

test("premium capability endpoints reject anonymous and bearer/plan-only access", async () => {
  for (const method of ["GET", "POST"]) {
    const response = await perform(capabilitiesHandler, { method, headers: {
      authorization: "Bearer forged", "x-sajda-account": account.id,
      "x-plan": "premium", cookie: "premium=true; role=admin", "content-type": "application/json",
    } });
    assert.equal(response.code, 401);
    assert.equal(bodyCode(response), "authentication_required");
    assert.match(String(response.headers.get("cache-control")), /private, no-store/u);
    assert.equal(response.headers.get("vary"), "Cookie, X-Sajda-Account");
    assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
    assert.equal(response.headers.has("access-control-allow-origin"), false);
    assert.equal("accountId" in (response.body as object), false);
  }
});

test("unsupported methods cannot look up or grant a capability", async () => {
  let calls = 0;
  const handler = createAccountCapabilitiesHandler(async () => { calls++; return account; });
  for (const method of [undefined, "PATCH", "DELETE", "PUT", "OPTIONS", "HEAD"]) {
    const response = await perform(handler, { method });
    assert.equal(response.code, 405);
    assert.equal(response.headers.get("allow"), "GET, POST");
  }
  assert.equal(calls, 0);
});

test("premium check propagates verified-email and actual request-method requirements", async () => {
  const calls: string[] = [];
  const handler = createAccountCapabilitiesHandler(async (headers, options) => {
    assert.equal(headers?.["x-sajda-account"], account.id);
    assert.equal(options?.verifiedEmail, true);
    calls.push(options?.method ?? "missing");
    return account;
  }, async value => { assert.deepEqual(value, account); return { swipe_undo: true }; });
  for (const method of ["GET", "POST"]) assert.equal((await perform(handler, { method })).code, 200);
  assert.deepEqual(calls, ["GET", "POST"]);
});

test("free accounts receive explicit false and cannot undo; email or role never confers access", async () => {
  let reads = 0;
  const handler = createAccountCapabilitiesHandler(async () => ({ ...account, role: "admin", plan: "premium" }),
    async () => { reads++; return { swipe_undo: false }; });
  const presentation = await perform(handler, { method: "GET" });
  assert.equal(presentation.code, 200);
  assert.deepEqual(presentation.body, {
    capabilities: { swipe_undo: false }, accountId: account.id,
    requestId: presentation.headers.get("x-request-id"),
  });
  const action = await perform(handler);
  assert.equal(action.code, 403);
  assert.equal(bodyCode(action), "premium_required");
  assert.equal(reads, 2);
});

test("premium authorization is fresh on every click and can expire between presentation and action", async () => {
  let allowed = true;
  let reads = 0;
  const handler = createAccountCapabilitiesHandler(async () => account,
    async () => { reads++; return { swipe_undo: allowed }; });
  assert.equal((await perform(handler, { method: "GET" })).code, 200);
  const granted = await perform(handler);
  assert.deepEqual(granted.body, {
    ok: true, capability: "swipe_undo", accountId: account.id,
    requestId: granted.headers.get("x-request-id"),
  });
  assert.match(String(granted.headers.get("x-request-id")), /^req_[A-Za-z0-9_-]{16}$/u);
  allowed = false;
  const revoked = await perform(handler);
  assert.equal(revoked.code, 403);
  assert.equal(bodyCode(revoked), "premium_required");
  assert.equal(reads, 3, "A previous GET/POST is never a reusable server-side grant");
});

test("expired sessions, unverified email and changed accounts cannot reach entitlements", async () => {
  let reads = 0;
  const session = {
    user: { id: account.id, emailVerified: true },
    session: { userId: account.id, expiresAt: new Date(Date.now() + 60_000) },
  };
  for (const [value, expectedId, status, code] of [
    [null, account.id, 401, "invalid_session"],
    [{ ...session, session: { ...session.session, expiresAt: new Date(1) } }, account.id, 401, "invalid_session"],
    [{ ...session, user: { ...session.user, emailVerified: false, role: "premium" } }, account.id, 403, "email_verification_required"],
    [{ ...session, user: { ...session.user, emailVerified: "true" } }, account.id, 403, "email_verification_required"],
    [session, "account-b", 409, "account_changed"],
    [session, undefined, 409, "account_changed"],
  ] as const) {
    const handler = createAccountCapabilitiesHandler(async (_headers, options) =>
      verifySessionAccount(value, expectedId, options?.verifiedEmail),
    async () => { reads++; return { swipe_undo: true }; });
    const response = await perform(handler);
    assert.equal(response.code, status);
    assert.equal(bodyCode(response), code);
  }
  assert.equal(reads, 0);
});

test("cookie POST requires exact origin before auth database access", async () => {
  const environment = ["BETTER_AUTH_URL", "VERCEL", "VERCEL_URL", "VERCEL_BRANCH_URL", "VERCEL_ENV", "VERCEL_PROJECT_PRODUCTION_URL"];
  const before = new Map(environment.map(key => [key, process.env[key]]));
  environment.forEach(key => { delete process.env[key]; });
  process.env.BETTER_AUTH_URL = siteOrigin;
  try {
    for (const origin of [undefined, "null", "https://attacker.test", `${siteOrigin}.attacker.test`]) {
      const result = await perform(capabilitiesHandler, { headers: {
        host: "sajda.test", origin, cookie: "__Secure-sajda.session_token=fixture",
        "x-sajda-account": account.id, "content-type": "application/json",
      } });
      assert.equal(result.code, 403);
      assert.equal(bodyCode(result), "invalid_origin");
    }
  } finally {
    for (const [key, value] of before) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test("strict action payload cannot submit ownership, plan, grant, timestamps or arbitrary capabilities", async () => {
  let reads = 0;
  const handler = createAccountCapabilitiesHandler(async () => account,
    async () => { reads++; return { swipe_undo: true }; });
  for (const body of [undefined, null, [], 1, "{invalid", '"swipe_undo"', {},
    { capability: "admin" }, { capability: ["swipe_undo"] },
    { ...validBody, accountId: "account-b" }, { ...validBody, user_id: "account-b" },
    { ...validBody, role: "admin" }, { ...validBody, premium: true },
    { ...validBody, granted: true }, { ...validBody, expires_at: "2099-01-01" },
  ]) {
    const response = await perform(handler, { body });
    assert.equal(response.code, 400, JSON.stringify(body));
    assert.equal(bodyCode(response), "invalid_request");
  }
  for (const contentType of [undefined, "text/plain", "application/jsonx", "application/x-www-form-urlencoded"]) {
    const response = await perform(handler, { headers: { "content-type": contentType } });
    assert.equal(response.code, 415);
  }
  const oversized = await perform(handler, { body: { capability: "😀".repeat(300) } });
  assert.equal(oversized.code, 413, "The limit is UTF-8 bytes, not characters");
  assert.equal(reads, 0);
});

test("database failure, malformed capabilities and limit errors fail closed without leaking details", async () => {
  const previousLog = console.error;
  const logs: string[] = [];
  console.error = (...parts: unknown[]) => { logs.push(parts.map(String).join(" ")); };
  try {
    const handler = createAccountCapabilitiesHandler(async () => account, async () => {
      throw new Error("postgres://private-user:secret@private-host/private-table");
    });
    for (const method of ["GET", "POST"]) {
      const response = await perform(handler, { method });
      assert.equal(response.code, 503);
      assert.equal(bodyCode(response), "capabilities_unavailable");
      assert.doesNotMatch(JSON.stringify(response.body), /private-user|secret|private-host|private-table/u);
    }
    const malformed = createAccountCapabilitiesHandler(async () => account,
      async () => ({ swipe_undo: "true" as unknown as boolean }));
    assert.equal((await perform(malformed)).code, 503);
    const limited = createAccountCapabilitiesHandler(async () => account, async () => {
      throw new AccountAccessError("rate_limited", 429, "Wait before retrying.");
    });
    const response = await perform(limited);
    assert.equal(response.code, 429);
    assert.equal(response.headers.get("retry-after"), 60);
    assert.doesNotMatch(logs.join("\n"), /private-user|secret|private-host|private-table|account-a/u);
  } finally { console.error = previousLog; }
});

test("capabilities delegate to the shared session owner's membership read (simulated Neon transport)", async () => {
  const previousFetch = globalThis.fetch;
  const previousNeonFetch = neonConfig.fetchFunction;
  const previousEndpoint = neonConfig.fetchEndpoint;
  const previousDb = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "postgresql://fixture:fixture@fixture.neon.tech/fixture";
  neonConfig.fetchEndpoint = "https://fixture.neon.tech/sql";
  const now = new Date("2026-09-09T12:00:00Z").getTime();
  const grants = new Map<string, { starts: number; expires: number; revoked: boolean }>();
  const queries: { query: string; params: string[] }[] = [];
  let count = 1;
  let corrupt: Record<string, unknown> | null = null;
  const transport: typeof fetch = async (url, init) => {
    assert.equal(new URL(String(url)).hostname, "fixture.neon.tech", "No real database may be contacted");
    assert.equal(new URL(String(url)).pathname, "/sql");
    assert.ok(init?.signal, "Database requests must have a bounded abort signal");
    const request = JSON.parse(String(init?.body)) as { query: string; params: string[] };
    queries.push(request);
    assert.match(request.query, /ON CONFLICT \(scope, subject_hash, window_started_at\)/u);
    assert.match(request.query, /request_count = sajda\.function_rate_limits\.request_count \+ 1/u);
    assert.match(request.query, /entitlement\.user_id = \$2 AND entitlement\.capability = 'swipe_undo'/u);
    assert.match(request.query, /entitlement\.revoked_at IS NULL/u);
    assert.match(request.query, /entitlement\.valid_from <= statement_timestamp\(\)/u);
    assert.match(request.query, /entitlement\.expires_at > statement_timestamp\(\)/u);
    assert.doesNotMatch(request.query, /(?:INSERT INTO|UPDATE|DELETE FROM) sajda\.account_entitlements/u);
    assert.equal(request.params[2], "120");
    assert.match(request.params[0], /^[a-f0-9]{64}$/u);
    const owner = request.params[1];
    assert.equal(request.query.includes(owner), false, "Owner must be a bound parameter, never SQL text");
    const grant = count <= 120 ? grants.get(owner) : undefined;
    const active = grant && !grant.revoked && grant.starts <= now && grant.expires > now;
    const row = corrupt ?? { request_count: count, account_id: owner, verified: true,
      namespace: request.params[3], checked_at: new Date(now).toISOString(),
      plan: active ? "premium" : null, access_source: active ? "operator" : null,
      expires_at: active ? new Date(grant.expires).toISOString() : null };
    const columns = ["request_count", "account_id", "verified", "namespace", "checked_at", "plan", "access_source", "expires_at"];
    return Response.json({ fields: columns.map(name => ({ name, dataTypeID: name === "verified" ? 16 : name === "request_count" ? 23 : 25 })),
      rows: [columns.map(column => row[column] === null ? null : typeof row[column] === "boolean" ? row[column] ? "t" : "f" : String(row[column]))], rowCount: 1 });
  };
  globalThis.fetch = transport;
  neonConfig.fetchFunction = transport;
  try {
    assert.deepEqual(await getAccountCapabilities(account), { swipe_undo: false }, "An empty table gives no premium access");
    grants.set("account-b", { starts: now - 1, expires: now + 60_000, revoked: false });
    assert.deepEqual(await getAccountCapabilities(account), { swipe_undo: false }, "Another user's premium does not grant access");
    assert.deepEqual(await getAccountCapabilities({ id: "account-b", emailVerified: true }), { swipe_undo: true });
    for (const [grant, allowed] of [
      [{ starts: now - 60_000, expires: now + 60_000, revoked: false }, true],
      [{ starts: now, expires: now + 60_000, revoked: false }, true],
      [{ starts: now - 60_000, expires: now, revoked: false }, false],
      [{ starts: now - 60_000, expires: now - 1, revoked: false }, false],
      [{ starts: now + 1, expires: now + 60_000, revoked: false }, false],
      [{ starts: now - 60_000, expires: now + 60_000, revoked: true }, false],
    ] as const) {
      grants.set(account.id, grant);
      assert.deepEqual(await getAccountCapabilities(account), { swipe_undo: allowed });
    }
    count = 121;
    await assert.rejects(() => getAccountCapabilities(account), error => error instanceof AccountAccessError && error.status === 429);
    count = 1;
    for (const row of [
      { request_count: 1, account_id: "account-b", verified: true, namespace: "development" },
      { request_count: 1, account_id: account.id, verified: true, namespace: "development", plan: "admin" },
      { request_count: 1, account_id: account.id, verified: true, namespace: "development", plan: "premium", expires_at: null },
      { request_count: 0, account_id: account.id, verified: true, namespace: "development" },
    ]) {
      corrupt = row;
      await assert.rejects(() => getAccountCapabilities(account), /Invalid/u);
    }
    assert.ok(queries.length >= 14);
    assert.equal(queries[0].params[0], queries[1].params[0]);
    assert.notEqual(queries[0].params[0], queries[2].params[0], "Account rate limits are isolated");
  } finally {
    globalThis.fetch = previousFetch;
    neonConfig.fetchFunction = previousNeonFetch;
    neonConfig.fetchEndpoint = previousEndpoint;
    if (previousDb === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousDb;
  }
});

test("entitlement migration is additive, finite, revocable and creates no paid accounts or grants", async () => {
  const sql = await readFile(new URL("../db/migrations/0005_account_entitlements.sql", import.meta.url), "utf8");
  assert.match(sql, /CREATE TABLE sajda\.account_entitlements/u);
  assert.match(sql, /REFERENCES public\.sajda_auth_user \(id\) ON DELETE CASCADE/u);
  assert.match(sql, /PRIMARY KEY \(user_id, capability\)/u);
  assert.match(sql, /expires_at timestamptz NOT NULL CHECK \(isfinite\(expires_at\)\)/u);
  assert.match(sql, /CHECK \(expires_at > valid_from\)/u);
  assert.match(sql, /grant_source IN \('operator', 'billing'\)/u);
  assert.match(sql, /source_reference text NOT NULL/u);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/u);
  assert.match(sql, /REVOKE ALL ON sajda\.account_entitlements FROM PUBLIC/u);
  assert.doesNotMatch(sql, /\b(?:INSERT INTO|UPDATE sajda|DELETE FROM|DROP TABLE|TRUNCATE)\b/iu);
});
