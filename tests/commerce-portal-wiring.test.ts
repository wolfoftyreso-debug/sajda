import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import http, { type ClientRequest, type IncomingMessage } from "node:http";
import https from "node:https";
import { Readable } from "node:stream";
import test, { type TestContext } from "node:test";
import { CommerceError, commerceConfig } from "../api/_shared/commerce-config";
import { createCommerceProvider } from "../api/_shared/commerce-provider";
import { createCommerceService } from "../api/_shared/commerce-service";
import type { CommerceStore } from "../api/_shared/commerce-store";
import { PAID_PLAN_ORDER, PLANS } from "../shared/plans";

const config = commerceConfig({
  STRIPE_SECRET_KEY: "sk_test_fixtureNotARealKey123",
  STRIPE_WEBHOOK_SECRET: "whsec_fixtureNotARealSecret123",
  STRIPE_BASIC_PRICE_ID: "price_basic",
  STRIPE_PREMIUM_PRICE_ID: "price_premium",
  STRIPE_TRADING_PRICE_ID: "price_trading",
  STRIPE_PORTAL_CONFIGURATION_ID: "bpc_fixture",
  STRIPE_BASIC_CHECKOUT_ENABLED: "true",
  STRIPE_PREMIUM_CHECKOUT_ENABLED: "true",
  STRIPE_CHECKOUT_ENABLED: "true",
});
const portalPath = "/v1/billing_portal/configurations/bpc_fixture";
const sessionPath = "/v1/billing_portal/sessions";
const unavailable = (error: unknown) => error instanceof CommerceError && error.code === "billing_portal_unavailable";

/** Exercise the unmodified Stripe SDK and its real Node HTTP/JSON response
 * path. No resource methods, provider methods or validators are replaced.
 * The only approved HTTP requests are synthetic catalog/portal fixtures;
 * every other HTTP, HTTPS or fetch request is denied, never forwarded.
 */
async function withTransport(t: TestContext, run: (fixture: ReturnType<typeof transportState>) => Promise<void>) {
  const fixture = transportState();
  const originalHttps = https.request, originalHttp = http.request, originalFetch = globalThis.fetch;
  const unexpected: string[] = [];
  const deny = (kind: string): never => { unexpected.push(kind); throw new Error("unexpected_fixture_network_request"); };
  const httpsMock = t.mock.method(https, "request", (options: https.RequestOptions) => {
    const method = options.method ?? "GET", route = String(options.path ?? "");
    if (options.host !== "api.stripe.com" || Number(options.port) !== 443) return deny("https-host");
    let reply: () => unknown;
    if (method === "GET" && route === portalPath) {
      reply = () => { fixture.portalReads++; return fixture.portal(); };
    } else if (method === "GET" && PAID_PLAN_ORDER.some(plan => route === `/v1/prices/${config.priceIds![plan]}`)) {
      const plan = PAID_PLAN_ORDER.find(plan => route === `/v1/prices/${config.priceIds![plan]}`)!;
      reply = () => { fixture.priceReads++; return fixture.price(plan); };
    } else if (method === "POST" && route === sessionPath && fixture.allowPortalSession) {
      reply = () => { fixture.portalSessions++; return { id: "bps_fixture", object: "billing_portal.session", url: "https://billing.stripe.com/p/session/fixture" }; };
    } else return deny(`${method} ${route}`);

    fixture.requests.push(`${method} ${route}`);
    const request = new EventEmitter() as ClientRequest;
    let body = "";
    request.setTimeout = () => request;
    request.write = (chunk: string | Buffer) => { body += String(chunk); return true; };
    request.end = () => {
      if (method === "POST") {
        const fields = new URLSearchParams(body);
        assert.equal(fields.get("customer"), "cus_fixture");
        assert.equal(fields.get("configuration"), config.portalConfigurationId);
        assert.equal(fields.get("return_url"), "https://sajda.example/plus?billing=return");
        assert.deepEqual([...fields.keys()].sort(), ["configuration", "customer", "return_url"]);
      } else assert.equal(body, "");
      const response = Readable.from([JSON.stringify(reply())]) as IncomingMessage;
      response.statusCode = 200;
      response.headers = { "content-type": "application/json", "request-id": "req_fixture" };
      response.complete = true;
      request.emit("response", response);
      return request;
    };
    queueMicrotask(() => request.emit("socket", { connecting: false }));
    return request;
  });
  const httpMock = t.mock.method(http, "request", () => deny("http"));
  const fetchMock = t.mock.method(globalThis, "fetch", () => deny("fetch"));
  try {
    await run(fixture);
    // Service snapshot reads intentionally catch provider failures. An unknown
    // request must still fail this test instead of becoming an unavailable UI.
    assert.deepEqual(unexpected, []);
  } finally {
    httpsMock.mock.restore(); httpMock.mock.restore(); fetchMock.mock.restore();
    assert.equal(https.request, originalHttps);
    assert.equal(http.request, originalHttp);
    assert.equal(globalThis.fetch, originalFetch);
  }
}

