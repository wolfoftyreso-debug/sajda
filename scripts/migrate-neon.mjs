import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { TLSSocket } from "node:tls";
// Operator CLI uses PostgreSQL TCP/TLS, not the serverless WebSocket proxy:
// sslmode=verify-full must actually reach a certificate-verifying driver.
import { Pool } from "pg";

const migrationDirectory = fileURLToPath(new URL("../db/migrations/", import.meta.url));
const projectLink = fileURLToPath(new URL("../.vercel/project.json", import.meta.url));
export const MIGRATION_PROJECT = Object.freeze({ projectId: "prj_UO900Jp4qJF1eS4hkOrebIzwMVlI", orgId: "team_GP2MTfBKmxj8ajYLvQtV7clA" });
const ensureTarget = (condition) => { if (!condition) throw new Error("Migration target mismatch. Review the environment, project and exact database identity; no database was changed."); };

/** A Neon hostname alone is not a target fence. The reviewed manifest contains
 * non-secret identities only; credentials stay in the injected environment. */
export function migrationTarget(manifest, env, linkedProject) {
  const fields = ["version", "environment", "vercelProjectId", "vercelOrgId", "neonProjectId", "directHostname", "databaseName", "role", "productionHostname", "productionDatabaseName"];
  ensureTarget(manifest && typeof manifest === "object" && !Array.isArray(manifest)
    && Object.keys(manifest).length === fields.length && fields.every(field => Object.hasOwn(manifest, field))
    && manifest.version === 1 && ["preview", "production"].includes(manifest.environment)
    && manifest.vercelProjectId === MIGRATION_PROJECT.projectId && manifest.vercelOrgId === MIGRATION_PROJECT.orgId
    && linkedProject?.projectId === manifest.vercelProjectId && linkedProject?.orgId === manifest.vercelOrgId
    && typeof manifest.neonProjectId === "string" && /^[a-z0-9-]{3,100}$/u.test(manifest.neonProjectId)
    && env.NEON_PROJECT_ID === manifest.neonProjectId);
  if (env.VERCEL_ENV !== undefined) ensureTarget(env.VERCEL_ENV === manifest.environment);
  if (env.VERCEL_PROJECT_ID !== undefined) ensureTarget(env.VERCEL_PROJECT_ID === manifest.vercelProjectId);
  if (env.VERCEL_ORG_ID !== undefined) ensureTarget(env.VERCEL_ORG_ID === manifest.vercelOrgId);
  const hostname = value => typeof value === "string" && /^ep-[a-z0-9-]+\.[a-z0-9.-]+\.neon\.tech$/u.test(value)
    && !value.includes("-pooler.") && !value.includes("..");
  const identifier = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,63}$/u.test(value);
  ensureTarget(hostname(manifest.directHostname) && hostname(manifest.productionHostname)
    && identifier(manifest.databaseName) && identifier(manifest.productionDatabaseName) && identifier(manifest.role));
  const productionIdentity = `${manifest.productionHostname}/${manifest.productionDatabaseName}`;
  const requestedIdentity = `${manifest.directHostname}/${manifest.databaseName}`;
  ensureTarget(manifest.environment === "production" ? requestedIdentity === productionIdentity : requestedIdentity !== productionIdentity);
  if (manifest.environment === "production") ensureTarget(env.SAJDA_PRODUCTION_NEON_PROJECT === manifest.neonProjectId);
  let direct, pooled;
  try { direct = new URL(env.DATABASE_URL_UNPOOLED); pooled = new URL(env.DATABASE_URL); }
  catch { ensureTarget(false); }
  for (const url of [direct, pooled]) ensureTarget(["postgres:", "postgresql:"].includes(url.protocol)
    && url.username && url.password && !url.hash && (!url.port || url.port === "5432")
    && [...url.searchParams.keys()].every(key => ["sslmode", "channel_binding"].includes(key)));
  ensureTarget(direct.hostname === manifest.directHostname && pooled.hostname === manifest.directHostname.replace(".", "-pooler.")
    && direct.pathname === `/${manifest.databaseName}` && pooled.pathname === direct.pathname
    && direct.username === encodeURIComponent(manifest.role) && pooled.username === direct.username && pooled.password === direct.password);
  direct.searchParams.set("sslmode", "verify-full");
  return { connectionString: direct.toString(), environment: manifest.environment };
}

