import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createElement as h } from "react";
import { MemoryRouter } from "react-router-dom";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { createServer } from "vite";
import { PLAN_ORDER, PLANS, formatPlanMonthlyPrice } from "../shared/plans";
import { PLUS_PLAN } from "../shared/plus-plan";
import { getPricingCopy } from "../src/i18n/pricingCopy";

function label(node: ReactTestInstance): string {
  return node.children.map(child => typeof child === "string" ? child : label(child)).join("");
}

test("pricing describes four distinct levels without advertising unfinished monitoring as live", () => {
  assert.deepEqual(PLAN_ORDER, ["free", "basic", "premium", "trading"]);
  assert.equal(PLANS.trading.unitAmount, PLUS_PLAN.unitAmount);
  for (const language of ["sv", "en"]) {
    const copy = getPricingCopy(language);
    assert.equal(Object.keys(copy.plans).length, 4);
    assert.ok(copy.plans.trading.points.some(point => point.includes("Lost Domains")));
    assert.match(copy.notice, /aktiverar inte|does not activate/);
    assert.match(copy.monitoring, /inte aktiva idag|not active today/);
    assert.match(copy.current, /utan abonnemang|without a subscription/);
    assert.match(copy.risk, /inte en garanti|not a guarantee/);
    assert.match(copy.terms, /eventuell skatt och slutbelopp|applicable tax and the final total/);
    assert.doesNotMatch(JSON.stringify(copy), /unlimited|obegränsad|most popular|populärast/i);
  }
  for (const language of ["es", "fr", "zh"]) {
    const copy = getPricingCopy(language);
    assert.notEqual(copy.title, getPricingCopy("en").title);
    assert.deepEqual(Object.keys(copy).sort(), Object.keys(getPricingCopy("en")).sort());
    assert.equal(Object.keys(copy.plans).length, 4);
    assert.equal(copy.plans.trading.name, "Trading");
    assert.equal(copy.plans.premium.name, "Premium");
  }
  assert.deepEqual(getPricingCopy("unsupported"), getPricingCopy("en"));
});

test("pricing keeps ordinary naming separate from Trading and states that saving is free", () => {
  assert.match(getPricingCopy("en").lead, /not a requirement for finding good names/);
  assert.match(getPricingCopy("sv").lead, /inte ett krav för att hitta bra namn/);
  for (const language of ["en", "sv", "es", "fr", "zh"]) {
    assert.equal(getPricingCopy(language).plans.free.points.length, 4);
  }
  assert.match(getPricingCopy("en").plans.free.points.join(" "), /Save domains with a verified account/);
  assert.match(getPricingCopy("sv").plans.free.points.join(" "), /Spara domäner med verifierat konto/);
  assert.match(getPricingCopy("en").plannedContents, /not all features are live/);
  assert.match(getPricingCopy("en").plans.premium.audience, /founders and small agencies/);
  assert.doesNotMatch(getPricingCopy("en").plans.basic.points.join(" "), /Save and compare|smaller project|Limited swiping/);
});

