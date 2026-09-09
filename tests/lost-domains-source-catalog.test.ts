import assert from "node:assert/strict";
import test from "node:test";
import { applySourceManifest, probeSourceManifest, validateSourceManifest, sourceManifestHash,
  type SourceCatalogPool, type SourceManifest } from "../api/_shared/lost-domains-source-catalog.js";
import { sourceOperatorArguments, sourceOperatorDatabase } from "../scripts/manage-lost-domains-sources.js";

const now = Date.parse("2026-09-09T10:00:00.123Z");
function manifest(): SourceManifest { return { version: 1, sources: [{ id: "10000000-0000-4000-8000-000000000001", name: "Reviewed public resources",
  url: "https://publisher.com/resources/", host: "publisher.com", review: { basis: "owner_permission", reference: "permission:operator-ticket-42",
    reviewer: "operator-1", reviewedAt: new Date(now - 1000).toISOString(), expiresAt: new Date(now + 86_400_000).toISOString() } }] }; }
function batchManifest(count: number): SourceManifest {
  return { version: 1, sources: Array.from({ length: count }, (_value, index) => ({ ...manifest().sources[0],
    id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, url: `https://publisher.com/resources/${index + 1}/` })) };
}
function database(existing?: Record<string, unknown>, failCommit = false) {
  const statements: { sql: string; values: unknown[] }[] = []; let released = false;
  const pool: SourceCatalogPool = { connect: async () => ({
    query: async (sql, values = []) => { statements.push({ sql, values });
      if (sql === "COMMIT" && failCommit) throw new Error("postgres://private-secret");
      return { rows: sql.startsWith("SELECT *") && existing ? [existing] : [] }; },
    release: () => { released = true; },
  }) };
  return { pool, statements, released: () => released };
}
function stored(enabled = false) {
  const source = manifest().sources[0];
  return { id: source.id, name: source.name, url: source.url, host: source.host, robots_url: `${source.url.split("/resources/")[0]}/robots.txt`,
    enabled, robots_policy: "allowed", policy_reviewed_at: new Date(source.review.reviewedAt), policy_expires_at: new Date(source.review.expiresAt),
    review_reference: JSON.stringify({ v: 1, basis: source.review.basis, ref: source.review.reference, by: source.review.reviewer }) };
}
const discovery = async () => ({ observedAt: new Date(now).toISOString(), candidates: [
  { domain: "alpha.dev", sourceUrl: manifest().sources[0].url, targetUrl: "https://alpha.dev/", anchor: "Never log this anchor", sensitive: false },
] });

test("operator manifest is bounded, exact, current and never an unreviewed company-domain list", () => {
  const good = validateSourceManifest(manifest(), now); assert.equal(good.sources.length, 1);
  assert.equal(sourceManifestHash(good), sourceManifestHash(validateSourceManifest(good, now)));
  for (const value of [null, [], { ...manifest(), enabled: true }, { ...manifest(), sources: [] },
    batchManifest(25), { ...manifest(), sources: [manifest().sources[0], manifest().sources[0]] }]) {
    assert.throws(() => validateSourceManifest(value, now));
  }
  for (const replacement of [{ host: "different.com" }, { url: "https://127.0.0.1/", host: "127.0.0.1" },
    { url: "https://example.com/", host: "example.com" }, { url: "https://publisher.com/resources/?secret=token" },
    { url: "https://publisher.com/resources/#anchor" }, { url: "https://user.github.io/resources/", host: "user.github.io" },
    { evidence: { liveVerified: true } }]) {
    const input = manifest(); Object.assign(input.sources[0], replacement); assert.throws(() => validateSourceManifest(input, now));
  }
});

test("a 24-source review batch still validates every exact source and expiry", () => {
  assert.equal(validateSourceManifest(batchManifest(24), now).sources.length, 24);
  for (const change of [{ host: "unreviewed.com" }, { url: "https://publisher.com/resources/?token=secret" }]) {
    const input = batchManifest(24); Object.assign(input.sources[23], change);
    assert.throws(() => validateSourceManifest(input, now), { code: "invalid_source" });
  }
  const expired = batchManifest(24); expired.sources[23].review.expiresAt = new Date(now).toISOString();
  assert.throws(() => validateSourceManifest(expired, now), { code: "review_expired" });
});

