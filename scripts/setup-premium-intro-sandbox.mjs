// Inspect by default; --apply creates ONE missing TEST coupon, never a Price,
// Product, subscription, payment, webhook, Vercel variable or production state.
// Fresh TEST credentials must be supplied by the calling environment in memory.
// node --import tsx scripts/setup-premium-intro-sandbox.mjs --account=acct_... [--apply]
import Stripe from "stripe";
import { PREMIUM_INTRO_OFFER } from "../shared/plans.ts";
import { STRIPE_API_VERSION, stripeSdkPayload, validateCommercePrice, validatePremiumIntroCoupon } from "../api/_shared/commerce-provider.ts";

const args = process.argv.slice(2), accountArgs = args.filter(value => /^--account=acct_[A-Za-z0-9]+$/u.test(value));
if (accountArgs.length !== 1 || args.filter(value => value === "--apply").length > 1
  || args.some(value => value !== "--apply" && !accountArgs.includes(value))) {
  process.stderr.write("Usage: node --import tsx scripts/setup-premium-intro-sandbox.mjs --account=acct_... [--apply]\n");
  process.exit(1);
}
const expectedAccount = accountArgs[0].slice("--account=".length), apply = args.includes("--apply");
const couponId = "sajda_premium_first_month_v1_test";
const emit = value => process.stdout.write(`${JSON.stringify(value)}\n`);
const ensure = (condition, code) => { if (!condition) throw new Error(code); };
try {
  const env = process.env;
  ensure(env.SAJDA_STRIPE_INTRO_SETUP === "1", "explicit_intro_setup_opt_in_required");
  ensure(env.STRIPE_MODE === "test", "test_mode_required");
  ensure(/^sk_test_[A-Za-z0-9]{12,}$/u.test(env.STRIPE_SECRET_KEY ?? ""), "fresh_test_key_required");
  ensure(/^price_[A-Za-z0-9]+$/u.test(env.STRIPE_PREMIUM_PRICE_ID ?? ""), "configured_premium_price_required");
  const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: STRIPE_API_VERSION, timeout: 10000, maxNetworkRetries: 0 });
  ensure((await stripe.accounts.retrieve()).id === expectedAccount, "sandbox_account_mismatch");
  ensure((await stripe.balance.retrieve()).livemode === false, "actual_test_mode_required");
  const price = await stripe.prices.retrieve(env.STRIPE_PREMIUM_PRICE_ID);
  validateCommercePrice(stripeSdkPayload(price), { mode: "test", priceId: env.STRIPE_PREMIUM_PRICE_ID,
    priceIds: { basic: "price_unused", premium: env.STRIPE_PREMIUM_PRICE_ID, trading: "price_unusedTrading" } }, "premium");
  ensure(typeof price.product === "string" && /^prod_[A-Za-z0-9]+$/u.test(price.product), "premium_product_required");
  const product = await stripe.products.retrieve(price.product);
  ensure(!product.deleted && product.livemode === false && product.active
    && product.metadata.sajda_plan === "premium" && product.metadata.sajda_environment === "test", "verified_sajda_premium_product_required");
  const inventory = await stripe.coupons.list({ limit: 100, expand: ["data.applies_to"] });
  ensure(!inventory.has_more && inventory.data.every(row => row.livemode === false), "complete_test_coupon_inventory_required");
  const matches = inventory.data.filter(row => row.id === couponId || row.metadata.sajda_offer === PREMIUM_INTRO_OFFER.id);
  ensure(matches.length <= 1, "ambiguous_existing_intro_coupon");
  let coupon = matches[0];
  if (coupon) validatePremiumIntroCoupon(stripeSdkPayload(coupon), coupon.id, product.id, "test");
  if (!coupon && apply) {
    coupon = await stripe.coupons.create({ id: couponId, amount_off: PREMIUM_INTRO_OFFER.discountAmount,
      currency: PREMIUM_INTRO_OFFER.currency, duration: PREMIUM_INTRO_OFFER.duration,
      applies_to: { products: [product.id] }, name: "Sajda Premium: first month USD 9",
      metadata: { sajda_offer: PREMIUM_INTRO_OFFER.id, sajda_environment: "test", sajda_price: price.id },
    }, { idempotencyKey: `sajda-intro-${expectedAccount}-${PREMIUM_INTRO_OFFER.id}` });
  }
  if (coupon) {
    // applies_to is includable in the current API, not returned by default.
    // Fresh readback, not just successful creation, is the setup evidence.
    const readback = await stripe.coupons.retrieve(coupon.id, { expand: ["applies_to"] });
    validatePremiumIntroCoupon(stripeSdkPayload(readback), coupon.id, product.id, "test");
    emit({ check: "premium_intro_coupon", ready: true, accountId: expectedAccount, mode: "test", couponId: readback.id,
      productId: product.id, priceId: price.id, firstUnitAmount: PREMIUM_INTRO_OFFER.firstUnitAmount,
      renewalUnitAmount: price.unit_amount, discountAmount: readback.amount_off, currency: readback.currency, duration: readback.duration });
  } else emit({ check: "premium_intro_coupon", ready: false, accountId: expectedAccount, mode: "test", missing: true,
    action: "Explicit approval and --apply are required to create the TEST coupon." });
} catch (error) {
  // Provider errors may include request headers; never print raw errors/keys.
  const code = error instanceof Error && /^[a-z_]+$/u.test(error.message) ? error.message : "intro_setup_provider_failed";
  emit({ check: "premium_intro_coupon", ready: false, error: code });
  process.exitCode = 1;
}
