import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import Stripe from "stripe";
import { Readable } from "node:stream";
import {
  commerceConfig,
  CommerceError,
  safeStripeUrl,
  type CommerceConfig,
} from "../api/_shared/commerce-config";
import {
  evaluateSubscription,
  createCommerceProvider,
  validatePlusPrice,
  validatePlusCheckout,
  stripeSdkPayload,
  type BillingState,
  type CommerceProvider,
  type CommercePrice,
  type BillingEvent,
} from "../api/_shared/commerce-provider";
import {
  createCommerceStore,
  type CommerceStore,
  type CommerceLease,
  type CheckoutReservation,
  type CommercePool,
} from "../api/_shared/commerce-store";
import { createCommerceService } from "../api/_shared/commerce-service";
import { createBillingHandler } from "../api/account/billing";
import { createBillingWebhookHandler } from "../api/billing-webhook";
import { AccountAccessError } from "../api/_shared/account-error";
import { rawWebhookBody } from "../api/_shared/commerce-http";
import { PLUS_PLAN } from "../shared/plus-plan";

const environment = {
  STRIPE_SECRET_KEY: "sk_test_fixtureNotARealKey123",
  STRIPE_WEBHOOK_SECRET: "whsec_fixtureNotARealSecret123",
  STRIPE_PLUS_PRICE_ID: "price_fixture",
  STRIPE_PORTAL_CONFIGURATION_ID: "bpc_fixture",
  STRIPE_CHECKOUT_ENABLED: "true",
};
const config = commerceConfig(environment),
  now = Math.floor(Date.now() / 1000);
const price: CommercePrice = {
  currency: PLUS_PLAN.currency,
  unitAmount: PLUS_PLAN.unitAmount,
  interval: PLUS_PLAN.interval,
  intervalCount: PLUS_PLAN.intervalCount,
  taxBehavior: "exclusive",
};
const stripePrice = () => ({
  id: config.priceId,
  object: "price",
  active: true,
  livemode: false,
  currency: PLUS_PLAN.currency as string,
  unit_amount: PLUS_PLAN.unitAmount as number,
  unit_amount_decimal: String(PLUS_PLAN.unitAmount),
  type: "recurring",
  billing_scheme: "per_unit",
  recurring: {
    interval: PLUS_PLAN.interval as string,
    interval_count: PLUS_PLAN.intervalCount as number,
    usage_type: "licensed",
  },
  tax_behavior: "exclusive",
  tiers_mode: null,
  transform_quantity: null,
  custom_unit_amount: null,
});
const stripeCheckout = () => ({
  id: "cs_test_fixture",
  customer: "cus_fixture",
  livemode: false,
  mode: "subscription",
  status: "open",
  currency: PLUS_PLAN.currency,
  amount_subtotal: PLUS_PLAN.unitAmount,
  expires_at: now + 3600,
  url: "https://checkout.stripe.com/c/pay/fixture",
  line_items: {
    has_more: false,
    data: [{ quantity: 1, currency: PLUS_PLAN.currency, price: stripePrice() }],
  },
});
const noState: BillingState = {
  status: "none",
  subscriptionId: null,
  cancelAtPeriodEnd: false,
  grant: null,
};
const fixtures = () => {
  const subscription = {
    id: "sub_fixture",
    customer: "cus_fixture",
    livemode: false,
    status: "active",
    cancel_at_period_end: false,
    pause_collection: null,
    items: {
      has_more: false,
      data: [
        {
          quantity: 1,
          price: stripePrice(),
          current_period_start: now - 60,
          current_period_end: now + 86400,
        },
      ],
    },
  };
  const invoices = {
    has_more: false,
    data: [
      {
        id: "in_fixture",
        customer: "cus_fixture",
        livemode: false,
        status: "paid",
        amount_paid: 4900,
        amount_due: 4900,
        currency: "usd",
        parent: { subscription_details: { subscription: "sub_fixture" } },
        lines: {
          has_more: false,
          data: [
            {
              livemode: false,
              quantity: 1,
              currency: "usd",
              parent: {
                subscription_item_details: {
                  subscription: "sub_fixture",
                  proration: false,
                },
              },
              pricing: { price_details: { price: config.priceId } },
              period: { start: now - 60, end: now + 86400 },
            },
          ],
        },
      },
    ],
  };
  return { subscription, invoices };
};
const code = (value: string) => (error: unknown) =>
  error instanceof CommerceError && error.code === value;

const invalidPrices = () => [
  { ...stripePrice(), id: "price_wrong" },
  { ...stripePrice(), object: "product" },
  { ...stripePrice(), livemode: true },
  { ...stripePrice(), currency: "sek" },
  { ...stripePrice(), unit_amount: 4899, unit_amount_decimal: "4899" },
  { ...stripePrice(), unit_amount: 4901, unit_amount_decimal: "4901" },
  { ...stripePrice(), unit_amount: 4900.5, unit_amount_decimal: "4900.5" },
  { ...stripePrice(), unit_amount: "4900" },
  { ...stripePrice(), unit_amount: null },
  { ...stripePrice(), unit_amount_decimal: "4900.000000000001" },
  { ...stripePrice(), unit_amount_decimal: "4.9e3" },
  { ...stripePrice(), unit_amount_decimal: 4900 },
  { ...stripePrice(), type: "one_time", recurring: null },
  { ...stripePrice(), billing_scheme: "tiered" },
  { ...stripePrice(), tiers_mode: "volume" },
  { ...stripePrice(), tiers: [{ unit_amount: 4900, up_to: "inf" }] },
  { ...stripePrice(), transform_quantity: { divide_by: 2, round: "up" } },
  { ...stripePrice(), custom_unit_amount: { enabled: true } },
  {
    ...stripePrice(),
    recurring: { ...stripePrice().recurring, interval: "year" },
  },
  {
    ...stripePrice(),
    recurring: { ...stripePrice().recurring, interval_count: 2 },
  },
  {
    ...stripePrice(),
    recurring: { ...stripePrice().recurring, interval_count: 0.5 },
  },
  {
    ...stripePrice(),
    recurring: { ...stripePrice().recurring, usage_type: "metered" },
  },
  { ...stripePrice(), tax_behavior: "unknown" },
];

