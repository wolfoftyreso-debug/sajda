export type Language = "en" | "sv" | "es" | "fr" | "zh";

// Preserve existing choices. Older releases also persisted their initial English
// default; those values cannot safely be distinguished from an explicit choice.
export const LANGUAGE_STORAGE_KEY = "name-quest.language.v2";

export function isLanguage(value: unknown): value is Language {
  return value === "en" || value === "sv" || value === "es" || value === "fr" || value === "zh";
}

/** First supported preference wins, including regional/script variants. */
export function resolveDeviceLanguage(preferences: readonly unknown[]): Language {
  for (const value of preferences) {
    if (typeof value !== "string") continue;
    try {
      const canonical = Intl.getCanonicalLocales(value.trim())[0];
      const base = canonical?.split("-")[0];
      if (isLanguage(base)) return base;
    } catch { /* Invalid language tags are not a preference. */ }
  }
  return "en";
}

export function getDeviceLanguage(): Language {
  if (typeof window === "undefined") return "en";
  try {
    const navigator = window.navigator;
    return resolveDeviceLanguage([
      ...(Array.isArray(navigator?.languages) ? navigator.languages : []),
      navigator?.language,
    ]);
  } catch { return "en"; }
}

export function readLanguagePreference(): Language | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isLanguage(stored) ? stored : null;
  } catch { return null; }
}

export function isSwedishMarketPath(pathname: string): boolean {
  return pathname === "/se" || pathname.startsWith("/se/");
}

export function languageForPath(preferred: Language, pathname: string): Language {
  return isSwedishMarketPath(pathname) ? "sv" : preferred;
}
