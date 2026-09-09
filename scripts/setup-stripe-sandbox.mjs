// Explicitly opt-in, test-only catalog setup. Never changes Vercel, webhooks,
// customers, subscriptions, payment state, environment files or live resources.
// Inspect: node scripts/setup-stripe-sandbox.mjs --account=acct_...
// Apply:   node scripts/setup-stripe-sandbox.mjs --account=acct_... --apply
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import Stripe from "stripe";

const args = process.argv.slice(2);
const accountArgs = args.filter((value) => /^--account=acct_[A-Za-z0-9]+$/u.test(value));
if (accountArgs.length !== 1 || args.some((value) => value !== "--apply" && !accountArgs.includes(value))) {
  process.stderr.write("Usage: node scripts/setup-stripe-sandbox.mjs --account=acct_... [--apply]\n");
  process.exit(1);
}
const expectedAccount = accountArgs[0].slice("--account=".length);
const apply = args.includes("--apply");
const catalogKey = "sajda_trading_usd_1880_monthly_test_v1";
const portalKey = "sajda_trading_cancel_at_period_end_test_v1";
const productName = "Sajda Trading";
const emit = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);
const ensure = (condition, code) => { if (!condition) throw new Error(code); };
const exactPrice = (price, productId) => price.active && price.livemode === false
  && price.product === productId && price.currency === "usd" && price.unit_amount === 188000
  && /^188000(?:\.0+)?$/u.test(price.unit_amount_decimal ?? "")
  && price.type === "recurring" && price.billing_scheme === "per_unit"
  && price.recurring?.interval === "month" && price.recurring.interval_count === 1
  && price.recurring.usage_type === "licensed" && price.tiers_mode == null
  && price.transform_quantity == null && price.custom_unit_amount == null;
const exactPortal = (portal) => portal.active && portal.livemode === false
  && portal.features.subscription_cancel.enabled
  && portal.features.subscription_cancel.mode === "at_period_end"
  && portal.features.subscription_cancel.proration_behavior === "none"
  && !portal.features.subscription_update.enabled
  && !portal.features.customer_update.enabled
  && portal.features.invoice_history.enabled
  && portal.features.payment_method_update.enabled
  && !portal.login_page.enabled;

