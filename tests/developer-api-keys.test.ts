import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { AccountAccessError } from "../api/_shared/account-error";
import { API_KEY_SCOPES, apiKeyEngineClientId, apiKeyEnvironment, assertApiKeyScopes, createDeveloperApiKeyService, parseCreateDeveloperApiKey, requireApiKey,
  type ApiKeyPrincipal, type DeveloperApiKeyPool } from "../api/_shared/developer-api-keys";
import developerKeys, { createDeveloperApiKeysHandler } from "../api/developer/api-keys";
import { createDomainsApiHandler } from "../api/v1/domains";
import { createMcpProductExecutor } from "../api/_shared/mcp-product";
import domainSearch, { createTrustedApiEngineRequest } from "../api/domain-search";

const owner = { id: "account-a", emailVerified: true };
const other = { id: "account-b", emailVerified: true };
type Row = Record<string, unknown>;
function harness(initialStage = "preview") {
  let stage = initialStage, now = Date.now(), verified = true, fail = false, revokeOnTouch = false;
  const rows: Row[] = [], calls: { sql: string; params: unknown[] }[] = [], quotas = new Map<string, { count: number; window: number }>();
  const pool: DeveloperApiKeyPool = { connect: async () => ({ release() {}, query: async (sql, params = []) => {
    calls.push({ sql, params });
    if (fail) throw new Error("postgres://private-password@database.invalid secret-token");
    let result: Row[] = [];
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) return { rows: [] };
    if (sql.includes("keys:quota")) {
      const key = JSON.stringify(params.slice(0, 3)), limit = Number(params[3]), window = Math.floor(now / 60000) * 60000;
      const previous = quotas.get(key), count = Math.min(previous?.window === window ? previous.count + 1 : 1, limit + 1);
      quotas.set(key, { count, window });
      result = [{ request_count: count, reset_at: new Date(window + 60000) }];
    } else if (sql.includes("keys:owner-lock")) {
      assert.match(sql, /WHERE id = \$1 AND "emailVerified" = true FOR UPDATE/u);
      result = verified ? [{ id: params[0] }] : [];
    } else if (sql.includes("keys:active")) result = [{ count: rows.filter(row => row.owner_id === params[0] && row.namespace === params[1] && !row.revoked_at && Number(row.expires_at) > now).length }];
    else if (sql.includes("keys:create")) {
      const [id, namespace, ownerId, name, lookupId, secretHash, keyPrefix, lastFour, scopes, days] = params;
      const row = { id, namespace, owner_id: ownerId, name, lookup_id: lookupId, secret_hash: secretHash, key_prefix: keyPrefix,
        last_four: lastFour, scopes, created_at: new Date(now), expires_at: new Date(now + Number(days) * 86400000), last_used_at: null, revoked_at: null };
      rows.push(row); result = [row];
    } else if (sql.includes("keys:list")) {
      assert.match(sql, /WHERE owner_id = \$1 AND namespace = \$2/u);
      assert.match(sql, /LIMIT 100/u);
      result = verified ? rows.filter(row => row.owner_id === params[0] && row.namespace === params[1]) : [];
    } else if (sql.includes("keys:revoke")) {
      assert.match(sql, /WHERE id = \$1::uuid AND owner_id = \$2 AND namespace = \$3/u);
      const row = rows.find(row => row.id === params[0] && row.owner_id === params[1] && row.namespace === params[2]);
      if (row && verified) { row.revoked_at ??= new Date(now); result = [row]; }
    } else if (sql.includes("keys:authenticate")) {
      assert.match(sql, /JOIN public.sajda_auth_user u ON u.id = k.owner_id/u);
      assert.match(sql, /k.lookup_id = \$1 AND k.namespace = \$2 AND k.revoked_at IS NULL/u);
      const row = rows.find(row => row.lookup_id === params[0] && row.namespace === params[1] && !row.revoked_at && Number(row.expires_at) > now);
      if (row && verified) result = [{ ...row, verified, checked_at: new Date(now) }];
    } else if (sql.includes("keys:touch")) {
      const row = rows.find(row => row.id === params[0] && row.owner_id === params[1] && row.namespace === params[2] && row.secret_hash === params[3]);
      if (row && revokeOnTouch) row.revoked_at = new Date(now);
      if (row && verified && !row.revoked_at && Number(row.expires_at) > now) { row.last_used_at = new Date(now); result = [{ id: row.id }]; }
    } else assert.fail(`Unexpected test SQL: ${sql}`);
    return { rows: result };
  } }) };
  const service = createDeveloperApiKeyService({ pool, environment: () => ({ VERCEL: "1", VERCEL_ENV: stage }) });
  return { service, pool, rows, calls, quotas, stage: (value: string) => { stage = value; }, advance: (ms: number) => { now += ms; },
    verified: (value: boolean) => { verified = value; }, fail: () => { fail = true; }, revokeOnTouch: () => { revokeOnTouch = true; } };
}

