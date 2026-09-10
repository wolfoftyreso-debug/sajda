/** Commercial catalog, not an authorization source. Prices never grant access.
 * Paid checkout and monitoring must pass their own release gates.
 */
export const PLANS = Object.freeze({
  free: Object.freeze({ id: "free", name: "Gratis", currency: "usd", unitAmount: 0, interval: "month", intervalCount: 1 }),
  basic: Object.freeze({ id: "basic", name: "Bas", currency: "usd", unitAmount: 900, interval: "month", intervalCount: 1 }),
  premium: Object.freeze({ id: "premium", name: "Premium", currency: "usd", unitAmount: 1900, interval: "month", intervalCount: 1 }),
  trading: Object.freeze({ id: "trading", name: "Trading", currency: "usd", unitAmount: 4900, interval: "month", intervalCount: 1 }),
} as const);

export type PlanId = keyof typeof PLANS;
export const PLAN_ORDER = Object.freeze(["free", "basic", "premium", "trading"] as const);

export function formatPlanMonthlyPrice(planId: PlanId, language: string): string {
  const locales: Record<string, string> = { en: "en-US", sv: "sv-SE", es: "es-ES", fr: "fr-FR", zh: "zh-CN" };
  const amount = new Intl.NumberFormat(locales[language] ?? locales.en, {
    maximumFractionDigits: 0,
  }).format(PLANS[planId].unitAmount / 100).replace(/\u00a0/g, " ");
  switch (language) {
    case "sv": return `${amount} USD / månad`;
    case "es": return `${amount} USD / mes`;
    case "fr": return `${amount} USD / mois`;
    case "zh": return `${amount} USD / 月`;
    default: return `USD ${amount} / month`;
  }
}
