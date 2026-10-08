import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../scripts/probe-stripe-addon-renewal.mjs", import.meta.url));
test("renewal probe rejects opt-in/runtime/CLI mistakes before any provider, clock, or database fixture write", () => {
  for (const settings of [
    { SAJDA_STRIPE_RENEWAL_PROBE: "0" },
    { SAJDA_STRIPE_RENEWAL_PROBE: "1", VERCEL: "1" },
    { SAJDA_STRIPE_RENEWAL_PROBE: "1", VERCEL_ENV: "production" },
    { SAJDA_STRIPE_RENEWAL_PROBE: "1", VERCEL_OIDC_TOKEN: "fixture-not-a-real-token" },
    { SAJDA_STRIPE_RENEWAL_PROBE: "1" },
  ]) {
    const env = { ...process.env, VERCEL: "", VERCEL_ENV: "", VERCEL_URL: "", VERCEL_OIDC_TOKEN: "", ...settings };
    for (const key of Object.keys(env)) if (/^(?:STRIPE_|DATABASE_URL$)/u.test(key)) delete env[key];
    const result = spawnSync(process.execPath, ["--import", "tsx", script, "--stripe-cli=relative-not-allowed.exe"], { env, encoding: "utf8", timeout: 30000, windowsHide: true });
    assert.equal(result.status, 1);
    const lines = result.stdout.trim().split("\n").map(value => JSON.parse(value));
    assert.equal(lines[0].code, "explicit_local_renewal_probe_required");
    assert.equal(lines[1].fixturesAllocated, 0);
    assert.equal(lines[1].ownClocksDeleted, 0);
    assert.equal(lines[1].remainingDatabaseFixtures, null);
    assert.equal(lines[1].activeSubscriptionsRemaining, null);
  }
});
test("renewal proof pins TEST account/catalog and Preview identity, and never substitutes synthetic time or signatures", async () => {
  const source = await readFile(script, "utf8");
  assert.match(source, /renewalDatabaseTarget\(\{ preview, production, freshPreview, linkedProject, previewManifest, productionManifest/u);
  assert.match(source, /expectedFingerprint: databaseTargetFingerprint/u);
  assert.match(source, /SAJDA_STRIPE_RENEWAL_ENVIRONMENT/u);
  assert.match(source, /acct_1UDqPlAJ7seQoN51/u);
  assert.match(source, /balance\.retrieve\(\)\)\.livemode === false/u);
  assert.match(source, /config\.priceIds\?\.premium === "price_1UMxk3AJ7seQoN51sxjzY7Zf"/u);
  assert.match(source, /const fixture = fixtures\.find\(item => item\.customerId === event\.customerId\)/u);
  assert.match(source, /Date\.now\(\) >= \(fixture\.expectedEnd \+ 2\) \* 1000/u);
  assert.doesNotMatch(source, /Date\.now\s*=|setSystemTime|generateTestHeaderString|UPDATE.*(?:valid_from|expires_at)/u);
  assert.match(source, /failed_renewal_must_revoke_access/u);
  assert.match(source, /paymentMethods\.attach\("pm_card_chargeCustomerFail"/u);
  assert.match(source, /declined\.customer === customer\.id && declined\.type === "card" && declined\.card\?\.last4 === "0341"/u);
  assert.doesNotMatch(source, /paymentMethods\.attach\("pm_card_chargeDeclined"/u);
  assert.match(source, /portal_must_not_grant_failed_renewal/u);
  assert.match(source, /applied_release_preserves_subscription_required/u);
  assert.match(source, /actual_portal_cancel_signed_persistence_required/u);
  assert.match(source, /portal_period_end_keeps_actual_paid_access/u);
  assert.match(source, /"portal_cancel_result_unknown"/u);
  assert.match(source, /Number\.isSafeInteger\(cancelAt\) && cancelAt > 0 && cancelAt === end/u);
  assert.match(source, /subscription\.items\?\.data\?\.length !== 1/u);
  assert.match(source, /canceled_paid_account_management_required/u);
  assert.match(source, /snapshot\.tradingAddon\?\.pending === null && snapshot\.tradingAddon\.canAdd === false/u);
  assert.match(source, /await proveRenewal\(pro\); await proveRenewal\(bundle\);\s+await cancelThroughPortal\(pro, pro\.portalUrl\)/u);
  assert.doesNotMatch(source, /emit\(\{[^}]*portalUrl|process\.(?:stdout|stderr).*portalUrl/u);
  assert.match(source, /renewalNavigationFence\(request\.url\(\), request\.frame\(\)\.parentFrame\(\) === null\)/u);
  assert.match(source, /if \(!fence\.abort\) \{ await route\.continue\(\); return; \}/u);
  assert.match(source, /unexpectedNavigationBlocked \|\|= fence\.unexpected/u);
  assert.match(source, /await route\.abort\("blockedbyclient"\)/u);
  assert.match(source, /"portal_navigation_blocked"/u);
  assert.match(source, /blockedNavigationCounts\[fence\.category\]\+\+/u);
  assert.match(source, /isTopLevel: fence\.isTopLevel/u);
  assert.match(source, /actualAppReturnVerified: false/u);
  assert.match(source, /Object\.entries\(contract\)\.filter\(\(\[key\]\) => key !== "noUnexpectedNavigation"\)\.every/u);
  const persistence = source.indexOf('"actual_portal_signed_state_verified"'), finalNavigation = source.indexOf('check(contract.noUnexpectedNavigation, "unexpected_portal_navigation_blocked")');
  assert.ok(persistence > source.indexOf('"actual_portal_cancel_signed_persistence_required"') && persistence < finalNavigation);
  assert.ok(finalNavigation < source.indexOf('"actual_hosted_portal_canceled_at_period_end"'));
  assert.doesNotMatch(source, /emit\([^\n]*(?:url\.(?:origin|pathname|href)|portalUrl)/u);
  assert.match(source, /deployedCallbackTested: false/u);
  assert.match(source, /automaticProviderRetryTested: false/u);
});
test("renewal cleanup stops authentic delivery, proves exact clock ownership and cancels/refunds only its bounded inventory", async () => {
  const source = await readFile(script, "utf8");
  assert.match(source, /await stopDelivery\(\)/u);
  assert.match(source, /listener\.once\("exit"/u);
  assert.match(source, /activeHandlers === 0/u);
  assert.match(source, /stripe\.customers\.list\(\{ test_clock: fixture\.clockId, limit: 100 \}\)/u);
  assert.match(source, /customer\.metadata\.sajda_owner_hash === ownerHash\(fixture\.owner\)/u);
  assert.match(source, /subscriptions\.data\.length <= 1/u);
  assert.match(source, /invoices\.data\.length <= 2/u);
  assert.match(source, /intent\.livemode === false && intent\.customer === fixture\.customerId/u);
  assert.match(source, /clock\.name === clockBody\(fixture\)\.name/u);
  assert.match(source, /cleanup_deleted_clock_readback_required/u);
  assert.match(source, /const client = await db\.connect\(\)/u);
  assert.match(source, /client\.query\("BEGIN"\)/u);
  assert.match(source, /client\.query\("COMMIT"\)/u);
  assert.match(source, /client\.query\("ROLLBACK"\)/u);
  assert.doesNotMatch(source, /db\.query\("(?:BEGIN|COMMIT|ROLLBACK)"\)/u);
  assert.doesNotMatch(source, /webhookEndpoints\.(?:create|update|del)|billingPortal\.configurations\.(?:create|update)|prices\.(?:create|update)|products\.(?:create|update)/u);
});
