import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { MIGRATION_PROJECT, migrationArguments, migrationPlanHash, migrationTarget, pendingMigrations, readMigrations } from "../scripts/migrate-neon.mjs";

test("migration plan is deterministic, checksummed and limited to Neon files", async () => {
  const migrations = await readMigrations();
  assert.ok(migrations.length >= 2);
  assert.ok(migrations.every(row => /^[a-f0-9]{64}$/u.test(row.checksum)));
  assert.equal(new Set(migrations.map(row => row.id)).size, migrations.length);
  assert.deepEqual(pendingMigrations(migrations, []), migrations);
  assert.deepEqual(pendingMigrations(migrations, migrations.map(({ id, checksum }) => ({ id, checksum }))), []);
});

function configuration(environment = "preview") {
  const host = environment === "preview" ? "ep-preview.eu.neon.tech" : "ep-production.eu.neon.tech";
  const manifest = { version: 1, environment, vercelProjectId: MIGRATION_PROJECT.projectId, vercelOrgId: MIGRATION_PROJECT.orgId,
    neonProjectId: "reviewed-neon-project", directHostname: host, databaseName: "neondb", role: "neondb_owner",
    productionHostname: "ep-production.eu.neon.tech", productionDatabaseName: "neondb" };
  const env = { NEON_PROJECT_ID: manifest.neonProjectId, VERCEL_ENV: environment,
    SAJDA_PRODUCTION_NEON_PROJECT: manifest.neonProjectId,
    DATABASE_URL_UNPOOLED: `postgresql://neondb_owner:synthetic@${host}/neondb?sslmode=require&channel_binding=require`,
    DATABASE_URL: `postgresql://neondb_owner:synthetic@${host.replace(".", "-pooler.")}/neondb?sslmode=require` };
  return { manifest, env, linkedProject: MIGRATION_PROJECT };
}
const target = ({ manifest, env, linkedProject }) => migrationTarget(manifest, env, linkedProject);

test("migration target binds reviewed nonsecret identities, pool/direct connections and TLS", () => {
  for (const environment of ["preview", "production"]) {
    const actual = target(configuration(environment));
    assert.equal(actual.environment, environment);
    assert.equal(new URL(actual.connectionString).searchParams.get("sslmode"), "verify-full");
  }
  const value = configuration();
  for (const override of [{}, { projectId: "foreign", orgId: MIGRATION_PROJECT.orgId }, { projectId: MIGRATION_PROJECT.projectId, orgId: "foreign" }]) {
    assert.throws(() => target({ ...value, linkedProject: override }), /Migration target mismatch/u);
  }
  for (const override of [{ NEON_PROJECT_ID: undefined }, { NEON_PROJECT_ID: "wrong" }, { VERCEL_ENV: "production" }, { VERCEL_PROJECT_ID: "other" }, { VERCEL_ORG_ID: "other" }]) {
    assert.throws(() => target({ ...value, env: { ...value.env, ...override } }), /Migration target mismatch/u);
  }
  assert.throws(() => target({ ...configuration("production"), env: { ...configuration("production").env, SAJDA_PRODUCTION_NEON_PROJECT: undefined } }), /Migration target mismatch/u);
});

test("migration target cannot substitute Production, pooled role/database or unsafe connection settings", () => {
  const value = configuration();
  for (const override of [{ directHostname: "ep-production.eu.neon.tech" }, { environment: "development" }, { version: 2 }, { extra: "unreviewed" }, { role: "another_role" }, { databaseName: "another_database" }, { productionHostname: "invalid" }]) {
    assert.throws(() => target({ ...value, manifest: { ...value.manifest, ...override } }), /Migration target mismatch/u);
  }
  for (const DATABASE_URL_UNPOOLED of ["not-url", "postgresql://neondb_owner@ep-preview.eu.neon.tech/neondb", "postgresql://neondb_owner:synthetic@ep-preview-pooler.eu.neon.tech/neondb",
    "postgresql://neondb_owner:synthetic@ep-preview.eu.neon.tech:5555/neondb", "postgresql://neondb_owner:synthetic@ep-preview.eu.neon.tech/neondb?options=arbitrary",
    "postgresql://neondb_owner:synthetic@ep-preview.eu.neon.tech/neondb#secret", "https://neondb_owner:synthetic@ep-preview.eu.neon.tech/neondb"]) {
    assert.throws(() => target({ ...value, env: { ...value.env, DATABASE_URL_UNPOOLED } }), /Migration target mismatch/u);
  }
  for (const DATABASE_URL of [value.env.DATABASE_URL.replace("synthetic", "different"), value.env.DATABASE_URL.replace("neondb?", "other?"), value.env.DATABASE_URL_UNPOOLED]) {
    assert.throws(() => target({ ...value, env: { ...value.env, DATABASE_URL } }), /Migration target mismatch/u);
  }
});

