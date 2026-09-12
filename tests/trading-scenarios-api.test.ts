import assert from "node:assert/strict";
import test from "node:test";
import { neonConfig } from "@neondatabase/serverless";
import { createTradingScenariosHandler } from "../api/account/trading-scenarios.js";
import { AccountAccessError } from "../api/_shared/account-auth.js";
import { createAccountMembershipReader } from "../api/_shared/account-membership.js";
import { createDelegatedAccountHeaders } from "../api/_shared/delegated-account.js";
import type { TradingScenario, TradingScenarioInput } from "../shared/trading-scenarios.js";

const account = { id: "scenario-owner-a", emailVerified: true };
const input: TradingScenarioInput = {
  id: "10000000-0000-4000-8000-000000000001", expectedVersion: 0, domain: "example.com", title: "Brand thesis",
  thesis: "A user-authored hypothesis", catalyst: "Product launch", invalidation: "No buyer interest",
  reviewOn: "2026-12-01", stance: "bullish", analysisMode: "brand",
  assumptions: { acquisitionUsd: 100, annualRenewalUsd: 12, otherCostsUsd: 10, holdingMonths: 12,
    sellingFeePercent: 15, saleProbabilityPercent: 20, bearSaleUsd: 100, baseSaleUsd: 1000, bullSaleUsd: 5000 },
};
const { expectedVersion: _version, ...payload } = input;
const scenario: TradingScenario = { ...payload, version: 1, createdAt: "2026-09-11T10:00:00.000Z", updatedAt: "2026-09-11T10:00:00.000Z" };
void _version;
function recorder() {
  return { code: 200, body: undefined as unknown, headers: new Map<string, string | number>(),
    setHeader(key: string, value: string | number) { this.headers.set(key.toLowerCase(), value); },
    status(code: number) { this.code = code; return this; }, json(body: unknown) { this.body = body; } };
}
function fixture(options: { trading?: boolean; authError?: AccountAccessError; failure?: "limit" | "read" | "save"; conflict?: boolean; rate?: boolean } = {}) {
  const calls: unknown[][] = [];
  const handler = createTradingScenariosHandler({
    authorize: async (headers, authOptions) => {
      calls.push(["authorize", headers?.["x-sajda-account"], authOptions]);
      if (options.authError) throw options.authError;
      return account;
    },
    membership: async actual => {
      calls.push(["membership", actual]);
      return options.trading === false
        ? { plan: "premium", accessSource: "operator", expiresAt: "2027-01-01T00:00:00.000Z", capabilities: { save_domains: true, swipe_undo: true, trading: false } }
        : { plan: "trading", accessSource: "operator", expiresAt: "2027-01-01T00:00:00.000Z", capabilities: { save_domains: true, swipe_undo: true, trading: true } };
    },
    store: {
      limit: async owner => {
        calls.push(["limit", owner]);
        if (options.rate) throw new AccountAccessError("rate_limited", 429, "Wait a minute.");
        if (options.failure === "limit") throw new Error("postgres://secret limit SQL");
      },
      read: async owner => { calls.push(["read", owner]); if (options.failure === "read") throw new Error("postgres://secret SELECT session_token"); return [scenario]; },
      save: async (owner, value) => {
        calls.push(["save", owner, value]);
        if (options.conflict) throw new AccountAccessError("scenario_conflict", 409, "Reload this scenario.");
        if (options.failure === "save") throw new Error("postgres://secret UPDATE token");
        return [scenario];
      },
    },
  });
  return { handler, calls };
}
async function call(handler: ReturnType<typeof createTradingScenariosHandler>, method = "GET", body?: unknown,
  headers: Record<string, string | string[] | undefined> = {}) {
  const response = recorder();
  await handler({ method, body, headers: { "content-type": "application/json", "x-sajda-account": account.id, ...headers } }, response);
  return response;
}
test("scenario API requires real authentication before membership or storage", async () => {
  let read = false;
  const handler = createTradingScenariosHandler({ membership: async () => { read = true; throw new Error("must not run"); } });
  for (const method of ["GET", "POST"]) {
    const response = await call(handler, method, { action: "save", scenario: input }, { authorization: "Bearer forged", "x-plan": "trading" });
    assert.equal(response.code, 401); assert.equal(read, false);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
    assert.equal(response.headers.has("access-control-allow-origin"), false);
    assert.equal("accountId" in (response.body as object), false);
  }
});
test("scenario API rejects actual cross-origin session mutations before auth provider call", async () => {
  const original = process.env.BETTER_AUTH_URL;
  process.env.BETTER_AUTH_URL = "https://sajda.example";
  try {
    const handler = createTradingScenariosHandler();
    const response = await call(handler, "POST", { action: "save", scenario: input }, {
      host: "sajda.example", cookie: "sajda.session_token=fixture", origin: "https://attacker.example", "sec-fetch-site": "cross-site",
    });
    assert.equal(response.code, 403);
    assert.equal((response.body as { code: string }).code, "invalid_origin");
  } finally { if (original === undefined) delete process.env.BETTER_AUTH_URL; else process.env.BETTER_AUTH_URL = original; }
});
test("fresh Trading membership and verified initiating session required for GET and POST", async () => {
  const f = fixture();
  for (const method of ["GET", "POST"]) {
    const response = await call(f.handler, method, { action: "save", scenario: input });
    assert.equal(response.code, 200);
    const result = response.body as { accountId: string; requestId: string; scenarios: TradingScenario[] };
    assert.equal(result.accountId, account.id); assert.deepEqual(result.scenarios, [scenario]);
    assert.equal(result.requestId, response.headers.get("x-request-id"));
    assert.match(result.requestId, /^req_[A-Za-z0-9_-]{16}$/u);
  }
  assert.deepEqual(f.calls.filter(row => row[0] === "authorize"), [
    ["authorize", account.id, { verifiedEmail: true, method: "GET" }], ["authorize", account.id, { verifiedEmail: true, method: "POST" }],
  ]);
  assert.deepEqual(f.calls.find(row => row[0] === "save"), ["save", account.id, input]);
});
test("Premium does not grant journal access even with forged Trading header", async () => {
  const f = fixture({ trading: false });
  for (const method of ["GET", "POST"]) assert.equal((await call(f.handler, method, { action: "save", scenario: input }, { "x-plan": "trading" })).code, 403);
  assert.equal(f.calls.some(row => ["limit", "read", "save"].includes(String(row[0]))), false);
});
test("expired, unverified and changed accounts cannot reach journal storage", async () => {
  for (const [code, status] of [["invalid_session", 401], ["email_verification_required", 403], ["account_changed", 409]] as const) {
    const f = fixture({ authError: new AccountAccessError(code, status, "Sign in again.") });
    assert.equal((await call(f.handler, "POST", { action: "save", scenario: input })).code, status);
    assert.deepEqual(f.calls.map(row => row[0]), ["authorize"]);
  }
});
test("unsupported methods never authenticate or mutate", async () => {
  const f = fixture();
  for (const method of ["PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"]) {
    const response = await call(f.handler, method);
    assert.equal(response.code, 405); assert.equal(response.headers.get("allow"), "GET, POST");
  }
  assert.deepEqual(f.calls, []);
});
test("strict JSON body rejects owner injection, unknown fields, invalid assumptions and malformed data", async () => {
  const bad = [undefined, "{", [], null, { action: "save", scenario: input, ownerId: "owner-b" },
    { action: "save", scenario: { ...input, owner_id: "owner-b" } },
    { action: "save", scenario: { ...input, expectedVersion: undefined } },
    { action: "save", scenario: { ...input, domain: "https://example.com" } },
    { action: "save", scenario: { ...input, assumptions: { ...input.assumptions, acquisitionUsd: -1 } } },
    { action: "delete", scenario: input }];
  for (const body of bad) {
    const f = fixture(); const response = await call(f.handler, "POST", body);
    assert.ok([400, 413].includes(response.code));
    assert.deepEqual(f.calls.map(row => row[0]), ["authorize"]);
  }
});
test("body size is limited in UTF-8 bytes and requires JSON media type", async () => {
  const f = fixture();
  assert.equal((await call(f.handler, "POST", "あ".repeat(6000))).code, 413);
  assert.equal((await call(f.handler, "POST", { action: "save", scenario: input }, { "content-type": "text/plain" })).code, 415);
  assert.equal(f.calls.some(row => row[0] === "save"), false);
});

