import assert from "node:assert/strict";
import test from "node:test";
import { neonConfig } from "@neondatabase/serverless";
import { AccountAccessError, requireAccount } from "../api/_shared/account-auth";
import { createDelegatedAccountHeaders, readDelegatedAccount, type DelegatedAccountPrincipal } from "../api/_shared/delegated-account";
import { exchangeNativeCode, hashNativeSecret, nativeAuthorizeInput, nativeChallenge, nativeExchangeInput, requireNativeSession } from "../api/_shared/native-auth";
import { nativeJson, nativeResponseHeaders } from "../api/_shared/native-http";
import nativeAuth from "../api/native/auth";
import nativeAccount, { nativeAccountRoute } from "../api/native/account";
import { nativePublicPath } from "../src/lib/productFetch";

const isAccessError = (code: string, status?: number) => (error: unknown) => error instanceof AccountAccessError && error.code === code && (status === undefined || error.status === status);
const response = () => ({
  code: 200, body: undefined as unknown, headers: new Map<string, string | number>(),
  setHeader(name: string, value: string | number) { this.headers.set(name.toLowerCase(), value); },
  status(code: number) { this.code = code; return this; }, json(body: unknown) { this.body = body; },
});

test("native PKCE accepts the RFC S256 vector and rejects malformed grants and redirect overrides", () => {
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
  assert.equal(nativeChallenge(verifier), challenge);
  const code = "A".repeat(43), state = "B".repeat(43);
  assert.ok(nativeAuthorizeInput.safeParse({ action: "authorize", challenge, state }).success);
  assert.ok(nativeExchangeInput.safeParse({ action: "exchange", code, verifier }).success);
  for (const invalid of ["", "A".repeat(42), "A".repeat(129), `${verifier}\n`, `${verifier}/`, `${verifier}=`, null]) {
    assert.equal(nativeExchangeInput.safeParse({ action: "exchange", code, verifier: invalid }).success, false);
  }
  for (const extra of [{ redirect_uri: "https://attacker.invalid" }, { callback: "evil://auth" }, { userId: "victim" }, { token: "forged" }, { challenge_method: "plain" }]) {
    assert.equal(nativeAuthorizeInput.safeParse({ action: "authorize", challenge, state, ...extra }).success, false);
    assert.equal(nativeExchangeInput.safeParse({ action: "exchange", code, verifier, ...extra }).success, false);
  }
  assert.notEqual(nativeChallenge(`${verifier.slice(0,-1)}a`), challenge);
  assert.match(hashNativeSecret(code), /^[a-f0-9]{64}$/u);
  assert.notEqual(hashNativeSecret(code), code);
});

test("delegated identity cannot be serialized into HTTP headers or reused for another method/environment", async () => {
  const principal: DelegatedAccountPrincipal = { userId: "account-a", credentialId: "native-session", source: "native", environment: process.env.VERCEL_ENV || "development", scopes: ["account:read", "saved:write"] };
  const headers = createDelegatedAccountHeaders(principal, "account:read", "GET");
  assert.equal(readDelegatedAccount(headers, "GET")?.userId, "account-a");
  assert.ok(Object.isFrozen(headers));
  assert.ok(Object.isFrozen(readDelegatedAccount(headers, "GET")));
  assert.equal(readDelegatedAccount({ ...headers }, "GET"), null);
  assert.equal(readDelegatedAccount(JSON.parse(JSON.stringify(headers)), "GET"), null);
  assert.equal(readDelegatedAccount({ "x-sajda-account": "victim", "x-sajda-delegated": "true", authorization: "Bearer sjn_" + "A".repeat(43) }, "GET"), null);
  await assert.rejects(() => requireAccount({ ...headers }, { method: "GET" }), isAccessError("authentication_required", 401));
  assert.throws(() => readDelegatedAccount(headers, "POST"), isAccessError("invalid_credential", 401));
  assert.throws(() => readDelegatedAccount(headers), isAccessError("invalid_credential", 401));
  assert.throws(() => createDelegatedAccountHeaders(principal, "trading:run", "POST"), isAccessError("insufficient_scope", 403));
  assert.throws(() => createDelegatedAccountHeaders({ ...principal, environment: "different-deployment" }, "account:read"), isAccessError("insufficient_scope", 403));
  assert.throws(() => createDelegatedAccountHeaders(principal, "account:read", "PUT"), isAccessError("insufficient_scope", 403));
  const originalNow = Date.now;
  Date.now = () => originalNow() + 61_000;
  try { assert.throws(() => readDelegatedAccount(headers, "GET"), isAccessError("invalid_credential", 401)); }
  finally { Date.now = originalNow; }
});

