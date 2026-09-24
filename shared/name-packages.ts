import { parse } from "tldts";
import { z } from "zod";

export const SOCIAL_PLATFORMS = ["instagram", "tiktok", "youtube", "github", "x", "linkedin"] as const;
export type SocialPlatform = typeof SOCIAL_PLATFORMS[number];
export const NAME_PACKAGE_EVIDENCE_MAX_AGE_MS = 30 * 60 * 1000;
export const NAME_PACKAGE_METHODOLOGY_VERSION = "name-package-1.0.0";
export const NAME_PACKAGE_LIMIT = 10;
export const NAME_PACKAGE_REQUIRED_TLD_LIMIT = 32;

/** Conservative syntax only. Platforms may reserve or otherwise reject a handle. */
export function isPackageHandleFormatValid(platform: SocialPlatform, handle: string): boolean {
  if (typeof handle !== "string" || !/^[a-z0-9-]+$/u.test(handle) || handle.startsWith("xn--")) return false;
  switch (platform) {
    case "github": return /^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/u.test(handle) && !handle.includes("--");
    case "instagram": return /^[a-z0-9]{1,30}$/u.test(handle);
    case "tiktok": return /^[a-z0-9]{2,24}$/u.test(handle);
    case "youtube": return /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/u.test(handle);
    case "x": return /^[a-z0-9]{1,15}$/u.test(handle);
    case "linkedin": return /^[a-z][a-z0-9-]{1,98}[a-z0-9]$/u.test(handle);
    default: return false;
  }
}

export function packageSocialUrl(platform: SocialPlatform, handle: string): string | null {
  if (!isPackageHandleFormatValid(platform, handle)) return null;
  const paths: Record<SocialPlatform, string> = {
    instagram: "https://www.instagram.com/", tiktok: "https://www.tiktok.com/@",
    youtube: "https://www.youtube.com/@", github: "https://github.com/",
    x: "https://x.com/", linkedin: "https://www.linkedin.com/company/",
  };
  return `${paths[platform]}${handle}`;
}

function approvedObservationSource(platform: SocialPlatform, handle: string, sourceUrl: string): boolean {
  if (!isPackageHandleFormatValid(platform, handle)) return false;
  return sourceUrl === packageSocialUrl(platform, handle)
    || platform === "github" && sourceUrl === `https://api.github.com/users/${handle}`;
}

/** Observations are profile lookup evidence, never a promise that registration is possible. */
export const socialObservationSchema = z.object({
  platform: z.enum(SOCIAL_PLATFORMS),
  handle: z.string().min(1).max(100),
  status: z.enum(["profile_found", "not_found", "unknown"]),
  checkedAt: z.string().datetime({ offset: true }),
  sourceUrl: z.string().url().max(250),
}).strict().refine(value => approvedObservationSource(value.platform, value.handle, value.sourceUrl),
  "The observation must use the exact handle and an approved source URL.");
export type SocialObservation = z.infer<typeof socialObservationSchema>;

export interface PackageDomainInput {
  domain: string;
  status: "available" | "taken" | "unknown" | "checking";
  availabilityVerified: boolean;
  checkMethod: string;
  /** Actual registry observation time. Explicit null must never use a response receipt time. */
  checkedAt?: string | null;
  source?: string;
  namingScore?: number;
}
export interface PackageOptions {
  platforms: SocialPlatform[];
  /** Extensions of the completed search, not the current editable form. */
  requiredTlds?: readonly string[];
  /** Response receipt time; a legacy fallback only when a row omits checkedAt. */
  observedAt: string | null;
  now?: number;
  limit?: number;
}
export interface PackageDomainEvidence extends PackageDomainInput {
  checkedAt: string | null;
  evidenceStatus: "fresh" | "stale" | "unverified";
  /** Requested identity alternative, never a returned registry observation. */
  requestedAlternative?: true;
}
export interface PackageSocialCandidate {
  platform: SocialPlatform;
  handle: string | null;
  formatValid: boolean;
  status: SocialObservation["status"];
  checkedAt: string | null;
  sourceUrl: string | null;
  alternatives: { handle: string; sourceUrl: string }[];
}
export type PackageReasonCode = "compact_name" | "readable_name" | "long_name" | "digits_in_name"
  | "hyphen_in_name" | "idn_needs_review" | "domain_verified_available" | "domain_taken"
  | "domain_check_required" | "domain_evidence_expired" | "social_profile_found"
  | "social_no_profile_not_availability" | "social_checks_pending" | "social_format_mismatch"
  | "company_check_required" | "trademark_check_required" | "not_a_valuation";
