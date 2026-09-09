import Stripe from "stripe";
import { createHash } from "node:crypto";
import { PLUS_PLAN } from "../../shared/plus-plan.js";
import {
  CommerceError,
  commerceId,
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
}
export interface BillingEvent {
  id: string;
  type: string;
  created: number;
  livemode: boolean;
  customerId: string | null;
  hold: boolean;
}
export interface CommerceProvider {
  price(): Promise<CommercePrice>;
  createCustomer(key: string, ownerId: string): Promise<string>;
  reconcile(customerId: string): Promise<BillingState>;
  createCheckout(input: {
    id: string;
    customerId: string;
    origin: string;
    createdAt: string;
  }): Promise<CheckoutState>;
  checkout(sessionId: string, customerId: string): Promise<CheckoutState>;
  recoverCheckout(
    customerId: string,
    reservationId: string,
    createdAt: string,
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

/** Validate provider evidence against the approved commercial contract.
 * `active` controls new purchases, not previously paid subscription periods.
 * The integer/decimal checks are separate: Number() would round tiny fractions.
 */
export function validatePlusPrice(
  value: unknown,
  config: Pick<CommerceConfig, "mode" | "priceId">,
  requireActive = true,
): CommercePrice {
  const price = obj(value);
  const recurring = obj(price.recurring);
  const decimal = price.unit_amount_decimal;
  const exactDecimal =
    decimal == null ||
    (typeof decimal === "string" &&
      new RegExp(`^${PLUS_PLAN.unitAmount}(?:\\.0{1,12})?$`, "u").test(
        decimal,
      ));
  if (
    price.object !== "price" ||
    price.id !== config.priceId ||
    typeof price.active !== "boolean" ||
    (requireActive && !price.active) ||
    price.livemode !== (config.mode === "live") ||
    price.currency !== PLUS_PLAN.currency ||
    price.unit_amount !== PLUS_PLAN.unitAmount ||
    !Number.isSafeInteger(price.unit_amount) ||
    !exactDecimal ||
    price.type !== "recurring" ||
    price.billing_scheme !== "per_unit" ||
    price.tiers_mode != null ||
    price.tiers != null ||
    price.transform_quantity != null ||
    price.custom_unit_amount != null ||
    recurring.interval !== PLUS_PLAN.interval ||
    recurring.interval_count !== PLUS_PLAN.intervalCount ||
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
  const session = obj(value);
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
      lines[0].currency !== PLUS_PLAN.currency ||
      session.currency !== PLUS_PLAN.currency
    ) {
      throw new CommerceError("billing_price_unavailable");
    }
    // Validate the unit Price rather than pre-tax subtotal or after-tax total;
    // those totals have different meanings for inclusive/exclusive tax.
    validatePlusPrice(lines[0].price, config);
  }
  return {
    id: commerceId(session.id, config.mode === "live" ? "cs_live" : "cs_test"),
    status: session.status as CheckoutState["status"],
    url:
      session.status === "open" ? safeStripeUrl(session.url, "checkout") : null,
    expiresAt: new Date(epoch(session.expires_at) * 1000).toISOString(),
  };
}

/** Provider snapshots are retrieved AFTER a fenced customer lease is acquired.
 * Event payloads and event creation timestamps never advance access directly.
 */
export function evaluateSubscription(
  sub: unknown,
  invoices: unknown,
  customerId: string,
  config: Pick<CommerceConfig, "mode" | "priceId">,
  now = Date.now(),
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
  if (
    s.status !== "active" ||
    s.pause_collection ||
    items.length !== 1 ||
    items[0].quantity !== 1
  )
    return state;
  try {
    validatePlusPrice(items[0].price, config, false);
  } catch (error) {
    if (
      error instanceof CommerceError &&
      error.code === "billing_price_unavailable"
    )
      return state;
    throw error;
  }
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
      invoice.currency !== PLUS_PLAN.currency ||
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
        line.currency !== PLUS_PLAN.currency ||
        identity(parent.subscription) !== subscriptionId ||
        parent.proration !== false ||
        identity(obj(obj(line.pricing).price_details).price) !==
          config.priceId ||
        line.quantity !== 1
      )
        continue;
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
      subscriptionId,
      invoiceId: best.invoiceId,
      priceId: config.priceId,
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
  const ownerHash = (ownerId: string) =>
    createHash("sha256").update(`${config.namespace}:${ownerId}`).digest("hex");
  const checkoutResult = (session: unknown, customerId: string) =>
    validatePlusCheckout(session, customerId, config);
  return {
    async price() {
      const price = await stripe.prices.retrieve(config.priceId);
      return validatePlusPrice(price, config);
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
    async reconcile(customerId) {
      const subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        status: "all",
        limit: 100,
      });
      const rows = list(subscriptions);
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
      const invoices =
        sub.status === "active"
          ? await stripe.invoices.list({
              customer: customerId,
              subscription: commerceId(sub.id, "sub"),
              status: "paid",
              limit: 10,
            })
          : { data: [], has_more: false };
      // Ten recent paid invoices suffice for one monthly period. A pagination
      // marker here is expected on established customers, unlike line truncation.
      return evaluateSubscription(
        sub,
        { ...invoices, has_more: false },
        customerId,
        config,
      );
    },
    async createCheckout(input) {
      const session = await stripe.checkout.sessions.create(
        {
          mode: "subscription",
          customer: input.customerId,
          currency: PLUS_PLAN.currency,
          adaptive_pricing: { enabled: false },
          payment_method_types: ["card"],
          line_items: [{ price: config.priceId, quantity: 1 }],
          expand: ["line_items.data.price"],
          success_url: `${input.origin}/plus?billing=success`,
          cancel_url: `${input.origin}/plus?billing=cancel`,
          expires_at: Math.floor(Date.parse(input.createdAt) / 1000) + 3600,
          metadata: {
            sajda_namespace: config.namespace,
            sajda_checkout: input.id,
          },
          subscription_data: {
            metadata: {
              sajda_namespace: config.namespace,
              sajda_checkout: input.id,
            },
          },
        },
        { idempotencyKey: `sajda-checkout-${input.id}` },
      );
      return checkoutResult(session, input.customerId);
    },
    async checkout(sessionId, customerId) {
      return checkoutResult(
        await stripe.checkout.sessions.retrieve(sessionId, {
          expand: ["line_items.data.price"],
        }),
        customerId,
      );
    },
    async recoverCheckout(customerId, reservationId, createdAt) {
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
          item.metadata?.sajda_checkout === reservationId,
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
      );
    },
    async portal(customerId, origin, requestKey) {
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
