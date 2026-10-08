import assert from "node:assert/strict";
import test from "node:test";
import { readdir, readFile } from "node:fs/promises";
import { createHealthHandler, storageReadinessParameters, storageReadinessSql } from "../api/health";
import { DEVELOPER_API_SCOPES } from "../shared/developer-scopes";

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

test("readiness inventory covers every migrated application relation, including optional product schema", async () => {
  const directory = new URL("../db/migrations/", import.meta.url);
  const names = (await readdir(directory)).filter(name => /^\d{4}_[a-z0-9_]+\.sql$/u.test(name));
  const relations = new Set<string>();
  for (const name of names) {
    const sql = await readFile(new URL(name, directory), "utf8");
    for (const match of sql.matchAll(/\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:TABLE|VIEW)\s+(?:IF\s+NOT\s+EXISTS\s+)?((?:public|sajda)\.[a-z_]+)/giu)) {
      relations.add(match[1]);
    }
  }
  assert.ok(relations.size >= 30, "The check must cover the actual migration catalogue");
  for (const relation of relations) assert.ok(storageReadinessSql.includes(`'${relation}'`), `${relation} is missing from structural readiness`);
});

test("Trading add-on readiness requires recovery state without implying provider or entitlement verification", () => {
  for (const column of ["namespace", "owner_id", "request_key", "cancel_request_key", "subscription_id", "schedule_id",
    "from_plan", "target_plan", "from_price_id", "target_price_id", "period_start", "effective_at", "request_body", "state", "created_at", "updated_at"]) {
    assert.ok(storageReadinessSql.includes(`('commerce_addon_changes','${column}')`), column);
  }
  assert.doesNotMatch(storageReadinessSql, /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP)\b/u);
});

test("optional name-project readiness follows the route flag without interpolating environment input into SQL", () => {
  for (const value of [undefined, "false", "1", "TRUE", "true; DROP TABLE example"]) {
    assert.equal(storageReadinessParameters({ SAJDA_NAME_PROJECTS_ENABLED: value })[0], false);
  }
  assert.equal(storageReadinessParameters({ SAJDA_NAME_PROJECTS_ENABLED: "true" })[0], true);
  assert.match(storageReadinessSql, /AND \(NOT \$1::boolean OR \(/u);
  for (const column of ["namespace", "owner_id", "id", "payload", "version", "last_input_hash", "created_at", "updated_at"]) {
    assert.ok(storageReadinessSql.includes(`('name_projects','${column}')`), column);
  }
  for (const column of ["namespace", "owner_id", "project_id", "domain", "position"]) {
    assert.ok(storageReadinessSql.includes(`('name_project_domains','${column}')`), column);
  }
});

test("readiness rejects old or unvalidated API-key scope constraints without writing a trial key", () => {
  const [, scopes] = storageReadinessParameters({});
  assert.deepEqual(scopes, [...DEVELOPER_API_SCOPES]);
  assert.notEqual(scopes, DEVELOPER_API_SCOPES);
  assert.match(storageReadinessSql, /scopes_constraint\.convalidated/u);
  assert.match(storageReadinessSql, /scopes_constraint\.conname='developer_api_keys_scopes_check'/u);
  assert.match(storageReadinessSql, /unnest\(\$2::text\[\]\)/u);
  assert.match(storageReadinessSql, /quote_literal\(required\.scope\)/u);
  assert.doesNotMatch(storageReadinessSql, /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP)\b/u);
});

test("optional report readiness checks its schema only after exact feature opt-in", () => {
  for (const value of [undefined, "false", "1", "TRUE", "true; DROP TABLE example"]) {
    assert.equal(storageReadinessParameters({ SAJDA_BRAND_REPORTS_ENABLED: value })[2], false);
  }
  assert.equal(storageReadinessParameters({ SAJDA_BRAND_REPORTS_ENABLED: "true" })[2], true);
  assert.match(storageReadinessSql, /AND \(NOT \$3::boolean OR \(/u);
  for (const table of ["brand_reports", "brand_report_versions", "brand_report_requests"]) {
    assert.ok(storageReadinessSql.includes(`'sajda.${table}'`));
    for (const column of ["namespace", "owner_id", "version"]) {
      assert.ok(storageReadinessSql.includes(`('${table}','${column}')`));
    }
  }
  for (const [table, column] of [["brand_report_versions", "assessment"], ["brand_report_versions", "saved_at"],
    ["brand_report_requests", "request_key"], ["brand_report_requests", "input_hash"]]) {
    assert.ok(storageReadinessSql.includes(`('${table}','${column}')`));
  }
});

test("registry archive readiness requires both exact feature flags", () => {
  for (const reports of [undefined, "true", "TRUE"]) for (const checks of [undefined, "true", "TRUE"]) {
    assert.equal(storageReadinessParameters({ SAJDA_BRAND_REPORTS_ENABLED: reports, SAJDA_BRAND_CHECKS_ENABLED: checks })[3], reports === "true" && checks === "true");
  }
  assert.match(storageReadinessSql, /AND \(NOT \$4::boolean OR \(/u);
  assert.match(storageReadinessSql, /sajda\.brand_check_runs/u);
  for (const column of ["report_version", "targets", "lease_expires_at", "entries", "failure_code"]) assert.ok(storageReadinessSql.includes(`'${column}'`));
});

test("registry monitor readiness requires all three exact opt-ins and checks durable state without writes", () => {
  for (const reports of [undefined, "true", "TRUE"]) for (const checks of [undefined, "true", "TRUE"])
    for (const monitors of [undefined, "true", "TRUE"]) {
      assert.equal(storageReadinessParameters({ SAJDA_BRAND_REPORTS_ENABLED: reports,
        SAJDA_BRAND_CHECKS_ENABLED: checks, SAJDA_BRAND_MONITORS_ENABLED: monitors })[4],
      reports === "true" && checks === "true" && monitors === "true");
    }
  assert.match(storageReadinessSql, /AND \(NOT \$5::boolean OR \(/u);
  for (const table of ["brand_monitors", "brand_monitor_alerts", "brand_monitor_requests", "brand_monitor_worker_leases"]) {
    assert.ok(storageReadinessSql.includes(`'sajda.${table}'`));
    assert.ok(storageReadinessSql.includes(`('${table}','namespace')`));
  }
  assert.doesNotMatch(storageReadinessSql, /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP)\b/u);
});
