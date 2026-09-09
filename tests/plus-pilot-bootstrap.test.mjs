import assert from 'node:assert/strict';
import test from 'node:test';
import { pilotDatabase, createPilot, PILOT_EMAIL } from '../scripts/create-plus-pilot.mjs';

const env = { NEON_PROJECT_ID: 'spring-paper-89655503',
  DATABASE_URL_UNPOOLED: 'postgresql://fixture:fixture@ep-fixture.eu-central-1.aws.neon.tech/neondb' };
test('pilot bootstrap only targets the reviewed non-production direct Neon connection', () => {
  assert.equal(new URL(pilotDatabase(env)).searchParams.get('sslmode'), 'verify-full');
  assert.throws(() => pilotDatabase({ ...env, VERCEL_ENV: 'production' }));
  assert.throws(() => pilotDatabase({ ...env, NEON_PROJECT_ID: 'other-project' }));
  assert.throws(() => pilotDatabase({ ...env, DATABASE_URL_UNPOOLED: 'postgresql://a:b@localhost/database' }));
  assert.throws(() => pilotDatabase({ ...env, DATABASE_URL_UNPOOLED: env.DATABASE_URL_UNPOOLED.replace('ep-fixture.', 'ep-fixture-pooler.') }));
});
test('default pilot plan creates no account, connection, secret, schedule or billing', async () => {
  const plan = await createPilot(env);
  assert.equal(plan.mode, 'plan');
  assert.equal(plan.identity, PILOT_EMAIL);
  assert.match(PILOT_EMAIL, /@sajda\.test$/u);
  assert.equal(plan.expiryDays, 7);
  assert.equal(plan.billing, false);
  assert.equal(plan.autoCrawl, false);
  assert.equal(plan.existingIdentitiesChanged, false);
  assert.equal('password' in plan, false);
});
