import Stripe from "stripe";
import { validateAddonSubscription, type AddonSubscription } from "./commerce-addon.js";
import { createHash } from "node:crypto";
import { PAID_PLAN_ORDER, PLANS, PREMIUM_INTRO_OFFER, type PaidPlanId } from "../../shared/plans.js";
import {
  CommerceError,
  commerceId,
  commercePriceId,
  safeStripeUrl,
  type CommerceConfig,
} from "./commerce-config.js";

export const STRIPE_API_VERSION = "2026-08-26.dahlia" as const;
export interface CommercePrice {
  currency: string;
  unitAmount: number;
  interval: "month";
  intervalCount: 1;
  taxBehavior: "inclusive" | "exclusive" | "unspecified";
}
export type SubscriptionStatus =
  | "none"
  | "incomplete"
  | "incomplete_expired"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "paused"
  | "conflict";
export interface BillingState {
  status: SubscriptionStatus;
  subscriptionId: string | null;
  cancelAtPeriodEnd: boolean;
  grant: {
    plan?: PaidPlanId;
    subscriptionId: string;
    invoiceId: string;
    priceId: string;
    validFrom: string;
    expiresAt: string;
  } | null;
}
export interface CheckoutState {
  id: string;
  status: "open" | "complete" | "expired";
  url: string | null;
  expiresAt: string;
  subscriptionId?: string | null;
}
export interface AppliedIntroReservation { id: string; offer: "premium-first-month-v1"; couponId: string; priceId: string; completed?: boolean }
export interface CheckoutIntent { offer?: "premium-first-month-v1"; couponId?: string; returnTo?: "swipe"; id?: string; origin?: string }
export type IntroEvidence = AppliedIntroReservation[] | (() => Promise<AppliedIntroReservation[]>);
export interface BillingEvent {
  id: string;
  type: string;
  created: number;
  livemode: boolean;
  customerId: string | null;
  hold: boolean;
}
export interface CommerceProvider {
  addonSubscription?(subscriptionId: string, customerId: string, forRelease?: boolean): Promise<AddonSubscription>;
  addonSchedule?(scheduleId: string): Promise<unknown>;
  createAddonSchedule?(subscriptionId: string, changeId: string): Promise<unknown>;
  updateAddonSchedule?(scheduleId: string, body: Stripe.SubscriptionScheduleUpdateParams, changeId: string): Promise<unknown>;
  releaseAddonSchedule?(scheduleId: string, operationId: string): Promise<unknown>;
  price(plan?: PaidPlanId): Promise<CommercePrice>;
  createCustomer(key: string, ownerId: string): Promise<string>;
  reconcile(customerId: string, approvedIntro?: IntroEvidence): Promise<BillingState>;
  introEligible(customerId: string): Promise<boolean>;
  introCoupon(couponId: string): Promise<void>;
  createCheckout(input: {
    id: string;
    customerId: string;
    origin: string;
    createdAt: string;
    plan?: PaidPlanId;
    offer?: "premium-first-month-v1";
    couponId?: string;
    returnTo?: "swipe";
  }): Promise<CheckoutState>;
  checkout(sessionId: string, customerId: string, plan?: PaidPlanId, intent?: CheckoutIntent): Promise<CheckoutState>;
  recoverCheckout(
    customerId: string,
    reservationId: string,
    createdAt: string,
    plan?: PaidPlanId,
    intent?: CheckoutIntent,
  ): Promise<CheckoutState | null>;
  portal(
    customerId: string,
    origin: string,
    requestKey: string,
  ): Promise<string>;
  verifyEvent(body: Buffer, signature: string): Promise<BillingEvent>;
}
type Obj = Record<string, unknown>;
function obj(v: unknown): Obj {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {};
}
function list(v: unknown): Obj[] {
  const value = obj(v);
  if (value.has_more === true || !Array.isArray(value.data))
    throw new CommerceError("invalid_provider_response");
  return value.data.map(obj);
}
function epoch(v: unknown): number {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v <= 0)
    throw new CommerceError("invalid_provider_response");
  return v;
}
const identity = (v: unknown) =>
  typeof v === "string" ? v : String(obj(v).id ?? "");