test("approved commercial contract is exactly USD 49 monthly and is verified from provider evidence", () => {
  assert.equal(PLUS_PLAN.unitAmount, 4900);
  assert.equal(PLUS_PLAN.currency, "usd");
  assert.equal(PLUS_PLAN.interval, "month");
  assert.equal(PLUS_PLAN.intervalCount, 1);
  assert.deepEqual(validatePlusPrice(stripePrice(), config), price);
  assert.deepEqual(
    validatePlusPrice(
      { ...stripePrice(), unit_amount_decimal: "4900.000000000000" },
      config,
    ),
    price,
  );
  for (const value of [undefined, null, config.priceId, {}, ...invalidPrices()])
    assert.throws(
      () => validatePlusPrice(value, config),
      code("billing_price_unavailable"),
    );
});

test("Stripe SDK Decimal responses are normalized losslessly before strict price validation", () => {
  const sdkPrice = { ...stripePrice(), unit_amount_decimal: Stripe.Decimal.from("4900") };
  assert.equal(typeof sdkPrice.unit_amount_decimal, "object");
  // Raw/untrusted object-valued decimals remain invalid. Only the authenticated
  // SDK adapter restores the documented wire representation.
  assert.throws(() => validatePlusPrice(sdkPrice, config), code("billing_price_unavailable"));
  assert.deepEqual(validatePlusPrice(stripeSdkPayload(sdkPrice as never), config), price);
  for (const decimal of ["4900.000000000001", "4899.999999999999", "200000"]) {
    const invalid = { ...sdkPrice, unit_amount_decimal: Stripe.Decimal.from(decimal) };
    const wire = stripeSdkPayload(invalid as never) as Record<string, unknown>;
    assert.equal(wire.unit_amount_decimal, decimal);
    assert.throws(() => validatePlusPrice(wire, config), code("billing_price_unavailable"));
  }
  for (const decimal of [
    { toString: () => "4900" },
    { toJSON: () => "4900" },
    { valueOf: () => 4900 },
  ]) assert.throws(() => validatePlusPrice({ ...stripePrice(), unit_amount_decimal: decimal }, config), code("billing_price_unavailable"));
});

test("expanded SDK decimals work in Checkout and subscription reconciliation without rounding", () => {
  const session = stripeCheckout();
  session.line_items.data[0].price.unit_amount_decimal = Stripe.Decimal.from("4900") as never;
  assert.equal(validatePlusCheckout(stripeSdkPayload(session as never), "cus_fixture", config).id, session.id);
  const { subscription, invoices } = fixtures();
  subscription.items.data[0].price.unit_amount_decimal = Stripe.Decimal.from("4900") as never;
  const sdkList = { object: "list", has_more: false, data: [subscription] };
  const normalized = stripeSdkPayload(sdkList as never) as { data: unknown[] };
  assert.ok(evaluateSubscription(normalized.data[0], invoices, "cus_fixture", config).grant);
  subscription.items.data[0].price.unit_amount_decimal = Stripe.Decimal.from("4900.000000000001") as never;
  const rejected = stripeSdkPayload(sdkList as never) as { data: unknown[] };
  assert.equal(evaluateSubscription(rejected.data[0], invoices, "cus_fixture", config).grant, null);
});

for (const previousAmount of [188000, 200000]) test(`the superseded USD ${previousAmount / 100} price cannot open checkout or grant Plus even with the configured price ID`, () => {
  const previousPrice = { ...stripePrice(), unit_amount: previousAmount, unit_amount_decimal: String(previousAmount) };
  assert.throws(() => validatePlusPrice(previousPrice, config), code("billing_price_unavailable"));
  const session = stripeCheckout();
  session.line_items.data[0].price = previousPrice;
  assert.throws(() => validatePlusCheckout(session, "cus_fixture", config), code("billing_price_unavailable"));
  const { subscription, invoices } = fixtures();
  subscription.items.data[0].price = previousPrice;
  invoices.data[0].amount_paid = previousAmount;
  invoices.data[0].amount_due = previousAmount;
  assert.equal(evaluateSubscription(subscription, invoices, "cus_fixture", config).grant, null);
});

test("a paid invoice cannot grant a different amount, currency, interval or pricing scheme even with the configured price ID", () => {
  for (const value of [config.priceId, {}, ...invalidPrices()]) {
    const { subscription, invoices } = fixtures();
    subscription.items.data[0].price = value as never;
    const result = evaluateSubscription(
      subscription,
      invoices,
      "cus_fixture",
      config,
    );
    assert.equal(result.status, "active");
    assert.equal(result.grant, null);
  }
});