test("native account routing is canonical, scoped and cannot invoke Stripe or arbitrary endpoints", () => {
  for (const [path, method, body, scope] of [
    ["/api/account/membership", "GET", undefined, "account:read"],
    ["/api/account/saved-domains?cursor=10", "GET", undefined, "saved:read"],
    ["/api/account/saved-domains", "DELETE", { domain: "example.com" }, "saved:write"],
    ["/api/account/capabilities", "POST", { capability: "swipe_undo" }, "swipe:write"],
    ["/api/account/lost-domains", "GET", undefined, "trading:read"],
    ["/api/account/lost-domains", "POST", { action: "start" }, "trading:run"],
    ["/api/account/lost-domains", "POST", { action: "refresh_quote" }, "trading:quote"],
    ["/api/developer/api-keys", "GET", undefined, "keys:manage"],
    ["/api/developer/api-keys", "POST", { name: "App integration", scopes: ["domains:read"] }, "keys:manage"],
    ["/api/developer/api-keys?id=12345678-1234-4234-8234-123456789abc", "DELETE", undefined, "keys:manage"],
  ] as const) assert.equal(nativeAccountRoute(path, method, body).scope, scope);
  for (const path of [
    "/api/account/billing", "/api/auth/get-session", "https://attacker.invalid/api/account/membership", "//attacker.invalid/api/account/membership",
    "/api/account/../account/membership", "/api/account/%2e%2e/account/membership", "/api/account/..\\account/membership", "/api/account/membership#secret",
    "/api/account/membership?accountId=victim", "/api/account/saved-domains?cursor=a&cursor=b",
  ]) assert.throws(() => nativeAccountRoute(path, "GET"), undefined, path);
  for (const method of ["POST", "DELETE", "PUT", "GET"]) assert.throws(() => nativeAccountRoute("/api/account/billing", method, { action: "checkout" }));
  assert.throws(() => nativeAccountRoute("/api/account/lost-domains", "POST", { action: "grant_access" }));
  assert.throws(() => nativeAccountRoute("/api/account/saved-domains?cursor=10", "DELETE"));
  for (const path of ["/api/developer/api-keys", "/api/developer/api-keys?id=not-a-key", "/api/developer/api-keys?id=12345678-1234-4234-8234-123456789abc&id=12345678-1234-4234-8234-123456789abc", "/api/developer/api-keys?id=12345678-1234-4234-8234-123456789abc&accountId=victim"]) {
    assert.throws(() => nativeAccountRoute(path, "DELETE"), undefined, path);
  }
  assert.throws(() => nativeAccountRoute("/api/developer/api-keys?id=12345678-1234-4234-8234-123456789abc", "POST"));
  assert.throws(() => nativeAccountRoute("/api/developer/api-keys", "PUT"));
});

test("native public transport accepts only relative product requests", () => {
  assert.equal(nativePublicPath("/api/domain-search", "POST"), "/api/domain-search");
  assert.equal(nativePublicPath("/api/fact-signals?limit=1"), "/api/fact-signals?limit=1");
  assert.equal(nativePublicPath("/api/v1/public/domains", "OPTIONS"), "/api/v1/public/domains");
  for (const path of ["https://sajda.invalid/api/openapi", "//sajda.invalid/api/openapi", "https://attacker.invalid/api/openapi", "/api/../api/openapi", "/api/%2e%2e/api/openapi", "/api/openapi#fragment", "/api/native/auth", "/api/account/billing"]) {
    assert.throws(() => nativePublicPath(path), undefined, path);
  }
  assert.throws(() => nativePublicPath("/api/domain-search", "GET"));
});

test("native JSON and response headers bound input and keep account data private", async () => {
  assert.deepEqual(await nativeJson({ headers: { "content-type": "application/json; charset=utf-8" }, body: { action: "logout" } }), { action: "logout" });
  await assert.rejects(() => nativeJson({ headers: { "content-type": "text/plain" }, body: "{}" }), isAccessError("unsupported_media_type", 415));
  await assert.rejects(() => nativeJson({ headers: { "content-type": "application/json" }, body: "{" }), isAccessError("invalid_request", 400));
  await assert.rejects(() => nativeJson({ headers: { "content-type": "application/json" }, body: { value: "A".repeat(16_385) } }), isAccessError("request_too_large", 413));
  const streamed = { headers: { "content-type": "application/json" }, async *[Symbol.asyncIterator]() { yield Buffer.alloc(10_000, "a"); yield Buffer.alloc(10_000, "a"); } };
  await assert.rejects(() => nativeJson(streamed), isAccessError("request_too_large", 413));
  const result = response(); nativeResponseHeaders(result, "request-fixture");
  assert.equal(result.headers.get("cache-control"), "private, no-store");
  assert.equal(result.headers.get("referrer-policy"), "no-referrer");
  assert.equal(result.headers.get("vary"), "Authorization");
  assert.equal(result.headers.has("access-control-allow-origin"), false);
});