/** Restore the wire representation of authenticated SDK responses only.
 * stripe-node >=21 wraps decimal strings in an arbitrary-precision Decimal.
 * Its JSON serializer preserves those exact decimal strings (never Number()).
 * Keep this at the provider boundary, NOT inside the validators or webhook
 * handler: untrusted payloads must not acquire permissive object coercion.
 */
export function stripeSdkPayload(
  value: Stripe.Price | Stripe.Checkout.Session | Stripe.ApiList<Stripe.Subscription> | Stripe.ApiList<Stripe.Invoice> | Stripe.Coupon | Stripe.BillingPortal.Configuration,
): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

export function validatePremiumIntroCoupon(value: unknown, couponId: string, productId: string, mode: CommerceConfig["mode"]): void {
  const coupon = obj(value), products = obj(coupon.applies_to).products;
  if (coupon.object !== "coupon" || coupon.id !== couponId || coupon.livemode !== (mode === "live")
    || coupon.valid !== true || coupon.deleted === true || coupon.amount_off !== PREMIUM_INTRO_OFFER.discountAmount
    || coupon.percent_off != null || coupon.currency !== PREMIUM_INTRO_OFFER.currency || coupon.duration !== PREMIUM_INTRO_OFFER.duration
    || coupon.duration_in_months != null || !Array.isArray(products) || products.length !== 1 || products[0] !== productId
    || obj(coupon.metadata).sajda_offer !== PREMIUM_INTRO_OFFER.id || obj(coupon.metadata).sajda_environment !== mode) {
    throw new CommerceError("intro_offer_unavailable", 409);
  }
}

/** The launch portal manages an existing subscription, but cannot replace its
 * Price mid-period. The entitlement reader accepts full paid monthly periods,
 * not unpaid/prorated plan changes. Never offer an unsafe provider-side switch.
 */
export function validateCommercePortalConfiguration(
  value: unknown,
  config: Pick<CommerceConfig, "mode" | "portalConfigurationId">,
): void {
  const portal = obj(value), features = obj(portal.features), cancel = obj(features.subscription_cancel);
  if (portal.id !== config.portalConfigurationId || portal.object !== "billing_portal.configuration"
    || portal.active !== true || portal.livemode !== (config.mode === "live")
    || cancel.enabled !== true || cancel.mode !== "at_period_end" || cancel.proration_behavior !== "none"
    || obj(features.subscription_update).enabled !== false || obj(features.customer_update).enabled !== false
    || obj(features.invoice_history).enabled !== true || obj(features.payment_method_update).enabled !== true
    || obj(portal.login_page).enabled !== false) {
    throw new CommerceError("billing_portal_unavailable");
  }
}

/** Validate provider evidence against the approved commercial contract.
 * `active` controls new purchases, not previously paid subscription periods.
 * The integer/decimal checks are separate: Number() would round tiny fractions.
 */
export function validatePlusPrice(
  value: unknown,
  config: Pick<CommerceConfig, "mode" | "priceId">,
  requireActive = true,
): CommercePrice {
  return validateCommercePrice(value, config, "trading", requireActive);
}

