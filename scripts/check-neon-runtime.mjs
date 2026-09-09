/** Read-only connection/schema check; never prints credentials or row contents. */
import { neon } from '@neondatabase/serverless';

try {
  const expectedProject = process.env.SAJDA_EXPECTED_NEON_PROJECT;
  if (!expectedProject || process.env.NEON_PROJECT_ID !== expectedProject) throw new Error('Database project identity does not match the explicitly selected resource.');
  const direct = new URL(process.env.DATABASE_URL_UNPOOLED);
  const pooled = new URL(process.env.DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(direct.protocol) || !direct.hostname.endsWith('.neon.tech')
    || direct.hostname.split('.')[0].endsWith('-pooler')
    || pooled.hostname.replace('-pooler.', '.') !== direct.hostname
    || pooled.username !== direct.username || pooled.pathname !== direct.pathname) {
    throw new Error('Expected matching Neon runtime and direct migration connections.');
  }
  const sql = neon(process.env.DATABASE_URL_UNPOOLED);
  const tables = await sql.query("SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema IN ('sajda', 'public') AND table_type = 'BASE TABLE' ORDER BY 1, 2");
  const roles = await sql.query("SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled, c.relowner = r.oid AS current_role_is_owner, r.rolbypassrls AS current_role_bypasses_rls FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.rolname=current_user WHERE n.nspname='sajda' AND c.relkind='r' ORDER BY c.relname");
  const counts = {};
  for (const name of ['schema_migrations', 'saved_domains', 'job_runs', 'function_rate_limits']) {
    if (tables.some(table => table.table_schema === 'sajda' && table.table_name === name)) {
      counts[name] = Number((await sql.query(`SELECT count(*) AS count FROM sajda.${name}`))[0].count);
    }
  }
  console.log(JSON.stringify({ database: 'connected', expectedProject: true, directMigrationConnection: true,
    pooledRuntimeConnection: pooled.hostname.includes('-pooler.'), tables, roles, counts }, null, 2));
} catch (error) {
  const safe = error instanceof Error && /^(Database project|Expected matching)/.test(error.message);
  console.error(safe ? error.message : 'Neon runtime check failed. No database changes were made; inspect connectivity and environment configuration.');
  process.exitCode = 1;
}
