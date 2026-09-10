import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { createAccountMembershipReader } from "../api/_shared/account-membership";

test("development PostgreSQL Apple grants: real constraints, membership, freshness and deletion isolation under rollback", {
  skip: process.env.SAJDA_NATIVE_COMMERCE_DB_TEST !== "1", timeout: 120_000,
}, async () => {
  assert.notEqual(process.env.VERCEL_ENV, "production");
  assert.equal(process.env.NEON_PROJECT_ID, "spring-paper-89655503");
  const url = new URL(process.env.DATABASE_URL_UNPOOLED ?? "");
  assert.ok(["postgres:", "postgresql:"].includes(url.protocol));
  assert.ok(url.hostname.endsWith(".neon.tech") && !url.hostname.includes("-pooler."));
  url.searchParams.set("sslmode", "verify-full");
  const pool = new Pool({ connectionString: url.toString(), max: 1, connectionTimeoutMillis: 8000, query_timeout: 8000 });
  const client = await pool.connect();
  const owner = randomUUID(), other = randomUUID(), token = randomUUID(), otherToken = randomUUID();
  let open = false;
  try {
    await client.query("BEGIN"); open = true;
    await client.query("SET LOCAL statement_timeout='8s'; SET LOCAL lock_timeout='2s'");
    for (const user of [owner, other]) await client.query('INSERT INTO public.sajda_auth_user(id,name,email,"emailVerified") VALUES($1,$2,$3,true)',
      [user, "Apple rollback fixture", `native-rollback-${user}@example.test`]);
    await client.query("INSERT INTO sajda.native_commerce_accounts(namespace,owner_id,app_account_token,environment) VALUES('development',$1,$2,'Sandbox'),('development',$3,$4,'Sandbox')",
      [owner, token, other, otherToken]);
    const rejected = async (sql: string, args: unknown[], code: string) => {
      await client.query("SAVEPOINT expected_rejection");
      await assert.rejects(() => client.query(sql, args), { code });
      await client.query("ROLLBACK TO SAVEPOINT expected_rejection");
      await client.query("RELEASE SAVEPOINT expected_rejection");
    };
    await rejected("INSERT INTO sajda.native_commerce_accounts(namespace,owner_id,app_account_token,environment) VALUES('production',$1,$2,'Sandbox')",
      [owner, randomUUID()], "23514");
    await rejected("INSERT INTO sajda.native_commerce_accounts(namespace,owner_id,app_account_token,environment) VALUES('preview',$1,$2,'Sandbox')",
      [other, token], "23505");
    await client.query(`INSERT INTO sajda.native_commerce_subscriptions(namespace,original_transaction_id,transaction_id,owner_id,product_id,plan,environment,status,valid_from,expires_at,auto_renew,signed_at)
      VALUES('development','10000000000000001','10000000000000002',$1,'test.sajda.trading.monthly','trading','Sandbox',1,now()-interval '1 hour',now()+interval '30 days',true,now())`, [owner]);
    const reader = createAccountMembershipReader({ query: async (sql, args) => (await client.query(sql, args)).rows, environment: () => ({ VERCEL_ENV: "development" }) });
    const membership = () => reader({ id: owner, emailVerified: true });
    assert.equal((await membership()).plan, "trading");
    assert.equal((await membership()).capabilities.swipe_undo, true);
    assert.equal((await reader({ id: other, emailVerified: true })).plan, "free");
    await rejected(`INSERT INTO sajda.native_commerce_subscriptions(namespace,original_transaction_id,transaction_id,owner_id,product_id,plan,environment,status,valid_from,expires_at,auto_renew,signed_at)
      VALUES('development','10000000000000001','10000000000000003',$1,'test.sajda.trading.monthly','trading','Sandbox',1,now()-interval '1 hour',now()+interval '30 days',true,now())`, [other], "23505");
    for (const [assignment, expected] of [
      ["status=4", "trading"],
      ["status=3", "free"],
      ["status=1,revoked_at=now()", "free"],
      ["revoked_at=NULL,expires_at=now()-interval '1 minute'", "free"],
      ["expires_at=now()+interval '30 days',verified_at=now()-interval '25 hours'", "free"],
      ["verified_at=now(),plan='premium'", "premium"],
      ["plan='basic'", "basic"],
    ]) {
      await client.query(`UPDATE sajda.native_commerce_subscriptions SET ${assignment} WHERE owner_id=$1`, [owner]);
      assert.equal((await membership()).plan, expected, assignment);
    }
    await client.query("DELETE FROM public.sajda_auth_user WHERE id=$1", [owner]);
    assert.equal((await client.query("SELECT count(*)::int n FROM sajda.native_commerce_accounts WHERE app_account_token=$1", [token])).rows[0].n, 0);
    assert.equal((await client.query("SELECT count(*)::int n FROM sajda.native_commerce_subscriptions WHERE owner_id=$1", [owner])).rows[0].n, 0);
    assert.equal((await client.query("SELECT count(*)::int n FROM sajda.native_commerce_accounts WHERE owner_id=$1", [other])).rows[0].n, 1);
    await rejected("INSERT INTO sajda.native_commerce_accounts(namespace,owner_id,app_account_token,environment) VALUES('development',$1,$2,'Sandbox')",
      [owner, randomUUID()], "23503");
    await client.query("ROLLBACK"); open = false;
    assert.equal((await client.query("SELECT count(*)::int n FROM public.sajda_auth_user WHERE id=ANY($1::text[])", [[owner, other]])).rows[0].n, 0);
    console.info(JSON.stringify({ event: "native_commerce_postgres_rollback_verified", constraints: true, membership: true, staleGrantDenied: true,
      cascade: true, actualAppleCalls: 0, persistedFixtures: 0 }));
  } finally {
    if (open) await client.query("ROLLBACK").catch(() => undefined);
    client.release(); await pool.end();
  }
});