export function validateCommercePrice(
  value: unknown,
  config: Pick<CommerceConfig, "mode" | "priceId"> & Partial<Pick<CommerceConfig, "priceIds">>,
  plan: PaidPlanId,
  requireActive = true,
): CommercePrice {
  const price = obj(value);
  const recurring = obj(price.recurring);
  const contract = PLANS[plan];
  const expectedPriceId = commercePriceId(config, plan);
  const decimal = price.unit_amount_decimal;
  const exactDecimal =
    decimal == null ||
    (typeof decimal === "string" &&
      new RegExp(`^${contract.unitAmount}(?:\\.0{1,12})?$`, "u").test(
        decimal,
      ));
  if (
    price.object !== "price" ||
    price.id !== expectedPriceId ||
    typeof price.active !== "boolean" ||
    (requireActive && !price.active) ||
    price.livemode !== (config.mode === "live") ||
    price.currency !== contract.currency ||
    price.unit_amount !== contract.unitAmount ||
    !Number.isSafeInteger(price.unit_amount) ||
    !exactDecimal ||
    price.type !== "recurring" ||
    price.billing_scheme !== "per_unit" ||
    price.tiers_mode != null ||
    price.tiers != null ||
    price.transform_quantity != null ||
    price.custom_unit_amount != null ||
    recurring.interval !== contract.interval ||
    recurring.interval_count !== contract.intervalCount ||
    recurring.usage_type !== "licensed" ||
    !["inclusive", "exclusive", "unspecified"].includes(
      String(price.tax_behavior ?? ""),
    )
  ) {
    throw new CommerceError("billing_price_unavailable");
  }
  return {
    currency: price.currency as CommercePrice["currency"],
    unitAmount: price.unit_amount as number,
    interval: recurring.interval as CommercePrice["interval"],
    intervalCount: recurring.interval_count as CommercePrice["intervalCount"],
    taxBehavior: price.tax_behavior as CommercePrice["taxBehavior"],
  };
}

/** Reused or recovered open sessions must satisfy today's approved contract too.
 * Terminal sessions provide no payment URL; an expired session can be retired
 * even if it belonged to an older price, without enabling another charge.
 */
export function validatePlusCheckout(
  value: unknown,
  customerId: string,
  config: Pick<CommerceConfig, "mode" | "priceId">,
): CheckoutState {
  return validateCommerceCheckout(value, customerId, config, "trading");
}

export function validateCommerceCheckout(
  value: unknown,
  customerId: string,
  config: Pick<CommerceConfig, "mode" | "priceId"> & Partial<Pick<CommerceConfig, "priceIds">>,
  plan: PaidPlanId,
  intent: CheckoutIntent = {},
): CheckoutState {
  const session = obj(value);
  const contract = PLANS[plan];
  if (
    session.livemode !== (config.mode === "live") ||
    identity(session.customer) !== customerId ||
    session.mode !== "subscription" ||
    !["open", "complete", "expired"].includes(String(session.status ?? ""))
  ) {
    throw new CommerceError("provider_owner_mismatch");
  }
  if (session.status === "open") {
    const lines = list(session.line_items);
    if (
      lines.length !== 1 ||
      lines[0].quantity !== 1 ||
      lines[0].currency !== contract.currency ||
      session.currency !== contract.currency
    ) {
      throw new CommerceError("billing_price_unavailable");
    }
    // Validate the unit Price rather than pre-tax subtotal or after-tax total;
    // those totals have different meanings for inclusive/exclusive tax.
    validateCommercePrice(lines[0].price, config, plan);
    const discounts = session.discounts == null ? [] : session.discounts;
    if (!Array.isArray(discounts)) throw new CommerceError("intro_offer_unavailable", 409);
    if (intent.offer) {
      const metadata = obj(session.metadata), discount = obj(discounts[0]);
      if (plan !== "premium" || intent.offer !== PREMIUM_INTRO_OFFER.id || !intent.couponId || discounts.length !== 1
        || identity(discount.coupon) !== intent.couponId || discount.promotion_code != null
        || obj(session.total_details).amount_discount !== PREMIUM_INTRO_OFFER.discountAmount
        || metadata.sajda_offer !== intent.offer || metadata.sajda_coupon !== intent.couponId
        || (intent.id !== undefined && metadata.sajda_checkout !== intent.id)) {
        throw new CommerceError("intro_offer_unavailable", 409);
      }
    } else if (discounts.length !== 0 || Number(obj(session.total_details).amount_discount ?? 0) !== 0) {
      throw new CommerceError("billing_price_unavailable");
    }
    if ((obj(session.metadata).sajda_return_to ?? undefined) !== intent.returnTo) throw new CommerceError("checkout_context_conflict", 409);
    if (intent.origin !== undefined || intent.returnTo !== undefined) {
      const path = intent.returnTo === "swipe" ? "/swipe" : plan === "trading" ? "/plus" : "/pricing";
      try {
        for (const [field, outcome] of [["success_url", "success"], ["cancel_url", "cancel"]] as const) {
          const url = new URL(String(session[field]));
          const localTest = config.mode === "test" && intent.origin !== undefined && new URL(intent.origin).origin === url.origin
            && url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname);
          if (url.protocol !== "https:" && !localTest || url.username || url.password || url.hash || url.pathname !== path
            || url.search !== `?billing=${outcome}` || intent.origin !== undefined && url.origin !== new URL(intent.origin).origin)
            throw new Error("callback_contract_mismatch");
        }
      } catch { throw new CommerceError("checkout_context_conflict", 409); }
    }
  }
  return {
    id: commerceId(session.id, config.mode === "live" ? "cs_live" : "cs_test"),
    status: session.status as CheckoutState["status"],
    url:
      session.status === "open" ? safeStripeUrl(session.url, "checkout") : null,
    expiresAt: new Date(epoch(session.expires_at) * 1000).toISOString(),
    subscriptionId: session.subscription ? commerceId(session.subscription, "sub") : null,
  };
}