test("PostgreSQL-invalid text is rejected before membership or storage", async () => {
  for (const field of ["title", "thesis", "catalyst", "invalidation"] as const) {
    for (const unsafe of ["\u0000", "\ud800", "\udc00", "\ud800x"]) {
      const f = fixture();
      const response = await call(f.handler, "POST", JSON.stringify({
        action: "save", scenario: { ...input, [field]: `Draft ${unsafe} text` },
      }));
      assert.equal(response.code, 400, `${field} must fail validation, not reach PostgreSQL`);
      assert.deepEqual(f.calls.map(row => row[0]), ["authorize"]);
      assert.equal((response.body as { code: string }).code, "invalid_request");
    }
  }
});

test("valid multilingual text survives and UUID case is normalized before storage", async () => {
  const f = fixture();
  const original = { ...input, id: "ABCDEFAB-CDEF-4ABC-8DEF-ABCDEFABCDEF", title: "Nordisk idé 🧭",
    thesis: "Svenska, 中文, 日本語 och العربية", catalyst: "Lansering 🚀", invalidation: "Ingen efterfrågan" };
  const response = await call(f.handler, "POST", JSON.stringify({ action: "save", scenario: original }));
  assert.equal(response.code, 200);
  assert.deepEqual(f.calls.find(row => row[0] === "save"), ["save", account.id, {
    ...original, id: original.id.toLowerCase(),
  }]);
});
test("cross-account header never overrides the verified account used by the store", async () => {
  const f = fixture();
  assert.equal((await call(f.handler, "POST", { action: "save", scenario: input }, { "x-owner-id": "owner-b" })).code, 200);
  assert.deepEqual(f.calls.find(row => row[0] === "save"), ["save", account.id, input]);
});
test("version conflict is an explicit recoverable 409, not reported as saved", async () => {
  const f = fixture({ conflict: true }); const response = await call(f.handler, "POST", { action: "save", scenario: { ...input, expectedVersion: 1 } });
  assert.equal(response.code, 409); assert.equal((response.body as { code: string }).code, "scenario_conflict");
  assert.equal("scenarios" in (response.body as object), false);
});
test("limiter denial stops data work and returns Retry-After", async () => {
  const f = fixture({ rate: true }); const response = await call(f.handler, "POST", { action: "save", scenario: input });
  assert.equal(response.code, 429); assert.equal(response.headers.get("retry-after"), 60);
  assert.equal(f.calls.some(row => ["read", "save"].includes(String(row[0]))), false);
});
test("provider/DB failures return only generic error and correlation, never SQL or credentials", async () => {
  for (const failure of ["limit", "read", "save"] as const) {
    const f = fixture({ failure }); const response = await call(f.handler, failure === "read" ? "GET" : "POST", { action: "save", scenario: input });
    assert.equal(response.code, 503); assert.doesNotMatch(JSON.stringify(response.body), /postgres|secret|SELECT|UPDATE|token/iu);
    assert.equal((response.body as { requestId: string }).requestId, response.headers.get("x-request-id"));
  }
});