test("archiving the exact approved price blocks new purchases but preserves an existing paid period", () => {
  const { subscription, invoices } = fixtures();
  subscription.items.data[0].price.active = false;
  assert.throws(
    () => validatePlusPrice(subscription.items.data[0].price, config),
    code("billing_price_unavailable"),
  );
  assert.ok(
    evaluateSubscription(subscription, invoices, "cus_fixture", config).grant,
  );
  subscription.items.data[0].price.unit_amount = 100;
  assert.equal(
    evaluateSubscription(subscription, invoices, "cus_fixture", config).grant,
    null,
  );
});

test("an open checkout requires complete owned line evidence matching the approved fixed contract", () => {
  assert.equal(
    validatePlusCheckout(stripeCheckout(), "cus_fixture", config).url,
    stripeCheckout().url,
  );
  for (const value of invalidPrices()) {
    const session = stripeCheckout();
    session.line_items.data[0].price = value as never;
    assert.throws(
      () => validatePlusCheckout(session, "cus_fixture", config),
      code("billing_price_unavailable"),
    );
  }
  for (const change of [
    { currency: "sek" },
    { line_items: undefined },
    { line_items: { has_more: true, data: stripeCheckout().line_items.data } },
    { line_items: { data: [] } },
    {
      line_items: {
        data: [
          ...stripeCheckout().line_items.data,
          ...stripeCheckout().line_items.data,
        ],
      },
    },
    {
      line_items: {
        data: [{ ...stripeCheckout().line_items.data[0], quantity: 2 }],
      },
    },
    {
      line_items: {
        data: [{ ...stripeCheckout().line_items.data[0], currency: "sek" }],
      },
    },
  ]) {
    assert.throws(() =>
      validatePlusCheckout(
        { ...stripeCheckout(), ...change },
        "cus_fixture",
        config,
      ),
    );
  }
  for (const change of [
    { customer: "cus_other" },
    { livemode: true },
    { mode: "payment" },
  ]) {
    assert.throws(
      () =>
        validatePlusCheckout(
          { ...stripeCheckout(), ...change },
          "cus_fixture",
          config,
        ),
      code("provider_owner_mismatch"),
    );
  }
});

test("expired or completed sessions never expose a payment URL even for an older price", () => {
  for (const status of ["expired", "complete"]) {
    const result = validatePlusCheckout(
      {
        ...stripeCheckout(),
        status,
        currency: "sek",
        amount_subtotal: 100,
        line_items: undefined,
      },
      "cus_fixture",
      config,
    );
    assert.equal(result.status, status);
    assert.equal(result.url, null);
  }
});

test("inclusive-tax subtotal is not confused with the approved price for one monthly unit", () => {
  const session = stripeCheckout();
  session.line_items.data[0].price.tax_behavior = "inclusive";
  assert.equal(
    validatePlusCheckout(
      { ...session, amount_subtotal: 4083, amount_total: 4900 },
      "cus_fixture",
      config,
    ).url,
    session.url,
  );
});

