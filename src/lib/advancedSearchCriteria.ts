export type AdvancedNameLanguage = "auto" | "en" | "sv" | "mixed";
export type AdvancedNameStyle = "balanced" | "brandable" | "descriptive" | "invented";

/**
 * These controls are deliberately constrained to choices the search engine
 * can honour. They are serialized with an advanced search request and echoed
 * by the server for transparent results.
 */
export interface AdvancedSearchCriteria {
  minLength: number;
  maxLength: number;
  nameLanguage: AdvancedNameLanguage;
  nameStyle: AdvancedNameStyle;
  includeWords: string[];
  excludeWords: string[];
}

export const DEFAULT_ADVANCED_SEARCH_CRITERIA: AdvancedSearchCriteria = {
  minLength: 3,
  maxLength: 16,
  nameLanguage: "auto",
  nameStyle: "balanced",
  includeWords: [],
  excludeWords: [],
};

export const ADVANCED_LENGTH_PRESETS = [
  { id: "short", minLength: 3, maxLength: 5 },
  { id: "compact", minLength: 6, maxLength: 8 },
  { id: "standard", minLength: 9, maxLength: 12 },
  { id: "any", minLength: 3, maxLength: 16 },
] as const;

export function normaliseCriteriaWords(value: string): string[] {
  const seen = new Set<string>();
  return value
    .split(/[\s,;|]+/)
    .map((word) => word.trim().slice(0, 24))
    .filter((word) => word.length > 0)
    .filter((word) => {
      const key = word.toLocaleLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
}