test("key input defaults to domain search only and denies unknown scopes, owners and unbounded expiry", () => {
  assert.deepEqual(parseCreateDeveloperApiKey({ name: " My server " }), { name: "My server", scopes: ["domains:search"], expiresInDays: 90 });
  assert.deepEqual(parseCreateDeveloperApiKey({ name: "MCP", scopes: [...API_KEY_SCOPES], expiresInDays: 365 }).scopes, API_KEY_SCOPES);
  for (const input of [null, [], {}, { name: "x", userId: "victim" }, { name: "x", environment: "production" },
    { name: "x", scopes: [] }, { name: "x", scopes: ["admin"] }, { name: "x", scopes: ["saved:read", "saved:read"] },
    { name: "x", scopes: ["*"] }, { name: "x", expiresInDays: 0 }, { name: "x", expiresInDays: 366 },
    { name: "x", expiresInDays: "30" }, { name: "x", expiresInDays: Infinity }, { name: "x\n" }, { name: "x".repeat(81) }]) {
    assert.throws(() => parseCreateDeveloperApiKey(input), AccountAccessError);
  }
  assert.equal(apiKeyEnvironment({}), "development");
  for (const value of [undefined, "", "staging"]) assert.throws(() => apiKeyEnvironment({ VERCEL: "1", VERCEL_ENV: value }), AccountAccessError);
});

test("only a digest is stored; list is owner-scoped and never returns credential material", async () => {
  const f = harness(), issued = await f.service.create(owner, { name: "MCP", scopes: ["account:read", "saved:read"], expiresInDays: 30 });
  assert.match(issued.apiKey, /^sj_test_[\w-]{16}_[\w-]{43}$/u);
  assert.equal(f.rows[0].secret_hash, createHash("sha256").update(issued.apiKey).digest("hex"));
  assert.equal(JSON.stringify(f.calls).includes(issued.apiKey), false);
  assert.equal(issued.key.lastFour, issued.apiKey.slice(-4));
  const own = await f.service.list(owner);
  assert.equal(own.length, 1);
  assert.doesNotMatch(JSON.stringify(own), /secret_hash|lookup_id|owner_id|apiKey/u);
  assert.equal(JSON.stringify(own).includes(issued.apiKey), false);
  assert.deepEqual(await f.service.list(other), []);
  await assert.rejects(f.service.revoke(other, issued.key.id), { code: "api_key_not_found", status: 404 });
  assert.equal(f.rows[0].revoked_at, null);
  await assert.rejects(f.service.create({ ...owner, emailVerified: false }, { name: "x" }), { status: 401 });
});

test("authenticated principal comes only from verified key ownership; required scopes do not imply other grants", async () => {
  const f = harness(), issued = await f.service.create(owner, { name: "Reader", scopes: ["saved:read"] });
  const result = await f.service.authenticate(issued.apiKey, ["saved:read"]);
  assert.equal(result.status, "authenticated");
  if (result.status !== "authenticated") assert.fail();
  assert.deepEqual(result.principal, { userId: owner.id, keyId: issued.key.id, environment: "preview", scopes: ["saved:read"] });
  assert.deepEqual(await f.service.authenticate(issued.apiKey, ["saved:write"]), { status: "insufficient_scope" });
  assert.deepEqual(await f.service.authenticate(issued.apiKey, ["domains:search"]), { status: "insufficient_scope" });
  assert.throws(() => assertApiKeyScopes(result.principal, ["trading:run"]), { code: "insufficient_scope" });
  const wrong = `${issued.apiKey.slice(0, -1)}${issued.apiKey.endsWith("A") ? "B" : "A"}`;
  assert.deepEqual(await f.service.authenticate(wrong), { status: "invalid" });
  f.verified(false);
  assert.deepEqual(await f.service.authenticate(issued.apiKey), { status: "invalid" });
});