test("apply requires an explicit target and reviewed immutable plan hash, never ignored CLI options", () => {
  const migrations = [{ id: "0000_first.sql", checksum: "a".repeat(64) }];
  const hash = migrationPlanHash(migrations);
  assert.match(hash, /^[a-f0-9]{64}$/u);
  assert.notEqual(hash, migrationPlanHash([{ ...migrations[0], checksum: "b".repeat(64) }]));
  assert.deepEqual(migrationArguments(["--plan"]), { mode: "--plan", targetPath: undefined, reviewedPlan: undefined });
  assert.deepEqual(migrationArguments(["--check", "--target", "reviewed.json"]), { mode: "--check", targetPath: "reviewed.json", reviewedPlan: undefined });
  assert.deepEqual(migrationArguments(["--apply", "--target", "reviewed.json", "--reviewed-plan", hash]), { mode: "--apply", targetPath: "reviewed.json", reviewedPlan: hash });
  for (const args of [[], ["--apply"], ["--check"], ["--plan", "--target", "ignored.json"], ["--apply", "--target", "reviewed.json"],
    ["--apply", "--target", "reviewed.json", "--reviewed-plan", "short"], ["--check", "--target", "reviewed.json", "--reviewed-plan", hash],
    ["--check", "--target", "reviewed.json", "--target", "other.json"], ["--check", "--target", "reviewed.json", "--prod"], ["--check", "--target"]]) {
    assert.throws(() => migrationArguments(args), /^Error: Use /u);
  }
});

// Source guards protect a consequential transport choice/order from regression.
// They do not verify any live certificate, database, transaction or rollback.
test("migration source uses verified PostgreSQL TCP TLS and checks server identity before BEGIN", async () => {
  const source = await readFile(new URL("../scripts/migrate-neon.mjs", import.meta.url), "utf8");
  assert.match(source, /import \{ Pool \} from "pg"/u);
  assert.doesNotMatch(source, /from "@neondatabase\/serverless"/u);
  assert.match(source, /instanceof TLSSocket.*encrypted === true.*authorized === true/u);
  assert.match(source, /database_name === manifest\.databaseName.*role_name === manifest\.role/u);
  const certificate = source.indexOf("client.connection?.stream instanceof TLSSocket");
  const identity = source.indexOf("SELECT current_database() AS database_name, current_user AS role_name");
  const matchIdentity = source.indexOf("identity.rows[0]?.database_name === manifest.databaseName");
  const transaction = source.indexOf('await client.query(mode === "--check" ? "BEGIN READ ONLY" : "BEGIN")');
  assert.ok(certificate >= 0 && certificate < identity && identity < matchIdentity && matchIdentity < transaction);
});

test("migration source preserves unknown commit outcomes instead of promising rollback", async () => {
  const source = await readFile(new URL("../scripts/migrate-neon.mjs", import.meta.url), "utf8");
  const fallback = /console\.error\(safe \? error\.message : "([^"]+)"\)/u.exec(source)?.[1];
  assert.ok(fallback, "The operator must receive an explicit sanitized failure message");
  assert.match(fallback, /completion could not be confirmed/u);
  assert.match(fallback, /fenced --check before retrying/u);
  assert.doesNotMatch(fallback, /was rolled back|rollback succeeded|nothing was changed/u);
  const commit = source.indexOf('await client.query("COMMIT")');
  const receipt = source.indexOf("console.log(JSON.stringify(summary");
  assert.ok(commit >= 0 && receipt > commit, "Success receipts require a confirmed COMMIT response");
});

test("migration runner rejects edited, unknown, legacy and out-of-order history", () => {
  const migrations = [{ id: "0000_first.sql", checksum: "a" }, { id: "0001_next.sql", checksum: "b" }];
  assert.throws(() => pendingMigrations(migrations, [{ id: "0000_first.sql", checksum: "edited" }]), /checksum mismatch/u);
  assert.throws(() => pendingMigrations(migrations, [{ id: "0000_first.sql", checksum: null }]), /checksum mismatch/u);
  assert.throws(() => pendingMigrations(migrations, [{ id: "9000_foreign.sql", checksum: "a" }]), /unknown migration/u);
  assert.throws(() => pendingMigrations(migrations, [{ id: "postgresql://untrusted:private@ledger.invalid/database", checksum: "a" }]), error =>
    /unknown migration/u.test(error.message) && !error.message.includes("postgresql:") && !error.message.includes("private"));
  assert.throws(() => pendingMigrations(migrations, [{ id: "0001_next.sql", checksum: "b" }]), /Out-of-order/u);
});
