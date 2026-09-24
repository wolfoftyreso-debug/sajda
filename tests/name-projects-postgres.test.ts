import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { createNameProjectsStore } from "../api/_shared/name-projects-store.js";
import type { NameProjectInput } from "../shared/name-projects.js";

// This opt-in test commits only fresh synthetic development accounts so that
// independent PostgreSQL connections can actually exercise concurrent writes.
// Cleanup is restricted to the UUIDs and fixture email addresses created here.
// No runtime URL fallback, schema mutation, credentials, provider or email call.
test("opt-in development PostgreSQL: project concurrency, ownership, references and exact fixture cleanup", {
  skip: process.env.SAJDA_PROJECTS_DB_TEST !== "1", timeout: 120_000,
}, async () => {
  assert.ok(!process.env.VERCEL, "Never run database fixtures inside a Vercel deployment");
  assert.ok(!process.env.VERCEL_ENV || process.env.VERCEL_ENV === "development", "Preview and production connections are forbidden");
  assert.equal(process.env.NEON_PROJECT_ID, "spring-paper-89655503", "Only the reviewed development Neon project is allowed");
  assert.ok(process.env.SAJDA_PROJECTS_TEST_DATABASE_URL?.trim(), "Supply an explicit test-only database URL");
  assert.ok(process.env.SAJDA_PROJECTS_TEST_DATABASE_HOST?.trim(), "Pin the designated test endpoint hostname");
  const url = new URL(process.env.SAJDA_PROJECTS_TEST_DATABASE_URL!);
  assert.ok(["postgres:", "postgresql:"].includes(url.protocol));
  assert.equal(url.hostname, process.env.SAJDA_PROJECTS_TEST_DATABASE_HOST);
  assert.ok(url.hostname.endsWith(".neon.tech") && !url.hostname.includes("-pooler."));
  assert.ok(url.username && url.password && url.pathname.length > 1);
  url.searchParams.set("sslmode", "verify-full"); url.searchParams.delete("options");
  const pool = new Pool({ connectionString: url.toString(), max: 4, connectionTimeoutMillis: 8_000, query_timeout: 10_000 });
  const owner = randomUUID(), other = randomUUID(), id = randomUUID();
  const fixtureOwners = [owner, other];
  const email = (account: string) => `project-concurrency-${account}@example.test`;
  const firstDomain = `first-${owner}.test`, secondDomain = `second-${owner}.test`, foreignDomain = `foreign-${other}.test`;
  const raw: NameProjectInput = { id, expectedVersion: 0, title: "Development project fixture", description: "A planning app 🧭",
    audience: "Independent founders", desiredStyle: "Easy to spell", languages: ["en", "sv"],
    budget: { currency: "USD", maxFirstYearCents: 3000, maxAnnualRenewalCents: 2000 }, archived: false,
    shortlistDomains: [firstDomain, secondDomain] };
  const store = createNameProjectsStore({ pool, environment: () => ({ VERCEL_ENV: "development" }) });
  const previewNamespace = createNameProjectsStore({ pool, environment: () => ({ VERCEL: "1", VERCEL_ENV: "preview" }) });
  const createdOwners: string[] = [];
  try {
    const ready = await pool.query(`SELECT to_regclass('sajda.name_projects') IS NOT NULL
      AND to_regclass('sajda.name_project_domains') IS NOT NULL AS ready`);
    assert.equal(ready.rows[0].ready, true, "Reviewed migration 0019 must already be applied; this test never applies migrations");
    for (const account of fixtureOwners) {
      await pool.query(`INSERT INTO public.sajda_auth_user(id,name,email,"emailVerified")
        VALUES($1,'Name projects concurrency fixture',$2,true)`, [account, email(account)]);
      createdOwners.push(account);
    }
    await pool.query(`INSERT INTO sajda.saved_domains(user_id,domain) VALUES($1,$2),($1,$3),($4,$5)`,
      [owner, firstDomain, secondDomain, other, foreignDomain]);
    await store.limit(owner);
    const initial = await store.save(owner, raw);
    assert.equal(initial.length, 1); assert.equal(initial[0].version, 1);
    assert.equal(initial[0].description, raw.description);
    assert.deepEqual(initial[0].shortlistDomains, raw.shortlistDomains);
    assert.deepEqual(await store.save(owner, raw), initial, "Exact retries must preserve the original version and receipt");
    assert.deepEqual(await store.read(other), []);
    await assert.rejects(() => store.save(other, { ...raw, expectedVersion: 1 }), { code: "project_conflict" });
    await assert.rejects(() => store.save(owner, { ...raw, id: randomUUID(), shortlistDomains: [foreignDomain] }), { code: "saved_domain_required" });
    await assert.rejects(() => store.save(owner, { ...raw, id: randomUUID(), shortlistDomains: [`missing-${owner}.test`] }), { code: "saved_domain_required" });
    assert.equal((await store.read(owner)).length, 1, "Rejected references must not leave partial project rows");
    assert.equal((await store.save(other, { ...raw, shortlistDomains: [foreignDomain] }))[0].version, 1, "Project UUIDs remain owner-scoped");
    assert.deepEqual(await previewNamespace.read(owner), [], "Namespace checks use the same development database, not a preview connection");
    assert.equal((await previewNamespace.save(owner, raw))[0].version, 1);

    const edits = [{ ...raw, expectedVersion: 1, title: "Concurrent tab A" }, { ...raw, expectedVersion: 1, title: "Concurrent tab B" }];
    const outcomes = await Promise.allSettled(edits.map(edit => store.save(owner, edit)));
    assert.equal(outcomes.filter(result => result.status === "fulfilled").length, 1);
    const loser = outcomes.find(result => result.status === "rejected");
    assert.equal(loser?.status === "rejected" ? loser.reason.code : undefined, "project_conflict");
    const winningEdit = edits[outcomes.findIndex(result => result.status === "fulfilled")];
    let current = (await store.read(owner))[0];
    assert.equal(current.version, 2); assert.equal(current.title, winningEdit.title);
    assert.deepEqual(await store.save(owner, winningEdit), [current]);
    const identicalEdit = { ...winningEdit, expectedVersion: 2, desiredStyle: "Short, calm and clear" };
    const retries = await Promise.all([store.save(owner, identicalEdit), store.save(owner, identicalEdit)]);
    assert.deepEqual(retries[0], retries[1]); assert.equal(retries[0][0].version, 3);

    const archived = { ...identicalEdit, expectedVersion: 3, archived: true };
    assert.equal((await store.save(owner, archived))[0].archived, true);
    const unarchived = { ...archived, expectedVersion: 4, archived: false, title: "Returned to this project" };
    current = (await store.save(owner, unarchived))[0];
    assert.equal(current.version, 5); assert.equal(current.archived, false);
    assert.equal(current.createdAt, initial[0].createdAt);

    // Deleting an original removes only its references. A replay of the last
    // successful write returns current state and cannot silently restore it.
    await pool.query("DELETE FROM sajda.saved_domains WHERE user_id=$1 AND domain=$2", [owner, firstDomain]);
    current = (await store.read(owner))[0];
    assert.deepEqual(current.shortlistDomains, [secondDomain]); assert.equal(current.version, 5);
    assert.deepEqual(await store.save(owner, unarchived), [current]);
    assert.deepEqual((await previewNamespace.read(owner))[0].shortlistDomains, [secondDomain]);
    await assert.rejects(() => store.save(owner, { ...unarchived, expectedVersion: 5 }), { code: "saved_domain_required" });
    assert.equal((await store.read(owner))[0].version, 5, "A failed save must preserve the entire previous project");
    await pool.query("DELETE FROM sajda.name_project_domains WHERE namespace='development' AND owner_id=$1 AND project_id=$2", [owner, id]);
    assert.equal((await pool.query("SELECT count(*)::integer AS count FROM sajda.saved_domains WHERE user_id=$1 AND domain=$2", [owner, secondDomain])).rows[0].count, 1);
    await pool.query("DELETE FROM sajda.name_projects WHERE namespace='development' AND owner_id=$1 AND id=$2", [owner, id]);
    assert.deepEqual(await store.read(owner), []);
    assert.equal((await pool.query("SELECT count(*)::integer AS count FROM sajda.saved_domains WHERE user_id=$1 AND domain=$2", [owner, secondDomain])).rows[0].count, 1,
      "Deleting a synthetic project must not delete its saved original");
    await pool.query('UPDATE public.sajda_auth_user SET "emailVerified"=false WHERE id=$1 AND email=$2', [owner, email(owner)]);
    await assert.rejects(() => store.read(owner), { code: "invalid_session" });
    await assert.rejects(() => store.save(owner, { ...raw, shortlistDomains: [secondDomain] }), { code: "invalid_session" });
    await pool.query("DELETE FROM public.sajda_auth_user WHERE id=$1 AND email=$2", [owner, email(owner)]);
    for (const table of ["name_projects", "name_project_domains"]) {
      assert.equal((await pool.query(`SELECT count(*)::integer AS count FROM sajda.${table} WHERE owner_id=$1`, [owner])).rows[0].count, 0);
    }
    assert.equal((await store.read(other)).length, 1, "Deleting one synthetic owner must not touch the other owner's project");
  } finally {
    // Only IDs successfully inserted above are eligible for cleanup. Exact
    // fixture emails fence even those generated IDs against unrelated data.
    try {
      for (const account of createdOwners) {
        await pool.query("DELETE FROM public.sajda_auth_user WHERE id=$1 AND email=$2", [account, email(account)]);
      }
      if (createdOwners.length) {
        const hashes = createdOwners.flatMap(account => ["development", "preview", "production"].map(namespace =>
          createHash("sha256").update(`name-projects:${namespace}:${account}`).digest("hex")));
        await pool.query("DELETE FROM sajda.function_rate_limits WHERE scope='name-projects' AND subject_hash=ANY($1::text[])", [hashes]);
        assert.equal((await pool.query("SELECT count(*)::integer AS count FROM public.sajda_auth_user WHERE id=ANY($1::text[])", [createdOwners])).rows[0].count, 0);
        for (const table of ["name_projects", "name_project_domains"]) {
          assert.equal((await pool.query(`SELECT count(*)::integer AS count FROM sajda.${table} WHERE owner_id=ANY($1::text[])`, [createdOwners])).rows[0].count, 0);
        }
        assert.equal((await pool.query("SELECT count(*)::integer AS count FROM sajda.saved_domains WHERE user_id=ANY($1::text[])", [createdOwners])).rows[0].count, 0);
      }
    } finally { await pool.end(); }
  }
  console.info(JSON.stringify({ event: "name_projects_postgres_verified", concurrentConnections: true, persistedFixtures: 0, providerCalls: 0 }));
});
