import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { openApiDocument } from "../api/_shared/openapi-document.mjs";
import { createVercelBuildEnvironment } from "../scripts/build-vercel.mjs";
import { assertPublicBrowserBundle } from "../scripts/check-neon-build.mjs";

const appRoutes = ["/auth", "/contact", "/plus", "/pricing", "/story", "/how-it-works", "/developers", "/legal", "/security", "/status", "/marketplace", "/marketplace/:listingId", "/swipe", "/watchlist", "/my-domains", "/history", "/account", "/install", "/top-10-today", "/admin"];

test("Plus is private/noindex and bounded worker functions do not activate a crawl schedule", async () => {
  const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
  const headers = config.headers.find(entry => entry.source === "/plus").headers;
  assert.ok(headers.some(header => header.key === "X-Robots-Tag" && header.value === "noindex, nofollow"));
  assert.ok(headers.some(header => header.key === "Cache-Control" && header.value.includes("no-store")));
  assert.equal(config.functions["api/account/lost-domains.ts"].maxDuration, 30);
  assert.equal(config.functions["api/cron/lost-domains.ts"].maxDuration, 60);
  assert.equal(config.crons, undefined, "Source review and scheduling activation remain explicit pilot gates");
});

test("clean-URL application rewrites target the served root, not an excluded .html URL", async () => {
  const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.equal(config.cleanUrls, true);
  const applicationRewrites = config.rewrites.filter(route => !route.source.startsWith("/api/"));
  assert.deepEqual(applicationRewrites.map(route => route.source).sort(), [...appRoutes].sort());
  for (const route of applicationRewrites) {
    assert.equal(route.destination, "/");
    assert.ok(!route.source.includes("(.*)"), "unknown pages must not become a soft 404");
  }
});

test("nested auth routes reach one same-origin Vercel function, never the SPA shell", async () => {
  const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
  const apiRewrites = config.rewrites.filter(route => route.source.startsWith("/api/"));
  assert.deepEqual(apiRewrites, [{ source: "/api/auth/:authAction*", destination: "/api/auth?authAction=:authAction*" }]);
  assert.equal(config.rewrites[0], apiRewrites[0], "Auth is explicitly routed before application pages");
  assert.equal(config.functions["api/auth.ts"].maxDuration, 30);
  // Vercel's documented :path* substitution works inside destination queries.
  // This guards the configured mapping, not a claim of deployed-router testing.
  for (const action of ["get-session", "sign-in/email", "sign-up/email", "reset-password", "verify-email"]) {
    const target = new URL(apiRewrites[0].destination.replace(":authAction*", action), "https://sajda.example.test");
    assert.equal(target.pathname, "/api/auth");
    assert.equal(target.searchParams.get("authAction"), action);
  }
  assert.ok(!config.rewrites.some(route => ["/:path*", "/(.*)", "/api/:path*"].includes(route.source)), "Unknown app/API paths must not become a soft 404");
});

test("browser CSP permits same-origin Vercel auth but no direct Neon connection", async () => {
  const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
  const csp = config.headers.find(entry => entry.source === "/(.*)").headers.find(header => header.key === "Content-Security-Policy").value;
  assert.equal(csp.split(";").map(value => value.trim()).find(value => value.startsWith("connect-src")), "connect-src 'self'");
});

