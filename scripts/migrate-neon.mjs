import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Pool } from "@neondatabase/serverless";

const migrationDirectory = fileURLToPath(new URL("../db/migrations/", import.meta.url));

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
    if (!source) throw new Error(`Database contains an unknown migration: ${row.id}. Check the target project and checkout.`);
    if (!row.checksum || row.checksum !== source.checksum) throw new Error(`Migration checksum mismatch: ${row.id}. Do not rewrite an applied migration.`);
    appliedIds.add(row.id);
  }
  const pending = migrations.filter(migration => !appliedIds.has(migration.id));
  const firstPending = pending[0]?.id;
  if (firstPending && applied.some(row => row.id > firstPending)) throw new Error("Out-of-order migrations require manual review.");
  return pending;
}

export async function runMigrations(mode) {
  if (!["--plan", "--check", "--apply"].includes(mode)) throw new Error("Use --plan (local only), --check (read-only database), or --apply (transactional database changes).");
  const migrations = await readMigrations();
  if (mode === "--plan") {
    console.log(JSON.stringify({ mode: "local-plan", migrations: migrations.map(({ id, checksum }) => ({ id, checksum })) }, null, 2));
    return;
  }
  const connectionString = process.env.DATABASE_URL_UNPOOLED?.trim();
  if (!connectionString) throw new Error("DATABASE_URL_UNPOOLED is required. No database was changed.");
  const target = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(target.protocol) || !target.hostname.endsWith(".neon.tech")) {
    throw new Error("Expected a Neon PostgreSQL connection string. No database was changed.");
  }
  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 10_000 });
  let client;
  try {
    client = await pool.connect();
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
      summary = { mode: "database-check", applied: applied.length, pending: pending.map(({ id }) => id) };
    } else {
      for (const migration of pending) {
        await client.query(migration.sql);
        await client.query("INSERT INTO sajda.schema_migrations (id, checksum) VALUES ($1, $2)", [migration.id, migration.checksum]);
      }
      summary = { mode: "applied", applied: pending.map(({ id }) => id) };
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
  runMigrations(process.argv[2]).catch(error => {
    // Deliberately exclude raw provider errors, SQL, and the connection string.
    const safe = error instanceof Error && /^(?:Use |DATABASE_URL_UNPOOLED |Expected a Neon |Migration |Database contains |Out-of-order |The legacy migration)/u.test(error.message);
    console.error(safe ? error.message : "Neon migration failed and was rolled back. Check connectivity, privileges, and the database logs.");
    process.exitCode = 1;
  });
}