test("billing defaults to sandbox, fails closed without configuration, and rejects test/live environment mixing", () => {
  assert.equal(config.mode, "test");
  assert.equal(config.namespace, "development");
  assert.equal(
    commerceConfig({ ...environment, STRIPE_CHECKOUT_ENABLED: undefined })
      .checkoutEnabled,
    false,
  );
  for (const env of [
    {},
    { ...environment, VERCEL: "1", VERCEL_ENV: "production" },
    {
      ...environment,
      STRIPE_MODE: "live",
      STRIPE_SECRET_KEY: "sk_live_fixtureNotARealKey123",
      STRIPE_LIVE_ENABLED: "true",
    },
    {
      ...environment,
      VERCEL: "1",
      VERCEL_ENV: "production",
      STRIPE_MODE: "live",
      STRIPE_SECRET_KEY: "sk_live_fixtureNotARealKey123",
    },
    { ...environment, STRIPE_PLUS_PRICE_ID: "client_supplied_price" },
  ])
    assert.throws(() => commerceConfig(env), code("billing_not_configured"));
  assert.equal(
    commerceConfig({
      ...environment,
      VERCEL: "1",
      VERCEL_ENV: "production",
      STRIPE_MODE: "live",
      STRIPE_LIVE_ENABLED: "true",
      STRIPE_SECRET_KEY: "sk_live_fixtureNotARealKey123",
    }).mode,
    "live",
  );
});
test("a paid invoice and current matching monthly period are necessary for finite access", () => {
  const { subscription, invoices } = fixtures();
  const state = evaluateSubscription(
    subscription,
    invoices,
    "cus_fixture",
    config,
  );
  assert.equal(state.status, "active");
  assert.equal(
    state.grant?.expiresAt,
    new Date((now + 86400) * 1000).toISOString(),
  );
  assert.equal(state.grant?.invoiceId, "in_fixture");
  assert.equal(state.grant?.priceId, config.priceId);
  assert.equal(
    evaluateSubscription(
      subscription,
      { data: [], has_more: false },
      "cus_fixture",
      config,
    ).grant,
    null,
  );
});
test("declined, trial, canceled, paused, wrong-price, quantity and unpaid states cannot grant access", () => {
  for (const status of [
    "incomplete",
    "incomplete_expired",
    "trialing",
    "past_due",
    "canceled",
    "unpaid",
    "paused",
  ]) {
    const { subscription, invoices } = fixtures();
    assert.equal(
      evaluateSubscription(
        { ...subscription, status },
        invoices,
        "cus_fixture",
        config,
      ).grant,
      null,
    );
  }
  for (const mutate of [
    (f: ReturnType<typeof fixtures>) => {
      f.subscription.pause_collection = {} as never;
    },
    (f: ReturnType<typeof fixtures>) => {
      f.subscription.items.data[0].quantity = 2;
    },
    (f: ReturnType<typeof fixtures>) => {
      f.subscription.items.data[0].price.id = "price_wrong";
    },
    (f: ReturnType<typeof fixtures>) => {
      f.invoices.data[0].status = "open";
    },
    (f: ReturnType<typeof fixtures>) => {
      f.invoices.data[0].amount_paid = 0;
    },
    (f: ReturnType<typeof fixtures>) => {
      f.invoices.data[0].lines.data[0].parent.subscription_item_details.proration = true;
    },
    (f: ReturnType<typeof fixtures>) => {
      f.invoices.data[0].lines.data[0].period.end = now - 1;
    },
  ]) {
    const f = fixtures();
    mutate(f);
    assert.equal(
      evaluateSubscription(f.subscription, f.invoices, "cus_fixture", config)
        .grant,
      null,
    );
  }
});
test("subscription, invoice, test mode and customer ownership are checked independently", () => {
  for (const mutate of [
    (f: ReturnType<typeof fixtures>) => {
      f.subscription.customer = "cus_other";
    },
    (f: ReturnType<typeof fixtures>) => {
      f.subscription.livemode = true;
    },
    (f: ReturnType<typeof fixtures>) => {
      f.invoices.data[0].customer = "cus_other";
    },
    (f: ReturnType<typeof fixtures>) => {
      f.invoices.data[0].parent.subscription_details.subscription = "sub_other";
    },
  ]) {
    const f = fixtures();
    mutate(f);
    assert.throws(
      () =>
        evaluateSubscription(f.subscription, f.invoices, "cus_fixture", config),
      code("provider_owner_mismatch"),
    );
  }
});
test("cancel-at-period-end retains only paid time and future or unbounded periods grant nothing", () => {
  const f = fixtures();
  const s = {
    ...f.subscription,
    cancel_at_period_end: true,
    cancel_at: now + 3600,
  };
  assert.equal(
    evaluateSubscription(s, f.invoices, "cus_fixture", config).grant?.expiresAt,
    new Date((now + 3600) * 1000).toISOString(),
  );
  f.subscription.items.data[0].current_period_start = now + 600;
  assert.equal(
    evaluateSubscription(f.subscription, f.invoices, "cus_fixture", config)
      .grant,
    null,
  );
  f.subscription.items.data[0].current_period_start = now - 60;
  f.subscription.items.data[0].current_period_end = now + 100 * 86400;
  assert.equal(
    evaluateSubscription(f.subscription, f.invoices, "cus_fixture", config)
      .grant,
    null,
  );
});
test("only Stripe hosted HTTPS destinations may be returned to a customer", () => {
  assert.equal(
    safeStripeUrl("https://checkout.stripe.com/c/pay/fixture", "checkout"),
    "https://checkout.stripe.com/c/pay/fixture",
  );
  for (const url of [
    "https://checkout.stripe.com.attacker.com/",
    "http://checkout.stripe.com/",
    "https://user:pass@checkout.stripe.com/",
    "https://billing.stripe.com:444/",
    "javascript:alert(1)",
  ])
    assert.throws(() => safeStripeUrl(url, "checkout"));
});
test("Stripe SDK verifies original signed bytes, rejects tampering/old signatures and live events in sandbox", async () => {
  const provider = createCommerceProvider(config);
  const payload = JSON.stringify({
    id: "evt_fixture",
    object: "event",
    created: now,
    livemode: false,
    type: "invoice.paid",
    data: { object: { customer: "cus_fixture" } },
  });
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: config.webhookSecret,
    timestamp: now,
  });
  assert.equal(
    (await provider.verifyEvent(Buffer.from(payload), signature)).customerId,
    "cus_fixture",
  );
  await assert.rejects(
    () => provider.verifyEvent(Buffer.from(payload + " "), signature),
    code("invalid_webhook_signature"),
  );
  const old = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: config.webhookSecret,
    timestamp: now - 600,
  });
  await assert.rejects(
    () => provider.verifyEvent(Buffer.from(payload), old),
    code("invalid_webhook_signature"),
  );
  const live = payload.replace('"livemode":false', '"livemode":true');
  await assert.rejects(
    () =>
      provider.verifyEvent(
        Buffer.from(live),
        Stripe.webhooks.generateTestHeaderString({
          payload: live,
          secret: config.webhookSecret,
        }),
      ),
    code("webhook_mode_mismatch"),
  );
});

