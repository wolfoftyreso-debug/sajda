import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import test, { type TestContext } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ErrorCode, LATEST_PROTOCOL_VERSION, McpError } from "@modelcontextprotocol/sdk/types.js";
import { createMcpHandler } from "../api/mcp.js";
import { AccountAccessError, type requireAccount } from "../api/_shared/account-auth.js";
import { accountRequestOrigin } from "../api/_shared/account-origin.js";
import { API_KEY_SCOPES, requireApiKey, type ApiKeyPrincipal } from "../api/_shared/developer-api-keys.js";
import { readDelegatedAccount } from "../api/_shared/delegated-account.js";
import { createMcpProductExecutor } from "../api/_shared/mcp-product.js";
import type { McpProductExecutor } from "../api/_shared/mcp-tools.js";
import { createAccountMembershipHandler } from "../api/account/membership.js";
import { createLostDomainsHandler } from "../api/account/lost-domains.js";
import type { lostDomainsService } from "../api/_shared/lost-domains-service.js";

const accountA: ApiKeyPrincipal = { userId: "mcp-owner-a", keyId: randomUUID(), scopes: [...API_KEY_SCOPES], environment: "development" };
const accountB: ApiKeyPrincipal = { ...accountA, userId: "mcp-owner-b", keyId: randomUUID() };
const requestQuota = async () => ({ allowed: true, remaining: 100, resetAt: Date.now() + 60_000 });
const initialize = (protocolVersion = "2025-11-25") => ({ jsonrpc: "2.0", id: 1, method: "initialize",
  params: { protocolVersion, capabilities: {}, clientInfo: { name: "sajda-conformance-test", version: "1.0.0" } } });

async function serve(t: TestContext, options: { execute?: McpProductExecutor; authorize?: typeof requireApiKey;
  quota?: typeof requestQuota; keys?: Map<string, ApiKeyPrincipal>; vercelBody?: boolean } = {}) {
  let baseUrl = "";
  const calls: string[] = [];
  const keys = options.keys ?? new Map([["test-a", accountA], ["test-b", accountB]]);
  const handler = createMcpHandler({
    authorize: options.authorize ?? (async headers => {
      const value = typeof headers.authorization === "string" && keys.get(headers.authorization.replace(/^Bearer /u, ""));
      if (!value) throw new AccountAccessError("invalid_api_key", 401, "Invalid API key.");
      return value;
    }),
    quota: options.quota ?? requestQuota,
    requestOrigin: headers => accountRequestOrigin(headers, { BETTER_AUTH_URL: baseUrl }),
    execute: options.execute ?? (async operation => { calls.push(operation); return { status: 200, data: { operation } }; }),
  });
  const http = createServer((request, response) => { void (async () => {
    if (options.vercelBody) {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const raw = Buffer.concat(chunks).toString("utf8");
      // Vercel consumes the stream and exposes parsed JSON using a getter.
      // That getter throws for malformed JSON before our parser sees a value.
      Object.defineProperty(request, "body", { get: () => raw ? JSON.parse(raw) : undefined });
    }
    await handler(request, response);
  })(); });
  await new Promise<void>(resolve => http.listen(0, "127.0.0.1", resolve));
  const address = http.address();
  assert.ok(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;
  t.after(async () => {
    http.closeAllConnections();
    await new Promise<void>((resolve, reject) => http.close(error => error ? reject(error) : resolve()));
  });
  const url = `${baseUrl}/api/mcp`;
  async function client(key = "test-a") {
    const value = new Client({ name: "real-sdk-test-client", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { authorization: `Bearer ${key}` } } });
    await value.connect(transport);
    t.after(async () => { await value.close(); });
    return { client: value, transport };
  }
  async function post(body: unknown, extraHeaders: Record<string, string> = {}, key = "test-a") {
    return fetch(url, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json",
      accept: "application/json, text/event-stream", ...extraHeaders }, body: typeof body === "string" ? body : JSON.stringify(body) });
  }
  return { url, calls, client, post, keys };
}

test("real SDK client initializes, discovers strict schemas and calls tools over stateless HTTP", async t => {
  assert.equal(LATEST_PROTOCOL_VERSION, "2025-11-25", "A dependency protocol change requires a compatibility review.");
  const fixture = await serve(t);
  const { client, transport } = await fixture.client();
  assert.equal(client.getServerVersion()?.name, "sajda");
  assert.equal(transport.sessionId, undefined);
  assert.equal(transport.protocolVersion, "2025-11-25");
  const catalogue = await client.listTools();
  assert.equal(catalogue.tools.length, 12);
  assert.deepEqual(fixture.calls, [], "Initialize and discovery cannot execute product work.");
  for (const tool of catalogue.tools) {
    assert.equal(tool.inputSchema.type, "object");
    assert.equal(tool.inputSchema.additionalProperties, false);
    assert.equal(tool.outputSchema?.type, "object");
    assert.ok(Array.isArray(tool._meta?.["sajda/requiredScopes"]));
  }
  assert.equal(catalogue.tools.find(tool => tool.name === "trading_start")?.annotations?.readOnlyHint, false);
  assert.equal(catalogue.tools.find(tool => tool.name === "trading_advance")?.annotations?.idempotentHint, false);
  assert.equal(catalogue.tools.some(tool => /purchase|payment|buy/i.test(tool.name)), false);
  const result = await client.callTool({ name: "account_membership", arguments: {} });
  assert.equal(result.isError, undefined);
  assert.equal(result.structuredContent?.ok, true);
  assert.deepEqual(fixture.calls, ["account_membership"]);
});

