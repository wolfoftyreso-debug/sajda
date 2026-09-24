import { parse } from "tldts";
import { z } from "zod/v4";
import {
  buildNamePackages, NAME_PACKAGE_EVIDENCE_MAX_AGE_MS, NAME_PACKAGE_LIMIT,
  NAME_PACKAGE_METHODOLOGY_VERSION, NAME_PACKAGE_REQUIRED_TLD_LIMIT,
  packageSocialUrl, SOCIAL_PLATFORMS,
  type NamePackage, type PackageDomainInput, type PackageReasonCode, type SocialPlatform,
} from "./name-packages.js";
// This module is pure: these public request-contract constants contain no runtime credentials or I/O.
import { NAMES_API_MAX_EXACT_DOMAINS, NAMES_API_TLDS } from "../api/_shared/names-contract.js";
import { buildNamePackageMarketCoverage, DEFAULT_NAME_PACKAGE_MARKETS, NAME_PACKAGE_MARKET_CODES,
  namePackageMarketCoverageSchema } from "./name-package-markets.js";
import { candidateBrandIndexSchema, getNamePackageBrandIndex } from "./brand-candidate-index.js";

export const NAME_PACKAGE_INTELLIGENCE_SCHEMA_VERSION = "sajda.name-package-intelligence.v1" as const;
const LIMITATIONS = [
  "name_candidate_not_registered_company_identity",
  "heuristic_fit_not_calibrated_probability",
  "domain_availability_can_change",
  "social_registration_not_checked",
  "company_registration_not_checked",
  "trademark_rights_not_checked",
  "not_a_valuation_or_investment_prediction",
  "prices_not_assessed",
  "automated_rechecks_limited_to_supported_extensions",
] as const;
const REASON_CODES = [
  "compact_name", "readable_name", "long_name", "digits_in_name", "hyphen_in_name", "idn_needs_review",
  "domain_verified_available", "domain_taken", "domain_check_required", "domain_evidence_expired",
  "social_profile_found", "social_no_profile_not_availability", "social_checks_pending", "social_format_mismatch",
  "company_check_required", "trademark_check_required", "not_a_valuation",
] as const;
const timestamp = z.string().datetime({ offset: true });
const score = z.number().int().min(0).max(100);
const evidenceId = z.string().min(1).max(420);
const canonicalName = z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u);
const domainName = z.string().min(3).max(253);
const supportedExactDomain = z.string().regex(new RegExp(`^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.(${NAMES_API_TLDS.join("|")})$`, "u"));
const maximumCheckBatches = Math.ceil(NAMES_API_TLDS.length / NAMES_API_MAX_EXACT_DOMAINS);
const secondsLimit = NAME_PACKAGE_EVIDENCE_MAX_AGE_MS / 1000;