function memory() {
  let customerId: string | null = null,
    busy = false,
    reservation: CheckoutReservation | null = null,
    storedState = { ...noState };
  const events = new Set<string>();
  const calls: string[] = [];
  let actualState = { ...noState };
  let event: BillingEvent = {
    id: "evt_fixture",
    type: "invoice.paid",
    created: now,
    livemode: false,
    customerId: "cus_fixture",
    hold: false,
  };
  const customer = () => ({
    ownerId: "owner",
    customerId,
    customerKey: randomUUID(),
    createdAt: new Date().toISOString(),
    status: storedState.status,
    subscriptionId: storedState.subscriptionId,
    paymentHold: false,
    accessExpiresAt: storedState.grant?.expiresAt ?? null,
    syncedAt: null,
  });
  const store: CommerceStore = {
    appStoreSubscription: async () => false,
    read: async (id) => {
      assert.equal(id, "owner");
      return customerId ? customer() : null;
    },
    ownerFor: async (id) => (id === customerId ? "owner" : null),
    acquire: async (id) => {
      assert.equal(id, "owner");
      if (busy) throw new CommerceError("billing_busy", 409);
      busy = true;
      return { ...customer(), token: randomUUID(), fence: 1 };
    },
    release: async () => {
      busy = false;
    },
    customer: async (_lease, id) => {
      customerId = id;
    },
    reservation: async (_lease, key, priceId, origin) => {
      if (
        !reservation ||
        (reservation.requestKey !== key &&
          ["expired", "abandoned"].includes(reservation.state))
      )
        reservation = {
          id: randomUUID(),
          requestKey: key,
          priceId,
          origin,
          state: "creating",
          sessionId: null,
          createdAt: new Date().toISOString(),
        };
      return reservation;
    },
    saveCheckout: async (_lease, _id, value) => {
      reservation = {
        ...reservation!,
        sessionId: value.id,
        state: value.status,
      };
    },
    abandonCheckout: async () => {
      reservation = { ...reservation!, state: "abandoned" };
    },
    sync: async (_lease, state, envelope) => {
      storedState = structuredClone(state);
      if (envelope) events.add(envelope.event.id);
    },
    processed: async (id) => events.has(id),
    ignore: async (value) => {
      events.add(value.id);
    },
  };
  const provider: CommerceProvider = {
    price: async () => price,
    createCustomer: async () => {
      calls.push("createCustomer");
      return "cus_fixture";
    },
    reconcile: async () => {
      calls.push("reconcile");
      return structuredClone(actualState);
    },
    createCheckout: async () => {
      calls.push("createCheckout");
      return {
        id: "cs_test_fixture",
        status: "open",
        url: "https://checkout.stripe.com/c/pay/fixture",
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      };
    },
    checkout: async () => ({
      id: "cs_test_fixture",
      status: "open",
      url: "https://checkout.stripe.com/c/pay/fixture",
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    }),
    recoverCheckout: async () => null,
    portal: async (id) => {
      assert.equal(id, "cus_fixture");
      return "https://billing.stripe.com/p/session/fixture";
    },
    verifyEvent: async () => event,
  };
  return {
    store,
    provider,
    calls,
    get stored() {
      return storedState;
    },
    set state(value: BillingState) {
      actualState = value;
    },
    set event(value: BillingEvent) {
      event = value;
    },
    set pending(value: CheckoutReservation) {
      reservation = value;
    },
    get service() {
      return createCommerceService({
        config: () => config,
        provider: () => provider,
        store: () => store,
      });
    },
  };
}
test("checkout refresh/retry reuses the same pending session and never grants from browser success", async () => {
  const fixture = memory(),
    key = randomUUID();
  await fixture.service.checkout("owner", key, "https://sajda.example");
  await fixture.service.checkout("owner", key, "https://sajda.example");
  await fixture.service.checkout(
    "owner",
    randomUUID(),
    "https://sajda.example",
  );
  assert.equal(
    fixture.calls.filter((value) => value === "createCustomer").length,
    1,
  );
  assert.equal(
    fixture.calls.filter((value) => value === "createCheckout").length,
    1,
  );
  assert.equal(fixture.stored.grant, null);
  assert.equal((await fixture.service.read("owner")).accessExpiresAt, null);
});

test("existing App Store billing prevents Stripe checkout without preventing existing Stripe portal access", async () => {
  const fixture = memory();
  await fixture.service.checkout("owner", randomUUID(), "https://sajda.example");
  fixture.calls.length = 0;
  fixture.store.appStoreSubscription = async (owner) => { assert.equal(owner, "owner"); return true; };
  const snapshot = await fixture.service.read("owner");
  assert.equal(snapshot.appStoreManaged, true); assert.equal(snapshot.canCheckout, false); assert.equal(snapshot.canManage, true);
  await assert.rejects(() => fixture.service.checkout("owner", randomUUID(), "https://sajda.example"), code("app_store_subscription_exists"));
  assert.equal(fixture.calls.includes("createCheckout"), false); assert.equal(fixture.calls.includes("createCustomer"), false);
  assert.match(await fixture.service.portal("owner", randomUUID(), "https://sajda.example"), /^https:\/\/billing\.stripe\.com/u);
});

test("Stripe rechecks Apple billing after its customer lease and fails closed on an unavailable guard", async () => {
  const fixture = memory(); let checks = 0;
  fixture.store.appStoreSubscription = async (owner, lease) => {
    assert.equal(owner, "owner"); checks++;
    if (checks === 1) { assert.equal(lease, undefined); return false; }
    assert.equal(lease?.ownerId, owner); return true;
  };
  await assert.rejects(() => fixture.service.checkout("owner", randomUUID(), "https://sajda.example"), code("app_store_subscription_exists"));
  assert.equal(checks, 2); assert.deepEqual(fixture.calls, []);
  fixture.store.appStoreSubscription = async () => { throw new CommerceError("billing_unavailable"); };
  await assert.rejects(() => fixture.service.checkout("owner", randomUUID(), "https://sajda.example"), code("billing_unavailable"));
  await assert.rejects(() => fixture.service.read("owner"), code("billing_unavailable"));
  assert.deepEqual(fixture.calls, []);
});

