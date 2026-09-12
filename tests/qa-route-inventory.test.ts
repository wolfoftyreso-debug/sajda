import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import deletion from "../api/account/deletion.js";
import nativeCommerce from "../api/native/commerce.js";
import nativeCommerceCron from "../api/cron/native-commerce.js";
import appStoreWebhook from "../api/app-store-webhook.js";

const source = readFileSync(new URL("../scripts/serve-vercel-local.ts", import.meta.url), "utf8");
const imports = new Map([...source.matchAll(/^import\s+(\w+)\s+from\s+"\.\.\/api\/([^";]+)";/gmu)]
  .map(match => [match[1], `/api/${match[2]}`]));
const entries = [...source.matchAll(/\[\s*"(\/api\/[^"\n]+)"\s*,\s*(\w+)\s*\]/gu)]
  .map(match => [match[1], match[2]] as const);
const routes = new Map(entries);

function apiPaths(directory = new URL("../api/", import.meta.url), prefix = "/api/"): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.name.startsWith("_")) return [];
    if (entry.isDirectory()) return apiPaths(new URL(`${entry.name}/`, directory), `${prefix}${entry.name}/`);
    return entry.isFile() && entry.name.endsWith(".ts") ? [`${prefix}${entry.name.slice(0, -3)}`] : [];
  });
}

test("loopback QA explicitly maps every public API file to its actual production handler", () => {
  assert.equal(entries.length, routes.size, "Duplicate route declarations must not silently shadow another handler");
  const expected = apiPaths().sort();
  assert.deepEqual([...routes.keys()].sort(), expected,
    "New API files need explicit QA wiring; unknown API paths must never become SPA success pages");
  const canonicalAliases = new Map([
    ["/api/v1/names", "/api/v1/domains"], ["/api/v1/public/names", "/api/v1/public/domains"],
  ]);
  for (const path of expected) {
    assert.equal(imports.get(routes.get(path)!), canonicalAliases.get(path) ?? path,
      `${path} must invoke its own handler, not a public fallback or a weaker auth boundary`);
  }
  assert.match(source, /path\.startsWith\("\/api\/auth\/"\)\s*\?\s*auth as Handler\s*:\s*handlers\.get\(path\)/u,
    "Auth action paths and /api/auth?authAction= rewrites must share the real auth transport");
  assert.ok(source.indexOf('if (path.startsWith("/api/"))') < source.indexOf("const shellRoute"));
  assert.match(source, /server\.listen\(port, "127\.0\.0\.1"/u, "QA must remain loopback-only");
  assert.match(source, /if \(process\.env\.BETTER_AUTH_URL === undefined\) process\.env\.BETTER_AUTH_URL = `http:\/\/127\.0\.0\.1:\$\{port\}`/u,
    "Only a missing local origin may default; explicit deployment configuration is never overwritten");
  assert.ok(source.indexOf('throw new Error("Invalid QA port")') < source.indexOf("if (process.env.BETTER_AUTH_URL === undefined)"));
});

function response() {
  return { code: 200, body: undefined as unknown, headers: new Map<string, string | number>(),
    setHeader(name: string, value: string | number) { this.headers.set(name.toLowerCase(), value); },
    status(code: number) { this.code = code; return this; }, json(value: unknown) { this.body = value; } };
}

test("previously missing QA handlers keep their negative authentication and method boundaries without provider calls", async () => {
  const priorNative = process.env.SAJDA_NATIVE_ENABLED;
  process.env.SAJDA_NATIVE_ENABLED = "true";
  try {
    for (const [handler, method, body, expectedStatus, expectedCode] of [
      [deletion, "GET", undefined, 405, "method_not_allowed"],
      [deletion, "POST", { action: "request" }, 401, "authentication_required"],
      [nativeCommerce, "GET", undefined, 405, "method_not_allowed"],
      [nativeCommerce, "POST", { action: "catalog", accountId: "forged" }, 401, "authentication_required"],
      [nativeCommerceCron, "POST", undefined, 405, "method_not_allowed"],
      [nativeCommerceCron, "GET", undefined, 401, "authentication_required"],
      [appStoreWebhook, "GET", undefined, 405, "method_not_allowed"],
      [appStoreWebhook, "POST", { signedPayload: "invalid" }, 400, "invalid_request"],
    ] as const) {
      const result = response();
      await handler({ method, body, headers: { "content-type": "application/json" } }, result);
      assert.equal(result.code, expectedStatus);
      assert.equal((result.body as { code: string }).code, expectedCode);
      assert.match(String(result.headers.get("cache-control")), /no-store/u);
      assert.match(String(result.headers.get("x-robots-tag")), /noindex/u);
      assert.equal(result.headers.has("access-control-allow-origin"), false);
      assert.doesNotMatch(JSON.stringify(result.body), /postgres|token_hash|DATABASE_URL/u);
    }
  } finally {
    if (priorNative === undefined) delete process.env.SAJDA_NATIVE_ENABLED;
    else process.env.SAJDA_NATIVE_ENABLED = priorNative;
  }
});
