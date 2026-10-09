import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import http, { type ClientRequest, type IncomingMessage } from "node:http";
import https from "node:https";
import { Readable } from "node:stream";
import test, { type TestContext } from "node:test";
import { commerceConfig, CommerceError } from "../api/_shared/commerce-config";
import { createCommerceProvider } from "../api/_shared/commerce-provider";
import { PREMIUM_INTRO_OFFER } from "../shared/plans";

const couponId = "sajda_premium_intro_fixture", reservationId = "fixture-reservation", origin = "https://sajda.example";
const config = commerceConfig({ STRIPE_SECRET_KEY: "sk_test_fixtureNotARealKey123", STRIPE_WEBHOOK_SECRET: "whsec_fixtureNotARealSecret123",
  STRIPE_BASIC_PRICE_ID: "price_basic", STRIPE_PREMIUM_PRICE_ID: "price_premium", STRIPE_TRADING_PRICE_ID: "price_trading",
  STRIPE_PORTAL_CONFIGURATION_ID: "bpc_fixture", STRIPE_PREMIUM_CHECKOUT_ENABLED: "true", STRIPE_CHECKOUT_ENABLED: "true",
  STRIPE_PREMIUM_INTRO_ENABLED: "true", STRIPE_PREMIUM_INTRO_COUPON_ID: couponId });
const now = Math.floor(Date.now() / 1000);
const price = { id: "price_premium", object: "price", active: true, livemode: false, product: "prod_premium", currency: "usd", unit_amount: 1900,
  unit_amount_decimal: "1900", type: "recurring", billing_scheme: "per_unit", recurring: { interval: "month", interval_count: 1, usage_type: "licensed" }, tax_behavior: "exclusive" };
const coupon = { id: couponId, object: "coupon", livemode: false, amount_off: 1000, currency: "usd", duration: "once", valid: true,
  percent_off: null, duration_in_months: null, applies_to: { products: ["prod_premium"] }, metadata: { sajda_offer: PREMIUM_INTRO_OFFER.id, sajda_environment: "test" } };
const metadata = { sajda_checkout: reservationId, sajda_offer: PREMIUM_INTRO_OFFER.id, sajda_coupon: couponId };
function state() {
  return {
    history: [] as unknown[], hasMore: false as boolean | undefined, intro: true, requests: [] as string[], evidenceReads: 0,
    session: { id: "cs_test_fixture", object: "checkout.session", customer: "cus_fixture", livemode: false, mode: "subscription", status: "open",
      expires_at: now + 3600, url: "https://checkout.stripe.com/c/pay/fixture", currency: "usd", amount_total: 900, total_details: { amount_discount: 1000 },
      discounts: [{ coupon: couponId, promotion_code: null }], metadata: { ...metadata, sajda_return_to: "swipe" },
      success_url: origin + "/swipe?billing=success", cancel_url: origin + "/swipe?billing=cancel",
      line_items: { data: [{ quantity: 1, currency: "usd", price }], has_more: false } },
    subscription() { return { id: "sub_fixture", object: "subscription", customer: "cus_fixture", livemode: false, status: "active",
      metadata: this.intro ? metadata : {}, cancel_at_period_end: false, pause_collection: null,
      items: { data: [{ quantity: 1, price, current_period_start: now - 60, current_period_end: now + 86400 }], has_more: false } }; },
    invoice() { return { id: "in_fixture", object: "invoice", customer: "cus_fixture", livemode: false, status: "paid", currency: "usd",
      amount_paid: 900, amount_due: 900, billing_reason: "subscription_create", parent: { subscription_details: { subscription: "sub_fixture" } },
      discounts: [{ id: "di_fixture", object: "discount", customer: "cus_fixture", subscription: "sub_fixture", promotion_code: null, source: { type: "coupon", coupon } }],
      lines: { has_more: false, data: [{ amount: 1900, quantity: 1, currency: "usd", livemode: false,
        parent: { subscription_item_details: { subscription: "sub_fixture", proration: false } }, pricing: { price_details: { price: "price_premium" } },
        period: { start: now - 60, end: now + 86400 }, discount_amounts: [{ amount: 1000, discount: "di_fixture" }] }] } }; },
  };
}

/** Unmodified Stripe SDK serialization/deserialization over synthetic HTTP
 * responses. All unapproved HTTP/HTTPS/fetch requests fail instead of reaching
 * any provider. This proves wiring, NOT real Stripe payment or renewal. */
