import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { createAccountDeletionService, type DeletionClient } from "../api/_shared/account-deletion.js";

test("development PostgreSQL deletion: actual constraints, owner isolation and rollback with no external calls", {
  skip: process.env.SAJDA_DELETION_DB_TEST !== "1", timeout: 120_000,
}, async () => {
  assert.notEqual(process.env.VERCEL_ENV, "production");
  assert.equal(process.env.NEON_PROJECT_ID, "spring-paper-89655503", "Only reviewed development Neon is allowed");
  const url = new URL(process.env.DATABASE_URL_UNPOOLED ?? "");
  assert.ok(["postgres:", "postgresql:"].includes(url.protocol));
  assert.ok(url.hostname.endsWith(".neon.tech") && !url.hostname.includes("-pooler."));
  url.searchParams.set("sslmode", "verify-full");
  const pool = new Pool({ connectionString: url.toString(), max: 1, connectionTimeoutMillis: 8000, query_timeout: 8000 });
  const client = await pool.connect();
  const owner = randomUUID(), other = randomUUID(), session = randomUUID(), campaign = randomUUID(), run = randomUUID();
  let open = false, code = "", providerCalls = 0, mailCalls = 0;
  const id = randomUUID(), hash = (value: string) => createHash("sha256").update(value).digest("hex");
  try {
    await client.query("BEGIN"); open = true;
    await client.query("SET LOCAL statement_timeout='8s'; SET LOCAL lock_timeout='2s'");
    assert.equal((await client.query("SELECT to_regclass('sajda.account_deletion_challenges') IS NOT NULL AS ready")).rows[0].ready, true,
      "Migration 0015 must already be reviewed and applied; this test never applies schema changes");
    for (const user of [owner, other]) {
      await client.query(`INSERT INTO public.sajda_auth_user(id,name,email,"emailVerified") VALUES($1,'Deletion rollback fixture',$2,true)`, [user, `deletion-rollback-${user}@example.test`]);
      await client.query("INSERT INTO sajda.saved_domains(user_id,domain) VALUES($1,'example.test')", [user]);
    }
    await client.query(`INSERT INTO public.sajda_auth_session(id,token,"userId","expiresAt") VALUES($1,$2,$3,clock_timestamp()+interval '1 hour')`, [session, randomUUID(), owner]);
    await client.query(`INSERT INTO public.sajda_auth_account(id,"accountId","providerId","userId",password) VALUES($1,$2,'credential',$2,'fixture-hash')`, [randomUUID(), owner]);
    await client.query(`INSERT INTO public.sajda_auth_verification(id,identifier,value,"expiresAt") VALUES($1,$2,$3,clock_timestamp()+interval '1 hour')`, [randomUUID(), `reset-password:${randomUUID()}`, owner]);
    await client.query(`INSERT INTO sajda.native_sessions(id,token_hash,user_id,session_id,environment,expires_at) VALUES($1,$2,$3,$4,'development',clock_timestamp()+interval '1 hour')`, [randomUUID(), hash(randomUUID()), owner, session]);
    await client.query(`INSERT INTO sajda.account_entitlements(user_id,capability,grant_source,source_reference,expires_at) VALUES($1,'swipe_undo','operator','rollback',clock_timestamp()+interval '1 hour')`, [owner]);
    await client.query(`INSERT INTO sajda.lost_domain_campaigns(id,namespace,owner_id) VALUES($1,'development',$2)`, [campaign, owner]);
    await client.query(`INSERT INTO sajda.lost_domain_runs(id,namespace,owner_id,campaign_id,request_key,status) VALUES($1,'development',$2,$3,$4,'cancelled')`, [run, owner, campaign, randomUUID()]);
    await client.query(`INSERT INTO sajda.commerce_customers(namespace,owner_id,customer_key) VALUES('development',$1,$2)`, [owner, randomUUID()]);
    await client.query(`INSERT INTO sajda.developer_api_quotas(namespace,subject_hash,bucket,window_started_at,request_count) VALUES('development',$1,'management',clock_timestamp(),1)`, [hash(`account:${owner}`)]);
    // Production service transaction boundaries become savepoints under a single
    // test-owned rollback. No real account, mail, billing or retained fixture.
    const adapter: DeletionClient = { release() {}, async query(sql, args) {
      if (sql === "BEGIN") return client.query("SAVEPOINT deletion_service");
      if (sql === "COMMIT") return client.query("RELEASE SAVEPOINT deletion_service");
      if (sql === "ROLLBACK") { await client.query("ROLLBACK TO SAVEPOINT deletion_service"); return client.query("RELEASE SAVEPOINT deletion_service"); }
      return client.query(sql, args);
    } };
    const service = createAccountDeletionService({ pool: { connect: async () => adapter }, secret: () => "rollback-secret-only".repeat(3),
      sendEmail: async message => { mailCalls++; code = message.code; assert.equal(message.to, `deletion-rollback-${owner}@example.test`); },
      closeBilling: async (_owner, customers) => { providerCalls++; assert.equal(_owner, owner); assert.deepEqual(customers, []); return "none"; } });
    await service.execute({ id: owner, emailVerified: true }, { action: "request", requestId: id, language: "en" });
    await assert.rejects(() => service.execute({ id: owner, emailVerified: true }, { action: "confirm", requestId: id,
      code: code === "00000000" ? "11111111" : "00000000", confirmation: "DELETE" }), { code: "deletion_code_invalid" });
    assert.equal((await client.query("SELECT attempts FROM sajda.account_deletion_challenges WHERE owner_id=$1", [owner])).rows[0].attempts, 1);
    const result = await service.execute({ id: owner, emailVerified: true }, { action: "confirm", requestId: id, code, confirmation: "DELETE" });
    assert.equal(result.status, "deleted");
    for (const [table, column] of [["public.sajda_auth_user", "id"], ["public.sajda_auth_session", '"userId"'],
      ["public.sajda_auth_account", '"userId"'], ["public.sajda_auth_verification", "value"],
      ["sajda.saved_domains", "user_id"], ["sajda.native_sessions", "user_id"], ["sajda.account_entitlements", "user_id"],
      ["sajda.lost_domain_campaigns", "owner_id"], ["sajda.lost_domain_runs", "owner_id"],
      ["sajda.commerce_customers", "owner_id"], ["sajda.account_deletion_challenges", "owner_id"]]) {
      assert.equal((await client.query(`SELECT count(*)::int AS n FROM ${table} WHERE ${column}=$1`, [owner])).rows[0].n, 0, table);
    }
    assert.equal((await client.query("SELECT count(*)::int AS n FROM sajda.saved_domains WHERE user_id=$1", [other])).rows[0].n, 1);
    assert.equal((await client.query("SELECT count(*)::int AS n FROM sajda.developer_api_quotas WHERE subject_hash=$1", [hash(`account:${owner}`)])).rows[0].n, 0);
    await client.query("SAVEPOINT deleted_owner_write");
    await assert.rejects(() => client.query("INSERT INTO sajda.saved_domains(user_id,domain) VALUES($1,'must-not-return.test')", [owner]), { code: "23503" });
    await client.query("ROLLBACK TO SAVEPOINT deleted_owner_write");
    await client.query("ROLLBACK"); open = false;
    assert.equal((await client.query("SELECT count(*)::int AS n FROM public.sajda_auth_user WHERE id=ANY($1::text[])", [[owner, other]])).rows[0].n, 0);
    console.info(JSON.stringify({ event: "account_deletion_postgres_rollback_verified", fixtureMailCalls: mailCalls, fixtureBillingCalls: providerCalls,
      actualExternalCalls: 0, persistedFixtures: 0, verifiedPostDeleteWriteRejected: true }));
  } finally {
    if (open) await client.query("ROLLBACK").catch(() => undefined);
    client.release(); await pool.end();
  }
});
