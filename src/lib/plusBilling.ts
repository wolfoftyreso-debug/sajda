import { accountRequest, readAccountSession } from "@/integrations/neon/auth";
import { throwIfCancelled } from "./abort";
import { assertAccountSessionOwner, type AccountRequestScope } from "@/lib/accountRequestScope";
import { PLUS_PLAN } from "../../shared/plus-plan";
import { PAID_PLAN_ORDER, PLANS, PREMIUM_INTRO_OFFER, type PaidPlanId } from "../../shared/plans";

export const billingStatuses = ["none", "incomplete", "incomplete_expired", "trialing", "active", "past_due", "canceled", "unpaid", "paused", "conflict"] as const;
export type PlusBillingStatus = typeof billingStatuses[number];
export type PlusBillingAction = "checkout" | "portal";
export interface PlusBillingSnapshot {
  tradingAddon?: { canAdd: boolean; canRemove: boolean; pending: { enabled: boolean; effectiveAt: string; canCancel: boolean; state?: "processing" | "scheduled"; canRetry?: boolean } | null };
  accountId: string;
  requestId: string;
  ready: boolean;
  mode: "test" | "live" | null;
  price: { currency: "usd"; unitAmount: number; interval: "month"; intervalCount: 1; taxBehavior: "inclusive" | "exclusive" | "unspecified" } | null;
  status: PlusBillingStatus;
  canCheckout: boolean;
  canManage: boolean;
  accessExpiresAt: string | null;
  appStoreManaged?: boolean;
  activePlan: PaidPlanId | null;
  plans: Record<PaidPlanId, { ready: boolean; price: PlusBillingSnapshot["price"]; canCheckout: boolean }>;
  premiumIntro?: { id: typeof PREMIUM_INTRO_OFFER.id; eligible: boolean; ready: boolean; firstUnitAmount: 900; renewalUnitAmount: 1900; currency: "usd"; interval: "month" } | null;
}
export type PlusBillingErrorCode = "unavailable" | "invalid_response" | "unauthenticated" | "account_changed" | "rate_limited" | "not_ready"
  | "email_verification_required" | "subscription_changed" | "checkout_expired" | "checkout_plan_conflict" | "checkout_context_conflict" | "review_required" | "app_store_subscription_exists" | "intro_offer_unavailable";