test("mounted pricing presents the shared prices and only truthful navigation, without checkout effects", async t => {
  const originalFetch = globalThis.fetch;
  const fixtureKey = "__SAJDA_PRICING_TEST_LANGUAGE__";
  const originalFixture = Object.getOwnPropertyDescriptor(globalThis, fixtureKey);
  const setLanguage = (language: string) => Object.defineProperty(globalThis, fixtureKey, { configurable: true, value: language });
  setLanguage("sv");
  globalThis.fetch = async () => { throw new Error("Pricing must not create accounts, start payments or request private data"); };
  const vite = await createServer({ configFile: false, appType: "custom",
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" },
    plugins: [{ name: "pricing-test-language-boundary", enforce: "pre", load(id) {
      const normalized = id.replaceAll("\\", "/");
      if (normalized.endsWith("/src/i18n/LanguageProvider.tsx")) return `export const useLanguage=()=>({language:globalThis.${fixtureKey}}); export const applyDocumentMetadata=()=>{};`;
      if (normalized.endsWith("/src/contexts/AuthContext.tsx")) return "export const useAuth=()=>({user:null,loading:false});";
      if (normalized.endsWith("/src/contexts/MembershipContext.tsx")) return "export const useMembership=()=>({membership:null,loading:false,error:null,refresh:async()=>{}});";
      if (normalized.endsWith("/src/components/LanguageSwitcher.tsx")) return "export default function LanguageSwitcher(){return null;}";
    } }],
  });
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { pathname: "/pricing" } } });
  let renderer: ReactTestRenderer | undefined;
  try {
    const { default: Pricing } = await vite.ssrLoadModule("/src/pages/Pricing.tsx");
    for (const language of ["en", "sv", "es", "fr", "zh"]) {
      await t.test(`${language}: four prices, authenticated purchase entry and no overflow-prone controls`, async () => {
        setLanguage(language);
        if (renderer) await act(async () => renderer!.unmount());
        await act(async () => { renderer = create(h(MemoryRouter, { initialEntries: ["/pricing"], future: { v7_startTransition: true, v7_relativeSplatPath: true } }, h(Pricing))); });
        const cards = renderer!.root.findAllByType("article");
        assert.equal(cards.length, 4);
        assert.equal(renderer!.root.findAllByType("h1").length, 1);
        const founderSection = renderer!.root.findByProps({ "data-plan-group": "founder" });
        const specialistSection = renderer!.root.findByProps({ "data-plan-group": "specialist" });
        assert.deepEqual(founderSection.findAllByType("article").map(card => card.props["data-plan"]), ["free", "basic", "premium"]);
        assert.deepEqual(specialistSection.findAllByType("article").map(card => card.props["data-plan"]), ["trading"]);
        const freeStart = renderer!.root.findByProps({ "aria-labelledby": "pricing-current-title" }).findByType("a");
        assert.equal(freeStart.props.href, "/", "Visitors can reach value before weighing unavailable subscriptions");
        assert.equal(label(freeStart), getPricingCopy(language).trySearch);
        for (const id of PLAN_ORDER) {
          const card = cards.find(card => card.props["data-plan"] === id)!;
          const price = card.findByProps({ "data-plan-price": id });
          assert.equal(label(price), formatPlanMonthlyPrice(id, language));
          const scope = card.findByProps({ "data-plan-scope": id === "free" ? "available" : "planned" });
          assert.equal(label(scope), id === "free" ? getPricingCopy(language).contents : getPricingCopy(language).plannedContents);
          if (id === "basic" || id === "premium") {
            const link = card.findByType("a");
            assert.equal(link.props.href, "/auth?next=%2Fpricing");
            assert.equal(label(link), getPricingCopy(language).signIn);
            assert.match(link.props.className, /min-h-11/);
            assert.match(link.props.className, /whitespace-normal/);
          } else {
            const link = card.findByType("a");
            assert.equal(link.props.href, id === "free" ? "/" : "/auth?next=%2Fpricing");
            assert.equal(label(link), id === "free" ? getPricingCopy(language).trySearch : getPricingCopy(language).signIn);
          }
        }
        assert.equal(renderer!.root.findAllByType("form").length, 0);
        assert.equal(renderer!.root.findAllByType("table").length, 0);
        for (const href of ["/legal#terms", "/legal#privacy", "/contact"]) {
          const link = renderer!.root.findAllByType("a").find(node => node.props.href === href);
          assert.ok(link, `Pricing must provide an actionable ${href} link`);
          assert.match(link.props.className, /min-h-11.*focus-visible:ring-2/);
        }
        for (const node of renderer!.root.findAll(node => typeof node.props.className === "string")) {
          assert.doesNotMatch(node.props.className, /(?:^|[\s:])(?:fixed|sticky|absolute)(?:\s|$)|truncate/u);
        }
      });
    }
  } finally {
    if (renderer) await act(async () => renderer!.unmount());
    globalThis.fetch = originalFetch;
    if (originalFixture) Object.defineProperty(globalThis, fixtureKey, originalFixture); else Reflect.deleteProperty(globalThis, fixtureKey);
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow); else Reflect.deleteProperty(globalThis, "window");
    await vite.close();
  }
});

test("pricing preserves a cross-plan checkout conflict and never redirects or automatically retries it", async () => {
  const fixtureKey = "__SAJDA_PRICING_CONFLICT_CALLS__";
  const originalFixture = Object.getOwnPropertyDescriptor(globalThis, fixtureKey);
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const calls: string[] = [], navigations: string[] = [];
  Object.defineProperty(globalThis, fixtureKey, { configurable: true, value: calls });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { pathname: "/pricing", assign: (url: string) => navigations.push(url) } } });
  const vite = await createServer({ configFile: false, appType: "custom",
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" },
    plugins: [{ name: "pricing-conflict-boundary", enforce: "pre", load(id) {
      const normalized = id.replaceAll("\\", "/");
      if (normalized.endsWith("/src/i18n/LanguageProvider.tsx")) return 'export const useLanguage=()=>({language:"en"});export const applyDocumentMetadata=()=>{};';
      if (normalized.endsWith("/src/contexts/AuthContext.tsx")) return 'const user={id:"qa-account"};export const useAuth=()=>({user,loading:false});';
      if (normalized.endsWith("/src/contexts/MembershipContext.tsx")) return 'export const useMembership=()=>({membership:{plan:"free",accessSource:"free",expiresAt:null},loading:false,error:null});';
      if (normalized.endsWith("/src/components/LanguageSwitcher.tsx")) return "export default function LanguageSwitcher(){return null;}";
      if (normalized.endsWith("/src/lib/plusBilling.ts")) return `
        export class PlusBillingError extends Error {constructor(code,requestId){super(code);this.code=code;this.requestId=requestId;}}
        export async function getPlusBilling(){return {canManage:false,plans:{basic:{ready:true,canCheckout:true},premium:{ready:true,canCheckout:true},trading:{ready:true,canCheckout:true}}};}
        export async function openPlusBilling(scope,action,key,plan){globalThis.${fixtureKey}.push(plan);throw new PlusBillingError("checkout_plan_conflict","req_0123456789abcdef");}
      `;
    } }],
  });
  let renderer: ReactTestRenderer | undefined;
  const pause = () => new Promise(resolve => setTimeout(resolve, 5));
  try {
    const { default: Pricing } = await vite.ssrLoadModule("/src/pages/Pricing.tsx");
    await act(async () => { renderer = create(h(MemoryRouter, { initialEntries: ["/pricing"] }, h(Pricing))); await pause(); });
    const button = () => renderer!.root.findAllByType("button").find(node => label(node).startsWith("Choose Basic"));
    for (let i = 0; i < 100 && !button(); i++) await act(pause);
    assert.ok(button());
    await act(async () => { button()!.props.onClick(); await pause(); });
    const alert = renderer!.root.findByProps({ role: "alert" });
    assert.match(label(alert), /An unfinished checkout belongs to a different plan/);
    assert.match(label(alert), /No payment page was opened for this request/);
    assert.match(label(alert), /wait for its checkout link to expire/);
    assert.equal(alert.findByType("a").props.href, "/contact");
    assert.deepEqual(calls, ["basic"]); assert.equal(navigations.length, 0);
    await act(pause); assert.deepEqual(calls, ["basic"], "The conflict has no automatic checkout retry");
  } finally {
    if (renderer) await act(async () => renderer!.unmount());
    await vite.close();
    if (originalFixture) Object.defineProperty(globalThis, fixtureKey, originalFixture); else Reflect.deleteProperty(globalThis, fixtureKey);
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow); else Reflect.deleteProperty(globalThis, "window");
  }
});

