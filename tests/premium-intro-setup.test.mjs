import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const repo = fileURLToPath(new URL("../", import.meta.url)), script = fileURLToPath(new URL("../scripts/setup-premium-intro-sandbox.mjs", import.meta.url));
test("intro setup rejects missing opt-in, live mode, invalid TEST credentials and missing Price before any provider operation", () => {
  for (const [fields, expected] of [
    [{}, "explicit_intro_setup_opt_in_required"],
    [{ SAJDA_STRIPE_INTRO_SETUP: "1", STRIPE_MODE: "live" }, "test_mode_required"],
    [{ SAJDA_STRIPE_INTRO_SETUP: "1", STRIPE_MODE: "test", STRIPE_SECRET_KEY: "sk_live_DO_NOT_USE_FIXTURE" }, "fresh_test_key_required"],
    [{ SAJDA_STRIPE_INTRO_SETUP: "1", STRIPE_MODE: "test", STRIPE_SECRET_KEY: "sk_test_fixtureNotARealKey123" }, "configured_premium_price_required"],
  ]) {
    // Do not inherit any real project credentials or cached env-file loader.
    const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...fields };
    const result = spawnSync(process.execPath, ["--import", "tsx", script, "--account=acct_fixture", "--apply"], { cwd: repo, env, encoding: "utf8", timeout: 25000, windowsHide: true });
    assert.equal(result.status, 1); assert.equal(result.stderr, "");
    assert.equal(JSON.parse(result.stdout).error, expected); assert.equal(JSON.parse(result.stdout).ready, false);
    assert.equal(result.stdout.includes("sk_test_"), false); assert.equal(result.stdout.includes("sk_live_"), false);
  }
});

test("setup is narrow TEST-only coupon creation with fresh expanded readback and no live/customer/payment/env mutations", async () => {
  const source = await readFile(script, "utf8");
  assert.match(source, /if \(!coupon && apply\)/u);
  assert.match(source, /stripe\.coupons\.create/u);
  assert.match(source, /applies_to: \{ products: \[product\.id\] \}/u);
  assert.match(source, /stripe\.coupons\.retrieve\(coupon\.id, \{ expand: \["applies_to"\] \}\)/u);
  assert.match(source, /!inventory\.has_more/u);
  assert.doesNotMatch(source, /stripe\.(?:prices|products|customers|subscriptions|checkout|webhookEndpoints)\.(?:create|update|del)/u);
  assert.doesNotMatch(source, /(?:writeFile|appendFile|execSync|execFileSync|spawn|\.env\.local)/u);
});
