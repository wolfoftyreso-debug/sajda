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
  price: { currency: "usd", unitAmount: PLUS_PLAN.unitAmount, interval: "month", intervalCount: 1, taxBehavior: "exclusive" }, status: "none", canCheckout: true, canManage: false, accessExpiresAt: null });
const pause = () => new Promise(resolve => setTimeout(resolve, 5));
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
const label = (node: ReactTestInstance): string => node.children.map(child => typeof child === "string" ? child : label(child)).join("");

test("Plus billing validates server truth and protects explicit checkout, portal and account scope", async t => {
  const originals = new Map(["window", "IS_REACT_ACT_ENVIRONMENT"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const originalFetch = globalThis.fetch;
  const navigations: string[] = [];
  const verifiedOwners: string[] = [];
  const onStatusVerified = (accountId: string) => { verifiedOwners.push(accountId); };
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { origin, hostname: "sajda.example.test", assign: (url: string) => navigations.push(url) }, setTimeout, clearTimeout } });
  const vite = await createServer({ configFile: false, appType: "custom", server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" },
    define: { "import.meta.env.VITE_ACCOUNT_AUTH_ENABLED": '"true"', "import.meta.env.VITE_LOCAL_TEST_MODE": '"false"' },
    plugins: [{ name: "billing-test-controls", enforce: "pre", load(id) { if (id.replaceAll("\\", "/").endsWith("/src/components/ui/button.tsx")) return "import{createElement as h,forwardRef}from'react';export const Button=forwardRef(({children,...props},ref)=>h('button',{...props,ref},children));"; } }],
  });
  let renderer: ReactTestRenderer | undefined, owner: string | null = "account-a";
  let expired = false;
  const requests: { method: string; owner: string; body?: { action: "checkout" | "portal"; requestKey: string }; signal?: AbortSignal | null }[] = [];
  let reply: (request: typeof requests[number]) => Response | Promise<Response> = () => Response.json(billing());
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input), origin); assert.equal(url.origin, origin); assert.equal(init.credentials, "same-origin");
    if (url.pathname === "/api/auth/get-session") return Response.json(owner ? {
      user: { id: owner, email: "qa@example.test", emailVerified: true, name: "QA", createdAt: "2026-09-01T10:00:00Z", updatedAt: "2026-09-01T10:00:00Z" },
      session: { id: "session-a", userId: owner, createdAt: "2026-09-01T10:00:00Z", updatedAt: "2026-09-01T10:00:00Z", expiresAt: new Date(Date.now() + (expired ? -60_000 : 60_000)).toISOString() },
    } : null);
    assert.equal(url.pathname, "/api/account/billing"); assert.equal(init.redirect, "error"); assert.equal(init.cache, "no-store");
    const request = { method: init.method ?? "GET", owner: new Headers(init.headers).get("x-sajda-account")!, body: init.body ? JSON.parse(String(init.body)) : undefined, signal: init.signal };
    requests.push(request); return reply(request);
  };
  try {
    const client = await vite.ssrLoadModule("/src/lib/plusBilling.ts");
    const { default: PlusBilling } = await vite.ssrLoadModule("/src/components/PlusBilling.tsx");
    const { getLostDomainsCopy } = await vite.ssrLoadModule("/src/i18n/lostDomainsCopy.ts");
    const tree = (route = "/plus") => h(MemoryRouter, { initialEntries: [route] }, h(PlusBilling, { accountId: owner, language: "en", fallback: getLostDomainsCopy("en"), onStatusVerified }));
    const text = () => label(renderer!.root);
    const buttons = (name: string) => renderer!.root.findAllByType("button").filter(node => label(node) === name);
    const button = (name: string) => { const value = buttons(name)[0]; assert.ok(value, `Expected ${name}`); return value; };
    const until = async (predicate: () => boolean) => { for (let i = 0; i < 150 && !predicate(); i++) await act(pause); assert.ok(predicate(), "Mounted billing settles"); };
    const mount = async (response = billing(), account: string | null = "account-a", route = "/plus") => {
      if (renderer) await act(async () => { renderer!.unmount(); });
      requests.length = 0; navigations.length = 0; verifiedOwners.length = 0; owner = account; expired = false; reply = () => Response.json(response);
      await act(async () => { renderer = create(tree(route), { unstable_isConcurrent: true }); await pause(); });
      if (account) await until(() => !text().includes("Checking billing status"));
    };
    const click = async (name: string) => { await act(async () => { button(name).props.onClick(); await pause(); }); };
    const posts = () => requests.filter(row => row.method === "POST");

    await t.test("snapshot rejects invented readiness, currency, plan periods and wrong account", () => {
      assert.equal(client.parsePlusBilling(billing(), "account-a").price.unitAmount, 188000);
      for (const change of [{ price: null }, { price: { ...billing().price, currency: "sek" } }, { price: { ...billing().price, interval: "year" } }, { price: { ...billing().price, unitAmount: -1 } }, ...[187999, 188001, 200000, 230000].map(unitAmount => ({ price: { ...billing().price, unitAmount } })), { ready: false }, { status: "active" }, { status: "made-up" }]) {
        assert.throws(() => client.parsePlusBilling({ ...billing(), ...change }, "account-a"), (error: { code: string }) => error.code === "invalid_response");
      }
      assert.throws(() => client.parsePlusBilling(billing("account-b"), "account-a"), (error: { code: string }) => error.code === "account_changed");
      assert.equal(client.parsePlusBilling({ ...billing(), ready: false, price: null, canCheckout: false, canManage: true }, "account-a").canManage, true);
    });

    await t.test("redirects are restricted to exact HTTPS Stripe hosts for the matching action", () => {
      const reply = (url: string) => ({ accountId: "account-a", requestId, url });
      assert.equal(client.parseBillingRedirect(reply("https://checkout.stripe.com/c/pay/cs_test_fixture"), "account-a", "checkout"), "https://checkout.stripe.com/c/pay/cs_test_fixture");
      for (const url of ["javascript:alert(1)", "https://checkout.stripe.com.attacker.test/", "https://attacker.test/", "http://checkout.stripe.com/", "https://user:pass@checkout.stripe.com/", "https://checkout.stripe.com:8443/", "https://billing.stripe.com/p/session/test"]) {
        assert.throws(() => client.parseBillingRedirect(reply(url), "account-a", "checkout"));
      }
    });

    await t.test("guest pricing starts neither a private request nor a checkout", async () => {
      await mount(billing(), null); assert.equal(requests.length, 0); assert.equal(navigations.length, 0);
      assert.equal(verifiedOwners.length, 0);
      assert.match(text(), /USD 1,880 \/ month/); assert.match(text(), /Monthly price/);
      assert.equal(buttons("Try test checkout").length, 0);
    });

    await t.test("verified server price must match the approved plan and test mode is explicit", async () => {
      await mount(); assert.match(text(), /USD 1,880 \/ month/);
      assert.match(text(), /Test mode — no real payment|Tax is additional/);
      assert.doesNotMatch(text(), /Preliminary|Indicative/); assert.equal(posts().length, 0);
      assert.equal(button("Try test checkout").props.disabled, false);
      assert.deepEqual(verifiedOwners, ["account-a"], "Only a verified server GET notifies the workspace once");
    });

    await t.test("a conflicting provider price cannot replace the fixed price or enable checkout", async () => {
      await mount({ ...billing(), price: { ...billing().price!, unitAmount: 230000 } });
      assert.match(text(), /USD 1,880 \/ month/);
      assert.doesNotMatch(text(), /2,300|Preliminary|Indicative/);
      assert.match(text(), /billing response could not be verified/);
      assert.equal(buttons("Try test checkout").length, 0);
      assert.equal(posts().length, 0); assert.equal(verifiedOwners.length, 0);
    });

    await t.test("the previous USD 2,000 price is rejected without displaying it or enabling checkout", async () => {
      await mount({ ...billing(), price: { ...billing().price!, unitAmount: 200000 } });
      assert.match(text(), /USD 1,880 \/ month/);
      assert.doesNotMatch(text(), /2,000/);
      assert.match(text(), /billing response could not be verified/);
      assert.equal(buttons("Try test checkout").length, 0);
      assert.equal(buttons("Subscribe to Trading").length, 0);
      assert.equal(posts().length, 0); assert.equal(verifiedOwners.length, 0);
    });

    await t.test("disconnected checkout does not change the fixed price or pretend purchasing is available", async () => {
      await mount({ ...billing(), ready: false, mode: null, price: null, canCheckout: false, canManage: false });
      assert.match(text(), /USD 1,880 \/ month/);
      assert.match(text(), /New subscriptions are not available right now/);
      assert.doesNotMatch(text(), /Preliminary|Indicative|Test mode/);
      assert.equal(buttons("Try test checkout").length, 0);
      assert.equal(buttons("Subscribe to Trading").length, 0);
      assert.equal(posts().length, 0);
    });

    await t.test("existing customers can reach portal even when new purchases or price lookup are unavailable", async () => {
      await mount({ ...billing(), ready: false, canCheckout: false, canManage: true, price: null, status: "active" });
      assert.equal(buttons("Try test checkout").length, 0); assert.ok(button("Manage subscription"));
      assert.match(text(), /Test mode — no real payment/, "Test mode is visible even without price or checkout readiness");
      reply = () => Response.json({ accountId: owner, requestId, url: "https://billing.stripe.com/p/session/fixture" });
      await click("Manage subscription"); await until(() => navigations.length === 1);
      assert.equal(posts()[0].body?.action, "portal");
    });

    await t.test("duplicate clicks and uncertain retries reuse one checkout request key without client price fields", async () => {
      await mount(); const pending = deferred<Response>(); reply = () => pending.promise;
      const start = button("Try test checkout"); await act(async () => { start.props.onClick(); start.props.onClick(); await pause(); });
      await until(() => posts().length === 1); const first = posts()[0];
      assert.deepEqual(Object.keys(first.body!).sort(), ["action", "requestKey"]); assert.match(first.body!.requestKey, /^[a-f0-9-]{36}$/u);
      await act(async () => { pending.resolve(Response.json({ code: "billing_unavailable", requestId }, { status: 503 })); await pause(); });
      await until(() => text().includes("could not confirm the billing response"));
      reply = () => Response.json({ accountId: owner, requestId, url: "https://checkout.stripe.com/c/pay/cs_test_fixture" });
      await click("Try test checkout"); await until(() => navigations.length === 1);
      assert.equal(posts()[1].body!.requestKey, first.body!.requestKey); assert.equal(posts()[1].owner, "account-a");
    });

    await t.test("invalid checkout URL is never opened and provider details are not displayed", async () => {
      await mount(); reply = () => Response.json({ accountId: owner, requestId, url: "https://attacker.test/private-token" });
      await click("Try test checkout"); await until(() => text().includes("response could not be verified"));
      assert.equal(navigations.length, 0); assert.doesNotMatch(text(), /attacker|private-token/);
    });

    await t.test("definitively expired checkout requires a refresh and a fresh request key", async () => {
      await mount(); reply = () => Response.json({ code: "checkout_expired", requestId }, { status: 409 });
      await click("Try test checkout"); await until(() => text().includes("checkout link has expired"));
      const oldKey = posts()[0].body!.requestKey;
      assert.equal(buttons("Try test checkout").length, 0);
      reply = row => row.method === "GET" ? Response.json(billing()) : Response.json({ accountId: owner, requestId, url: "https://checkout.stripe.com/c/pay/cs_test_fresh" });
      await click("Check billing status"); await until(() => buttons("Try test checkout").length === 1);
      await click("Try test checkout"); await until(() => navigations.length === 1);
      assert.notEqual(posts()[1].body!.requestKey, oldKey);
    });

    await t.test("account change aborts pending checkout and ignores its late redirect", async () => {
      await mount(); const pending = deferred<Response>(); reply = row => row.method === "POST" ? pending.promise : Response.json(billing(row.owner));
      await click("Try test checkout"); await until(() => posts().length === 1); const signal = posts()[0].signal;
      owner = "account-b"; await act(async () => { renderer!.update(tree()); await pause(); });
      await until(() => requests.some(row => row.owner === "account-b"));
      assert.equal(signal?.aborted, true);
      await act(async () => { pending.resolve(Response.json({ accountId: "account-a", requestId, url: "https://checkout.stripe.com/c/pay/cs_test_old" })); await pause(); });
      assert.equal(navigations.length, 0);
      assert.deepEqual(verifiedOwners, ["account-a", "account-b"], "Late checkout does not emit a verified state callback");
    });

    await t.test("expired session discovered after checkout response discards redirect and billing state", async () => {
      await mount(); reply = () => { expired = true; return Response.json({ accountId: owner, requestId, url: "https://checkout.stripe.com/c/pay/cs_test_fixture" }); };
      await click("Try test checkout"); await until(() => text().includes("Sign in again"));
      assert.equal(navigations.length, 0); assert.equal(buttons("Try test checkout").length, 0);
    });

    await t.test("success return is only an informational state, never an automatic mutation or entitlement", async () => {
      await mount(billing(), "account-a", "/plus?billing=success");
      assert.match(text(), /returning here alone does not confirm payment or activate access/);
      assert.equal(posts().length, 0); assert.equal(navigations.length, 0);
    });
  } finally {
    if (renderer) await act(async () => { renderer!.unmount(); });
    await vite.close(); globalThis.fetch = originalFetch;
    for (const [key, descriptor] of originals) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
  }
});
