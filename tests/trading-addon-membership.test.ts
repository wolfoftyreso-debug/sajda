import assert from "node:assert/strict";
import test from "node:test";
import { isAccountMembership, membershipProductModel, type AccountMembership } from "../shared/account-membership";
import { productOperationCatalogue } from "../api/_shared/mcp-tools";

function legacy(plan: AccountMembership["plan"], source: "operator" | "subscription" = "subscription"): AccountMembership {
  return { plan, accessSource: plan === "free" ? "free" : source,
    expiresAt: plan === "free" ? null : "2026-12-01T00:00:00.000Z",
    capabilities: { save_domains: true, swipe_undo: plan === "premium" || plan === "trading", trading: plan === "trading" } };
}

test("old membership responses remain valid and normalize Trading bundles without mutation or a copied grant", () => {
  for (const plan of ["free", "basic", "premium", "trading"] as const) {
    const membership = legacy(plan), original = structuredClone(membership);
    assert.equal(isAccountMembership(membership), true);
    assert.deepEqual(membershipProductModel(membership), {
      basePlan: plan === "trading" ? "premium" : plan, addons: { trading: plan === "trading" },
    });
    assert.deepEqual(membership, original, "Presentation normalization does not change source, expiry or capabilities");
  }
  const operatorTrading = legacy("trading", "operator");
  assert.equal(isAccountMembership(operatorTrading), true);
  assert.deepEqual(membershipProductModel(operatorTrading), { basePlan: "premium", addons: { trading: true } });
  assert.equal(operatorTrading.accessSource, "operator", "Operator evidence is not advertised as a paid subscription");
});

test("canonical dimensions preserve legacy plan capabilities and exact subscription or operator expiry", () => {
  for (const plan of ["free", "basic", "premium", "trading"] as const) {
    const membership = legacy(plan);
    const canonical = { ...membership, basePlan: plan === "trading" ? "premium" : plan, addons: { trading: plan === "trading" } };
    assert.equal(isAccountMembership(canonical), true);
    assert.deepEqual(membershipProductModel(canonical), { basePlan: canonical.basePlan, addons: canonical.addons });
    assert.equal(canonical.expiresAt, membership.expiresAt);
    assert.deepEqual(canonical.capabilities, membership.capabilities);
  }
});

test("add-on identity is a coherent pair, never coercible metadata or a second base plan", () => {
  const pro = legacy("premium"), trading = legacy("trading");
  const canonical = { ...pro, basePlan: "premium", addons: { trading: false } };
  for (const invalid of [
    { ...pro, basePlan: "premium" }, { ...pro, addons: { trading: false } },
    { ...canonical, basePlan: null }, { ...canonical, basePlan: "trading" },
    { ...canonical, basePlan: ["premium"] }, { ...canonical, addons: null },
    { ...canonical, addons: [] }, { ...canonical, addons: "trading" },
    { ...canonical, addons: {} }, { ...canonical, addons: { trading: "false" } },
    { ...canonical, addons: { trading: 0 } }, { ...canonical, addons: { trading: false, future: true } },
    { ...canonical, addons: { trading: true } },
    { ...legacy("free"), basePlan: "premium", addons: { trading: true } },
    { ...legacy("basic"), basePlan: "basic", addons: { trading: true } },
    { ...trading, basePlan: "free", addons: { trading: true } },
    { ...trading, basePlan: "basic", addons: { trading: true } },
    { ...trading, basePlan: "premium", addons: { trading: false } },
    { ...canonical, capabilities: { ...canonical.capabilities, trading: true } },
  ]) assert.equal(isAccountMembership(invalid), false, JSON.stringify(invalid));
});

test("unknown, incomplete and non-finite membership state cannot become a Free or paid grant", () => {
  for (const invalid of [undefined, null, false, [], {}, { basePlan: "free", addons: { trading: false } },
    { ...legacy("trading"), accessSource: "free" }, { ...legacy("trading"), accessSource: "browser" },
    { ...legacy("trading"), expiresAt: null }, { ...legacy("trading"), expiresAt: "infinity" },
    { ...legacy("trading"), expiresAt: "2026-12-01" },
  ]) assert.equal(isAccountMembership(invalid), false);
});

test("Trading add-on discovery preserves narrow account scopes and consequential-action annotations", () => {
  const tools = new Map(productOperationCatalogue().map(operation => [operation.name, operation]));
  const expected = [
    ["account_membership", "account:read", true, true, false],
    ["trading_status", "trading:read", true, true, false],
    ["trading_report", "trading:read", true, true, false],
    ["trading_scenarios_list", "trading:read", true, true, false],
    ["trading_scenarios_save", "trading:write", false, true, false],
    ["trading_start", "trading:run", false, true, true],
    ["trading_advance", "trading:run", false, false, true],
    ["trading_stop", "trading:run", false, true, false],
    ["trading_refresh_quote", "trading:quote", false, true, true],
  ] as const;
  for (const [name, scope, readOnly, idempotent, openWorld] of expected) {
    const tool = tools.get(name); assert.ok(tool);
    assert.equal(tool.scope, scope); assert.equal(tool.readOnly, readOnly);
    assert.equal(tool.idempotent, idempotent); assert.equal(tool.openWorld, openWorld);
    assert.equal(tool.additionalScopes, undefined);
  }
  assert.match(tools.get("account_membership")!.description, /basePlan.*add-ons/u);
  assert.match(tools.get("account_membership")!.description, /legacy plan=trading/u);
  for (const name of ["trading_start", "trading_advance", "trading_refresh_quote", "trading_scenarios_list", "trading_scenarios_save"] as const) {
    assert.match(tools.get(name)!.description, /Pro with (?:the |its )?Trading add-on/u);
  }
  assert.match(tools.get("trading_status")!.description, /Never starts/u);
  assert.match(tools.get("trading_stop")!.description, /Available when new research is paused/u);
  assert.equal(tools.get("trading_stop")!.destructive, true);
});
