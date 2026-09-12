/** Read-only HTTP smoke test. Set SAJDA_TEST_ORIGIN to a linked preview to
 * repeat the same checks after deployment. Never performs an account write. */
import assert from "node:assert/strict";
import { SEO_PAGES } from "./seo-routes.mjs";
import { runtimeFetch as fetch } from "./runtime-http.mjs";

const origin = process.env.SAJDA_TEST_ORIGIN || "http://127.0.0.1:8095";
const pages = ["/", "/plus", "/pricing", "/auth", "/contact", "/story", "/how-it-works", "/developers", "/legal", "/security", "/status", "/marketplace", "/swipe",
  "/watchlist", "/my-domains", "/history", "/account", "/install", "/top-10-today", "/admin", ...SEO_PAGES.map((page) => page.path)];
let checks = 0;
// Authenticated CLI startup is local process overhead, not server latency.
// Keep its process count low and give that transport its own bounded deadline.
const usesCli = Boolean(process.env.SAJDA_VERCEL_CLI);
const transportTimeout = usesCli ? 60_000 : 15_000;
const pageConcurrency = usesCli ? 2 : 6;
async function checkPage(path) {
  const response = await fetch(new URL(path, origin), { signal: AbortSignal.timeout(transportTimeout) });
  assert.equal(response.status, 200, path);
  assert.match(response.headers.get("content-type") || "", /text\/html/, path);
  const html = await response.text();
  assert.match(html, /id="root"/, path);
  assert.ok(response.headers.get("content-security-policy"), `${path} CSP`);
  if (path === "/" || path === "/auth" || path === "/account") assert.match(response.headers.get("x-robots-tag") || "", /noindex/);
  checks++;
}
// Read-only page checks do not need serial CLI startups. Bound concurrency to
// keep both the local verifier and preview runtime comfortable.
for (let start = 0; start < pages.length; start += pageConcurrency) {
  await Promise.all(pages.slice(start, start + pageConcurrency).map(checkPage));
}
for (const path of ["/sajda-qa-page-does-not-exist", "/api/sajda-qa-does-not-exist", "/assets/sajda-missing.js"]) {
  assert.equal((await fetch(new URL(path, origin))).status, 404, path); checks++;
}
const schema = await fetch(new URL("/api/openapi", origin));
assert.equal(schema.status, 200);
assert.equal((await schema.json()).openapi, "3.1.0"); checks++;
const publicMcp = await fetch(new URL("/api/mcp/public", origin), { method: "POST", signal: AbortSignal.timeout(transportTimeout),
  headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "sajda-runtime-check", version: "1.0.0" } } }),
});
assert.equal(publicMcp.status, 200, "Anonymous MCP initialization must not redirect to login");
assert.equal((await publicMcp.json()).result.serverInfo.name, "sajda");
assert.equal(publicMcp.headers.get("set-cookie"), null); checks++;
const publicTools = await fetch(new URL("/api/mcp/public", origin), { method: "POST", signal: AbortSignal.timeout(transportTimeout),
  headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
});
assert.equal(publicTools.status, 200);
assert.deepEqual((await publicTools.json()).result.tools.map(tool => tool.name), ["domains_suggest", "domains_check"]); checks++;
for (const path of ["/api/v1/domains", "/api/account/saved-domains", "/api/account/lost-domains", "/api/account/billing",
  "/api/account/membership", "/api/account/capabilities", "/api/account/app-sessions", "/api/account/trading-scenarios"]) {
  const privateRead = path.startsWith("/api/account/");
  const response = await fetch(new URL(path, origin), { method: privateRead ? "GET" : "POST", headers: { "content-type": "application/json" }, ...(!privateRead ? { body: "{}" } : {}) });
  assert.equal(response.status, 401, path);
  assert.equal(response.headers.get("access-control-allow-origin"), null, path);
  assert.ok((await response.json()).code); checks++;
}
// Anonymous journal submissions must fail at the account boundary, even with
// a forged owner header. No scenario, quota or commercial state may be written.
const scenario = await fetch(new URL("/api/account/trading-scenarios", origin), {
  method: "POST", headers: { "content-type": "application/json", "x-sajda-account": "runtime-qa-unauthenticated" },
  body: "{}",
});
assert.equal(scenario.status, 401, "scenario writes require a verified account session");
assert.match(scenario.headers.get("cache-control") || "", /no-store/u);
assert.ok((await scenario.json()).code); checks++;
// No cookies or bearer credentials: these must be rejected before a request
// can reserve quota, query a private report or contact a provider.
const quote = await fetch(new URL("/api/account/lost-domains", origin), {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ action: "refresh_quote", runId: "10000000-0000-4000-8000-000000000001",
    domain: "example.com", requestKey: "10000000-0000-4000-8000-000000000002" }),
});
assert.equal(quote.status, 401, "quote refresh requires an account session");
assert.match(quote.headers.get("cache-control") || "", /no-store/u);
assert.ok((await quote.json()).code); checks++;
const scheduler = await fetch(new URL("/api/cron/lost-domains", origin));
assert.equal(scheduler.status, 401, "scheduler cannot run without its private secret");
assert.equal((await scheduler.json()).code, "authentication_required"); checks++;
for (const [path, method, expected, body] of [
  ["/api/account/deletion", "POST", 401, {}],
  ["/api/native/account", "GET", 405],
  ["/api/native/commerce", "GET", 405],
  ["/api/cron/native-commerce", "GET", 401],
  ["/api/app-store-webhook", "GET", 405],
  ["/api/app-store-webhook", "POST", 400, { signedPayload: "invalid" }],
]) {
  const response = await fetch(new URL(path, origin), { method, headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  assert.equal(response.status, expected, path);
  assert.match(response.headers.get("cache-control") || "", /no-store/u);
  assert.ok((await response.json()).code, path); checks++;
}
const preflight = await fetch(new URL("/api/v1/public/domains", origin), { method: "OPTIONS" });
assert.equal(preflight.status, 204);
assert.equal(preflight.headers.get("access-control-allow-origin"), "*"); checks++;
const invalid = await fetch(new URL("/api/v1/public/domains", origin), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tlds: ["com"], count: 10000 }) });
assert.equal(invalid.status, 400); checks++;
const health = await fetch(new URL("/api/health", origin), { signal: AbortSignal.timeout(usesCli ? 60_000 : 8_000) });
assert.ok([200, 503].includes(health.status));
if (process.env.SAJDA_REQUIRE_DATABASE === "true") assert.equal(health.status, 200, "Configured deployment must have ready database schema");
const healthBody = await health.json();
assert.equal(typeof healthBody.ok, "boolean");
assert.ok(healthBody.requestId); checks++;
console.log(JSON.stringify({ origin, httpChecksPassed: checks, databaseHealth: health.status, database: healthBody.database,
  note: "HTTP/HTML/API smoke coverage, not proof of rendered browser/account/payment flows." }));