test("policy approval needs finite fresh dates, a reviewer and actual rights reference, not robots", () => {
  for (const change of [{ reviewedAt: new Date(now + 1).toISOString() }, { expiresAt: new Date(now).toISOString() },
    { expiresAt: new Date(now + 31 * 86_400_000).toISOString() }, { reviewedAt: "2026-02-30T00:00:00Z" },
    { reviewer: "" }, { basis: "assumed_public" }, { reference: "I assume it is fine" },
    { reference: "https://127.0.0.1/permission" }, { reference: "https://user:secret@publisher.com/permission" },
    { basis: "published_terms", reference: "https://publisher.com/robots.txt" }]) {
    const input = manifest(); Object.assign(input.sources[0].review, change); assert.throws(() => validateSourceManifest(input, now));
  }
  const input = manifest(); input.sources[0].review = { ...input.sources[0].review, basis: "published_terms", reference: "https://publisher.com/legal/data-reuse" };
  assert.equal(validateSourceManifest(input, now).sources[0].review.basis, "published_terms");
  const impossible = manifest();
  impossible.sources[0].review.reviewedAt = "2026-09-31T00:00:00Z";
  impossible.sources[0].review.expiresAt = "2026-10-02T00:00:00Z";
  assert.throws(() => validateSourceManifest(impossible, Date.parse("2026-10-01T00:00:00Z")), { code: "invalid_review" });
});

test("probe invokes the real source contract only and returns minimal observed evidence", async () => {
  const probes = await probeSourceManifest(manifest(), { now: () => now, discover: async input => {
    assert.deepEqual(input, { url: manifest().sources[0].url, allowedHost: "publisher.com", maxLinks: 20 }); return discovery();
  } });
  assert.equal(probes[0].candidateCount, 1); assert.equal(probes[0].registrabilityChecked, false);
  assert.match(probes[0].evidenceHash, /^[a-f0-9]{64}$/u); assert.doesNotMatch(JSON.stringify(probes), /Never log this anchor|alpha.dev/u);
  await assert.rejects(probeSourceManifest(manifest(), { now: () => now, discover: async () => ({ ...(await discovery()), observedAt: new Date(now - 61_000).toISOString() }) }), { code: "invalid_probe" });
});

test("24-source probes remain sequential and retain the per-source candidate bound", async () => {
  const input = batchManifest(24), called: string[] = []; let active = 0, peak = 0;
  const probes = await probeSourceManifest(input, { now: () => now, discover: async options => {
    active++; peak = Math.max(peak, active); called.push(options.url);
    assert.equal(options.maxLinks, 20); assert.equal(options.allowedHost, "publisher.com");
    await Promise.resolve(); active--;
    const result = await discovery(); result.candidates[0].sourceUrl = options.url;
    return result;
  } });
  assert.equal(peak, 1); assert.deepEqual(called, input.sources.map(source => source.url));
  assert.equal(probes.length, 24); assert.ok(probes.every(probe => probe.registrabilityChecked === false));
  await assert.rejects(probeSourceManifest(input, { now: () => now, discover: async () => ({ observedAt: new Date(now).toISOString(),
    candidates: Array(21).fill((await discovery()).candidates[0]) }) }), { code: "invalid_probe" });
});

test("expanding the review batch never extends live probe freshness or permits partial enablement", async () => {
  const input = batchManifest(24), db = database({ ...stored(), url: input.sources[0].url }); let clock = now, calls = 0;
  await assert.rejects(applySourceManifest(input, "enable", db.pool, { now: () => clock, discover: async options => {
    clock += 3_000; calls++;
    const result = await discovery(); result.observedAt = new Date(clock).toISOString(); result.candidates[0].sourceUrl = options.url;
    return result;
  } }), { code: "probe_expired" });
  assert.equal(calls, 24); assert.equal(db.statements.at(-1)?.sql, "ROLLBACK");
  assert.equal(db.statements.some(row => row.sql.startsWith("UPDATE")), false);
});

test("register inserts disabled sources with parameterized SQL and no network, grants or scheduling", async () => {
  const db = database();
  const result = await applySourceManifest(manifest(), "register", db.pool, { now: () => now, discover: async () => { throw new Error("No network allowed"); } });
  assert.deepEqual(result.changes, [{ id: manifest().sources[0].id, enabled: false, changed: true }]);
  assert.equal(result.grantsChanged, false); assert.equal(result.schedulerChanged, false); assert.equal(result.billingChanged, false);
  const write = db.statements.find(row => row.sql.startsWith("INSERT"))!;
  assert.match(write.sql, /false,'allowed'/u); assert.ok(!write.sql.includes("publisher.com"));
  assert.equal(write.values[2], manifest().sources[0].url); assert.equal(db.statements.at(-1)?.sql, "COMMIT"); assert.equal(db.released(), true);
  assert.ok(db.statements.every(row => !/lost_domain_access|lost_domain_runs|CREATE TABLE|DELETE FROM/iu.test(row.sql)));
});

