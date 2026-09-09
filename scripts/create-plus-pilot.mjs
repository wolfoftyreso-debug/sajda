/**
 * Explicit operator bootstrap for one isolated, synthetic Plus test identity.
 * Never changes an existing identity, sends mail, grants an admin role, enables
 * billing, starts a crawl, or configures a schedule. Credentials print once.
 */
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { Pool } from 'pg';
import { hashPassword, verifyPassword } from 'better-auth/crypto';

export const PILOT_EMAIL = 'plus-pilot-20260909@sajda.test';
export const PILOT_REFERENCE = 'operator-request-plus-test-2026-09-09';
export function pilotDatabase(env) {
  assert.notEqual(env.VERCEL_ENV, 'production', 'Production bootstrap is forbidden');
  assert.equal(env.NEON_PROJECT_ID, 'spring-paper-89655503', 'Wrong reviewed Neon project');
  const url = new URL(env.DATABASE_URL_UNPOOLED);
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
  assert.ok(url.hostname.endsWith('.neon.tech') && !url.hostname.includes('-pooler.'));
  assert.ok(url.username && url.password && url.pathname.length > 1);
  url.searchParams.set('sslmode', 'verify-full');
  return url.toString();
}

export async function createPilot(env, apply = false) {
  const connectionString = pilotDatabase(env);
  if (!apply) return { mode: 'plan', identity: PILOT_EMAIL, expiryDays: 7,
    reviewedProject: true, syntheticIdentity: true, existingIdentitiesChanged: false,
    source: 'https://example.com/', autoCrawl: false, billing: false };
  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 8000, query_timeout: 8000 });
  const password = `Sajda-${randomBytes(18).toString('base64url')}`;
  const passwordHash = await hashPassword(password);
  assert.equal(await verifyPassword({ password, hash: passwordHash }), true);
  const id = randomUUID(), sourceId = randomUUID(), expiresAt = new Date(Date.now() + 7 * 86400_000).toISOString();
  let client, transactionOpen = false;
  try {
    client = await pool.connect();
    await client.query('BEGIN'); transactionOpen = true;
    await client.query("SET LOCAL statement_timeout='8s'");
    const existing = await client.query('SELECT id FROM public.sajda_auth_user WHERE email=$1', [PILOT_EMAIL]);
    assert.equal(existing.rows.length, 0, 'Pilot identity already exists; credentials are never overwritten');
    const source = await client.query('SELECT id FROM sajda.lost_domain_sources WHERE url=$1', ['https://example.com/']);
    assert.equal(source.rows.length, 0, 'Source already exists; its approval is never overwritten');
    // This reserved .test address is an operator-owned synthetic login, not a
    // claim that somebody controls a real mailbox. Public signup verification
    // and all ordinary account security remain unchanged.
    await client.query(`INSERT INTO public.sajda_auth_user (id,name,email,"emailVerified")
      VALUES($1,$2,$3,true)`, [id, 'Sajda Plus pilot — operator test', PILOT_EMAIL]);
    await client.query(`INSERT INTO public.sajda_auth_account
      (id,"accountId","providerId","userId",password) VALUES($1,$2,'credential',$2,$3)`,
    [randomUUID(), id, passwordHash]);
    await client.query(`INSERT INTO sajda.lost_domain_access
      (owner_id,grant_source,source_reference,daily_refresh,expires_at)
      VALUES($1,'operator',$2,false,$3::timestamptz)`, [id, PILOT_REFERENCE, expiresAt]);
    await client.query(`INSERT INTO sajda.lost_domain_sources
      (id,name,url,host,robots_url,enabled,robots_policy,policy_reviewed_at,policy_expires_at,review_reference)
      VALUES($1,$2,'https://example.com/','example.com','https://example.com/robots.txt',true,'allowed',now(),$3::timestamptz,$4)`,
    [sourceId, 'Pilotkontroll: example.com (inte en fyndkälla)', expiresAt,
      'Bounded operator-requested seven-day non-production smoke source. IANA example-domains documentation reviewed; live robots required. No production dependency or schedule.']);
    await client.query('COMMIT'); transactionOpen = false;
    return { mode: 'created', id, email: PILOT_EMAIL, password, expiresAt, sourceId,
      syntheticIdentity: true, admin: false, autoCrawl: false, billing: false, currentRunCount: 0 };
  } finally {
    if (transactionOpen) await client?.query('ROLLBACK').catch(() => {});
    client?.release();
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(await createPilot(process.env, process.argv.includes('--apply')))); }
  catch { console.error('Pilot bootstrap stopped. No credentials or database details are logged; verify the reviewed environment and existing identity/source before retrying.'); process.exitCode = 1; }
}
