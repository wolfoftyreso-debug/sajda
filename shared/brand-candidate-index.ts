import { z } from "zod/v4";
import { parse } from "tldts";
import {
  applyPackageObservations, buildNamePackages, SOCIAL_PLATFORMS,
  type NamePackage, type PackageNextAction, type SocialObservation,
} from "./name-packages.js";
import { NAMES_API_MAX_EXACT_DOMAINS, NAMES_API_TLDS } from "../api/_shared/names-contract.js";

export const CANDIDATE_BRAND_INDEX_VERSION = "sajda.brand-index.candidate.v1" as const;
export const CANDIDATE_BRAND_INDEX_METHODOLOGY = "sajda-brand-index-candidate-1.0.0" as const;
const part = (maximum: number) => z.strictObject({ score: z.number().int().min(0).max(maximum), max: z.literal(maximum) });
const missingCheck = z.enum(["domain_availability", "company_register", "trademark_register",
  ...SOCIAL_PLATFORMS.map(platform => `social:${platform}` as const)]);
const nextAction = z.strictObject({
  kind: z.enum(["refresh_domains", "review_social", "verify_company", "verify_trademark"]),
  platform: z.enum(SOCIAL_PLATFORMS).optional(), url: z.string().url().optional(),
});

/** The candidate mode is not the existing-brand ownership assessment. Keeping
 * mode, evidence coverage and the attainable ceiling alongside the score makes
 * the distinction machine-readable as well as visible in product surfaces. */
export const candidateBrandIndexSchema = z.strictObject({
  schemaVersion: z.literal(CANDIDATE_BRAND_INDEX_VERSION), methodologyVersion: z.literal(CANDIDATE_BRAND_INDEX_METHODOLOGY),
  mode: z.literal("candidate"), score: z.number().int().min(0).max(70), maximum: z.literal(100), attainableMaximum: z.literal(70),
  nameFitScore: z.number().int().min(0).max(100), evidenceCoverage: z.number().int().min(0).max(100),
  status: z.enum(["conflicts_found", "domains_ready", "checks_needed"]),
  dimensions: z.strictObject({ fit: part(40), domains: part(30), socials: part(20), company: part(5), trademark: part(5) }),
  signals: z.strictObject({ domainCount: z.number().int().nonnegative(), availableDomains: z.number().int().nonnegative(),
    takenDomains: z.number().int().nonnegative(), uncheckedDomains: z.number().int().nonnegative(),
    socialCount: z.number().int().nonnegative(), sameHandleFormats: z.number().int().nonnegative(), observedProfiles: z.number().int().nonnegative() }),
  missingChecks: z.array(missingCheck), nextActions: z.array(nextAction),
  ownershipVerified: z.literal(false), legalClearance: z.literal(false),
});
export type CandidateBrandIndex = z.infer<typeof candidateBrandIndexSchema>;

/** Rebuild from dated observations. Persisted/user-supplied packageScore, fitScore,
 * evidenceCoverage, status and nextActions are never accepted as scoring inputs.
 * This is a pure projection, not an external verification request. */
