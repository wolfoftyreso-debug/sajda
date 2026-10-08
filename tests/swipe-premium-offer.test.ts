import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createElement as h } from "react";
import { MemoryRouter } from "react-router-dom";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { createServer } from "vite";
import { PAID_PLAN_ORDER, PLANS, PREMIUM_INTRO_OFFER } from "../shared/plans";
import { swipePremiumCopy } from "../src/i18n/swipePremiumCopy";

const origin = "https://sajda.example.test", requestId = "req_0123456789abcdef";
const billing = (accountId = "account-a") => ({ accountId, requestId, ready: true, mode: "test", price: {
  currency: "usd", unitAmount: 4900, interval: "month", intervalCount: 1, taxBehavior: "exclusive" },
  status: "none", canCheckout: true, canManage: false, accessExpiresAt: null, activePlan: null,
  plans: Object.fromEntries(PAID_PLAN_ORDER.map(plan => [plan, { ready: true, canCheckout: true,
    price: { currency: "usd", unitAmount: PLANS[plan].unitAmount, interval: "month", intervalCount: 1, taxBehavior: "exclusive" } }])),
  premiumIntro: { id: PREMIUM_INTRO_OFFER.id, eligible: true, ready: true, firstUnitAmount: 900, renewalUnitAmount: 1900, currency: "usd", interval: "month" } });
const label = (node: ReactTestInstance): string => node.children.map(child => typeof child === "string" ? child : label(child)).join("");
const pause = () => new Promise(done => setTimeout(done, 5));
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
const nativeTransportBoundary = {
  name: "swipe-offer-native-transport-boundary", enforce: "pre" as const,
  load(id: string) {
    if (id.replaceAll("\\", "/").endsWith("/src/lib/nativeTransport.ts")) return `
      let calls=0;
      function denied(){calls++;throw new Error("native_transport_must_not_be_used_by_offer");}
      export const readNativeSession=denied;export const nativeRequest=denied;
      export const nativeTransportCalls=()=>calls;
    `;
  },
};