test("persisted engine identities fit the actual boundary and stay stable across keys but isolated by owner/environment", async () => {
  const f = harness(), first = await f.service.create(owner, { name: "First" }), second = await f.service.create(owner, { name: "Second" });
  const a = await f.service.authenticate(first.apiKey), b = await f.service.authenticate(second.apiKey);
  if (a.status !== "authenticated" || b.status !== "authenticated") assert.fail("Fixture keys must authenticate");
  assert.equal(a.clientId, b.clientId);
  assert.equal(a.clientId, apiKeyEngineClientId(a.principal));
  assert.equal(a.clientId.length, 56);
  assert.notEqual(a.clientId, apiKeyEngineClientId({ userId: other.id, environment: "preview" }));
  assert.notEqual(a.clientId, apiKeyEngineClientId({ userId: owner.id, environment: "production" }));
  const request = createTrustedApiEngineRequest({ headers: {} }, {}, a.clientId);
  assert.equal(Object.values(request.headers).includes(first.apiKey), false);
  const identity = Object.getOwnPropertySymbols(request).map(symbol => (request as unknown as Record<symbol, unknown>)[symbol]);
  assert.ok(identity.includes(a.clientId));
});

test("revocation, expiry, deleted ownership and verification races fail closed without cached authorization", async () => {
  const f = harness(), issued = await f.service.create(owner, { name: "Revocable", expiresInDays: 1 });
  await f.service.revoke(owner, issued.key.id);
  const revokedAt = f.rows[0].revoked_at;
  await f.service.revoke(owner, issued.key.id);
  assert.equal(f.rows[0].revoked_at, revokedAt);
  assert.deepEqual(await f.service.authenticate(issued.apiKey), { status: "invalid" });
  const next = await f.service.create(owner, { name: "Expiring", expiresInDays: 1 });
  f.advance(86400000);
  assert.deepEqual(await f.service.authenticate(next.apiKey), { status: "invalid" });
  const race = harness(), racing = await race.service.create(owner, { name: "Race" });
  race.revokeOnTouch();
  assert.deepEqual(await race.service.authenticate(racing.apiKey), { status: "invalid" });
});

test("preview, development and production namespaces cannot reuse keys or revoke another namespace", async () => {
  const f = harness(), testKey = await f.service.create(owner, { name: "Preview" });
  f.stage("production");
  assert.deepEqual(await f.service.authenticate(testKey.apiKey), { status: "invalid" });
  assert.deepEqual(await f.service.list(owner), []);
  await assert.rejects(f.service.revoke(owner, testKey.key.id), { status: 404 });
  const live = await f.service.create(owner, { name: "Production" });
  assert.match(live.apiKey, /^sj_live_/u);
  assert.equal((await f.service.authenticate(live.apiKey)).status, "authenticated");
  f.stage("development");
  assert.deepEqual(await f.service.authenticate(testKey.apiKey), { status: "invalid" });
  assert.deepEqual(await f.service.authenticate(live.apiKey), { status: "invalid" });
});

test("active-key capacity is checked after an account row lock and failed creates roll back", async () => {
  const f = harness();
  for (let i = 0; i < 10; i++) await f.service.create(owner, { name: `Key ${i}` });
  await assert.rejects(f.service.create(owner, { name: "Over limit" }), { code: "api_key_limit" });
  assert.equal(f.calls.at(-1)?.sql, "ROLLBACK");
  assert.equal(f.rows.length, 10);
  const statements = f.calls.map(call => call.sql);
  const lock = statements.findIndex(sql => sql.includes("keys:owner-lock"));
  assert.match(statements[lock + 1], /keys:active/u);
  await f.service.revoke(owner, f.rows[0].id);
  await f.service.create(owner, { name: "Replacement" });
  assert.equal(f.rows.filter(row => !row.revoked_at).length, 10);
});

