import { PLAN_ORDER, type PlanId } from "./plans.js";

/** Server-derived presentation. Never use a browser snapshot to authorize a mutation. */
export interface AccountMembership {
  plan: PlanId;
  accessSource: "free" | "operator" | "subscription";
  expiresAt: string | null;
  capabilities: { save_domains: boolean; swipe_undo: boolean; trading: boolean };
}

export function hasPlanLevel(plan: PlanId, required: PlanId): boolean {
  return PLAN_ORDER.indexOf(plan) >= PLAN_ORDER.indexOf(required);
}

export function isAccountMembership(value: unknown): value is AccountMembership {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (!PLAN_ORDER.includes(item.plan as PlanId) || typeof item.accessSource !== "string" || !["free", "operator", "subscription"].includes(item.accessSource)) return false;
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