test("mounted Swipe Premium offer keeps pricing, account, intent and deck-return boundaries explicit", async t => {
  const originals = new Map(["window", "IS_REACT_ACT_ENVIRONMENT"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const originalFetch = globalThis.fetch, navigations: string[] = [];
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { origin, hostname: "sajda.example.test", assign: (url: string) => navigations.push(url) }, setTimeout, clearTimeout } });
  const vite = await createServer({ configFile: false, appType: "custom", server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" },
    plugins: [nativeTransportBoundary],
    define: { "import.meta.env.VITE_ACCOUNT_AUTH_ENABLED": '"true"', "import.meta.env.VITE_LOCAL_TEST_MODE": '"false"', "import.meta.env.VITE_SAJDA_SURFACE": '"web"' } });
  const requests: { method: string; owner: string; body?: Record<string, unknown>; signal?: AbortSignal | null }[] = [];
  let renderer: ReactTestRenderer | undefined, owner: string | null = "account-a", authLoading = false;
  let language: keyof typeof swipePremiumCopy = "en", checkpoint = true, preparations = 0, closes = 0;
  let reply: (request: typeof requests[number]) => Response | Promise<Response> = request => Response.json(billing(request.owner));
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input), origin); assert.equal(url.origin, origin); assert.equal(init.credentials, "same-origin");
    if (url.pathname === "/api/auth/get-session") return Response.json(owner ? {
      user: { id: owner, name: "QA", email: "qa@example.test", emailVerified: true, createdAt: "2026-09-01T10:00:00Z", updatedAt: "2026-09-01T10:00:00Z" },
      session: { id: "session-a", userId: owner, createdAt: "2026-09-01T10:00:00Z", updatedAt: "2026-09-01T10:00:00Z", expiresAt: new Date(Date.now() + 60_000).toISOString() },
    } : null);
    assert.equal(url.pathname, "/api/account/billing"); assert.equal(init.redirect, "error"); assert.equal(init.cache, "no-store");
    const row = { method: init.method ?? "GET", owner: new Headers(init.headers).get("x-sajda-account")!, body: init.body ? JSON.parse(String(init.body)) : undefined, signal: init.signal };
    requests.push(row); return reply(row);
  };
  try {
    const { default: SwipePremiumOffer } = await vite.ssrLoadModule("/src/components/SwipePremiumOffer.tsx");
    const { nativeTransportCalls } = await vite.ssrLoadModule("/src/lib/nativeTransport.ts");
    const tree = () => h(MemoryRouter, { initialEntries: ["/swipe?premium=offer"] }, h(SwipePremiumOffer, { accountId: owner, authLoading, language,
      prepareReturn: () => { preparations++; return checkpoint; }, onClose: () => { closes++; } }));
    const text = () => label(renderer!.root);
    const buttons = (name: string) => renderer!.root.findAllByType("button").filter(node => label(node) === name);
    const button = (name: string) => { const result = buttons(name)[0]; assert.ok(result, `Expected action ${name}`); return result; };
    const until = async (condition: () => boolean) => { for (let i = 0; i < 150 && !condition(); i++) await act(pause); assert.ok(condition(), "Mounted offer settles"); };
    const posts = () => requests.filter(row => row.method === "POST");
    const mount = async (response: unknown = billing(), account: string | null = "account-a", chosenLanguage: keyof typeof swipePremiumCopy = "en", loading = false) => {
      if (renderer) await act(async () => renderer!.unmount());
      owner = account; authLoading = loading; language = chosenLanguage; preparations = 0; closes = 0; checkpoint = true;
      requests.length = 0; navigations.length = 0; reply = () => Response.json(response);
      await act(async () => { renderer = create(tree(), { unstable_isConcurrent: true }); await pause(); });
      if (account && !loading) await until(() => !text().includes(swipePremiumCopy[chosenLanguage].checking));
    };
    const click = async (name: string) => { await act(async () => { button(name).props.onClick(); await pause(); }); };

    await t.test("guest sees both introductory and renewal prices, and sign-in preserves the Swipe return route without fetch", async () => {
      await mount(billing(), null);
      assert.match(text(), /USD 9 for your first month/); assert.match(text(), /Then USD 19\/month/);
      assert.match(text(), /For new subscribers/); assert.match(text(), /Renews monthly/);
      const link = renderer!.root.findAllByType("a").find(node => node.props.href === "/auth?next=%2Fswipe%3Fpremium%3Doffer");
      assert.ok(link); assert.equal(label(link), swipePremiumCopy.en.signIn);
      const event = { button: 0, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
      await act(async () => { link.props.onClick(event); await pause(); });
      assert.equal(preparations, 1); assert.equal(requests.length, 0); assert.equal(navigations.length, 0);
    });
    await t.test("unfinished authentication never fetches billing or enables a purchase", async () => {
      await mount(billing(), "account-a", "en", true);
      assert.match(text(), /Checking your offer/); assert.equal(requests.length, 0); assert.equal(buttons(swipePremiumCopy.en.testUpgrade).length, 0);
    });
    for (const chosenLanguage of ["en", "sv", "es", "fr", "zh"] as const) await t.test(`${chosenLanguage}: exact first and renewal prices with an explicitly labeled TEST action`, async () => {
      await mount(billing(), "account-a", chosenLanguage);
      assert.ok(text().includes(swipePremiumCopy[chosenLanguage].firstMonth)); assert.ok(text().includes(swipePremiumCopy[chosenLanguage].renewal));
      assert.equal(button(swipePremiumCopy[chosenLanguage].testUpgrade).props.disabled, false);
      assert.equal(buttons(swipePremiumCopy[chosenLanguage].upgrade).length, 0);
      if (chosenLanguage === "en") assert.match(text(), /Test mode — no real payment/);
      assert.equal(posts().length, 0); assert.equal(preparations, 0);
    });
    await t.test("missing or unavailable intro evidence never silently becomes a full-price checkout", async () => {
      const base = billing();
      for (const premiumIntro of [undefined, null, { ...base.premiumIntro, ready: false, eligible: false }]) {
        await mount({ ...base, premiumIntro });
        assert.equal(buttons(swipePremiumCopy.en.testUpgrade).length, 0);
        assert.equal(buttons(swipePremiumCopy.en.testStandardUpgrade).length, 0);
        assert.equal(buttons(swipePremiumCopy.en.standardUpgrade).length, 0);
        assert.match(text(), /cannot be purchased right now/);
        assert.equal(posts().length, 0);
      }
    });
    await t.test("a verified ineligible returning account sees the explicit regular 19 USD price, not a first-month offer", async () => {
      const base = billing();
      await mount({ ...base, status: "canceled", canManage: true, premiumIntro: { ...base.premiumIntro, eligible: false } });
      assert.match(text(), /Pro · USD 19\/month/); assert.match(text(), /first Sajda subscription only/);
      assert.doesNotMatch(text(), /USD 9 for your first month/); assert.equal(buttons(swipePremiumCopy.en.testUpgrade).length, 0);
      reply = row => Response.json({ accountId: row.owner, requestId, url: "https://checkout.stripe.com/c/pay/cs_test_regular" });
      await click(swipePremiumCopy.en.testStandardUpgrade); await until(() => navigations.length === 1);
      assert.equal(posts().length, 1); assert.equal(posts()[0].body?.offer, undefined); assert.equal(posts()[0].body?.plan, "premium");
    });
    await t.test("double-click creates one POST and an uncertain retry preserves its intro offer and request key", async () => {
      await mount(); const pending = deferred<Response>(); reply = () => pending.promise;
      const start = button(swipePremiumCopy.en.testUpgrade);
      await act(async () => { start.props.onClick(); start.props.onClick(); await pause(); });
      await until(() => posts().length === 1); assert.equal(preparations, 1);
      const first = posts()[0].body!;
      assert.deepEqual(Object.keys(first).sort(), ["action", "offer", "plan", "requestKey", "returnTo"]);
      assert.equal(first.offer, PREMIUM_INTRO_OFFER.id); assert.equal(first.returnTo, "swipe");
      await act(async () => { pending.resolve(Response.json({ code: "billing_unavailable", requestId }, { status: 503 })); await pause(); });
      await until(() => text().includes("We could not confirm the billing response"));
      reply = row => Response.json({ accountId: row.owner, requestId, url: "https://checkout.stripe.com/c/pay/cs_test_intro" });
      await click(swipePremiumCopy.en.testUpgrade); await until(() => navigations.length === 1);
      assert.equal(posts().length, 2); assert.equal(posts()[1].body?.requestKey, first.requestKey); assert.equal(posts()[1].body?.offer, first.offer);
    });
    await t.test("an intro rejection remains a rejection, without a standard-price fallback or automatic POST", async () => {
      await mount(); reply = () => Response.json({ code: "intro_offer_unavailable", requestId }, { status: 409 });
      await click(swipePremiumCopy.en.testUpgrade); await until(() => text().includes("No full-price checkout was started"));
      assert.equal(posts().length, 1); assert.equal(navigations.length, 0);
      assert.equal(buttons(swipePremiumCopy.en.testStandardUpgrade).length, 0); assert.equal(buttons(swipePremiumCopy.en.testUpgrade).length, 0);
      await act(pause); assert.equal(posts().length, 1);
    });
    await t.test("account switching aborts the old checkout and discards its late redirect without poisoning the new owner", async () => {
      await mount(); const pending = deferred<Response>(); reply = row => row.method === "POST" ? pending.promise : Response.json(billing(row.owner));
      await click(swipePremiumCopy.en.testUpgrade); await until(() => posts().length === 1);
      const signal = posts()[0].signal; owner = "account-b";
      await act(async () => { renderer!.update(tree()); await pause(); });
      await until(() => requests.some(row => row.method === "GET" && row.owner === "account-b") && !text().includes(swipePremiumCopy.en.checking));
      assert.equal(signal?.aborted, true);
      await act(async () => { pending.resolve(Response.json({ accountId: "account-a", requestId, url: "https://checkout.stripe.com/c/pay/cs_test_old" })); await pause(); });
      assert.equal(navigations.length, 0); assert.equal(button(swipePremiumCopy.en.testUpgrade).props.disabled, false);
      assert.equal(posts().length, 1);
    });
      await t.test("closing the offer invokes only its close callback, without checkpoint, payment or navigation", async () => {
      await mount();
      await click(swipePremiumCopy.en.close);
        assert.equal(closes, 1); assert.equal(preparations, 0); assert.equal(posts().length, 0); assert.equal(navigations.length, 0);
      });
      await t.test("plan comparison opens a clearly labeled new tab without leaving the current deck", async () => {
        await mount();
        const link = renderer!.root.findAllByType("a").find(node => node.props.href === "/pricing");
        assert.ok(link); assert.equal(link.props.target, "_blank");
        assert.equal(link.props.rel, "noopener noreferrer"); assert.match(label(link), /new tab/);
        assert.equal(preparations, 0); assert.equal(posts().length, 0); assert.equal(navigations.length, 0);
      });
    await t.test("a failed return checkpoint prevents both checkout POST and sign-in navigation", async () => {
      await mount(); checkpoint = false;
      await click(swipePremiumCopy.en.testUpgrade);
      assert.match(text(), /deck could not be saved/); assert.equal(posts().length, 0); assert.equal(navigations.length, 0);
      await mount(billing(), null); checkpoint = false;
      const link = renderer!.root.findAllByType("a").find(node => node.props.href === "/auth?next=%2Fswipe%3Fpremium%3Doffer")!;
      const event = { button: 0, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
      await act(async () => { link.props.onClick(event); await pause(); });
      assert.equal(event.defaultPrevented, true); assert.match(text(), /No payment page was opened/); assert.equal(requests.length, 0);
    });
    await t.test("corrupted offer evidence cannot enable a purchase or leak the provider payload", async () => {
      const base = billing(); await mount({ ...base, premiumIntro: { ...base.premiumIntro, firstUnitAmount: 1, privateToken: "do-not-display" } });
      assert.match(text(), /billing response could not be verified/); assert.doesNotMatch(text(), /do-not-display/);
      assert.equal(buttons(swipePremiumCopy.en.testUpgrade).length, 0); assert.equal(buttons(swipePremiumCopy.en.testStandardUpgrade).length, 0); assert.equal(posts().length, 0);
    });
    assert.equal(nativeTransportCalls(), 0);
  } finally {
    if (renderer) await act(async () => renderer!.unmount());
    await vite.close(); globalThis.fetch = originalFetch;
    for (const [key, descriptor] of originals) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
  }
});

