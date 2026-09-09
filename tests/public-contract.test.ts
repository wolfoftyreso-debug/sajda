import test from "node:test";
import assert from "node:assert/strict";
import health from "../api/health";
import openapi from "../api/openapi";
import domains from "../api/v1/domains";
import publicDomains from "../api/v1/public/domains";
import { parseNamesApiRequest } from "../api/_shared/names-contract";

function response() {
  return {
    code: 200, body: undefined as unknown, headers: new Map<string, string | number>(),
    status(code: number) { this.code = code; return this; },
    setHeader(key: string, value: string | number) { this.headers.set(key.toLowerCase(), value); },
    json(body: unknown) { this.body = body; },
    end(body?: string) { this.body = body; },
  };
}
test("health fails closed without database configuration and does not expose credentials", async () => {
  const saved = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    const res = response();
    await health({ method: "GET" }, res);
    assert.equal(res.code, 503);
    assert.match(JSON.stringify(res.body), /database_not_configured/);
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.match(String(res.headers.get("x-request-id")), /^req_/);
  } finally { if (saved) process.env.DATABASE_URL = saved; }
});
test("health and OpenAPI reject writes", async () => {
  for (const handler of [health, openapi]) {
    const res = response();
    await handler({ method: "DELETE" }, res);
    assert.equal(res.code, 405);
  }
});
test("OpenAPI is usable JSON and advertises domain endpoints", () => {
  const res = response();
  openapi({ method: "GET" }, res);
  assert.equal(res.code, 200);
  assert.ok((res.body as { paths: Record<string, unknown> }).paths["/api/v1/public/domains"]);
});
test("protected API rejects unauthenticated and forged keys before any provider work", async () => {
  for (const authorization of [undefined, "Bearer sj_test_invalid", "Bearer arbitrary-user-id"]) {
    const res = response();
    await domains({ method: "POST", headers: { "content-type": "application/json", authorization }, body: {} }, res);
    assert.equal(res.code, 401);
    assert.equal(res.headers.has("access-control-allow-origin"), false);
  }
});
test("public API rejects credentials and malformed bodies, allows safe preflight", async () => {
  const res = response();
  await publicDomains({ method: "OPTIONS", headers: {} }, res);
  assert.equal(res.code, 204);
  assert.equal(res.headers.get("access-control-allow-origin"), "*");
  for (const body of ["{", "[]", { tlds: ["com"], count: 100 }, { tlds: ["com"], url: "http://127.0.0.1/" }]) {
    const bad = response();
    await publicDomains({ method: "POST", headers: { "content-type": "application/json" }, body }, bad);
    assert.equal(bad.code, 400);
  }
  const credentialed = response();
  await publicDomains({ method: "POST", headers: { "content-type": "application/json", authorization: "Bearer private" }, body: {} }, credentialed);
  assert.equal(credentialed.code, 400);
});
test("request contract normalizes domains and prevents duplicate/provider/size injection", () => {
  const parsed = parseNamesApiRequest({ domains: ["EXAMPLE.COM"], tlds: [".COM"], locale: "sv" });
  assert.deepEqual(parsed.domains, ["example.com"]);
  for (const body of [
    { tlds: ["com", "com"] }, { tlds: ["com"], query: "x".repeat(101) },
    { tlds: ["com"], domains: ["localhost"] }, { tlds: ["com"], domains: ["https://example.com"] },
    { tlds: ["com"], providers: ["http://localhost"] }, { tlds: ["com"], locale: {} },
  ]) assert.throws(() => parseNamesApiRequest(body));
});
