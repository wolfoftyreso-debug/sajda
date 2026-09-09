import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createContactReserver, type ContactGuardClient, type ContactGuardPool, type ContactReservation } from "../api/_shared/contact-guard.js";

type Row = Record<string, unknown> & { namespace: string; submission_id: string; payload_hash: string; identity_hash: string;
  status: string; attempts: number; created_at: Date; last_attempt_at: Date; lease_token: string | null; lease_until: Date | null };
/** Transaction/clock double exercises control flow; real SQL has a separate opt-in test. */
class Database implements ContactGuardPool {
  now = Date.parse("2026-09-08T12:00:00Z");
  rows = new Map<string, Row>();
  statements: { text: string; values: unknown[] }[] = [];
  connects = 0; destroyed = 0; fail = "";
  private tail = Promise.resolve();
  async connect(): Promise<ContactGuardClient> {
    this.connects++;
    if (this.fail === "connect") throw new Error("private database credential");
    let unlock: (() => void) | undefined;
    let working: Map<string, Row> | undefined;
    const done = () => { working = undefined; unlock?.(); unlock = undefined; };
    return {
      query: async (text, values = []) => {
        this.statements.push({ text, values });
        const operation = /\/\* contact:([a-z]+) \*\//u.exec(text)?.[1] ?? text.split(" ")[0];
        if (this.fail === operation) throw new Error("private database statement");
        const rows: Record<string, unknown>[] = [];
        if (operation === "lock") {
          const prior = this.tail; this.tail = new Promise(resolve => { unlock = resolve; }); await prior;
          working = new Map([...this.rows].map(([key, row]) => [key, { ...row }]));
        } else if (operation === "clock") rows.push({ now: new Date(this.now) });
        else if (operation === "cleanup") {
          let removed = 0;
          for (const [key, row] of working!) if (removed < 100 && row.namespace === values[0] && row.created_at.getTime() < this.now - 30 * 86_400_000) {
            working!.delete(key); removed++;
          }
        } else if (operation === "existing") {
          const row = working!.get(`${values[0]}|${values[1]}`); if (row) rows.push({ ...row });
        } else if (operation === "usage") {
          const activeRows = [...working!.values()].filter(row => row.namespace === values[0] && row.last_attempt_at.getTime() >= this.now - 86_400_000);
          const ipRows = activeRows.filter(row => row.identity_hash === values[1]);
          rows.push({ global_count: activeRows.reduce((total, row) => total + row.attempts, 0), ip_count: ipRows.reduce((total, row) => total + row.attempts, 0),
            last_ip_attempt: ipRows.length ? new Date(Math.max(...ipRows.map(row => row.last_attempt_at.getTime()))) : null,
            active: activeRows.filter(row => row.status === "pending" && row.lease_until && row.lease_until.getTime() > this.now).length });
        } else if (operation === "reserve") {
          const [namespace, id, payloadHash, identityHash, instant, lease] = values as string[];
          const key = `${namespace}|${id}`, existing = working!.get(key);
          working!.set(key, { namespace, submission_id: id, payload_hash: payloadHash, identity_hash: existing?.identity_hash ?? identityHash,
            status: "pending", attempts: (existing?.attempts ?? 0) + 1, created_at: existing?.created_at ?? new Date(instant),
            last_attempt_at: new Date(instant), lease_token: lease, lease_until: new Date(this.now + 30_000) });
        } else if (operation === "finish") {
          const row = this.rows.get(`${values[0]}|${values[1]}`);
          if (row?.status === "pending" && row.lease_token === values[2]) {
            row.status = values[3] ? "accepted" : "pending";
            row.lease_token = null; row.lease_until = null;
            rows.push({ submission_id: row.submission_id });
          }
        } else if (operation === "COMMIT") {
          this.rows = working!; done(); if (this.fail === "after-commit") throw new Error("private ambiguous commit");
        } else if (operation === "ROLLBACK") done();
        else assert.ok(["BEGIN", "SET"].includes(operation), operation);
        return { rows };
      },
      release: destroy => { if (destroy) this.destroyed++; done(); },
    };
  }
}
const baseEnvironment: NodeJS.ProcessEnv = { VERCEL: "1", VERCEL_ENV: "preview",
  DATABASE_URL: "postgresql://test:test@database.invalid/test", BETTER_AUTH_SECRET: "contact-test-secret-not-a-production-key" };
const headers = (ip = "192.0.2.1") => ({ "x-vercel-forwarded-for": ip });
const submission = () => ({ id: randomUUID(), canonicalBody: '{"message":"private contact fixture","email":"private@example.test"}' });
function setup() {
  const database = new Database(), environment = { ...baseEnvironment };
  const reserve = createContactReserver({ environment: () => environment, pool: () => database });
  return { database, environment, reserve };
}
async function finish(result: ContactReservation, accepted = true) {
  assert.equal(result.kind, "send"); if (result.kind === "send") assert.equal(await result.finish(accepted), true);
}

test("contact guard fails closed without server configuration/trusted identity", async () => {
  for (const change of [{ DATABASE_URL: "" }, { BETTER_AUTH_SECRET: "short" }, { VERCEL_ENV: "invalid" }]) {
    const h = setup(); Object.assign(h.environment, change);
    assert.equal((await h.reserve(submission(), headers())).kind, "unavailable"); assert.equal(h.database.connects, 0);
  }
  const h = setup();
  for (const input of [{}, { "x-forwarded-for": "192.0.2.1" }, headers("192.0.2.1, 192.0.2.2"),
    { "x-vercel-forwarded-for": ["192.0.2.1"] }, { ...headers(), "X-Vercel-Forwarded-For": "192.0.2.2" }]) {
    assert.equal((await h.reserve(submission(), input, "127.0.0.1")).kind, "unavailable");
  }
  assert.equal(h.database.connects, 0);
});

