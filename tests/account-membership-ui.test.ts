import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createElement as h } from "react";
import { MemoryRouter } from "react-router-dom";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { createServer } from "vite";
import { formatMembershipExpiry, getMembershipCopy } from "../src/i18n/membershipCopy";
import { getPricingCopy } from "../src/i18n/pricingCopy";
import type { AccountMembership } from "../shared/account-membership";

function label(node: ReactTestInstance): string {
  return node.children.map(child => typeof child === "string" ? child : label(child)).join("");
}

test("membership copy distinguishes operator access from payment and formats only valid expiry dates", () => {
  for (const language of ["en", "sv", "es", "fr", "zh"]) {
    const copy = getMembershipCopy(language);
    assert.equal(Object.keys(copy.planNames).length, 4);
    assert.ok(copy.assignedAccess.length > 30);
    assert.notEqual(copy.assignedAccess, copy.subscriptionAccess);
    assert.notEqual(copy.unavailable, copy.planNames.free);
    assert.ok(formatMembershipExpiry("2026-09-16T12:00:00.000Z", language));
    assert.equal(formatMembershipExpiry(null, language), null);
    assert.equal(formatMembershipExpiry("not-a-date", language), null);
  }
});

test("mounted account and pricing share one confirmed membership without starting payment or research", async t => {
  const fixtureKey = "__SAJDA_MEMBERSHIP_UI_TEST__";
  const originals = new Map([fixtureKey, "window"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const originalFetch = globalThis.fetch;
  const user = { id: "synthetic-ui-account", email: `${"long-account-label-".repeat(7)}@example.test`, created_at: "2026-09-09T10:00:00Z" };
  const trading: AccountMembership = {
    plan: "trading", accessSource: "operator", expiresAt: "2026-09-16T12:00:00.000Z",
    capabilities: { save_domains: true, swipe_undo: true, trading: true },
  };
  const fixture: {
    language: string; user: typeof user | null; loading: boolean; membershipLoading: boolean;
    membership: AccountMembership | null; error: { code: string; requestId?: string } | null; refreshCount: number;
    refresh: () => Promise<void>;
  } = { language: "sv", user, loading: false, membershipLoading: false, membership: trading, error: null, refreshCount: 0,
    refresh: async () => { fixture.refreshCount++; } };
  Object.defineProperty(globalThis, fixtureKey, { configurable: true, value: fixture });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { pathname: "/account" } } });
  globalThis.fetch = async () => { throw new Error("Account navigation must not start payments, research or email"); };
  const vite = await createServer({ configFile: false, appType: "custom",
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" },
    plugins: [{ name: "account-membership-test-boundaries", enforce: "pre", load(id) {
      const normalized = id.replaceAll("\\", "/");
      if (normalized.endsWith("/src/contexts/AuthContext.tsx")) return `export const useAuth=()=>({user:globalThis.${fixtureKey}.user,loading:globalThis.${fixtureKey}.loading,signOut:async()=>{}});`;
      if (normalized.endsWith("/src/contexts/MembershipContext.tsx")) return `export const useMembership=()=>({membership:globalThis.${fixtureKey}.membership,loading:globalThis.${fixtureKey}.membershipLoading,error:globalThis.${fixtureKey}.error,refresh:globalThis.${fixtureKey}.refresh});`;
      if (normalized.endsWith("/src/i18n/LanguageProvider.tsx")) return `export const useLanguage=()=>({language:globalThis.${fixtureKey}.language}); export const applyDocumentMetadata=()=>{};`;
      if (normalized.endsWith("/src/components/LanguageSwitcher.tsx") || normalized.endsWith("/src/components/FooterNav.tsx")) return "export default function Stub(){return null;}";
      if (normalized.endsWith("/src/hooks/use-toast.ts")) return "export const useToast=()=>({toast:()=>{}});";
      if (normalized.endsWith("/src/lib/adminService.ts")) return "export const checkIsAdmin=async()=>false;";
    } }],
  });
  let renderer: ReactTestRenderer | undefined;
  try {
    const { default: Account } = await vite.ssrLoadModule("/src/pages/Account.tsx");
    const { default: Panel } = await vite.ssrLoadModule("/src/components/AccountMembershipPanel.tsx");
    const { default: Pricing } = await vite.ssrLoadModule("/src/pages/Pricing.tsx");
    const mount = async (component: typeof Account, route = "/account") => {
      if (renderer) await act(async () => renderer!.unmount());
      await act(async () => { renderer = create(h(MemoryRouter, { initialEntries: [route] }, h(component))); });
    };
    const root = () => renderer!.root;
    const links = () => root().findAllByType("a");

    for (const language of ["en", "sv", "es", "fr", "zh"]) {
      await t.test(`${language}: Trading includes saved domains and undo on one account`, async () => {
        fixture.language = language; fixture.membership = trading; fixture.error = null; fixture.membershipLoading = false;
        await mount(Account);
        const copy = getMembershipCopy(language);
        assert.equal(root().findAllByType("h1").length, 1);
        assert.equal(label(root().findByType("h1")), copy.account);
        assert.equal(label(root().findByProps({ "data-current-plan": "trading" })), "Trading");
        assert.ok(label(root()).includes(copy.assignedAccess));
        assert.ok(label(root()).includes(copy.undo));
        assert.equal(root().findByType("time").props.dateTime, trading.expiresAt);
        for (const href of ["/", "/swipe", "/watchlist", "/plus", "/pricing"]) assert.ok(links().some(link => link.props.href === href), href);
        assert.equal(links().filter(link => link.props.href.startsWith("/auth")).length, 0, "Signed-in account never asks for a second login");
        for (const node of root().findAll(node => node.children.some(child => child === user.email))) assert.match(node.props.className, /break-all/);
        assert.equal(root().findAllByType("form").length, 0);
      });
    }
    await t.test("unknown or failed membership never advertises Free or keeps stale Trading controls", async () => {
      fixture.language = "sv";
      for (const error of [null, { code: "provider_unavailable", requestId: "req_membership_test" }]) {
        fixture.membership = error ? trading : null; fixture.error = error;
        await mount(Panel);
        assert.equal(root().findAll(node => Boolean(node.props["data-current-plan"])).length, 0);
        assert.equal(links().filter(link => ["/plus", "/watchlist"].includes(link.props.href)).length, 0);
        assert.equal(root().findAllByProps({ role: "alert" }).length, 1);
        const retry = root().findAllByType("button").find(button => label(button).includes(getMembershipCopy("sv").retry));
        assert.ok(retry);
        const before = fixture.refreshCount;
        await act(async () => retry.props.onClick());
        assert.equal(fixture.refreshCount, before + 1);
      }
    });
    await t.test("loading and Free states remain distinct from paid access", async () => {
      fixture.error = null; fixture.membership = trading; fixture.membershipLoading = true;
      await mount(Panel);
      assert.ok(label(root().findByProps({ role: "status" })).includes(getMembershipCopy("sv").loading));
      assert.equal(root().findAll(node => Boolean(node.props["data-current-plan"])).length, 0);
      fixture.membershipLoading = false;
      fixture.membership = { plan: "free", accessSource: "free", expiresAt: null,
        capabilities: { save_domains: true, swipe_undo: false, trading: false } };
      await mount(Panel);
      assert.equal(label(root().findByProps({ "data-current-plan": "free" })), "Gratis");
      assert.ok(label(root()).includes(getMembershipCopy("sv").freeAccess));
      assert.equal(links().filter(link => link.props.href === "/plus").length, 0);
      assert.equal(root().findAllByType("time").length, 0);
      assert.ok(!label(root()).includes(getMembershipCopy("sv").undo));
    });
    await t.test("email verification instructions keep the same account without an auth redirect loop", async () => {
      fixture.membership = null; fixture.error = { code: "email_verification_required" };
      await mount(Panel);
      assert.ok(label(root()).includes(getMembershipCopy("sv").verificationTitle));
      assert.ok(label(root()).includes(getMembershipCopy("sv").verificationDetail));
      assert.equal(links().filter(link => link.props.href.startsWith("/auth")).length, 0);
      assert.equal(root().findAll(node => Boolean(node.props["data-current-plan"])).length, 0);
    });
    await t.test("pricing identifies current Trading and three included levels with no second signup", async () => {
      fixture.membership = trading; fixture.error = null;
      await mount(Pricing, "/pricing");
      assert.equal(root().findAllByProps({ "data-plan-access": "current" }).length, 1);
      assert.equal(root().findAllByProps({ "data-plan-access": "included" }).length, 3);
      assert.ok(label(root().findByProps({ "data-account-plan": "trading" })).includes(getPricingCopy("sv").assignedAccess));
      const tradingCard = root().findByProps({ "data-plan": "trading" });
      assert.equal(tradingCard.findByType("a").props.href, "/plus");
      assert.equal(label(tradingCard.findByType("a")), getPricingCopy("sv").openTrading);
      assert.equal(links().filter(link => link.props.href.startsWith("/auth")).length, 0);
      for (const id of ["basic", "premium"]) {
        const button = root().findByProps({ "data-plan": id }).findByType("button");
        assert.equal(button.props.disabled, true);
        assert.equal(label(button), getPricingCopy("sv").included);
      }
      fixture.error = { code: "provider_unavailable" };
      await mount(Pricing, "/pricing");
      assert.equal(root().findAll(node => Boolean(node.props["data-account-plan"])).length, 0);
      assert.equal(root().findAll(node => Boolean(node.props["data-plan-access"])).length, 0);
      assert.ok(label(root()).includes(getPricingCopy("sv").unknownAccess));
    });
  } finally {
    if (renderer) await act(async () => renderer!.unmount());
    globalThis.fetch = originalFetch;
    for (const [key, descriptor] of originals) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
    await vite.close();
  }
});
