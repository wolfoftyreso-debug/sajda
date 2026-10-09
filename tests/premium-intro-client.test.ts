import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createServer } from "vite";
import { PAID_PLAN_ORDER, PLANS, PREMIUM_INTRO_OFFER } from "../shared/plans";

const origin = "https://sajda.example.test", requestId = "req_0123456789abcdef";
const key = "fe234ad2-cb19-47b4-831c-dce81dd612bf";
const price = (plan: typeof PAID_PLAN_ORDER[number]) => ({ currency: "usd", unitAmount: PLANS[plan].unitAmount,
  interval: "month", intervalCount: 1, taxBehavior: "exclusive" });
const billing = () => ({ accountId: "account-a", requestId, ready: true, mode: "test", price: price("trading"),
  status: "none", canCheckout: true, canManage: false, accessExpiresAt: null, activePlan: null,
  plans: Object.fromEntries(PAID_PLAN_ORDER.map(plan => [plan, { ready: true, price: price(plan), canCheckout: true }])),
  premiumIntro: { id: PREMIUM_INTRO_OFFER.id, eligible: true, ready: true, firstUnitAmount: 900, renewalUnitAmount: 1900, currency: "usd", interval: "month" } });
const errorCode = (code: string) => (error: unknown) => error !== null && typeof error === "object" && "code" in error && error.code === code;
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };

