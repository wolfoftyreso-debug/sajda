/** Explicit LOCAL Stripe TEST-clock proof. The provider advances simulated
 * billing, while the unchanged app and PostgreSQL use real wall-clock time.
 * Genuine official Stripe CLI signatures reach the unchanged webhook handler.
 * This is NOT a registered/deployed webhook, real login, or live-payment test.
 */
import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFile, realpath } from "node:fs/promises";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Stripe from "stripe";
import { Pool } from "pg";
import { chromium } from "playwright";
import { commerceConfig } from "../api/_shared/commerce-config.ts";
import { createCommerceProvider } from "../api/_shared/commerce-provider.ts";
import { createCommerceService } from "../api/_shared/commerce-service.ts";
import { createCommerceStore } from "../api/_shared/commerce-store.ts";
import { createAccountMembershipReader } from "../api/_shared/account-membership.ts";
import { createBillingWebhookHandler } from "../api/billing-webhook.ts";
import { renewalDatabaseTarget, renewalNavigationFence } from "./stripe-renewal-policy.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const check = (condition, code) => { if (!condition) throw new Error(code); };
const emit = value => process.stdout.write(JSON.stringify(value) + "\n");
const runId = randomUUID(), fixtures = [], refunded = new Set();
const ownerHash = owner => createHash("sha256").update("preview:" + owner).digest("hex");
let phase = "preflight", stripe, db, config, databaseTargetFingerprint, server, listener, signingSecret, browser;
let activeHandlers = 0, stopping = false, listenerLaunchFailed = false;
const argumentsList = process.argv.slice(2);
const cliArg = argumentsList.length === 1 && argumentsList[0].startsWith("--stripe-cli=") ? argumentsList[0].slice(13) : "";
async function until(predicate, code, timeout = 60000, interval = 1000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  throw new Error(code);
}
async function databaseFence() {
  const preview = parseEnv(await readFile(path.join(repo, ".vercel/.env.brand-monitors.preview.local"), "utf8"));
  const production = parseEnv(await readFile(path.join(repo, ".vercel/.env.brand-monitors.production.local"), "utf8"));
  const linkedProject = JSON.parse(await readFile(path.join(repo, ".vercel/project.json"), "utf8"));
  const previewManifest = JSON.parse(await readFile(path.join(repo, ".vercel/migration-target.preview.json"), "utf8"));
  const productionManifest = JSON.parse(await readFile(path.join(repo, ".vercel/migration-target.production.json"), "utf8"));
  const freshPreview = { ...process.env, VERCEL_ENV: process.env.SAJDA_STRIPE_RENEWAL_ENVIRONMENT };
  const target = renewalDatabaseTarget({ preview, production, freshPreview, linkedProject, previewManifest, productionManifest,
    expectedFingerprint: databaseTargetFingerprint });
  databaseTargetFingerprint ??= target.fingerprint;
  return target.database;
}
function adapter(response, observed) {
  return { setHeader: (key, value) => response.setHeader(key, value), status(code) { response.statusCode = code; return this; },
    json(value) { observed?.(response.statusCode, value); response.setHeader("content-type", "application/json"); response.end(JSON.stringify(value)); } };
}
async function preflight() {
  check(process.env.SAJDA_STRIPE_RENEWAL_PROBE === "1" && !process.env.VERCEL && !process.env.VERCEL_ENV
    && !process.env.VERCEL_URL && !process.env.VERCEL_OIDC_TOKEN && Boolean(cliArg) && path.isAbsolute(cliArg), "explicit_local_renewal_probe_required");
  check(await realpath(process.cwd()) === await realpath(path.join(repo, ".vercel/commerce-fresh")), "explicit_local_probe_directory_required");
  await realpath(cliArg);
  const project = JSON.parse(await readFile(path.join(repo, ".vercel/project.json"), "utf8"));
  check(project.projectId === "prj_UO900Jp4qJF1eS4hkOrebIzwMVlI" && project.orgId === "team_GP2MTfBKmxj8ajYLvQtV7clA", "vercel_project_mismatch");
  check(process.env.STRIPE_MODE === "test" && /^sk_test_[A-Za-z0-9]{12,}$/u.test(process.env.STRIPE_SECRET_KEY ?? ""), "fresh_test_key_required");
  const database = await databaseFence();
  db = new Pool({ connectionString: database.toString(), max: 3, connectionTimeoutMillis: 8000, query_timeout: 10000 });
  db.on("error", () => emit({ event: "renewal_probe_database_error" }));
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2026-08-26.dahlia", timeout: 10000, maxNetworkRetries: 0 });
  check((await stripe.accounts.retrieve()).id === "acct_1UDqPlAJ7seQoN51" && (await stripe.balance.retrieve()).livemode === false, "actual_test_account_required");
  config = commerceConfig({ ...process.env, VERCEL: "1", VERCEL_ENV: "preview", STRIPE_TRADING_ADDON_ENABLED: "true", STRIPE_WEBHOOK_SECRET: "whsec_unuseduntilofficiallistener123" });
  check(config.mode === "test" && config.namespace === "preview" && config.priceIds?.premium === "price_1UMxk3AJ7seQoN51sxjzY7Zf"
    && config.priceIds?.trading === "price_1UEGrIAJ7seQoN51F0OIF5K7" && config.priceIds?.basic === "price_1UMxk3AJ7seQoN51h0ttU9LB"
    && config.portalConfigurationId === "bpc_1UMxk4AJ7seQoN51P7xkqjes", "pinned_existing_catalog_required");
  const provider = createCommerceProvider(config), store = createCommerceStore(config, db);
  check(await store.addonAvailable(), "applied_addon_ledger_required");
  check((await provider.price("premium")).unitAmount === 1900 && (await provider.price("trading")).unitAmount === 4900, "unchanged_prices_required");
  await startListener();
  emit({ check: "actual_renewal_preflight", runId, account: "acct_1UDqPlAJ7seQoN51", mode: "test", namespace: "preview", productionWrites: 0,
    clockSource: "Stripe TEST-clock billing; actual app and database wall-clock", signingSecretPrinted: false });
}
const store = () => createCommerceStore(config, db);
const service = () => createCommerceService({ config: () => ({ ...config, webhookSecret: signingSecret }), store });
const membership = owner => createAccountMembershipReader({ query: async (sql, values) => (await db.query(sql, values)).rows,
  environment: () => ({ VERCEL: "1", VERCEL_ENV: "preview" }) })({ id: owner, emailVerified: true });