try {
  // Read this one ignored integration file only. Do not fall back to process.env:
  // a production shell must never accidentally choose a live credential.
  const env = parseEnv(readFileSync(".vercel/.env.stripe-sandbox.local", "utf8"));
  ensure(/^sk_test_[A-Za-z0-9]{12,}$/u.test(env.STRIPE_SECRET_KEY ?? ""), "test_secret_key_required");
  ensure(/^pk_test_[A-Za-z0-9]{12,}$/u.test(env.STRIPE_PUBLISHABLE_KEY ?? ""), "test_publishable_key_required");
  const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: "2026-08-26.dahlia", timeout: 10000, maxNetworkRetries: 0,
  });
  const account = await stripe.accounts.retrieve();
  ensure(account.id === expectedAccount, "sandbox_account_mismatch");
  const balance = await stripe.balance.retrieve();
  ensure(balance.livemode === false, "sandbox_mode_verification_failed");
  emit({ check: "account", id: account.id, livemode: false, chargesEnabled: account.charges_enabled });

  // Stop if the bounded inventory is truncated: never create a duplicate by
  // guessing that an existing item is absent from a partial page.
  const products = await stripe.products.list({ limit: 100 });
  const prices = await stripe.prices.list({ limit: 100 });
  const portals = await stripe.billingPortal.configurations.list({ limit: 100 });
  for (const list of [products, prices, portals]) {
    ensure(!list.has_more, "catalog_inventory_exceeds_safe_bound");
    ensure(list.data.every((item) => item.livemode === false), "unexpected_live_object");
  }
  emit({ check: "inventory", products: products.data.length, prices: prices.data.length, portals: portals.data.length });
  const matchingProducts = products.data.filter((item) => item.name === productName
    || item.metadata.sajda_catalog === catalogKey);
  ensure(matchingProducts.length <= 1, "ambiguous_existing_product");
  let product = matchingProducts[0];
  if (product) ensure(product.active && product.name === productName, "existing_product_requires_review");
  if (!product && apply) {
    product = await stripe.products.create({
      name: productName,
      description: "Professional domain research, saved reports and monitoring. Test sandbox only.",
      metadata: { sajda_catalog: catalogKey, sajda_plan: "trading", sajda_environment: "test" },
    }, { idempotencyKey: `sajda-sandbox-product-${expectedAccount}-v1` });
    ensure(product.livemode === false && product.active, "created_product_verification_failed");
  }
  const matchingPrices = prices.data.filter((item) => item.lookup_key === catalogKey
    || (product && exactPrice(item, product.id)));
  ensure(matchingPrices.length <= 1, "ambiguous_existing_price");
  let price = matchingPrices[0];
  if (price) ensure(product && exactPrice(price, product.id), "existing_price_requires_review");
  if (!price && apply) {
    price = await stripe.prices.create({
      product: product.id, currency: "usd", unit_amount: 188000,
      billing_scheme: "per_unit",
      recurring: { interval: "month", interval_count: 1, usage_type: "licensed" },
      lookup_key: catalogKey,
      metadata: { sajda_catalog: catalogKey, sajda_plan: "trading", sajda_environment: "test" },
    }, { idempotencyKey: `sajda-sandbox-price-${expectedAccount}-v1` });
    ensure(exactPrice(price, product.id), "created_price_verification_failed");
  }
  const matchingPortals = portals.data.filter((item) => item.metadata.sajda_portal === portalKey
    || exactPortal(item));
  ensure(matchingPortals.length <= 1, "ambiguous_existing_portal");
  let portal = matchingPortals[0];
  if (portal) ensure(exactPortal(portal), "existing_portal_requires_review");
  if (!portal && apply) {
    portal = await stripe.billingPortal.configurations.create({
      name: "Sajda Trading — test billing",
      business_profile: { headline: "Manage your Sajda Trading subscription" },
      features: {
        customer_update: { enabled: false },
        invoice_history: { enabled: true },
        payment_method_update: { enabled: true },
        subscription_cancel: { enabled: true, mode: "at_period_end", proration_behavior: "none" },
        subscription_update: { enabled: false },
      },
      login_page: { enabled: false },
      metadata: { sajda_portal: portalKey, sajda_plan: "trading", sajda_environment: "test" },
    }, { idempotencyKey: `sajda-sandbox-portal-${expectedAccount}-v1` });
    ensure(exactPortal(portal), "created_portal_verification_failed");
  }
  // Re-read persisted provider objects, rather than trusting write responses.
  if (product) ensure((await stripe.products.retrieve(product.id)).livemode === false, "product_readback_failed");
  if (price) ensure(exactPrice(await stripe.prices.retrieve(price.id), product.id), "price_readback_failed");
  if (portal) ensure(exactPortal(await stripe.billingPortal.configurations.retrieve(portal.id)), "portal_readback_failed");
  emit({
    check: "catalog", mode: "test", apply, complete: Boolean(product && price && portal),
    productId: product?.id ?? null, priceId: price?.id ?? null, portalConfigurationId: portal?.id ?? null,
    currency: "usd", amount: 188000, interval: "month", cancellation: "at_period_end",
    checkoutConfigurationChanged: false, webhookConfigurationChanged: false, paymentSubmitted: false,
  });
} catch (error) {
  // Stripe errors can embed request details. Emit only the bounded failure code
  // or safe provider classification, never raw error/message/stack/credentials.
  const code = error instanceof Error && /^[a-z_]{3,80}$/u.test(error.message) ? error.message : "sandbox_setup_failed";
  emit({ success: false, code, providerType: /^Stripe[A-Za-z]+$/u.test(error?.type ?? "") ? error.type : undefined,
    status: Number.isInteger(error?.statusCode) ? error.statusCode : undefined });
  process.exitCode = 1;
}