export type PackageMissingCheck = "domain_availability" | "company_register" | "trademark_register" | `social:${SocialPlatform}`;
export interface PackageNextAction {
  kind: "refresh_domains" | "review_social" | "verify_company" | "verify_trademark";
  platform?: SocialPlatform;
  url?: string;
}
interface ScorePart { score: number; max: number }
export interface NamePackage {
  id: string;
  label: string;
  displayName: string;
  domains: PackageDomainEvidence[];
  socials: PackageSocialCandidate[];
  company: { status: "not_checked" };
  trademark: { status: "not_checked" };
  fitScore: number;
  evidenceCoverage: number;
  packageScore: number;
  riskPenalty: number;
  scoreParts: { fit: ScorePart; domains: ScorePart; socials: ScorePart; company: ScorePart; trademark: ScorePart };
  reasonCodes: PackageReasonCode[];
  missingChecks: PackageMissingCheck[];
  nextActions: PackageNextAction[];
  observedAt: string | null;
}

function safeNow(now: number | undefined): number { return typeof now === "number" && Number.isFinite(now) ? now : Date.now(); }
/** Invalid or absent evidence must be represented explicitly, never minted on receipt. */
export function normalizePackageEvidenceTimestamp(value: unknown): string | null {
  return typeof value === "string" && value.length <= 64 && z.string().datetime({ offset: true }).safeParse(value).success
    && Number.isFinite(Date.parse(value)) ? value : null;
}
function timestamp(value: string | null): number | null {
  const valid = normalizePackageEvidenceTimestamp(value);
  return valid === null ? null : Date.parse(valid);
}
function fresh(value: string | null, now: number): boolean {
  const time = timestamp(value);
  return time !== null && time <= now && now - time <= NAME_PACKAGE_EVIDENCE_MAX_AGE_MS;
}
function boundedScore(value: number): number { return Math.max(0, Math.min(100, Math.round(value))); }

function canonicalDomain(input: string): { domain: string; label: string } | null {
  if (typeof input !== "string" || input.length > 253 || input !== input.trim()
    || !/^[\p{L}\p{N}.-]+$/u.test(input)) return null;
  try {
    // URL's IDNA conversion preserves DNS identity; retain its explicit xn-- label,
    // and never invent an ASCII social handle by stripping accents or punctuation.
    const domain = new URL(`https://${input.toLowerCase()}`).hostname;
    if (/[^\u0020-\u007e]/u.test(input.split(".")[0]) && !domain.split(".")[0].startsWith("xn--")) return null;
    if (domain.length > 253 || !domain.split(".").every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(label))) return null;
    const parsed = parse(domain, { allowPrivateDomains: false });
    if (!parsed.isIcann || parsed.isIp || parsed.domain !== domain || !parsed.domainWithoutSuffix || parsed.subdomain) return null;
    return { domain, label: parsed.domainWithoutSuffix };
  } catch { return null; }
}

/** Bounded canonical ICANN suffixes only: neither hosted namespaces nor domains.
 * Invalid requirements invalidate the package build instead of silently awarding
 * full domain points against an incomplete requirement list. */
function requiredSuffixes(value: PackageOptions["requiredTlds"]): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > NAME_PACKAGE_REQUIRED_TLD_LIMIT) return null;
  const suffixes = new Set<string>();
  for (const raw of value) {
    if (typeof raw !== "string" || raw.length > 253) return null;
    const suffix = raw.trim().toLowerCase().replace(/^\./u, "");
    if (!suffix || !suffix.split(".").every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(label))) return null;
    const probe = `sajdapackagecheck.${suffix}`;
    const parsed = parse(probe, { allowPrivateDomains: true });
    if (!parsed.isIcann || parsed.isPrivate || parsed.publicSuffix !== suffix
      || parsed.domain !== probe || parsed.domainWithoutSuffix !== "sajdapackagecheck" || parsed.subdomain) return null;
    suffixes.add(suffix);
  }
  return [...suffixes].sort();
}

