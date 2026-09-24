import { z } from "zod/v4";
import { SOCIAL_PLATFORMS } from "../../shared/name-packages.js";
import { AccountAccessError } from "./account-error.js";
import { NAMES_API_PROVIDERS, NAMES_API_TLDS } from "./names-contract.js";
import { DEFAULT_NAME_PACKAGE_MARKETS, NAME_PACKAGE_MARKET_CODES } from "../../shared/name-package-markets.js";
import { BRAND_NAME_LANGUAGES } from "../../shared/name-languages.js";

/** Shared, bounded non-AI contract for REST, MCP and their direct executors. */
export const namePackageSearchSchema = z.object({
  query: z.string().trim().min(1).max(100),
  tlds: z.array(z.enum(NAMES_API_TLDS)).min(1).max(NAMES_API_TLDS.length)
    .refine(values => new Set(values).size === values.length, "Use unique TLDs."),
  platforms: z.array(z.enum(SOCIAL_PLATFORMS)).min(1).max(SOCIAL_PLATFORMS.length)
    .refine(values => new Set(values).size === values.length, "Use unique social platforms."),
  markets: z.array(z.enum(NAME_PACKAGE_MARKET_CODES)).min(1).max(NAME_PACKAGE_MARKET_CODES.length)
    .refine(values => new Set(values).size === values.length, "Use unique supported market codes.")
    .meta({ uniqueItems: true }).default(() => [...DEFAULT_NAME_PACKAGE_MARKETS])
    .describe("Markets for manual company and trademark review. Omit for the United States and all 27 EU countries. No market checks are performed."),
  count: z.number().int().min(1).max(10).default(10),
  locale: z.enum(["en", "sv", "es", "fr", "zh"]).default("en"),
  nameLanguage: z.enum(BRAND_NAME_LANGUAGES).default("en")
    .describe("Language of generated names, independent of interface locale or review markets. Defaults to English. Accents are transliterated for domain labels; exact names are not translated."),
  providers: z.array(z.enum(NAMES_API_PROVIDERS)).min(1).max(NAMES_API_PROVIDERS.length)
    .refine(values => new Set(values).size === values.length, "Use unique provider IDs.").optional(),
}).strict();

export type NamePackageSearchRequest = z.infer<typeof namePackageSearchSchema>;

export function parseNamePackageSearchRequest(value: unknown): NamePackageSearchRequest {
  const result = namePackageSearchSchema.safeParse(value);
  if (!result.success) throw new AccountAccessError("invalid_request", 400,
    "Use a brief query, unique supported TLDs and social platforms, optional unique supported market codes, and a count from 1 to 10.");
  return result.data;
}
