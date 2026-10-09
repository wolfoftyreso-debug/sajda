/** Explicit local integration proof: Stripe TEST hosted checkout and official
 * Stripe CLI delivery -> unchanged app handlers/services -> isolated Preview
 * Neon records. No existing user, live charge, deployment or endpoint mutation.
 * Auth is an explicit fixture boundary; this is NOT deployed golden-path proof.
 * Run with fresh TEST process env from an env-file-free linked Vercel CLI cwd.
 */
import { randomUUID, createHash } from "node:crypto";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import Stripe from "stripe";
import { Pool } from "pg";
import { chromium } from "playwright";
import { commerceConfig } from "../api/_shared/commerce-config.ts";
import { createCommerceProvider } from "../api/_shared/commerce-provider.ts";
import { createCommerceService } from "../api/_shared/commerce-service.ts";
import { createCommerceStore } from "../api/_shared/commerce-store.ts";
import { createBillingHandler } from "../api/account/billing.ts";
import { createBillingWebhookHandler } from "../api/billing-webhook.ts";
import { createAccountMembershipReader } from "../api/_shared/account-membership.ts";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const emit = value => process.stdout.write(JSON.stringify(value) + "\n");
const check = (condition, code) => { if (!condition) throw new Error(code); };
const args = new Map(process.argv.slice(2).map(value => { const i = value.indexOf("="); check(i > 0, "invalid_arguments"); return [value.slice(0, i), value.slice(i + 1)]; }));
const intro = args.get("--premium-intro") === "1", plan = intro ? "premium" : "trading";
const checkoutInput = key => ({ action: "checkout", requestKey: key, plan,
  ...(intro ? { offer: "premium-first-month-v1", returnTo: "swipe" } : {}) });
