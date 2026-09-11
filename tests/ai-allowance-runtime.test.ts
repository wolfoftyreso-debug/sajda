import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { createAiAllowanceReserver, type AiAllowancePool } from "../api/_shared/ai-allowance.js";

/** Clone real CHECK constraints into a temporary table; never touch live counters. */
test("real migrated Postgres constraints bound test IPs to twenty, production to three and global to one hundred", {
  skip: process.env.SAJDA_CONFIRM_AI_ALLOWANCE_DATABASE_TEST !== "1", timeout: 60_000,
}, async () => {
  assert.equal(process.env.NEON_PROJECT_ID, "spring-paper-89655503");
  assert.notEqual(process.env.VERCEL_ENV, "production");
  const url = new URL(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "");
  assert.ok(["postgres:", "postgresql:"].includes(url.protocol));
  assert.ok(url.hostname.endsWith(".neon.tech"));
  url.searchParams.set("sslmode", "verify-full");
  url.searchParams.delete("options");
  const pool = new Pool({ connectionString: url.toString(), max: 1, connectionTimeoutMillis: 5_000, query_timeout: 5_000 });
  const client = await pool.connect();
  let open = false;
  try {
    await client.query("BEGIN"); open = true;
    await client.query("SET LOCAL statement_timeout = '5s'; SET LOCAL lock_timeout = '2s'");
    const constraint = await client.query("SELECT convalidated FROM pg_constraint WHERE conrelid = 'public.sajda_ai_allowance_counters'::regclass AND conname = 'sajda_ai_allowance_counters_check'");
    assert.deepEqual(constraint.rows, [{ convalidated: true }]);
    await client.query("CREATE TEMP TABLE sajda_ai_allowance_constraint_fixture (LIKE public.sajda_ai_allowance_counters INCLUDING CONSTRAINTS) ON COMMIT DROP");
    const insert = (namespace: string, identity: string, count: number) => client.query(
      "INSERT INTO pg_temp.sajda_ai_allowance_constraint_fixture (namespace,usage_day,identity_hash,request_count,last_request_at) VALUES ($1,CURRENT_DATE,$2,$3,clock_timestamp())",
      [namespace, identity, count],
    );
    const rejected = async (namespace: string, identity: string, count: number) => {
      await client.query("SAVEPOINT expected_rejection");
      await assert.rejects(() => insert(namespace, identity, count), { code: "23514" });
      await client.query("ROLLBACK TO SAVEPOINT expected_rejection");
      await client.query("RELEASE SAVEPOINT expected_rejection");
    };
    const identity = randomBytes(32).toString("hex");
    for (const stage of ["development", "preview", "production"]) {
      const namespace = `sajda.ai.v1:${stage}`;
      const maximum = stage === "production" ? 3 : 20;
      await insert(namespace, identity, 1);
      await insert(namespace, identity, maximum);
      await rejected(namespace, identity, 0);
      await rejected(namespace, identity, maximum + 1);
      await insert(namespace, "global", 100);
      await rejected(namespace, "global", 101);
      await rejected(namespace, "invalid-identity", 1);
    }
    for (const namespace of ["sajda.ai.v1:preview:custom", "sajda.ai.v1:Preview", "sajda.ai.v2:preview", "unknown"]) {
      await rejected(namespace, identity, 1);
    }
    await client.query("ROLLBACK"); open = false;
  } finally {
    if (open) await client.query("ROLLBACK").catch(() => undefined);
    client.release();
    await pool.end();
  }
});