function domainEvidence(input: PackageDomainInput, domain: string, observedAt: string | null, now: number): PackageDomainEvidence {
  const checkedAt = normalizePackageEvidenceTimestamp(input.checkedAt === undefined ? observedAt : input.checkedAt);
  const known = input.availabilityVerified === true && ["rdap", "das", "whois"].includes(input.checkMethod)
    && (input.status === "available" || input.status === "taken");
  const current = fresh(checkedAt, now);
  const namingScore = typeof input.namingScore === "number" && Number.isFinite(input.namingScore)
    ? boundedScore(input.namingScore) : undefined;
  return { domain, status: known && current ? input.status : "unknown", availabilityVerified: known && current,
    checkMethod: known ? input.checkMethod : "none", checkedAt,
    ...(typeof input.source === "string" ? { source: input.source } : {}), ...(namingScore === undefined ? {} : { namingScore }),
    evidenceStatus: known && current ? "fresh" : known && checkedAt !== null ? "stale" : "unverified" };
}

function socialCandidate(platform: SocialPlatform, label: string): PackageSocialCandidate {
  const sourceUrl = packageSocialUrl(platform, label);
  // Variants are identity changes offered explicitly, not substitutes in a verified package.
  const alternatives = label.startsWith("xn--") ? [] : [`get${label}`, `try${label}`, `${label}hq`]
    .map(handle => ({ handle, sourceUrl: packageSocialUrl(platform, handle) }))
    .filter((value): value is { handle: string; sourceUrl: string } => value.sourceUrl !== null);
  return { platform, handle: sourceUrl ? label : null, formatValid: sourceUrl !== null, status: "unknown",
    checkedAt: null, sourceUrl, alternatives };
}

/**
 * Explainable fit is only an ASCII length/character heuristic, not pronunciation,
 * company-name clearance, demand, valuation, or a prediction of commercial success.
 * Within the character score, existing naming scores (if supplied) contribute30%
 * and length/character heuristics70%. Final fit then weights that score65% and
 * the fraction of selected platforms accepting the identical handle's conservative
 * format35%. With no platforms selected there is no format component. Syntax
 * matching is not availability evidence and never changes evidence coverage.
 */
function nameFit(label: string, domains: PackageDomainEvidence[], socials: PackageSocialCandidate[]): { fitScore: number; reasons: PackageReasonCode[] } {
  const reasons: PackageReasonCode[] = [];
  if (label.startsWith("xn--")) return { fitScore: 0, reasons: ["idn_needs_review"] };
  let lexical = 100;
  if (label.length >= 4 && label.length <= 12) reasons.push("compact_name");
  if (label.length < 4) lexical -= 10;
  if (label.length > 12) { lexical -= Math.min(55, (label.length - 12) * 3); reasons.push("long_name"); }
  if (/\d/u.test(label)) { lexical -= 15; reasons.push("digits_in_name"); }
  if (label.includes("-")) { lexical -= 15; reasons.push("hyphen_in_name"); }
  if (/^[a-z]+$/u.test(label)) reasons.push("readable_name");
  const scores = domains.map(domain => domain.namingScore).filter((score): score is number => typeof score === "number");
  const characterScore = scores.length ? boundedScore(lexical * 0.7 + scores.reduce((sum, score) => sum + score, 0) / scores.length * 0.3)
    : boundedScore(lexical);
  const fitScore = socials.length
    ? boundedScore(characterScore * 0.65 + 35 * socials.filter(social => social.formatValid).length / socials.length)
    : characterScore;
  return { fitScore, reasons };
}

/**
 * Readiness denominator never omits missing evidence. Max weights: fit40, domain30,
 * social20, company5, trademark5. Current profile-only checks award NO social
 * clearance points, including HTTP404. Thus today's attainable maximum is70/100.
 * Confirmed profile conflicts subtract up to20. Evidence coverage instead counts
 * completed current lookups, not registration availability; company/trademark stay
 * unverified. Domain weight includes actual supplied alternatives AND missing
 * explicitly required extensions, which stay unchecked and award no evidence.
 */