test("Premium introductory client validates exact commercial evidence and preserves account-bound explicit intent", async t => {
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window"), originalFetch = globalThis.fetch;
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { origin, hostname: "sajda.example.test" }, setTimeout, clearTimeout } });
  const vite = await createServer({ configFile: false, appType: "custom", server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] },
    define: { "import.meta.env.VITE_ACCOUNT_AUTH_ENABLED": '"true"', "import.meta.env.VITE_LOCAL_TEST_MODE": '"false"' } });
  const requests: { method: string; body?: Record<string, unknown>; owner: string | null }[] = [];
  let owner = "account-a", expired = false, sessionReads = 0;
  let reply: () => Response | Promise<Response> = () => Response.json(billing());
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input), origin); assert.equal(url.origin, origin); assert.equal(init.credentials, "same-origin");
    assert.equal(new Headers(init.headers).has("authorization"), false);
    if (url.pathname === "/api/auth/get-session") {
      sessionReads++; assert.equal(url.searchParams.get("disableCookieCache"), "true");
      return Response.json({ user: { id: owner, name: "QA", email: "qa@example.test", emailVerified: true,
        createdAt: "2026-09-01T10:00:00Z", updatedAt: "2026-09-01T10:00:00Z" },
        session: { id: "session-a", userId: owner, createdAt: "2026-09-01T10:00:00Z", updatedAt: "2026-09-01T10:00:00Z",
          expiresAt: new Date(Date.now() + (expired ? -60_000 : 60_000)).toISOString() } });
    }
    assert.equal(url.pathname, "/api/account/billing"); assert.equal(init.redirect, "error"); assert.equal(init.cache, "no-store");
    requests.push({ method: init.method ?? "GET", body: init.body ? JSON.parse(String(init.body)) : undefined, owner: new Headers(init.headers).get("x-sajda-account") });
    return reply();
  };
  try {
    const client = await vite.ssrLoadModule("/src/lib/plusBilling.ts") as typeof import("../src/lib/plusBilling");
    await t.test("exact 9 USD first month and 19 USD renewal are separate from the regular Premium price", () => {
      const result = client.parsePlusBilling(billing(), "account-a");
      assert.equal(result.premiumIntro?.firstUnitAmount, 900); assert.equal(result.premiumIntro?.renewalUnitAmount, 1900);
      assert.equal(result.plans.premium.price?.unitAmount, 1900); assert.equal(result.premiumIntro?.eligible, true);
      assert.equal(result.mode, "test"); assert.equal(requests.length, 0);
    });
    await t.test("corrupted offer amounts, periods, identity and eligibility never become a purchase offer", () => {
      const base = billing();
      for (const change of [{ id: "premium-unapproved" }, { firstUnitAmount: 901 }, { firstUnitAmount: 9 }, { firstUnitAmount: 900.1 },
        { renewalUnitAmount: 1901 }, { currency: "sek" }, { interval: "year" }, { eligible: "true" }, { ready: "true" }]) {
        assert.throws(() => client.parsePlusBilling({ ...base, premiumIntro: { ...base.premiumIntro, ...change } }, "account-a"), errorCode("invalid_response"));
      }
      for (const premiumIntro of [[], "offer", {}, { ...base.premiumIntro, ready: false }]) {
        assert.throws(() => client.parsePlusBilling({ ...base, premiumIntro }, "account-a"), errorCode("invalid_response"));
      }
      const blocked = structuredClone(base); blocked.plans.premium.canCheckout = false;
      assert.throws(() => client.parsePlusBilling(blocked, "account-a"), errorCode("invalid_response"));
      assert.throws(() => client.parsePlusBilling({ ...base, canCheckout: false, appStoreManaged: true }, "account-a"), errorCode("invalid_response"));
      assert.throws(() => client.parsePlusBilling({ ...base, accountId: "account-b" }, "account-a"), errorCode("account_changed"));
      assert.equal(requests.length, 0);
    });
    await t.test("a known ineligible account and a currently unavailable offer are different from eligibility", () => {
      const base = billing();
      const ineligible = client.parsePlusBilling({ ...base, status: "canceled", canManage: true,
        premiumIntro: { ...base.premiumIntro, eligible: false } }, "account-a");
      assert.equal(ineligible.premiumIntro?.ready, true); assert.equal(ineligible.premiumIntro?.eligible, false);
      const unavailable = client.parsePlusBilling({ ...base, premiumIntro: { ...base.premiumIntro, ready: false, eligible: false } }, "account-a");
      assert.equal(unavailable.premiumIntro?.ready, false); assert.equal(unavailable.premiumIntro?.eligible, false);
      assert.equal(client.parsePlusBilling({ ...base, premiumIntro: undefined }, "account-a").premiumIntro, null);
    });
    await t.test("invalid intro or return options fail before a session read or billing POST", async () => {
      const reads = sessionReads;
      for (const [action, plan, options] of [
        ["checkout", "premium", { offer: "invented" }], ["portal", "premium", { offer: PREMIUM_INTRO_OFFER.id }],
        ["checkout", "basic", { offer: PREMIUM_INTRO_OFFER.id }], ["checkout", "trading", { offer: PREMIUM_INTRO_OFFER.id }],
        ["checkout", "premium", { returnTo: "https://attacker.test" }], ["portal", "premium", { returnTo: "swipe" }],
      ] as const) {
        await assert.rejects(() => client.openPlusBilling({ accountId: "account-a" }, action, key, plan, options as never), errorCode("invalid_response"));
      }
      assert.equal(sessionReads, reads); assert.equal(requests.length, 0);
    });
    await t.test("explicit intro checkout sends only the approved offer/plan/return target and a stable intent key", async () => {
      requests.length = 0; owner = "account-a"; expired = false;
      reply = () => Response.json({ accountId: owner, requestId, url: "https://checkout.stripe.com/c/pay/cs_test_intro" });
      const url = await client.openPlusBilling({ accountId: owner }, "checkout", key, "premium", { offer: PREMIUM_INTRO_OFFER.id, returnTo: "swipe" });
      assert.equal(url, "https://checkout.stripe.com/c/pay/cs_test_intro");
      assert.deepEqual(requests, [{ method: "POST", owner: "account-a", body: { action: "checkout", requestKey: key, plan: "premium", offer: PREMIUM_INTRO_OFFER.id, returnTo: "swipe" } }]);
      assert.equal(sessionReads > 1, true, "A fresh post-response session check is still performed");
    });
    await t.test("an intro rejection never retries or substitutes a regular-price checkout", async () => {
      requests.length = 0;
      reply = () => Response.json({ code: "intro_offer_unavailable", requestId }, { status: 409 });
      await assert.rejects(() => client.openPlusBilling({ accountId: "account-a" }, "checkout", key, "premium", { offer: PREMIUM_INTRO_OFFER.id, returnTo: "swipe" }), errorCode("intro_offer_unavailable"));
      assert.equal(requests.length, 1); assert.equal(requests[0].body?.offer, PREMIUM_INTRO_OFFER.id);
    });
    await t.test("expired and switched accounts cannot consume a late intro checkout URL", async () => {
      requests.length = 0; owner = "account-a"; expired = false;
      reply = () => { expired = true; return Response.json({ accountId: "account-a", requestId, url: "https://checkout.stripe.com/c/pay/cs_test_intro" }); };
      await assert.rejects(() => client.openPlusBilling({ accountId: "account-a" }, "checkout", key, "premium", { offer: PREMIUM_INTRO_OFFER.id }), errorCode("unauthenticated"));
      expired = false; owner = "account-a"; requests.length = 0;
      const pending = deferred<Response>(); reply = () => pending.promise;
      const result = client.openPlusBilling({ accountId: "account-a" }, "checkout", key, "premium", { offer: PREMIUM_INTRO_OFFER.id });
      for (let i = 0; i < 100 && !requests.length; i++) await new Promise(done => setTimeout(done, 5));
      assert.equal(requests.length, 1); owner = "account-b";
      pending.resolve(Response.json({ accountId: "account-a", requestId, url: "https://checkout.stripe.com/c/pay/cs_test_old" }));
      await assert.rejects(() => result, errorCode("account_changed"));
      assert.equal(requests.length, 1);
    });
  } finally {
    await vite.close(); globalThis.fetch = originalFetch;
    if (windowDescriptor) Object.defineProperty(globalThis, "window", windowDescriptor); else Reflect.deleteProperty(globalThis, "window");
  }
});
