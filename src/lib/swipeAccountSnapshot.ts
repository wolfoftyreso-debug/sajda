import type { SwipeWishlistEntry } from "@/lib/swipeWishlist";
import type { addToWatchlist } from "@/lib/watchlistService";

/** Copy only fields the existing account schema can actually preserve. No
 * invented valuation, currency conversion, status, tag or monitoring fields. */
export function swipeAccountSnapshot(item: SwipeWishlistEntry): Parameters<typeof addToWatchlist>[0] {
  const { result, domain } = item;
  const bounded = (value: unknown, maximum: number) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= maximum;
  if (!domain || typeof result?.domain !== "string" || result.domain.toLowerCase() !== domain ||
      !bounded(result.registrarPrice, 1e12) || !bounded(result.estimatedValue, 1e12) ||
      !bounded(result.confidenceScore, 100) || typeof result.rationale !== "string" || result.rationale.length > 4000) {
    throw Object.assign(new Error("Invalid saved-result snapshot"), { code: "invalid_snapshot" });
  }
  return { domain, registrarPrice: result.registrarPrice, estimatedValue: result.estimatedValue,
    confidenceScore: result.confidenceScore, rationale: result.rationale };
}