function scorePackage(pkg: NamePackage): NamePackage {
  const { fitScore, reasons } = nameFit(pkg.label, pkg.domains, pkg.socials);
  const verified = pkg.domains.filter(domain => domain.availabilityVerified && domain.evidenceStatus === "fresh");
  const available = verified.filter(domain => domain.status === "available");
  const found = pkg.socials.filter(social => social.status === "profile_found");
  const lookedUp = pkg.socials.filter(social => social.status !== "unknown");
  const riskPenalty = pkg.socials.length ? Math.round(20 * found.length / pkg.socials.length) : 0;
  const fitPoints = Math.round(fitScore * 0.4);
  const domainPoints = pkg.domains.length ? Math.round(30 * available.length / pkg.domains.length) : 0;
  if (available.length) reasons.push("domain_verified_available");
  if (verified.some(domain => domain.status === "taken")) reasons.push("domain_taken");
  if (verified.length !== pkg.domains.length) reasons.push("domain_check_required");
  if (pkg.domains.some(domain => domain.evidenceStatus === "stale")) reasons.push("domain_evidence_expired");
  if (found.length) reasons.push("social_profile_found");
  if (pkg.socials.some(social => social.status === "not_found")) reasons.push("social_no_profile_not_availability");
  if (pkg.socials.some(social => social.status === "unknown")) reasons.push("social_checks_pending");
  if (pkg.socials.some(social => !social.formatValid)) reasons.push("social_format_mismatch");
  reasons.push("company_check_required", "trademark_check_required", "not_a_valuation");
  const missingChecks: PackageMissingCheck[] = [
    ...(verified.length !== pkg.domains.length ? ["domain_availability" as const] : []),
    // A lookup cannot clear registration, even after not_found/profile_found.
    ...pkg.socials.map(social => `social:${social.platform}` as const), "company_register", "trademark_register",
  ];
  const nextActions: PackageNextAction[] = [
    ...(verified.length !== pkg.domains.length ? [{ kind: "refresh_domains" as const }] : []),
    ...pkg.socials.map(social => ({ kind: "review_social" as const, platform: social.platform,
      ...(social.sourceUrl ? { url: packageSocialUrl(social.platform, social.handle!)! } : {}) })),
    { kind: "verify_company" }, { kind: "verify_trademark" },
  ];
  return { ...pkg, fitScore, riskPenalty, packageScore: boundedScore(fitPoints + domainPoints - riskPenalty),
    evidenceCoverage: boundedScore(100 * (verified.length + lookedUp.length) / (pkg.domains.length + pkg.socials.length + 2)),
    scoreParts: { fit: { score: fitPoints, max: 40 }, domains: { score: domainPoints, max: 30 },
      socials: { score: 0, max: 20 }, company: { score: 0, max: 5 }, trademark: { score: 0, max: 5 } },
    reasonCodes: reasons, missingChecks, nextActions };
}

