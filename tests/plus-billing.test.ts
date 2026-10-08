import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createElement as h } from "react";
import { MemoryRouter } from "react-router-dom";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { createServer } from "vite";
import type { PlusBillingSnapshot } from "../src/lib/plusBilling";
import { PLUS_PLAN } from "../shared/plus-plan";

const origin = "https://sajda.example.test", requestId = "req_0123456789abcdef";
const billing = (accountId = "account-a"): PlusBillingSnapshot => ({ accountId, requestId, ready: true, mode: "test",
  price: { currency: "usd", unitAmount: PLUS_PLAN.unitAmount, interval: "month", intervalCount: 1, taxBehavior: "exclusive" },
  status: "none", canCheckout: true, canManage: false, accessExpiresAt: null, activePlan: null,
  plans: Object.fromEntries(["basic", "premium", "trading"].map(plan => [plan, { ready: true, canCheckout: true,
    price: { currency: "usd", unitAmount: plan === "basic" ? 900 : plan === "premium" ? 1900 : 4900,
      interval: "month", intervalCount: 1, taxBehavior: "exclusive" } }])) as PlusBillingSnapshot["plans"] });
const managed = (accountId = "account-a"): PlusBillingSnapshot => ({ ...billing(accountId), status: "active", canCheckout: false, canManage: true, activePlan: "premium",
  plans: Object.fromEntries(Object.entries(billing(accountId).plans).map(([plan, value]) => [plan, { ...value, canCheckout: false }])) as PlusBillingSnapshot["plans"],
  tradingAddon: { canAdd: true, canRemove: false, pending: null } });
const pause = () => new Promise(resolve => setTimeout(resolve, 5));
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
const label = (node: ReactTestInstance): string => node.children.map(child => typeof child === "string" ? child : label(child)).join("");

