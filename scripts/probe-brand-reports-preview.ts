import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseEnv } from "node:util";
import { Pool } from "pg";
import { createBrandReportsStore } from "../api/_shared/brand-reports-store.js";
import type { BrandReportSaveInput } from "../shared/brand-reports.js";

// Deliberate opt-in. Read exported preview/production env files solely to fence
// this probe away from production. No provider, mail, auth session or real-user
// mutation. Every committed fixture has a new UUID and exact @example.test email.
assert.equal(process.env.SAJDA_BRAND_REPORTS_PREVIEW_TEST, "1", "Enable the explicit synthetic preview probe");
assert.ok(!process.env.VERCEL, "Run this probe locally, never inside a deployment");
const argumentsMap = new Map(process.argv.slice(2).map(argument => {
  const separator = argument.indexOf("=");
  assert.ok(separator > 0, "Use named --key=value arguments");
  return [argument.slice(0, separator), argument.slice(separator + 1)] as const;
}));
assert.equal(argumentsMap.size, 3, "Supply preview env, production env and the independently pinned preview hostname");
assert.ok([...argumentsMap.keys()].every(key => ["--preview-env", "--production-env", "--preview-host"].includes(key)));
const exportsRoot = path.resolve(".vercel");
async function exportedEnv(key: string) {
  const filename = path.resolve(argumentsMap.get(key) ?? "");
  assert.ok(filename.startsWith(`${exportsRoot}${path.sep}`), "Only repository-local .vercel exports are allowed");
  return parseEnv(await readFile(filename, "utf8"));
}
const preview = await exportedEnv("--preview-env"), production = await exportedEnv("--production-env");
assert.ok(preview.DATABASE_URL && production.DATABASE_URL, "Both exports must contain actual database connections");
const previewUrl = new URL(preview.DATABASE_URL), productionUrl = new URL(production.DATABASE_URL);
assert.ok(["postgres:", "postgresql:"].includes(previewUrl.protocol));
assert.ok(previewUrl.hostname.endsWith(".neon.tech"), "Only the reviewed Neon preview is allowed");
assert.equal(previewUrl.hostname, argumentsMap.get("--preview-host"), "The preview endpoint must match the explicit pin");
assert.notEqual(`${previewUrl.hostname.replace("-pooler.", ".")}${previewUrl.pathname}`,
  `${productionUrl.hostname.replace("-pooler.", ".")}${productionUrl.pathname}`, "Preview must not resolve to the production database endpoint");
assert.equal(preview.SAJDA_BRAND_REPORTS_ENABLED, "true", "The preview feature must be explicitly enabled");
previewUrl.searchParams.set("sslmode", "verify-full"); previewUrl.searchParams.delete("options");
const pool = new Pool({ connectionString: previewUrl.toString(), max: 4, connectionTimeoutMillis: 8000, query_timeout: 10000 });
const owner = randomUUID(), other = randomUUID(), id = randomUUID(), created: string[] = [];
const email = (account: string) => `brand-report-preview-${account}@example.test`;
let now = Date.now();
const store = createBrandReportsStore({ pool, environment: () => ({ VERCEL: "1", VERCEL_ENV: "preview" }), now: () => now });
const otherNamespace = createBrandReportsStore({ pool, environment: () => ({ VERCEL: "1", VERCEL_ENV: "development" }), now: () => now });
const observedAt = new Date(now).toISOString();
const original: BrandReportSaveInput = { id, requestKey: randomUUID(), expectedVersion: 0, title: "Synthetic brand report 🧭",
  assessment: { brand_name: "Example", identity_label: "example", primary_domain: "example.com", domains: ["example.com"],
    socials: [{ platform: "github", handle: "example" }], markets: ["SE"], observations: [
      { target_id: "domain:example.com", status: "reported_owned", reported_at: observedAt, source_url: "https://example.com/about" },
      { target_id: "social:github:example", status: "reported_authorized", reported_at: observedAt, source_url: "https://github.com/example" },
      { target_id: "market:SE", status: "reported_conflict", reported_at: observedAt, source_url: null },
    ] } };