test("initialization negotiates compatible dated versions and unsupported protocol headers fail", async t => {
  const fixture = await serve(t);
  for (const date of ["2025-11-25", "2025-06-18", "2025-03-26"]) {
    const response = await fixture.post(initialize(date));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).result.protocolVersion, date);
    assert.equal(response.headers.get("mcp-session-id"), null);
  }
  const future = await fixture.post(initialize("2099-01-01"));
  assert.equal((await future.json()).result.protocolVersion, "2025-11-25");
  const incompatible = await fixture.post({ jsonrpc: "2.0", id: 2, method: "tools/list" }, { "mcp-protocol-version": "2099-01-01" });
  assert.equal(incompatible.status, 400);
  const notification = await fixture.post({ jsonrpc: "2.0", method: "notifications/initialized" });
  assert.equal(notification.status, 202);
  assert.equal(await notification.text(), "");
  assert.deepEqual(fixture.calls, []);
});

test("Vercel's parsed-body getter supports the SDK transport and malformed JSON remains a protocol error", async t => {
  const fixture = await serve(t, { vercelBody: true });
  const { client } = await fixture.client();
  assert.equal((await client.listTools()).tools.length, 12);
  const malformed = await fixture.post("{");
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).error.code, ErrorCode.ParseError);
  assert.deepEqual(fixture.calls, []);
});

test("HTTP authentication, origin, protocol media and size errors cannot dispatch a tool", async t => {
  const fixture = await serve(t);
  const missing = await fetch(fixture.url, { method: "POST", body: JSON.stringify(initialize()) });
  assert.equal(missing.status, 401);
  assert.match(missing.headers.get("www-authenticate") ?? "", /^Bearer /);
  assert.equal(missing.headers.get("access-control-allow-origin"), null);
  for (const key of ["invalid", "expired", "revoked", "legacy-operator", "test-a,test-b"]) {
    assert.equal((await fixture.post(initialize(), {}, key)).status, 401);
  }
  assert.equal((await fixture.post(initialize(), { origin: "https://attacker.invalid" })).status, 403);
  assert.equal((await fixture.post(initialize(), { accept: "application/json" })).status, 406);
  assert.equal((await fixture.post(initialize(), { "content-type": "text/plain" })).status, 415);
  for (const method of ["GET", "DELETE", "PUT", "OPTIONS"]) {
    const response = await fetch(fixture.url, { method, headers: { authorization: "Bearer test-a" } });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("allow"), "POST");
  }
  const malformed = await fixture.post("{");
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).error.code, ErrorCode.ParseError);
  for (const body of [[], [initialize()], { id: 1, method: "tools/list" }, "null"]) {
    const response = await fixture.post(body);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, ErrorCode.InvalidRequest);
  }
  assert.equal((await fixture.post({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { huge: "x".repeat(17000) } })).status, 413);
  const task = await fixture.post({ jsonrpc: "2.0", id: 3, method: "tools/call", params: {
    name: "trading_start", arguments: { requestKey: randomUUID() }, task: { ttl: 60000 },
  } });
  assert.equal((await task.json()).error.code, ErrorCode.InvalidParams);
  assert.deepEqual(fixture.calls, []);
});

test("real SDK distinguishes protocol errors, missing scopes and safe product failures", async t => {
  const keys = new Map([["read-only", { ...accountA, scopes: ["account:read"] as ApiKeyPrincipal["scopes"] }]]);
  const operations: string[] = [];
  const fixture = await serve(t, { keys, execute: async operation => {
    operations.push(operation);
    throw new Error("postgres://hidden password SELECT provider_secret");
  } });
  const { client } = await fixture.client("read-only");
  const scope = await client.callTool({ name: "trading_start", arguments: { requestKey: randomUUID() } });
  assert.equal(scope.isError, true);
  assert.equal(scope.structuredContent?.status, 403);
  assert.equal((scope.structuredContent?.error as { code: string }).code, "insufficient_scope");
  assert.deepEqual(operations, []);
  for (const call of [{ name: "unknown", arguments: {} }, { name: "account_membership", arguments: { userId: "mcp-owner-b" } },
    { name: "trading_start", arguments: {} }, { name: "saved_domains_save", arguments: { domain: "https://example.com/" } }]) {
    await assert.rejects(client.callTool(call), error => error instanceof McpError && error.code === ErrorCode.InvalidParams);
  }
  const failure = await client.callTool({ name: "account_membership", arguments: {} });
  assert.equal(failure.isError, true);
  assert.equal(failure.structuredContent?.status, 503);
  assert.doesNotMatch(JSON.stringify(failure), /postgres|hidden|password|SELECT|provider_secret/);
  assert.deepEqual(operations, ["account_membership"]);
  keys.delete("read-only");
  await assert.rejects(client.listTools(), /401|Invalid API key/);
});

