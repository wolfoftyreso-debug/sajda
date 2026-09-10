import assert from "node:assert/strict";
import { runtimeFetch } from "./runtime-http.mjs";

const origin = process.env.SAJDA_TEST_ORIGIN;
if (!origin || new URL(origin).protocol !== "https:") throw new Error("Set the reviewed HTTPS preview origin.");
// Negative requests only: no cookie, native credential, valid deletion proof,
// provider signature or cron secret. No account, billing or email operation.
const cases = [
  ["/api/account/deletion", "GET", undefined, 405],
  ["/api/account/deletion", "POST", { action: "request", requestId: "10000000-0000-4000-8000-000000000001", language: "en" }, 401],
  ["/api/native/commerce", "GET", undefined, 405],
  ["/api/native/commerce", "POST", { action: "catalog", accountId: "synthetic-not-a-user" }, 401],
  ["/api/native/account", "POST", { path: "/api/account/deletion", method: "POST", accountId: "synthetic-not-a-user", body: {} }, 401],
  ["/api/app-store-webhook", "GET", undefined, 405],
  ["/api/app-store-webhook", "POST", {}, 400],
  ["/api/cron/native-commerce", "GET", undefined, 401],
];
for (const [path, method, body, status] of cases) {
  const response = await runtimeFetch(new URL(path, origin), { method,
    headers: { "Content-Type": "application/json", Origin: origin },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  assert.equal(response.status, status, path);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  assert.match(response.headers.get("x-robots-tag") ?? "", /noindex/);
  assert.equal(response.headers.get("access-control-allow-origin"), null);
  const data = await response.json();
  assert.ok(typeof data.code === "string" && typeof data.requestId === "string", path);
  assert.ok(!data.accountId && !data.signedTransaction && !data.appAccountToken, path);
  console.info(JSON.stringify({ path, method, status, code: data.code }));
}
console.info(JSON.stringify({ checks: cases.length, actualUserMutations: 0, providerCalls: 0,
  note: "Deployed negative HTTP boundaries only; not an Apple sandbox purchase or delivered email." }));
