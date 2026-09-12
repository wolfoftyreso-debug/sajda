import assert from "node:assert/strict";
import { createServer } from "node:http";
import test, { type TestContext } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { createPublicMcpHandler } from "../api/mcp/public.js";
import { createMcpHandler } from "../api/mcp.js";
import { createPublicMcpExecutor, type PublicMcpExecutor } from "../api/_shared/public-mcp-tools.js";
import { accountRequestOrigin } from "../api/_shared/account-origin.js";
import { AccountAccessError } from "../api/_shared/account-error.js";

const init = (protocolVersion = "2025-11-25") => ({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
  protocolVersion, capabilities: {}, clientInfo: { name: "sajda-connector-test", version: "1.0.0" },
} });
const suggestion = { query: "climate software", budget: { amount: 30, currency: "USD", period: "first_year" } };
async function serve(t: TestContext, options: { execute?: PublicMcpExecutor; parsedBody?: boolean; now?: () => number } = {}) {
  let origin = "";
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const resolveOrigin = (headers: Record<string, string | string[] | undefined>) => accountRequestOrigin(headers, { BETTER_AUTH_URL: origin });
  const handler = createPublicMcpHandler({ requestOrigin: resolveOrigin, now: options.now,
    execute: options.execute ?? (async (name, args) => { calls.push({ name, args }); return { status: "empty", items: [], shortfall: 10 }; }) });
  const privateHandler = createMcpHandler({ requestOrigin: resolveOrigin,
    authorize: async () => { throw new AccountAccessError("invalid_api_key", 401, "A private API key is required."); } });
  const http = createServer((req, res) => { void (async () => {
    if (options.parsedBody) {
      const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = Buffer.concat(chunks).toString("utf8");
      Object.defineProperty(req, "body", { get: () => body ? JSON.parse(body) : undefined });
    }
    await (req.url === "/api/mcp" ? privateHandler : handler)(req, res);
  })(); });
  await new Promise<void>(resolve => http.listen(0, "127.0.0.1", resolve));
  const address = http.address(); assert.ok(address && typeof address !== "string"); origin = `http://127.0.0.1:${address.port}`;
  t.after(async () => { http.closeAllConnections(); await new Promise<void>((resolve, reject) => http.close(error => error ? reject(error) : resolve())); });
  const url = `${origin}/api/mcp/public`;
  const post = (body: unknown, headers: Record<string, string> = {}) => fetch(url, { method: "POST",
    headers: { accept: "application/json, text/event-stream", "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body) });
  async function connect() {
    const client = new Client({ name: "real-mcp-client", version: "1.0.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(url)));
    t.after(() => client.close()); return client;
  }
  return { origin, url, calls, post, connect };
}

test("authless real SDK discovery exposes only two read-only noauth tools and never performs a search", async t => {
  const fixture = await serve(t), client = await fixture.connect();
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(tool => tool.name), ["domains_suggest", "domains_check"]);
  for (const tool of tools) {
    assert.equal(tool.inputSchema.additionalProperties, false);
    assert.equal(tool.outputSchema?.type, "object");
    assert.equal(tool.annotations?.readOnlyHint, true);
    assert.equal(tool.annotations?.destructiveHint, false);
    assert.deepEqual(tool._meta?.securitySchemes, [{ type: "noauth" }]);
  }
  assert.equal(fixture.calls.length, 0);
  const result = await client.callTool({ name: "domains_suggest", arguments: suggestion });
  assert.equal(result.structuredContent?.ok, true);
  assert.equal(result.isError, undefined);
  assert.deepEqual(fixture.calls[0], { name: "domains_suggest", args: { ...suggestion, tlds: ["com", "dev", "app"], count: 10, locale: "en" } });
  assert.deepEqual((result.structuredContent?.data as Record<string, unknown>).items, [], "Never manufacture ten matches for an empty response");
});

test("budget, private actions and injected account/provider data fail before executing anything", async t => {
  const fixture = await serve(t), client = await fixture.connect();
  for (const args of [{ query: "startup" }, { ...suggestion, count: 11 }, { ...suggestion, userId: "someone-else" },
    { ...suggestion, budget: { amount: 30, currency: "USD" } }, { ...suggestion, budget: { amount: "30", currency: "USD", period: "first_year" } },
    { ...suggestion, aiConsent: true }, { ...suggestion, endpoint: "http://169.254.169.254" }]) {
    await assert.rejects(client.callTool({ name: "domains_suggest", arguments: args }), error => error instanceof McpError && error.code === ErrorCode.InvalidParams);
  }
  for (const name of ["trading_start", "saved_domains_list", "account_membership", "buy_domain"]) {
    await assert.rejects(client.callTool({ name, arguments: {} }), error => error instanceof McpError && error.code === ErrorCode.InvalidParams);
  }
  assert.equal(fixture.calls.length, 0);
  const result = await client.callTool({ name: "domains_check", arguments: { domains: ["EXAMPLE.COM"], locale: "sv" } });
  assert.equal(result.structuredContent?.ok, true);
  assert.deepEqual(fixture.calls[0].args, { domains: ["example.com"], locale: "sv" });
});

test("public MCP never weakens the private endpoint and rejects credentials, foreign origins and malformed protocol input", async t => {
  const fixture = await serve(t);
  assert.equal((await fetch(`${fixture.origin}/api/mcp`, { method: "POST", body: JSON.stringify(init()) })).status, 401);
  assert.equal((await fixture.post(init(), { authorization: "Bearer invalid-private-key" })).status, 400);
  assert.equal((await fixture.post(init(), { origin: "https://attacker.invalid" })).status, 403);
  assert.equal((await fixture.post(init(), { origin: "null" })).status, 403);
  const allowed = await fixture.post(init(), { origin: "https://claude.ai" });
  assert.equal(allowed.status, 200); assert.equal(allowed.headers.get("access-control-allow-origin"), "https://claude.ai");
  assert.equal(allowed.headers.get("access-control-allow-credentials"), null);
  assert.equal(allowed.headers.get("set-cookie"), null);
  assert.equal(allowed.headers.get("www-authenticate"), null);
  assert.match(allowed.headers.get("cache-control") ?? "", /no-store/u);
  for (const method of ["GET", "DELETE", "PUT"]) assert.equal((await fetch(fixture.url, { method })).status, 405);
  for (const body of [[], [init()], "null", { method: "tools/list" }]) assert.equal((await fixture.post(body)).status, 400);
  assert.equal((await fixture.post("{")).status, 400);
  assert.equal((await fixture.post(init(), { accept: "application/json" })).status, 406);
  assert.equal((await fixture.post(init(), { "content-type": "text/plain" })).status, 415);
  assert.equal((await fixture.post({ ...init(), extra: "x".repeat(17_000) })).status, 413);
  const task = await fixture.post({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "domains_suggest", arguments: suggestion, task: {} } });
  assert.equal((await task.json()).error.code, ErrorCode.InvalidParams);
  assert.equal(fixture.calls.length, 0);
});

test("stateless public transport negotiates versions and accepts Vercel's lazy parsed body", async t => {
  const fixture = await serve(t, { parsedBody: true });
  for (const version of ["2025-11-25", "2025-06-18", "2025-03-26"]) {
    const response = await fixture.post(init(version));
    assert.equal(response.status, 200); assert.equal((await response.json()).result.protocolVersion, version);
    assert.equal(response.headers.get("mcp-session-id"), null);
  }
  assert.equal((await fixture.post("{")).status, 400);
  assert.equal((await (await fixture.connect()).listTools()).tools.length, 2);
  const notify = await fixture.post({ jsonrpc: "2.0", method: "notifications/initialized" });
  assert.equal(notify.status, 202);
});

test("metadata burst limit resets and does not start product work", async t => {
  let now = Date.now(); const fixture = await serve(t, { now: () => now });
  for (let count = 0; count < 120; count++) assert.equal((await fixture.post(init())).status, 200);
  const rejected = await fixture.post(init()); assert.equal(rejected.status, 429); assert.equal(rejected.headers.get("retry-after"), "60");
  now += 60_000; assert.equal((await fixture.post(init())).status, 200);
  assert.equal(fixture.calls.length, 0);
});

test("public executor strips all account/AI/header authority and does not expose fabricated valuations", async () => {
  let count = 0;
  const execute = createPublicMcpExecutor({ "x-forwarded-for": "192.0.2.12", authorization: "secret", cookie: "session=private",
    "x-sajda-account": "foreign", "x-sajda-api-key": "secret" }, "req_publicconnectorqa1", {
    search: async (req, res) => {
      count++; assert.deepEqual(req.headers, { "content-type": "application/json", "x-forwarded-for": "192.0.2.12" });
      assert.deepEqual((req.body as Record<string, unknown>).providers, ["loopia", "porkbun", "namecheap", "cloudflare"]);
      assert.equal(Object.hasOwn(req.body as object, "aiConsent"), false);
      res.status(200).json({ checkedAt: "2026-09-11T10:00:00Z", results: [{ domain: "example.com", status: "taken", authoritative: true,
        checkedAt: "2026-09-11T09:59:30Z", source: "registry", registrarOffers: [], estimatedValue: 1000000 }] });
    }, fx: async () => { throw new Error("Exact checks must not fetch FX"); },
  });
  const result = await execute("domains_check", { domains: ["example.com"] });
  assert.equal(count, 1); assert.equal(result.purchasePerformed, false);
  assert.doesNotMatch(JSON.stringify(result), /estimatedValue|1000000|session=|secret/u);
  assert.equal((result.results as { checkedAt: string }[])[0].checkedAt, "2026-09-11T09:59:30Z");
});

test("search quota/provider failures remain tool errors and never fetch FX after rejection", async t => {
  const execute = createPublicMcpExecutor({}, "req_publicconnectorqa2", {
    search: async (_req, res) => { res.setHeader("Retry-After", "42"); res.status(429).json({ error: "Do not leak provider data" }); },
    fx: async () => { assert.fail("No FX after a denied search"); },
  });
  const client = await (await serve(t, { execute })).connect();
  const result = await client.callTool({ name: "domains_suggest", arguments: suggestion });
  assert.equal(result.isError, true); assert.equal(result.structuredContent?.ok, false);
  assert.equal((result.structuredContent?.error as { retryAfterSeconds: number }).retryAfterSeconds, 42);
  assert.doesNotMatch(JSON.stringify(result), /Do not leak provider/u);
});

test("unsupported search references give actionable input errors rather than a retryable outage", async t => {
  const execute = createPublicMcpExecutor({}, "req_publicconnectorqa3", {
    fx: async () => { assert.fail("Invalid input must not fetch FX"); },
  });
  const client = await (await serve(t, { execute })).connect();
  for (const query of ["!!!", "创业公司的日程规划", "planning <script>"]) {
    const result = await client.callTool({ name: "domains_suggest", arguments: { ...suggestion, query } });
    assert.equal(result.isError, true);
    assert.equal((result.structuredContent?.error as { code: string }).code, "invalid_search");
    assert.match((result.structuredContent?.error as { message: string }).message, /Change the input/u);
    assert.doesNotMatch(JSON.stringify(result), /Try again later/u);
  }
});
