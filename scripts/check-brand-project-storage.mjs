/** Read-only metadata preflight. No account reads, writes, migrations or secrets in output. */
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { Pool } from "pg";

const sourceFile = process.argv[2];
const env = sourceFile ? parseEnv(readFileSync(sourceFile, "utf8")) : process.env;
const flag = key => env[key] === undefined ? "unset" : env[key] === "true" ? "enabled" : env[key] === "false" ? "disabled" : "invalid";
const flags = { server: flag("SAJDA_NAME_PROJECTS_ENABLED"), client: flag("VITE_SAJDA_NAME_PROJECTS_ENABLED") };
if (!env.DATABASE_URL) {
  console.log(JSON.stringify({ event: "brand_project_storage_preflight", flags, database: "not_configured", mutations: 0 }));
  process.exitCode = 1;
} else {
  let pool, client;
  try {
    const url = new URL(env.DATABASE_URL);
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname.endsWith(".neon.tech")) throw new Error("unexpected_database");
    url.searchParams.set("sslmode", "verify-full"); url.searchParams.delete("options");
    pool = new Pool({ connectionString: url.toString(), max: 1, connectionTimeoutMillis: 8000, query_timeout: 10000, allowExitOnIdle: true });
    client = await pool.connect();
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL statement_timeout='8000ms'; SET LOCAL idle_in_transaction_session_timeout='10000ms'");
    const tables = await client.query(`SELECT name, to_regclass(name) IS NOT NULL AS present FROM unnest(ARRAY['sajda.name_projects','sajda.name_project_domains','sajda.saved_domains','public.sajda_auth_user']) AS t(name)`);
    const security = await client.query(`SELECT c.relname, c.relrowsecurity, array_agg(pg_get_constraintdef(k.oid)) AS constraints
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_constraint k ON k.conrelid=c.oid
      WHERE n.nspname='sajda' AND c.relname IN ('name_projects','name_project_domains') GROUP BY c.oid,c.relname,c.relrowsecurity`);
    await client.query("ROLLBACK");
    const byName = new Map(security.rows.map(row => [row.relname, row]));
    const constraints = name => (byName.get(name)?.constraints ?? []).filter(Boolean).join("\n");
    const checks = {
      tablesPresent: tables.rows.every(row => row.present),
      projectRls: byName.get("name_projects")?.relrowsecurity === true,
      referenceRls: byName.get("name_project_domains")?.relrowsecurity === true,
      payloadLimit: /octet_length\(\(payload\)::text\) <= 32768|octet_length\(payload::text\) <= 32768/u.test(constraints("name_projects")),
      ownerForeignKey: /FOREIGN KEY \(owner_id\) REFERENCES sajda_auth_user|FOREIGN KEY \(owner_id\) REFERENCES public\.sajda_auth_user/u.test(constraints("name_projects")),
      referenceOwnerKey: /FOREIGN KEY \(owner_id, domain\) REFERENCES sajda\.saved_domains/u.test(constraints("name_project_domains")),
    };
    console.log(JSON.stringify({ event: "brand_project_storage_preflight", flags, database: "reachable", checks, ready: Object.values(checks).every(Boolean), mutations: 0, userRowsRead: 0 }));
    if (!Object.values(checks).every(Boolean)) process.exitCode = 1;
  } catch {
    console.log(JSON.stringify({ event: "brand_project_storage_preflight", flags, database: "not_verified", mutations: 0, userRowsRead: 0 }));
    process.exitCode = 1;
  } finally { client?.release(); await pool?.end(); }
}
