import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { createContactReserver, type ContactReservation } from "../api/_shared/contact-guard.js";

/** Explicit development-only SQL verification. Never calls an email/AI provider. */
test("real Postgres contact idempotency, concurrency, quotas and exact fixture cleanup", {
  skip: process.env.SAJDA_CONFIRM_CONTACT_DATABASE_TEST !== "1",
}, async context => {
  assert.equal(process.env.NEON_PROJECT_ID, "spring-paper-89655503", "Select the known Sajda development database");
  assert.notEqual(process.env.VERCEL_ENV, "production");
  assert.ok(process.env.DATABASE_URL);
  const namespace = "sajda.contact.v1:development", secret = randomBytes(48).toString("base64url");
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(url.hostname.endsWith(".neon.tech"));
  url.searchParams.set("sslmode", "verify-full"); url.searchParams.delete("options");
  const pool = new Pool({ connectionString: url.toString(), max: 4, connectionTimeoutMillis: 5_000, query_timeout: 5_000, allowExitOnIdle: true });
  pool.on("error", () => undefined);
  const ids: string[] = [], hashes: string[] = [], checked: string[] = [];
  let insertedFixtureCount = 0, deletedFixtureCount = 0;
  const hash = (purpose: string, value: string) => createHmac("sha256", secret).update(`${namespace}\0${purpose}\0${value}`).digest("hex");
  const input = () => { const id = randomUUID(); ids.push(id); return { id, canonicalBody: "non-personal isolated contact QA fixture" }; };
  const ip = (index: number) => `198.51.100.${index}`;
  const reserve = createContactReserver({ environment: () => ({ DATABASE_URL: process.env.DATABASE_URL,
    BETTER_AUTH_SECRET: secret, VERCEL: "1", VERCEL_ENV: "development" }), pool: () => pool });
  const request = async (message: ReturnType<typeof input>, index: number, mapped = false) => {
    const identityHash = hash("ip", ip(index)); if (!hashes.includes(identityHash)) hashes.push(identityHash);
    return reserve(message, { "x-vercel-forwarded-for": mapped ? `::ffff:${ip(index)}` : ip(index) });
  };
  const check = (name: string, actual: unknown, expected: unknown) => { assert.deepEqual(actual, expected, name); checked.push(name); };
  const finish = async (result: ContactReservation, accepted: boolean) => {
    assert.equal(result.kind, "send"); if (result.kind === "send") assert.equal(await result.finish(accepted), true);
  };
  const ageOwn = async (id: string, lease = false) => {
    assert.ok(ids.includes(id));
    const result = await pool.query(`UPDATE public.sajda_contact_submissions
      SET last_attempt_at = clock_timestamp() - interval '61 seconds'${lease ? ", lease_until = clock_timestamp() - interval '1 second'" : ""}
      WHERE namespace = $1 AND submission_id = $2::uuid AND identity_hash = ANY($3::text[])`, [namespace, id, hashes]);
    assert.equal(result.rowCount, 1);
  };
  try {
    // Do not consume an existing development allowance or trigger retention of
    // another caller's records. An occupied namespace makes this test skip.
    const baseline = await pool.query("SELECT count(*)::integer AS total FROM public.sajda_contact_submissions WHERE namespace = $1", [namespace]);
    if (baseline.rows[0].total !== 0) { context.skip("Development contact state already exists; no existing records changed"); return; }
    const firstInput = input();
    const duplicate = await Promise.all([request(firstInput, 1), request(firstInput, 1)]);
    check("same UUID gets exactly one lease", duplicate.map(result => result.kind).sort(), ["in_progress", "send"]);
    const first = duplicate.find(result => result.kind === "send")!;
    const secondInput = input(), thirdInput = input();
    const second = await request(secondInput, 2);
    check("second independent lease allowed", second.kind, "send");
    check("third independent concurrent lease denied", (await request(thirdInput, 3)).kind, "in_progress");
    const active = await pool.query("SELECT count(*)::integer AS total, max(extract(epoch FROM lease_until - clock_timestamp())) AS remaining FROM public.sajda_contact_submissions WHERE namespace = $1 AND lease_until > clock_timestamp()", [namespace]);
    check("two real persisted leases", active.rows[0].total, 2);
    assert.ok(Number(active.rows[0].remaining) > 0 && Number(active.rows[0].remaining) <= 30); checked.push("lease expiry bounded30seconds");
    await finish(first, true); await finish(second, true);
    check("accepted retry is deduplicated", (await request(firstInput, 1)).kind, "accepted");
    check("changed body with existing UUID rejected", (await request({ ...firstInput, canonicalBody: "changed fixture" }, 1)).kind, "conflict");
    check("mapped IPv6 shares IP minute limit", (await request(input(), 1, true)).kind, "rate_limited");
    const third = await request(thirdInput, 3); await finish(third, false);
    check("failed delivery same-minute retry limited", (await request(thirdInput, 3)).kind, "rate_limited");
    await ageOwn(thirdInput.id); await finish(await request(thirdInput, 3), false);
    await ageOwn(thirdInput.id); await finish(await request(thirdInput, 3), false);
    await ageOwn(thirdInput.id);
    check("three attempts expire same UUID", (await request(thirdInput, 3)).kind, "expired");
    check("IP cannot evade three attempts with new UUID", (await request(input(), 3)).kind, "rate_limited");

    const orphanInput = input(), old = await request(orphanInput, 4);
    await ageOwn(orphanInput.id, true);
    const replacement = await request(orphanInput, 4);
    check("expired lease permits retry", replacement.kind, "send");
    check("old invocation cannot finish replacement lease", old.kind === "send" && await old.finish(true), false);
    await finish(replacement, false);
    await pool.query("UPDATE public.sajda_contact_submissions SET created_at = clock_timestamp() - interval '23 hours' WHERE namespace = $1 AND submission_id = $2::uuid AND identity_hash = ANY($3::text[])", [namespace, orphanInput.id, hashes]);
    check("retry expires before Resend24h window", (await request(orphanInput, 4)).kind, "expired");

    // Fill ONLY this run's disposable fixture rows to49 aggregate attempts.
    // This tests the actual SQL boundary without sending49 messages or waiting.
    const total = await pool.query("SELECT coalesce(sum(attempts),0)::integer AS total FROM public.sajda_contact_submissions WHERE namespace = $1 AND submission_id = ANY($2::uuid[]) AND identity_hash = ANY($3::text[])", [namespace, ids, hashes]);
    let remaining = 49 - total.rows[0].total;
    for (let index = 100; remaining > 0; index++) {
      const fixture = input(), identityHash = hash("ip", ip(index)), attempts = Math.min(3, remaining); hashes.push(identityHash);
      await pool.query(`INSERT INTO public.sajda_contact_submissions
        (namespace, submission_id, payload_hash, identity_hash, status, attempts, created_at, last_attempt_at, accepted_at)
        VALUES ($1,$2::uuid,$3,$4,'accepted',$5,clock_timestamp(),clock_timestamp(),clock_timestamp())`,
      [namespace, fixture.id, hash("payload", fixture.canonicalBody), identityHash, attempts]);
      insertedFixtureCount++; remaining -= attempts;
    }
    const race = await Promise.all([request(input(), 200), request(input(), 201)]);
    check("global final allowance is atomic", race.map(result => result.kind).sort(), ["rate_limited", "send"]);
    for (const result of race) if (result.kind === "send") await finish(result, true);
    const final = await pool.query("SELECT coalesce(sum(attempts),0)::integer AS total FROM public.sajda_contact_submissions WHERE namespace = $1 AND submission_id = ANY($2::uuid[]) AND identity_hash = ANY($3::text[])", [namespace, ids, hashes]);
    check("global attempts stop at50", final.rows[0].total, 50);
  } finally {
    // Both UUID and this run's random-secret HMAC are required for cleanup.
    // Existing user rows, preview state, production state and AI quotas stay intact.
    if (ids.length && hashes.length) {
      const result = await pool.query("DELETE FROM public.sajda_contact_submissions WHERE namespace = $1 AND submission_id = ANY($2::uuid[]) AND identity_hash = ANY($3::text[])", [namespace, ids, hashes]);
      deletedFixtureCount = result.rowCount ?? 0;
      const left = await pool.query("SELECT count(*)::integer AS total FROM public.sajda_contact_submissions WHERE namespace = $1 AND submission_id = ANY($2::uuid[]) AND identity_hash = ANY($3::text[])", [namespace, ids, hashes]);
      assert.equal(left.rows[0].total, 0, "All and only this run's contact fixtures removed");
    }
    await pool.end();
  }
  context.diagnostic(JSON.stringify({ checksPassed: checked.length, seededQuotaFixtureRows: insertedFixtureCount,
    deletedOwnedRows: deletedFixtureCount, remainingOwnedRows: 0, emailProviderCalls: 0, paidAiCalls: 0 }));
});