test("request throttling denies work before SDK dispatch", async t => {
  const fixture = await serve(t, { quota: async () => ({ allowed: false, remaining: 0, resetAt: Date.now() + 60_000 }) });
  const response = await fixture.post(initialize());
  assert.equal(response.status, 429);
  assert.ok(Number(response.headers.get("retry-after")) > 0);
  assert.deepEqual(fixture.calls, []);
});

test("production API-key verifier rejects cookies and the configured legacy operator hash", async t => {
  const token = "legacy_" + "x".repeat(40);
  const previous = process.env.SAJDA_API_KEY_HASHES;
  process.env.SAJDA_API_KEY_HASHES = `operator:${createHash("sha256").update(token).digest("hex")}`;
  t.after(() => { if (previous === undefined) delete process.env.SAJDA_API_KEY_HASHES; else process.env.SAJDA_API_KEY_HASHES = previous; });
  const fixture = await serve(t, { authorize: requireApiKey });
  const response = await fixture.post(initialize(), {}, token);
  assert.equal(response.status, 401);
  const cookie = await fetch(fixture.url, { method: "POST", headers: { cookie: "sajda.session_token=forged", "x-sajda-account": accountA.userId },
    body: JSON.stringify(initialize()) });
  assert.equal(cookie.status, 401);
  assert.deepEqual(fixture.calls, []);
});

/** Only persistence/provider outcomes are fixtures here. The official SDK,
 * HTTP transport, MCP adapter, trusted delegation and product HTTP handlers
 * are real. Existing store/PostgreSQL tests cover durable idempotency itself. */
function productFixture() {
  const calls: unknown[][] = [];
  const runs = new Map<string, { id: string; key: string; status: string }>();
  const quotes = new Map<string, string>();
  const state = { entitled: true, enabled: true };
  const authorize: typeof requireAccount = async (headers = {}, options = {}) => {
    assert.equal(headers.authorization, undefined);
    assert.equal(headers.cookie, undefined);
    assert.equal(headers.origin, undefined);
    const principal = readDelegatedAccount(headers, options.method);
    assert.ok(principal, "Only the internal WeakMap identity may authenticate.");
    assert.equal(options.verifiedEmail, true);
    return { id: principal.userId, emailVerified: true };
  };
  const service: typeof lostDomainsService = {
    async read(owner) {
      calls.push(["read", owner]);
      return { access: state.entitled, sourcesAvailable: 2,
        activeRun: runs.has(owner) ? { ...runs.get(owner)! } as never : null, latestRun: null, latestAttempt: null,
        candidates: state.entitled ? [0, 1, 2].map(index => ({ domain: `candidate-${index}.com`, evidence: [{ observedAt: "2026-09-10T00:00:00Z" }] })) as never : [] };
    },
    async start(owner, key) {
      if (!state.entitled) throw new AccountAccessError("plus_required", 403, "Trading membership is required.");
      const prior = runs.get(owner);
      if (prior?.key === key) return { reused: true, run: prior as never };
      calls.push(["start", owner, key]);
      const run = { id: randomUUID(), key, status: "queued" };
      runs.set(owner, run);
      return { reused: false, run: run as never };
    },
    async advance(owner, run) { calls.push(["advance", owner, run]); return true; },
    async cancel(owner, run) {
      const value = runs.get(owner);
      if (value?.id === run) value.status = "cancelled";
      calls.push(["cancel", owner, run]); return true;
    },
    async refreshQuote(owner, run, domain, key) {
      const identity = `${owner}:${key}`;
      const target = `${run}:${domain}`;
      if (quotes.has(identity) && quotes.get(identity) !== target) throw new AccountAccessError("quote_request_conflict", 409, "Request key belongs to another candidate.");
      if (!quotes.has(identity)) { calls.push(["quote", owner, run, domain, key]); quotes.set(identity, target); }
      return true;
    },
    async tick() { throw new Error("MCP must never tick automatically."); },
  };
  const execute = createMcpProductExecutor({
    trading: createLostDomainsHandler({ authorize, service, limit: async () => {}, enabled: () => state.enabled }),
    membership: createAccountMembershipHandler(authorize, async () => ({ plan: "free", accessSource: "free", expiresAt: null,
      capabilities: { save_domains: true, swipe_undo: false, trading: false } })),
    quota: requestQuota,
  });
  return { execute, calls, runs, state };
}

