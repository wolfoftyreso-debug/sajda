/** Operator-only, finite non-production Trading login. No source, billing,
 * admin, schedule or existing-account changes. Secret is returned once.
 */
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { Pool } from 'pg';
import { hashPassword, verifyPassword } from 'better-auth/crypto';
import { pilotDatabase } from './create-plus-pilot.mjs';

export const TRADING_TEST_EMAIL = 'trading-test-20260909@sajda.test';
export const TRADING_TEST_REFERENCE = 'operator-request-trading-login-2026-09-09';

export async function createTradingTestAccount(env, apply = false) {
  const connectionString = pilotDatabase(env);
  if (!apply) return { mode: 'plan', email: TRADING_TEST_EMAIL, expiryDays: 7,
    syntheticIdentity: true, existingIdentitiesChanged: false, sourcesChanged: false,
    admin: false, billing: false, autoCrawl: false };
  const password = `Sajda-${randomBytes(18).toString('base64url')}`;
  const hash = await hashPassword(password);
  assert.equal(await verifyPassword({ password, hash }), true);
  const id = randomUUID();
  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 8000, query_timeout: 8000 });
  let client, transactionOpen = false;
  try {
    client = await pool.connect();
    await client.query('BEGIN'); transactionOpen = true;
    await client.query("SET LOCAL statement_timeout='8s'");
    const existing = await client.query('SELECT id FROM public.sajda_auth_user WHERE email=$1', [TRADING_TEST_EMAIL]);
    assert.equal(existing.rows.length, 0, 'Test identity already exists; never overwrite its credentials');
    // Reserved .test identity: no real mailbox ownership or production signup
    // verification is asserted or bypassed. No customer identity is modified.
    await client.query(`INSERT INTO public.sajda_auth_user (id,name,email,"emailVerified")
      VALUES($1,$2,$3,true)`, [id, 'Sajda Trading — operator test', TRADING_TEST_EMAIL]);
    await client.query(`INSERT INTO public.sajda_auth_account
      (id,"accountId","providerId","userId",password) VALUES($1,$2,'credential',$2,$3)`,
    [randomUUID(), id, hash]);
    const grant = await client.query(`INSERT INTO sajda.lost_domain_access
      (owner_id,grant_source,source_reference,daily_refresh,expires_at)
      VALUES($1,'operator',$2,false,now()+interval '7 days') RETURNING expires_at`,
    [id, TRADING_TEST_REFERENCE]);
    const access = await client.query(`SELECT namespace,daily_refresh FROM sajda.lost_domain_effective_access
      WHERE owner_id=$1 AND namespace='preview' AND revoked_at IS NULL
      AND valid_from<=now() AND expires_at>now()`, [id]);
    assert.equal(access.rows.length, 1, 'Preview grant must be effective');
    assert.equal(access.rows[0].daily_refresh, false);
    await client.query('COMMIT'); transactionOpen = false;
    return { mode: 'created', id, email: TRADING_TEST_EMAIL, password,
      expiresAt: grant.rows[0].expires_at.toISOString(), previewAccess: true,
      syntheticIdentity: true, existingIdentitiesChanged: false, sourcesChanged: false,
      admin: false, billing: false, autoCrawl: false };
  } finally {
    if (transactionOpen) await client?.query('ROLLBACK').catch(() => {});
    client?.release();
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(await createTradingTestAccount(process.env, process.argv.includes('--apply')))); }
  catch { console.error('Trading test bootstrap stopped. No credentials or database details logged. Inspect the reviewed non-production environment before retrying.'); process.exitCode = 1; }
}
