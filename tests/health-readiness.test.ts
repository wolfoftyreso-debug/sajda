import assert from "node:assert/strict";
import test from "node:test";
import { createHealthHandler, storageReadinessSql } from "../api/health";

function response() {
  return { code: 0, body: undefined as unknown, headers: new Map<string, string | number>(),
    setHeader(name: string, value: string | number) { this.headers.set(name, value); },
    status(code: number) { this.code = code; return this; }, json(value: unknown) { this.body = value; } };
}
test("reachable empty database cannot pass application readiness", async () => {
  const res = response();
  await createHealthHandler({ configured: () => true, ready: async () => false })({ method: "GET" }, res);
  assert.equal(res.code, 503);
  assert.equal((res.body as { code: string }).code, "storage_not_ready");
  assert.doesNotMatch(JSON.stringify(res.body), /sajda_auth|schema_migrations|postgresql|SELECT/u);
});
test("readiness requires schema evidence and rejects dependency failures without details", async () => {
  const healthy = response();
  await createHealthHandler({ configured: () => true, ready: async () => true })({ method: "GET" }, healthy);
  assert.equal(healthy.code, 200);
  const failed = response();
  await createHealthHandler({ configured: () => true, ready: async () => { throw new Error("private provider detail"); } })({ method: "GET" }, failed);
  assert.equal(failed.code, 503);
  assert.doesNotMatch(JSON.stringify(failed.body), /private provider detail/u);
});

test("storage readiness includes temporal worker columns and independent quote storage", () => {
  for (const required of ["sajda.lost_domain_quote_requests", "sajda.lost_domain_quote_observations",
    "sajda.lost_domain_work_items", "sajda.lost_domain_provider_backoff", "verification_max_rounds",
    "verification_gap_seconds", "run_lifetime_seconds", "assessment_id", "request_key"]) {
    assert.ok(storageReadinessSql.includes(required), required);
  }
  assert.match(storageReadinessSql, /information_schema\.columns/u);
  assert.match(storageReadinessSql, /actual\.table_schema='sajda'/u);
  assert.doesNotMatch(storageReadinessSql, /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP)\b/u);
});

test("readiness includes account, native commerce and scenario storage before advertising a ready release", () => {
  for (const name of ["trading_scenarios", "developer_api_keys", "developer_api_quotas",
    "native_authorization_codes", "native_sessions", "account_deletion_challenges",
    "native_commerce_accounts", "native_commerce_subscriptions", "native_commerce_events"]) {
    assert.ok(storageReadinessSql.includes("'sajda."+name+"'"), name);
  }
  for (const column of ["namespace","owner_id","payload","version","last_input_hash"]) {
    assert.ok(storageReadinessSql.includes("('trading_scenarios','"+column+"')"), column);
  }
  assert.doesNotMatch(storageReadinessSql, /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP)\b/u);
});