let cleaned = false;
try {
  const ready = await pool.query(`SELECT to_regclass('sajda.brand_reports') IS NOT NULL
    AND to_regclass('sajda.brand_report_versions') IS NOT NULL AND to_regclass('sajda.brand_report_requests') IS NOT NULL AS ready`);
  assert.equal(ready.rows[0].ready, true, "Migration 0022 must already be reviewed and applied; this probe never migrates");
  for (const account of [owner, other]) {
    await pool.query(`INSERT INTO public.sajda_auth_user(id,name,email,"emailVerified")
      VALUES($1,'Synthetic brand report preview fixture',$2,true)`, [account, email(account)]);
    created.push(account);
  }
  await store.limit(owner);
  const first = await store.save(owner, original);
  assert.equal(first.version, 1); assert.deepEqual(first.assessment, original.assessment);
  assert.equal(first.result.index.verified_score, null);
  assert.deepEqual(await store.get(owner, { id }), first);
  assert.deepEqual(await store.list(other), []); assert.deepEqual(await otherNamespace.list(owner), []);
  await assert.rejects(() => store.get(other, { id }), { code: "report_not_found" });
  await assert.rejects(() => store.history(other, id), { code: "report_not_found" });
  await assert.rejects(() => store.save(other, { ...original, expectedVersion: 1 }), { code: "report_not_found" });
  await assert.rejects(() => otherNamespace.get(owner, { id }), { code: "report_not_found" });
  const edits = [{ ...original, requestKey: randomUUID(), expectedVersion: 1, title: "Concurrent editor A" },
    { ...original, requestKey: randomUUID(), expectedVersion: 1, title: "Concurrent editor B" }];
  const outcomes = await Promise.allSettled(edits.map(edit => store.save(owner, edit)));
  assert.equal(outcomes.filter(outcome => outcome.status === "fulfilled").length, 1);
  const losing = outcomes.find(outcome => outcome.status === "rejected");
  assert.equal(losing?.status === "rejected" ? losing.reason.code : undefined, "report_conflict");
  const winning = edits[outcomes.findIndex(outcome => outcome.status === "fulfilled")];
  assert.equal((await store.get(owner, { id })).title, winning.title);
  assert.deepEqual(await store.save(owner, original), first, "A late replay returns the immutable first revision, not current data");
  assert.equal((await store.get(owner, { id })).version, 2);
  await assert.rejects(() => store.save(owner, { ...original, title: "Request key alteration" }), { code: "report_request_conflict" });
  const identical = { ...original, requestKey: randomUUID(), expectedVersion: 2, title: "Identical concurrent retry" };
  const retries = await Promise.all([store.save(owner, identical), store.save(owner, identical)]);
  assert.deepEqual(retries[0], retries[1]); assert.equal(retries[0].version, 3);
  assert.equal((await store.history(owner, id)).length, 3);
  assert.equal((await store.get(owner, { id, version: 1 })).savedAt, first.savedAt);
  const snapshot = await pool.query(`SELECT assessment FROM sajda.brand_report_versions
    WHERE namespace='preview' AND owner_id=$1 AND report_id=$2 AND version=1`, [owner, id]);
  assert.deepEqual(snapshot.rows[0].assessment, original.assessment);
  await assert.rejects(() => pool.query(`UPDATE sajda.brand_report_versions SET title='Forbidden update'
    WHERE namespace='preview' AND owner_id=$1 AND report_id=$2 AND version=1`, [owner, id]));
  await assert.rejects(() => pool.query(`UPDATE sajda.brand_report_requests SET input_hash=$3
    WHERE namespace='preview' AND owner_id=$1 AND request_key=$2`, [owner, original.requestKey, "0".repeat(64)]));
  assert.equal((await store.get(owner, { id, version: 1 })).title, first.title);
  now += 31 * 24 * 60 * 60 * 1000;
  const aged = await store.get(owner, { id, version: 1 });
  assert.deepEqual(aged.assessment, original.assessment); assert.equal(aged.savedAt, first.savedAt);
  assert.equal(aged.result.index.reported_score, null); assert.equal(aged.result.counts.stale, 3);
  assert.ok(aged.result.targets.every(target => target.classification === "USER_SUPPLIED" && target.reported_at === observedAt));
  const empty = await store.save(other, { ...original, assessment: { ...original.assessment, observations: [] } });
  assert.equal(empty.version, 1); assert.ok(empty.result.targets.every(target => target.reported_status === "unknown"));
  await pool.query('UPDATE public.sajda_auth_user SET "emailVerified"=false WHERE id=$1 AND email=$2', [owner, email(owner)]);
  await assert.rejects(() => store.get(owner, { id }), { code: "invalid_session" });
  await assert.rejects(() => store.save(owner, original), { code: "invalid_session" });
} finally {
  try {
    for (const account of created) {
      await pool.query("DELETE FROM public.sajda_auth_user WHERE id=$1 AND email=$2", [account, email(account)]);
    }
    if (created.length) {
      const hashes = created.map(account => createHash("sha256").update(`brand-reports:preview:${account}`).digest("hex"));
      await pool.query("DELETE FROM sajda.function_rate_limits WHERE scope='brand-reports' AND subject_hash=ANY($1::text[])", [hashes]);
      assert.equal((await pool.query("SELECT count(*)::integer AS count FROM public.sajda_auth_user WHERE id=ANY($1::text[])", [created])).rows[0].count, 0);
      for (const table of ["brand_reports", "brand_report_versions", "brand_report_requests"]) {
        assert.equal((await pool.query(`SELECT count(*)::integer AS count FROM sajda.${table} WHERE owner_id=ANY($1::text[])`, [created])).rows[0].count, 0);
      }
    }
    cleaned = true;
  } finally { await pool.end(); }
}
assert.equal(cleaned, true);
console.info(JSON.stringify({ event: "brand_reports_preview_postgres_verified", concurrentWrites: true, immutableHistory: true,
  originalDatesPreserved: true, ownerAndNamespaceIsolation: true, retiredFixtures: created.length,
  remainingFixtures: 0, providerCalls: 0, emailCalls: 0, actualBrowserLoginTested: false }));
