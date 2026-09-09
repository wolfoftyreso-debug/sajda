import type { ScanMode } from "@/lib/scanModes";
import { SEARCH_TLD_IDS } from "@/lib/anonymousSearchMode";

/**
 * A one-time, same-tab handoff from a public product entry page to the search
 * workspace. We intentionally keep it out of the URL: a visitor's business
 * idea or exact domain should never become a crawlable query string.
 */
const PRESET_STORAGE_KEY = "sajda.search-entry-preset.v1";
const PRESET_MAX_AGE_MS = 10 * 60 * 1000;
const MAX_TEXT_LENGTH = 1_800;
const scanModes = new Set<ScanMode>(["light", "medium", "heavy", "deep"]);
const supportedTlds = new Set<string>(SEARCH_TLD_IDS);

export interface SearchEntryPreset {
  keyword?: string;
  brief?: string;
  advanced?: boolean;
  tlds?: string[];
  mode?: ScanMode;
  /** Used only to choose where focus lands after navigation. */
  focus?: "main" | "advanced";
  /** Internal analytics/context label; never sent to the registry. */
  source?: string;
}

interface StoredSearchEntryPreset {
  createdAt: number;
  preset: SearchEntryPreset;
}

function normaliseText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().slice(0, MAX_TEXT_LENGTH);
  return trimmed || undefined;
}

function normalisePreset(value: unknown): SearchEntryPreset | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const tlds = Array.isArray(candidate.tlds)
    ? [...new Set(candidate.tlds
      .filter((tld): tld is string => typeof tld === "string")
      .map((tld) => tld.trim().toLowerCase().replace(/^\./, ""))
      .filter((tld) => supportedTlds.has(tld)))]
    : undefined;
  const mode = typeof candidate.mode === "string" && scanModes.has(candidate.mode as ScanMode)
    ? candidate.mode as ScanMode
    : undefined;
  const focus = candidate.focus === "advanced" || candidate.focus === "main"
    ? candidate.focus
    : undefined;

  const preset: SearchEntryPreset = {
    keyword: normaliseText(candidate.keyword),
    brief: normaliseText(candidate.brief),
    advanced: candidate.advanced === true,
    tlds: tlds && tlds.length > 0 ? tlds : undefined,
    mode,
    focus,
    source: normaliseText(candidate.source),
  };

  return preset.keyword || preset.brief || preset.tlds || preset.mode || preset.advanced
    ? preset
    : null;
}

export function storeSearchEntryPreset(preset: SearchEntryPreset): void {
  if (typeof window === "undefined") return;
  const normalised = normalisePreset(preset);
  if (!normalised) return;

  try {
    const stored: StoredSearchEntryPreset = { createdAt: Date.now(), preset: normalised };
    window.sessionStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Navigation to the workspace still works if private browsing blocks storage.
  }
}

export function consumeSearchEntryPreset(): SearchEntryPreset | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(PRESET_STORAGE_KEY);
    window.sessionStorage.removeItem(PRESET_STORAGE_KEY);
    if (!raw) return null;

    const stored = JSON.parse(raw) as Partial<StoredSearchEntryPreset>;
    if (typeof stored.createdAt !== "number" || Date.now() - stored.createdAt > PRESET_MAX_AGE_MS) {
      return null;
    }
    return normalisePreset(stored.preset);
  } catch {
    return null;
  }
}