/** Provider snapshots are retrieved AFTER a fenced customer lease is acquired.
 * Event payloads and event creation timestamps never advance access directly.
 */
export function evaluateSubscription(
  sub: unknown,
  invoices: unknown,
  customerId: string,
  config: Pick<CommerceConfig, "mode" | "priceId"> & Partial<Pick<CommerceConfig, "priceIds">>,
  now = Date.now(),
  approvedIntro: AppliedIntroReservation[] = [],
): BillingState {
  const s = obj(sub),
    live = config.mode === "live";
  if (s.livemode !== live || identity(s.customer) !== customerId)
    throw new CommerceError("provider_owner_mismatch");
  const subscriptionId = commerceId(s.id, "sub");
  const allowed: SubscriptionStatus[] = [
    "incomplete",
    "incomplete_expired",
    "trialing",
    "active",
    "past_due",
    "canceled",
    "unpaid",
    "paused",
  ];
  if (!allowed.includes(s.status as SubscriptionStatus))
    throw new CommerceError("invalid_provider_response");
  const state: BillingState = {
    status: s.status as SubscriptionStatus,
    subscriptionId,
    cancelAtPeriodEnd: s.cancel_at_period_end === true,
    grant: null,
  };
  const items = list(s.items);
  const ongoing = ["active", "past_due", "unpaid"].includes(String(s.status));
  const plan = ongoing && items.length === 1 && items[0].quantity === 1 ? PAID_PLAN_ORDER.find(candidate => {
    try { validateCommercePrice(items[0].price, config, candidate, false); return true; }
    catch (error) {
      if (error instanceof CommerceError && error.code === "billing_price_unavailable") return false;
      throw error;
    }
  }) : undefined;
  // A cancel-only Stripe portal may use cancel_at rather than the boolean.
  // Normalize only the exact, independently validated single-item boundary;
  // a custom earlier/later date is not a period-end cancellation. This status
  // projection never supplies payment evidence or extends an access grant.
  if (plan && Number.isSafeInteger(s.cancel_at) && Number(s.cancel_at) > 0
    && Number.isSafeInteger(items[0].current_period_end)
    && s.cancel_at === items[0].current_period_end && Number(s.cancel_at) > Math.floor(now / 1000))
    state.cancelAtPeriodEnd = true;
  if (
    s.status !== "active" ||
    s.pause_collection ||
    items.length !== 1 ||
    items[0].quantity !== 1
  )
    return state;
  if (!plan) return state;
  const contract = PLANS[plan], expectedPriceId = commercePriceId(config, plan);
  const subscriptionMetadata = obj(s.metadata);
  const hasIntro = subscriptionMetadata.sajda_offer !== undefined;
  const appliedIntro = hasIntro ? approvedIntro.find(reservation => plan === "premium" && reservation.offer === PREMIUM_INTRO_OFFER.id
    && subscriptionMetadata.sajda_offer === reservation.offer && subscriptionMetadata.sajda_coupon === reservation.couponId
    && subscriptionMetadata.sajda_checkout === reservation.id && reservation.priceId === expectedPriceId) : undefined;
  if (hasIntro && !appliedIntro) return state;
  const item = items[0],
    periodEnd = epoch(item.current_period_end),
    periodStart = epoch(item.current_period_start),
    nowSeconds = Math.floor(now / 1000);
  if (
    periodStart > nowSeconds ||
    periodEnd <= nowSeconds ||
    periodEnd - periodStart > 45 * 86400
  )
    return state;
  let best: { invoiceId: string; start: number; end: number } | undefined;
  for (const invoice of list(invoices)) {
    if (
      invoice.livemode !== live ||
      identity(invoice.customer) !== customerId ||
      identity(obj(obj(invoice.parent).subscription_details).subscription) !==
        subscriptionId
    )
      throw new CommerceError("provider_owner_mismatch");
    if (
      invoice.status !== "paid" ||
      invoice.currency !== contract.currency ||
      typeof invoice.amount_paid !== "number" ||
      invoice.amount_paid <= 0 ||
      typeof invoice.amount_due !== "number" ||
      invoice.amount_paid < invoice.amount_due
    )
      continue;
    for (const line of list(invoice.lines)) {
      const parent = obj(obj(line.parent).subscription_item_details);
      if (
        line.livemode !== live ||
        line.currency !== contract.currency ||
        identity(parent.subscription) !== subscriptionId ||
        parent.proration !== false ||
        identity(obj(obj(line.pricing).price_details).price) !==
          expectedPriceId ||
        line.quantity !== 1
      )
        continue;
      if (appliedIntro) {
        const lineDiscounts = line.discount_amounts == null ? [] : line.discount_amounts;
        const invoiceDiscounts = invoice.discounts == null ? [] : invoice.discounts;
        if (!Array.isArray(lineDiscounts) || !Array.isArray(invoiceDiscounts)) continue;
        if (invoice.billing_reason === "subscription_create") {
          const discount = obj(invoiceDiscounts[0]), source = obj(discount.source);
          if (line.amount !== contract.unitAmount || lineDiscounts.length !== 1 || invoiceDiscounts.length !== 1
            || obj(lineDiscounts[0]).amount !== PREMIUM_INTRO_OFFER.discountAmount || identity(obj(lineDiscounts[0]).discount) !== discount.id
            || source.type !== "coupon" || identity(source.coupon) !== appliedIntro.couponId || discount.promotion_code != null
            || (discount.customer != null && identity(discount.customer) !== customerId)
            || (discount.subscription != null && identity(discount.subscription) !== subscriptionId)) continue;
        } else if (invoice.billing_reason !== "subscription_cycle" || line.amount !== contract.unitAmount || lineDiscounts.length !== 0 || invoiceDiscounts.length !== 0) continue;
      }
      const start = epoch(obj(line.period).start),
        end = Math.min(
          epoch(obj(line.period).end),
          periodEnd,
          typeof s.cancel_at === "number" ? epoch(s.cancel_at) : periodEnd,
        );
      if (
        start > nowSeconds ||
        end <= nowSeconds ||
        end - start > 45 * 86400 ||
        start < periodStart
      )
        continue;
      if (!best || end > best.end)
        best = { invoiceId: commerceId(invoice.id, "in"), start, end };
    }
  }
  if (best)
    state.grant = {
      plan,
      subscriptionId,
      invoiceId: best.invoiceId,
      priceId: expectedPriceId,
      validFrom: new Date(best.start * 1000).toISOString(),
      expiresAt: new Date(best.end * 1000).toISOString(),
    };
  return state;
}

