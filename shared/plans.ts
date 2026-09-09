/** Commercial catalog, not an authorization source. Prices never grant access.
 * Paid checkout and monitoring must pass their own release gates.
 */
export const PLANS = Object.freeze({
  free: Object.freeze({ id: "free", name: "Gratis", currency: "usd", unitAmount: 0, interval: "month", intervalCount: 1 }),
  basic: Object.freeze({ id: "basic", name: "Bas", currency: "usd", unitAmount: 900, interval: "month", intervalCount: 1 }),
  premium: Object.freeze({ id: "premium", name: "Premium", currency: "usd", unitAmount: 2900, interval: "month", intervalCount: 1 }),
  trading: Object.freeze({ id: "trading", name: "Trading", currency: "usd", unitAmount: 188_000, interval: "month", intervalCount: 1 }),
} as const);

export type PlanId = keyof typeof PLANS;
export const PLAN_ORDER = Object.freeze(["free", "basic", "premium", "trading"] as const);

export function formatPlanMonthlyPrice(planId: PlanId, language: string): string {
  const amount = new Intl.NumberFormat(language === "sv" ? "sv-SE" : "en-US", {
    maximumFractionDigits: 0,
  }).format(PLANS[planId].unitAmount / 100).replace(/\u00a0/g, " ");
  return language === "sv" ? `${amount} USD / månad` : `USD ${amount} / month`;
}