const runId = randomUUID(), owner = "stripe-qa-" + runId, token = randomUUID();
let phase = "preflight", stripe, db, server, listener, browser, checkoutPage, customerId, config, setupAttempted = false;
let listenerSecret, localOrigin, capturedEvent, cleanupConfirmed = false;
let customerDeleted = false, remainingActiveSubscriptions = null;
const accepted = [], denied = [], events = new Map(), sessions = new Set(), refunded = new Set();
let activeHandlers = 0;
const awaitCondition = async (predicate, code, timeout = 45000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 250)); }
  throw new Error(code);
};
function responseAdapter(response) {
  return { setHeader: (name, value) => response.setHeader(name, value), status(code) { response.statusCode = code; return this; },
    json(body) { response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify(body)); } };
}
async function main() {
  // Use a narrow local launcher: official env run injects Vercel runtime markers
  // that must never authorize executing this destructive fixture-only harness.
  check(process.env.SAJDA_STRIPE_SANDBOX_LIFECYCLE === "1" && !process.env.VERCEL && !process.env.VERCEL_ENV && !process.env.VERCEL_URL && !process.env.VERCEL_OIDC_TOKEN, "explicit_local_test_opt_in_required");
  check(await realpath(process.cwd()) === await realpath(path.join(repo, ".vercel/commerce-fresh")), "explicit_local_probe_directory_required");
  check(args.has("--stripe-cli") && (args.size === 1 || args.size === 2 && intro) && process.argv.length === args.size + 2, "stripe_cli_path_required");
  check(process.env.STRIPE_MODE === "test" && /^sk_test_[A-Za-z0-9]{12,}$/u.test(process.env.STRIPE_SECRET_KEY ?? ""), "fresh_test_key_required");
  const cli = await realpath(args.get("--stripe-cli"));
  check(path.basename(cli).toLowerCase() === "stripe.exe", "explicit_stripe_binary_required");
  const project = JSON.parse(await readFile(path.join(repo, ".vercel/project.json"), "utf8"));
  check(project.projectId === "prj_UO900Jp4qJF1eS4hkOrebIzwMVlI" && project.orgId === "team_GP2MTfBKmxj8ajYLvQtV7clA", "vercel_project_mismatch");
  const preview = parseEnv(await readFile(path.join(repo, ".vercel/.env.brand-monitors.preview.local"), "utf8")),
    production = parseEnv(await readFile(path.join(repo, ".vercel/.env.brand-monitors.production.local"), "utf8"));
  const database = new URL(preview.DATABASE_URL), live = new URL(production.DATABASE_URL);
  const identity = url => url.hostname.replace("-pooler.", ".") + url.pathname;
  check(["postgres:", "postgresql:"].includes(database.protocol) && database.hostname.endsWith(".neon.tech") && identity(database) !== identity(live), "isolated_preview_neon_required");
  check(preview.SAJDA_BRAND_MONITORS_ENABLED === "true", "preview_configuration_guard_required");
  database.searchParams.set("sslmode", "verify-full"); database.searchParams.delete("options");
  db = new Pool({ connectionString: database.toString(), max: 3, connectionTimeoutMillis: 8000, query_timeout: 10000 });
  db.on("error", () => emit({ event: "sandbox_probe_database_error" }));
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2026-08-26.dahlia", timeout: 10000, maxNetworkRetries: 0 });
  check((await stripe.accounts.retrieve()).id === "acct_1UDqPlAJ7seQoN51" && (await stripe.balance.retrieve()).livemode === false, "actual_test_account_required");
  const emitConfig = { ...process.env, VERCEL: "1", VERCEL_ENV: "preview", STRIPE_WEBHOOK_SECRET: "whsec_fixtureonlyreplacedbeforeevents123" };
  config = commerceConfig(emitConfig);
  const previewFence = identity(database);
  check(previewFence === identity(new URL(parseEnv(await readFile(path.join(repo, ".vercel/.env.brand-monitors.preview.local"), "utf8")).DATABASE_URL)), "preview_database_changed");
  phase = "fixture_setup";
  emit({ check: "bounded_fixture_setup_started", runId, account: "acct_1UDqPlAJ7seQoN51", namespace: "preview", mode: "test", deployed: false });
  setupAttempted = true;
  await db.query("INSERT INTO public.sajda_auth_user(id,name,email,\"emailVerified\") VALUES($1,'Disposable Stripe QA',$2,true)", [owner, owner + "@example.test"]);
  const store = createCommerceStore(config, db), service = createCommerceService({ config: () => ({ ...config, webhookSecret: listenerSecret ?? config.webhookSecret }), store: () => store });
  const handler = createBillingHandler({ service, limit: async () => undefined, origin: () => localOrigin,
    authorize: async headers => { check(headers["x-sajda-qa"] === token && headers["x-sajda-account"] === owner, "fixture_auth_required"); return { id: owner, emailVerified: true }; } });
  const webhook = createBillingWebhookHandler(service);
  server = createServer((request, response) => { void (async () => {
    activeHandlers++;
    try {
      if (request.url === "/api/account/billing") { await handler(request, responseAdapter(response)); return; }
      if (request.url === "/api/billing-webhook" && request.method === "POST") {
        const parts = []; for await (const part of request) { parts.push(part); check(parts.reduce((sum, value) => sum + value.length, 0) <= 262144, "webhook_body_bound"); }
        const body = Buffer.concat(parts), signature = request.headers["stripe-signature"];
        let event;
        try { event = await createCommerceProvider({ ...config, webhookSecret: listenerSecret }).verifyEvent(body, signature); }
        catch { denied.push("signature"); response.statusCode = 400; response.end("{}"); return; }
        // The CLI can hear other sandbox customers. Never persist their events.
        if (!customerId || event.customerId !== customerId) { response.statusCode = 200; response.end("{}"); return; }
        events.set(event.id, { body, signature, type: event.type });
        capturedEvent ??= { body, signature, type: event.type };
        const adapter = responseAdapter(response), originalJson = adapter.json;
        adapter.json = payload => { accepted.push({ eventId: event.id, type: event.type, status: response.statusCode, duplicate: payload.duplicate === true }); originalJson(payload); };
        await webhook({ method: "POST", headers: request.headers, body }, adapter); return;
      }
      response.statusCode = request.url?.startsWith(intro ? "/swipe" : "/plus") ? 200 : 404;
      response.end("Sajda sandbox QA return — payment is verified separately.");
    } catch { response.statusCode = 500; response.end("{}"); }
    finally { activeHandlers--; }
  })(); });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  localOrigin = "http://127.0.0.1:" + server.address().port;
  phase = "stripe_cli_listen";
  listener = spawn(cli, ["listen", "--events-from", "@self", "--events", "customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,invoice.paid,invoice.payment_succeeded,invoice.payment_failed,checkout.session.completed,checkout.session.expired,charge.refunded", "--forward-to", localOrigin + "/api/billing-webhook", "--skip-update", "--color", "off", "--latest"],
    { cwd: path.join(repo, ".vercel/commerce-fresh"), env: { ...process.env, STRIPE_API_KEY: config.secretKey, STRIPE_DEVICE_NAME: "sajda-bounded-local-qa" }, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  let listenerOutput = "";
  const collect = part => { listenerOutput = (listenerOutput + part.toString()).slice(-12000); listenerSecret ??= listenerOutput.match(/whsec_[A-Za-z0-9]{12,}/u)?.[0]; };
  listener.stdout.on("data", collect); listener.stderr.on("data", collect);
  await awaitCondition(() => Boolean(listenerSecret), "stripe_cli_signing_secret_unavailable", 25000);
  check(listenerSecret && listener.exitCode === null, "stripe_cli_not_running");
  emit({ check: "actual_test_stripe_cli_listener_ready", signingSecretPrinted: false, deployed: false });
  const headers = { "content-type": "application/json", "x-sajda-qa": token, "x-sajda-account": owner };
  const call = async body => { const result = await fetch(localOrigin + "/api/account/billing", { method: body ? "POST" : "GET", headers, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(25000) }); check(result.status === 200, "local_billing_http_" + result.status); return result.json(); };
  const key = randomUUID();
  phase = "actual_checkout";
  const initial = await call(); check(initial.plans[plan].canCheckout === true && initial.activePlan === null, "fresh_owner_checkout_required");
  if (intro) check(initial.premiumIntro?.eligible === true && initial.premiumIntro?.ready === true, "verified_intro_offer_required");
  const checkout = await call(checkoutInput(key));
  customerId = (await store.read(owner)).customerId;
  check(customerId && (await stripe.customers.retrieve(customerId)).livemode === false, "owned_test_customer_required");
  const current = await stripe.checkout.sessions.list({ customer: customerId, limit: 100 });
  check(!current.has_more && current.data.length === 1 && current.data[0].livemode === false, "one_owned_test_checkout_required");
  const session = current.data[0]; sessions.add(session.id);
  check((await call(checkoutInput(key))).url === checkout.url, "checkout_retry_duplicate");
  check((await call(checkoutInput(randomUUID()))).url === checkout.url, "new_key_checkout_duplicate");
  if (intro) check(session.amount_subtotal === 1900 && session.amount_total === 900 && session.total_details?.amount_discount === 1000
    && new URL(session.success_url).pathname === "/swipe" && new URL(session.cancel_url).pathname === "/swipe", "actual_intro_checkout_contract_required");
  check((await store.read(owner)).activePlan === null, "browser_redirect_must_not_grant");
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "en-US" });
  const page = await context.newPage(); checkoutPage = page;
  await page.goto(checkout.url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(1000);
  const forms = [];
  for (const frame of page.frames()) {
    forms.push(...await frame.locator("input,select,button").evaluateAll(nodes => nodes.map(node => ({ tag: node.tagName, name: node.getAttribute("name"), id: node.id, type: node.getAttribute("type"), placeholder: node.getAttribute("placeholder"), label: node.tagName === "BUTTON" ? node.innerText.slice(0,80) : null })).filter(node => node.tag === "INPUT" || node.tag === "SELECT" || node.label)));
  }
  // Only UI structure, never field values, credentials or card data.
  emit({ check: "hosted_checkout_form_observed", controls: forms });
  phase = "hosted_checkout_fill";
  const fill = async (selectors, value, optional = false) => {
    for (const frame of page.frames()) for (const selector of selectors) {
      const control = frame.locator(selector).first();
      if (await control.isVisible().catch(() => false)) { await control.fill(value); return true; }
    }
    if (!optional) throw new Error("checkout_control_missing"); return false;
  };
  phase = "hosted_email_fill";
  await fill(['input[name="email"]', 'input[type="email"]'], owner + "@example.test");
  phase = "hosted_card_number_fill";
  await fill(['input[name="cardNumber"]', 'input[autocomplete="cc-number"]'], "4000000000000002");
  phase = "hosted_card_expiry_fill";
  await fill(['input[name="cardExpiry"]', 'input[autocomplete="cc-exp"]'], "12/30");
  phase = "hosted_card_cvc_fill";
  await fill(['input[name="cardCvc"]', 'input[autocomplete="cc-csc"]'], "123");
  phase = "hosted_card_name_fill";
  await fill(['input[name="billingName"]', 'input[autocomplete="cc-name"]'], "Sajda QA Fixture");
  phase = "hosted_postal_fill";
  await fill(['input[name="billingPostalCode"]', 'input[autocomplete="postal-code"]'], "10001", true);
  const subscribe = page.getByRole("button", { name: /Subscribe|Pay|Start/i }).last();
  phase = "hosted_decline_submit";
  await subscribe.click();
  emit({ check: "actual_hosted_decline_submitted", paymentConfirmed: false });
  phase = "hosted_decline_response";
  await page.getByText(/(?:credit )?card (?:was|has been) declined/i).first().waitFor({ timeout: 30000 });
  check((await store.read(owner)).activePlan === null && !(await createCommerceProvider(config).reconcile(customerId)).grant, "decline_must_not_grant");
  const afterDecline = await call();
  const declinedSubscriptions = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 });
  check(!declinedSubscriptions.has_more && afterDecline.activePlan === null, "decline_state_required");
  if (intro && declinedSubscriptions.data.length === 0) check(afterDecline.premiumIntro?.eligible === true && afterDecline.plans.premium.canCheckout === true, "declined_intro_resume_required");
  emit({ check: "actual_post_decline_snapshot", subscriptionCount: declinedSubscriptions.data.length,
    canCheckout: afterDecline.plans[plan].canCheckout, introEligible: intro ? afterDecline.premiumIntro?.eligible : null,
    activePlan: afterDecline.activePlan });
  emit({ check: "actual_hosted_card_decline", rejected: true, paidAccess: false });
  phase = "hosted_retry_number_fill";
  await fill(['input[name="cardNumber"]', 'input[autocomplete="cc-number"]'], "4242424242424242");
  phase = "hosted_retry_submit";
  await subscribe.click();
  phase = "hosted_paid_return";
  await page.waitForURL(url => url.origin === localOrigin, { timeout: 45000 });
  phase = "webhook_entitlement";
  await awaitCondition(async () => (await store.read(owner))?.activePlan === plan, "actual_webhook_entitlement_not_received");
  // The CLI forwards each event once; unlike a registered Stripe endpoint it
  // does not exercise provider retry scheduling. Concurrent lease denials are
  // retried explicitly using the exact authentic event bytes/signature.
  await awaitCondition(() => [...events.values()].some(item => item.type === "invoice.paid"), "actual_invoice_event_not_received");
  const deliveredInvoice = [...events.values()].find(item => item.type === "invoice.paid");
  const invoiceNeededRetry = !accepted.some(event => event.type === "invoice.paid" && event.status === 200);
  if (invoiceNeededRetry) {
    phase = "actual_signed_invoice_retry";
    await awaitCondition(async () => {
      const result = await fetch(localOrigin + "/api/billing-webhook", { method: "POST", headers: { "stripe-signature": deliveredInvoice.signature, "content-type": "application/json" }, body: deliveredInvoice.body, signal: AbortSignal.timeout(20000) });
      if (result.status === 503) return false;
      check(result.status === 200, "actual_signed_invoice_retry_rejected"); return true;
    }, "actual_signed_invoice_retry_timeout");
  }
  const paid = await call(); check(paid.activePlan === plan && paid.status === "active" && paid.plans[plan].canCheckout === false && paid.canManage === true, "paid_application_state_required");
  const membership = createAccountMembershipReader({ query: async (sql, values) => (await db.query(sql, values)).rows, environment: () => ({ VERCEL: "1", VERCEL_ENV: "preview" }) });
  check((await membership({ id: owner, emailVerified: true })).plan === plan, "central_membership_required");
  check(accepted.some(event => event.type === "invoice.paid" && event.status === 200) && capturedEvent, "real_invoice_delivery_required");
  const completed = await stripe.checkout.sessions.retrieve(session.id);
  check(completed.status === "complete" && completed.payment_status === "paid" && completed.customer === customerId, "actual_stripe_checkout_paid_required");
  const actualSubscription = await stripe.subscriptions.retrieve(typeof completed.subscription === "string" ? completed.subscription : completed.subscription.id);
  if (intro) {
    const firstInvoice = await stripe.invoices.retrieve(typeof actualSubscription.latest_invoice === "string" ? actualSubscription.latest_invoice : actualSubscription.latest_invoice.id);
    check(firstInvoice.status === "paid" && firstInvoice.currency === "usd" && firstInvoice.amount_paid === 900 && firstInvoice.amount_due === 900
      && actualSubscription.items.data[0].price.unit_amount === 1900, "actual_intro_paid_invoice_required");
    emit({ check: "actual_premium_intro_invoice", runId, paidFirstMonthMinor: 900, regularPriceMinor: 1900, currency: "usd", plan: "premium", renewalActuallyExecuted: false });
  }
  const portal = await call({ action: "portal", requestKey: randomUUID() });
  check(new URL(portal.url).hostname === "billing.stripe.com", "actual_cancel_portal_required");
  phase = "replay_signature";
  const replayEvent = [...events.values()].find(item => item.type === "invoice.paid");
  check(replayEvent, "delivered_invoice_capture_required");
  const replay = await fetch(localOrigin + "/api/billing-webhook", { method: "POST", headers: { "stripe-signature": replayEvent.signature, "content-type": "application/json" }, body: replayEvent.body });
  check(replay.status === 200 && (await replay.json()).duplicate === true, "actual_duplicate_delivery_required");
  const tampered = await fetch(localOrigin + "/api/billing-webhook", { method: "POST", headers: { "stripe-signature": replayEvent.signature, "content-type": "application/json" }, body: Buffer.concat([replayEvent.body, Buffer.from(" ")]) });
  check(tampered.status === 400, "tampered_signature_rejection_required");
  emit({ check: "actual_checkout_signed_delivery_entitlement_and_portal", success: true, runId,
    hostedCheckout: true, declineAndRetry: true, actualNeonMembership: true,
    authenticInvoiceExplicitRetry: invoiceNeededRetry, duplicateDelivery: true,
    tamperedSignatureDenied: true, actualPortalSessionCreated: true, deployed: false });
  phase = "actual_cancel";
  await stripe.subscriptions.update(actualSubscription.id, { cancel_at_period_end: true }, { idempotencyKey: "sajda-qa-period-end-" + runId });
  // CommerceCustomer intentionally projects membership, not this provider flag.
  // Inspect the exact persisted owner record, not an invented API property.
  await awaitCondition(async () => (await db.query("SELECT cancel_at_period_end FROM sajda.commerce_customers WHERE namespace='preview' AND owner_id=$1 AND customer_id=$2 AND livemode=false", [owner, customerId])).rows[0]?.cancel_at_period_end === true, "period_end_webhook_not_received");
  check((await store.read(owner)).activePlan === plan, "cancel_at_period_end_keeps_paid_access");
  await stripe.subscriptions.cancel(actualSubscription.id, { invoice_now: false, prorate: false });
  await awaitCondition(async () => (await store.read(owner))?.status === "canceled" && (await store.read(owner))?.activePlan === null, "cancellation_revocation_not_received");
  check((await membership({ id: owner, emailVerified: true })).plan === "free", "central_membership_revocation_required");
  const afterCancel = await call(); check(afterCancel.plans[plan].canCheckout === true && afterCancel.canManage === true, "returning_customer_can_choose_again");
  if (intro) {
    check(afterCancel.premiumIntro?.ready === true && afterCancel.premiumIntro?.eligible === false, "returning_customer_intro_denied");
    const deniedOffer = await fetch(localOrigin + "/api/account/billing", { method: "POST", headers, body: JSON.stringify(checkoutInput(randomUUID())), signal: AbortSignal.timeout(25000) });
    const deniedOfferBody = await deniedOffer.json();
    emit({ check: "returning_intro_request_rejected", status: deniedOffer.status, code: deniedOfferBody.code ?? null,
      hasCheckoutUrl: typeof deniedOfferBody.url === "string" });
    check(deniedOffer.status === 409 && deniedOfferBody.code === "intro_offer_unavailable", "explicit_intro_must_not_fall_back_to_full_price");
    check((await stripe.checkout.sessions.list({ customer: customerId, limit: 100 })).data.length === 1, "denied_offer_must_not_create_second_checkout");
  }
  emit({ check: "actual_local_stripe_application_lifecycle", success: true, runId, account: "acct_1UDqPlAJ7seQoN51", mode: "test",
    hostedCheckout: true, cardDeclineAndRetry: true, exactlyOneCheckout: true, signedStripeCliDelivery: true, authenticInvoiceExplicitRetry: invoiceNeededRetry, actualNeonEntitlement: true,
    centralMembership: true, duplicateDelivery: true, invalidSignature: true, billingPortalCreated: true, periodEndCancellationKeepsPaidAccess: true,
    immediateTestCancellationRevokesAccess: true, returningCustomerCanCheckout: true, deliveredEvents: accepted.length,
    premiumIntro: intro, plan, firstInvoiceMinor: intro ? 900 : 4900, returningIntroDeniedWithoutFullPriceFallback: intro,
    deployedCallbackTested: false, automaticProviderRetryTested: false, actualAccountAuthTested: false, renewalTested: false, realEmailDeliveryTested: false, productionWrites: 0 });
}
async function cleanup() {
  phase = "cleanup";
  await browser?.close().catch(() => undefined);
  if (listener && listener.exitCode === null && listener.signalCode === null) {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("cleanup_listener_not_stopped")), 10000);
      listener.once("exit", () => { clearTimeout(timer); resolve(); });
      listener.kill();
    });
  }
  // Stop accepting requests and await all connections before touching fixtures.
  if (server?.listening) {
    server.closeIdleConnections();
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("cleanup_server_not_drained")), 20000);
      server.close(error => { clearTimeout(timer); if (error) reject(error); else resolve(); });
    });
  }
  await awaitCondition(() => activeHandlers === 0, "cleanup_handlers_in_flight", 20000);
  if (db && setupAttempted && !customerId) {
    const mapped = await db.query("SELECT customer_id FROM sajda.commerce_customers WHERE namespace='preview' AND owner_id=$1 AND livemode=false", [owner]);
    customerId = mapped.rows[0]?.customer_id ?? undefined;
    if (!customerId && stripe) {
      const customers = await stripe.customers.list({ limit: 100 });
      check(!customers.has_more, "cleanup_customer_inventory_bound");
      const matches = customers.data.filter(customer => customer.livemode === false && customer.metadata.sajda_namespace === "preview"
        && customer.metadata.sajda_owner_hash === createHash("sha256").update("preview:" + owner).digest("hex"));
      check(matches.length <= 1, "cleanup_customer_ambiguous"); customerId = matches[0]?.id;
    }
  }
  if (stripe && customerId) {
    const customer = await stripe.customers.retrieve(customerId);
    check(!customer.deleted && customer.livemode === false && customer.metadata.sajda_namespace === "preview"
      && customer.metadata.sajda_owner_hash === createHash("sha256").update("preview:" + owner).digest("hex"), "cleanup_customer_ownership");
    const subscriptions = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 });
    check(!subscriptions.has_more && subscriptions.data.every(item => item.livemode === false && item.customer === customerId), "cleanup_subscription_bound");
    for (const sub of subscriptions.data) if (!["canceled","incomplete_expired"].includes(sub.status)) await stripe.subscriptions.cancel(sub.id, { invoice_now: false, prorate: false });
    const afterCancellation = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 });
    check(!afterCancellation.has_more && afterCancellation.data.every(item => item.livemode === false && item.customer === customerId), "cleanup_subscription_readback_bound");
    remainingActiveSubscriptions = afterCancellation.data.filter(item => !["canceled", "incomplete_expired"].includes(item.status)).length;
    check(remainingActiveSubscriptions === 0, "cleanup_active_subscription_remaining");
    const ownedSessions = await stripe.checkout.sessions.list({ customer: customerId, limit: 100 });
    check(!ownedSessions.has_more && ownedSessions.data.every(item => item.livemode === false && item.customer === customerId), "cleanup_checkout_bound");
    for (const session of ownedSessions.data) if (session.status === "open") await stripe.checkout.sessions.expire(session.id);
    const invoices = await stripe.invoices.list({ customer: customerId, limit: 100 });
    check(!invoices.has_more && invoices.data.every(item => item.livemode === false && item.customer === customerId), "cleanup_invoice_bound");
    for (const invoice of invoices.data) {
      const payments = await stripe.invoicePayments.list({ invoice: invoice.id, limit: 100 }); check(!payments.has_more, "cleanup_payment_bound");
      for (const payment of payments.data) if (payment.status === "paid" && payment.payment.type === "payment_intent") {
        const paymentIntent = await stripe.paymentIntents.retrieve(payment.payment.payment_intent);
        check(paymentIntent.customer === customerId && paymentIntent.livemode === false, "cleanup_payment_ownership");
        const refunds = await stripe.refunds.list({ payment_intent: paymentIntent.id, limit: 100 }); check(!refunds.has_more, "cleanup_refund_bound");
        if (!refunds.data.some(item => item.status === "succeeded")) {
          const refund = await stripe.refunds.create({ payment_intent: paymentIntent.id, metadata: { sajda_qa_run: runId } }, { idempotencyKey: "sajda-local-qa-refund-" + runId + "-" + paymentIntent.id });
          check(refund.status === "succeeded", "cleanup_refund_required"); refunded.add(paymentIntent.id);
        }
      }
    }
    customerDeleted = (await stripe.customers.del(customerId)).deleted === true;
    check(customerDeleted, "cleanup_customer_delete_required");
  }
  if (db && setupAttempted) {
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      // Only this allocated account's own ledger and rates, never shared IPs.
      if (customerId) await client.query("DELETE FROM sajda.commerce_events WHERE namespace='preview' AND customer_id=$1", [customerId]);
      await client.query("DELETE FROM sajda.function_rate_limits WHERE scope='account-membership' AND subject_hash=$1", [createHash("sha256").update("account-membership:preview:" + owner).digest("hex")]);
      await client.query("DELETE FROM public.sajda_auth_user WHERE id=$1 AND email=$2", [owner, owner + "@example.test"]);
      const remaining = await client.query("SELECT (SELECT count(*) FROM public.sajda_auth_user WHERE id=$1)+(SELECT count(*) FROM sajda.commerce_customers WHERE owner_id=$1)+(SELECT count(*) FROM sajda.commerce_checkouts WHERE owner_id=$1)+(SELECT count(*) FROM sajda.commerce_access WHERE owner_id=$1)+(SELECT count(*) FROM sajda.commerce_events WHERE namespace='preview' AND customer_id=$2) AS remaining", [owner, customerId ?? "cus_no_fixture"]);
      check(Number(remaining.rows[0].remaining) === 0, "cleanup_database_fixture_remaining");
      await client.query("COMMIT"); cleanupConfirmed = true;
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
  await db?.end();
  emit({ check: "exact_sandbox_fixture_cleanup", setupAttempted, remainingDatabaseFixtures: cleanupConfirmed ? 0 : null, testCustomerDeleted: customerDeleted, activeSubscriptionsRemaining: remainingActiveSubscriptions, refundedPayments: refunded.size, fixtureOnly: true, liveFundsMoved: 0 });
}
try { await main(); }
catch (error) {
  if (checkoutPage && !checkoutPage.isClosed()) {
    await checkoutPage.screenshot({ path: path.join(repo, ".vercel/commerce-fresh", "checkout-failure-" + runId + ".png"), fullPage: true, timeout: 5000 }).catch(() => undefined);
    const fields = await checkoutPage.locator("input,select,button").evaluateAll(nodes => nodes.map(node => ({ name: node.getAttribute("name"), id: node.id, invalid: node.getAttribute("aria-invalid"), filled: "value" in node ? Boolean(node.value) : null, disabled: node.disabled ?? false }))).catch(() => []);
    emit({ check: "hosted_failure_control_states", fields, fieldValuesPrinted: false });
  }
  emit({ success: false, phase, code: error instanceof Error && /^[a-z0-9_]{3,100}$/u.test(error.message) ? error.message : "sandbox_lifecycle_failed", errorType: error?.name === "TimeoutError" ? "TimeoutError" : undefined, providerType: /^Stripe[A-Za-z]+$/u.test(error?.type ?? "") ? error.type : undefined, status: Number.isInteger(error?.statusCode) ? error.statusCode : undefined }); process.exitCode = 1;
}
finally { try { await cleanup(); } catch { emit({ success: false, phase: "cleanup", code: "sandbox_cleanup_requires_review", ownerId: owner, customerId }); process.exitCode = 1; } }
