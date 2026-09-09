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
for (const path of ["/api/v1/domains", "/api/account/saved-domains", "/api/account/lost-domains", "/api/account/billing"]) {
  const privateRead = path.startsWith("/api/account/");
  const response = await fetch(new URL(path, origin), { method: privateRead ? "GET" : "POST", headers: { "content-type": "application/json" }, ...(!privateRead ? { body: "{}" } : {}) });
  assert.equal(response.status, 401, path);
  assert.equal(response.headers.get("access-control-allow-origin"), null, path);
  assert.ok((await response.json()).code); checks++;
}
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
