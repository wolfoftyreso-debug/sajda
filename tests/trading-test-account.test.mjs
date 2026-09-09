import assert from 'node:assert/strict';
import test from 'node:test';
import { createTradingTestAccount, TRADING_TEST_EMAIL } from '../scripts/create-trading-test-account.mjs';

const env = { NEON_PROJECT_ID: 'spring-paper-89655503',
  DATABASE_URL_UNPOOLED: 'postgresql://fixture:fixture@ep-fixture.eu-central-1.aws.neon.tech/neondb' };

test('Trading login bootstrap defaults to a secret-free plan with no connection or work', async () => {
  const plan = await createTradingTestAccount(env);
  assert.equal(plan.mode, 'plan');
  assert.equal(plan.email, TRADING_TEST_EMAIL);
  assert.match(plan.email, /@sajda\.test$/u);
  assert.equal(plan.expiryDays, 7);
  for (const flag of ['existingIdentitiesChanged', 'sourcesChanged', 'admin', 'billing', 'autoCrawl'])
    assert.equal(plan[flag], false);
  assert.equal('password' in plan, false);
});

test('Trading login bootstrap rejects production and unreviewed databases before any work', async () => {
  await assert.rejects(createTradingTestAccount({ ...env, VERCEL_ENV: 'production' }, true));
  await assert.rejects(createTradingTestAccount({ ...env, NEON_PROJECT_ID: 'different-project' }, true));
});