function transportState() {
  return {
    unsafe: false, allowPortalSession: false,
    portalReads: 0, priceReads: 0, portalSessions: 0, leases: 0,
    requests: [] as string[],
    portal() {
      return { id: config.portalConfigurationId, object: "billing_portal.configuration", active: true, livemode: false,
        features: { subscription_cancel: { enabled: true, mode: "at_period_end", proration_behavior: "none" },
          subscription_update: { enabled: this.unsafe }, customer_update: { enabled: false },
          invoice_history: { enabled: true }, payment_method_update: { enabled: true } }, login_page: { enabled: false } };
    },
    price(plan: typeof PAID_PLAN_ORDER[number]) {
      const contract = PLANS[plan];
      return { id: config.priceIds![plan], object: "price", active: true, livemode: false, currency: contract.currency,
        unit_amount: contract.unitAmount, unit_amount_decimal: String(contract.unitAmount), type: "recurring", billing_scheme: "per_unit",
        recurring: { interval: contract.interval, interval_count: contract.intervalCount, usage_type: "licensed" },
        tax_behavior: "exclusive", tiers_mode: null, transform_quantity: null, custom_unit_amount: null };
    },
    service() {
      const store = {
        appStoreSubscription: async () => null,
        read: async () => null,
        acquire: async () => { this.leases++; throw new Error("unexpected_fixture_customer_lease"); },
      } as unknown as CommerceStore;
      return createCommerceService({ config: () => config, store: () => store });
    },
  };
}

test("the real Stripe transport coalesces three concurrent catalog reads into one portal verification", async t => {
  await withTransport(t, async fixture => {
    const provider = createCommerceProvider(config);
    const prices = await Promise.all(PAID_PLAN_ORDER.map(plan => provider.price(plan)));
    assert.equal(fixture.portalReads, 1); assert.equal(fixture.priceReads, 3);
    assert.deepEqual(prices.map(price => price.unitAmount), PAID_PLAN_ORDER.map(plan => PLANS[plan].unitAmount));
    assert.equal(fixture.requests.length, 4);
  });
});

test("a reused commerce service verifies portal drift afresh on its next request", async t => {
  await withTransport(t, async fixture => {
    const service = fixture.service();
    const ready = await service.read("owner");
    assert.ok(PAID_PLAN_ORDER.every(plan => ready.plans[plan].canCheckout));
    assert.equal(fixture.portalReads, 1); assert.equal(fixture.priceReads, 3);
    fixture.unsafe = true;
    const blocked = await service.read("owner");
    assert.ok(PAID_PLAN_ORDER.every(plan => !blocked.plans[plan].ready && !blocked.plans[plan].canCheckout && blocked.plans[plan].price === null));
    assert.equal(fixture.portalReads, 2); assert.equal(fixture.priceReads, 3);
    assert.equal(fixture.leases, 0);
  });
});

test("an unsafe portal stops checkout before any customer lease, customer creation or checkout creation", async t => {
  await withTransport(t, async fixture => {
    fixture.unsafe = true;
    await assert.rejects(() => fixture.service().checkout("owner", "fixture", "https://sajda.example", "basic"), unavailable);
    assert.equal(fixture.leases, 0); assert.equal(fixture.priceReads, 0);
    assert.deepEqual(fixture.requests, [`GET ${portalPath}`]);
  });
});

test("an unsafe portal never creates a Stripe customer-portal session", async t => {
  await withTransport(t, async fixture => {
    fixture.unsafe = true;
    await assert.rejects(() => createCommerceProvider(config).portal("cus_fixture", "https://sajda.example", "fixture"), unavailable);
    assert.equal(fixture.portalSessions, 0);
    assert.deepEqual(fixture.requests, [`GET ${portalPath}`]);
  });
});

test("the next fresh service request recovers from rejected portal verification and checks portal access again", async t => {
  await withTransport(t, async fixture => {
    const service = fixture.service(); fixture.unsafe = true;
    const blocked = await service.read("owner");
    assert.ok(PAID_PLAN_ORDER.every(plan => !blocked.plans[plan].canCheckout));
    fixture.unsafe = false;
    const recovered = await service.read("owner");
    assert.ok(PAID_PLAN_ORDER.every(plan => recovered.plans[plan].canCheckout));
    assert.equal(fixture.portalReads, 2); assert.equal(fixture.priceReads, 3);
    fixture.allowPortalSession = true;
    assert.equal(await createCommerceProvider(config).portal("cus_fixture", "https://sajda.example", "fixture"), "https://billing.stripe.com/p/session/fixture");
    assert.equal(fixture.portalReads, 3); assert.equal(fixture.portalSessions, 1);
  });
});
