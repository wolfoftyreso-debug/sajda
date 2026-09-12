import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { createTradingScenariosStore, type TradingScenariosClient } from "../api/_shared/trading-scenarios-store.js";
import type { TradingScenarioInput } from "../shared/trading-scenarios.js";

// Explicit, separate test-only URL and hostname pin. Never fall back to runtime
// DATABASE_URL/DATABASE_URL_UNPOOLED or execute automatically in a deployment.
const enabled = process.env.SAJDA_SCENARIOS_DB_TEST === "1"
  && Boolean(process.env.SAJDA_SCENARIOS_TEST_DATABASE_URL?.trim())
  && Boolean(process.env.SAJDA_SCENARIOS_TEST_DATABASE_HOST?.trim());
test("opt-in development PostgreSQL: scenario ownership, CAS, cap, constraints and deletion cascade roll back", {
  skip: !enabled, timeout: 120_000,
}, async () => {
  assert.ok(!process.env.VERCEL, "Never run this database fixture inside a Vercel deployment");
  assert.ok(!process.env.VERCEL_ENV || process.env.VERCEL_ENV === "development", "Preview and production connections are forbidden");
  assert.equal(process.env.NEON_PROJECT_ID, "spring-paper-89655503", "Only reviewed development Neon is allowed");
  const url = new URL(process.env.SAJDA_SCENARIOS_TEST_DATABASE_URL!);
  assert.ok(["postgres:", "postgresql:"].includes(url.protocol));
  assert.equal(url.hostname, process.env.SAJDA_SCENARIOS_TEST_DATABASE_HOST, "Pin the explicitly designated test database endpoint");
  assert.ok(url.hostname.endsWith(".neon.tech") && !url.hostname.includes("-pooler."));
  assert.ok(url.username && url.password && url.pathname.length > 1);
  url.searchParams.set("sslmode", "verify-full"); url.searchParams.delete("options");
  const pool = new Pool({ connectionString: url.toString(), max: 1, connectionTimeoutMillis: 8000, query_timeout: 8000 });
  const client = await pool.connect();
  const owner = randomUUID(), other = randomUUID(), id = randomUUID();
  const fixtureOwners = [owner, other];
  const raw: TradingScenarioInput = { id, expectedVersion: 0, domain: "example.com", title: "Rollback scenario",
    thesis: "Fixture hypothesis only", catalyst: "Fixture catalyst", invalidation: "Fixture invalidation", reviewOn: "2030-01-01",
    stance: "neutral", analysisMode: "balanced", assumptions: { acquisitionUsd: 100, annualRenewalUsd: 12, otherCostsUsd: 0,
      holdingMonths: 12, sellingFeePercent: 15, saleProbabilityPercent: 20, bearSaleUsd: 100, baseSaleUsd: 500, bullSaleUsd: 1000 } };
  const { expectedVersion: _version, id: _id, ...payload } = raw;
  void _version; void _id;
  const payloadJson = JSON.stringify(payload), inputHash = createHash("sha256").update(JSON.stringify(raw)).digest("hex");
  let open = false;
  try {
    await client.query("BEGIN"); open = true;
    await client.query("SET LOCAL statement_timeout='8s'; SET LOCAL lock_timeout='2s'; SET LOCAL idle_in_transaction_session_timeout='30s'");
    assert.equal((await client.query("SELECT to_regclass('sajda.trading_scenarios') IS NOT NULL AS ready")).rows[0].ready, true,
      "Reviewed migration 0018 must already be applied. This test never applies schema changes.");
    for (const account of fixtureOwners) {
      await client.query(`INSERT INTO public.sajda_auth_user(id,name,email,"emailVerified")
        VALUES($1,'Scenario rollback fixture',$2,true)`, [account, `scenario-rollback-${account}@example.test`]);
      // Synthetic grants only, inside the never-committed outer transaction.
      // No existing user's account or entitlement is modified.
      await client.query(`INSERT INTO sajda.lost_domain_access(owner_id,grant_source,source_reference,valid_from,expires_at)
        VALUES($1,'operator','scenario-rollback-fixture',clock_timestamp()-interval '1 second',clock_timestamp()+interval '30 minutes')`, [account]);
    }
    // Real store SQL/constraints execute on one real PostgreSQL connection.
    // Savepoints preserve the production transaction logic under an outer
    // rollback: no fixture, grant or journal entry is ever committed.
    // This deliberately does NOT claim two-connection concurrency coverage:
    // uncommitted synthetic owners cannot be shared across connections safely.
    const adapter: TradingScenariosClient = { release() {}, async query(sql, args) {
      if (sql === "BEGIN" || sql === "BEGIN READ ONLY") return client.query("SAVEPOINT scenarios_service");
      if (sql === "COMMIT") return client.query("RELEASE SAVEPOINT scenarios_service");
      if (sql === "ROLLBACK") {
        await client.query("ROLLBACK TO SAVEPOINT scenarios_service");
        return client.query("RELEASE SAVEPOINT scenarios_service");
      }
      return client.query(sql, args);
    } };
    const stores = Object.fromEntries(["development", "preview", "production"].map(namespace => [namespace,
      createTradingScenariosStore({ pool: { connect: async () => adapter }, environment: () => ({ VERCEL: "1", VERCEL_ENV: namespace }) })]));
    const store = stores.development;
    const first = await store.save(owner, raw);
    assert.equal(first[0].version, 1); assert.equal(first[0].domain, raw.domain);
    assert.deepEqual(await store.save(owner, raw), first, "Identical create retries must not add a row or version");
    const edit = { ...raw, expectedVersion: 1, title: "Edited rollback scenario" };
    const edited = await store.save(owner, edit);
    assert.equal(edited[0].version, 2); assert.equal(edited[0].createdAt, first[0].createdAt);
    assert.deepEqual(await store.save(owner, edit), edited);
    await assert.rejects(() => store.save(owner, { ...edit, title: "Conflicting stale tab" }), { code: "scenario_conflict" });
    await assert.rejects(() => store.save(owner, raw), { code: "scenario_conflict" });
    assert.deepEqual(await store.read(other), []);
    await assert.rejects(() => store.save(other, edit), { code: "scenario_conflict" });
    assert.equal((await store.save(other, raw))[0].version, 1, "Same UUID is isolated across owners");
    // These are namespace labels on synthetic rows in the designated development
    // test database, not connections to preview/production databases.
    for (const namespace of ["preview", "production"]) {
      assert.deepEqual(await stores[namespace].read(owner), []);
      assert.equal((await stores[namespace].save(owner, raw))[0].version, 1);
    }
    assert.equal((await store.read(owner))[0].version, 2);
    const extraIds = Array.from({ length: 98 }, () => randomUUID());
    await client.query(`INSERT INTO sajda.trading_scenarios(namespace,owner_id,id,payload,last_input_hash)
      SELECT 'development',$1,fixture_id,$2::jsonb,$4 FROM unnest($3::uuid[]) AS fixture_id`, [owner, payloadJson, extraIds, inputHash]);
    assert.equal((await store.save(owner, { ...raw, id: randomUUID() })).length, 100);
    await assert.rejects(() => store.save(owner, { ...raw, id: randomUUID() }), { code: "scenario_limit" });
    assert.equal((await store.save(owner, { ...edit, expectedVersion: 2, title: "Edit at capacity" })).find(value => value.id === id)!.version, 3);
    await client.query("SAVEPOINT scenario_constraint");
    await assert.rejects(() => client.query(`INSERT INTO sajda.trading_scenarios(namespace,owner_id,id,payload,last_input_hash)
      VALUES('development',$1,$2,$3::jsonb,$4)`, [owner, id, payloadJson, inputHash]), { code: "23505" });
    await client.query("ROLLBACK TO SAVEPOINT scenario_constraint");
    await assert.rejects(() => client.query(`INSERT INTO sajda.trading_scenarios(namespace,owner_id,id,payload,last_input_hash)
      VALUES('development',$1,$2,'[]'::jsonb,$3)`, [owner, randomUUID(), inputHash]), { code: "23514" });
    await client.query("ROLLBACK TO SAVEPOINT scenario_constraint"); await client.query("RELEASE SAVEPOINT scenario_constraint");
    await client.query("UPDATE sajda.lost_domain_access SET revoked_at=clock_timestamp() WHERE owner_id=$1", [owner]);
    await assert.rejects(() => store.read(owner), { code: "trading_required" });
    assert.equal((await store.read(other)).length, 1);
    await client.query("DELETE FROM public.sajda_auth_user WHERE id=$1", [owner]);
    assert.equal((await client.query("SELECT count(*)::integer AS count FROM sajda.trading_scenarios WHERE owner_id=$1", [owner])).rows[0].count, 0,
      "Owner deletion must cascade through every namespace");
    assert.equal((await client.query("SELECT count(*)::integer AS count FROM sajda.trading_scenarios WHERE owner_id=$1", [other])).rows[0].count, 1);
    await client.query("SAVEPOINT scenario_orphan");
    await assert.rejects(() => client.query(`INSERT INTO sajda.trading_scenarios(namespace,owner_id,id,payload,last_input_hash)
      VALUES('development',$1,$2,$3::jsonb,$4)`, [owner, randomUUID(), payloadJson, inputHash]), { code: "23503" });
    await client.query("ROLLBACK TO SAVEPOINT scenario_orphan"); await client.query("RELEASE SAVEPOINT scenario_orphan");
    await client.query("ROLLBACK"); open = false;
    assert.equal((await client.query("SELECT count(*)::integer AS count FROM public.sajda_auth_user WHERE id=ANY($1::text[])", [fixtureOwners])).rows[0].count, 0);
    assert.equal((await client.query("SELECT count(*)::integer AS count FROM sajda.trading_scenarios WHERE owner_id=ANY($1::text[])", [fixtureOwners])).rows[0].count, 0);
  } finally {
    if (open) await client.query("ROLLBACK").catch(() => undefined);
    client.release(); await pool.end();
  }
});