async function transport(t: TestContext, run: (fixture: ReturnType<typeof state>) => Promise<void>) {
  const fixture = state(), unexpected: string[] = [];
  const deny = (route: string): never => { unexpected.push(route); throw new Error("unexpected_intro_fixture_network"); };
  const httpsMock = t.mock.method(https, "request", (options: https.RequestOptions) => {
    if (options.host !== "api.stripe.com" || Number(options.port) !== 443) return deny("wrong_https_host");
    const url = new URL(String(options.path), "https://api.stripe.com"), method = options.method ?? "GET";
    let reply: () => unknown;
    if (method === "GET" && url.pathname === "/v1/prices/price_premium") reply = () => price;
    else if (method === "GET" && url.pathname === `/v1/coupons/${couponId}`) {
      assert.equal(url.searchParams.get("expand[0]"), "applies_to");
      reply = () => coupon;
    } else if (method === "GET" && url.pathname === "/v1/subscriptions") {
      assert.equal(url.searchParams.get("customer"), "cus_fixture");
      assert.equal(url.searchParams.get("status"), "all"); assert.equal(url.searchParams.get("limit"), "100");
      reply = () => ({ object: "list", data: fixture.history, has_more: fixture.hasMore });
    } else if (method === "GET" && url.pathname === "/v1/invoices") {
      assert.equal(url.searchParams.get("customer"), "cus_fixture"); assert.equal(url.searchParams.get("subscription"), "sub_fixture");
      assert.equal(url.searchParams.get("status"), "paid"); assert.equal(url.searchParams.get("expand[0]"), "data.discounts.source.coupon");
      reply = () => ({ object: "list", data: [fixture.invoice()], has_more: false });
    } else if (method === "POST" && url.pathname === "/v1/checkout/sessions") reply = () => fixture.session;
    else return deny(`${method} ${url.pathname}`);
    fixture.requests.push(`${method} ${url.pathname}`);
    const request = new EventEmitter() as ClientRequest; let body = "";
    request.setTimeout = () => request; request.write = (chunk: string | Buffer) => { body += String(chunk); return true; };
    request.end = () => {
      if (method === "POST") {
        const fields = new URLSearchParams(body);
        assert.equal(fields.get("line_items[0][price]"), "price_premium"); assert.equal(fields.get("line_items[0][quantity]"), "1");
        assert.equal(fields.get("discounts[0][coupon]"), couponId); assert.equal(fields.get("currency"), "usd");
        assert.equal(fields.get("metadata[sajda_offer]"), PREMIUM_INTRO_OFFER.id);
        assert.equal(fields.get("subscription_data[metadata][sajda_offer]"), PREMIUM_INTRO_OFFER.id);
        assert.equal(fields.get("metadata[sajda_coupon]"), couponId); assert.equal(fields.get("subscription_data[metadata][sajda_coupon]"), couponId);
        assert.equal(fields.get("metadata[sajda_checkout]"), reservationId); assert.equal(fields.get("metadata[sajda_return_to]"), "swipe");
        assert.equal(fields.get("success_url"), origin + "/swipe?billing=success"); assert.equal(fields.get("cancel_url"), origin + "/swipe?billing=cancel");
        assert.equal(fields.has("allow_promotion_codes"), false); assert.equal(fields.has("line_items[0][price_data][unit_amount]"), false);
        assert.equal((options.headers as Record<string, string>)["Idempotency-Key"], `sajda-checkout-${reservationId}`);
      } else assert.equal(body, "");
      const response = Readable.from([JSON.stringify(reply())]) as IncomingMessage;
      response.statusCode = 200; response.headers = { "content-type": "application/json", "request-id": "req_fixture" }; response.complete = true;
      request.emit("response", response); return request;
    };
    queueMicrotask(() => request.emit("socket", { connecting: false }));
    return request;
  });
  const httpMock = t.mock.method(http, "request", () => deny("http")), fetchMock = t.mock.method(globalThis, "fetch", () => deny("fetch"));
  try { await run(fixture); assert.deepEqual(unexpected, []); }
  finally { httpsMock.mock.restore(); httpMock.mock.restore(); fetchMock.mock.restore(); }
}

test("intro SDK reads request includable product scope before coupon verification", async t => {
  await transport(t, async fixture => {
    await createCommerceProvider(config).introCoupon(couponId);
    assert.deepEqual(fixture.requests, ["GET /v1/prices/price_premium", `GET /v1/coupons/${couponId}`]);
  });
});

test("first-subscriber SDK eligibility uses complete all-status history and fails closed on truncation or wrong ownership", async t => {
  await transport(t, async fixture => {
    const provider = createCommerceProvider(config); assert.equal(await provider.introEligible("cus_fixture"), true);
    for (const status of ["active", "canceled", "incomplete", "incomplete_expired", "trialing", "past_due"]) {
      fixture.history = [{ ...fixture.subscription(), status }]; assert.equal(await provider.introEligible("cus_fixture"), false);
    }
    fixture.hasMore = true;
    await assert.rejects(() => provider.introEligible("cus_fixture"), (error: CommerceError) => error.code === "invalid_provider_response");
    fixture.hasMore = undefined; fixture.history = [];
    await assert.rejects(() => provider.introEligible("cus_fixture"), (error: CommerceError) => error.code === "invalid_provider_response");
    fixture.hasMore = false; fixture.history = [{ ...fixture.subscription(), customer: "cus_other" }];
    await assert.rejects(() => provider.introEligible("cus_fixture"), (error: CommerceError) => error.code === "provider_owner_mismatch");
  });
});

test("intro SDK checkout sends server-owned once discount and identical reservation context, never a new USD 9 recurring price", async t => {
  await transport(t, async () => {
    const input = { id: reservationId, customerId: "cus_fixture", origin, createdAt: new Date(now * 1000).toISOString(), plan: "premium" as const,
      offer: PREMIUM_INTRO_OFFER.id, couponId, returnTo: "swipe" as const };
    assert.equal((await createCommerceProvider(config).createCheckout(input)).status, "open");
  });
});

test("intro SDK reconciliation reads expanded invoice discount and lazily verifies persisted reservation; ordinary subscriptions skip it", async t => {
  await transport(t, async fixture => {
    fixture.history = [fixture.subscription()];
    const provider = createCommerceProvider(config), evidence = async () => { fixture.evidenceReads++; return [{ id: reservationId, couponId, priceId: "price_premium", offer: PREMIUM_INTRO_OFFER.id }]; };
    assert.equal((await provider.reconcile("cus_fixture", evidence)).grant?.plan, "premium"); assert.equal(fixture.evidenceReads, 1);
    fixture.intro = false; fixture.history = [fixture.subscription()];
    await provider.reconcile("cus_fixture", async () => { throw new Error("Ordinary subscriptions must not query the intro migration"); });
    assert.equal(fixture.evidenceReads, 1);
  });
});
