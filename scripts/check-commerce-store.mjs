/** Real PostgreSQL, synthetic Stripe observations, always ROLLBACK.
 * No Stripe request, payment, email, crawl, real user or persistent grant.
 * node --env-file=.env.neon-development.local --import tsx scripts/check-commerce-store.mjs --run
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

async function main() {
  if (!process.argv.includes("--run")) {
    console.log(
      JSON.stringify({
        status: "SKIPPED",
        reason: "Explicit --run is required.",
      }),
    );
    return;
  }
  const database = new URL(process.env.DATABASE_URL_UNPOOLED ?? "");
  assert.equal(process.env.VERCEL_ENV === "production", false);
  assert.ok(
    database.hostname.endsWith(".neon.tech") &&
      !database.hostname.includes("-pooler."),
  );
  database.searchParams.set("sslmode", "verify-full");
  const pool = new Pool({
    connectionString: database.toString(),
    max: 1,
    connectionTimeoutMillis: 8000,
    query_timeout: 10000,
  });
  let client,
    open = false,
    step = "connect",
    lastSqlState;
  const owners = Array.from({ length: 3 }, () => `qa-commerce-${randomUUID()}`),
    customerId = `cus_${randomUUID().replaceAll("-", "")}`,
    subscriptionId = `sub_${randomUUID().replaceAll("-", "")}`,
    invoiceId = `in_${randomUUID().replaceAll("-", "")}`,
    eventId = `evt_${randomUUID().replaceAll("-", "")}`;
  const passed = [];
  const check = async (name, fn) => {
    step = name;
    await fn();
    passed.push(name);
  };
  const code = (value) => (error) => error?.code === value;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    open = true;
    const adapter = {
      connect: async () => ({
        query: async (sql, params = []) => {
          try {
            if (sql === "BEGIN" || sql === "BEGIN READ ONLY")
              return await client.query("SAVEPOINT commerce_test");
            if (sql === "COMMIT")
              return await client.query("RELEASE SAVEPOINT commerce_test");
            if (sql === "ROLLBACK") {
              await client.query("ROLLBACK TO SAVEPOINT commerce_test");
              return await client.query("RELEASE SAVEPOINT commerce_test");
            }
            return await client.query(sql, params);
          } catch (error) {
            lastSqlState = /^[A-Z0-9]{5}$/u.test(error.code ?? "")
              ? error.code
              : "unknown";
            throw error;
          }
        },
        release() {},
      }),
    };
    await client.query(
      `INSERT INTO public.sajda_auth_user(id,name,email,"emailVerified")
      SELECT id,'Rollback fixture',id||'@example.invalid',true FROM unnest($1::text[])id`,
      [owners],
    );
    const { createCommerceStore } = await import(
      "../api/_shared/commerce-store.ts"
    );
    const { createLostDomainsStore } = await import(
      "../api/_shared/lost-domains-store.ts"
    );
    const config = { namespace: "preview", mode: "test" },
      store = createCommerceStore(config, adapter);
    const access = (namespace) =>
      createLostDomainsStore({
        pool: adapter,
        environment: () => ({ VERCEL: "1", VERCEL_ENV: namespace }),
      }).readAccess(owners[0]);
    await check("fresh owner has no billing state or paid access", async () => {
      assert.equal(await store.read(owners[0]), null);
      assert.equal((await access("preview")).allowed, false);
    });
    const lease = await store.acquire(owners[0]);
    await check(
      "one durable customer lease per owner prevents duplicate concurrent checkout",
      async () => {
        await assert.rejects(
          () => store.acquire(owners[0]),
          code("billing_busy"),
        );
      },
    );
    await store.customer(lease, customerId);
    await check("customer ID belongs to exactly one account", async () => {
      const other = await store.acquire(owners[1]);
      await assert.rejects(
        () => store.customer(other, customerId),
        code("billing_unavailable"),
      );
      await store.release(other);
      assert.equal(await store.ownerFor(customerId), owners[0]);
    });
    const key = randomUUID(),
      reserved = await store.reservation(
        lease,
        key,
        "price_fixture",
        "https://preview.example.com",
      );
    await check(
      "retry UUID and new UUID both reuse the one pending checkout",
      async () => {
        assert.equal(
          (
            await store.reservation(
              lease,
              key,
              "price_fixture",
              "https://preview.example.com",
            )
          ).id,
          reserved.id,
        );
        assert.equal(
          (
            await store.reservation(
              lease,
              randomUUID(),
              "price_fixture",
              "https://preview.example.com",
            )
          ).id,
          reserved.id,
        );
      },
    );
    await store.saveCheckout(lease, reserved.id, {
      id: `cs_test_${randomUUID().replaceAll("-", "")}`,
      status: "open",
      url: "https://checkout.stripe.com/c/pay/fixture",
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });
    const grant = {
        subscriptionId,
        priceId: "price_fixture",
        invoiceId,
        validFrom: new Date(Date.now() - 60000).toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      },
      paid = {
        status: "active",
        subscriptionId,
        cancelAtPeriodEnd: false,
        grant,
      },
      event = {
        id: eventId,
        type: "invoice.paid",
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        customerId,
        hold: false,
      };
    await store.sync(lease, paid, { event, hash: "a".repeat(64) });
    await check(
      "paid sandbox grant unlocks only its matching preview namespace",
      async () => {
        assert.equal((await access("preview")).allowed, true);
        assert.equal((await access("production")).allowed, false);
        assert.equal((await access("development")).allowed, false);
        assert.equal(
          (await store.read(owners[0])).accessExpiresAt,
          grant.expiresAt,
        );
        assert.equal((await store.read(owners[1])).accessExpiresAt, null);
      },
    );
    await check(
      "event delivery and grant write are idempotent and conflicting payloads rejected",
      async () => {
        await store.sync(lease, paid, { event, hash: "a".repeat(64) });
        assert.equal(await store.processed(eventId, "a".repeat(64)), true);
        await assert.rejects(
          () => store.processed(eventId, "b".repeat(64)),
          code("webhook_event_conflict"),
        );
        const counts = await client.query(
          "SELECT count(*)::int AS n FROM sajda.commerce_access WHERE namespace=$1 AND owner_id=$2",
          ["preview", owners[0]],
        );
        assert.equal(counts.rows[0].n, 1);
      },
    );
    await check(
      "failed event transaction cannot partially replace a paid grant",
      async () => {
        await assert.rejects(
          () =>
            store.sync(
              lease,
              { ...paid, status: "canceled", grant: null },
              { event, hash: "b".repeat(64) },
            ),
          code("webhook_event_conflict"),
        );
        assert.equal((await access("preview")).allowed, true);
        assert.equal((await store.read(owners[0])).status, "active");
      },
    );
    await store.sync(lease, { ...paid, status: "past_due", grant: null });
    await check(
      "failed renewal revokes paid access without deleting private reports",
      async () => {
        assert.equal((await access("preview")).allowed, false);
        assert.equal((await store.read(owners[0])).status, "past_due");
      },
    );
    await store.sync(lease, { ...paid, cancelAtPeriodEnd: true });
    await check(
      "scheduled cancellation preserves exactly the paid period",
      async () => {
        assert.equal((await access("preview")).allowed, true);
        assert.equal(
          (await store.read(owners[0])).accessExpiresAt,
          grant.expiresAt,
        );
      },
    );
    await client.query(
      "UPDATE sajda.commerce_customers SET lease_until=clock_timestamp()-interval '1 second' WHERE namespace='preview' AND owner_id=$1",
      [owners[0]],
    );
    const next = await store.acquire(owners[0]);
    await check(
      "expired lease is fenced and cannot grant or revoke after another worker takes over",
      async () => {
        assert.ok(next.fence > lease.fence);
        await assert.rejects(
          () => store.sync(lease, { ...paid, grant: null }),
          code("billing_busy"),
        );
        await store.release(lease);
        assert.equal((await access("preview")).allowed, true);
      },
    );
    await store.sync(next, paid, {
      event: {
        ...event,
        id: `evt_${randomUUID().replaceAll("-", "")}`,
        type: "charge.refunded",
        hold: true,
      },
      hash: "c".repeat(64),
    });
    await check(
      "full-refund hold survives later paid-state reconciliation until operator review",
      async () => {
        assert.equal((await access("preview")).allowed, false);
        assert.equal((await store.read(owners[0])).paymentHold, true);
        await store.release(next);
        const fresh = await store.acquire(owners[0]);
        await store.sync(fresh, paid);
        assert.equal((await access("preview")).allowed, false);
        await store.release(fresh);
      },
    );
    const constraint = async (sql, params, expected) => {
      await client.query("SAVEPOINT invalid_commerce");
      await assert.rejects(() => client.query(sql, params), code(expected));
      await client.query("ROLLBACK TO SAVEPOINT invalid_commerce");
      await client.query("RELEASE SAVEPOINT invalid_commerce");
    };
    await check(
      "SQL itself rejects sandbox customer state in production",
      async () => {
        await constraint(
          "INSERT INTO sajda.commerce_customers(namespace,owner_id,customer_key,livemode) VALUES('production',$1,$2::uuid,false)",
          [owners[2], randomUUID()],
          "23514",
        );
      },
    );
    await check(
      "SQL prevents indefinite and overlong billing grants",
      async () => {
        await constraint(
          "UPDATE sajda.commerce_access SET expires_at='infinity'::timestamptz WHERE namespace='preview' AND owner_id=$1",
          [owners[0]],
          "23514",
        );
        await constraint(
          "UPDATE sajda.commerce_access SET expires_at=valid_from+interval '46 days' WHERE namespace='preview' AND owner_id=$1",
          [owners[0]],
          "23514",
        );
      },
    );
    await client.query("ROLLBACK");
    open = false;
    await check(
      "all test users, customers, checkouts, grants and event records are absent after rollback",
      async () => {
        const counts = await client.query(
          `SELECT
        (SELECT count(*)::int FROM public.sajda_auth_user WHERE id=ANY($1::text[])) AS users,
        (SELECT count(*)::int FROM sajda.commerce_customers WHERE owner_id=ANY($1::text[])) AS customers,
        (SELECT count(*)::int FROM sajda.commerce_checkouts WHERE owner_id=ANY($1::text[])) AS checkouts,
        (SELECT count(*)::int FROM sajda.commerce_access WHERE owner_id=ANY($1::text[])) AS grants,
        (SELECT count(*)::int FROM sajda.commerce_events WHERE customer_id=$2) AS events`,
          [owners, customerId],
        );
        assert.deepEqual(counts.rows[0], {
          users: 0,
          customers: 0,
          checkouts: 0,
          grants: 0,
          events: 0,
        });
      },
    );
    console.log(
      JSON.stringify(
        {
          status: "PASS",
          checks: passed.length,
          verified: passed,
          persistentFixtures: 0,
          stripeRequests: 0,
          evidence:
            "Actual PostgreSQL using savepoint-bound transactions; provider states synthetic, no external payment.",
        },
        null,
        2,
      ),
    );
  } catch {
    console.error(
      JSON.stringify({
        status: "FAIL",
        check: step,
        completedChecks: passed.length,
        ...(lastSqlState ? { sqlState: lastSqlState } : {}),
      }),
    );
    process.exitCode = 1;
  } finally {
    if (client) {
      if (open)
        await client.query("ROLLBACK").catch(() => {
          process.exitCode = 1;
        });
      client.release();
    }
    await pool.end();
  }
}
main().catch(() => {
  console.error(
    JSON.stringify({
      status: "FAIL",
      check: "Setup/configuration; secrets omitted.",
    }),
  );
  process.exitCode = 1;
});