async function startListener() {
  const webhook = createBillingWebhookHandler(service());
  server = createServer((request, response) => { void (async () => {
    activeHandlers++;
    try {
      if (stopping || request.url !== "/api/billing-webhook" || request.method !== "POST") { response.statusCode = 404; response.end("{}"); return; }
      const parts = []; let length = 0;
      for await (const part of request) { length += part.length; check(length <= 262144, "webhook_body_bound"); parts.push(part); }
      const body = Buffer.concat(parts), signature = request.headers["stripe-signature"];
      let event;
      try { event = await createCommerceProvider({ ...config, webhookSecret: signingSecret }).verifyEvent(body, signature); }
      catch { response.statusCode = 400; response.end("{}"); return; }
      // The listener hears the account's other TEST customers. Never send those
      // events to the application store, even its ignored-events table.
      const fixture = fixtures.find(item => item.customerId === event.customerId);
      if (!fixture) { response.statusCode = 200; response.end("{}"); return; }
      fixture.events.set(event.id, { body, signature, type: event.type });
      await webhook({ method: "POST", headers: request.headers, body }, adapter(response, (status, payload) => {
        fixture.deliveries.push({ id: event.id, type: event.type, status, duplicate: payload.duplicate === true });
      }));
    } catch { response.statusCode = 500; response.end("{}"); }
    finally { activeHandlers--; }
  })(); });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = "http://127.0.0.1:" + server.address().port + "/api/billing-webhook";
  listener = spawn(cliArg, ["listen", "--events-from", "@self", "--events", "customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,invoice.paid,invoice.payment_succeeded,invoice.payment_failed,charge.refunded", "--forward-to", address, "--skip-update", "--color", "off", "--latest"],
    { cwd: process.cwd(), env: { ...process.env, STRIPE_API_KEY: config.secretKey, STRIPE_DEVICE_NAME: "sajda-bounded-renewal-qa" }, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  let output = "";
  listener.once("error", () => { listenerLaunchFailed = true; });
  const collect = data => { output = (output + data.toString()).slice(-12000); signingSecret ??= output.match(/whsec_[A-Za-z0-9]{12,}/u)?.[0]; };
  listener.stdout.on("data", collect); listener.stderr.on("data", collect);
  await until(() => { check(!listenerLaunchFailed, "official_cli_launch_failed"); return Boolean(signingSecret); }, "official_cli_signing_secret_unavailable", 25000);
  check(listener.exitCode === null, "official_cli_not_running");
}
function clockBody(fixture) { return { name: "sajda-renewal-" + runId + "-" + fixture.basePlan, frozen_time: fixture.frozenTime }; }
async function allocate(basePlan) {
  const end = new Date(Date.now() + 5 * 60000); end.setUTCMilliseconds(0);
  const start = new Date(end); start.setUTCMonth(start.getUTCMonth() - 1);
  const expectedEnd = new Date(start); expectedEnd.setUTCMonth(expectedEnd.getUTCMonth() + 1);
  check(expectedEnd.getTime() === end.getTime(), "calendar_month_boundary_required");
  const fixture = { owner: "renewal-qa-" + basePlan + "-" + runId, basePlan, targetPlan: basePlan === "premium" ? "trading" : "premium",
    frozenTime: Math.floor(start.getTime() / 1000), expectedEnd: Math.floor(end.getTime() / 1000), clockId: null, customerId: null,
    events: new Map(), deliveries: [], clockAttempted: false, userAttempted: false, clean: false };
  fixtures.push(fixture); phase = "allocate_" + basePlan;
  await databaseFence(); fixture.userAttempted = true;
  await db.query("INSERT INTO public.sajda_auth_user(id,name,email,\"emailVerified\") VALUES($1,'Disposable Renewal QA',$2,true)", [fixture.owner, fixture.owner + "@example.test"]);
  fixture.clockAttempted = true;
  const clock = await stripe.testHelpers.testClocks.create(clockBody(fixture), { idempotencyKey: "sajda-renewal-clock-" + fixture.owner });
  check(clock.livemode === false && clock.status === "ready" && clock.name === clockBody(fixture).name && clock.frozen_time === fixture.frozenTime, "owned_test_clock_required");
  fixture.clockId = clock.id;
  const customer = await stripe.customers.create({ test_clock: clock.id, metadata: { sajda_namespace: "preview", sajda_owner_hash: ownerHash(fixture.owner), sajda_qa_run: runId } },
    { idempotencyKey: "sajda-renewal-customer-" + fixture.owner });
  check(customer.livemode === false && customer.test_clock === clock.id && customer.metadata.sajda_owner_hash === ownerHash(fixture.owner), "owned_clock_customer_required");
  fixture.customerId = customer.id;
  const lease = await store().acquire(fixture.owner);
  try { await store().customer(lease, customer.id); } finally { await store().release(lease); }
  const goodCard = await stripe.paymentMethods.attach("pm_card_visa", { customer: customer.id }); fixture.goodCard = goodCard.id;
  if (basePlan === "trading") {
    phase = "attach_failed_renewal_card";
    // Stripe's attachable 0341 fixture, documented at /testing under PaymentMethods.
    // Ordinary decline cards reject attachment and never exercise renewal.
    const declined = await stripe.paymentMethods.attach("pm_card_chargeCustomerFail", { customer: customer.id });
    check(declined.livemode === false && declined.customer === customer.id && declined.type === "card" && declined.card?.last4 === "0341",
      "exact_attachable_decline_fixture_required"); fixture.failedCard = declined.id;
  }
  await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: goodCard.id } });
  // Use the customer's default card, not an explicit subscription/phase card;
  // switching the owned default below tests failure without rewriting a schedule.
  const sub = await stripe.subscriptions.create({ customer: customer.id, items: [{ price: config.priceIds[basePlan], quantity: 1 }], payment_behavior: "error_if_incomplete",
    metadata: { sajda_namespace: "preview", sajda_plan: basePlan, sajda_qa_run: runId } }, { idempotencyKey: "sajda-renewal-sub-" + fixture.owner });
  fixture.subscriptionId = sub.id;
  check(sub.livemode === false && sub.status === "active" && sub.items.data.length === 1 && sub.items.data[0].current_period_end === fixture.expectedEnd, "actual_initial_clock_subscription_required");
  const initialInvoice = await stripe.invoices.retrieve(typeof sub.latest_invoice === "string" ? sub.latest_invoice : sub.latest_invoice.id);
  fixture.initialInvoiceId = initialInvoice.id;
  check(initialInvoice.status === "paid" && initialInvoice.amount_paid === (basePlan === "premium" ? 1900 : 4900), "actual_initial_paid_invoice_required");
  await acceptedInvoice(fixture, initialInvoice.id, "invoice.paid");
  await until(async () => (await store().read(fixture.owner)).activePlan === basePlan, "initial_signed_entitlement_required");
  check((await membership(fixture.owner)).plan === basePlan, "actual_initial_central_membership_required");
  const scheduled = await service().changeTradingAddon(fixture.owner, randomUUID(), basePlan === "premium");
  check(scheduled.state === "scheduled" && Date.parse(scheduled.effectiveAt) === fixture.expectedEnd * 1000, "actual_schedule_before_renewal_required");
  const record = (await db.query("SELECT schedule_id FROM sajda.commerce_addon_changes WHERE namespace='preview' AND owner_id=$1", [fixture.owner])).rows;
  check(record.length === 1 && record[0].schedule_id, "actual_owned_schedule_ledger_required"); fixture.scheduleId = record[0].schedule_id;
  const schedule = await stripe.subscriptionSchedules.retrieve(fixture.scheduleId);
  check(schedule.phases.length === 2 && schedule.phases.every(item => item.default_payment_method == null), "inherited_customer_card_required");
  if (basePlan === "trading") {
    phase = "select_owned_failed_renewal_card";
    check(fixture.failedCard, "exact_attachable_decline_fixture_required");
    await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: fixture.failedCard } });
  }
  check((await membership(fixture.owner)).plan === basePlan, "scheduling_must_not_grant_next_plan");
  emit({ check: "actual_clock_schedule_ready", runId, basePlan, targetPlan: fixture.targetPlan, renewalBoundary: new Date(fixture.expectedEnd * 1000).toISOString(),
    currentEntitlementUnchanged: true, fixtureOnly: true });
  return fixture;
}
async function acceptedInvoice(fixture, invoiceId, type) {
  let selected;
  await until(() => {
    selected = [...fixture.events.entries()].find(([, event]) => event.type === type && JSON.parse(event.body.toString()).data.object.id === invoiceId);
    return Boolean(selected);
  }, "genuine_invoice_event_required");
  if (!fixture.deliveries.some(item => item.id === selected[0] && item.status === 200)) {
    // Explicit retry of the exact CLI-delivered bytes/signature. This is not
    // proof of the registered provider's automatic retry scheduler.
    await until(async () => {
      const event = selected[1];
      const response = await fetch("http://127.0.0.1:" + server.address().port + "/api/billing-webhook", { method: "POST", headers: { "content-type": "application/json", "stripe-signature": event.signature }, body: event.body, signal: AbortSignal.timeout(20000) });
      if (response.status === 503) return false;
      check(response.status === 200, "authentic_invoice_retry_rejected"); return true;
    }, "authentic_invoice_retry_timeout", 45000);
  }
  return selected[1];
}
async function advance(fixture, target) {
  check(fixture.clockId && target > fixture.frozenTime && target <= fixture.expectedEnd + 3 * 86400, "bounded_clock_advance_required");
  const own = await stripe.testHelpers.testClocks.retrieve(fixture.clockId);
  check(own.livemode === false && own.name === clockBody(fixture).name && own.status === "ready", "clock_advance_ownership_required");
  await stripe.testHelpers.testClocks.advance(fixture.clockId, { frozen_time: target });
  await until(async () => {
    const result = await stripe.testHelpers.testClocks.retrieve(fixture.clockId);
    check(result.livemode === false && result.name === clockBody(fixture).name && result.status !== "internal_failure", "clock_advance_failed");
    return result.status === "ready" && result.frozen_time === target;
  }, "clock_advance_timeout", 90000, 1500);
}
async function proveRenewal(fixture) {
  phase = "actual_renewal_" + fixture.basePlan;
  // Never patch Date.now, app evaluators, membership, or PostgreSQL time. The
  // scheduled new invoice's start must be in the actual current paid period.
  await until(() => Date.now() >= (fixture.expectedEnd + 2) * 1000, "actual_renewal_boundary_timeout", 6 * 60000, 1000);
  emit({ check: "actual_wall_clock_boundary_passed", runId, basePlan: fixture.basePlan, timeMocked: false });
  await advance(fixture, fixture.expectedEnd + 2 * 3600);
  const sub = await stripe.subscriptions.retrieve(fixture.subscriptionId);
  check(sub.customer === fixture.customerId && sub.livemode === false && sub.items.data.length === 1
    && sub.items.data[0].price.id === config.priceIds[fixture.targetPlan] && sub.items.data[0].current_period_start === fixture.expectedEnd, "actual_target_period_price_required");
  const invoiceId = typeof sub.latest_invoice === "string" ? sub.latest_invoice : sub.latest_invoice.id;
  check(invoiceId !== fixture.initialInvoiceId, "new_renewal_invoice_required"); fixture.renewalInvoiceId = invoiceId;
  let invoice = await stripe.invoices.retrieve(invoiceId);
  const expectedAmount = fixture.targetPlan === "trading" ? 4900 : 1900;
  check(invoice.customer === fixture.customerId && invoice.livemode === false && invoice.billing_reason === "subscription_cycle"
    && invoice.currency === "usd" && invoice.amount_due === expectedAmount, "exact_renewal_amount_required");
  const failed = fixture.basePlan === "trading";
  if (failed) {
    check(invoice.status === "open" && invoice.amount_paid === 0 && sub.status === "past_due", "actual_failed_renewal_required");
    await acceptedInvoice(fixture, invoiceId, "invoice.payment_failed");
    await until(async () => (await store().read(fixture.owner)).activePlan === null, "failed_renewal_must_revoke_access");
    check((await membership(fixture.owner)).plan === "free", "failed_renewal_central_membership_free_required");
    emit({ check: "actual_failed_renewal_denied", runId, fromPlan: fixture.basePlan, targetPlan: fixture.targetPlan, falseEntitlement: false });
  } else {
    check(invoice.status === "paid" && invoice.amount_paid === expectedAmount && sub.status === "active", "actual_paid_renewal_required");
    await acceptedInvoice(fixture, invoiceId, "invoice.paid");
    await until(async () => (await store().read(fixture.owner)).activePlan === fixture.targetPlan, "signed_renewal_entitlement_required");
    check((await membership(fixture.owner)).plan === fixture.targetPlan, "renewal_central_membership_required");
  }
  // Exercise actual cancellation access even while failed renewal grants no
  // entitlement. The explicit portal action must release only our final phase.
  phase = "actual_applied_portal_" + fixture.basePlan;
  const before = await stripe.subscriptions.retrieve(fixture.subscriptionId);
  check(before.schedule === fixture.scheduleId, "actual_final_schedule_attached_required");
  const portal = await service().portal(fixture.owner, randomUUID(), "https://sajda.example.test");
  check(new URL(portal).hostname === "billing.stripe.com", "actual_applied_portal_required");
  const after = await stripe.subscriptions.retrieve(fixture.subscriptionId);
  check(after.schedule === null && after.status === before.status && after.items.data.length === 1 && after.items.data[0].price.id === before.items.data[0].price.id
    && after.items.data[0].current_period_start === before.items.data[0].current_period_start && after.items.data[0].current_period_end === before.items.data[0].current_period_end,
  "applied_release_preserves_subscription_required");
  const ledger = (await db.query("SELECT state FROM sajda.commerce_addon_changes WHERE namespace='preview' AND owner_id=$1", [fixture.owner])).rows;
  check(ledger.length === 1 && ledger[0].state === "applied", "actual_applied_ledger_required");
  if (failed) {
    check((await membership(fixture.owner)).plan === "free", "portal_must_not_grant_failed_renewal");
    phase = "actual_failed_renewal_retry";
    await stripe.customers.update(fixture.customerId, { invoice_settings: { default_payment_method: fixture.goodCard } });
    invoice = await stripe.invoices.pay(invoiceId, { payment_method: fixture.goodCard }, { idempotencyKey: "sajda-renewal-retry-" + fixture.owner });
    check(invoice.status === "paid" && invoice.amount_paid === expectedAmount, "actual_renewal_retry_paid_required");
    await acceptedInvoice(fixture, invoiceId, "invoice.paid");
    await until(async () => (await store().read(fixture.owner)).activePlan === fixture.targetPlan, "actual_retry_entitlement_required");
    check((await membership(fixture.owner)).plan === fixture.targetPlan, "actual_retry_central_membership_required");
  }
  const subscriptions = await stripe.subscriptions.list({ customer: fixture.customerId, status: "all", limit: 100 });
  const invoices = await stripe.invoices.list({ customer: fixture.customerId, limit: 100 });
  check(!subscriptions.has_more && subscriptions.data.length === 1 && subscriptions.data[0].id === fixture.subscriptionId
    && !invoices.has_more && invoices.data.length === 2, "no_duplicate_subscription_or_renewal_required");
  // Keep this bearer URL only in process memory. Finish BOTH payment paths
  // before browser cancellation, so a portal protocol failure cannot conceal
  // the independently testable failed-renewal/retry path.
  fixture.portalUrl = portal;
  emit({ check: "actual_addon_renewal_and_applied_portal", runId, fromPlan: fixture.basePlan, targetPlan: fixture.targetPlan, success: true,
    renewalInvoiceMinor: expectedAmount, realNeonMembership: true, actualClockRenewal: true, actualWallClockAccess: true,
    genuineCliSignedDelivery: true, failedRenewalAndExplicitRetry: failed, appliedFinalPhasePortalCreated: true,
    appliedReleasePreservedPriceAndPeriod: true, actualHostedPortalCancellation: false,
    exactlyOneSubscription: true, exactlyTwoInvoices: true,
    deployedCallbackTested: false, automaticProviderRetryTested: false, actualAccountAuthTested: false, liveFundsMoved: 0, productionWrites: 0 });
}
function exactPeriodEndCancellation(subscription) {
  const item = subscription.items?.data?.[0], end = item?.current_period_end, cancelAt = subscription.cancel_at;
  if (subscription.items?.data?.length !== 1 || item.quantity !== 1 || !Number.isSafeInteger(end) || end <= 0) return false;
  const exact = Number.isSafeInteger(cancelAt) && cancelAt > 0 && cancelAt === end;
  return exact || subscription.cancel_at_period_end === true && (cancelAt == null || exact);
}
async function cancelThroughPortal(fixture, portalUrl) {
  phase = "actual_hosted_portal_cancel_" + fixture.basePlan;
  check(new URL(portalUrl).origin === "https://billing.stripe.com", "exact_test_portal_origin_required");
  browser ??= await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "en-US", timezoneId: "UTC" });
  let unexpectedNavigationBlocked = false;
  const blockedNavigationCounts = { expected_safe_return: 0, known_stripe_embed: 0, unrecognized_origin: 0 };
  await context.route("**/*", async route => {
    const request = route.request();
    if (request.isNavigationRequest()) {
      const fence = renewalNavigationFence(request.url(), request.frame().parentFrame() === null);
      if (!fence.abort) { await route.continue(); return; }
      unexpectedNavigationBlocked ||= fence.unexpected;
      blockedNavigationCounts[fence.category]++;
      // Never echo a path, query, arbitrary origin, or portal capability URL.
      emit({ check: "portal_navigation_blocked", runId, category: fence.category,
        isTopLevel: fence.isTopLevel, expectedSafeReturn: fence.expectedSafeReturn, unexpected: fence.unexpected });
      await route.abort("blockedbyclient"); return;
    }
    await route.continue();
  });
  try {
    const before = await stripe.subscriptions.retrieve(fixture.subscriptionId);
    check(before.status === "active" && before.schedule === null && before.cancel_at_period_end === false, "owned_active_portal_cancellation_required");
    const page = await context.newPage();
    await page.goto(portalUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    const cancellation = page.getByRole("button", { name: /^Cancel (?:subscription|plan)$/iu }).or(page.getByRole("link", { name: /^Cancel (?:subscription|plan)$/iu })).first();
    await cancellation.waitFor({ state: "visible", timeout: 30000 });
    await cancellation.click();
    // Exactly one confirmation; never retry an uncertain consequential click.
    const confirmation = page.getByRole("button", { name: /^(?:Cancel subscription|Confirm cancellation|Confirm)$/iu }).last();
    await confirmation.waitFor({ state: "visible", timeout: 20000 });
    await confirmation.click();
    await until(async () => exactPeriodEndCancellation(await stripe.subscriptions.retrieve(fixture.subscriptionId)), "portal_cancel_result_unknown", 30000);
    const after = await stripe.subscriptions.retrieve(fixture.subscriptionId);
    const contract = { noUnexpectedNavigation: !unexpectedNavigationBlocked, ownCustomer: after.customer === fixture.customerId,
      testMode: after.livemode === false, active: after.status === "active", noSchedule: after.schedule === null,
      exactCancellation: exactPeriodEndCancellation(after), samePrice: after.items.data[0].price.id === before.items.data[0].price.id,
      sameStart: after.items.data[0].current_period_start === before.items.data[0].current_period_start,
      sameEnd: after.items.data[0].current_period_end === before.items.data[0].current_period_end };
    emit({ check: "actual_portal_contract_readback", runId, targetPlan: fixture.targetPlan, ...contract, blockedNavigationCounts });
    check(Object.entries(contract).filter(([key]) => key !== "noUnexpectedNavigation").every(([, value]) => value === true), "actual_portal_period_end_contract_required");
    await until(async () => (await db.query("SELECT cancel_at_period_end FROM sajda.commerce_customers WHERE namespace='preview' AND owner_id=$1 AND customer_id=$2 AND livemode=false", [fixture.owner, fixture.customerId])).rows[0]?.cancel_at_period_end === true,
      "actual_portal_cancel_signed_persistence_required");
    check((await membership(fixture.owner)).plan === fixture.targetPlan, "portal_period_end_keeps_actual_paid_access");
    const snapshot = await service().read(fixture.owner);
    check(snapshot.canManage === true && snapshot.activePlan === fixture.targetPlan
      && snapshot.accessExpiresAt === new Date(before.items.data[0].current_period_end * 1000).toISOString()
      && snapshot.tradingAddon?.pending === null && snapshot.tradingAddon.canAdd === false && snapshot.tradingAddon.canRemove === false,
    "canceled_paid_account_management_required");
    // Independent payment/state evidence remains useful even when an unrelated
    // blocked subframe fails the final browser perimeter gate. Never call that
    // a full portal pass or retrofit it onto an earlier unobserved run.
    emit({ check: "actual_portal_signed_state_verified", runId, targetPlan: fixture.targetPlan,
      actualNeonPersistence: true, paidAccessKept: true, canManageBillingAfterCancellation: true, newAddonBlocked: true,
      fullBrowserGatePassed: contract.noUnexpectedNavigation, actualAppReturnVerified: false });
    check(contract.noUnexpectedNavigation, "unexpected_portal_navigation_blocked");
    emit({ check: "actual_hosted_portal_canceled_at_period_end", runId, targetPlan: fixture.targetPlan, providerReadback: true,
      actualNeonPersistence: true, paidAccessKept: true, canManageBillingAfterCancellation: true, newAddonBlocked: true,
      viewport: "390x844", physicalIphoneTested: false, browserSecretsPrinted: false,
      actualAppReturnVerified: false, deployedCallbackTested: false, automaticProviderRetryTested: false, actualAccountAuthTested: false, liveFundsMoved: 0, productionWrites: 0 });
  } finally { await context.close(); }
}
async function stopDelivery() {
  stopping = true;
  await browser?.close();
  if (listener && !listenerLaunchFailed && listener.exitCode === null && listener.signalCode === null) await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("cleanup_listener_not_stopped")), 10000);
    listener.once("exit", () => { clearTimeout(timer); resolve(); }); listener.kill();
  });
  if (server?.listening) { server.closeIdleConnections(); await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("cleanup_server_not_drained")), 20000);
    server.close(error => { clearTimeout(timer); if (error) reject(error); else resolve(); });
  }); }
  await until(() => activeHandlers === 0, "cleanup_handlers_in_flight", 20000);
}
async function cleanup() {
  phase = "cleanup"; await stopDelivery();
  if (db && fixtures.length) await databaseFence();
  for (const fixture of fixtures) {
    // Recover a lost create response with the same short-lived idempotency key.
    // Never list all customers, infer an external schedule, or delete a clock
    // unless its name and bounded full customer inventory prove exact ownership.
    if (!fixture.clockId && fixture.clockAttempted) {
      const recovered = await stripe.testHelpers.testClocks.create(clockBody(fixture), { idempotencyKey: "sajda-renewal-clock-" + fixture.owner });
      check(recovered.livemode === false && recovered.name === clockBody(fixture).name, "cleanup_clock_recovery_ownership_required"); fixture.clockId = recovered.id;
    }
    if (fixture.clockId) {
      const clock = await stripe.testHelpers.testClocks.retrieve(fixture.clockId);
      check(clock.livemode === false && clock.name === clockBody(fixture).name, "cleanup_clock_ownership_required");
      const customers = await stripe.customers.list({ test_clock: fixture.clockId, limit: 100 });
      check(!customers.has_more && customers.data.length <= 1 && customers.data.every(customer => customer.livemode === false
        && customer.test_clock === fixture.clockId && customer.metadata.sajda_namespace === "preview" && customer.metadata.sajda_qa_run === runId
        && customer.metadata.sajda_owner_hash === ownerHash(fixture.owner)), "cleanup_exact_clock_customer_bound");
      fixture.customerId ??= customers.data[0]?.id ?? null;
      if (fixture.customerId) {
        check(customers.data.length === 1 && customers.data[0].id === fixture.customerId, "cleanup_exact_customer_required");
        const subscriptions = await stripe.subscriptions.list({ customer: fixture.customerId, status: "all", limit: 100 });
        check(!subscriptions.has_more && subscriptions.data.length <= 1 && subscriptions.data.every(sub => sub.livemode === false && sub.customer === fixture.customerId
          && sub.metadata.sajda_qa_run === runId), "cleanup_exact_subscription_bound");
        for (const sub of subscriptions.data) if (!["canceled", "incomplete_expired"].includes(sub.status)) await stripe.subscriptions.cancel(sub.id, { invoice_now: false, prorate: false });
        const after = await stripe.subscriptions.list({ customer: fixture.customerId, status: "all", limit: 100 });
        check(!after.has_more && after.data.every(sub => ["canceled", "incomplete_expired"].includes(sub.status)), "cleanup_zero_active_subscriptions_required");
        const invoices = await stripe.invoices.list({ customer: fixture.customerId, limit: 100 });
        check(!invoices.has_more && invoices.data.length <= 2 && invoices.data.every(invoice => invoice.livemode === false && invoice.customer === fixture.customerId), "cleanup_exact_invoice_bound");
        for (const invoice of invoices.data) {
          const payments = await stripe.invoicePayments.list({ invoice: invoice.id, limit: 100 }); check(!payments.has_more, "cleanup_payment_bound");
          for (const payment of payments.data) if (payment.status === "paid" && payment.payment.type === "payment_intent") {
            const intent = await stripe.paymentIntents.retrieve(payment.payment.payment_intent);
            check(intent.livemode === false && intent.customer === fixture.customerId, "cleanup_payment_ownership_required");
            const existing = await stripe.refunds.list({ payment_intent: intent.id, limit: 100 }); check(!existing.has_more, "cleanup_refund_bound");
            if (!existing.data.some(item => item.status === "succeeded")) {
              const refund = await stripe.refunds.create({ payment_intent: intent.id, metadata: { sajda_qa_run: runId } }, { idempotencyKey: "sajda-renewal-refund-" + runId + "-" + intent.id });
              check(refund.status === "succeeded", "cleanup_refund_required"); refunded.add(intent.id);
            }
          }
        }
      }
      const deleted = await stripe.testHelpers.testClocks.del(fixture.clockId); check(deleted.deleted === true, "cleanup_clock_deleted_required");
      let clockMissing = false;
      try { await stripe.testHelpers.testClocks.retrieve(fixture.clockId); }
      catch (error) { clockMissing = error?.type === "StripeInvalidRequestError" && error?.statusCode === 404 && error?.code === "resource_missing"; }
      check(clockMissing, "cleanup_deleted_clock_readback_required");
    }
    if (fixture.userAttempted) {
      const client = await db.connect();
      try {
        await client.query("BEGIN");
        if (fixture.customerId) await client.query("DELETE FROM sajda.commerce_events WHERE namespace='preview' AND customer_id=$1", [fixture.customerId]);
        await client.query("DELETE FROM sajda.function_rate_limits WHERE scope='account-membership' AND subject_hash=$1", [createHash("sha256").update("account-membership:preview:" + fixture.owner).digest("hex")]);
        await client.query("DELETE FROM public.sajda_auth_user WHERE id=$1 AND email=$2", [fixture.owner, fixture.owner + "@example.test"]);
        const remaining = await client.query("SELECT (SELECT count(*) FROM public.sajda_auth_user WHERE id=$1)+(SELECT count(*) FROM sajda.commerce_customers WHERE owner_id=$1)+(SELECT count(*) FROM sajda.commerce_access WHERE owner_id=$1)+(SELECT count(*) FROM sajda.commerce_addon_changes WHERE owner_id=$1)+(SELECT count(*) FROM sajda.commerce_events WHERE namespace='preview' AND customer_id=$2) AS remaining", [fixture.owner, fixture.customerId ?? "cus_no_fixture"]);
        check(Number(remaining.rows[0].remaining) === 0, "cleanup_database_fixture_remaining"); await client.query("COMMIT");
      } catch (error) { await client.query("ROLLBACK"); throw error; }
      finally { client.release(); }
    }
    fixture.clean = true;
  }
  await db?.end();
  emit({ check: "exact_renewal_fixture_cleanup", runId, fixturesAllocated: fixtures.length, fixturesCleaned: fixtures.filter(item => item.clean).length,
    activeSubscriptionsRemaining: fixtures.length && fixtures.every(item => item.clean) ? 0 : null,
    remainingDatabaseFixtures: fixtures.length && fixtures.every(item => item.clean) ? 0 : null,
    ownClocksDeleted: fixtures.filter(item => item.clockId && item.clean).length, refundedTestPayments: refunded.size, fixtureOnly: true, liveFundsMoved: 0, productionWrites: 0 });
}
try {
  await preflight(); const pro = await allocate("premium"), bundle = await allocate("trading");
  await proveRenewal(pro); await proveRenewal(bundle);
  await cancelThroughPortal(pro, pro.portalUrl); await cancelThroughPortal(bundle, bundle.portalUrl);
}
catch (error) { emit({ success: false, runId, phase, code: /^[a-z0-9_]{3,100}$/u.test(error?.message ?? "") ? error.message : "renewal_probe_failed",
  providerType: /^Stripe[A-Za-z]+$/u.test(error?.type ?? "") ? error.type : undefined,
  providerCode: /^[a-z0-9_]{3,80}$/u.test(error?.code ?? "") ? error.code : undefined,
  status: Number.isInteger(error?.statusCode) ? error.statusCode : undefined }); process.exitCode = 1; }
finally { try { await cleanup(); } catch { emit({ success: false, phase: "cleanup", code: "renewal_cleanup_requires_review", runId, owners: fixtures.map(item => item.owner), clocks: fixtures.map(item => item.clockId) }); process.exitCode = 1; } }
