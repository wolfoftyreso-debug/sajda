import { namePackageIntelligenceSchema } from "../../shared/name-package-intelligence.js";
import { buildBusinessNameSummary, eligibleBusinessDomains } from "../../shared/business-name-summary.js";
import { generateConnectorCandidates, summarizeConnectorBusinessBrief } from "./connector-candidates.js";
import { AccountAccessError } from "./account-error.js";
import { type NamePackageSearchRequest } from "./name-package-contract.js";
import { BUSINESS_NAMES_CANDIDATE_LIMIT, BUSINESS_NAMES_METHODOLOGY_VERSION, BUSINESS_NAMES_SCHEMA_VERSION,
  businessNamesResultSchema, parseBusinessNamesRequest, type BusinessNamesResult } from "./business-names-contract.js";

export type BusinessNamesSearch = (input: NamePackageSearchRequest) => Promise<unknown>;

/** One ordinary package operation: existing quota, availability providers and
 * evidence projection remain authoritative. No nested retry/AI/search budget. */
export async function executeBusinessNamesRecommendation(value: unknown, search: BusinessNamesSearch): Promise<BusinessNamesResult> {
  const input = parseBusinessNamesRequest(value);
  let brief: ReturnType<typeof summarizeConnectorBusinessBrief>;
  try { brief = summarizeConnectorBusinessBrief(input.businessDescription, input.keywords); }
  catch { throw new AccountAccessError("invalid_request", 400, "Describe the business with meaningful Latin-letter keywords."); }
  const request: NamePackageSearchRequest = {
    query: brief.query, tlds: input.tlds, platforms: input.platforms, markets: input.markets,
    count: BUSINESS_NAMES_CANDIDATE_LIMIT, nameLanguage: input.nameLanguage, locale: input.locale,
    ...(input.providers ? { providers: input.providers } : {}),
  };
  const naming = generateConnectorCandidates({ query: request.query, tlds: request.tlds, nameLanguage: request.nameLanguage, count: 120 })
    .slice(0, BUSINESS_NAMES_CANDIDATE_LIMIT);
  const namingByLabel = new Map(naming.map(candidate => [candidate.label, candidate]));
  if (!naming.length) throw new AccountAccessError("invalid_request", 400, "Describe the business with more specific naming keywords.");
  const intelligence = namePackageIntelligenceSchema.parse(await search(request));
  if (intelligence.packages.some(pkg => !namingByLabel.has(pkg.canonical_name))
    || intelligence.requested_count !== BUSINESS_NAMES_CANDIDATE_LIMIT
    || intelligence.returned_count !== intelligence.packages.length
    || new Set(intelligence.packages.map(pkg => pkg.canonical_name)).size !== intelligence.packages.length) throw new Error("Business-name evidence did not match its bounded candidate search.");
  const eligible = intelligence.packages.flatMap(pkg => {
    const available = eligibleBusinessDomains(pkg, input.tlds);
    return available.length ? [{ pkg, available, naming: namingByLabel.get(pkg.canonical_name)! }] : [];
  }).sort((a, b) => b.pkg.brand_index.score - a.pkg.brand_index.score
    || b.pkg.brand_index.nameFitScore - a.pkg.brand_index.nameFitScore
    || b.naming.namingScore - a.naming.namingScore || (a.pkg.canonical_name < b.pkg.canonical_name ? -1 : 1));
  const recommendations = eligible.slice(0, input.count).map(({ pkg, available, naming: candidate }, index) => ({
    rank: index + 1, name: pkg.canonical_name,
    rationale: { classification: "DERIVED" as const, naming_direction: candidate.direction,
      explanation: candidate.rationale, naming_score: candidate.namingScore },
    available_domains: available.map(domain => domain.domain), package: pkg,
  }));
  const returned = recommendations.length;
  return businessNamesResultSchema.parse({
    schema_version: BUSINESS_NAMES_SCHEMA_VERSION, generated_at: intelligence.generated_at,
    methodology: { version: BUSINESS_NAMES_METHODOLOGY_VERSION, generation: "deterministic_language_rules",
      ranking: "sajda_brand_index_then_name_fit_then_naming_heuristic",
      eligibility: "at_least_one_fresh_authoritative_available_requested_domain",
      candidate_limit: BUSINESS_NAMES_CANDIDATE_LIMIT, exhaustive: false, ai_used: false,
      limitations: ["Rules interpret up to two recognized business topics; this is not an exhaustive or native-language editorial review.",
        "Recommendations require one requested domain observed available; other endings may be taken or unknown.",
        "Company names, trademarks and social registration are not checked or cleared.",
        "Sajda Brand Index is a versioned candidate-readiness heuristic, not confidence, valuation or legal advice.",
        "Prices and affordability are not assessed. No name is registered, reserved, saved or purchased.",
        "Availability can change after the evidence observation time."],
    },
    requirements: { classification: "USER_SUPPLIED", business_description: input.businessDescription,
      keywords: input.keywords, name_language: input.nameLanguage, locale: input.locale,
      tlds: input.tlds, platforms: input.platforms, markets: input.markets },
    brief_interpretation: { classification: "DERIVED", ...brief },
    requested_count: input.count, returned_count: returned,
    completeness: returned === input.count ? "complete" : returned ? "partial" : "none",
    shortfall_reason: returned === input.count ? null : returned ? "insufficient_fresh_available_domains" : "no_fresh_available_domains",
    result_summary: buildBusinessNameSummary({ locale: input.locale, requestedCount: input.count, returnedCount: returned,
      candidateLimit: BUSINESS_NAMES_CANDIDATE_LIMIT, generatedCount: naming.length, tlds: input.tlds, intelligence }),
    recommendations, intelligence,
  });
}
