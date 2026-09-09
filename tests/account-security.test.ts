import assert from "node:assert/strict";
import test from "node:test";
import { neonConfig } from "@neondatabase/serverless";
import { types as pgTypes } from "pg";
import { AccountAccessError, requireAccount, verifySessionAccount } from "../api/_shared/account-auth";
import { createAccountPool } from "../api/_shared/account-server";
import { accountOrigins, accountRequestOrigin, accountWebHeaders, requireSameOrigin } from "../api/_shared/account-origin";
import savedDomains, { createSavedDomainsHandler } from "../api/account/saved-domains";
import { authAction, createAuthHandler, publicAuthResult } from "../api/auth";
import { normalizeSavedDomain, parseSavedDomainCursor, saveDomainInput } from "../api/_shared/saved-domain-input";
import { accountCallbackUrl, passwordRecoveryToken, passwordRecoveryUrl, safeAccountPath } from "../src/lib/authNavigation";

const siteOrigin = "https://sajda.test";
const siteHost = "sajda.test";
const sessionCookie = "__Secure-sajda.session_token=fixture-signed-cookie";

function accountSession() {
  return { user: { id: "account-a", emailVerified: true }, session: { userId: "account-a", expiresAt: new Date(Date.now() + 60_000) } };
}

function accountError(status: number, code?: string) {
  return (error: unknown) => error instanceof AccountAccessError && error.status === status && (!code || error.code === code);
}

