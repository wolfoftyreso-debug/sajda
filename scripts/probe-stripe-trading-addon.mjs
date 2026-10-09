/** Bounded LOCAL integration proof: real Stripe TEST SDK invoices/schedules ->
 * unchanged commerce service -> isolated Preview Neon. Injected lost responses
 * are reported as fault injection, not observed provider outages. No hosted
 * checkout, registered webhook, production, live funds or renewal claims. */
import { randomUUID, createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { parseEnv } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Stripe from "stripe";
import { Pool } from "pg";
import { commerceConfig } from "../api/_shared/commerce-config.ts";
import { createCommerceProvider } from "../api/_shared/commerce-provider.ts";
import { createCommerceService } from "../api/_shared/commerce-service.ts";
import { createCommerceStore } from "../api/_shared/commerce-store.ts";
import { createAccountMembershipReader } from "../api/_shared/account-membership.ts";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const check = (condition, code) => { if (!condition) throw new Error(code); };
const emit = value => process.stdout.write(JSON.stringify(value) + "\n");
const runId = randomUUID(), fixtures = [], refunded = new Set();
let phase = "preflight", stripe, db, config, previewIdentity;
const identity = url => url.hostname.replace("-pooler.", ".") + url.pathname;
async function databaseFence() {
  const preview = parseEnv(await readFile(path.join(repo, ".vercel/.env.brand-monitors.preview.local"), "utf8"));
  const production = parseEnv(await readFile(path.join(repo, ".vercel/.env.brand-monitors.production.local"), "utf8"));
  const url = new URL(preview.DATABASE_URL), live = new URL(production.DATABASE_URL);
  check(["postgres:", "postgresql:"].includes(url.protocol) && url.hostname.endsWith(".neon.tech")
    && identity(url) !== identity(live) && (!previewIdentity || previewIdentity === identity(url)), "isolated_preview_neon_required");
  previewIdentity = identity(url); url.searchParams.set("sslmode", "verify-full"); url.searchParams.delete("options");
  return url;
}
async function preflight() {
  check(process.env.SAJDA_STRIPE_ADDON_PROBE === "1" && !process.env.VERCEL && !process.env.VERCEL_ENV
    && !process.env.VERCEL_URL && !process.env.VERCEL_OIDC_TOKEN && process.argv.length === 2, "explicit_local_addon_probe_required");
  check(await realpath(process.cwd()) === await realpath(path.join(repo, ".vercel/commerce-fresh")), "explicit_local_probe_directory_required");
  const project = JSON.parse(await readFile(path.join(repo, ".vercel/project.json"), "utf8"));
  check(project.projectId === "prj_UO900Jp4qJF1eS4hkOrebIzwMVlI" && project.orgId === "team_GP2MTfBKmxj8ajYLvQtV7clA", "vercel_project_mismatch");
  check(process.env.STRIPE_MODE === "test" && /^sk_test_[A-Za-z0-9]{12,}$/u.test(process.env.STRIPE_SECRET_KEY ?? ""), "fresh_test_key_required");
  const database = await databaseFence();
  db = new Pool({ connectionString: database.toString(), max: 2, connectionTimeoutMillis: 8000, query_timeout: 10000 });
  db.on("error", () => emit({ event: "addon_probe_database_error" }));
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2026-08-26.dahlia", timeout: 10000, maxNetworkRetries: 0 });
  check((await stripe.accounts.retrieve()).id === "acct_1UDqPlAJ7seQoN51" && (await stripe.balance.retrieve()).livemode === false, "actual_test_account_required");
  config = commerceConfig({ ...process.env, VERCEL: "1", VERCEL_ENV: "preview", STRIPE_TRADING_ADDON_ENABLED: "true", STRIPE_WEBHOOK_SECRET: "whsec_unusedlocaladdontestfixture123" });
  check(config.mode === "test" && config.namespace === "preview"
    && config.priceIds?.premium === "price_1UMxk3AJ7seQoN51sxjzY7Zf" && config.priceIds?.trading === "price_1UEGrIAJ7seQoN51F0OIF5K7", "pinned_existing_catalog_required");
  const provider = createCommerceProvider(config), store = createCommerceStore(config, db);
  check(await store.addonAvailable(), "applied_addon_ledger_required");
  check((await provider.price("premium")).unitAmount === 1900 && (await provider.price("trading")).unitAmount === 4900, "unchanged_prices_required");
  emit({ check: "actual_addon_preflight", runId, account: "acct_1UDqPlAJ7seQoN51", mode: "test", namespace: "preview", productionWrites: 0 });
}
async function prove(basePlan) {
  phase = "seed_" + basePlan;
  const owner = "addon-qa-" + basePlan + "-" + runId, fixture = { owner, customerId: null, setupAttempted: true, clean: false };
  fixtures.push(fixture); await databaseFence();
  await db.query("INSERT INTO public.sajda_auth_user(id,name,email,\"emailVerified\") VALUES($1,'Disposable Add-on QA',$2,true)", [owner, owner + "@example.test"]);
  const store = createCommerceStore(config, db), provider = createCommerceProvider(config);
  let lease = await store.acquire(owner);
  try {
    fixture.customerId = await provider.createCustomer(lease.customerKey, owner); await store.customer(lease, fixture.customerId);
  } finally { await store.release(lease); }
  const customerId = fixture.customerId;
  const paymentMethod = await stripe.paymentMethods.attach("pm_card_visa", { customer: customerId });
  const subscription = await stripe.subscriptions.create({ customer: customerId, default_payment_method: paymentMethod.id,
    items: [{ price: config.priceIds[basePlan], quantity: 1 }], payment_behavior: "error_if_incomplete",
    metadata: { sajda_namespace: "preview", sajda_plan: basePlan, sajda_qa_run: runId } }, { idempotencyKey: "sajda-addon-probe-sub-" + basePlan + "-" + runId });
  check(subscription.status === "active" && subscription.livemode === false && subscription.customer === customerId, "actual_paid_subscription_required");
  fixture.subscriptionId = subscription.id;
  const invoiceId = typeof subscription.latest_invoice === "string" ? subscription.latest_invoice : subscription.latest_invoice.id;
  const invoice = await stripe.invoices.retrieve(invoiceId), amount = basePlan === "premium" ? 1900 : 4900;
  check(invoice.status === "paid" && invoice.currency === "usd" && invoice.amount_paid === amount && invoice.amount_due === amount, "actual_paid_invoice_required");
  lease = await store.acquire(owner);
  try { const actual = await provider.reconcile(customerId, () => store.introReservations(lease)); check(actual.grant?.plan === basePlan, "actual_paid_grant_required"); await store.sync(lease, actual); }
  finally { await store.release(lease); }
  const membership = createAccountMembershipReader({ query: async (sql, values) => (await db.query(sql, values)).rows, environment: () => ({ VERCEL: "1", VERCEL_ENV: "preview" }) });
  check((await membership({ id: owner, emailVerified: true })).plan === basePlan, "actual_central_membership_required");
  const originalPeriod = { start: subscription.items.data[0].current_period_start, end: subscription.items.data[0].current_period_end, price: subscription.items.data[0].price.id };
  let loseCreate = true, loseUpdate = true;
  const faultProvider = { ...provider,
    async createAddonSchedule(...args) { const resource = await provider.createAddonSchedule(...args); if (loseCreate) { loseCreate = false; throw new Error("injected_lost_create_response"); } return resource; },
    async updateAddonSchedule(...args) { const resource = await provider.updateAddonSchedule(...args); if (loseUpdate) { loseUpdate = false; throw new Error("injected_lost_update_response"); } return resource; } };
  const service = createCommerceService({ config: () => config, store: () => store, provider: () => faultProvider });
  const enabled = basePlan === "premium", requestKey = randomUUID();
  phase = "actual_create_lost_response_" + basePlan;
  try { await service.changeTradingAddon(owner, requestKey, enabled); check(false, "lost_create_injection_required"); }
  catch (error) { check(error.message === "injected_lost_create_response", "unexpected_addon_create_failure"); }
  const processing = await service.read(owner);
  emit({ check: "actual_addon_processing_projection", runId, basePlan, activePlan: processing.activePlan,
    pendingState: processing.tradingAddon?.pending?.state ?? null, canCancel: processing.tradingAddon?.pending?.canCancel ?? null,
    canRetry: processing.tradingAddon?.pending?.canRetry ?? null });
  check(processing.tradingAddon?.pending?.state === "processing" && processing.tradingAddon.pending.canCancel && processing.tradingAddon.pending.canRetry, "read_processing_recovery_required");
  phase = "actual_update_lost_response_" + basePlan;
  try { await service.changeTradingAddon(owner, randomUUID(), enabled); check(false, "lost_update_injection_required"); }
  catch (error) { check(error.message === "injected_lost_update_response", "unexpected_addon_update_failure"); }
  const recovered = await service.read(owner);
  check(recovered.tradingAddon?.pending?.state === "scheduled" && recovered.tradingAddon.pending.enabled === enabled
    && recovered.tradingAddon.pending.canCancel && !recovered.tradingAddon.pending.canRetry, "actual_readback_schedule_recovery_required");
  const result = await service.changeTradingAddon(owner, randomUUID(), enabled);
  check(result.state === "scheduled" && result.enabled === enabled && Date.parse(result.effectiveAt) === originalPeriod.end * 1000, "actual_next_renewal_contract_required");
  const schedules = await stripe.subscriptionSchedules.list({ customer: customerId, limit: 100 });
  check(!schedules.has_more && schedules.data.length === 1 && schedules.data[0].status === "active", "exactly_one_actual_schedule_required");
  const ledger = await db.query("SELECT * FROM sajda.commerce_addon_changes WHERE namespace='preview' AND owner_id=$1", [owner]);
  check(ledger.rows.length === 1 && ledger.rows[0].state === "scheduled" && ledger.rows[0].subscription_id === subscription.id
    && ledger.rows[0].schedule_id === schedules.data[0].id && ledger.rows[0].target_plan === (enabled ? "trading" : "premium"), "actual_fenced_ledger_required");
  const beforeCancel = await stripe.subscriptions.retrieve(subscription.id);
  check(beforeCancel.items.data.length === 1 && beforeCancel.items.data[0].price.id === originalPeriod.price
    && beforeCancel.items.data[0].current_period_start === originalPeriod.start && beforeCancel.items.data[0].current_period_end === originalPeriod.end
    && (await store.read(owner)).activePlan === basePlan && (await membership({ id: owner, emailVerified: true })).plan === basePlan, "current_contract_and_access_unchanged_required");
  const currentInvoices = await stripe.invoices.list({ customer: customerId, limit: 100 });
  check(!currentInvoices.has_more && currentInvoices.data.length === 1, "schedule_must_not_invoice_current_period");
  const cancellationKey = randomUUID(); phase = "actual_release_pending_" + basePlan;
  check((await service.cancelTradingAddonChange(owner, cancellationKey)).state === "canceled", "actual_schedule_release_required");
  check((await service.cancelTradingAddonChange(owner, cancellationKey)).state === "canceled", "actual_release_replay_required");
  const after = await stripe.subscriptions.retrieve(subscription.id);
  check(after.schedule === null && after.status === "active" && after.items.data.length === 1 && after.items.data[0].price.id === originalPeriod.price
    && after.items.data[0].current_period_start === originalPeriod.start && after.items.data[0].current_period_end === originalPeriod.end, "release_keeps_original_subscription_required");
  const subscriptions = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 });
  check(!subscriptions.has_more && subscriptions.data.length === 1 && subscriptions.data[0].id === subscription.id, "exactly_one_actual_subscription_required");
  check((await membership({ id: owner, emailVerified: true })).plan === basePlan, "release_keeps_current_membership_required");
  check(new URL(await service.portal(owner, randomUUID(), "https://sajda.example.test")).hostname === "billing.stripe.com", "actual_portal_after_release_required");
  emit({ check: "actual_trading_addon_lifecycle", runId, basePlan, targetPlan: enabled ? "trading" : "premium", success: true,
    firstInvoiceMinor: amount, faultInjectionAfterRealCreateAndUpdate: true, exactlyOneSubscription: true, exactlyOneSchedule: true,
    realNeonLedger: true, centralMembershipKeptCurrent: true, nextRenewalPriceScheduled: true, paidPeriodUnchanged: true,
    readRecoveryWithoutProviderWrites: true, ownedPendingReleased: true, replayStable: true, portalAfterReleaseCreated: true,
    hostedCheckoutTested: false, actualAccountAuthTested: false, deployedCallbackTested: false, renewalExecuted: false,
    appliedFinalPhasePortalTested: false, productionWrites: 0, liveFundsMoved: 0 });
}
async function cleanup() {
  phase = "cleanup";
  if (db && fixtures.length) await databaseFence();
  for (const fixture of fixtures) {
    const { owner } = fixture;
    if (!fixture.customerId) fixture.customerId = (await db.query("SELECT customer_id FROM sajda.commerce_customers WHERE namespace='preview' AND owner_id=$1 AND livemode=false", [owner])).rows[0]?.customer_id;
    const customerId = fixture.customerId;
    if (customerId) {
      const customer = await stripe.customers.retrieve(customerId);
      check(!customer.deleted && customer.livemode === false && customer.metadata.sajda_namespace === "preview"
        && customer.metadata.sajda_owner_hash === createHash("sha256").update("preview:" + owner).digest("hex"), "cleanup_customer_ownership_required");
      const subs = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 });
      check(!subs.has_more && subs.data.every(sub => sub.livemode === false && sub.customer === customerId), "cleanup_subscription_bound");
      for (const sub of subs.data) if (!["canceled", "incomplete_expired"].includes(sub.status)) await stripe.subscriptions.cancel(sub.id, { invoice_now: false, prorate: false });
      const after = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 });
      check(!after.has_more && after.data.every(sub => ["canceled", "incomplete_expired"].includes(sub.status)), "cleanup_zero_active_subscriptions_required");
      const invoices = await stripe.invoices.list({ customer: customerId, limit: 100 });
      check(!invoices.has_more && invoices.data.every(invoice => invoice.livemode === false && invoice.customer === customerId), "cleanup_invoice_bound");
      for (const invoice of invoices.data) {
        const payments = await stripe.invoicePayments.list({ invoice: invoice.id, limit: 100 }); check(!payments.has_more, "cleanup_payments_bound");
        for (const payment of payments.data) if (payment.status === "paid" && payment.payment.type === "payment_intent") {
          const intent = await stripe.paymentIntents.retrieve(payment.payment.payment_intent);
          check(intent.livemode === false && intent.customer === customerId, "cleanup_payment_ownership_required");
          const refund = await stripe.refunds.create({ payment_intent: intent.id, metadata: { sajda_qa_run: runId } }, { idempotencyKey: "sajda-addon-probe-refund-" + runId + "-" + intent.id });
          check(refund.status === "succeeded", "cleanup_refund_required"); refunded.add(intent.id);
        }
      }
      check((await stripe.customers.del(customerId)).deleted === true, "cleanup_customer_deleted_required");
    }
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM sajda.function_rate_limits WHERE scope='account-membership' AND subject_hash=$1", [createHash("sha256").update("account-membership:preview:" + owner).digest("hex")]);
      await client.query("DELETE FROM public.sajda_auth_user WHERE id=$1 AND email=$2", [owner, owner + "@example.test"]);
      const remaining = await client.query("SELECT (SELECT count(*) FROM public.sajda_auth_user WHERE id=$1)+(SELECT count(*) FROM sajda.commerce_customers WHERE owner_id=$1)+(SELECT count(*) FROM sajda.commerce_access WHERE owner_id=$1)+(SELECT count(*) FROM sajda.commerce_addon_changes WHERE owner_id=$1) AS remaining", [owner]);
      check(Number(remaining.rows[0].remaining) === 0, "cleanup_database_fixture_remaining"); await client.query("COMMIT"); fixture.clean = true;
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
  await db?.end();
  emit({ check: "exact_addon_fixture_cleanup", runId, fixturesAllocated: fixtures.length, fixturesCleaned: fixtures.filter(item => item.clean).length,
    activeSubscriptionsRemaining: fixtures.length && fixtures.every(item => item.clean) ? 0 : null,
    remainingDatabaseFixtures: fixtures.length && fixtures.every(item => item.clean) ? 0 : null,
    refundedTestPayments: refunded.size, fixtureOnly: true, liveFundsMoved: 0, productionWrites: 0 });
}
try { await preflight(); await prove("premium"); await prove("trading"); }
catch (error) { emit({ success: false, runId, phase, code: /^[a-z0-9_]{3,100}$/u.test(error?.message ?? "") ? error.message : "addon_probe_failed",
  providerType: /^Stripe[A-Za-z]+$/u.test(error?.type ?? "") ? error.type : undefined, status: Number.isInteger(error?.statusCode) ? error.statusCode : undefined }); process.exitCode = 1; }
finally { try { await cleanup(); } catch { emit({ success: false, phase: "cleanup", code: "addon_cleanup_requires_review", runId, owners: fixtures.map(item => item.owner) }); process.exitCode = 1; } }