test("actual native account verification and membership reader protect the scenario boundary (no network)", async () => {
  const keys = ["DATABASE_URL", "VERCEL", "VERCEL_ENV"];
  const previousEnv = new Map(keys.map(key => [key, process.env[key]]));
  const previousFetch = globalThis.fetch, previousNeonFetch = neonConfig.fetchFunction;
  process.env.DATABASE_URL = "postgresql://fixture:fixture@scenario-auth-fixture.neon.tech/fixture";
  delete process.env.VERCEL; process.env.VERCEL_ENV = "development";
  let verified = true, plan = "trading", membershipOwner = account.id, memberships = 0;
  const stored: unknown[][] = [];
  const transport = async (url: string | URL | Request, init?: RequestInit) => {
    assert.equal(new URL(String(url)).pathname, "/sql");
    const query = JSON.parse(String(init?.body)) as { query: string; params: unknown[] };
    assert.match(query.query, /SELECT id, "emailVerified" FROM public\.sajda_auth_user WHERE id = \$1/u);
    assert.deepEqual(query.params, [account.id]);
    return Response.json({ fields: [{ name: "id", dataTypeID: 25 }, { name: "emailVerified", dataTypeID: 16 }],
      rows: [[account.id, verified ? "t" : "f"]], rowCount: 1 });
  };
  globalThis.fetch = transport; neonConfig.fetchFunction = transport;
  const membership = createAccountMembershipReader({ environment: () => ({}), query: async (sql, args) => {
    memberships++;
    assert.match(sql, /sajda\.lost_domain_effective_access/u);
    assert.equal(args[1], account.id); assert.equal(args[3], "development");
    return [{ request_count: 1, account_id: membershipOwner, verified: true, namespace: "development",
      checked_at: new Date().toISOString(), plan, access_source: "operator", expires_at: new Date(Date.now() + 3600_000).toISOString() }];
  } });
  const handler = createTradingScenariosHandler({ membership, store: {
    limit: async owner => { stored.push(["limit", owner]); },
    read: async owner => { stored.push(["read", owner]); return [scenario]; },
    save: async (owner, draft) => { stored.push(["save", owner, draft.id]); return [scenario]; },
  } });
  const request = async (method: "GET" | "POST", clone = false) => {
    const headers = createDelegatedAccountHeaders({ userId: account.id, credentialId: "fixture-native-session", source: "native",
      environment: "development", scopes: ["trading:read", "trading:run"] }, method === "GET" ? "trading:read" : "trading:run", method);
    const response = recorder();
    await handler({ method, headers: clone ? { ...headers } : headers, body: { action: "save", scenario: input } }, response);
    return response;
  };
  try {
    assert.equal((await request("GET")).code, 200);
    assert.equal((await request("POST")).code, 200, "Native delegated POST includes JSON type without requiring a browser Origin");
    assert.deepEqual(stored, [["limit", account.id], ["read", account.id], ["limit", account.id], ["save", account.id, input.id]]);
    plan = "premium";
    assert.equal((await request("POST")).code, 403, "A valid native session does not itself grant Trading");
    assert.equal(stored.length, 4);
    plan = "trading"; membershipOwner = "foreign-account";
    assert.equal((await request("GET")).code, 503, "A membership response for another owner fails closed");
    assert.equal(stored.length, 4);
    membershipOwner = account.id; verified = false;
    const before = memberships;
    assert.equal((await request("POST")).code, 403, "Email revocation is reread before membership or storage");
    assert.equal(memberships, before);
    verified = true;
    assert.equal((await request("POST", true)).code, 401, "Serialized headers cannot forge internal native delegation");
    assert.equal(stored.length, 4);
  } finally {
    globalThis.fetch = previousFetch; neonConfig.fetchFunction = previousNeonFetch;
    for (const [key, value] of previousEnv) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});