test("Postgres Apple duplicate-billing guard is namespace and owner scoped, includes retry/grace and respects lease", async () => {
  const calls: { sql: string; params: unknown[] }[] = [];
  let valid = true;
  const pool: CommercePool = { connect: async () => ({ release() {}, query: async (sql, params = []) => {
    calls.push({ sql, params }); return { rows: sql.includes("commerce:app-store-guard")
      ? [{ blocked: valid ? true : "true" }] : sql.includes("commerce:fence") ? [{ payment_hold: false }] : [] };
  } }) };
  const store = createCommerceStore({ ...config, namespace: "preview" }, pool);
  assert.equal(await store.appStoreSubscription("owner"), true);
  const query = calls.find(call => call.sql.includes("commerce:app-store-guard"))!;
  assert.deepEqual(query.params, ["preview", "owner"]); assert.match(query.sql, /status IN \(1,3,4\)/u);
  assert.match(query.sql, /revoked_at IS NULL/u); assert.doesNotMatch(query.sql, /auto_renew=true|verified_at|expires_at>/u);
  valid = false; await assert.rejects(() => store.appStoreSubscription("owner"), code("billing_unavailable"));
  assert.equal(calls.at(-1)?.sql, "ROLLBACK");
});
test("a previously stored open checkout cannot bypass the fixed price when configuration has changed", async () => {
  const fixture = memory();
  const key = randomUUID();
  await fixture.service.checkout("owner", key, "https://sajda.example");
  const oldSession = stripeCheckout();
  oldSession.line_items.data[0].price.id = "price_old";
  fixture.provider.checkout = async () =>
    validatePlusCheckout(oldSession, "cus_fixture", config);
  for (const requestKey of [key, randomUUID()]) {
    await assert.rejects(
      () =>
        fixture.service.checkout("owner", requestKey, "https://sajda.example"),
      code("billing_price_unavailable"),
    );
  }
  assert.equal(
    fixture.calls.filter((value) => value === "createCheckout").length,
    1,
  );
  assert.equal(fixture.stored.grant, null);
});

test("concurrent checkout attempts cannot obtain two billing leases", async () => {
  const fixture = memory();
  const results = await Promise.allSettled([
    fixture.service.checkout("owner", randomUUID(), "https://sajda.example"),
    fixture.service.checkout("owner", randomUUID(), "https://sajda.example"),
  ]);
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal(
    fixture.calls.filter((value) => value === "createCheckout").length,
    1,
  );
});
test("out-of-order event delivery re-fetches current cancellation and cannot revive paid access", async () => {
  const fixture = memory();
  await fixture.service.checkout(
    "owner",
    randomUUID(),
    "https://sajda.example",
  );
  const f = fixtures();
  fixture.state = evaluateSubscription(
    f.subscription,
    f.invoices,
    "cus_fixture",
    config,
  );
  await fixture.service.webhook(Buffer.from("newer"), "signature");
  assert.ok(fixture.stored.grant);
  fixture.state = {
    status: "canceled",
    subscriptionId: "sub_fixture",
    cancelAtPeriodEnd: false,
    grant: null,
  };
  fixture.event = {
    id: "evt_older",
    type: "customer.subscription.created",
    created: now - 300,
    livemode: false,
    customerId: "cus_fixture",
    hold: false,
  };
  await fixture.service.webhook(Buffer.from("older"), "signature");
  assert.equal(fixture.stored.grant, null);
  assert.equal(fixture.stored.status, "canceled");
  const count = fixture.calls.length;
  assert.equal(
    (await fixture.service.webhook(Buffer.from("older"), "signature"))
      .duplicate,
    true,
  );
  assert.equal(fixture.calls.length, count);
});
test("portal remains available when price read fails and new checkout is unavailable", async () => {
  const fixture = memory();
  await fixture.service.checkout(
    "owner",
    randomUUID(),
    "https://sajda.example",
  );
  fixture.provider.price = async () => {
    throw new Error("Provider timeout");
  };
  const snapshot = await fixture.service.read("owner");
  assert.equal(snapshot.ready, false);
  assert.equal(snapshot.canCheckout, false);
  assert.equal(snapshot.canManage, true);
  assert.equal(
    await fixture.service.portal(
      "owner",
      randomUUID(),
      "https://sajda.example",
    ),
    "https://billing.stripe.com/p/session/fixture",
  );
});
test("wrong configured price fails before customer or checkout creation without a fallback price", async () => {
  const fixture = memory();
  fixture.provider.price = async () =>
    validatePlusPrice(
      { ...stripePrice(), unit_amount: 100, unit_amount_decimal: "100" },
      config,
    );
  const snapshot = await fixture.service.read("owner");
  assert.equal(snapshot.ready, false);
  assert.equal(snapshot.price, null);
  assert.equal(snapshot.canCheckout, false);
  await assert.rejects(
    () =>
      fixture.service.checkout("owner", randomUUID(), "https://sajda.example"),
    code("billing_price_unavailable"),
  );
  assert.deepEqual(fixture.calls, []);
  assert.equal(fixture.stored.grant, null);
});