test("returning canceled customers can choose a new plan while active customers see cancellation, not an invented upgrade", async () => {
  const fixtureKey = "__SAJDA_PRICING_RETURNING_STATE__";
  const originalFixture = Object.getOwnPropertyDescriptor(globalThis, fixtureKey), originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const calls: string[] = [];
  Object.defineProperty(globalThis, fixtureKey, { configurable: true, value: { eligible: true, calls } });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { pathname: "/pricing", assign: () => undefined } } });
  const vite = await createServer({ configFile: false, appType: "custom", server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" },
    plugins: [{ name: "pricing-returning-boundary", enforce: "pre", load(id) {
      const normalized = id.replaceAll("\\", "/");
      if (normalized.endsWith("/src/i18n/LanguageProvider.tsx")) return 'export const useLanguage=()=>({language:"en"});export const applyDocumentMetadata=()=>{};';
      if (normalized.endsWith("/src/contexts/AuthContext.tsx")) return 'const user={id:"qa-returning"};export const useAuth=()=>({user,loading:false});';
      if (normalized.endsWith("/src/contexts/MembershipContext.tsx")) return 'export const useMembership=()=>({membership:{plan:"free",accessSource:"free",expiresAt:null},loading:false,error:null});';
      if (normalized.endsWith("/src/components/LanguageSwitcher.tsx")) return "export default function LanguageSwitcher(){return null;}";
      if (normalized.endsWith("/src/lib/plusBilling.ts")) return `
        export class PlusBillingError extends Error {constructor(code){super(code);this.code=code;}}
        export async function getPlusBilling(){const eligible=globalThis.${fixtureKey}.eligible;return {canManage:true,status:eligible?"canceled":"active",plans:Object.fromEntries(["basic","premium","trading"].map(plan=>[plan,{ready:true,canCheckout:eligible}]))};}
        export async function openPlusBilling(scope,action,key,plan){globalThis.${fixtureKey}.calls.push(action+":"+plan);return action==="portal"?"https://billing.stripe.com/p/session/fixture":"https://checkout.stripe.com/c/pay/fixture";}
      `;
    } }],
  });
  let renderer: ReactTestRenderer | undefined;
  const pause = () => new Promise(resolve => setTimeout(resolve, 5));
  try {
    const { default: Pricing } = await vite.ssrLoadModule("/src/pages/Pricing.tsx");
    for (const eligible of [true, false]) {
      Object.defineProperty(globalThis, fixtureKey, { configurable: true, value: { eligible, calls } });
      if (renderer) await act(async () => renderer!.unmount());
      await act(async () => { renderer = create(h(MemoryRouter, { initialEntries: ["/pricing"] }, h(Pricing))); await pause(); });
      for (let i = 0; i < 100 && !renderer!.root.findAllByProps({ "data-plan-change-policy": true }).length; i++) await act(pause);
      assert.match(label(renderer!.root.findByProps({ "data-plan-change-policy": true })), /Self-service plan changes are not available yet/);
      const basic = renderer!.root.findByProps({ "data-plan": "basic" }).findByType("button");
      assert.equal(label(basic), eligible ? "Choose Basic" : "Manage subscription");
      calls.length = 0;
      await act(async () => { basic.props.onClick(); await pause(); });
      assert.deepEqual(calls, [eligible ? "checkout:basic" : "portal:trading"]);
    }
  } finally {
    if (renderer) await act(async () => renderer!.unmount());
    await vite.close();
    if (originalFixture) Object.defineProperty(globalThis, fixtureKey, originalFixture); else Reflect.deleteProperty(globalThis, fixtureKey);
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow); else Reflect.deleteProperty(globalThis, "window");
  }
});
