// Explicitly opt-in, test-only catalog setup. It never changes Vercel,
// webhooks, customers, subscriptions, payment state, env files or live data.
// Inspect: node --import tsx scripts/setup-stripe-sandbox.mjs --account=acct_...
// Apply:   node --import tsx scripts/setup-stripe-sandbox.mjs --account=acct_... --apply
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import Stripe from "stripe";
import { PAID_PLAN_ORDER, PLANS } from "../shared/plans.ts";

const args = process.argv.slice(2);
const accountArgs = args.filter(value => /^--account=acct_[A-Za-z0-9]+$/u.test(value));
if (accountArgs.length !== 1 || args.some(value => value !== "--apply" && !accountArgs.includes(value))) {
  process.stderr.write("Usage: node --import tsx scripts/setup-stripe-sandbox.mjs --account=acct_... [--apply]\n");
  process.exit(1);
}
const expectedAccount = accountArgs[0].slice("--account=".length), apply = args.includes("--apply");
const emit = value => process.stdout.write(`${JSON.stringify(value)}\n`);
const ensure = (condition, code) => { if (!condition) throw new Error(code); };
const catalogKey = plan => `sajda_${plan}_${PLANS[plan].currency}_${PLANS[plan].unitAmount}_cents_monthly_test_v1`;
const productName = plan => `Sajda ${PLANS[plan].name === "Bas" ? "Basic" : PLANS[plan].name}`;
const portalKey = "sajda_multi_plan_cancel_and_switch_test_v1";
const exactPrice = (price, productId, plan) => {
  const contract = PLANS[plan];
  return price.active && price.livemode === false && price.product === productId
    && price.currency === contract.currency && price.unit_amount === contract.unitAmount
    && new RegExp(`^${contract.unitAmount}(?:\\.0+)?$`, "u").test(price.unit_amount_decimal ?? "")
    && price.type === "recurring" && price.billing_scheme === "per_unit"
    && price.recurring?.interval === "month" && price.recurring.interval_count === 1
    && price.recurring.usage_type === "licensed" && price.tiers_mode == null
    && price.transform_quantity == null && price.custom_unit_amount == null;
};
const exactPortal = portal => portal.active && portal.livemode === false
    && portal.features.subscription_cancel.enabled && portal.features.subscription_cancel.mode === "at_period_end"
    && portal.features.subscription_cancel.proration_behavior === "none"
    && portal.features.subscription_update.enabled
    && portal.features.subscription_update.default_allowed_updates.length === 1
    && portal.features.subscription_update.default_allowed_updates[0] === "price"
    && portal.features.subscription_update.proration_behavior === "create_prorations"
    && !portal.features.customer_update.enabled && portal.features.invoice_history.enabled
    && portal.features.payment_method_update.enabled && !portal.login_page.enabled;

