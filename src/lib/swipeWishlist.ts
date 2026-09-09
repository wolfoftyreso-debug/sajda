import type { AnonymousSearchResult } from "@/lib/localTestSearch";

/**
 * Swipe is intentionally useful before a person has an account. These picks
 * therefore live in the browser, not in the authenticated watchlist. Keeping
 * this model separate prevents a local Swipe save from pretending to be a
 * cloud-synchronised account record.
 */
export const SWIPE_WISHLIST_STORAGE_KEY = "sajda.swipe.wishlist.v1";

export const swipeWishlistCategories = [
  "shortlist",
  "brand",
  "watch",
  "later",
] as const;

export type SwipeWishlistCategory = (typeof swipeWishlistCategories)[number];

export interface SwipeWishlistEntry {
  /** A lower-case fully-qualified domain is the stable local identifier. */
  domain: string;
  /** Snapshot returned by the last registry check. It is not a live promise. */
  result: AnonymousSearchResult;
  category: SwipeWishlistCategory;
  tags: string[];
  savedAt: string;
  /** When the saved name was last explicitly checked from this list. */
  lastCheckedAt: string;
}

let volatileWishlist: SwipeWishlistEntry[] = [];

function storageAvailable(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function normaliseDomain(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const domain = value.trim().toLowerCase();
  return /^(?=.{3,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9]{2,63})$/u.test(domain)
    ? domain
    : null;
}

function isCategory(value: unknown): value is SwipeWishlistCategory {
  return typeof value === "string" && (swipeWishlistCategories as readonly string[]).includes(value);
}

function normaliseTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const tags: string[] = [];

  for (const rawTag of value) {
    if (typeof rawTag !== "string") continue;
    const tag = rawTag.trim().replace(/\s+/gu, " ").slice(0, 32);
    const key = tag.toLocaleLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }

  return tags;
}

function isSearchResult(value: unknown): value is AnonymousSearchResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<AnonymousSearchResult>;
  return typeof result.domain === "string"
    && typeof result.tld === "string"
    && (result.status === "available" || result.status === "taken" || result.status === "unknown")
    && (result.checkMethod === "rdap" || result.checkMethod === "whois" || result.checkMethod === "das" || result.checkMethod === "none")
    && typeof result.source === "string"
    && typeof result.authoritative === "boolean"
    && typeof result.registrarPrice === "number"
    && typeof result.estimatedValue === "number"
    && typeof result.confidenceScore === "number"
    && typeof result.rationale === "string";
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function toEntry(value: unknown): SwipeWishlistEntry | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<SwipeWishlistEntry>;
  const domain = normaliseDomain(candidate.domain);
  if (!domain || !isSearchResult(candidate.result)) return null;

  return {
    domain,
    result: { ...candidate.result, domain },
    category: isCategory(candidate.category) ? candidate.category : "shortlist",
    tags: normaliseTags(candidate.tags),
    savedAt: isTimestamp(candidate.savedAt) ? candidate.savedAt : new Date(0).toISOString(),
    lastCheckedAt: isTimestamp(candidate.lastCheckedAt)
      ? candidate.lastCheckedAt
      : isTimestamp(candidate.savedAt)
        ? candidate.savedAt
        : new Date(0).toISOString(),
  };
}

function sortByRecent(entries: SwipeWishlistEntry[]): SwipeWishlistEntry[] {
  return [...entries].sort((left, right) => right.savedAt.localeCompare(left.savedAt));
}

export function readSwipeWishlist(): SwipeWishlistEntry[] {
  const storage = storageAvailable();
  if (!storage) return sortByRecent(volatileWishlist);

  try {
    const raw = storage.getItem(SWIPE_WISHLIST_STORAGE_KEY);
    if (!raw) return sortByRecent(volatileWishlist);
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return sortByRecent(volatileWishlist);
    volatileWishlist = parsed.map(toEntry).filter((entry): entry is SwipeWishlistEntry => entry !== null);
    return sortByRecent(volatileWishlist);
  } catch {
    return sortByRecent(volatileWishlist);
  }
}

export function writeSwipeWishlist(entries: SwipeWishlistEntry[]): void {
  const next = sortByRecent(entries.map(toEntry).filter((entry): entry is SwipeWishlistEntry => entry !== null));
  volatileWishlist = next;
  const storage = storageAvailable();
  if (!storage) return;

  try {
    storage.setItem(SWIPE_WISHLIST_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage can be unavailable in private browsing or reach a browser quota.
    // The in-memory list remains usable for the rest of the session.
  }
}

export function saveSwipeWishlistResult(
  entries: SwipeWishlistEntry[],
  result: AnonymousSearchResult,
  now = new Date().toISOString(),
): SwipeWishlistEntry[] {
  const domain = normaliseDomain(result.domain);
  if (!domain) return entries;
  const existing = entries.find((entry) => entry.domain === domain);
  const nextResult = { ...result, domain };

  if (existing) {
    return entries.map((entry) => entry.domain === domain
      ? { ...entry, result: nextResult, lastCheckedAt: now }
      : entry);
  }

  return [{
    domain,
    result: nextResult,
    category: "shortlist",
    tags: [],
    savedAt: now,
    lastCheckedAt: now,
  }, ...entries];
}

export function updateSwipeWishlistEntry(
  entries: SwipeWishlistEntry[],
  domain: string,
  update: Partial<Pick<SwipeWishlistEntry, "category" | "tags" | "result" | "lastCheckedAt">>,
): SwipeWishlistEntry[] {
  const key = normaliseDomain(domain);
  if (!key) return entries;

  return entries.map((entry) => {
    if (entry.domain !== key) return entry;
    const nextResult = update.result && isSearchResult(update.result)
      ? { ...update.result, domain: key }
      : entry.result;
    return {
      ...entry,
      result: nextResult,
      category: isCategory(update.category) ? update.category : entry.category,
      tags: update.tags === undefined ? entry.tags : normaliseTags(update.tags),
      lastCheckedAt: isTimestamp(update.lastCheckedAt) ? update.lastCheckedAt : entry.lastCheckedAt,
    };
  });
}

export function removeSwipeWishlistEntry(entries: SwipeWishlistEntry[], domain: string): SwipeWishlistEntry[] {
  const key = normaliseDomain(domain);
  return key ? entries.filter((entry) => entry.domain !== key) : entries;
}