test("reconciliation removes a wrong-plan grant, blocks stale checkout reuse and keeps cancellation portal available", async () => {
  const fixture = memory();
  const key = randomUUID();
  await fixture.service.checkout("owner", key, "https://sajda.example");
  const f = fixtures();
  fixture.state = evaluateSubscription(
    f.subscription,
    f.invoices,
    "cus_fixture",
    config,
  );
  assert.ok((await fixture.service.read("owner")).accessExpiresAt);

  f.subscription.items.data[0].price.unit_amount = 100;
  f.subscription.items.data[0].price.unit_amount_decimal = "100";
  fixture.state = evaluateSubscription(
    f.subscription,
    f.invoices,
    "cus_fixture",
    config,
  );
  fixture.provider.price = async () =>
    validatePlusPrice(f.subscription.items.data[0].price, config);
  const snapshot = await fixture.service.read("owner");
  assert.equal(snapshot.ready, false);
  assert.equal(snapshot.price, null);
  assert.equal(snapshot.canCheckout, false);
  assert.equal(snapshot.canManage, true);
  assert.equal(snapshot.accessExpiresAt, null);
  assert.equal(fixture.stored.grant, null);
  for (const requestKey of [key, randomUUID()]) {
    await assert.rejects(
      () =>
        fixture.service.checkout("owner", requestKey, "https://sajda.example"),
      code("billing_price_unavailable"),
    );
  }
  assert.equal(
    fixture.calls.filter((value) => value === "createCheckout").length,
    1,
  );
  assert.equal(
    await fixture.service.portal(
      "owner",
      randomUUID(),
      "https://sajda.example",
    ),
    "https://billing.stripe.com/p/session/fixture",
  );
});