test("SDK tools share real product handlers, isolate accounts and never start work on discovery/status/report", async t => {
  const products = productFixture();
  const fixture = await serve(t, { execute: products.execute });
  const { client: a } = await fixture.client();
  const { client: b } = await fixture.client("test-b");
  await a.listTools();
  assert.deepEqual(products.calls, []);
  const membership = await a.callTool({ name: "account_membership", arguments: {} });
  assert.equal((membership.structuredContent?.data as { accountId: string }).accountId, accountA.userId);
  const status = await a.callTool({ name: "trading_status", arguments: {} });
  assert.equal("candidates" in (status.structuredContent?.data as object), false);
  const report = await a.callTool({ name: "trading_report", arguments: { offset: 1, limit: 1 } });
  const page = report.structuredContent?.data as { candidates: { domain: string }[]; totalCandidates: number; nextOffset: number };
  assert.equal(page.candidates[0].domain, "candidate-1.com");
  assert.equal(page.totalCandidates, 3);
  assert.equal(page.nextOffset, 2);
  assert.ok(products.calls.every(call => call[0] === "read"));
  const requestKey = randomUUID();
  const first = await a.callTool({ name: "trading_start", arguments: { requestKey } });
  const run = (first.structuredContent?.data as { activeRun: { id: string } }).activeRun.id;
  await a.callTool({ name: "trading_start", arguments: { requestKey } });
  assert.equal(products.calls.filter(call => call[0] === "start").length, 1, "Start retry preserves the caller's durable key.");
  const bStatus = await b.callTool({ name: "trading_status", arguments: {} });
  assert.equal((bStatus.structuredContent?.data as { activeRun: unknown }).activeRun, null);
  await a.callTool({ name: "trading_advance", arguments: { runId: run } });
  assert.deepEqual(products.calls.find(call => call[0] === "advance"), ["advance", accountA.userId, run]);
  const quoteKey = randomUUID();
  for (let attempt = 0; attempt < 2; attempt++) await a.callTool({ name: "trading_refresh_quote", arguments: { runId: run, domain: "candidate-1.com", requestKey: quoteKey } });
  assert.equal(products.calls.filter(call => call[0] === "quote").length, 1);
  const conflict = await a.callTool({ name: "trading_refresh_quote", arguments: { runId: run, domain: "candidate-2.com", requestKey: quoteKey } });
  assert.equal(conflict.structuredContent?.status, 409);
  products.state.enabled = false;
  const disabled = await a.callTool({ name: "trading_start", arguments: { requestKey: randomUUID() } });
  assert.equal(disabled.structuredContent?.status, 503);
  const stopped = await a.callTool({ name: "trading_stop", arguments: { runId: run } });
  assert.equal(stopped.isError, undefined);
  assert.equal(products.runs.get(accountA.userId)?.status, "cancelled");
  products.state.enabled = true;
  products.state.entitled = false;
  const denied = await a.callTool({ name: "trading_start", arguments: { requestKey: randomUUID() } });
  assert.equal(denied.structuredContent?.status, 403);
  assert.equal(products.calls.filter(call => call[0] === "start").length, 1);
});

test("domain adapter retains exact status/currency and delegates sanitized input without a credential", async () => {
  let invoked = 0;
  const execute = createMcpProductExecutor({ quota: requestQuota, domainSearch: async (request, response) => {
    invoked++;
    assert.deepEqual(request.headers, {});
    assert.deepEqual((request.body as { domains: string[] }).domains, ["example.com"]);
    assert.deepEqual((request.body as { tlds: string[] }).tlds, ["com"]);
    response.status(200).json({ domains: [{ domain: "example.com", status: "unknown", currency: "USD", checkedAt: null }] });
  } });
  const result = await execute("domains_check", { domains: ["example.com"] }, accountA);
  assert.equal(result.status, 200);
  assert.deepEqual(result.data.domains, [{ domain: "example.com", status: "unknown", currency: "USD", checkedAt: null }]);
  const blocked = createMcpProductExecutor({ quota: async () => ({ allowed: false, remaining: 0, resetAt: Date.now() + 60_000 }),
    domainSearch: async () => { throw new Error("Must not run"); } });
  assert.equal((await blocked("domains_check", { domains: ["example.com"] }, accountA)).status, 429);
  await assert.rejects(execute("domains_check", { domains: ["example.com"] }, { ...accountA, scopes: [] }),
    error => error instanceof AccountAccessError && error.code === "insufficient_scope");
  assert.equal(invoked, 1);
});
