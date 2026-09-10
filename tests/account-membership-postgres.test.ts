import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { AccountAccessError } from "../api/_shared/account-auth";
import { createAccountMembershipReader } from "../api/_shared/account-membership";

test("real development PostgreSQL: unified membership, view parity and downgrade roll back completely", {
  skip: process.env.SAJDA_MEMBERSHIP_DB_TEST !== "1", timeout: 120_000,
}, async () => {
  assert.notEqual(process.env.VERCEL_ENV, "production", "Production testing is forbidden");
  assert.equal(process.env.NEON_PROJECT_ID, "spring-paper-89655503", "Only reviewed development Neon is allowed");
  const url = new URL(process.env.DATABASE_URL_UNPOOLED ?? "");
  assert.ok(["postgres:", "postgresql:"].includes(url.protocol));
  assert.ok(url.hostname.endsWith(".neon.tech") && !url.hostname.includes("-pooler."));
  assert.ok(url.username && url.password && url.pathname.length > 1);
  url.searchParams.set("sslmode", "verify-full");
  const pool = new Pool({ connectionString: url.toString(), max: 1, connectionTimeoutMillis: 8_000, query_timeout: 8_000 });
  const client = await pool.connect();
  const id = randomUUID(), other = randomUUID();
  let open = false;
  let checks = 0;
  try {
    await client.query("BEGIN"); open = true;
    await client.query("SET LOCAL statement_timeout='8s'; SET LOCAL lock_timeout='2s'; SET LOCAL idle_in_transaction_session_timeout='30s'");
    for (const owner of [id, other]) await client.query(`INSERT INTO public.sajda_auth_user(id,name,email,"emailVerified")
      VALUES($1,'Membership QA rollback',$2,true)`, [owner, `membership-rollback-${owner}@sajda.test`]);
    const query = async (text: string, values: unknown[]) => (await client.query(text, values)).rows;
    const readers = Object.fromEntries(["development", "preview", "production"].map(namespace => [namespace,
      createAccountMembershipReader({ query, environment: () => ({ VERCEL: "1", VERCEL_ENV: namespace }) })]));
    const account = { id, emailVerified: true };
    async function expectPlan(namespace: string, plan: "free" | "premium" | "trading", source?: string) {
      const result = await readers[namespace](account); checks++;
      assert.equal(result.plan, plan);
      assert.equal(result.capabilities.swipe_undo, plan === "premium" || plan === "trading");
      assert.equal(result.capabilities.trading, plan === "trading");
      assert.equal(result.capabilities.save_domains, true);
      if (source) assert.equal(result.accessSource, source);
      const access = await client.query(`SELECT EXISTS(SELECT 1 FROM sajda.lost_domain_effective_access a
        JOIN public.sajda_auth_user u ON u.id=a.owner_id WHERE a.owner_id=$1 AND a.namespace=$2
        AND a.revoked_at IS NULL AND a.valid_from<=statement_timestamp() AND a.expires_at>statement_timestamp()
        AND u."emailVerified"=true) AS allowed`, [id, namespace]);
      assert.equal(result.capabilities.trading, access.rows[0].allowed); checks++;
      return result;
    }
    await expectPlan("preview", "free", "free");
    await client.query(`INSERT INTO sajda.account_entitlements(user_id,capability,grant_source,source_reference,valid_from,expires_at)
      VALUES($1,'swipe_undo','operator','rollback-membership',clock_timestamp()-interval '1 second',clock_timestamp()+interval '1 hour')`, [id]);
    await expectPlan("preview", "premium", "operator");
    await client.query("UPDATE sajda.account_entitlements SET grant_source='billing' WHERE user_id=$1", [id]);
    await expectPlan("preview", "premium", "operator");
    await client.query(`INSERT INTO sajda.lost_domain_access(owner_id,grant_source,source_reference,valid_from,expires_at)
      VALUES($1,'operator','rollback-membership',clock_timestamp()-interval '1 second',clock_timestamp()+interval '30 minutes')`, [id]);
    const trading = await expectPlan("preview", "trading", "operator");
    const expiry = await client.query("SELECT expires_at FROM sajda.lost_domain_access WHERE owner_id=$1", [id]);
    assert.equal(trading.expiresAt, expiry.rows[0].expires_at.toISOString()); checks++;
    assert.equal((await readers.preview({ id: other, emailVerified: true })).plan, "free"); checks++;
    await client.query("UPDATE sajda.lost_domain_access SET revoked_at=clock_timestamp() WHERE owner_id=$1", [id]);
    await expectPlan("preview", "premium");
    await client.query("UPDATE sajda.account_entitlements SET revoked_at=clock_timestamp() WHERE user_id=$1", [id]);
    await expectPlan("preview", "free");
    await client.query(`UPDATE sajda.lost_domain_access SET revoked_at=NULL,
      valid_from=clock_timestamp()+interval '1 minute',expires_at=clock_timestamp()+interval '30 minutes' WHERE owner_id=$1`, [id]);
    await expectPlan("preview", "free");
    await client.query(`UPDATE sajda.lost_domain_access SET valid_from=clock_timestamp()-interval '30 minutes',
      expires_at=clock_timestamp()-interval '1 second' WHERE owner_id=$1`, [id]);
    await expectPlan("preview", "free");
    await client.query(`INSERT INTO sajda.commerce_customers(namespace,owner_id,customer_key,livemode)
      VALUES('preview',$1,$2::uuid,false)`, [id, randomUUID()]);
    await client.query(`INSERT INTO sajda.commerce_access(namespace,owner_id,subscription_id,price_id,invoice_id,livemode,valid_from,expires_at)
      VALUES('preview',$1,'sub_RollbackMembership','price_RollbackMembership','in_RollbackMembership',false,
      clock_timestamp()-interval '1 second',clock_timestamp()+interval '1 day')`, [id]);
    await expectPlan("preview", "trading", "subscription");
    await expectPlan("development", "free");
    await expectPlan("production", "free");
    await client.query("UPDATE public.sajda_auth_user SET \"emailVerified\"=false WHERE id=$1", [id]);
    await assert.rejects(() => readers.preview(account), error => error instanceof AccountAccessError && error.code === "email_verification_required"); checks++;
    await client.query("UPDATE public.sajda_auth_user SET \"emailVerified\"=true WHERE id=$1", [id]);
    await client.query("UPDATE sajda.commerce_access SET revoked_at=clock_timestamp() WHERE namespace='preview' AND owner_id=$1", [id]);
    await expectPlan("preview", "free");
    await client.query(`UPDATE sajda.account_entitlements SET revoked_at=NULL,
      valid_from=clock_timestamp()-interval '1 hour',expires_at=clock_timestamp()-interval '1 second' WHERE user_id=$1`, [id]);
    await expectPlan("preview", "free");
    await client.query("ROLLBACK"); open = false;
    const remaining = await client.query("SELECT count(*)::int AS n FROM public.sajda_auth_user WHERE id=ANY($1::text[])", [[id, other]]);
    assert.equal(remaining.rows[0].n, 0); checks++;
    console.info(JSON.stringify({ event: "membership_postgres_rollback_verified", checks, persistedFixtures: 0, providerCalls: 0 }));
  } finally {
    if (open) await client.query("ROLLBACK").catch(() => undefined);
    client.release(); await pool.end();
  }
});
