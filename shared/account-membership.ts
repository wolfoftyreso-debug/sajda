import { PLAN_ORDER, basePlanFor, type BasePlanId, type PlanId } from "./plans.js";

/** Server-derived presentation. Never use a browser snapshot to authorize a mutation. */
export interface AccountMembership {
  plan: PlanId;
  /** Canonical presentation. `plan` is retained for old API/native clients. */
  basePlan?: BasePlanId;
  addons?: { trading: boolean };
  accessSource: "free" | "operator" | "subscription";
  expiresAt: string | null;
  capabilities: { save_domains: boolean; swipe_undo: boolean; trading: boolean };
}

/** Normalizes verified legacy bundles without granting any new capabilities. */
export function membershipProductModel(membership: AccountMembership): { basePlan: BasePlanId; addons: { trading: boolean } } {
  return { basePlan: basePlanFor(membership.plan), addons: { trading: membership.capabilities.trading } };
}

export function hasPlanLevel(plan: PlanId, required: PlanId): boolean {
  return PLAN_ORDER.indexOf(plan) >= PLAN_ORDER.indexOf(required);
}

export function isAccountMembership(value: unknown): value is AccountMembership {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (!PLAN_ORDER.includes(item.plan as PlanId) || typeof item.accessSource !== "string" || !["free", "operator", "subscription"].includes(item.accessSource)) return false;
  if ((item.basePlan === undefined) !== (item.addons === undefined)) return false;
  if (item.basePlan !== undefined) {
    const addons = item.addons as Record<string, unknown> | null;
    if (item.basePlan !== basePlanFor(item.plan as PlanId) || !addons || typeof addons !== "object" || Array.isArray(addons)
      || Object.keys(addons).length !== 1 || addons.trading !== (item.plan === "trading")) return false;
  }
  const capabilities = item.capabilities as Record<string, unknown> | null;
  if (!capabilities || typeof capabilities !== "object" || Array.isArray(capabilities)
    || capabilities.save_domains !== true
    || capabilities.swipe_undo !== (item.plan === "premium" || item.plan === "trading")
    || capabilities.trading !== (item.plan === "trading")) return false;
  if (item.plan === "free") return item.accessSource === "free" && item.expiresAt === null;
  return item.accessSource !== "free" && typeof item.expiresAt === "string"
    && Number.isFinite(Date.parse(item.expiresAt))
    && new Date(item.expiresAt).toISOString() === item.expiresAt;
}
