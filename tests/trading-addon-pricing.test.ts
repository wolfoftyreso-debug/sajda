import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createElement as h } from "react";
import { MemoryRouter } from "react-router-dom";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { createServer } from "vite";
import { tradingPurchaseCopy } from "../src/i18n/tradingPurchaseCopy";

const label = (node: ReactTestInstance): string => node.children.map(child => typeof child === "string" ? child : label(child)).join("");

test("mounted Trading add-on uses one Pro account, explicit confirmation and server-verified renewal state", async t => {
  const key = "__SAJDA_ADDON_PRICING_QA__";
  const original = Object.getOwnPropertyDescriptor(globalThis, key), originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const ownerA = { id: "addon-owner-a" }, ownerB = { id: "addon-owner-b" };
  const state = { user: ownerA, trading: false, missingAddon: false, pending: null as null | { enabled: boolean; effectiveAt: string; canCancel: boolean; state?: "processing" | "scheduled"; canRetry?: boolean },
    calls: [] as { action: string; owner: string; enabled?: boolean; key: string }[], fail: false, hold: null as null | Promise<void> };
  Object.defineProperty(globalThis, key, { configurable: true, value: state });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { pathname: "/pricing", assign: () => { throw new Error("An add-on change is not a checkout redirect"); } } } });
  const vite = await createServer({ configFile: false, appType: "custom", server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" },
    plugins: [{ name: "synthetic-addon-ui-boundaries", enforce: "pre", load(id) {
      const file = id.replaceAll("\\", "/");
      if (file.endsWith("/src/i18n/LanguageProvider.tsx")) return 'export const useLanguage=()=>({language:"en"});export const applyDocumentMetadata=()=>{};';
      if (file.endsWith("/src/contexts/AuthContext.tsx")) return `export const useAuth=()=>({user:globalThis.${key}.user,loading:false});`;
      if (file.endsWith("/src/contexts/MembershipContext.tsx")) return `export const useMembership=()=>{const trading=globalThis.${key}.trading;return {loading:false,error:null,membership:{plan:trading?"trading":"premium",basePlan:"premium",addons:{trading},accessSource:"subscription",expiresAt:"2030-01-01T00:00:00.000Z",capabilities:{save_domains:true,swipe_undo:true,trading}}};};`;
      if (file.endsWith("/src/components/LanguageSwitcher.tsx")) return "export default function LanguageSwitcher(){return null;}";
      // This is a mounted state/intent test, not a browser focus/portal test.
      if (file.endsWith("/src/components/ui/dialog.tsx")) return 'export const Dialog=({open,children})=>open?children:null;export const DialogContent=({children})=>children;export const DialogTitle=({children})=>children;export const DialogDescription=({children})=>children;';
      if (file.endsWith("/src/lib/plusBilling.ts")) return `
        export class PlusBillingError extends Error {constructor(code){super(code);this.code=code;}}
        export async function getPlusBilling(scope){const s=globalThis.${key};return {accountId:scope.accountId,mode:"test",canManage:true,activePlan:s.trading?"trading":"premium",status:"active",plans:Object.fromEntries(["basic","premium","trading"].map(p=>[p,{ready:true,canCheckout:false}])),...(s.missingAddon?{}:{tradingAddon:{canAdd:!s.trading&&!s.pending,canRemove:s.trading&&!s.pending,pending:s.pending}})};}
        export async function openPlusBilling(){throw new Error("Never start a second subscription");}
        export async function changeTradingAddon(scope,requestKey,enabled){const s=globalThis.${key};s.calls.push({action:"change",owner:scope.accountId,key:requestKey,enabled});if(s.hold)await s.hold;if(s.fail)throw new PlusBillingError("unavailable");s.pending={enabled,effectiveAt:"2030-01-01T00:00:00.000Z",canCancel:true};return {state:"scheduled",enabled,effectiveAt:s.pending.effectiveAt};}
        export async function cancelTradingAddonChange(scope,requestKey){const s=globalThis.${key};s.calls.push({action:"cancel",owner:scope.accountId,key:requestKey});s.pending=null;return {state:"canceled"};}
      `;
    } }],
  });
  let renderer: ReactTestRenderer | undefined;
  const pause = () => new Promise(resolve => setTimeout(resolve, 5));
  try {
    const { default: Pricing } = await vite.ssrLoadModule("/src/pages/Pricing.tsx");
    const tree = () => h(MemoryRouter, { initialEntries: ["/pricing#trading-addon"] }, h(Pricing));
    const button = (text: string) => renderer!.root.findAllByType("button").filter(node => label(node) === text).at(-1);
    const until = async (condition: () => boolean) => { for (let i = 0; i < 100 && !condition(); i++) await act(pause); assert.ok(condition()); };
    const mount = async () => { if (renderer) await act(async () => renderer!.unmount()); await act(async () => { renderer = create(tree()); await pause(); }); };
    const click = async (text: string) => { const node = button(text); assert.ok(node, text); await act(async () => { node.props.onClick({ currentTarget: null }); await pause(); }); };

    await t.test("Pro is current; Trading is a separate optional add-on, never a fourth base card", async () => {
      await mount(); await until(() => Boolean(button(tradingPurchaseCopy.en.add)));
      assert.equal(renderer!.root.findAllByProps({ "data-plan": "trading" }).length, 0);
      assert.equal(renderer!.root.findByProps({ "data-plan": "premium" }).findByType("h3").children[0], "Pro");
      assert.equal(label(renderer!.root.findByProps({ "data-addon-price": "trading" })), "+ USD 30 / month");
      assert.match(label(renderer!.root.findByProps({ "data-addon-total": true })), /USD 49/);
      assert.equal(renderer!.root.findAllByType("a").some(node => node.props.href.startsWith("/auth")), false);
      await click(tradingPurchaseCopy.en.add); assert.equal(state.calls.length, 0, "Opening confirmation cannot mutate billing");
      assert.ok(button(tradingPurchaseCopy.en.confirm));
      await click(tradingPurchaseCopy.en.back); assert.equal(state.calls.length, 0);
    });
    await t.test("one confirmed request schedules the add-on, with no premature Trading grant", async () => {
      await click(tradingPurchaseCopy.en.add); await click(tradingPurchaseCopy.en.confirm);
      await until(() => renderer!.root.findAllByProps({ "data-addon-pending": true }).length === 1);
      assert.equal(state.calls.length, 1); assert.equal(state.calls[0].owner, ownerA.id); assert.equal(state.calls[0].enabled, true);
      assert.match(state.calls[0].key, /^[a-f0-9-]{36}$/u);
      assert.equal(renderer!.root.findByProps({ "data-addon-access": "inactive" }).children[0], "Trading is not active");
      assert.equal(renderer!.root.findAllByType("a").some(node => node.props.href === "/plus"), false);
      assert.match(label(renderer!.root.findByProps({ "data-addon-pending": true })), /2030|Jan/);
    });
    await t.test("canceling the scheduled change is explicit and does not cancel Pro", async () => {
      await click(tradingPurchaseCopy.en.cancelChange); assert.equal(state.calls.length, 1);
      await click(tradingPurchaseCopy.en.cancelChange);
      await until(() => Boolean(button(tradingPurchaseCopy.en.add)));
      assert.equal(state.calls.length, 2); assert.equal(state.calls[1].action, "cancel"); assert.equal(state.trading, false);
      assert.equal(renderer!.root.findByProps({ "data-account-plan": "premium" }).children.some(child => typeof child === "string" && child.includes("Pro")), true);
    });
    await t.test("removal preserves current Trading and base Pro until renewal", async () => {
      state.trading = true; await mount(); await until(() => Boolean(button(tradingPurchaseCopy.en.remove)));
      await click(tradingPurchaseCopy.en.remove); await click(tradingPurchaseCopy.en.confirm);
      await until(() => renderer!.root.findAllByProps({ "data-addon-pending": true }).length === 1);
      assert.equal(state.calls.at(-1)!.enabled, false);
      assert.equal(renderer!.root.findAllByProps({ "data-addon-access": "active" }).length, 1);
      assert.equal(renderer!.root.findByProps({ "data-account-plan": "premium" }).props["data-account-plan"], "premium");
      assert.ok(renderer!.root.findAllByType("a").some(node => node.props.href === "/plus"));
    });
    await t.test("a late change for a previous account cannot clear the new owner's verified billing", async () => {
      state.trading = false; state.pending = null;
      let finish!: () => void; state.hold = new Promise(resolve => { finish = resolve; });
      await mount(); await until(() => Boolean(button(tradingPurchaseCopy.en.add))); await click(tradingPurchaseCopy.en.add);
      const confirm = button(tradingPurchaseCopy.en.confirm)!;
      await act(async () => { confirm.props.onClick(); confirm.props.onClick(); await pause(); });
      const submitted = state.calls.length;
      assert.equal(state.calls.at(-1)!.owner, ownerA.id);
      assert.equal(button(tradingPurchaseCopy.en.scheduling)?.props.disabled, true);
      state.user = ownerB;
      await act(async () => { renderer!.update(tree()); await pause(); });
      await until(() => Boolean(button(tradingPurchaseCopy.en.add)));
      await act(async () => { finish(); await pause(); });
      assert.equal(state.calls.length, submitted, "Duplicate clicks and owner changes cannot post another request");
      assert.equal(renderer!.root.findAllByProps({ "data-addon-pending": true }).length, 0);
      assert.ok(button(tradingPurchaseCopy.en.add)); state.hold = null;
    });
    await t.test("uncertain provider failure clears stale purchase eligibility, without auto-retry", async () => {
      state.trading = false; state.pending = null; state.fail = true; await mount(); await until(() => Boolean(button(tradingPurchaseCopy.en.add)));
      await click(tradingPurchaseCopy.en.add); const before = state.calls.length; await click(tradingPurchaseCopy.en.confirm);
      await until(() => renderer!.root.findAllByProps({ role: "alert" }).length === 1);
      assert.equal(state.calls.length, before + 1); assert.equal(button(tradingPurchaseCopy.en.add), undefined);
      assert.ok(button(tradingPurchaseCopy.en.refresh));
      await act(pause); assert.equal(state.calls.length, before + 1);
    });
    await t.test("processing is not a confirmed schedule; retry requires fresh user confirmation", async () => {
      state.fail = false; state.pending = { enabled: true, effectiveAt: "2030-01-01T00:00:00.000Z", canCancel: true, state: "processing", canRetry: true };
      await mount(); await until(() => Boolean(button(tradingPurchaseCopy.en.retry)));
      assert.equal(renderer!.root.findAllByType("time").length, 0, "No definite future date for an unconfirmed operation");
      assert.equal(renderer!.root.findAllByProps({ "data-addon-processing": true }).length, 1);
      assert.equal(button(tradingPurchaseCopy.en.add), undefined);
      assert.equal(renderer!.root.findAllByType("a").some(node => node.props.href === "/plus"), false);
      const before = state.calls.length;
      await click(tradingPurchaseCopy.en.retry); assert.equal(state.calls.length, before);
      await click(tradingPurchaseCopy.en.retry);
      await until(() => renderer!.root.findAllByType("time").length === 1);
      assert.equal(state.calls.length, before + 1); assert.equal(state.calls.at(-1)!.enabled, true);
      assert.equal(renderer!.root.findAllByProps({ "data-addon-access": "inactive" }).length, 1);
    });
    await t.test("missing schedule DTO is unknown, never permission to enter billing portal", async () => {
      state.pending = null; state.missingAddon = true; await mount(); await act(pause);
      assert.equal(button(tradingPurchaseCopy.en.add), undefined);
      assert.equal(button(tradingPurchaseCopy.en.remove), undefined);
      assert.equal(renderer!.root.findAllByType("button").some(node => /billing|manage subscription/i.test(label(node))), false);
      assert.ok(button(tradingPurchaseCopy.en.refresh));
    });
  } finally {
    if (renderer) await act(async () => renderer!.unmount()); await vite.close();
    if (original) Object.defineProperty(globalThis, key, original); else Reflect.deleteProperty(globalThis, key);
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow); else Reflect.deleteProperty(globalThis, "window");
  }
});
