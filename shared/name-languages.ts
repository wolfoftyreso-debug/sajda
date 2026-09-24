/** The language of a generated name, independent of interface/report locale. */
export const BRAND_NAME_LANGUAGES = ["en", "sv", "fr", "es", "de", "it", "pt"] as const;
export type BrandNameLanguage = typeof BRAND_NAME_LANGUAGES[number];
export const NAME_LANGUAGES = ["auto", ...BRAND_NAME_LANGUAGES, "mixed"] as const;
export type NameLanguage = typeof NAME_LANGUAGES[number];
export const NAME_LANGUAGE_LABELS: Record<BrandNameLanguage, string> = {
  en: "English", sv: "Swedish", fr: "French", es: "Spanish", de: "German", it: "Italian", pt: "Portuguese",
};
export function isBrandNameLanguage(value: unknown): value is BrandNameLanguage {
  return typeof value === "string" && (BRAND_NAME_LANGUAGES as readonly string[]).includes(value);
}
