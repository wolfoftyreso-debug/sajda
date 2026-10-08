import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = fileURLToPath(new URL("../scripts/probe-stripe-sandbox-lifecycle.mjs", import.meta.url));

test("the external Stripe probe requires explicit local opt-in and rejects Vercel runtime markers before any fixture setup", () => {
  for (const settings of [
    { SAJDA_STRIPE_SANDBOX_LIFECYCLE: "0" },
    { SAJDA_STRIPE_SANDBOX_LIFECYCLE: "1", VERCEL: "1" },
    { SAJDA_STRIPE_SANDBOX_LIFECYCLE: "1", VERCEL_ENV: "production" },
    { SAJDA_STRIPE_SANDBOX_LIFECYCLE: "1", VERCEL_OIDC_TOKEN: "fixture-not-a-real-token" },
  ]) {
    const env = { ...process.env, VERCEL: "", VERCEL_ENV: "", VERCEL_URL: "", VERCEL_OIDC_TOKEN: "", ...settings };
    // No inherited credentials, URL or environment file are needed by this test.
    for (const key of Object.keys(env)) if (/^(?:STRIPE_|DATABASE_URL$)/u.test(key)) delete env[key];
    const result = spawnSync(process.execPath, ["--import", "tsx", script, "--stripe-cli=fixture.exe"], { env, encoding: "utf8", timeout: 30000, windowsHide: true });
    assert.equal(result.status, 1);
    const lines = result.stdout.trim().split("\n").map(value => JSON.parse(value));
    assert.equal(lines[0].code, "explicit_local_test_opt_in_required");
    assert.equal(lines[1].setupAttempted, false);
    assert.equal(lines[1].remainingDatabaseFixtures, null);
    assert.equal(lines[1].activeSubscriptionsRemaining, null);
    assert.equal(lines[1].testCustomerDeleted, false);
  }
});

test("the Stripe probe fences the Preview fixture and pins one client for cleanup", async () => {
  const source = await readFile(script, "utf8");
  assert.match(source, /identity\(database\) !== identity\(live\)/u);
  assert.match(source, /setupAttempted = true;\s*await db\.query\("INSERT/u);
  assert.match(source, /const client = await db\.connect\(\)/u);
  assert.match(source, /client\.query\("BEGIN"\)/u);
  assert.match(source, /client\.query\("COMMIT"\)/u);
  assert.match(source, /client\.query\("ROLLBACK"\)/u);
  assert.doesNotMatch(source, /db\.query\("(?:BEGIN|COMMIT|ROLLBACK)"\)/u);
  assert.match(source, /finally \{ client\.release\(\); \}/u);
  assert.match(source, /remainingActiveSubscriptions === 0/u);
  assert.match(source, /listener\.once\("exit"/u);
  assert.match(source, /server\.close\(error/u);
  assert.doesNotMatch(source, /activeSubscriptionsRemaining: 0/u);
  assert.match(source, /deployedCallbackTested: false/u);
  assert.match(source, /actualAccountAuthTested: false/u);
  assert.match(source, /renewalTested: false/u);
});