export function buildNamePackages(domains: PackageDomainInput[], options: PackageOptions): NamePackage[] {
  const now = safeNow(options.now);
  const requiredTlds = requiredSuffixes(options.requiredTlds);
  if (requiredTlds === null) return [];
  const groups = new Map<string, Map<string, PackageDomainEvidence>>();
  const platforms = SOCIAL_PLATFORMS.filter(platform => options.platforms.includes(platform));
  for (const input of domains.slice(0, 1000)) {
    if (!input || typeof input !== "object") continue;
    const parsed = canonicalDomain(input.domain);
    if (!parsed) continue;
    const group = groups.get(parsed.label) ?? new Map<string, PackageDomainEvidence>();
    const next = domainEvidence(input, parsed.domain, options.observedAt, now);
    const existing = group.get(parsed.domain);
    // Duplicate data must never multiply evidence or erase a conflict. Least
    // certain status wins; among verified conflicting statuses, taken wins.
    const statusOrder = { unknown: 0, checking: 0, taken: 1, available: 2 };
    if (!existing || statusOrder[next.status] < statusOrder[existing.status]
      || statusOrder[next.status] === statusOrder[existing.status] && JSON.stringify(next) < JSON.stringify(existing)) group.set(parsed.domain, next);
    const scores = [existing?.namingScore, next.namingScore].filter((score): score is number => typeof score === "number");
    if (scores.length) group.get(parsed.domain)!.namingScore = Math.min(...scores);
    groups.set(parsed.label, group);
  }
  for (const [label, group] of groups) {
    for (const suffix of requiredTlds) {
      const candidate = canonicalDomain(`${label}.${suffix}`);
      // Do not invent a transformed label or replace a contradictory observation.
      if (!candidate || candidate.label !== label) return [];
      if (!group.has(candidate.domain)) group.set(candidate.domain, {
        domain: candidate.domain, status: "unknown", availabilityVerified: false,
        checkMethod: "none", checkedAt: null, evidenceStatus: "unverified", requestedAlternative: true,
      });
    }
  }
  const limit = typeof options.limit === "number" && Number.isFinite(options.limit)
    ? Math.max(0, Math.min(NAME_PACKAGE_LIMIT, Math.floor(options.limit))) : NAME_PACKAGE_LIMIT;
  return [...groups.entries()].map(([label, group]) => scorePackage({
    id: `name-package:${label}`, label, displayName: label, domains: [...group.values()].sort((a, b) => a.domain.localeCompare(b.domain)),
    socials: platforms.map(platform => socialCandidate(platform, label)), company: { status: "not_checked" }, trademark: { status: "not_checked" },
    fitScore: 0, packageScore: 0, riskPenalty: 0, evidenceCoverage: 0,
    scoreParts: { fit: { score: 0, max: 40 }, domains: { score: 0, max: 30 }, socials: { score: 0, max: 20 },
      company: { score: 0, max: 5 }, trademark: { score: 0, max: 5 } }, reasonCodes: [], missingChecks: [], nextActions: [],
    observedAt: timestamp(options.observedAt) !== null ? options.observedAt : null,
  })).sort((a, b) => b.packageScore - a.packageScore || b.fitScore - a.fitScore || a.label.localeCompare(b.label)).slice(0, limit);
}

export function applyPackageObservations(pkg: NamePackage, observations: SocialObservation[], now?: number): NamePackage {
  const currentTime = safeNow(now);
  const valid = observations.slice(0, 600).flatMap(observation => {
    const parsed = socialObservationSchema.safeParse(observation);
    return parsed.success && fresh(parsed.data.checkedAt, currentTime) ? [parsed.data] : [];
  });
  const domains = pkg.domains.map(domain => domain.requestedAlternative === true
    ? { domain: domain.domain, status: "unknown" as const, availabilityVerified: false,
      checkMethod: "none", checkedAt: null, evidenceStatus: "unverified" as const, requestedAlternative: true as const }
    : domain.evidenceStatus === "stale"
    ? { ...domain, status: "unknown" as const, availabilityVerified: false }
    : domainEvidence(domain, domain.domain, pkg.observedAt, currentTime));
  const socials = pkg.socials.map(social => {
    const candidate = socialCandidate(social.platform, pkg.label);
    const existing = social.checkedAt && social.sourceUrl && social.handle ? socialObservationSchema.safeParse({
      platform: social.platform, handle: social.handle, status: social.status, checkedAt: social.checkedAt, sourceUrl: social.sourceUrl,
    }) : null;
    const matching = [...valid, ...(existing?.success && fresh(existing.data.checkedAt, currentTime) ? [existing.data] : [])]
      .filter(observation => observation.platform === candidate.platform && observation.handle === candidate.handle)
      .sort((a, b) => Date.parse(b.checkedAt) - Date.parse(a.checkedAt)
        || ({ profile_found: 2, unknown: 1, not_found: 0 }[b.status] - { profile_found: 2, unknown: 1, not_found: 0 }[a.status]));
    // A failed lookup does not disprove a still-current observed conflict or 404.
    // Keep the dated known observation until a newer known observation or expiry.
    const latest = matching.find(observation => observation.status !== "unknown") ?? matching[0];
    return latest ? { ...candidate, status: latest.status, checkedAt: latest.checkedAt, sourceUrl: latest.sourceUrl } : candidate;
  });
  return scorePackage({ ...pkg, domains, socials, company: { status: "not_checked" }, trademark: { status: "not_checked" } });
}