test("durable quota is shared across keys and service instances, bounded, separate by owner and reset by database minute", async () => {
  const f = harness();
  const principal: ApiKeyPrincipal = { userId: owner.id, keyId: randomUUID(), environment: "preview", scopes: ["domains:search"] };
  const otherService = createDeveloperApiKeyService({ pool: f.pool, environment: () => ({ VERCEL: "1", VERCEL_ENV: "preview" }) });
  for (let i = 0; i < 4; i++) assert.equal((await f.service.consumeApiKeyQuota({ ...principal, keyId: randomUUID() }, "domains")).allowed, true);
  assert.equal((await otherService.consumeApiKeyQuota(principal, "domains")).allowed, false);
  for (let i = 0; i < 20; i++) assert.equal((await f.service.consumeApiKeyQuota(principal, "domains")).remaining, 0);
  assert.equal(f.quotas.size, 1);
  assert.equal([...f.quotas.values()][0].count, 5);
  assert.equal((await f.service.consumeApiKeyQuota({ ...principal, userId: other.id }, "domains")).allowed, true);
  assert.equal((await f.service.consumeApiKeyQuota(principal, "requests")).remaining, 119);
  await assert.rejects(f.service.consumeApiKeyQuota({ ...principal, environment: "production" }), { status: 503 });
  f.advance(60000);
  assert.equal((await f.service.consumeApiKeyQuota(principal, "domains")).remaining, 3);
  assert.ok(f.calls.filter(call => call.sql.includes("keys:quota")).every(call => /ON CONFLICT \(namespace, subject_hash, bucket\)/u.test(call.sql)));
});

test("operator tokens and malformed/ambiguous Authorization cannot authenticate private account APIs", async () => {
  const f = harness();
  assert.deepEqual(await f.service.authenticate("operator-token"), { status: "not_applicable" });
  assert.deepEqual(await f.service.authenticate("sj_test_malformed"), { status: "invalid" });
  for (const headers of [{}, { authorization: ["Bearer a", "Bearer b"] }, { authorization: "Bearer a", Authorization: "Bearer b" },
    { authorization: "Bearer a,b" }, { authorization: "Bearer a b" }, { authorization: "Bearer operator-token" }]) {
    await assert.rejects(requireApiKey(headers), { code: "invalid_api_key", status: 401 });
  }
  assert.equal(f.calls.length, 0);
});

function response() {
  return { code: 200, body: undefined as unknown, headers: new Map<string, string | number>(),
    status(code: number) { this.code = code; return this; }, json(body: unknown) { this.body = body; },
    end(body?: string) { this.body = body; },
    setHeader(name: string, value: string | number) { this.headers.set(name.toLowerCase(), value); } };
}

test("persisted keys reach the real REST and MCP search engine and share account quotas without live provider calls", async () => {
  // Only database rows and fetch responses are fixtures. Key creation, digest
  // authentication, scope checks, quota selection, trusted request creation,
  // both API adapters and the complete domain engine are actual implementations.
  const f = harness(), account = { ...owner, id: `search-owner-${randomUUID()}` };
  const issued = await f.service.create(account, { name: "First search key" });
  const rotated = await f.service.create(account, { name: "Rotated search key" });
  const restricted = await f.service.create(account, { name: "No search scope", scopes: ["account:read"] });
  const route = createDomainsApiHandler({ authenticate: f.service.authenticate, quota: f.service.consumeApiKeyQuota,
    legacyQuota: async () => { throw new Error("Persisted credentials cannot use the operator quota"); } });
  let mcpEngineIdentity: unknown;
  const execute = createMcpProductExecutor({ quota: f.service.consumeApiKeyQuota, domainSearch: async (request, output) => {
    mcpEngineIdentity = Object.getOwnPropertySymbols(request).map(symbol => (request as unknown as Record<symbol, unknown>)[symbol])
      .find(value => typeof value === "string" && value.startsWith("account_"));
    await domainSearch(request, output);
  } });
  const originalFetch = globalThis.fetch;
  const endpoints: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    endpoints.push(url.href);
    assert.equal(url.protocol, "https:");
    assert.equal(url.pathname, "/com/v1/domain/example.com", "Only the stubbed exact RDAP read is allowed");
    assert.equal(new Headers(init?.headers).has("authorization"), false);
    return Response.json({ objectClassName: "domain", ldhName: "EXAMPLE.COM" },
      { headers: { "content-type": "application/rdap+json" } });
  };
  const call = async (token: string) => {
    const output = response();
    await route({ method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: { domains: ["example.com"], tlds: ["com"], providers: ["cloudflare"] } }, output);
    return output;
  };
  try {
    const first = await call(issued.apiKey);
    assert.equal(first.code, 200, "A real persisted-key identity must pass the engine boundary, not return 503");
    assert.equal((first.body as { engine: string }).engine, "vercel-public-registry-search");
    const row = (first.body as { results: { domain: string; status: string }[] }).results[0];
    assert.deepEqual([row.domain, row.status], ["example.com", "taken"]);
    assert.equal(first.headers.has("access-control-allow-origin"), false);
    assert.equal(first.headers.get("x-ratelimit-remaining"), "3");
    assert.equal(JSON.stringify(first.body).includes(issued.apiKey), false);
    const authenticated = await f.service.authenticate(rotated.apiKey, ["domains:search"]);
    if (authenticated.status !== "authenticated") assert.fail("Fixture key must authenticate");
    const mcp = await execute("domains_check", { domains: ["example.com"], providers: ["cloudflare"] }, authenticated.principal);
    assert.equal(mcp.status, 200);
    assert.equal(mcpEngineIdentity, authenticated.clientId, "REST/MCP use the same bounded owner identity inside the real engine");
    assert.equal((mcp.data.results as { status: string }[])[0].status, "taken");
    assert.equal((await call(rotated.apiKey)).code, 200);
    assert.equal((await call(issued.apiKey)).code, 200);
    // The actual engine may reuse its registry evidence cache. All four calls
    // must still consume the durable account bucket before entering the engine.
    assert.ok(endpoints.length >= 1 && endpoints.length <= 4);
    const fetchedBeforeDenial = endpoints.length;
    assert.equal((await call(rotated.apiKey)).code, 429, "Switching keys or adapters cannot reset the account domain bucket");
    assert.equal((await execute("domains_check", { domains: ["example.com"] }, authenticated.principal)).status, 429);
    assert.equal((await call(restricted.apiKey)).code, 403);
    assert.equal(endpoints.length, fetchedBeforeDenial, "Quota and scope denials must occur before provider dispatch");
  } finally { globalThis.fetch = originalFetch; }
});