test("only loopback development sockets are trusted and mapped IPv6 shares the same quota", async () => {
  const h = setup(); delete h.environment.VERCEL;
  assert.equal((await h.reserve(submission(), headers(), "192.0.2.2")).kind, "unavailable");
  await finish(await h.reserve(submission(), headers("203.0.113.1"), "::ffff:127.0.0.1"));
  assert.equal((await h.reserve(submission(), headers("203.0.113.2"), "127.0.0.1")).kind, "rate_limited");
});

test("contact records persist HMAC fingerprints only and never mix with AI quota", async () => {
  const h = setup(), input = submission(); await finish(await h.reserve(input, headers()));
  assert.equal(h.database.rows.size, 1);
  const row = [...h.database.rows.values()][0];
  assert.match(row.payload_hash, /^[a-f0-9]{64}$/); assert.match(row.identity_hash, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(h.database.statements), /private@example.test|private contact fixture|192\.0\.2\.1|sajda_ai_/);
  assert.ok(h.database.statements.some(item => item.text.includes("pg_advisory_xact_lock")));
});

test("accepted duplicate is cached; changed body with same UUID always conflicts", async () => {
  const h = setup(), input = submission(); await finish(await h.reserve(input, headers()));
  assert.equal((await h.reserve(input, headers("198.51.100.1"))).kind, "accepted");
  assert.equal((await h.reserve({ ...input, canonicalBody: "different body" }, headers())).kind, "conflict");
  assert.equal([...h.database.rows.values()][0].attempts, 1);
});

test("concurrent duplicate/independent reservations serialize with two active leases maximum", async () => {
  const h = setup(), input = submission();
  const duplicate = await Promise.all([h.reserve(input, headers()), h.reserve(input, headers())]);
  assert.deepEqual(duplicate.map(result => result.kind).sort(), ["in_progress", "send"]);
  const other = await h.reserve(submission(), headers("192.0.2.2")); assert.equal(other.kind, "send");
  assert.equal((await h.reserve(submission(), headers("192.0.2.3"))).kind, "in_progress");
  for (const result of duplicate) if (result.kind === "send") await finish(result);
  await finish(other);
});

test("rolling minute and three attempts per IP apply across separate handler instances", async () => {
  const h = setup();
  const other = createContactReserver({ environment: () => h.environment, pool: () => h.database });
  for (let index = 0; index < 3; index++) {
    await finish(await (index % 2 ? other : h.reserve)(submission(), headers()));
    assert.equal((await other(submission(), headers())).kind, "rate_limited"); h.database.now += 60_000;
  }
  assert.equal((await h.reserve(submission(), headers())).kind, "rate_limited");
  h.database.now += 86_400_001;
  await finish(await h.reserve(submission(), headers()));
});

test("global rolling24h limit is atomic at 50 attempts", async () => {
  const h = setup();
  for (let index = 1; index < 50; index++) await finish(await h.reserve(submission(), headers(`192.0.2.${index}`)));
  const race = await Promise.all([h.reserve(submission(), headers("198.51.100.1")), h.reserve(submission(), headers("198.51.100.2"))]);
  assert.deepEqual(race.map(result => result.kind).sort(), ["rate_limited", "send"]);
  assert.equal([...h.database.rows.values()].reduce((total, row) => total + row.attempts, 0), 50);
});

test("failed sends can retry same UUID, consume budget and never reset original identity", async () => {
  const h = setup(), input = submission();
  await finish(await h.reserve(input, headers()), false);
  assert.equal((await h.reserve(input, headers("192.0.2.2"))).kind, "rate_limited");
  const original = [...h.database.rows.values()][0].identity_hash;
  h.database.now += 60_000; await finish(await h.reserve(input, headers("192.0.2.2")), false);
  h.database.now += 60_000; await finish(await h.reserve(input, headers("192.0.2.3")), false);
  h.database.now += 60_000; assert.equal((await h.reserve(input, headers())).kind, "expired");
  assert.equal([...h.database.rows.values()][0].identity_hash, original);
  assert.equal([...h.database.rows.values()][0].attempts, 3);
});

test("retry expires before provider24h idempotency window; old owner cannot finish a new lease", async () => {
  const h = setup(), input = submission(); const first = await h.reserve(input, headers());
  h.database.now += 60_000; const second = await h.reserve(input, headers());
  assert.equal(second.kind, "send");
  assert.equal(first.kind === "send" && await first.finish(true), false);
  await finish(second, false);
  h.database.now += 23 * 3_600_000;
  assert.equal((await h.reserve(input, headers())).kind, "expired");
});

test("database/commit errors fail closed and destroy uncertain connections", async () => {
  for (const fail of ["connect", "lock", "existing", "usage", "reserve", "COMMIT", "after-commit"]) {
    const h = setup(); h.database.fail = fail;
    assert.equal((await h.reserve(submission(), headers())).kind, "unavailable");
    if (fail !== "connect") assert.ok(h.database.destroyed > 0);
  }
  const h = setup(), input = submission(); const result = await h.reserve(input, headers());
  h.database.fail = "finish";
  assert.equal(result.kind === "send" && await result.finish(true), false);
  assert.equal([...h.database.rows.values()][0].status, "pending");
});

test("environment namespaces isolate preview, development and production with the same database", async () => {
  const h = setup();
  for (const stage of ["preview", "development", "production"]) {
    h.environment.VERCEL_ENV = stage; await finish(await h.reserve(submission(), headers()));
  }
  assert.deepEqual([...h.database.rows.values()].map(row => row.namespace), ["sajda.contact.v1:preview", "sajda.contact.v1:development", "sajda.contact.v1:production"]);
});
