import { z } from "zod";
import { SOCIAL_PLATFORMS, NAME_PACKAGE_REQUIRED_TLD_LIMIT } from "./name-packages.js";
import { NAME_PACKAGE_MARKET_CODES } from "./name-package-markets.js";
import { BRAND_NAME_LANGUAGES } from "./name-languages.js";

/** Project briefs are user input, not generated advice, current quotes or watches. */
export const NAME_PROJECT_LIMIT = 50;
export const NAME_PROJECT_SHORTLIST_LIMIT = 100;
export const NAME_PROJECT_BRAND_SHORTLIST_LIMIT = 25;
// Keep legacy Chinese project briefs while adding every explicit package language.
export const NAME_PROJECT_LANGUAGES = [...BRAND_NAME_LANGUAGES, "zh"] as const;
// PostgreSQL UTF-8/jsonb rejects NUL and unpaired UTF-16 surrogates. Keep a
// malformed draft a 400 validation error, while preserving valid emoji pairs.
function databaseText(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code === 0 || code >= 0xdc00 && code <= 0xdfff) return false;
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++index);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    }
  }
  return true;
}
const text = (max: number, min = 0) => z.string().trim().min(min).max(max)
  .refine(databaseText, "Text contains an unsupported character.");
const domain = z.string().max(253).regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/u);
const cents = z.number().int().min(0).max(100_000_000).nullable();
/** Saved identity configuration, not ownership, availability, a quote or a score. */
export const brandShortlistEntrySchema = z.object({
  label: z.string().min(1).max(63).regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u),
  // Optional for saved packages created before name-language selection existed.
  // Missing means English; never infer the naming language from the UI locale.
  nameLanguage: z.enum(BRAND_NAME_LANGUAGES).optional(),
  requiredTlds: z.array(z.string().max(190).regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/u))
    .min(1).max(NAME_PACKAGE_REQUIRED_TLD_LIMIT).refine(items => new Set(items).size === items.length),
  platforms: z.array(z.enum(SOCIAL_PLATFORMS)).max(SOCIAL_PLATFORMS.length).refine(items => new Set(items).size === items.length),
  markets: z.array(z.enum(NAME_PACKAGE_MARKET_CODES)).min(1).max(NAME_PACKAGE_MARKET_CODES.length).refine(items => new Set(items).size === items.length),
  note: text(500).optional(),
  source: z.literal("user_supplied"),
}).strict().refine(value => value.requiredTlds.every(tld => `${value.label}.${tld}`.length <= 253));
export type BrandShortlistEntry = z.infer<typeof brandShortlistEntrySchema>;
export function brandShortlistEntryKey(entry: Pick<BrandShortlistEntry, "label" | "nameLanguage">): string {
  return `${entry.label}:${entry.nameLanguage ?? "en"}`;
}
const brandShortlist = z.array(brandShortlistEntrySchema).max(NAME_PROJECT_BRAND_SHORTLIST_LIMIT)
  .refine(items => new Set(items.map(brandShortlistEntryKey)).size === items.length, "Save each brand name once per naming language in a project.");
export const nameProjectBriefSchema = z.object({
  title: text(120, 1),
  description: text(2000),
  audience: text(500),
  desiredStyle: text(500),
  languages: z.array(z.enum(NAME_PROJECT_LANGUAGES)).min(1).max(NAME_PROJECT_LANGUAGES.length)
    .refine(items => new Set(items).size === items.length, "Choose each language once."),
  budget: z.object({
    currency: z.enum(["USD", "EUR", "SEK", "GBP"]),
    maxFirstYearCents: cents,
    maxAnnualRenewalCents: cents,
  }).strict(),
  archived: z.boolean(),
  // Optional for existing rows and old clients. Omission on an update preserves
  // the stored shortlist; an explicit [] is an intentional removal.
  brandShortlist: brandShortlist.optional(),
}).strict();
export const nameProjectInputSchema = nameProjectBriefSchema.extend({
  id: z.string().uuid().transform(value => value.toLowerCase()),
  expectedVersion: z.number().int().min(0).max(2_147_483_645),
  // Use canonical ASCII names returned by saved-domains. No URL or availability
  // claim can be smuggled into a shortlist reference.
  shortlistDomains: z.array(domain).max(NAME_PROJECT_SHORTLIST_LIMIT)
    .refine(items => new Set(items).size === items.length, "Choose each domain once."),
}).strict();
export const nameProjectSchema = nameProjectBriefSchema.extend({
  id: z.string().uuid(),
  version: z.number().int().min(1).max(2_147_483_646),
  shortlistDomains: z.array(domain).max(NAME_PROJECT_SHORTLIST_LIMIT),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();
export type NameProjectInput = z.infer<typeof nameProjectInputSchema>;
export type NameProject = z.infer<typeof nameProjectSchema>;