test("management authenticates all methods with the verified same-origin session and never accepts bearer keys", async () => {
  for (const method of ["GET", "POST", "DELETE"]) {
    const result = response();
    await developerKeys({ method, headers: { authorization: "Bearer operator-token" }, body: { name: "unauthorized" } }, result);
    assert.equal(result.code, 401);
    assert.equal(result.headers.get("vary"), "Cookie");
    assert.equal(result.headers.has("access-control-allow-origin"), false);
    assert.match(String(result.headers.get("cache-control")), /private, no-store/u);
  }
  const f = harness();
  const handler = createDeveloperApiKeysHandler(async (_headers, options) => { assert.equal(options?.verifiedEmail, true); assert.ok(options?.method); return owner; }, f.service);
  const created = response();
  await handler({ method: "POST", headers: { "content-type": "application/json" }, body: { name: "MCP", scopes: ["account:read"] } }, created);
  assert.equal(created.code, 201);
  const key = (created.body as { key: { id: string } }).key;
  const revoked = response();
  await handler({ method: "DELETE", query: { id: key.id } }, revoked);
  assert.equal(revoked.code, 200);
  assert.equal("apiKey" in (revoked.body as Record<string, unknown>), false);
});

test("management rejects invalid bodies and safely masks provider errors", async () => {
  const f = harness(), handler = createDeveloperApiKeysHandler(async () => owner, f.service);
  for (const [body, expected] of [["[]", 400], ["{bad", 400], [{ name: "x", user_id: "victim" }, 400], [{ name: "x".repeat(4097) }, 413]] as const) {
    const result = response();
    await handler({ method: "POST", headers: { "content-type": "application/json" }, body }, result);
    assert.equal(result.code, expected);
  }
  f.fail();
  const result = response();
  await handler({ method: "GET" }, result);
  assert.equal(result.code, 503);
  assert.doesNotMatch(JSON.stringify(result.body), /private-password|database.invalid|secret-token/u);
  assert.deepEqual(await f.service.authenticate(`sj_test_${"a".repeat(16)}_${"b".repeat(43)}`), { status: "unavailable" });
});

