import type { AnonymousSearchResult } from "./localTestSearch";

export const SWIPE_MIN_LENGTH = 3;
export const SWIPE_MAX_LENGTH = 9;
export const SWIPE_DECK_SIZE = 100;

/** Only show verified, unique cards belonging to this requested selection. */
export function toVerifiedSwipeDeck(results: AnonymousSearchResult[], selectedTlds: readonly string[]) {
  const selected = new Set(selectedTlds);
  const seen = new Set<string>();
  return results.filter((result) => {
    const [label, tld, extra] = result.domain.split(".");
    if (extra !== undefined || !selected.has(tld) || result.tld !== tld
      || !/^[a-z]+$/.test(label) || label.length < SWIPE_MIN_LENGTH || label.length > SWIPE_MAX_LENGTH
      || result.status !== "available" || !result.authoritative || result.checkMethod === "none"
      || seen.has(result.domain)) return false;
    seen.add(result.domain);
    return true;
  }).slice(0, SWIPE_DECK_SIZE);
}