export function migrationPlanHash(migrations) {
  return createHash("sha256").update(JSON.stringify(migrations.map(({ id, checksum }) => ({ id, checksum })))).digest("hex");
}

export function migrationArguments(argv) {
  const [mode, ...rest] = argv;
  if (!["--plan", "--check", "--apply"].includes(mode)) throw new Error("Use --plan, --check --target <reviewed.json>, or --apply --target <reviewed.json> --reviewed-plan <sha256>.");
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index], value = rest[index + 1];
    if (!["--target", "--reviewed-plan"].includes(key) || Object.hasOwn(options, key) || !value || value.startsWith("--")) throw new Error("Use only the documented migration arguments, with no duplicate options.");
    options[key] = value;
  }
  if (mode === "--plan" && rest.length || mode !== "--plan" && !options["--target"]
    || mode === "--check" && options["--reviewed-plan"] || mode === "--apply" && !/^[a-f0-9]{64}$/u.test(options["--reviewed-plan"] ?? "")) throw new Error("Use --plan, --check --target <reviewed.json>, or --apply --target <reviewed.json> --reviewed-plan <sha256>.");
  return { mode, targetPath: options["--target"], reviewedPlan: options["--reviewed-plan"] };
}

export async function readMigrations(directory = migrationDirectory) {
  const names = (await readdir(directory)).filter(name => /^\d{4}_[a-z0-9_]+\.sql$/u.test(name)).sort();
  return Promise.all(names.map(async id => {
    const sql = (await readFile(resolve(directory, id), "utf8")).replace(/^\uFEFF/u, "").replace(/\r\n/gu, "\n");
    // The runner owns a single transaction for the complete release.
    if (/^\s*(?:BEGIN|COMMIT|ROLLBACK|VACUUM)\b/imu.test(sql) || /\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY\b/iu.test(sql)) {
      throw new Error(`Migration ${id} contains a transaction-incompatible command.`);
    }
    return { id, sql, checksum: createHash("sha256").update(sql).digest("hex") };
  }));
}

export function pendingMigrations(migrations, applied) {
  const byId = new Map(migrations.map(migration => [migration.id, migration]));
  const appliedIds = new Set();
  for (const row of applied) {
    const source = byId.get(row.id);
    if (!source) throw new Error("Database contains an unknown migration. Check the target project and checkout; untrusted ledger contents are omitted.");
    if (!row.checksum || row.checksum !== source.checksum) throw new Error(`Migration checksum mismatch: ${row.id}. Do not rewrite an applied migration.`);
    appliedIds.add(row.id);
  }
  const pending = migrations.filter(migration => !appliedIds.has(migration.id));
  const firstPending = pending[0]?.id;
  if (firstPending && applied.some(row => row.id > firstPending)) throw new Error("Out-of-order migrations require manual review.");
  return pending;
}