try {
  const env = parseEnv(readFileSync(".vercel/.env.stripe-sandbox.local", "utf8"));
  ensure(/^sk_test_[A-Za-z0-9]{12,}$/u.test(env.STRIPE_SECRET_KEY ?? ""), "test_secret_key_required");
  ensure(/^pk_test_[A-Za-z0-9]{12,}$/u.test(env.STRIPE_PUBLISHABLE_KEY ?? ""), "test_publishable_key_required");
  const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: "2026-08-26.dahlia", timeout: 10000, maxNetworkRetries: 0 });
  const account = await stripe.accounts.retrieve();
  ensure(account.id === expectedAccount, "sandbox_account_mismatch");
  ensure((await stripe.balance.retrieve()).livemode === false, "sandbox_mode_verification_failed");
  emit({ check: "account", id: account.id, livemode: false, chargesEnabled: account.charges_enabled });

  const products = await stripe.products.list({ limit: 100 }), prices = await stripe.prices.list({ limit: 100 }),
    portals = await stripe.billingPortal.configurations.list({ limit: 100 });
  for (const inventory of [products, prices, portals]) {
    ensure(!inventory.has_more, "catalog_inventory_exceeds_safe_bound");
    ensure(inventory.data.every(item => item.livemode === false), "unexpected_live_object");
  }
  emit({ check: "inventory", products: products.data.length, prices: prices.data.length, portals: portals.data.length });

  const catalog = [];
  for (const plan of PAID_PLAN_ORDER) {
    const key = catalogKey(plan), name = productName(plan);
    const matchingProducts = products.data.filter(item => item.metadata.sajda_catalog === key
      || item.name === name && item.metadata.sajda_plan === plan);
    ensure(matchingProducts.length <= 1, `ambiguous_${plan}_product`);
    let product = matchingProducts[0];
    if (product) ensure(product.active && product.name === name, `existing_${plan}_product_requires_review`);
    if (!product && apply) product = await stripe.products.create({
      name, description: `${name} account plan. Test sandbox only.`,
      metadata: { sajda_catalog: key, sajda_plan: plan, sajda_environment: "test" },
    }, { idempotencyKey: `sajda-sandbox-product-${expectedAccount}-${key}` });
    if (product) ensure(product.livemode === false && product.active, `created_${plan}_product_verification_failed`);

    const matchingPrices = prices.data.filter(item => item.lookup_key === key || product && exactPrice(item, product.id, plan));
    ensure(matchingPrices.length <= 1, `ambiguous_${plan}_price`);
    let price = matchingPrices[0];
    if (price) ensure(product && exactPrice(price, product.id, plan), `existing_${plan}_price_requires_review`);
    if (!price && apply) price = await stripe.prices.create({
      product: product.id, currency: PLANS[plan].currency, unit_amount: PLANS[plan].unitAmount,
      billing_scheme: "per_unit", recurring: { interval: "month", interval_count: 1, usage_type: "licensed" },
      lookup_key: key, metadata: { sajda_catalog: key, sajda_plan: plan, sajda_environment: "test" },
    }, { idempotencyKey: `sajda-sandbox-price-${expectedAccount}-${key}` });
    if (price) ensure(exactPrice(price, product.id, plan), `created_${plan}_price_verification_failed`);
    if (product && price) catalog.push({ plan, product, price });
  }

  const matchingPortals = portals.data.filter(item => item.metadata.sajda_portal === portalKey);
  ensure(matchingPortals.length <= 1, "ambiguous_existing_portal");
  let portal = matchingPortals[0];
  if (portal && catalog.length === PAID_PLAN_ORDER.length) ensure(exactPortal(portal), "existing_portal_requires_review");
  if (!portal && apply) {
    ensure(catalog.length === PAID_PLAN_ORDER.length, "catalog_incomplete");
    portal = await stripe.billingPortal.configurations.create({
      name: "Sajda plans — test billing", business_profile: { headline: "Manage your Sajda subscription" },
      features: {
        customer_update: { enabled: false }, invoice_history: { enabled: true }, payment_method_update: { enabled: true },
        subscription_cancel: { enabled: true, mode: "at_period_end", proration_behavior: "none" },
        subscription_update: { enabled: true, default_allowed_updates: ["price"], proration_behavior: "create_prorations",
          products: catalog.map(item => ({ product: item.product.id, prices: [item.price.id] })) },
      },
      login_page: { enabled: false }, metadata: { sajda_portal: portalKey, sajda_environment: "test" },
    }, { idempotencyKey: `sajda-sandbox-portal-${expectedAccount}-${portalKey}` });
  }
  for (const item of catalog) {
    ensure((await stripe.products.retrieve(item.product.id)).livemode === false, `${item.plan}_product_readback_failed`);
    ensure(exactPrice(await stripe.prices.retrieve(item.price.id), item.product.id, item.plan), `${item.plan}_price_readback_failed`);
  }
  if (portal) ensure(exactPortal(await stripe.billingPortal.configurations.retrieve(portal.id)), "portal_readback_failed");
  emit({ check: "catalog", mode: "test", apply, complete: catalog.length === PAID_PLAN_ORDER.length && Boolean(portal),
    plans: Object.fromEntries(catalog.map(item => [item.plan, { productId: item.product.id, priceId: item.price.id,
      currency: PLANS[item.plan].currency, amount: PLANS[item.plan].unitAmount, interval: "month" }])),
    portalConfigurationId: portal?.id ?? null, portalProductAllowlistReadback: "not_exposed_by_provider",
    checkoutConfigurationChanged: false,
    webhookConfigurationChanged: false, paymentSubmitted: false });
} catch (error) {
  const code = error instanceof Error && /^[a-z0-9_]{3,100}$/u.test(error.message) ? error.message : "sandbox_setup_failed";
  emit({ success: false, code, providerType: /^Stripe[A-Za-z]+$/u.test(error?.type ?? "") ? error.type : undefined,
    status: Number.isInteger(error?.statusCode) ? error.statusCode : undefined });
  process.exitCode = 1;
}
