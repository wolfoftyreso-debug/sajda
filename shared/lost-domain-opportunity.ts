/** Review priority only. These weights do not estimate price or registrability. */
export const LOST_OPPORTUNITY_WEIGHTS = Object.freeze({ registry: 40, dns: 15, mail: 10,
  website: 5, name: 20, source: 10 });
export const LOST_OPPORTUNITY_CHECKS = ["registry", "dns", "mail", "website", "registrar", "history", "trademark", "market_comparables"] as const;
export type LostOpportunityCheck = typeof LOST_OPPORTUNITY_CHECKS[number];
export interface LostDomainOpportunity {
  version: 1;
  tier: "priority_review" | "review" | "watch" | "excluded";
  score: number;
  breakdown: Record<keyof typeof LOST_OPPORTUNITY_WEIGHTS, number> & { penalties: number };
  reasons: string[];
  missingChecks: LostOpportunityCheck[];
}

const object = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === "object" && !Array.isArray(value)
  ? value as Record<string, unknown> : undefined;
const bounded = (value: unknown, maximum: number): value is number => Number.isInteger(value) && Number(value) >= 0 && Number(value) <= maximum;
/** Old reports may omit this block. Present blocks must be bounded and coherent. */
export function isLostDomainOpportunity(value: unknown): value is LostDomainOpportunity {
  const row = object(value), breakdown = object(row?.breakdown);
  if (!row || row.version !== 1 || !["priority_review", "review", "watch", "excluded"].includes(String(row.tier))
    || !bounded(row.score, 100) || !breakdown || !bounded(breakdown.penalties, 100)
    || !Array.isArray(row.reasons) || row.reasons.length > 24
    || row.reasons.some(reason => typeof reason !== "string" || !/^[a-z][a-z0-9_]{0,79}$/u.test(reason))
    || new Set(row.reasons).size !== row.reasons.length || !Array.isArray(row.missingChecks)
    || row.missingChecks.some(check => !LOST_OPPORTUNITY_CHECKS.includes(check))
    || ["registrar", "history", "trademark", "market_comparables"].some(check => !(row.missingChecks as unknown[]).includes(check))
    || new Set(row.missingChecks).size !== row.missingChecks.length) return false;
  let total = 0;
  for (const [key, maximum] of Object.entries(LOST_OPPORTUNITY_WEIGHTS)) {
    if (!bounded(breakdown[key], maximum)) return false;
    total += Number(breakdown[key]);
  }
  if (row.score !== Math.max(0, total - Number(breakdown.penalties))) return false;
  if (row.tier === "excluded" && row.score !== 0 || row.tier === "watch" && Number(row.score) > 29
    || row.tier === "review" && Number(row.score) > 69) return false;
  if ((row.tier === "priority_review" || row.tier === "review") && (breakdown.registry !== 40 || breakdown.dns !== 15 || breakdown.mail !== 10)) return false;
  if (row.tier === "priority_review" && (breakdown.website !== 5 || Number(row.score) < 70 || breakdown.penalties !== 0
    || ["registry", "dns", "mail", "website"].some(check => (row.missingChecks as unknown[]).includes(check)))) return false;
  return true;
}