export async function runMigrations(mode, { targetPath, reviewedPlan } = {}) {
  if (!["--plan", "--check", "--apply"].includes(mode)) throw new Error("Use --plan (local only), --check (read-only database), or --apply (transactional database changes).");
  const migrations = await readMigrations();
  if (mode === "--plan") {
    console.log(JSON.stringify({ mode: "local-plan", planSha256: migrationPlanHash(migrations), migrations: migrations.map(({ id, checksum }) => ({ id, checksum })) }, null, 2));
    return;
  }
  ensureTarget(typeof targetPath === "string" && targetPath.length > 0);
  const targetBytes = await readFile(resolve(targetPath));
  ensureTarget(targetBytes.length <= 4096);
  let manifest, linkedProject;
  try { manifest = JSON.parse(targetBytes.toString("utf8")); linkedProject = JSON.parse(await readFile(projectLink, "utf8")); }
  catch { ensureTarget(false); }
  const { connectionString, environment } = migrationTarget(manifest, process.env, linkedProject);
  const planSha256 = migrationPlanHash(migrations);
  if (mode === "--apply") ensureTarget(reviewedPlan === planSha256);
  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 10_000, query_timeout: 35_000 });
  let client;
  try {
    client = await pool.connect();
    // Neon terminates client TLS at its proxy; backend pg_stat_ssl can be false.
    // Check the actual client socket/certificate, not the proxy's internal hop.
    ensureTarget(client.connection?.stream instanceof TLSSocket && client.connection.stream.encrypted === true && client.connection.stream.authorized === true);
    const identity = await client.query("SELECT current_database() AS database_name, current_user AS role_name");
    ensureTarget(identity.rows[0]?.database_name === manifest.databaseName && identity.rows[0]?.role_name === manifest.role);
    await client.query(mode === "--check" ? "BEGIN READ ONLY" : "BEGIN");
    await client.query("SET LOCAL statement_timeout = '30s'");
    await client.query("SET LOCAL lock_timeout = '5s'");
    // Lock this application only; concurrent deploys cannot apply a file twice.
    await client.query("SELECT pg_advisory_xact_lock(1935764052, 1)");
    if (mode === "--apply") {
      await client.query("CREATE SCHEMA IF NOT EXISTS sajda");
      await client.query("CREATE TABLE IF NOT EXISTS sajda.schema_migrations (id text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())");
      await client.query("ALTER TABLE sajda.schema_migrations ADD COLUMN IF NOT EXISTS checksum text");
    }
    const exists = await client.query("SELECT to_regclass('sajda.schema_migrations') IS NOT NULL AS present");
    let applied = [];
    if (exists.rows[0].present) {
      const columns = await client.query("SELECT 1 FROM information_schema.columns WHERE table_schema = 'sajda' AND table_name = 'schema_migrations' AND column_name = 'checksum'");
      if (!columns.rowCount) throw new Error("The legacy migration ledger has no checksums. A reviewed baseline is required; no migrations were applied.");
      applied = (await client.query("SELECT id, checksum FROM sajda.schema_migrations ORDER BY id")).rows;
    }
    const pending = pendingMigrations(migrations, applied);
    let summary;
    if (mode === "--check") {
      summary = { mode: "database-check", environment, planSha256, tcpTlsVerified: true, actualDatabaseAndRoleMatched: true, applied: applied.length, pending: pending.map(({ id }) => id) };
    } else {
      for (const migration of pending) {
        await client.query(migration.sql);
        await client.query("INSERT INTO sajda.schema_migrations (id, checksum) VALUES ($1, $2)", [migration.id, migration.checksum]);
      }
      summary = { mode: "applied", environment, planSha256, tcpTlsVerified: true, actualDatabaseAndRoleMatched: true, applied: pending.map(({ id }) => id) };
    }
    await client.query("COMMIT");
    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client?.release();
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  Promise.resolve().then(() => {
    const { mode, ...options } = migrationArguments(process.argv.slice(2));
    return runMigrations(mode, options);
  }).catch(error => {
    // Deliberately exclude raw provider errors, SQL, and the connection string.
    const safe = error instanceof Error && /^(?:Use |DATABASE_URL_UNPOOLED |Expected a Neon |Migration |Database contains |Out-of-order |The legacy migration)/u.test(error.message);
    // A lost COMMIT acknowledgement or failed rollback is an unknown outcome,
    // not evidence that a remote transaction was rolled back successfully.
    console.error(safe ? error.message : "Neon migration completion could not be confirmed. Run the fenced --check before retrying and inspect the database logs; do not assume rollback.");
    process.exitCode = 1;
  });
}