function isSafeSource(value: string): boolean {
  if (/^[a-zA-Z][a-zA-Z0-9._:-]{0,119}$/u.test(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash
      && !url.port && ![...value].some(character => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127);
  } catch { return false; }
}
const source = z.string().min(1).max(512).refine(isSafeSource);
const freshnessSchema = z.strictObject({
  status: z.enum(["fresh", "stale", "future", "unknown"]),
  based_on: z.literal("observed_at"),
  age_seconds: z.number().int().nonnegative().nullable(),
  max_age_seconds: z.literal(secondsLimit),
});
const provenance = {
  source: source.nullable(), observed_at: timestamp.nullable(), verified_at: z.null(), confidence: z.null(),
  freshness: freshnessSchema,
};
const domainEvidenceSchema = z.strictObject({
  evidence_id: evidenceId, domain: domainName,
  classification: z.enum(["OBSERVED", "UNVERIFIED", "DERIVED"]),
  status: z.enum(["available", "taken", "unknown", "checking"]),
  authoritative: z.boolean(), check_method: z.enum(["rdap", "whois", "das", "dns", "none", "error"]),
  naming_score: z.strictObject({ classification: z.literal("DERIVED"), value: score.nullable() }),
  recheck_supported: z.boolean(),
  requested_alternative: z.boolean(), ...provenance,
});
const socialEvidenceSchema = z.strictObject({
  evidence_id: evidenceId, platform: z.enum(SOCIAL_PLATFORMS), handle: z.string().max(100).nullable(),
  classification: z.literal("UNVERIFIED"), status: z.literal("not_checked"), registration_status: z.literal("unknown"),
  format_assessment: z.strictObject({ classification: z.literal("DERIVED"), supported_format: z.boolean() }),
  ...provenance,
});
const registryEvidenceSchema = z.strictObject({
  evidence_id: evidenceId, classification: z.literal("UNVERIFIED"), status: z.literal("not_checked"), ...provenance,
});
const partSchema = (maximum: number) => z.strictObject({ score: z.number().int().min(0).max(maximum), maximum: z.literal(maximum) });
const indexSchema = z.strictObject({
  name: z.literal("name_package_readiness"), classification: z.literal("DERIVED"),
  score: score.max(70), maximum: z.literal(100), current_attainable_maximum: z.literal(70),
  name_fit_score: score, evidence_coverage_percent: score.describe("Coverage of evidence categories; this is not the percentage of selected countries checked or cleared."),
  score_parts: z.strictObject({ fit: partSchema(40), domains: partSchema(30), socials: partSchema(20), company: partSchema(5), trademark: partSchema(5) }),
  risk_penalty: z.number().int().min(0).max(20), limitations: z.array(z.enum(LIMITATIONS)).min(LIMITATIONS.length).max(LIMITATIONS.length),
});
const signalSchema = z.strictObject({
  code: z.enum(REASON_CODES), classification: z.literal("DERIVED"), evidence_ids: z.array(evidenceId).max(1040),
});
const actionSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("domains_check"), domains: z.array(supportedExactDomain).min(1).max(NAMES_API_MAX_EXACT_DOMAINS), automatic: z.literal(false) }),
  z.strictObject({ type: z.literal("manual_profile_check"), platform: z.enum(SOCIAL_PLATFORMS), handle: z.string().min(1).max(100),
    url: z.string().url().max(512), manual: z.literal(true) }),
]);
const packageSchema = z.strictObject({
  entity_id: z.string().regex(/^name-package:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u),
  canonical_name: canonicalName, entity_type: z.literal("name_candidate"), country: z.null(), canonical_url: z.null(),
  rank: z.number().int().min(1).max(NAME_PACKAGE_LIMIT), index: indexSchema,
  brand_index: candidateBrandIndexSchema.describe("Sajda Brand Index candidate mode. This is package readiness, not verified ownership, existing-brand presence, legal clearance or valuation."),
  evidence: z.strictObject({ domains: z.array(domainEvidenceSchema).min(1).max(1032), socials: z.array(socialEvidenceSchema).max(SOCIAL_PLATFORMS.length),
    company: registryEvidenceSchema, trademark: registryEvidenceSchema }),
  signals: z.array(signalSchema).max(REASON_CODES.length), price_assessment: z.strictObject({ status: z.literal("not_assessed") }),
  available_actions: z.array(actionSchema).max(maximumCheckBatches + SOCIAL_PLATFORMS.length),
});

/** Closed JSON contract: engine metadata, prompts, accounts and arbitrary URLs do not pass through. */
export const namePackageIntelligenceSchema = z.strictObject({
  schema_version: z.literal(NAME_PACKAGE_INTELLIGENCE_SCHEMA_VERSION),
  methodology_version: z.literal(NAME_PACKAGE_METHODOLOGY_VERSION),
  generated_at: timestamp, requested_count: z.number().int().min(1).max(NAME_PACKAGE_LIMIT),
  market_coverage: namePackageMarketCoverageSchema.describe("Versioned manual company and trademark review plan. Source catalog review dates are not observations about a candidate name; no country checks have been performed."),
  returned_count: z.number().int().min(0).max(NAME_PACKAGE_LIMIT), packages: z.array(packageSchema).max(NAME_PACKAGE_LIMIT),
});
export type NamePackageIntelligence = z.infer<typeof namePackageIntelligenceSchema>;

/** Public descriptor for clients; scores are never calibrated confidence or valuations. */
export const NAME_PACKAGE_INTELLIGENCE_METHODOLOGY = Object.freeze({
  schema_version: NAME_PACKAGE_INTELLIGENCE_SCHEMA_VERSION,
  methodology_version: NAME_PACKAGE_METHODOLOGY_VERSION,
  maximum: 100, current_attainable_maximum: 70,
  score_weights: Object.freeze({ fit: 40, domains: 30, socials: 20, company: 5, trademark: 5 }),
  observation_max_age_seconds: secondsLimit, limitations: Object.freeze([...LIMITATIONS]),
  supported_domains_check_tlds: Object.freeze([...NAMES_API_TLDS]), domain_check_batch_size: NAMES_API_MAX_EXACT_DOMAINS,
});