test("Trading billing routes add-on changes to Pricing and retains safe portal/account boundaries", async t => {
  const originals = new Map(["window", "IS_REACT_ACT_ENVIRONMENT"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const originalFetch = globalThis.fetch;
  const navigations: string[] = [], verifiedOwners: string[] = [];
  const onStatusVerified = (accountId: string) => { verifiedOwners.push(accountId); };
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { origin, hostname: "sajda.example.test", assign: (url: string) => navigations.push(url) }, setTimeout, clearTimeout } });
  const vite = await createServer({ configFile: false, appType: "custom", server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" },
    define: { "import.meta.env.VITE_ACCOUNT_AUTH_ENABLED": '"true"', "import.meta.env.VITE_LOCAL_TEST_MODE": '"false"' },
    plugins: [{ name: "billing-test-controls", enforce: "pre", load(id) { if (id.replaceAll("\\", "/").endsWith("/src/components/ui/button.tsx")) return "import{createElement as h,forwardRef}from'react';export const Button=forwardRef(({children,...props},ref)=>h('button',{...props,ref},children));"; } }],
  });
  let renderer: ReactTestRenderer | undefined, owner: string | null = "account-a", expired = false, language = "en";
  const requests: { method: string; owner: string; body?: { action: string; requestKey: string }; signal?: AbortSignal | null }[] = [];
  let reply: (request: typeof requests[number]) => Response | Promise<Response> = () => Response.json(billing());
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input), origin); assert.equal(url.origin, origin); assert.equal(init.credentials, "same-origin");
    if (url.pathname === "/api/auth/get-session") return Response.json(owner ? {
      user: { id: owner, email: "qa@example.test", emailVerified: true, name: "QA", createdAt: "2026-09-01T10:00:00Z", updatedAt: "2026-09-01T10:00:00Z" },
      session: { id: "session-a", userId: owner, createdAt: "2026-09-01T10:00:00Z", updatedAt: "2026-09-01T10:00:00Z", expiresAt: new Date(Date.now() + (expired ? -60_000 : 60_000)).toISOString() },
    } : null);
    assert.equal(url.pathname, "/api/account/billing"); assert.equal(init.redirect, "error"); assert.equal(init.cache, "no-store");
    const request = { method: init.method ?? "GET", owner: new Headers(init.headers).get("x-sajda-account")!,
      body: init.body ? JSON.parse(String(init.body)) : undefined, signal: init.signal };
    requests.push(request); return reply(request);
  };
  try {
    const client = await vite.ssrLoadModule("/src/lib/plusBilling.ts");
    const { default: PlusBilling } = await vite.ssrLoadModule("/src/components/PlusBilling.tsx");
    const { getLostDomainsCopy } = await vite.ssrLoadModule("/src/i18n/lostDomainsCopy.ts");
    const { getPlusBillingCopy } = await vite.ssrLoadModule("/src/i18n/plusBillingCopy.ts");
    const { tradingAddonCopy } = await vite.ssrLoadModule("/src/i18n/tradingAddonCopy.ts");
    const tree = (route = "/plus") => h(MemoryRouter, { initialEntries: [route] }, h(PlusBilling, { accountId: owner, language, fallback: getLostDomainsCopy(language), onStatusVerified }));
    const text = () => label(renderer!.root);
    const links = (href: string) => renderer!.root.findAllByType("a").filter(node => node.props.href === href);
    const buttons = (name: string) => renderer!.root.findAllByType("button").filter(node => label(node) === name);
    const button = (name: string) => { const value = buttons(name)[0]; assert.ok(value, `Expected ${name}`); return value; };
    const until = async (predicate: () => boolean) => { for (let i = 0; i < 150 && !predicate(); i++) await act(pause); assert.ok(predicate(), "Mounted billing settles"); };
    const mount = async (response = billing(), account: string | null = "account-a", route = "/plus") => {
      if (renderer) await act(async () => { renderer!.unmount(); });
      requests.length = 0; navigations.length = 0; verifiedOwners.length = 0; owner = account; expired = false; reply = () => Response.json(response);
      await act(async () => { renderer = create(tree(route), { unstable_isConcurrent: true }); await pause(); });
      if (account) await until(() => !text().includes(getPlusBillingCopy(language).loading));
    };
    const click = async (name: string) => { await act(async () => { button(name).props.onClick(); await pause(); }); };
    const posts = () => requests.filter(row => row.method === "POST");
    await t.test("snapshot rejects invented readiness, currency, periods, conflicting amounts and wrong owner", () => {
      assert.equal(client.parsePlusBilling(billing(), "account-a").price.unitAmount, 4900);
      for (const change of [{ price: null }, { price: { ...billing().price, currency: "sek" } }, { price: { ...billing().price, interval: "year" } },
        ...[-1, 4899, 4901, 200000, 230000].map(unitAmount => ({ price: { ...billing().price, unitAmount } })), { ready: false }, { status: "active" }, { status: "made-up" }]) {
        assert.throws(() => client.parsePlusBilling({ ...billing(), ...change }, "account-a"), (error: { code: string }) => error.code === "invalid_response");
      }
      assert.throws(() => client.parsePlusBilling(billing("account-b"), "account-a"), (error: { code: string }) => error.code === "account_changed");
      assert.equal(client.parsePlusBilling({ ...billing(), ready: false, price: null, canCheckout: false, canManage: true }, "account-a").canManage, true);
      assert.throws(() => client.parsePlusBilling({ ...billing(), appStoreManaged: true }, "account-a"), (error: { code: string }) => error.code === "invalid_response");
    });
    await t.test("redirects allow only exact HTTPS Stripe hosts for their explicit action", () => {
      const payload = (url: string) => ({ accountId: "account-a", requestId, url });
      for (const [action, allowed] of [["checkout", "https://checkout.stripe.com/c/pay/fixture"], ["portal", "https://billing.stripe.com/p/session/fixture"]]) {
        assert.equal(client.parseBillingRedirect(payload(allowed), "account-a", action), allowed);
        for (const url of ["javascript:alert(1)", "https://checkout.stripe.com.attacker.test/", "https://attacker.test/", "http://billing.stripe.com/", "https://user:pass@billing.stripe.com/", "https://billing.stripe.com:8443/",
          action === "checkout" ? "https://billing.stripe.com/p/session/fixture" : "https://checkout.stripe.com/c/pay/fixture"]) assert.throws(() => client.parseBillingRedirect(payload(url), "account-a", action));
      }
    });
    await t.test("guest sees additive 30 and total 49 without private reads or a new Trading account", async () => {
      await mount(billing(), null);
      assert.match(text(), /USD 30 \/ month/); assert.match(text(), /USD 49 \/ month/);
      assert.ok(links("/auth?next=%2Faccount%23trading").length === 1);
      assert.equal(posts().length, 0); assert.equal(requests.length, 0); assert.equal(verifiedOwners.length, 0); assert.equal(navigations.length, 0);
    });
    for (const locale of ["en", "sv", "es", "fr", "zh"]) {
      await t.test(`${locale}: one same-account management entry, never direct checkout`, async () => {
        language = locale; await mount();
        assert.ok(text().includes(tradingAddonCopy[locale].priceLabel));
        assert.ok(text().includes(tradingAddonCopy[locale].totalLabel));
        assert.ok(text().includes(tradingAddonCopy[locale].proRequiredBody));
        assert.equal(links("/pricing#trading-addon").length, 1);
        assert.equal(links("/auth?next=%2Faccount%23trading").length, 0);
        assert.equal(posts().length, 0); assert.deepEqual(verifiedOwners, ["account-a"]);
      });
    }
    language = "en";
    await t.test("unverifiable old or conflicting prices do not enable any payment action", async () => {
      for (const unitAmount of [200000, 230000]) {
        await mount({ ...billing(), price: { ...billing().price!, unitAmount } });
        assert.match(text(), /USD 30 \/ month/); assert.match(text(), /USD 49 \/ month/);
        assert.doesNotMatch(text(), /2,000|2,300/); assert.match(text(), /billing response could not be verified/);
        assert.equal(links("/pricing#trading-addon").length, 0); assert.equal(posts().length, 0); assert.equal(verifiedOwners.length, 0);
      }
    });
    await t.test("unavailable billing has no payment mutation and preserves catalog prices", async () => {
      await mount({ ...billing(), ready: false, mode: null, price: null, canCheckout: false, canManage: false });
      assert.match(text(), /USD 30 \/ month/); assert.match(text(), /USD 49 \/ month/);
      assert.ok(text().includes(getPlusBillingCopy("en").unavailable)); assert.equal(posts().length, 0);
    });
    await t.test("existing customers retain explicit safe portal management without a second subscription", async () => {
      await mount({ ...managed(), ready: false, price: null });
      assert.ok(button("Manage Pro billing")); assert.match(text(), /Test mode — no real payment/);
      reply = () => Response.json({ accountId: owner, requestId, url: "https://billing.stripe.com/p/session/fixture" });
      await click("Manage Pro billing"); await until(() => navigations.length === 1);
      assert.equal(posts()[0].body?.action, "portal"); assert.equal(posts()[0].owner, "account-a");
      assert.deepEqual(Object.keys(posts()[0].body!).sort(), ["action", "requestKey"]);
    });
    await t.test("pending enable/remove show exact effective timestamp without enabling access or portal cancellation", async () => {
      for (const enabled of [true, false]) {
        const current = managed();
        await mount({ ...current, activePlan: enabled ? "premium" : "trading", tradingAddon: { canAdd: false, canRemove: false, pending: { enabled, effectiveAt: "2030-01-01T00:00:00.000Z", canCancel: true } } });
        assert.equal(renderer!.root.findByType("time").props.dateTime, "2030-01-01T00:00:00.000Z");
        assert.match(label(renderer!.root.findByType("time")), /12:00:00 AM UTC/u, "Visible renewal boundary includes time and zone");
        assert.ok(text().includes(enabled ? tradingAddonCopy.en.scheduledEnable : tradingAddonCopy.en.scheduledDisable));
        assert.equal(buttons("Manage Pro billing").length, 0); assert.equal(links("/pricing#trading-addon").length, 1);
        assert.equal(posts().length, 0); assert.equal(navigations.length, 0);
      }
    });
    await t.test("an omitted optional add-on DTO is UNKNOWN, not permission to open a cancellation portal", async () => {
      const snapshot = managed(); delete snapshot.tradingAddon;
      await mount(snapshot);
      assert.equal(buttons("Manage Pro billing").length, 0);
      assert.equal(links("/pricing#trading-addon").length, 1, "The canonical page can recheck without starting a mutation");
      assert.equal(posts().length, 0); assert.equal(navigations.length, 0);
    });
    await t.test("an uncertain processing change is not displayed as a scheduled activation or deactivation", async () => {
      for (const enabled of [true, false]) {
        await mount({...managed(), activePlan: enabled ? "premium" : "trading", tradingAddon: {canAdd: false, canRemove: false,
          pending: {enabled, effectiveAt: "2030-01-01T00:00:00.000Z", canCancel: false, state: "processing", canRetry: true}}});
        assert.ok(text().includes(tradingAddonCopy.en.processingChange));
        assert.equal(renderer!.root.findAllByType("time").length, 0, "Proposed date is not presented as confirmed");
        assert.ok(!text().includes(tradingAddonCopy.en.scheduledEnable)); assert.ok(!text().includes(tradingAddonCopy.en.scheduledDisable));
        assert.equal(buttons("Manage Pro billing").length, 0); assert.equal(posts().length, 0); assert.equal(navigations.length, 0);
      }
    });
    await t.test("App Store subscription uses Apple, not Stripe or a separate Pro/add-on purchase", async () => {
      await mount({ ...billing(), appStoreManaged: true, canCheckout: false });
      assert.match(text(), /App Store subscription/); assert.equal(links("https://apps.apple.com/account/subscriptions").length, 1);
      assert.equal(links("/pricing#trading-addon").length, 0); assert.equal(posts().length, 0);
    });
    await t.test("email verification stays on the owned account rather than an auth redirect loop", async () => {
      await mount();
      reply = () => Response.json({ code: "email_verification_required", requestId }, { status: 403 });
      await click("Check billing status"); await until(() => links("/account#trading").length === 1);
      assert.match(text(), /Request a confirmation link from your account/);
      assert.equal(links("/auth?next=%2Faccount%23trading").length, 0); assert.equal(posts().length, 0);
    });
    await t.test("duplicate portal clicks and uncertain retry preserve one request key", async () => {
      await mount(managed()); const pending = deferred<Response>(); reply = () => pending.promise;
      const start = button("Manage Pro billing"); await act(async () => { start.props.onClick(); start.props.onClick(); await pause(); });
      await until(() => posts().length === 1); const first = posts()[0]; assert.match(first.body!.requestKey, /^[a-f0-9-]{36}$/u);
      await act(async () => { pending.resolve(Response.json({ code: "billing_unavailable", requestId }, { status: 503 })); await pause(); });
      await until(() => text().includes("could not confirm the billing response"));
      reply = () => Response.json({ accountId: owner, requestId, url: "https://billing.stripe.com/p/session/fixture" });
      await click("Manage Pro billing"); await until(() => navigations.length === 1);
      assert.equal(posts()[1].body!.requestKey, first.body!.requestKey);
    });
    await t.test("invalid portal URL is never opened or leaked", async () => {
      await mount(managed()); reply = () => Response.json({ accountId: owner, requestId, url: "https://attacker.test/private-token" });
      await click("Manage Pro billing"); await until(() => text().includes("response could not be verified"));
      assert.equal(navigations.length, 0); assert.doesNotMatch(text(), /attacker|private-token/);
    });
    await t.test("account change aborts pending portal and ignores the old account redirect", async () => {
      await mount(managed()); const pending = deferred<Response>();
      reply = row => row.method === "POST" ? pending.promise : Response.json(managed(row.owner));
      await click("Manage Pro billing"); await until(() => posts().length === 1); const signal = posts()[0].signal;
      owner = "account-b"; await act(async () => { renderer!.update(tree()); await pause(); });
      await until(() => requests.some(row => row.owner === "account-b")); assert.equal(signal?.aborted, true);
      await act(async () => { pending.resolve(Response.json({ accountId: "account-a", requestId, url: "https://billing.stripe.com/p/session/old" })); await pause(); });
      assert.equal(navigations.length, 0); assert.deepEqual(verifiedOwners, ["account-a", "account-b"]);
    });
    await t.test("expired session after response cannot redirect to portal", async () => {
      await mount(managed()); reply = () => { expired = true; return Response.json({ accountId: owner, requestId, url: "https://billing.stripe.com/p/session/fixture" }); };
      await click("Manage Pro billing"); await until(() => text().includes("Sign in again"));
      assert.equal(navigations.length, 0); assert.equal(buttons("Manage Pro billing").length, 0);
      assert.equal(links("/auth?next=%2Faccount%23trading").length, 1);
    });
    await t.test("success/cancel return is informational and never an add-on activation or mutation", async () => {
      for (const state of ["success", "cancel"]) {
        await mount(billing(), "account-a", `/plus?billing=${state}`);
        assert.equal(posts().length, 0); assert.equal(navigations.length, 0);
        assert.ok(text().includes(state === "success" ? getPlusBillingCopy("en").returnPending : getPlusBillingCopy("en").cancelled));
      }
    });
  } finally {
    if (renderer) await act(async () => { renderer!.unmount(); });
    await vite.close(); globalThis.fetch = originalFetch;
    for (const [key, descriptor] of originals) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
  }
});