async function withAccountEnvironment(run: () => Promise<void>) {
  const values = { BETTER_AUTH_URL: siteOrigin, VERCEL: undefined, VERCEL_URL: undefined, VERCEL_BRANCH_URL: undefined, VERCEL_ENV: undefined, VERCEL_PROJECT_PRODUCTION_URL: undefined };
  const before = new Map(Object.keys(values).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  try { await run(); } finally {
    for (const [key, value] of before) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

test("auth pool parses safe int8 timestamps locally without unsupported Neon startup options or opening connections", async () => {
  const defaultInt8Parser = pgTypes.getTypeParser(20, "text");
  const pool = createAccountPool("postgresql://fixture:fixture@fixture-pooler.neon.tech/fixture?sslmode=require");
  try {
    const options = pool.options;
    assert.equal(new URL(options.connectionString!).searchParams.get("sslmode"), "verify-full");
    assert.equal(new URL(options.connectionString!).searchParams.has("options"), false);
    assert.equal(options.options, undefined, "Neon transaction pooling rejects search_path startup options");
    assert.equal(options.statement_timeout, undefined, "Use a client-side query timeout, not unsupported startup parameters");
    assert.equal(options.query_timeout, 10_000);
    assert.equal(options.max, 3);
    assert.equal(options.connectionTimeoutMillis, 8_000);
    assert.equal(options.allowExitOnIdle, true);
    const customTypes = options.types;
    assert.ok(customTypes);
    const parseInt8 = customTypes.getTypeParser(20, "text");
    const timestamp = parseInt8("1750000000000");
    assert.equal(timestamp, 1_750_000_000_000);
    assert.equal(timestamp + 60_000, 1_750_000_060_000, "Rate-limit retry arithmetic must add numbers, not concatenate strings");
    for (const value of ["0", "1", "-1", String(Number.MAX_SAFE_INTEGER), String(Number.MIN_SAFE_INTEGER)]) {
      assert.equal(parseInt8(value), Number(value));
    }
    for (const value of ["9007199254740992", "-9007199254740992", "NaN", "Infinity", "1.5"]) {
      assert.throws(() => parseInt8(value), /out of range/u);
    }
    assert.equal(customTypes.getTypeParser(20)("1750000000000"), timestamp);
    assert.equal(customTypes.getTypeParser(20, "binary"), pgTypes.getTypeParser(20, "binary"));
    assert.equal(customTypes.getTypeParser(16, "text")("t"), true);
    assert.equal(customTypes.getTypeParser(25, "text")("unchanged"), "unchanged");
    assert.equal(pgTypes.getTypeParser(20, "text"), defaultInt8Parser, "The auth override must not change global pg parsers");
    assert.equal(defaultInt8Parser("1750000000000"), "1750000000000");
    assert.equal(pool.totalCount, 0, "Inspecting pool configuration must not connect to a database");
    assert.equal(pool.waitingCount, 0);
  } finally { await pool.end(); }
  assert.equal(pool.ended, true);
});

test("only a current consistent server session authorizes its own account", () => {
  const valid = accountSession();
  assert.deepEqual(verifySessionAccount(valid, "account-a", true), { id: "account-a", emailVerified: true });
  for (const value of [
    null, {}, { user: valid.user }, { session: valid.session },
    { ...valid, user: { ...valid.user, id: "" } },
    { ...valid, user: { ...valid.user, id: "a".repeat(201) } },
    { ...valid, session: { ...valid.session, userId: "account-b" } },
    { ...valid, session: { ...valid.session, expiresAt: new Date(1) } },
    { ...valid, session: { ...valid.session, expiresAt: "not-a-date" } },
  ]) assert.throws(() => verifySessionAccount(value, "account-a"), accountError(401));
  for (const expectedId of [undefined, "account-b", ["account-a"], ""]) {
    assert.throws(() => verifySessionAccount(valid, expectedId), accountError(409, "account_changed"));
  }
});

test("unverified email and client metadata cannot promote account verification", () => {
  for (const emailVerified of [false, undefined, "true", 1]) {
    const value = { ...accountSession(), user: { id: "account-a", emailVerified, role: "admin", metadata: { emailVerified: true } } };
    assert.equal(verifySessionAccount(value, "account-a").emailVerified, false);
    assert.throws(() => verifySessionAccount(value, "account-a", true), accountError(403, "email_verification_required"));
  }
});

test("missing, duplicated, oversized and bearer-only credentials fail before database access", async () => {
  for (const cookie of [undefined, "", "other=value", "sajda.session_token=", [sessionCookie],
    `${sessionCookie}; ${sessionCookie}`, `${sessionCookie}; sajda.session_token=second`,
    `${sessionCookie}; oversized=${"x".repeat(9000)}`]) {
    await assert.rejects(() => requireAccount({ cookie, authorization: "Bearer forged", "x-sajda-account": "account-a" }), accountError(401));
  }
});

test("origins are established from deployment configuration, never forwarded host or caller input", () => {
  const env = { BETTER_AUTH_URL: siteOrigin, VERCEL: "1", VERCEL_ENV: "preview", VERCEL_URL: "sajda-preview.vercel.app", VERCEL_BRANCH_URL: "sajda-branch.vercel.app", VERCEL_PROJECT_PRODUCTION_URL: "sajda-production.vercel.app" };
  assert.deepEqual(accountOrigins(env), [siteOrigin, "https://sajda-preview.vercel.app", "https://sajda-branch.vercel.app"]);
  assert.equal(accountRequestOrigin({ host: siteHost, "x-forwarded-host": "attacker.test" }, env), siteOrigin);
  for (const host of [undefined, "attacker.test", `${siteHost}.attacker.test`, `${siteHost},attacker.test`, [siteHost]]) {
    assert.throws(() => accountRequestOrigin({ host, "x-forwarded-host": siteHost }, env), accountError(403));
  }
  assert.deepEqual(accountOrigins({ BETTER_AUTH_URL: "http://localhost:8095" }), ["http://localhost:8095"]);
  for (const url of ["http://attacker.test", "https://user:pass@sajda.test", `${siteOrigin}/path`, `${siteOrigin}?query=1`, `${siteOrigin}#hash`]) {
    assert.throws(() => accountOrigins({ BETTER_AUTH_URL: url }), accountError(503));
  }
  assert.throws(() => accountOrigins({ BETTER_AUTH_URL: "http://localhost:8095", VERCEL: "1" }), accountError(503));
});

test("cookie mutations require exact same-origin browser evidence before session lookup", async () => withAccountEnvironment(async () => {
  requireSameOrigin({ origin: siteOrigin, "sec-fetch-site": "same-origin" }, siteOrigin);
  for (const origin of [undefined, "null", "https://attacker.test", `${siteOrigin}/`, `${siteOrigin}.attacker.test`, [siteOrigin]]) {
    assert.throws(() => requireSameOrigin({ origin }, siteOrigin), accountError(403));
    await assert.rejects(() => requireAccount({ host: siteHost, cookie: sessionCookie, origin }, { method: "POST" }), accountError(403));
  }
  assert.throws(() => requireSameOrigin({ origin: siteOrigin, "sec-fetch-site": "cross-site" }, siteOrigin), accountError(403));
}));

test("auth header forwarding excludes bearer, proxy-host and arbitrary application headers", () => {
  const headers = accountWebHeaders({ cookie: sessionCookie, origin: siteOrigin, authorization: "Bearer do-not-forward", host: "attacker.test",
    "x-forwarded-host": "attacker.test", "x-forwarded-for": "spoofed", "x-vercel-forwarded-for": "192.0.2.3", "x-sajda-account": "untrusted", "content-type": "application/json" });
  assert.equal(headers.get("cookie"), sessionCookie);
  assert.equal(headers.get("origin"), siteOrigin);
  assert.equal(headers.get("x-vercel-forwarded-for"), "192.0.2.3");
  for (const name of ["authorization", "host", "x-forwarded-host", "x-forwarded-for", "x-sajda-account"]) assert.equal(headers.has(name), false);
});

test("saved-domain endpoint rejects anonymous reads and writes and is never publicly cached", async () => {
  for (const method of ["GET", "POST", "DELETE", "PATCH", "OPTIONS"]) {
    const response = {
      code: 200, body: undefined as unknown, headers: new Map<string, string | number>(),
      status(code: number) { this.code = code; return this; },
      setHeader(name: string, value: string | number) { this.headers.set(name.toLowerCase(), value); },
      json(body: unknown) { this.body = body; },
    };
    await savedDomains({ method, body: { user_id: "victim", domain: "example.com" } }, response);
    assert.equal(response.code, ["PATCH", "OPTIONS"].includes(method) ? 405 : 401);
    assert.match(String(response.headers.get("cache-control")), /no-store/);
    assert.equal(response.headers.get("vary"), "Cookie");
    assert.equal(response.headers.has("access-control-allow-origin"), false);
    assert.equal(JSON.stringify(response.body).includes("victim"), false);
  }
});

test("saved domains reject URLs, SQL-like text, IPs, malformed labels and excessive data", () => {
  assert.equal(normalizeSavedDomain(" Example.COM "), "example.com");
  assert.equal(normalizeSavedDomain("räksmörgås.se"), "xn--rksmrgs-5wao1o.se");
  for (const input of ["http://example.com", "localhost", "127.0.0.1", "foo..com", "-foo.com", "foo-.com", "foo.com/path", "user@example.com", `${"a".repeat(64)}.com`, "'; DROP TABLE users; --"]) {
    assert.equal(normalizeSavedDomain(input), null, input);
  }
  assert.equal(saveDomainInput.safeParse({ domain: "example.com", user_id: "victim" }).success, false);
  assert.equal(saveDomainInput.safeParse({ domain: "example.com", registrarPrice: -1 }).success, false);
  assert.equal(saveDomainInput.safeParse({ domain: "example.com", estimatedValue: Number.POSITIVE_INFINITY }).success, false);
  assert.equal(saveDomainInput.safeParse({ domain: "example.com", confidenceScore: 101 }).success, false);
  assert.equal(saveDomainInput.safeParse({ domain: "example.com", rationale: "x".repeat(4001) }).success, false);
});

test("keyset cursors are bounded PostgreSQL integer values", () => {
  assert.equal(parseSavedDomainCursor(undefined), null);
  assert.equal(parseSavedDomainCursor("123"), "123");
  for (const value of ["-1", "0", "1.5", "1 OR TRUE", ["1"], "9223372036854775808"]) assert.throws(() => parseSavedDomainCursor(value));
});

test("auth callbacks and next paths cannot redirect outside Sajda", () => {
  for (const value of ["https://attacker.test", "//attacker.test", "/\\attacker.test", "/\t/attacker.test", "javascript:alert(1)"]) {
    assert.equal(safeAccountPath(value), "/");
  }
  assert.equal(safeAccountPath("/watchlist?sort=date#saved"), "/watchlist?sort=date#saved");
  assert.equal(new URL(accountCallbackUrl("https://sajda.test", "//attacker.test")).origin, "https://sajda.test");
  const recovery = new URL(passwordRecoveryUrl("https://sajda.test", "/watchlist"));
  assert.equal(recovery.pathname, "/auth");
  assert.equal(recovery.searchParams.get("mode"), "update-password");
  assert.equal(recovery.searchParams.get("next"), "/watchlist");
  assert.equal(passwordRecoveryToken("?token=abc_def-123"), "abc_def-123");
  assert.equal(passwordRecoveryToken("?token=<script>"), null);
  assert.equal(passwordRecoveryToken(`?token=${"a".repeat(2049)}`), null);
});

test("verified saved-domain requests stay owner-scoped, idempotent and reject forged ownership (simulated provider transport)", async () => {
  const previousFetch = globalThis.fetch;
  const previousNeonFetch = neonConfig.fetchFunction;
  const previousDb = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "postgresql://fixture:fixture@fixture.neon.tech/fixture";
  const records = new Map<string, { id: string; domain: string }>();
  const queries: { query: string; params: string[] }[] = [];
  let rateCount = 1;
  const transport = async (url: string | URL | Request, init?: RequestInit) => {
    assert.ok(new URL(String(url)).hostname.endsWith(".neon.tech") && new URL(String(url)).pathname === "/sql", "Unexpected network target in isolated test");
    const query = JSON.parse(String(init?.body)) as { query: string; params: string[] };
    queries.push(query);
    let rows: Record<string, unknown>[] = [];
    if (query.query.includes("INSERT INTO sajda.function_rate_limits")) rows = [{ request_count: String(rateCount) }];
    else if (query.query.includes("INSERT INTO sajda.saved_domains")) {
      assert.match(query.query, /ON CONFLICT \(user_id, domain\) DO UPDATE/u);
      const [owner, domain] = query.params;
      const key = `${owner}:${domain}`;
      const row = records.get(key) ?? { id: String(records.size + 1), domain };
      records.set(key, row);
      rows = [row];
    } else if (query.query.includes("DELETE FROM sajda.saved_domains")) {
      assert.match(query.query, /WHERE user_id = \$1 AND domain = \$2/u);
      records.delete(`${query.params[0]}:${query.params[1]}`);
    } else if (query.query.includes("FROM sajda.saved_domains")) {
      assert.match(query.query, /WHERE user_id = \$1/u);
      rows = [...records.entries()].filter(([key]) => key.startsWith(`${query.params[0]}:`)).map(([, row]) => row);
    } else assert.fail("Unexpected SQL in simulated provider test");
    const columns = Object.keys(rows[0] ?? {});
    return Response.json({ fields: columns.map(name => ({ name, dataTypeID: 25 })), rows: rows.map(row => columns.map(column => row[column])), rowCount: rows.length });
  };
  globalThis.fetch = transport;
  neonConfig.fetchFunction = transport;
  const perform = async (method: string, owner: string, body?: unknown, query?: Record<string, unknown>) => {
    // Identity is injected as the result of server-side session verification,
    // not accepted from a caller header or forged JSON fixture.
    const handler = createSavedDomainsHandler(async (_headers, options) => {
      assert.equal(options?.verifiedEmail, true);
      assert.equal(options?.method, method);
      return { id: owner, emailVerified: true };
    });
    const response = {
      code: 200, body: undefined as unknown,
      setHeader() {},
      status(code: number) { this.code = code; return this; },
      json(value: unknown) { this.body = value; },
    };
    await handler({ method, body, query, headers: { cookie: sessionCookie, "x-sajda-account": "ignored-client-value", "content-type": "application/json" } }, response);
    return response;
  };
  try {
    assert.equal((await perform("POST", "account-a", { domain: "example.com", user_id: "victim" })).code, 400);
    assert.equal(queries.length, 0, "Forged ownership must not reach the database");
    assert.equal((await perform("POST", "account-a", { domain: "example.com" })).code, 200);
    assert.equal((await perform("POST", "account-a", { domain: "example.com" })).code, 200);
    assert.equal(records.size, 1, "Repeated save must not create another row");
    const own = await perform("GET", "account-a");
    assert.equal((own.body as { items: unknown[] }).items.length, 1);
    const foreign = await perform("GET", "account-b", undefined, { user_id: "account-a" });
    assert.equal((foreign.body as { items: unknown[] }).items.length, 0);
    await perform("DELETE", "account-b", { domain: "example.com" });
    assert.equal(records.size, 1, "Another account cannot delete the saved row");
    await perform("DELETE", "account-a", { domain: "example.com" });
    await perform("DELETE", "account-a", { domain: "example.com" });
    assert.equal(records.size, 0);
    rateCount = 121;
    assert.equal((await perform("POST", "account-a", { domain: "example.com" })).code, 429);
    assert.equal(records.size, 0, "Rate limit must precede writes");
  } finally {
    globalThis.fetch = previousFetch;
    neonConfig.fetchFunction = previousNeonFetch;
    if (previousDb === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousDb;
  }
});

type AuthHandler = ReturnType<typeof createAuthHandler>;
type AuthRequest = Parameters<AuthHandler>[0];

function recordedResponse() {
  return {
    code: 200, body: undefined as unknown, headers: new Map<string, string | string[] | number>(),
    status(code: number) { this.code = code; return this; },
    setHeader(name: string, value: string | string[] | number) { this.headers.set(name.toLowerCase(), value); },
    json(body: unknown) { this.body = body; },
    end(body?: string) { this.body = body; },
  };
}

async function requestAuth(handler: AuthHandler, overrides: Partial<AuthRequest> = {}) {
  const response = recordedResponse();
  await handler({ method: "POST", url: "/api/auth/sign-in/email", body: {},
    headers: { host: siteHost, origin: siteOrigin, "content-type": "application/json" }, ...overrides }, response);
  return response;
}

test("auth transport routes only supported actions and preserves recovery queries through Vercel rewrites", async () => withAccountEnvironment(async () => {
  const calls: Request[] = [];
  const handler = createAuthHandler(origin => {
    assert.equal(origin, siteOrigin);
    return { handler: async request => { calls.push(request); return Response.json({ ok: true }); } };
  }, () => true);
  for (const action of ["sign-in/email", "sign-up/email", "sign-out", "request-password-reset", "reset-password", "send-verification-email"]) {
    assert.equal((await requestAuth(handler, { url: `/api/auth/${action}` })).code, 200);
  }
  for (const action of ["get-session", "verify-email", "reset-password/fixture_token-123"]) {
    assert.equal((await requestAuth(handler, { method: "GET", url: `/api/auth/${action}`, body: undefined })).code, 200);
  }
  const rewritten = await requestAuth(handler, { method: "GET", url: "/api/auth?authAction=verify-email&token=fixture_token&callbackURL=%2Fauth", body: undefined });
  assert.equal(rewritten.code, 200);
  const last = new URL(calls[calls.length - 1].url);
  assert.equal(last.pathname, "/api/auth/verify-email");
  assert.equal(last.searchParams.get("token"), "fixture_token");
  assert.equal(last.searchParams.get("callbackURL"), "/auth");
  assert.equal(last.searchParams.has("authAction"), false);
  assert.equal(calls[0].headers.get("x-vercel-forwarded-for"), "127.0.0.1");
  const forwarded = authAction({ url: "/api/auth?token=fixture", headers: {}, query: { authAction: "verify-email" } });
  assert.equal(forwarded.action, "verify-email");
  assert.equal(forwarded.search.get("token"), "fixture");

  const count = calls.length;
  for (const url of ["/api/auth", "/api/auth/admin/list-users", "/api/auth/update-user", "/api/auth//sign-in/email", "/api/auth/reset-password/%2Fattacker"]) {
    assert.equal((await requestAuth(handler, { url })).code, 404, url);
  }
  assert.equal((await requestAuth(handler, { url: "/api/auth", query: { authAction: ["sign-in/email", "get-session"] } })).code, 404);
  for (const [method, action, allow] of [["GET", "sign-in/email", "POST"], ["POST", "get-session", "GET"], ["DELETE", "sign-out", "POST"], ["OPTIONS", "get-session", "GET"]]) {
    const response = await requestAuth(handler, { method, url: `/api/auth/${action}` });
    assert.equal(response.code, 405);
    assert.equal(response.headers.get("allow"), allow);
  }
  assert.equal(calls.length, count, "Unknown routes and wrong methods must not invoke auth/database");
}));

test("auth boundary rejects CSRF, foreign host, malformed JSON and oversized bodies before provider access", async () => withAccountEnvironment(async () => {
  let calls = 0;
  const handler = createAuthHandler(() => ({ handler: async () => { calls++; return Response.json({ ok: true }); } }), () => true);
  for (const headers of [
    { host: siteHost, "content-type": "application/json" },
    { host: siteHost, origin: "null", "content-type": "application/json" },
    { host: siteHost, origin: "https://attacker.test", "content-type": "application/json" },
    { host: siteHost, origin: siteOrigin, "sec-fetch-site": "cross-site", "content-type": "application/json" },
    { host: "attacker.test", origin: siteOrigin, "content-type": "application/json" },
  ]) assert.equal((await requestAuth(handler, { headers })).code, 403);
  for (const contentType of [undefined, "text/plain", "application/x-www-form-urlencoded", "application/jsonx"]) {
    assert.equal((await requestAuth(handler, { headers: { host: siteHost, origin: siteOrigin, "content-type": contentType } })).code, 415);
  }
  for (const body of ["{broken", "null", "[]", "1", '"text"']) {
    assert.equal((await requestAuth(handler, { body })).code, 400);
  }
  for (const body of [{ name: "x".repeat(16_384) }, JSON.stringify({ name: "😀".repeat(5000) })]) {
    assert.equal((await requestAuth(handler, { body })).code, 413);
  }
  const streamed = await requestAuth(handler, { body: undefined,
    [Symbol.asyncIterator]: async function* () { yield Buffer.from('{"name":"'); yield Buffer.from("x".repeat(16_384)); yield Buffer.from('"}'); },
  });
  assert.equal(streamed.code, 413);
  assert.equal(calls, 0, "Rejected requests must not invoke Better Auth, database or mail");
}));

test("email-dependent auth actions fail closed while existing login and password-token flows remain available", async () => withAccountEnvironment(async () => {
  let calls = 0;
  const handler = createAuthHandler(() => ({ handler: async () => { calls++; return Response.json({ ok: true }); } }), () => false);
  for (const action of ["sign-up/email", "request-password-reset", "send-verification-email"]) {
    const response = await requestAuth(handler, { url: `/api/auth/${action}` });
    assert.equal(response.code, 503);
    assert.equal((response.body as { code: string }).code, "email_not_configured");
    assert.match(String(response.headers.get("cache-control")), /no-store/u);
  }
  assert.equal(calls, 0);
  for (const action of ["sign-in/email", "sign-out", "reset-password"]) {
    assert.equal((await requestAuth(handler, { url: `/api/auth/${action}` })).code, 200);
  }
  assert.equal(calls, 3);
}));

test("auth response keeps secure cookies but strips session credentials and client network metadata", async () => withAccountEnvironment(async () => {
  const source = { token: "secret-root-token", user: { id: "account-a", emailVerified: true },
    session: { id: "session-a", userId: "account-a", token: "secret-session-token", ipAddress: "192.0.2.1", userAgent: "private-device" } };
  const sanitized = publicAuthResult(source) as typeof source;
  assert.equal("token" in sanitized, false);
  assert.equal("token" in sanitized.session, false);
  assert.equal("ipAddress" in sanitized.session, false);
  assert.equal("userAgent" in sanitized.session, false);
  assert.equal(source.session.token, "secret-session-token", "Sanitizing the response must not mutate library state");
  const handler = createAuthHandler(() => ({ handler: async () => {
    const result = Response.json(source);
    result.headers.append("set-cookie", `${sessionCookie}; Secure; HttpOnly; SameSite=Lax; Path=/`);
    result.headers.append("set-cookie", "__Secure-sajda.session_data=; Max-Age=0; Secure; HttpOnly; Path=/");
    result.headers.set("x-private-provider-header", "should-not-leak");
    return result;
  } }), () => true);
  const response = await requestAuth(handler);
  assert.equal(response.code, 200);
  assert.deepEqual(response.body, sanitized);
  assert.equal((response.headers.get("set-cookie") as string[]).length, 2);
  assert.equal(response.headers.get("vary"), "Cookie");
  assert.match(String(response.headers.get("cache-control")), /private, no-store/u);
  assert.equal(response.headers.has("x-private-provider-header"), false);
  assert.equal(response.headers.has("access-control-allow-origin"), false);
  assert.doesNotMatch(JSON.stringify(response.body), /secret-root-token|secret-session-token|192\.0\.2\.1|private-device/u);
}));

test("auth transport masks provider failures and exceptions while retaining safe status and redirects", async () => withAccountEnvironment(async () => {
  const previousError = console.error;
  const logs: string[] = [];
  console.error = (...parts: unknown[]) => { logs.push(parts.map(String).join(" ")); };
  try {
    for (const provider of [
      async () => Response.json({ token: "secret-value", stack: "private stack" }, { status: 500 }),
      async () => { throw new Error("postgres://secret-value:password@private-db.invalid"); },
    ]) {
      const handler = createAuthHandler(() => ({ handler: provider }), () => true);
      const response = await requestAuth(handler);
      assert.ok(response.code >= 500);
      assert.equal((response.body as { code: string }).code, "auth_unavailable");
      assert.doesNotMatch(JSON.stringify(response.body), /secret-value|private stack|password|private-db/u);
    }
    assert.doesNotMatch(logs.join("\n"), /secret-value|private stack|password|private-db/u);
    const limited = await requestAuth(createAuthHandler(() => ({ handler: async () => Response.json({ message: "Wait before retrying." }, { status: 429, headers: { "retry-after": "30" } }) }), () => true));
    assert.equal(limited.code, 429);
    assert.equal(limited.headers.get("retry-after"), "30");
    const libraryLimited = await requestAuth(createAuthHandler(() => ({ handler: async () => Response.json({ message: "Wait before retrying." }, { status: 429, headers: { "x-retry-after": "42" } }) }), () => true));
    assert.equal(libraryLimited.code, 429);
    assert.equal(libraryLimited.headers.get("retry-after"), "42", "Normalize Better Auth's limiter header for browser retry feedback");
    const redirect = await requestAuth(createAuthHandler(() => ({ handler: async () => new Response(null, { status: 302, headers: { location: `${siteOrigin}/auth` } }) }), () => true), { method: "GET", url: "/api/auth/verify-email?token=fixture", body: undefined });
    assert.equal(redirect.code, 302);
    assert.equal(redirect.headers.get("location"), `${siteOrigin}/auth`);
    const emptyJsonRedirect = await requestAuth(createAuthHandler(() => ({ handler: async () => new Response(null, { status: 302, headers: { location: `${siteOrigin}/auth`, "content-type": "application/json" } }) }), () => true), { method: "GET", url: "/api/auth/verify-email?token=fixture", body: undefined });
    assert.equal(emptyJsonRedirect.code, 302, "Empty-body JSON redirects must not become parser errors");
    assert.equal(emptyJsonRedirect.headers.get("location"), `${siteOrigin}/auth`);
  } finally { console.error = previousError; }
}));