export function createCommerceProvider(
  config: CommerceConfig,
): CommerceProvider {
  const stripe = new Stripe(config.secretKey, {
    apiVersion: STRIPE_API_VERSION,
    timeout: 5000,
    maxNetworkRetries: 0,
  });
  const mode = config.mode === "live";
  // Coalesce the three independent catalog-price reads within this provider
  // instance only. Every new service request creates a new provider and reads
  // the actual portal again; there is no persistent stale readiness cache.
  let portalVerification: Promise<void> | undefined;
  const verifyPortal = () => portalVerification ??= stripe.billingPortal.configurations
    .retrieve(config.portalConfigurationId)
    .then(value => validateCommercePortalConfiguration(stripeSdkPayload(value), config));
  const ownerHash = (ownerId: string) =>
    createHash("sha256").update(`${config.namespace}:${ownerId}`).digest("hex");
  const checkoutResult = (session: Stripe.Checkout.Session, customerId: string, plan: PaidPlanId, intent: CheckoutIntent = {}) =>
    validateCommerceCheckout(stripeSdkPayload(session), customerId, config, plan, intent);
  return {
    async addonSubscription(subscriptionId, customerId, forRelease = false) {
      const subscription = await stripe.subscriptions.retrieve(commerceId(subscriptionId, "sub"));
      return validateAddonSubscription(JSON.parse(JSON.stringify(subscription)), customerId, config, Date.now(), forRelease);
    },
    async addonSchedule(scheduleId) {
      return JSON.parse(JSON.stringify(await stripe.subscriptionSchedules.retrieve(commerceId(scheduleId, "sub_sched"))));
    },
    async createAddonSchedule(subscriptionId, changeId) {
      return JSON.parse(JSON.stringify(await stripe.subscriptionSchedules.create(
        { from_subscription: commerceId(subscriptionId, "sub") }, { idempotencyKey: `sajda-addon-create-${changeId}` })));
    },
    async updateAddonSchedule(scheduleId, body, changeId) {
      return JSON.parse(JSON.stringify(await stripe.subscriptionSchedules.update(commerceId(scheduleId, "sub_sched"), body,
        { idempotencyKey: `sajda-addon-update-${changeId}` })));
    },
    async releaseAddonSchedule(scheduleId, operationId) {
      return JSON.parse(JSON.stringify(await stripe.subscriptionSchedules.release(commerceId(scheduleId, "sub_sched"),
        { preserve_cancel_date: true }, { idempotencyKey: `sajda-addon-release-${operationId}` })));
    },
    async price(plan = "trading") {
      await verifyPortal();
      const price = await stripe.prices.retrieve(commercePriceId(config, plan));
      return validateCommercePrice(stripeSdkPayload(price), config, plan);
    },
    async createCustomer(key, ownerId) {
      const customer = await stripe.customers.create(
        {
          metadata: {
            sajda_namespace: config.namespace,
            sajda_owner_hash: ownerHash(ownerId),
          },
        },
        { idempotencyKey: `sajda-customer-${key}` },
      );
      if (
        customer.livemode !== mode ||
        customer.metadata.sajda_namespace !== config.namespace ||
        customer.metadata.sajda_owner_hash !== ownerHash(ownerId)
      )
        throw new CommerceError("provider_owner_mismatch");
      return commerceId(customer.id, "cus");
    },
    async introEligible(customerId) {
      const history = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 });
      const payload = stripeSdkPayload(history);
      if (obj(payload).has_more !== false) throw new CommerceError("invalid_provider_response");
      const rows = list(payload);
      if (rows.some(row => row.livemode !== mode || identity(row.customer) !== customerId)) throw new CommerceError("provider_owner_mismatch");
      return rows.length === 0;
    },
    async introCoupon(couponId) {
      const price = await stripe.prices.retrieve(commercePriceId(config, "premium"));
      validateCommercePrice(stripeSdkPayload(price), config, "premium");
      const coupon = await stripe.coupons.retrieve(couponId, { expand: ["applies_to"] });
      validatePremiumIntroCoupon(stripeSdkPayload(coupon), couponId, commerceId(price.product, "prod"), config.mode);
    },
    async reconcile(customerId, approvedIntro = []) {
      const subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        status: "all",
        limit: 100,
      });
      const rows = list(stripeSdkPayload(subscriptions));
      for (const row of rows)
        if (row.livemode !== mode || identity(row.customer) !== customerId)
          throw new CommerceError("provider_owner_mismatch");
      // Checkout prevents a second subscription. An externally-created duplicate
      // is an operator incident, not permission to guess which charge to honor.
      const current = rows.filter(
        (row) =>
          !["canceled", "incomplete_expired"].includes(String(row.status)),
      );
      if (current.length > 1)
        return {
          status: "conflict",
          subscriptionId: null,
          cancelAtPeriodEnd: false,
          grant: null,
        };
      const sub =
        current[0] ??
        rows.sort((a, b) => Number(b.created) - Number(a.created))[0];
      if (!sub)
        return {
          status: "none",
          subscriptionId: null,
          cancelAtPeriodEnd: false,
          grant: null,
        };
      // Ordinary subscriptions do not depend on the additive offer migration.
      // For an intro subscription, retrieve its fenced persisted contract even
      // after the campaign is disabled or its coupon is no longer redeemable.
      const evidence = obj(sub.metadata).sajda_offer !== undefined
        ? typeof approvedIntro === "function" ? await approvedIntro() : approvedIntro
        : [];
      const invoices =
        sub.status === "active"
          ? await stripe.invoices.list({
              customer: customerId,
              subscription: commerceId(sub.id, "sub"),
              status: "paid",
              limit: 10,
              expand: ["data.discounts.source.coupon"],
            })
          : { data: [], has_more: false };
      // Ten recent paid invoices suffice for one monthly period. A pagination
      // marker here is expected on established customers, unlike line truncation.
      return evaluateSubscription(
        sub,
        { ...stripeSdkPayload(invoices as Stripe.ApiList<Stripe.Invoice>) as Obj, has_more: false },
        customerId,
        config,
        Date.now(),
        evidence,
      );
    },
    async createCheckout(input) {
      const plan = input.plan ?? "trading";
      const contract = PLANS[plan];
      if (input.offer && (input.offer !== PREMIUM_INTRO_OFFER.id || plan !== "premium" || !input.couponId)
        || !input.offer && input.couponId !== undefined) throw new CommerceError("intro_offer_unavailable", 409);
      if (input.returnTo !== undefined && input.returnTo !== "swipe") throw new CommerceError("checkout_context_conflict", 409);
      const session = await stripe.checkout.sessions.create(
        {
          mode: "subscription",
          customer: input.customerId,
          currency: contract.currency,
          adaptive_pricing: { enabled: false },
          payment_method_types: ["card"],
          line_items: [{ price: commercePriceId(config, plan), quantity: 1 }],
          expand: ["line_items.data.price"],
          ...(input.offer ? { discounts: [{ coupon: input.couponId! }] } : {}),
          success_url: `${input.origin}/${input.returnTo === "swipe" ? "swipe" : plan === "trading" ? "plus" : "pricing"}?billing=success`,
          cancel_url: `${input.origin}/${input.returnTo === "swipe" ? "swipe" : plan === "trading" ? "plus" : "pricing"}?billing=cancel`,
          expires_at: Math.floor(Date.parse(input.createdAt) / 1000) + 3600,
          metadata: {
            sajda_namespace: config.namespace,
            sajda_checkout: input.id,
            sajda_plan: plan,
            ...(input.offer ? { sajda_offer: input.offer, sajda_coupon: input.couponId! } : {}),
            ...(input.returnTo ? { sajda_return_to: input.returnTo } : {}),
          },
          subscription_data: {
            metadata: {
              sajda_namespace: config.namespace,
              sajda_checkout: input.id,
              sajda_plan: plan,
              ...(input.offer ? { sajda_offer: input.offer, sajda_coupon: input.couponId! } : {}),
            },
          },
        },
        { idempotencyKey: `sajda-checkout-${input.id}` },
      );
      return checkoutResult(session, input.customerId, plan, { offer: input.offer, couponId: input.couponId, returnTo: input.returnTo, id: input.id, origin: input.origin });
    },
    async checkout(sessionId, customerId, plan = "trading", intent = {}) {
      return checkoutResult(
        await stripe.checkout.sessions.retrieve(sessionId, {
          expand: ["line_items.data.price"],
        }),
        customerId,
        plan,
        intent,
      );
    },
    async recoverCheckout(customerId, reservationId, createdAt, plan = "trading", intent = {}) {
      const result = await stripe.checkout.sessions.list({
        customer: customerId,
        created: { gte: Math.floor(Date.parse(createdAt) / 1000) - 60 },
        limit: 100,
      });
      if (result.has_more)
        throw new CommerceError("billing_reconciliation_required", 409);
      for (const item of result.data) {
        if (item.livemode !== mode || identity(item.customer) !== customerId)
          throw new CommerceError("provider_owner_mismatch");
      }
      const matches = result.data.filter(
        (item) =>
          item.metadata?.sajda_namespace === config.namespace &&
          item.metadata?.sajda_checkout === reservationId &&
          item.metadata?.sajda_plan === plan,
      );
      if (matches.length > 1)
        throw new CommerceError("billing_reconciliation_required", 409);
      if (!matches[0]) return null;
      // List results do not include expanded line items. Never trust their URL
      // before retrieving and validating the exact recoverable session.
      return checkoutResult(
        await stripe.checkout.sessions.retrieve(matches[0].id, {
          expand: ["line_items.data.price"],
        }),
        customerId,
        plan,
        { ...intent, id: reservationId },
      );
    },
    async portal(customerId, origin, requestKey) {
      await verifyPortal();
      const session = await stripe.billingPortal.sessions.create(
        {
          customer: customerId,
          configuration: config.portalConfigurationId,
          return_url: `${origin}/plus?billing=return`,
        },
        {
          idempotencyKey: `sajda-portal-${config.namespace}-${ownerHash(customerId)}-${requestKey}`,
        },
      );
      return safeStripeUrl(session.url, "portal");
    },
    async verifyEvent(body, signature) {
      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(
          body,
          signature,
          config.webhookSecret,
          300,
        );
      } catch {
        throw new CommerceError("invalid_webhook_signature", 400);
      }
      if (event.livemode !== mode || event.account)
        throw new CommerceError("webhook_mode_mismatch", 400);
      const object = obj(event.data.object);
      let rawCustomer = identity(object.customer);
      if (event.type === "charge.dispute.created") {
        const charge = await stripe.charges.retrieve(
          commerceId(object.charge, "ch"),
        );
        if (charge.livemode !== mode)
          throw new CommerceError("webhook_mode_mismatch", 400);
        rawCustomer = identity(charge.customer);
      }
      return {
        id: commerceId(event.id, "evt"),
        type: event.type,
        created: epoch(event.created),
        livemode: event.livemode,
        customerId: rawCustomer ? commerceId(rawCustomer, "cus") : null,
        hold:
          event.type === "charge.dispute.created" ||
          (event.type === "charge.refunded" && object.refunded === true),
      };
    },
  };
}
