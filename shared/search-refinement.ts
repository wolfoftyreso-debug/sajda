/** Bounded, explicit feedback. These values are preferences, never evidence. */
export const REFINEMENT_REASONS = ["too_generic", "hard_to_spell", "too_long", "wrong_tone"] as const;
export type RefinementReason = typeof REFINEMENT_REASONS[number];
export interface SearchRefinement {
  reasons: RefinementReason[];
  previousNames: string[];
  likedNames: string[];
}

/** Names from the creative generator, not arbitrary exact-domain input. */
export function isRefinementDomainName(value: unknown): value is string {
  return typeof value === "string" && /^[a-z][a-z0-9]{2,21}\.[a-z]{2,16}$/.test(value);
}

export function parseSearchRefinement(value: unknown): SearchRefinement | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid search refinement.");
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some(key => !["reasons", "previousNames", "likedNames"].includes(key))) throw new Error("Unexpected refinement field.");
  if (!Array.isArray(row.reasons) || row.reasons.length > 4
    || row.reasons.some(reason => !(REFINEMENT_REASONS as readonly unknown[]).includes(reason))
    || new Set(row.reasons).size !== row.reasons.length) throw new Error("Invalid refinement reasons.");
  const names = (input: unknown, max: number): string[] => {
    if (!Array.isArray(input) || input.length > max || input.some(name => !isRefinementDomainName(name))
      || new Set(input).size !== input.length) {
      throw new Error("Refinement names must be unique domain names from this search.");
    }
    return input as string[];
  };
  const previousNames = names(row.previousNames, 50);
  const likedNames = names(row.likedNames, 5);
  if (!previousNames.length || likedNames.some(name => !previousNames.includes(name))
    || (!row.reasons.length && !likedNames.length)) throw new Error("Choose feedback for the previous search.");
  return { reasons: [...row.reasons] as RefinementReason[], previousNames, likedNames };
}

export const NAMING_DIRECTIONS = ["descriptive", "evocative", "compound", "invented"] as const;
export type NamingDirection = typeof NAMING_DIRECTIONS[number];
export interface NamingGeneration {
  source: "ai" | "rules";
  fallbackReason?: "ai_off" | "ai_unavailable" | "no_context" | "ai_daily_limit" | "ai_busy";
  refinementApplied: boolean;
}

export function parseNamingGeneration(value: unknown): NamingGeneration | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  if (!["ai", "rules"].includes(String(row.source)) || typeof row.refinementApplied !== "boolean") return undefined;
  const fallbackReason = ["ai_off", "ai_unavailable", "no_context", "ai_daily_limit", "ai_busy"].includes(String(row.fallbackReason))
    ? row.fallbackReason as NamingGeneration["fallbackReason"] : undefined;
  return { source: row.source as NamingGeneration["source"], refinementApplied: row.refinementApplied,
    ...(row.source === "rules" && fallbackReason ? { fallbackReason } : {}) };
}
