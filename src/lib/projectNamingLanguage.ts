import { BRAND_NAME_LANGUAGES, type BrandNameLanguage } from "../../shared/name-languages";
import type { NameProject } from "../../shared/name-projects";

/** A project can express more languages than one generation request supports.
 * Keep those requirements intact; English is only an internal draft fallback,
 * never implicit permission to replace unsupported or multiple preferences. */
export function projectNamingLanguage(languages: readonly NameProject["languages"][number][] | null): {
  initialLanguage: BrandNameLanguage;
  requiresChoice: boolean;
  unsupported: boolean;
} {
  const single = languages?.length === 1 ? BRAND_NAME_LANGUAGES.find(value => value === languages[0]) : undefined;
  return {
    initialLanguage: single ?? "en",
    requiresChoice: Boolean(languages?.length && !single),
    unsupported: Boolean(languages?.some(value => !BRAND_NAME_LANGUAGES.includes(value as BrandNameLanguage))),
  };
}