function isRequiredSuffix(value: string): boolean {
  const suffix = value.trim().toLowerCase().replace(/^\./u, "");
  if (!suffix || !suffix.split(".").every(part => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(part))) return false;
  const probe = `sajdapackagecheck.${suffix}`, parsed = parse(probe, { allowPrivateDomains: true });
  return parsed.isIcann === true && !parsed.isPrivate && parsed.publicSuffix === suffix
    && parsed.domain === probe && parsed.domainWithoutSuffix === "sajdapackagecheck" && !parsed.subdomain;
}
const optionsSchema = z.strictObject({
  platforms: z.array(z.enum(SOCIAL_PLATFORMS)).max(SOCIAL_PLATFORMS.length).refine(values => new Set(values).size === values.length),
  requiredTlds: z.array(z.string().min(1).max(253).refine(isRequiredSuffix)).max(NAME_PACKAGE_REQUIRED_TLD_LIMIT),
  markets: z.array(z.enum(NAME_PACKAGE_MARKET_CODES)).min(1).max(NAME_PACKAGE_MARKET_CODES.length)
    .refine(values => new Set(values).size === values.length).default(() => [...DEFAULT_NAME_PACKAGE_MARKETS]),
  limit: z.number().int().min(1).max(NAME_PACKAGE_LIMIT).optional(),
  now: z.number().int().min(0).max(253_402_300_799_999).optional(),
});
// Strip extra raw fields deliberately, but never coerce malformed trusted fields.
const rawPayloadSchema = z.object({ results: z.array(z.object({
  domain: domainName, status: z.enum(["available", "taken", "unknown", "checking"]), authoritative: z.boolean(),
  checkMethod: z.enum(["rdap", "whois", "das", "dns", "none", "error"]),
  source: source.nullable().optional(), checkedAt: timestamp.nullable().optional(),
  namingScore: score.optional(),
})).max(1000) });

function freshness(observedAt: string | null, now: number): z.infer<typeof freshnessSchema> {
  if (observedAt === null) return { status: "unknown", based_on: "observed_at", age_seconds: null, max_age_seconds: secondsLimit };
  const elapsed = now - Date.parse(observedAt);
  return { status: elapsed < 0 ? "future" : elapsed > NAME_PACKAGE_EVIDENCE_MAX_AGE_MS ? "stale" : "fresh",
    based_on: "observed_at", age_seconds: elapsed < 0 ? null : Math.floor(elapsed / 1000), max_age_seconds: secondsLimit };
}
function unknownProvenance(now: number) {
  return { source: null, observed_at: null, verified_at: null, confidence: null, freshness: freshness(null, now) };
}
function signalEvidence(code: PackageReasonCode, ids: { domains: string[]; socials: string[]; company: string; trademark: string }): string[] {
  if (code.startsWith("social_")) return ids.socials;
  if (code.startsWith("company_")) return [ids.company];
  if (code.startsWith("trademark_")) return [ids.trademark];
  return ids.domains;
}
function projectPackage(pkg: NamePackage, rank: number, now: number): z.infer<typeof packageSchema> {
  const entity = `name-package:${pkg.label}`;
  const domains = pkg.domains.map(domain => {
    const observedAt = domain.checkedAt ?? null;
    const age = freshness(observedAt, now);
    return {
      evidence_id: `${entity}:domain:${domain.domain}`, domain: domain.domain,
      classification: domain.requestedAlternative ? "DERIVED" as const : observedAt && age.status !== "future" ? "OBSERVED" as const : "UNVERIFIED" as const,
      status: domain.status, authoritative: domain.availabilityVerified,
      check_method: domain.checkMethod as "rdap" | "whois" | "das" | "dns" | "none" | "error",
      naming_score: { classification: "DERIVED" as const, value: domain.namingScore ?? null },
      recheck_supported: supportedExactDomain.safeParse(domain.domain).success,
      requested_alternative: domain.requestedAlternative === true, source: domain.source ?? null,
      observed_at: observedAt, verified_at: null, confidence: null, freshness: age,
    };
  });
  const socials = pkg.socials.map(social => ({
    evidence_id: `${entity}:social:${social.platform}:${social.handle ?? "unsupported"}`, platform: social.platform, handle: social.handle,
    classification: "UNVERIFIED" as const, status: "not_checked" as const, registration_status: "unknown" as const,
    format_assessment: { classification: "DERIVED" as const, supported_format: social.formatValid }, ...unknownProvenance(now),
  }));
  const company = { evidence_id: `${entity}:company-name`, classification: "UNVERIFIED" as const, status: "not_checked" as const, ...unknownProvenance(now) };
  const trademark = { evidence_id: `${entity}:trademark`, classification: "UNVERIFIED" as const, status: "not_checked" as const, ...unknownProvenance(now) };
  const evidenceIds = { domains: domains.map(item => item.evidence_id), socials: socials.map(item => item.evidence_id), company: company.evidence_id, trademark: trademark.evidence_id };
  const checkable = domains.filter(domain => domain.recheck_supported).map(domain => domain.domain);
  const domainActions: Array<{ type: "domains_check"; domains: string[]; automatic: false }> = [];
  for (let start = 0; start < checkable.length; start += NAMES_API_MAX_EXACT_DOMAINS) {
    domainActions.push({ type: "domains_check", domains: checkable.slice(start, start + NAMES_API_MAX_EXACT_DOMAINS), automatic: false });
  }
  return {
    entity_id: entity, canonical_name: pkg.label, entity_type: "name_candidate", country: null, canonical_url: null, rank,
    brand_index: getNamePackageBrandIndex(pkg, now),
    index: { name: "name_package_readiness", classification: "DERIVED", score: pkg.packageScore, maximum: 100, current_attainable_maximum: 70,
      name_fit_score: pkg.fitScore, evidence_coverage_percent: pkg.evidenceCoverage,
      score_parts: { fit: { score: pkg.scoreParts.fit.score, maximum: 40 }, domains: { score: pkg.scoreParts.domains.score, maximum: 30 },
        socials: { score: pkg.scoreParts.socials.score, maximum: 20 }, company: { score: pkg.scoreParts.company.score, maximum: 5 }, trademark: { score: pkg.scoreParts.trademark.score, maximum: 5 } },
      risk_penalty: pkg.riskPenalty, limitations: [...LIMITATIONS] },
    evidence: { domains, socials, company, trademark },
    signals: pkg.reasonCodes.map(code => ({ code, classification: "DERIVED", evidence_ids: signalEvidence(code, evidenceIds) })),
    price_assessment: { status: "not_assessed" },
    available_actions: [
      ...domainActions,
      ...pkg.socials.flatMap(social => {
        const url = social.handle ? packageSocialUrl(social.platform, social.handle) : null;
        return url && social.handle ? [{ type: "manual_profile_check" as const, platform: social.platform, handle: social.handle, url, manual: true as const }] : [];
      }),
    ],
  };
}

