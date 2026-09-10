import { isRefinementDomainName, REFINEMENT_REASONS, type RefinementReason, type SearchRefinement } from "../../shared/search-refinement";

export { REFINEMENT_REASONS } from "../../shared/search-refinement";

export const FIRST_RESULTS_COUNT = 10;

/** UI normalization only. The server independently validates every request. */
export function normalizeRefinementNames(names: readonly string[]): string[] {
  return Array.from(new Set(names
    .filter((name): name is string => typeof name === "string")
    .map(name => name.trim().toLowerCase())
    .filter(isRefinementDomainName)))
    .slice(0, 50);
}

export function buildSearchRefinement(
  previousNames: readonly string[],
  reasons: readonly RefinementReason[],
  likedNames: readonly string[],
): SearchRefinement | undefined {
  const previous = normalizeRefinementNames(previousNames);
  const selectedReasons = REFINEMENT_REASONS.filter(reason => reasons.includes(reason));
  const liked = normalizeRefinementNames(likedNames).filter(name => previous.includes(name)).slice(0, 5);
  if (!previous.length || (!selectedReasons.length && !liked.length)) return undefined;
  return { reasons: selectedReasons, previousNames: previous, likedNames: liked };
}

/** Reveal existing ranked results, without reranking or starting another search. */
export function getVisibleSearchResults<T>(results: readonly T[], visibleCount = FIRST_RESULTS_COUNT): T[] {
  const count = Number.isFinite(visibleCount) ? Math.max(0, Math.floor(visibleCount)) : FIRST_RESULTS_COUNT;
  return results.slice(0, count);
}

export function nextSearchResultCount(visibleCount: number, totalCount: number): number {
  const total = Number.isFinite(totalCount) ? Math.max(0, Math.floor(totalCount)) : 0;
  const current = Number.isFinite(visibleCount) ? Math.max(0, Math.floor(visibleCount)) : FIRST_RESULTS_COUNT;
  return Math.min(total, current + FIRST_RESULTS_COUNT);
}
