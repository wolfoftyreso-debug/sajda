/** Commercial catalog, not an authorization source. Prices never grant access.
 * Paid checkout and monitoring must pass their own release gates.
 */
export const PLANS = Object.freeze({
  free: Object.freeze({ id: "free", name: "Gratis", currency: "usd", unitAmount: 0, interval: "month", intervalCount: 1 }),
  basic: Object.freeze({ id: "basic", name: "Bas", currency: "usd", unitAmount: 900, interval: "month", intervalCount: 1 }),
  premium: Object.freeze({ id: "premium", name: "Pro", currency: "usd", unitAmount: 1900, interval: "month", intervalCount: 1 }),
  // Compatibility SKU: one subscription containing Pro and its Trading add-on.
  // It is not a fourth base plan. Keep the ID/amount for existing subscriptions.
  trading: Object.freeze({ id: "trading", name: "Pro + Trading", currency: "usd", unitAmount: 4900, interval: "month", intervalCount: 1 }),
} as const);

export type PlanId = keyof typeof PLANS;
export type PaidPlanId = Exclude<PlanId, "free">;
export const BASE_PLAN_ORDER = Object.freeze(["free", "basic", "premium"] as const);
export type BasePlanId = typeof BASE_PLAN_ORDER[number];
export const TRADING_ADDON = Object.freeze({
  id: "trading", basePlan: "premium", currency: "usd", unitAmount: 3000,
  totalUnitAmount: PLANS.trading.unitAmount, interval: "month", intervalCount: 1,
} as const);
/** Legacy entitlement/billing ordering, not the public product hierarchy. */
export const PLAN_ORDER = Object.freeze(["free", "basic", "premium", "trading"] as const);
export const PAID_PLAN_ORDER = Object.freeze(["basic", "premium", "trading"] as const satisfies readonly PaidPlanId[]);

/** An approved commercial offer, not a checkout or access authorization.
 * The server verifies eligibility and its Stripe coupon before accepting it.
 * The regular Pro catalog price remains unchanged (legacy ID: premium).
 */
export const PREMIUM_INTRO_OFFER = Object.freeze({
  id: "premium-first-month-v1",
  plan: "premium",
  currency: "usd",
  firstUnitAmount: 900,
  discountAmount: 1000,
  renewalUnitAmount: PLANS.premium.unitAmount,
  interval: "month",
  duration: "once",
} as const);

export function isPaidPlanId(value: unknown): value is PaidPlanId {
  return typeof value === "string" && PAID_PLAN_ORDER.includes(value as PaidPlanId);
}

export function basePlanFor(plan: PlanId): BasePlanId {
  return plan === "trading" ? "premium" : plan;
}

export function formatPlanMonthlyPrice(planId: PlanId, language: string): string {
  return formatMonthlyPrice(PLANS[planId].unitAmount, language);
}

export function formatTradingAddonMonthlyPrice(language: string): string {
  return formatMonthlyPrice(TRADING_ADDON.unitAmount, language);
}

export function formatTradingBundleMonthlyPrice(language: string): string {
  return formatMonthlyPrice(TRADING_ADDON.totalUnitAmount, language);
}

function formatMonthlyPrice(unitAmount: number, language: string): string {
  const locales: Record<string, string> = { en: "en-US", sv: "sv-SE", es: "es-ES", fr: "fr-FR", zh: "zh-CN" };
  const amount = new Intl.NumberFormat(locales[language] ?? locales.en, {
    maximumFractionDigits: 0,
  }).format(unitAmount / 100).replace(/\u00a0/g, " ");
  switch (language) {
    case "sv": return `${amount} USD / månad`;
    case "es": return `${amount} USD / mes`;
    case "fr": return `${amount} USD / mois`;
    case "zh": return `${amount} USD / 月`;
    default: return `USD ${amount} / month`;
  }
}