test("the native Swipe offer has no web price, Stripe request, sign-in detour or external upgrade link", async () => {
  const originals = new Map(["window", "IS_REACT_ACT_ENVIRONMENT"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const originalFetch = globalThis.fetch; let renderer: ReactTestRenderer | undefined, requests = 0, closes = 0, preparations = 0;
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { origin, hostname: "sajda.example.test" }, setTimeout, clearTimeout } });
  globalThis.fetch = async () => { requests++; throw new Error("native_offer_must_not_request_stripe"); };
  const vite = await createServer({ configFile: false, appType: "custom", server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" },
    plugins: [nativeTransportBoundary],
    define: { "import.meta.env.VITE_ACCOUNT_AUTH_ENABLED": '"true"', "import.meta.env.VITE_LOCAL_TEST_MODE": '"false"', "import.meta.env.VITE_SAJDA_SURFACE": '"native"' } });
  try {
    const { default: SwipePremiumOffer } = await vite.ssrLoadModule("/src/components/SwipePremiumOffer.tsx");
    const { nativeTransportCalls } = await vite.ssrLoadModule("/src/lib/nativeTransport.ts");
    await act(async () => { renderer = create(h(MemoryRouter, null, h(SwipePremiumOffer, { accountId: "account-a", authLoading: false, language: "en",
      prepareReturn: () => { preparations++; return true; }, onClose: () => { closes++; } }))); await pause(); });
    const text = label(renderer!.root);
    assert.match(text, /App Store/); assert.match(text, /introductory offer does not apply here/);
    assert.doesNotMatch(text, /USD 9|USD 19|Get Premium|Test Premium/);
    assert.equal(renderer!.root.findAllByType("a").length, 0); assert.equal(requests, 0); assert.equal(preparations, 0);
    assert.equal(nativeTransportCalls(), 0, "An unexpected native request cannot hide behind the native text-only return branch");
    const buttons = renderer!.root.findAllByType("button"); assert.equal(buttons.length, 1);
    await act(async () => buttons[0].props.onClick()); assert.equal(closes, 1); assert.equal(requests, 0);
  } finally {
    if (renderer) await act(async () => renderer!.unmount());
    await vite.close(); globalThis.fetch = originalFetch;
    for (const [key, descriptor] of originals) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
  }
});