test("missing configuration returns honest unavailable snapshot and performs no database or provider work", async () => {
  const service = createCommerceService({
    config: () => {
      throw new CommerceError("billing_not_configured");
    },
  });
  assert.deepEqual(await service.read("owner"), {
    ready: false,
    mode: null,
    price: null,
    status: "none",
    canCheckout: false,
    canManage: false,
    accessExpiresAt: null,
  });
  await assert.rejects(
    () => service.checkout("owner", randomUUID(), "https://sajda.example"),
    code("billing_not_configured"),
  );
});
function response() {
  return {
    statusCode: 0,
    headers: {} as Record<string, string | number>,
    body: {} as Record<string, unknown>,
    setHeader(name: string, value: string | number) {
      this.headers[name] = value;
    },
    status(status: number) {
      this.statusCode = status;
      return this;
    },
    json(value: unknown) {
      this.body = value as Record<string, unknown>;
    },
  };
}
test("account endpoint rejects anonymous, cross-user, invalid body and arbitrary client prices", async () => {
  for (const failure of [
    new AccountAccessError("authentication_required", 401, "sign in"),
    new AccountAccessError("account_changed", 409, "changed"),
  ]) {
    const res = response();
    await createBillingHandler({
      authorize: async () => {
        throw failure;
      },
    })({ method: "POST", headers: {} }, res);
    assert.equal(res.statusCode, failure.status);
  }
  const handler = createBillingHandler({
    authorize: async (_headers, options) => {
      assert.equal(options?.verifiedEmail, true);
      assert.equal(options?.method, "POST");
      return { id: "owner", emailVerified: true };
    },
    limit: async () => {},
    origin: () => "https://sajda.example",
    service: memory().service,
  });
  for (const body of [
    { action: "checkout", requestKey: randomUUID(), priceId: "price_free" },
    { action: "portal", requestKey: randomUUID(), customerId: "cus_other" },
    { action: "success", requestKey: randomUUID() },
  ]) {
    const res = response();
    await handler(
      { method: "POST", headers: { "content-type": "application/json" }, body },
      res,
    );
    assert.equal(res.statusCode, 400);
  }
});
test("webhook transport requires raw signed bytes and never accepts parsed objects or oversized bodies", async () => {
  await assert.rejects(
    () => rawWebhookBody({ headers: {}, body: { forged: true } }),
    code("raw_webhook_body_required"),
  );
  await assert.rejects(
    () => rawWebhookBody({ headers: {}, body: Buffer.alloc(262145) }),
    code("request_too_large"),
  );
  const handler = createBillingWebhookHandler({
    webhook: async () => {
      throw new CommerceError("invalid_webhook_signature", 400);
    },
  });
  const res = response();
  await handler(
    {
      method: "POST",
      headers: { "stripe-signature": "bad" },
      body: Buffer.from("{}"),
    },
    res,
  );
  assert.equal(res.statusCode, 400);
  assert.equal(res.headers["Cache-Control"], "private, no-store");
  assert.ok(res.body.requestId);
});
test("Vercel lazy JSON getter is never touched while exact signed whitespace bytes are read from stream", async () => {
  const bytes = Buffer.from('{ "whitespace": true }\n');
  const stream = Readable.from([bytes.subarray(0, 5), bytes.subarray(5)]);
  const request = Object.assign(stream, {
    headers: { "content-type": "application/json" },
  });
  Object.defineProperty(request, "body", {
    get() {
      throw new Error("Lazy JSON parsing must not execute");
    },
  });
  assert.deepEqual(await rawWebhookBody(request), bytes);
});
test("database lease fencing and paid grants use namespace, owner, finite dates and an atomic event transaction", async () => {
  const calls: { sql: string; params: unknown[] }[] = [];
  let released = false;
  const pool: CommercePool = {
    connect: async () => ({
      query: async (sql, params = []) => {
        calls.push({ sql, params });
        return {
          rows: sql.includes("commerce:fence")
            ? [{ ok: 1 }]
            : sql.includes("commerce:event")
              ? [{ event_id: "evt_fixture" }]
              : [],
        };
      },
      release: () => {
        released = true;
      },
    }),
  };
  const store = createCommerceStore({ ...config, namespace: "preview" }, pool),
    f = fixtures(),
    state = evaluateSubscription(
      f.subscription,
      f.invoices,
      "cus_fixture",
      config,
    );
  const lease: CommerceLease = {
    ownerId: "owner",
    customerId: "cus_fixture",
    customerKey: randomUUID(),
    createdAt: new Date().toISOString(),
    status: "none",
    subscriptionId: null,
    paymentHold: false,
    accessExpiresAt: null,
    syncedAt: null,
    token: randomUUID(),
    fence: 2,
  };
  await store.sync(lease, state, {
    event: {
      id: "evt_fixture",
      type: "invoice.paid",
      created: now,
      livemode: false,
      customerId: "cus_fixture",
      hold: false,
    },
    hash: "a".repeat(64),
  });
  const grant = calls.find((call) => call.sql.includes("commerce:grant"))!;
  assert.deepEqual(grant.params.slice(0, 2), ["preview", "owner"]);
  assert.equal(grant.params[5], false);
  assert.equal(calls[0].sql, "BEGIN");
  assert.equal(calls.at(-1)?.sql, "COMMIT");
  assert.equal(released, true);
  assert.match(
    calls.find((call) => call.sql.includes("commerce:fence"))!.sql,
    /lease_until>clock_timestamp\(\) FOR UPDATE/u,
  );
});
test("migration is additive and central access cannot accept sandbox billing in production", async () => {
  const sql = await readFile(
    new URL("../db/migrations/0008_commerce.sql", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(sql, /\bINSERT\s+INTO\b|DROP TABLE|TRUNCATE/iu);
  assert.match(sql, /CHECK \(\(namespace='production'\)=livemode\)/u);
  assert.match(sql, /CREATE VIEW sajda\.lost_domain_effective_access/u);
  assert.match(sql, /WHERE a.grant_source='operator'/u);
  assert.match(sql, /WHERE \(a.namespace='production'\)=a.livemode/u);
  assert.match(sql, /WHERE state IN \('creating','open'\)/u);
});

test("lost create response is recovered by its persisted server UUID without a second Stripe session", async () => {
  const fixture = memory();
  await fixture.service.checkout(
    "owner",
    randomUUID(),
    "https://sajda.example",
  );
  const reservation: CheckoutReservation = {
    id: randomUUID(),
    requestKey: randomUUID(),
    priceId: config.priceId,
    origin: "https://sajda.example",
    state: "creating",
    sessionId: null,
    createdAt: new Date(Date.now() - 26 * 60000).toISOString(),
  };
  fixture.pending = reservation;
  fixture.provider.recoverCheckout = async (customer, id) => {
    assert.equal(customer, "cus_fixture");
    assert.equal(id, reservation.id);
    return {
      id: "cs_test_recovered",
      status: "open",
      url: "https://checkout.stripe.com/c/pay/recovered",
      expiresAt: new Date(Date.now() + 1800000).toISOString(),
    };
  };
  fixture.provider.checkout = async () => ({
    id: "cs_test_recovered",
    status: "open",
    url: "https://checkout.stripe.com/c/pay/recovered",
    expiresAt: new Date(Date.now() + 1800000).toISOString(),
  });
  assert.equal(
    await fixture.service.checkout(
      "owner",
      randomUUID(),
      "https://sajda.example",
    ),
    "https://checkout.stripe.com/c/pay/recovered",
  );
  assert.equal(
    fixture.calls.filter((value) => value === "createCheckout").length,
    1,
  );
});
test("definitively absent old session is abandoned and a new user request can restart safely", async () => {
  const fixture = memory();
  await fixture.service.checkout(
    "owner",
    randomUUID(),
    "https://sajda.example",
  );
  fixture.pending = {
    id: randomUUID(),
    requestKey: randomUUID(),
    priceId: config.priceId,
    origin: "https://sajda.example",
    state: "creating",
    sessionId: null,
    createdAt: new Date(Date.now() - 26 * 60000).toISOString(),
  };
  await fixture.service.checkout(
    "owner",
    randomUUID(),
    "https://sajda.example",
  );
  assert.equal(
    fixture.calls.filter((value) => value === "createCheckout").length,
    2,
  );
});
test("uncertain session recovery cannot create or retire a potentially charged session", async () => {
  const fixture = memory();
  await fixture.service.checkout(
    "owner",
    randomUUID(),
    "https://sajda.example",
  );
  fixture.pending = {
    id: randomUUID(),
    requestKey: randomUUID(),
    priceId: config.priceId,
    origin: "https://sajda.example",
    state: "creating",
    sessionId: null,
    createdAt: new Date(Date.now() - 26 * 60000).toISOString(),
  };
  fixture.provider.recoverCheckout = async () => {
    throw new CommerceError("billing_reconciliation_required", 409);
  };
  await assert.rejects(
    () =>
      fixture.service.checkout("owner", randomUUID(), "https://sajda.example"),
    code("billing_reconciliation_required"),
  );
  assert.equal(
    fixture.calls.filter((value) => value === "createCheckout").length,
    1,
  );
});
test("authenticated read repairs a missed paid or cancellation webhook using fresh provider state", async () => {
  const fixture = memory();
  await fixture.service.checkout(
    "owner",
    randomUUID(),
    "https://sajda.example",
  );
  const f = fixtures();
  fixture.state = evaluateSubscription(
    f.subscription,
    f.invoices,
    "cus_fixture",
    config,
  );
  assert.ok((await fixture.service.read("owner")).accessExpiresAt);
  fixture.state = {
    ...noState,
    status: "canceled",
    subscriptionId: "sub_fixture",
  };
  assert.equal((await fixture.service.read("owner")).accessExpiresAt, null);
  assert.equal(fixture.stored.status, "canceled");
});