/** Opt-in integration test: no inference, provider call or production access. */
test("real Postgres allowance transactions, limits and exact fixture cleanup", {
  skip: process.env.SAJDA_CONFIRM_AI_ALLOWANCE_DATABASE_TEST !== "1",
}, async context => {
  assert.equal(process.env.NEON_PROJECT_ID, "spring-paper-89655503", "Select the known Sajda development database explicitly");
  assert.notEqual(process.env.VERCEL_ENV, "production");
  assert.ok(process.env.DATABASE_URL);
  const namespace = "sajda.ai.v1:development";
  const secret = randomBytes(48).toString("base64url");
  const ips = Array.from({ length: 8 }, (_, index) => `198.51.100.${index + 1}`);
  const hashes = ips.map(ip => createHmac("sha256", secret).update(`sajda-ai-ip-v1\0${namespace}\0${ip}`).digest("hex"));
  const leaseIds: string[] = [];
  const checked: string[] = [];
  const check = (name: string, actual: unknown, expected: unknown) => { assert.deepEqual(actual, expected, name); checked.push(name); };
  const url = new URL(process.env.DATABASE_URL);
  url.searchParams.set("sslmode", "verify-full");
  url.searchParams.delete("options");
  const pool = new Pool({ connectionString: url.toString(), max: 4, connectionTimeoutMillis: 5_000, query_timeout: 5_000, allowExitOnIdle: true });
  pool.on("error", () => undefined);
  let day = "";
  let initiallyEmpty = false;
  let failRelease = false;
  let cleanupFailed = false;
  const monitoredPool: AiAllowancePool = {
    connect: async () => {
      const client = await pool.connect();
      return {
        query: async (text, values) => {
          if (text.includes("ai:lease")) leaseIds.push(values![1] as string);
          if (text.includes("ai:release") && failRelease) {
            failRelease = false;
            throw new Error("Intentional fixture release failure");
          }
          return client.query(text, values);
        },
        release: destroy => client.release(destroy),
      };
    },
  };
  const reserve = createAiAllowanceReserver({ environment: () => ({
    DATABASE_URL: process.env.DATABASE_URL, BETTER_AUTH_SECRET: secret,
    VERCEL: "1", VERCEL_ENV: "development", SAJDA_AI_DAILY_LIMIT: "8",
  }), pool: () => monitoredPool });
  const request = (index: number) => reserve({ "x-vercel-forwarded-for": ips[index] });
  const ownCount = async (hash: string) => Number((await pool.query(
    "SELECT coalesce(sum(request_count), 0) AS total FROM public.sajda_ai_allowance_counters WHERE namespace = $1 AND identity_hash = $2 AND usage_day = $3::date",
    [namespace, hash, day],
  )).rows[0].total);
  try {
    day = (await pool.query("SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day")).rows[0].day;
    const baseline = await pool.query("SELECT count(*)::integer AS count FROM public.sajda_ai_allowance_counters WHERE namespace = $1 AND usage_day = $2::date", [namespace, day]);
    const baselineLeases = await pool.query("SELECT count(*)::integer AS count FROM public.sajda_ai_allowance_leases WHERE namespace = $1 AND expires_at > clock_timestamp()", [namespace]);
    if (baseline.rows[0].count !== 0 || baselineLeases.rows[0].count !== 0) {
      context.skip("Development quota already in use; no existing allowance state modified");
      return;
    }
    initiallyEmpty = true;
    const pair = await Promise.all([request(0), request(1)]);
    check("parallel reservations both allowed", pair.map(result => result.allowed), [true, true]);
    check("third concurrent reservation denied", (await request(2)).reason, "concurrency_limit");
    check("same IP also obeys global concurrency", (await request(0)).reason, "concurrency_limit");
    check("denials do not consume global quota", await ownCount("global"), 2);
    const active = await pool.query("SELECT count(*)::integer AS count, max(extract(epoch FROM expires_at - clock_timestamp())) AS remaining FROM public.sajda_ai_allowance_leases WHERE namespace = $1 AND expires_at > clock_timestamp()", [namespace]);
    check("exactly two persisted live leases", active.rows[0].count, 2);
    assert.ok(Number(active.rows[0].remaining) > 0 && Number(active.rows[0].remaining) <= 20, "Database lease is bounded to 20 seconds");
    checked.push("database lease duration bounded");
    await Promise.all(pair.map(result => result.release()));
    await pair[0].release();
    check("idempotent release preserves counters", await ownCount("global"), 2);
    for (const expected of [2, 3]) {
      const allowed = await request(0);
      check(`same IP immediately allowed request ${expected}`, allowed.allowed, true);
      await allowed.release();
    }
    check("fourth IP request denied", (await request(0)).reason, "ip_daily_limit");
    check("IP counter stops at three", await ownCount(hashes[0]), 3);

    const orphan = await request(2);
    check("orphan fixture reserved", orphan.allowed, true);
    failRelease = true;
    await orphan.release();
    const fourth = await request(3);
    check("one slot usable during failed release", fourth.allowed, true);
    check("failed release retains concurrency slot", (await request(4)).reason, "concurrency_limit");
    await fourth.release();
    // Expire only the lease created by this run. Its initial 20s lifetime was
    // measured above; no wait or mutation of another caller's lease is needed.
    await pool.query("UPDATE public.sajda_ai_allowance_leases SET expires_at = clock_timestamp() - interval '1 millisecond' WHERE namespace = $1 AND lease_id = ANY($2::uuid[])", [namespace, leaseIds]);
    const fifth = await request(4);
    check("expired failed-release lease frees capacity", fifth.allowed, true);
    await fifth.release();
    const lastSlot = await Promise.all([request(5), request(6)]);
    check("one concurrent caller gets the eighth reservation", lastSlot.filter(result => result.allowed).length, 1);
    check("other concurrent caller hits daily cap", lastSlot.filter(result => result.reason === "daily_limit").length, 1);
    await Promise.all(lastSlot.map(result => result.release()));
    check("daily limit denies later request", (await request(7)).reason, "daily_limit");
    check("global counter is exactly eight", await ownCount("global"), 8);
    check("only hashed fixture IPs retained", (await pool.query("SELECT count(*)::integer AS count FROM public.sajda_ai_allowance_counters WHERE namespace = $1 AND usage_day = $2::date AND identity_hash <> 'global' AND identity_hash <> ALL($3::text[])", [namespace, day, hashes])).rows[0].count, 0);
  } finally {
    const cleanup = await pool.connect();
    try {
      await cleanup.query("BEGIN");
      await cleanup.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [namespace]);
      const totals = await cleanup.query(`SELECT
        coalesce(sum(request_count) FILTER (WHERE identity_hash = ANY($3::text[])), 0)::integer AS ours,
        coalesce(sum(request_count) FILTER (WHERE identity_hash = 'global'), 0)::integer AS global_count,
        count(*) FILTER (WHERE identity_hash <> 'global' AND identity_hash <> ALL($3::text[]))::integer AS others
        FROM public.sajda_ai_allowance_counters WHERE namespace = $1 AND usage_day = $2::date`, [namespace, day || "1970-01-01", hashes]);
      await cleanup.query("DELETE FROM public.sajda_ai_allowance_counters WHERE namespace = $1 AND identity_hash = ANY($2::text[])", [namespace, hashes]);
      await cleanup.query("DELETE FROM public.sajda_ai_allowance_leases WHERE namespace = $1 AND lease_id = ANY($2::uuid[])", [namespace, leaseIds]);
      // Only remove the global row when this run created every counted request.
      // Any unrelated concurrent activity leaves its entire shared counter intact.
      if (initiallyEmpty && totals.rows[0].others === 0 && totals.rows[0].global_count === totals.rows[0].ours) {
        await cleanup.query("DELETE FROM public.sajda_ai_allowance_counters WHERE namespace = $1 AND usage_day = $2::date AND identity_hash = 'global'", [namespace, day]);
      }
      await cleanup.query("COMMIT");
      const remaining = await cleanup.query("SELECT count(*)::integer AS count FROM public.sajda_ai_allowance_counters WHERE namespace = $1 AND identity_hash = ANY($2::text[])", [namespace, hashes]);
      check("exact fixture counters removed", remaining.rows[0].count, 0);
      const remainingLeases = await cleanup.query("SELECT count(*)::integer AS count FROM public.sajda_ai_allowance_leases WHERE namespace = $1 AND lease_id = ANY($2::uuid[])", [namespace, leaseIds]);
      check("exact fixture leases removed", remainingLeases.rows[0].count, 0);
    } catch {
      await cleanup.query("ROLLBACK").catch(() => undefined);
      cleanupFailed = true;
      context.diagnostic("Allowance fixture cleanup could not be verified; database details suppressed");
    } finally {
      cleanup.release();
      await pool.end();
    }
  }
  if (cleanupFailed) throw new Error("Allowance fixture cleanup could not be verified");
  context.diagnostic(`${checked.length} real-database checks passed; eight allowance reservations, zero AI calls; fixtures removed`);
});
