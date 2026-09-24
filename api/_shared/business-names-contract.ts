import { z } from "zod/v4";
import { namePackageIntelligenceSchema } from "../../shared/name-package-intelligence.js";
import { businessNameSummarySchema, buildBusinessNameSummary } from "../../shared/business-name-summary.js";
import { namePackageSearchSchema } from "./name-package-contract.js";
import { AccountAccessError } from "./account-error.js";

export const BUSINESS_NAMES_SCHEMA_VERSION = "sajda.business-names.v1" as const;
export const BUSINESS_NAMES_METHODOLOGY_VERSION = "business-names-1.0.1" as const;
export const BUSINESS_NAMES_CANDIDATE_LIMIT = 10;
const plainText = (value: string) => !/[<>\p{Default_Ignorable_Code_Point}]/u.test(value)
  && !Array.from(value).some(character => {
    const point = character.codePointAt(0)!;
    return point < 32 && ![9, 10, 13].includes(point) || point === 127 || point >= 0xd800 && point <= 0xdfff;
  });

/** No hidden AI, quoted budget, account mutation or caller-supplied evidence. */
export const businessNamesRequestSchema = z.strictObject({
  businessDescription: z.string().trim().min(1).max(1000).refine(plainText, "Use plain text without markup or invisible controls.")
    .describe("Describe what the business does, its audience and desired tone. The complete description is considered by a bounded, deterministic naming heuristic, not an AI or legal assessment."),
  keywords: z.array(z.string().trim().min(1).max(40).refine(plainText)
    .regex(/^[\p{Script=Latin}\p{M} -]+$/u)).max(8)
    .refine(values => new Set(values.map(value => value.toLowerCase())).size === values.length, "Use unique keywords.")
    .default(() => []),
  nameLanguage: namePackageSearchSchema.shape.nameLanguage,
  locale: namePackageSearchSchema.shape.locale,
  tlds: namePackageSearchSchema.shape.tlds.default(() => ["com" as const]),
  platforms: namePackageSearchSchema.shape.platforms.default(() => ["instagram" as const, "linkedin" as const]),
  markets: namePackageSearchSchema.shape.markets,
  count: namePackageSearchSchema.shape.count,
  providers: namePackageSearchSchema.shape.providers,
});
export type BusinessNamesRequest = z.infer<typeof businessNamesRequestSchema>;

export function parseBusinessNamesRequest(value: unknown): BusinessNamesRequest {
  const parsed = businessNamesRequestSchema.safeParse(value);
  if (!parsed.success) throw new AccountAccessError("invalid_request", 400,
    "Describe the business in 1–1000 characters, with up to eight unique keywords and a count from 1 to 10. Use supported languages, markets, endings and platforms.");
  return parsed.data;
}

const packageSchema = namePackageIntelligenceSchema.shape.packages.element;
const rationaleSchema = z.strictObject({
  classification: z.literal("DERIVED"),
  naming_direction: z.enum(["benefit", "descriptive", "metaphor", "audience", "brandable", "host_seed"]),
  explanation: z.string().min(1).max(1500),
  naming_score: z.number().int().min(0).max(100),
});
export const businessNamesResultSchema = z.strictObject({
  schema_version: z.literal(BUSINESS_NAMES_SCHEMA_VERSION),
  generated_at: z.string().datetime({ offset: true }),
  methodology: z.strictObject({
    version: z.literal(BUSINESS_NAMES_METHODOLOGY_VERSION),
    generation: z.literal("deterministic_language_rules"),
    ranking: z.literal("sajda_brand_index_then_name_fit_then_naming_heuristic"),
    eligibility: z.literal("at_least_one_fresh_authoritative_available_requested_domain"),
    candidate_limit: z.literal(BUSINESS_NAMES_CANDIDATE_LIMIT),
    exhaustive: z.literal(false), ai_used: z.literal(false),
    limitations: z.array(z.string()).min(1).max(12),
  }),
  requirements: z.strictObject({
    classification: z.literal("USER_SUPPLIED"), business_description: z.string().max(1000),
    keywords: z.array(z.string().max(40)).max(8),
    name_language: namePackageSearchSchema.shape.nameLanguage,
    locale: namePackageSearchSchema.shape.locale,
    tlds: namePackageSearchSchema.shape.tlds,
    platforms: namePackageSearchSchema.shape.platforms,
    markets: namePackageSearchSchema.shape.markets,
  }),
  brief_interpretation: z.strictObject({
    classification: z.literal("DERIVED"), query: z.string().min(1).max(100),
    included_terms: z.array(z.string().min(1).max(20)).min(1).max(50),
    omitted_term_count: z.number().int().nonnegative(),
    recognized_topics: z.array(z.strictObject({ id: z.string(), label: z.string(), matched_terms: z.array(z.string()).min(1).max(300) })).max(2),
  }),
  requested_count: z.number().int().min(1).max(10),
  returned_count: z.number().int().min(0).max(10),
  completeness: z.enum(["complete", "partial", "none"]),
  shortfall_reason: z.enum(["insufficient_fresh_available_domains", "no_fresh_available_domains"]).nullable(),
  result_summary: businessNameSummarySchema.describe("Display the localized headline, explanation and next steps before the recommendations. Never hide a shortfall or classify unconfirmed availability as taken. Counts refer to this bounded candidate pool, not the whole market."),
  recommendations: z.array(z.strictObject({
    rank: z.number().int().min(1).max(10), name: z.string().min(1).max(63),
    rationale: rationaleSchema,
    available_domains: z.array(z.string()).min(1).max(11),
    package: packageSchema,
  })).max(10),
  intelligence: namePackageIntelligenceSchema.describe("Full evidence for all considered candidates, including names not recommended because no requested domain was verified available. Company, trademark and social registration remain unchecked."),
}).superRefine((value, context) => {
  if (value.returned_count !== value.recommendations.length || value.returned_count > value.requested_count
    || value.completeness !== (value.returned_count === value.requested_count ? "complete" : value.returned_count ? "partial" : "none")
    || value.shortfall_reason !== (value.returned_count === value.requested_count ? null : value.returned_count ? "insufficient_fresh_available_domains" : "no_fresh_available_domains")
    || new Set(value.recommendations.map(row => row.name)).size !== value.returned_count
    || value.recommendations.some((row, index) => row.rank !== index + 1 || row.name !== row.package.canonical_name)) {
    context.addIssue({ code: "custom", message: "Recommendation counts, ranks, identity and completeness must agree." });
    return;
  }
  try {
    const expectedSummary = buildBusinessNameSummary({ locale: value.requirements.locale, requestedCount: value.requested_count,
      returnedCount: value.returned_count, candidateLimit: value.methodology.candidate_limit,
      generatedCount: value.result_summary.counts.generated_candidates, tlds: value.requirements.tlds, intelligence: value.intelligence });
    if (JSON.stringify(value.result_summary) === JSON.stringify(expectedSummary)) return;
  } catch (error) {
    // Invalid cross-field evidence must produce a validation issue, not escape safeParse.
    if (!(error instanceof z.ZodError)) throw error;
  }
    context.addIssue({ code: "custom", message: "The user-facing explanation must match the observed result counts and evidence." });
});
export type BusinessNamesResult = z.infer<typeof businessNamesResultSchema>;
