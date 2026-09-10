import { accountRequest, readAccountSession } from "@/integrations/neon/auth";
import { throwIfCancelled } from "./abort";
import { assertAccountSessionOwner, type AccountRequestScope } from "@/lib/accountRequestScope";
import { PLUS_PLAN } from "../../shared/plus-plan";

export const billingStatuses = ["none", "incomplete", "incomplete_expired", "trialing", "active", "past_due", "canceled", "unpaid", "paused", "conflict"] as const;
export type PlusBillingStatus = typeof billingStatuses[number];
export type PlusBillingAction = "checkout" | "portal";
export interface PlusBillingSnapshot {
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
}
export type PlusBillingErrorCode = "unavailable" | "invalid_response" | "unauthenticated" | "account_changed" | "rate_limited" | "not_ready"
  | "email_verification_required" | "subscription_changed" | "checkout_expired" | "review_required" | "app_store_subscription_exists";
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
  if (payload.ready && (!price || !payload.mode) || payload.canCheckout && !payload.ready || payload.canManage && !payload.mode
    || payload.canCheckout && ["active", "trialing", "past_due", "unpaid", "paused", "conflict"].includes(String(payload.status))) return invalid();
  return { accountId, requestId: String(payload.requestId), ready: payload.ready as boolean, mode: payload.mode as PlusBillingSnapshot["mode"], price,
    status: payload.status as PlusBillingStatus, canCheckout: payload.canCheckout as boolean, canManage: payload.canManage as boolean, accessExpiresAt: payload.accessExpiresAt as string | null,
    ...(payload.appStoreManaged === true ? { appStoreManaged: true } : {}) };
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
  if (["billing_review_required", "billing_reconciliation_required"].includes(String(row?.code))) return new PlusBillingError("review_required", requestId);
  return new PlusBillingError("unavailable", requestId);
}
async function request<T>(scope: AccountRequestScope, parse: (value: unknown) => T, body?: { action: PlusBillingAction; requestKey: string }): Promise<T> {
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
export function openPlusBilling(scope: AccountRequestScope, action: PlusBillingAction, requestKey: string): Promise<string> {
  if (!["checkout", "portal"].includes(action) || !uuid.test(requestKey)) return Promise.reject(new PlusBillingError("invalid_response"));
  return request(scope, value => parseBillingRedirect(value, scope.accountId, action), { action, requestKey });
}