export class PlusBillingError extends Error {
  constructor(readonly code: PlusBillingErrorCode, readonly requestId?: string) { super("Billing could not be confirmed."); this.name = "PlusBillingError"; }
}
const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const trace = (value: unknown): value is string => typeof value === "string" && /^req_[A-Za-z0-9_-]{16}$/u.test(value);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const invalid = (): never => { throw new PlusBillingError("invalid_response"); };
function owned(value: unknown, accountId: string): Record<string, unknown> {
  const payload = object(value);
  if (typeof payload?.accountId === "string" && payload.accountId !== accountId) throw new PlusBillingError("account_changed");
  if (!accountId || !payload || payload.accountId !== accountId || !trace(payload.requestId) || payload.error !== undefined || payload.code !== undefined) return invalid();
  return payload;
}
export function parsePlusBilling(value: unknown, accountId: string): PlusBillingSnapshot {
  const payload = owned(value, accountId);
  if (![payload.ready, payload.canCheckout, payload.canManage].every(value => typeof value === "boolean")
    || (payload.appStoreManaged !== undefined && typeof payload.appStoreManaged !== "boolean")
    || (payload.appStoreManaged === true && payload.canCheckout === true)
    || !["test", "live", null].includes(payload.mode as string | null) || !billingStatuses.includes(payload.status as PlusBillingStatus)
    || !(payload.accessExpiresAt === null || typeof payload.accessExpiresAt === "string" && /^\d{4}-\d{2}-\d{2}T/u.test(payload.accessExpiresAt) && Number.isFinite(Date.parse(payload.accessExpiresAt)))) return invalid();
  let price: PlusBillingSnapshot["price"] = null;
  if (payload.price !== null) {
    const row = object(payload.price);
    if (!row || row.currency !== PLUS_PLAN.currency || row.unitAmount !== PLUS_PLAN.unitAmount
      || row.interval !== PLUS_PLAN.interval || row.intervalCount !== PLUS_PLAN.intervalCount || !["inclusive", "exclusive", "unspecified"].includes(String(row.taxBehavior))) return invalid();
    price = { currency: "usd", unitAmount: Number(row.unitAmount), interval: "month", intervalCount: 1, taxBehavior: row.taxBehavior as NonNullable<PlusBillingSnapshot["price"]>["taxBehavior"] };
  }
  const parsePlan = (plan: PaidPlanId, value: unknown) => {
    const row = object(value);
    if (!row || typeof row.ready !== "boolean" || typeof row.canCheckout !== "boolean" || row.canCheckout && !row.ready) return invalid();
    let planPrice: PlusBillingSnapshot["price"] = null;
    if (row.price !== null) {
      const item = object(row.price), contract = PLANS[plan];
      if (!item || item.currency !== contract.currency || item.unitAmount !== contract.unitAmount || item.interval !== contract.interval
        || item.intervalCount !== contract.intervalCount || !["inclusive", "exclusive", "unspecified"].includes(String(item.taxBehavior))) return invalid();
      planPrice = { currency: "usd", unitAmount: Number(item.unitAmount), interval: "month", intervalCount: 1, taxBehavior: item.taxBehavior as NonNullable<PlusBillingSnapshot["price"]>["taxBehavior"] };
    }
    if (row.ready && !planPrice) return invalid();
    return { ready: row.ready, price: planPrice, canCheckout: row.canCheckout };
  };
  const rawPlans = object(payload.plans);
  const plans = rawPlans
    ? Object.fromEntries(PAID_PLAN_ORDER.map(plan => [plan, parsePlan(plan, rawPlans[plan])])) as PlusBillingSnapshot["plans"]
    : {
        basic: { ready: false, price: null, canCheckout: false },
        premium: { ready: false, price: null, canCheckout: false },
        trading: { ready: payload.ready as boolean, price, canCheckout: payload.canCheckout as boolean },
      };
  const activePlan = payload.activePlan === undefined || payload.activePlan === null ? null
    : PAID_PLAN_ORDER.includes(payload.activePlan as PaidPlanId) ? payload.activePlan as PaidPlanId : invalid();
  if (payload.ready && (!price || !payload.mode) || payload.canCheckout && !payload.ready || payload.canManage && !payload.mode
    || payload.canCheckout && ["active", "trialing", "past_due", "unpaid", "paused", "conflict"].includes(String(payload.status))) return invalid();
  let premiumIntro: PlusBillingSnapshot["premiumIntro"] = null;
  if (payload.premiumIntro !== undefined && payload.premiumIntro !== null) {
    const offer = object(payload.premiumIntro);
    if (!offer || offer.id !== PREMIUM_INTRO_OFFER.id || offer.firstUnitAmount !== PREMIUM_INTRO_OFFER.firstUnitAmount
      || offer.renewalUnitAmount !== PREMIUM_INTRO_OFFER.renewalUnitAmount || offer.currency !== PREMIUM_INTRO_OFFER.currency
      || offer.interval !== PREMIUM_INTRO_OFFER.interval || typeof offer.ready !== "boolean" || typeof offer.eligible !== "boolean"
      || offer.ready && (!plans.premium.ready || !payload.mode)
      || offer.eligible && (!offer.ready || !plans.premium.canCheckout || payload.appStoreManaged === true)) return invalid();
    premiumIntro = { id: PREMIUM_INTRO_OFFER.id, ready: offer.ready, eligible: offer.eligible,
      firstUnitAmount: PREMIUM_INTRO_OFFER.firstUnitAmount, renewalUnitAmount: PREMIUM_INTRO_OFFER.renewalUnitAmount,
      currency: PREMIUM_INTRO_OFFER.currency, interval: PREMIUM_INTRO_OFFER.interval };
  }
  let tradingAddon: PlusBillingSnapshot["tradingAddon"];
  if (payload.tradingAddon !== undefined) {
    const addon = object(payload.tradingAddon);
    if (!addon || typeof addon.canAdd !== "boolean" || typeof addon.canRemove !== "boolean"
      || addon.canAdd && addon.canRemove || addon.pending !== null && !object(addon.pending)) return invalid();
    let pending: NonNullable<PlusBillingSnapshot["tradingAddon"]>["pending"] = null;
    if (addon.pending !== null) {
      const row = object(addon.pending)!;
      const state = row.state ?? "scheduled", canRetry = row.canRetry ?? false;
      if (typeof row.enabled !== "boolean" || typeof row.canCancel !== "boolean" || !isoDate(row.effectiveAt)
        || !["processing", "scheduled"].includes(String(state)) || typeof canRetry !== "boolean"
        || addon.canAdd || addon.canRemove || !payload.canManage || payload.canCheckout
        || canRetry && (state !== "processing" || payload.status !== "active" || !["premium", "trading"].includes(String(activePlan)))
        || ["premium", "trading"].includes(String(activePlan)) && row.enabled !== (activePlan === "premium")) return invalid();
      pending = { enabled: row.enabled, effectiveAt: row.effectiveAt as string, canCancel: row.canCancel, state: state as "processing" | "scheduled", canRetry };
    }
    if ((addon.canAdd || addon.canRemove || pending) && (payload.appStoreManaged === true || !payload.mode || payload.canCheckout)
      || (addon.canAdd || addon.canRemove) && payload.status !== "active"
      || addon.canAdd && (activePlan !== "premium" || !plans.trading.ready)
      || addon.canRemove && (activePlan !== "trading" || !plans.premium.price)) return invalid();
    tradingAddon = { canAdd: addon.canAdd, canRemove: addon.canRemove, pending };
  }
  return { accountId, requestId: String(payload.requestId), ready: payload.ready as boolean, mode: payload.mode as PlusBillingSnapshot["mode"], price,
    status: payload.status as PlusBillingStatus, canCheckout: payload.canCheckout as boolean, canManage: payload.canManage as boolean, accessExpiresAt: payload.accessExpiresAt as string | null,
    activePlan, plans, premiumIntro, ...(tradingAddon ? { tradingAddon } : {}),
    ...(payload.appStoreManaged === true ? { appStoreManaged: true } : {}) };
}
const isoDate = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/u.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
export interface TradingAddonChangeResult { accountId: string; requestId: string; state: "scheduled"; enabled: boolean; effectiveAt: string }
export function parseTradingAddonChange(value: unknown, accountId: string, enabled: boolean): TradingAddonChangeResult {
  const payload = owned(value, accountId);
  if (payload.state !== "scheduled" || payload.enabled !== enabled || !isoDate(payload.effectiveAt) || payload.url !== undefined) return invalid();
  return { accountId, requestId: String(payload.requestId), state: "scheduled", enabled, effectiveAt: payload.effectiveAt };
}
export function parseCanceledTradingAddonChange(value: unknown, accountId: string): { state: "canceled"; accountId: string; requestId: string } {
  const payload = owned(value, accountId);
  if (payload.state !== "canceled" || payload.url !== undefined) return invalid();
  return { state: "canceled", accountId, requestId: String(payload.requestId) };
}
export function parseBillingRedirect(value: unknown, accountId: string, action: PlusBillingAction): string {
  const payload = owned(value, accountId);
  if (typeof payload.url !== "string" || payload.url.length > 8192) return invalid();
  let url: URL;
  try { url = new URL(payload.url); } catch { return invalid(); }
  if (url.protocol !== "https:" || url.username || url.password || url.port
    || url.hostname !== (action === "checkout" ? "checkout.stripe.com" : "billing.stripe.com")) return invalid();
  return url.href;
}
function safeFailure(error: unknown): Error {
  if (error instanceof PlusBillingError || error instanceof Error && error.name === "AbortError") return error;
  const row = object(error), requestId = trace(row?.requestId) ? row.requestId : undefined;
  if (row?.code === "account_changed") return new PlusBillingError("account_changed", requestId);
  if (row?.status === 401) return new PlusBillingError("unauthenticated", requestId);
  if (row?.status === 429) return new PlusBillingError("rate_limited", requestId);
  if (["billing_not_configured", "billing_disabled", "billing_not_ready", "checkout_disabled"].includes(String(row?.code))) return new PlusBillingError("not_ready", requestId);
  if (row?.code === "email_verification_required") return new PlusBillingError("email_verification_required", requestId);
  if (row?.code === "app_store_subscription_exists") return new PlusBillingError("app_store_subscription_exists", requestId);
  if (["subscription_exists", "checkout_completed"].includes(String(row?.code))) return new PlusBillingError("subscription_changed", requestId);
  if (row?.code === "checkout_expired") return new PlusBillingError("checkout_expired", requestId);
  if (row?.code === "checkout_plan_conflict") return new PlusBillingError("checkout_plan_conflict", requestId);
  if (row?.code === "checkout_context_conflict") return new PlusBillingError("checkout_context_conflict", requestId);
  if (row?.code === "intro_offer_unavailable") return new PlusBillingError("intro_offer_unavailable", requestId);
  if (row?.code === "addon_change_unavailable") return new PlusBillingError("not_ready", requestId);
  if (["addon_change_pending", "addon_change_completed", "addon_already_selected", "pro_subscription_required"].includes(String(row?.code))) return new PlusBillingError("subscription_changed", requestId);
  if (row?.code === "addon_change_review_required") return new PlusBillingError("review_required", requestId);
  if (["billing_review_required", "billing_reconciliation_required"].includes(String(row?.code))) return new PlusBillingError("review_required", requestId);
  return new PlusBillingError("unavailable", requestId);
}
export interface PremiumCheckoutOptions { offer?: typeof PREMIUM_INTRO_OFFER.id; returnTo?: "swipe" }
async function request<T>(scope: AccountRequestScope, parse: (value: unknown) => T, body?: ({ action: PlusBillingAction; requestKey: string; plan?: PaidPlanId } & PremiumCheckoutOptions) | { action: "trading-addon"; requestKey: string; enabled: boolean } | { action: "cancel-trading-addon-change"; requestKey: string }): Promise<T> {
  try {
    const result = parse(await accountRequest<unknown>("/api/account/billing", { ...scope, ...(body ? { method: "POST", body } : {}) }));
    throwIfCancelled(scope.signal);
    const session = await readAccountSession();
    throwIfCancelled(scope.signal);
    if (!session || !Number.isFinite(session.expires_at) || Number(session.expires_at) <= Date.now() / 1000) throw new PlusBillingError("unauthenticated");
    assertAccountSessionOwner(session.user.id, scope.accountId);
    return result;
  } catch (error) { throw safeFailure(error); }
}
export const getPlusBilling = (scope: AccountRequestScope) => request(scope, value => parsePlusBilling(value, scope.accountId));
export function changeTradingAddon(scope: AccountRequestScope, requestKey: string, enabled: boolean): Promise<TradingAddonChangeResult> {
  if (!uuid.test(requestKey) || typeof enabled !== "boolean") return Promise.reject(new PlusBillingError("invalid_response"));
  return request(scope, value => parseTradingAddonChange(value, scope.accountId, enabled), { action: "trading-addon", requestKey, enabled });
}
export function cancelTradingAddonChange(scope: AccountRequestScope, requestKey: string): Promise<{ state: "canceled"; accountId: string; requestId: string }> {
  if (!uuid.test(requestKey)) return Promise.reject(new PlusBillingError("invalid_response"));
  return request(scope, value => parseCanceledTradingAddonChange(value, scope.accountId), { action: "cancel-trading-addon-change", requestKey });
}
export function openPlusBilling(scope: AccountRequestScope, action: PlusBillingAction, requestKey: string, plan: PaidPlanId = "trading", options: PremiumCheckoutOptions = {}): Promise<string> {
  if (!["checkout", "portal"].includes(action) || !uuid.test(requestKey) || (options.offer !== undefined && (options.offer !== PREMIUM_INTRO_OFFER.id || plan !== "premium" || action !== "checkout"))
    || options.returnTo !== undefined && (options.returnTo !== "swipe" || action !== "checkout")) return Promise.reject(new PlusBillingError("invalid_response"));
  return request(scope, value => parseBillingRedirect(value, scope.accountId, action), { action, requestKey, ...(action === "checkout" && plan !== "trading" ? { plan } : {}), ...options });
}