test("query-ID DELETE accepts absent bodies across runtimes regardless of an empty-body content type", async () => {
  for (const body of [undefined, "", Buffer.alloc(0)]) {
    for (const contentType of [undefined, "application/json", "application/x-www-form-urlencoded"]) {
      const f = harness(), issued = await f.service.create(owner, { name: "Empty DELETE" });
      const handler = createDeveloperApiKeysHandler(async () => owner, f.service), result = response();
      let reads = 0;
      const request = { method: "DELETE", query: { id: issued.key.id }, headers: { "content-type": contentType },
        get body() { reads++; return body; } };
      await handler(request, result);
      assert.equal(result.code, 200, `${typeof body}/${contentType}`);
      assert.equal(reads, 1, "lazy body getter must be read exactly once");
      assert.ok(f.rows[0].revoked_at);
      assert.deepEqual(await f.service.authenticate(issued.apiKey), { status: "invalid" });
      assert.equal("apiKey" in (result.body as Record<string, unknown>), false);
    }
  }
});

test("nonempty DELETE bodies retain strict JSON and unambiguous ID validation", async () => {
  const f = harness(), issued = await f.service.create(owner, { name: "Strict DELETE" });
  const handler = createDeveloperApiKeysHandler(async () => owner, f.service);
  for (const [body, contentType, expected] of [
    [`id=${issued.key.id}`, "application/x-www-form-urlencoded", 415],
    [JSON.stringify({ id: issued.key.id }), undefined, 415],
    [" ", "application/json", 400], ["{bad", "application/json", 400],
    [null, "application/json", 400], [[], "application/json", 400], [{}, "application/json", 400],
    [{ id: randomUUID() }, "application/json", 400],
    [{ id: issued.key.id, owner: other.id }, "application/json", 400],
    [Buffer.from("{bad"), "application/json", 400],
    ["x".repeat(4097), "application/json", 413],
  ] as const) {
    const result = response();
    await handler({ method: "DELETE", query: { id: issued.key.id }, headers: { "content-type": contentType }, body }, result);
    assert.equal(result.code, expected);
    assert.equal(f.rows[0].revoked_at, null, "invalid bodies must not revoke the selected key");
  }
  for (const body of [{ id: issued.key.id }, JSON.stringify({ id: issued.key.id }), Buffer.from(JSON.stringify({ id: issued.key.id }))]) {
    const result = response();
    await handler({ method: "DELETE", query: { id: issued.key.id }, headers: { "content-type": "application/json" }, body }, result);
    assert.equal(result.code, 200);
  }
  const bodyOnly = response();
  await handler({ method: "DELETE", headers: { "content-type": "application/json" }, body: { id: issued.key.id } }, bodyOnly);
  assert.equal(bodyOnly.code, 200);
});

test("Vercel lazy body parsing errors are safe 400s for POST and DELETE", async () => {
  const f = harness(), issued = await f.service.create(owner, { name: "Getter failure" });
  const handler = createDeveloperApiKeysHandler(async () => owner, f.service);
  for (const method of ["POST", "DELETE"]) {
    const result = response();
    let reads = 0;
    await handler({ method, query: { id: issued.key.id }, headers: { "content-type": "application/json" },
      get body(): unknown { reads++; throw new SyntaxError("secret-token invalid JSON from private-runtime"); } }, result);
    assert.equal(result.code, 400);
    assert.equal(reads, 1);
    assert.equal((result.body as { code: string }).code, "invalid_request");
    assert.doesNotMatch(JSON.stringify(result.body), /secret-token|private-runtime/u);
    assert.equal(f.rows[0].revoked_at, null);
    assert.equal(f.rows.length, 1);
  }
});

test("additive migration protects hashes, allowed scopes, finite expiry and bounded shared quota storage", async () => {
  const sql = await readFile(new URL("../db/migrations/0013_developer_api_keys.sql", import.meta.url), "utf8");
  assert.match(sql, /REFERENCES public.sajda_auth_user\(id\) ON DELETE CASCADE/u);
  assert.match(sql, /expires_at <= created_at \+ interval '365 days'/u);
  assert.match(sql, /scopes <@ ARRAY\[/u);
  assert.match(sql, /PRIMARY KEY\(namespace, subject_hash, bucket\)/u);
  assert.match(sql, /request_count BETWEEN 1 AND 121/u);
  assert.equal((sql.match(/ENABLE ROW LEVEL SECURITY/gu) ?? []).length, 2);
  assert.match(sql, /REVOKE ALL ON sajda.developer_api_keys, sajda.developer_api_quotas FROM PUBLIC/u);
  assert.doesNotMatch(sql, /raw_key|api_key text|secret text|DROP TABLE/u);
});