test("native bearer validation, unavailable storage and PKCE replay fail closed (simulated database transport)", async () => {
  const keys = ["SAJDA_NATIVE_ENABLED", "DATABASE_URL", "BETTER_AUTH_URL", "VERCEL", "VERCEL_ENV"];
  const previousEnv = new Map(keys.map(key => [key, process.env[key]]));
  const previousFetch = globalThis.fetch, previousNeonFetch = neonConfig.fetchFunction;
  process.env.SAJDA_NATIVE_ENABLED = "true";
  process.env.DATABASE_URL = "postgresql://fixture:fixture@native-fixture.neon.tech/fixture";
  process.env.BETTER_AUTH_URL = "https://sajda.test";
  delete process.env.VERCEL; process.env.VERCEL_ENV = "development";
  const code = "C".repeat(43), verifier = "V".repeat(43);
  const queries: { query: string; params: string[] }[] = [];
  let grantAvailable = true, databaseUnavailable = false;
  const transport = async (url: string | URL | Request, init?: RequestInit) => {
    assert.ok(new URL(String(url)).hostname.endsWith(".neon.tech"));
    assert.equal(new URL(String(url)).pathname, "/sql");
    if (databaseUnavailable) throw new Error("Synthetic unavailable storage; no network attempted");
    const query = JSON.parse(String(init?.body)) as typeof queries[number]; queries.push(query);
    let rows: Record<string, string>[] = [];
    if (query.query.includes("WITH consumed AS")) {
      assert.match(query.query, /DELETE FROM sajda\.native_authorization_codes/u);
      assert.match(query.query, /c\.expires_at>now\(\)/u);
      assert.match(query.query, /s\."expiresAt">now\(\)/u);
      assert.match(query.query, /u\."emailVerified"=true/u);
      assert.equal(query.params.includes(code), false, "authorization codes are hashed in storage");
      assert.equal(query.params.includes(verifier), false, "PKCE verifiers never enter storage");
      if (grantAvailable && query.params.includes(hashNativeSecret(code)) && query.params.includes(nativeChallenge(verifier))) {
        grantAvailable = false;
        rows = [{ expires_at: "2026-09-17T10:00:00.000Z" }];
      }
    } else if (query.query.includes("FROM sajda.native_sessions")) {
      assert.match(query.query, /n\.revoked_at IS NULL/u);
      assert.match(query.query, /n\.expires_at>now\(\)/u);
      assert.match(query.query, /s\."expiresAt">now\(\)/u);
      assert.match(query.query, /s\."userId"=n\.user_id/u);
      assert.match(query.query, /u\."emailVerified"=true/u);
      assert.equal(query.params.some(value => value.startsWith("sjn_")), false, "bearer credentials never enter storage as plaintext");
    } else assert.fail("Unexpected SQL in native authentication fixture");
    const columns = Object.keys(rows[0] ?? {});
    return Response.json({ fields: columns.map(name => ({ name, dataTypeID: 25 })), rows: rows.map(row => columns.map(column => row[column])), rowCount: rows.length });
  };
  globalThis.fetch = transport; neonConfig.fetchFunction = transport;
  try {
    for (const authorization of [undefined, "Bearer", "Bearer fake", `Bearer sjn_${"A".repeat(42)}`, [`Bearer sjn_${"A".repeat(43)}`], `Bearer sjn_${"A".repeat(43)}\n`]) {
      await assert.rejects(() => requireNativeSession({ authorization }), isAccessError("authentication_required", 401));
    }
    assert.equal(queries.length, 0);
    const bearer = `Bearer sjn_${"A".repeat(43)}`;
    await assert.rejects(() => requireNativeSession({ authorization: bearer }), isAccessError("invalid_session", 401));
    const headers = { host: "sajda.test", authorization: bearer, "content-type": "application/json" };
    const accountResult = response();
    await nativeAccount({ method: "POST", headers, body: { path: "/api/account/membership", method: "GET", accountId: "victim" } }, accountResult);
    assert.equal(accountResult.code, 401);
    assert.equal((accountResult.body as { code: string }).code, "invalid_session");
    await assert.rejects(() => exchangeNativeCode(code, "X".repeat(43)), isAccessError("invalid_grant", 401));
    assert.equal(grantAvailable, true, "a mismatched verifier does not consume the valid grant");
    const exchanged = await exchangeNativeCode(code, verifier);
    assert.match(exchanged.token, /^sjn_[A-Za-z0-9_-]{43}$/u);
    assert.equal(exchanged.expiresAt, "2026-09-17T10:00:00.000Z");
    await assert.rejects(() => exchangeNativeCode(code, verifier), isAccessError("invalid_grant", 401));
    databaseUnavailable = true;
    const unavailable = response();
    await nativeAuth({ method: "GET", headers }, unavailable);
    assert.equal(unavailable.code, 503);
    assert.equal((unavailable.body as { code: string }).code, "native_unavailable");
    assert.doesNotMatch(JSON.stringify(unavailable.body), /fixture|postgres|sjn_/u);
    process.env.SAJDA_NATIVE_ENABLED = "false";
    await assert.rejects(() => requireNativeSession({ authorization: bearer }), isAccessError("native_not_enabled", 503));
  } finally {
    globalThis.fetch = previousFetch; neonConfig.fetchFunction = previousNeonFetch;
    for (const [key, value] of previousEnv) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});