test("registration retries preserve existing enabled sources and subsecond review timestamps", async () => {
  const db = database(stored(true));
  const result = await applySourceManifest(manifest(), "register", db.pool, { now: () => now });
  assert.deepEqual(result.changes, [{ id: manifest().sources[0].id, enabled: true, changed: false }]);
  assert.ok(!db.statements.some(row => /^(?:UPDATE|INSERT)/u.test(row.sql)));
});

test("enable requires matching registered policy and fresh in-process robots/HTML evidence", async () => {
  const db = database(stored()); let probes = 0;
  const result = await applySourceManifest(manifest(), "enable", db.pool, { now: () => now, discover: async () => { probes++; return discovery(); } });
  assert.equal(probes, 1); assert.equal(result.changes[0].enabled, true);
  const update = db.statements.find(row => row.sql.startsWith("UPDATE"))!;
  const reference = JSON.parse(String(update.values[1])); assert.equal(reference.observed, new Date(now).toISOString()); assert.match(reference.evidence, /^[a-f0-9]{64}$/u);
  assert.match(update.sql, /WHERE id=\$1::uuid/u);
  const unregistered = database();
  await assert.rejects(applySourceManifest(manifest(), "enable", unregistered.pool, { now: () => now, discover: discovery }), { code: "source_not_registered" });
  assert.equal(unregistered.statements.at(-1)?.sql, "ROLLBACK");
});

test("failed live policy check never opens a write transaction; conflicts never overwrite sources", async () => {
  const db = database(stored());
  await assert.rejects(applySourceManifest(manifest(), "enable", db.pool, { now: () => now, discover: async () => { throw new Error("robots_disallowed"); } }));
  assert.equal(db.statements.length, 0);
  for (const change of [{ url: "https://changed.com/" }, { name: "Changed name" }, { review_reference: "Old unstructured approval" }, { policy_expires_at: new Date(now + 1000) }]) {
    const conflict = database({ ...stored(), ...change });
    await assert.rejects(applySourceManifest(manifest(), "register", conflict.pool, { now: () => now }), { code: "existing_source_conflict" });
    assert.equal(conflict.statements.at(-1)?.sql, "ROLLBACK"); assert.ok(!conflict.statements.some(row => row.sql.startsWith("UPDATE")));
  }
});

test("uncertain database errors are sanitized, rolled back and never rerun provider probes", async () => {
  const db = database(stored(), true); let probes = 0;
  await assert.rejects(applySourceManifest(manifest(), "enable", db.pool, { now: () => now, discover: async () => { probes++; return discovery(); } }), { code: "catalog_database_unavailable" });
  assert.equal(probes, 1); assert.equal(db.statements.at(-1)?.sql, "ROLLBACK"); assert.equal(db.released(), true);
});

test("operator CLI denies missing consent flags, broad actions and database-target mismatch", () => {
  assert.equal(sourceOperatorArguments([]).action, "help");
  assert.equal(sourceOperatorArguments(["plan", "--manifest", "reviewed.json"]).action, "plan");
  for (const argv of [["enable", "--manifest", "reviewed.json"], ["register", "--manifest", "reviewed.json", "--apply"],
    ["index", "--host", "publisher.com", "--prefix", "/docs/", "--collection", "CC-MAIN-2026-34"], ["enable-all"],
    ["plan", "--manifest", "a.json", "--manifest", "b.json"], ["plan", "--manifest", "a.json", "--apply"]]) assert.throws(() => sourceOperatorArguments(argv));
  const env = { DATABASE_URL_UNPOOLED: "postgresql://user:secret@ep-reviewed.neon.tech/neondb?options=unsafe&sslmode=disable" };
  const url = new URL(sourceOperatorDatabase(env, "ep-reviewed.neon.tech"));
  assert.equal(url.searchParams.get("sslmode"), "verify-full"); assert.equal(url.searchParams.has("options"), false);
  assert.throws(() => sourceOperatorDatabase(env, "ep-other.neon.tech"));
  assert.throws(() => sourceOperatorDatabase({ DATABASE_URL_UNPOOLED: "postgresql://user:secret@localhost/neondb" }, "localhost"));
});