/**
 * Pure trust projection. A generation timestamp is never observation evidence.
 * Only row-level dates enter the shared scorer; missing dates explicitly disable
 * its legacy receipt-time fallback. This function performs no network checks.
 */
export function projectNamePackageIntelligence(rawEnginePayload: unknown, options: {
  platforms: SocialPlatform[]; requiredTlds: string[]; markets?: readonly string[]; limit?: number; now?: number;
}): NamePackageIntelligence {
  try {
    const parsedOptions = optionsSchema.parse(options);
    const raw = rawPayloadSchema.parse(rawEnginePayload);
    const now = parsedOptions.now ?? Date.now(), requestedCount = parsedOptions.limit ?? NAME_PACKAGE_LIMIT;
    const domains: PackageDomainInput[] = raw.results.map(row => ({ domain: row.domain, status: row.status,
      availabilityVerified: row.authoritative, checkMethod: row.checkMethod,
      checkedAt: row.checkedAt ?? null, ...(row.source ? { source: row.source } : {}),
      ...(row.namingScore === undefined ? {} : { namingScore: row.namingScore }),
    }));
    // Reuse the engine's registrable-domain/IDNA acceptance, never a looser URL parser.
    for (const domain of domains) if (buildNamePackages([domain], { platforms: [], requiredTlds: [], observedAt: null, now, limit: 1 }).length !== 1) throw new Error();
    const packages = buildNamePackages(domains, { platforms: parsedOptions.platforms, requiredTlds: parsedOptions.requiredTlds,
      observedAt: null, now, limit: requestedCount });
    if (domains.length && !packages.length) throw new Error();
    return namePackageIntelligenceSchema.parse({ schema_version: NAME_PACKAGE_INTELLIGENCE_SCHEMA_VERSION,
      methodology_version: NAME_PACKAGE_METHODOLOGY_VERSION, generated_at: new Date(now).toISOString(),
      market_coverage: buildNamePackageMarketCoverage(parsedOptions.markets),
      requested_count: requestedCount, returned_count: packages.length, packages: packages.map((pkg, index) => projectPackage(pkg, index + 1, now)),
    });
  } catch {
    // Do not expose malformed provider data, user briefs or raw Zod issue values.
    throw new Error("Name package intelligence could not be produced.");
  }
}