test("Vercel derives account auth from both server requirements, never stale public flags", () => {
  const stale = { VITE_ACCOUNT_AUTH_ENABLED: "true", VITE_NEON_AUTH_URL: "https://old-auth.example.neon.tech", VITE_SUPABASE_URL: "https://old.supabase.co" };
  for (const environment of [
    stale,
    { ...stale, BETTER_AUTH_SECRET: "x".repeat(32) },
    { ...stale, DATABASE_URL: "postgresql://fixture", BETTER_AUTH_SECRET: "x".repeat(31) },
    { ...stale, DATABASE_URL: " ", BETTER_AUTH_SECRET: "x".repeat(64) },
    { ...stale, DATABASE_URL: "postgresql://fixture", BETTER_AUTH_SECRET: " ".repeat(64) },
  ]) assert.equal(createVercelBuildEnvironment(environment).VITE_ACCOUNT_AUTH_ENABLED, "false");
  const configured = createVercelBuildEnvironment({
    ...stale, VITE_ACCOUNT_AUTH_ENABLED: "false", VITE_LOCAL_TEST_MODE: "true",
    DATABASE_URL: "postgresql://server-only-fixture", BETTER_AUTH_SECRET: "x".repeat(32),
    VITE_DATABASE_URL: "must-not-ship", VITE_DATABASE_URL_UNPOOLED: "must-not-ship",
    VITE_BETTER_AUTH_SECRET: "must-not-ship", VITE_RESEND_API_KEY: "must-not-ship",
    VITE_PORKBUN_API_KEY: "must-not-ship", VITE_PORKBUN_SECRET_API_KEY: "must-not-ship", VITE_CRON_SECRET: "must-not-ship",
  });
  assert.equal(configured.VITE_ACCOUNT_AUTH_ENABLED, "true");
  assert.equal(configured.VITE_LOCAL_TEST_MODE, "false");
  assert.equal(configured.VITE_PUBLIC_SEARCH_MODE, "true");
  assert.equal(configured.DATABASE_URL, "postgresql://server-only-fixture", "Server environment remains available to Vercel tooling");
  for (const key of ["VITE_NEON_AUTH_URL", "VITE_SUPABASE_URL", "VITE_DATABASE_URL", "VITE_DATABASE_URL_UNPOOLED", "VITE_BETTER_AUTH_SECRET", "VITE_RESEND_API_KEY", "VITE_PORKBUN_API_KEY", "VITE_PORKBUN_SECRET_API_KEY", "VITE_CRON_SECRET"]) assert.equal(configured[key], "");
});

test("build environment retains matching canonicals and rejects configuration drift", () => {
  assert.equal(createVercelBuildEnvironment({ SAJDA_CANONICAL_ORIGIN: "https://sajda.example.test" }).VITE_SAJDA_CANONICAL_ORIGIN, "https://sajda.example.test");
  assert.throws(() => createVercelBuildEnvironment({ SAJDA_CANONICAL_ORIGIN: "https://sajda.example.test", VITE_SAJDA_CANONICAL_ORIGIN: "https://other.example.test" }), /must match/);
});

test("public bundle policy rejects external auth, JWT requests and exposed secrets without dumping source", () => {
  assert.doesNotThrow(() => assertPublicBrowserBundle('fetch("/api/account/saved-domains", { credentials: "same-origin", headers: { "X-Sajda-Account": owner } }); /* Neon Postgres; developer API example: Bearer API_KEY */'));
  for (const forbidden of [
    'import("@neondatabase/auth")', 'new BetterAuthVanillaAdapter()', 'jwtClient()',
    'fetch("https://tenant.neonauth.eu-central-1.aws.neon.tech/get-session")',
    'fetch("https://tenant.aws.neon.tech/get-session")', 'client.token()',
    'fetch("/api/auth/token")', 'VITE_NEON_AUTH_URL', 'VITE_BETTER_AUTH_SECRET',
    'VITE_DATABASE_URL', 'postgresql://secret-user:secret-password@db.example/test',
    'VITE_PORKBUN_API_KEY', 'VITE_PORKBUN_SECRET_API_KEY', 'VITE_CRON_SECRET',
    'pk1_' + 'a'.repeat(32), 'sk1_' + 'b'.repeat(32),
  ]) assert.throws(() => assertPublicBrowserBundle(forbidden), error => error instanceof Error && !error.message.includes(forbidden));
});

test("OpenAPI data stays a shared utility rather than an accidental Vercel function", async () => {
  await assert.rejects(access(new URL("../api/openapi-document.mjs", import.meta.url)), { code: "ENOENT" });
  const api = await readFile(new URL("../api/openapi.ts", import.meta.url), "utf8");
  const localServer = await readFile(new URL("../infra/local-server/full-app-server.mjs", import.meta.url), "utf8");
  assert.ok(api.includes("./_shared/openapi-document.mjs"));
  assert.ok(localServer.includes("../../api/_shared/openapi-document.mjs"));
  assert.equal(openApiDocument.openapi, "3.1.0");
  assert.ok(openApiDocument.paths["/api/v1/public/domains"]);
});