export function getNamePackageBrandIndex(pkg: NamePackage, now = Date.now()): CandidateBrandIndex {
  const platforms = SOCIAL_PLATFORMS.filter(platform => pkg.socials.some(social => social.platform === platform));
  const rebuilt = buildNamePackages(pkg.domains, { platforms, observedAt: null, now, limit: 10 })
    .find(candidate => candidate.label === pkg.label);
  if (!rebuilt) throw new Error("A valid name package is required for a candidate Brand Index.");
  const observations = pkg.socials.flatMap(social => social.handle && social.sourceUrl && social.checkedAt
    ? [{ platform: social.platform, handle: social.handle, sourceUrl: social.sourceUrl,
      checkedAt: social.checkedAt, status: social.status } satisfies SocialObservation] : []);
  const current = applyPackageObservations(rebuilt, observations, now);
  const available = current.domains.filter(domain => domain.availabilityVerified && domain.status === "available").length;
  const taken = current.domains.filter(domain => domain.availabilityVerified && domain.status === "taken").length;
  const unchecked = current.domains.length - available - taken;
  const found = current.socials.filter(social => social.status === "profile_found").length;
  // Unfinished domain checks first, then observed identity conflicts, then the
  // remaining company/trademark and platform review actions. No legal points.
  const priority = (action: PackageNextAction): number => action.kind === "refresh_domains" ? 0
    : action.kind === "review_social" && current.socials.some(social => social.platform === action.platform && social.status === "profile_found") ? 1
      : action.kind === "verify_company" ? 2 : action.kind === "verify_trademark" ? 3 : 4;
  return candidateBrandIndexSchema.parse({
    schemaVersion: CANDIDATE_BRAND_INDEX_VERSION, methodologyVersion: CANDIDATE_BRAND_INDEX_METHODOLOGY,
    mode: "candidate", score: current.packageScore, maximum: 100, attainableMaximum: 70,
    nameFitScore: current.fitScore, evidenceCoverage: current.evidenceCoverage,
    status: taken || found ? "conflicts_found" : available > 0 && unchecked === 0 ? "domains_ready" : "checks_needed",
    dimensions: current.scoreParts,
    signals: { domainCount: current.domains.length, availableDomains: available, takenDomains: taken, uncheckedDomains: unchecked,
      socialCount: current.socials.length, sameHandleFormats: current.socials.filter(social => social.formatValid).length, observedProfiles: found },
    missingChecks: current.missingChecks, nextActions: [...current.nextActions].sort((a, b) => priority(a) - priority(b)),
    ownershipVerified: false, legalClearance: false,
  });
}

export interface NamePackageDomainCheckPlan {
  batches: string[][];
  unsupportedDomains: string[];
  checkedDomains: string[];
  requiresChecks: boolean;
}

/** Exact same-name completion plan for the existing authenticated/anonymous
 * domain-check flow. Does no network work and grants no extra quota. A selected
 * compound suffix outside that API remains explicit, never silently replaced. */
export function buildNamePackageDomainCheckPlan(pkg: NamePackage, options: {
  supportedTlds?: readonly string[]; batchSize?: number; onlyMissing?: boolean; now?: number;
} = {}): NamePackageDomainCheckPlan {
  const size = options.batchSize ?? NAMES_API_MAX_EXACT_DOMAINS;
  if (!Number.isInteger(size) || size < 1 || size > NAMES_API_MAX_EXACT_DOMAINS) throw new Error("Use domain-check batches of 1 to 10.");
  const supported = options.supportedTlds ?? NAMES_API_TLDS;
  if (supported.some(tld => !NAMES_API_TLDS.includes(tld as typeof NAMES_API_TLDS[number]))) throw new Error("Use supported domain-check extensions.");
  const current = buildNamePackages(pkg.domains, { platforms: [], observedAt: null, now: options.now, limit: 10 })
    .find(candidate => candidate.label === pkg.label);
  if (!current) throw new Error("A valid name package is required for domain checks.");
  const checkedDomains: string[] = [], unsupportedDomains: string[] = [], needed: string[] = [];
  for (const row of current.domains) {
    const suffix = parse(row.domain, { allowPrivateDomains: false }).publicSuffix;
    if (!suffix || !supported.includes(suffix)) { unsupportedDomains.push(row.domain); continue; }
    const checked = row.availabilityVerified && row.evidenceStatus === "fresh";
    if (checked) checkedDomains.push(row.domain);
    if (!checked || options.onlyMissing === false) needed.push(row.domain);
  }
  const batches: string[][] = [];
  for (let start = 0; start < needed.length; start += size) batches.push(needed.slice(start, start + size));
  return { batches, unsupportedDomains, checkedDomains, requiresChecks: batches.length > 0 || unsupportedDomains.length > 0 };
}
