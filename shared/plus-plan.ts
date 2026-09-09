import { PLANS, formatPlanMonthlyPrice } from "./plans.js";

/** Operator-approved Trading price. Provider configuration must match it.
 * The price decision does not by itself activate checkout or paid access.
 */
export const PLUS_PLAN = Object.freeze({
  id: "sajda-plus",
  name: "Sajda Trading",
  currency: PLANS.trading.currency,
  unitAmount: PLANS.trading.unitAmount,
  interval: PLANS.trading.interval,
  intervalCount: PLANS.trading.intervalCount,
} as const);

export function formatPlusMonthlyPrice(language: string): string {
  return formatPlanMonthlyPrice("trading", language);
}
