import { parse } from "tldts";
import { z } from "zod/v4";
import { NAME_PACKAGE_MARKET_CODES } from "./name-package-markets.js";
import { SOCIAL_PLATFORMS } from "./name-packages.js";

export const BRAND_INDEX_SCHEMA_VERSION = "sajda.brand-presence-index.v1" as const;
export const BRAND_INDEX_METHODOLOGY_VERSION = "brand-presence-1.0.0" as const;
export const BRAND_INDEX_REPORT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const BRAND_INDEX_MIN_COVERAGE = 60 as const;
export const BRAND_INDEX_STATUSES = ["reported_owned", "reported_authorized", "matching_name_only", "reported_conflict", "unknown"] as const;
export const BRAND_INDEX_WEIGHTS = { domains: 35, socials: 25, markets: 25, consistency: 15 } as const;
const MAX_TARGETS = 20 + SOCIAL_PLATFORMS.length + NAME_PACKAGE_MARKET_CODES.length;
const LIMITATIONS = [
  "self_assessment_not_independently_verified", "selected_scope_not_global_rank", "unknown_not_absent_or_uncontrolled",
  "registration_or_name_match_not_control", "authorized_use_not_direct_ownership", "market_reports_not_legal_clearance",
  "timestamps_describe_user_reports_not_source_verification", "no_external_lookups_performed", "not_brand_value_or_investment_advice",
] as const;

function hasControlCharacters(value: string, includeSpace = false): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code <= (includeSpace ? 32 : 31) || code === 127) return true;
  }
  return false;
}

function isRegistrableDomain(domain: string): boolean {
  if (!/^[a-z0-9.-]+$/u.test(domain) || domain.includes("..")) return false;
  // A platform can own its registrable root (for example github.io); its tenant subdomains are not roots.
  const result = parse(domain, { allowPrivateDomains: false });
  return result.isIcann === true && !result.isPrivate && result.domain === domain && !result.subdomain
    && domain.split(".").every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(label));
}
const domainSchema = z.string().trim().toLowerCase().min(3).max(253).refine(isRegistrableDomain, "Use a registrable domain without a URL, path or subdomain.");
// Syntax for a declared identity, not a guarantee that a platform permits registration.
const handleSchema = z.string().trim().normalize("NFC").toLowerCase().min(1).max(100)
  .refine(value => /^[\p{L}\p{N}_.-]+$/u.test(value), "Use the handle only, without an @ sign or URL.");
const socialSchema = z.strictObject({ platform: z.enum(SOCIAL_PLATFORMS), handle: handleSchema });
const sourceUrlSchema = z.string().max(512).url().refine(value => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && !url.search && !url.hash
      && parse(url.hostname).isIcann === true && !hasControlCharacters(value, true);
  } catch { return false; }
}, "Use a public HTTPS source URL without credentials, query parameters or fragments.");
const timestampSchema = z.string().datetime({ offset: true }).refine(value => Number.isFinite(Date.parse(value)), "Use a valid timestamp and UTC offset.");
const observationSchema = z.strictObject({
  target_id: z.string().min(1).max(300), status: z.enum(BRAND_INDEX_STATUSES),
  source_url: sourceUrlSchema.nullable().optional(), reported_at: timestampSchema.nullable().optional(),
});
export const brandIndexScopeSchema = z.strictObject({
  brand_name: z.string().trim().min(1).max(100).refine(value => !hasControlCharacters(value)),
  identity_label: z.string().trim().toLowerCase().min(1).max(63).regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u),
  primary_domain: domainSchema,
  domains: z.array(domainSchema).min(1).max(20),
  socials: z.array(socialSchema).min(1).max(SOCIAL_PLATFORMS.length),
  markets: z.array(z.enum(NAME_PACKAGE_MARKET_CODES)).min(1).max(NAME_PACKAGE_MARKET_CODES.length),
});
export type BrandIndexScope = z.infer<typeof brandIndexScopeSchema>;
export interface BrandIndexTarget {
  id: string; kind: "domain" | "social" | "market"; identifier: string;
  market?: typeof NAME_PACKAGE_MARKET_CODES[number]; platform?: typeof SOCIAL_PLATFORMS[number];
}
function targetsFor(scope: BrandIndexScope): BrandIndexTarget[] {
  return [
    ...scope.domains.map(domain => ({ id: `domain:${domain}`, kind: "domain" as const, identifier: domain })),
    ...scope.socials.map(social => ({ id: `social:${social.platform}:${social.handle}`, kind: "social" as const, identifier: social.handle, platform: social.platform })),
    ...scope.markets.map(market => ({ id: `market:${market}`, kind: "market" as const, identifier: market, market })),
  ].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
function scopeIssues(scope: BrandIndexScope, context: z.RefinementCtx): void {
  if (new Set(scope.domains).size !== scope.domains.length || !scope.domains.includes(scope.primary_domain)) {
    context.addIssue({ code: "custom", message: "Use unique domains and include the primary domain.", path: ["domains"] });
  }
  if (new Set(scope.socials.map(item => item.platform)).size !== scope.socials.length) {
    context.addIssue({ code: "custom", message: "Use one declared identity per selected social platform.", path: ["socials"] });
  }
  if (new Set(scope.markets).size !== scope.markets.length) context.addIssue({ code: "custom", message: "Use unique countries.", path: ["markets"] });
}
/** A caller can report a claim, never promote it to an independently verified fact. */
export const brandIndexInputSchema = brandIndexScopeSchema.extend({
  observations: z.array(observationSchema).max(MAX_TARGETS).default([]),
}).superRefine((input, context) => {
  scopeIssues(input, context);
  const targets = new Set(targetsFor(input).map(target => target.id));
  if (new Set(input.observations.map(item => item.target_id)).size !== input.observations.length) {
    context.addIssue({ code: "custom", message: "Only one self-report is permitted per target.", path: ["observations"] });
  }
  if (input.observations.some(item => !targets.has(item.target_id))) {
    context.addIssue({ code: "custom", message: "Every self-report must belong to the selected scope.", path: ["observations"] });
  }
});
export type BrandIndexInput = z.infer<typeof brandIndexInputSchema>;

export function buildBrandIndexTargets(scope: BrandIndexScope): BrandIndexTarget[] {
  return targetsFor(brandIndexInputSchema.parse({ ...scope, observations: [] }));
}
const targetSchema = z.strictObject({
  id: z.string().max(300), kind: z.enum(["domain", "social", "market"]), identifier: z.string().max(253),
  market: z.enum(NAME_PACKAGE_MARKET_CODES).optional(), platform: z.enum(SOCIAL_PLATFORMS).optional(),
  reported_status: z.enum(BRAND_INDEX_STATUSES), status_freshness: z.enum(["current", "stale", "future", "unknown"]),
  classification: z.literal("USER_SUPPLIED"), source_url: sourceUrlSchema.nullable(), reported_at: timestampSchema.nullable(),
});
const boundedPercent = z.number().int().min(0).max(100);
const part = <T extends number>(maximum: T) => z.strictObject({ score: z.number().min(0).max(maximum), max: z.literal(maximum) });
export const brandIndexResultSchema = z.strictObject({
  schema_version: z.literal(BRAND_INDEX_SCHEMA_VERSION), methodology_version: z.literal(BRAND_INDEX_METHODOLOGY_VERSION),
  generated_at: timestampSchema,
  brand: z.strictObject({ name: z.string().max(100), identity_label: z.string().max(63), primary_domain: domainSchema, classification: z.literal("USER_SUPPLIED") }),
  scope: z.strictObject({ domains: z.array(domainSchema).min(1).max(20), socials: z.array(socialSchema).min(1).max(SOCIAL_PLATFORMS.length),
    markets: z.array(z.enum(NAME_PACKAGE_MARKET_CODES)).min(1).max(NAME_PACKAGE_MARKET_CODES.length),
    target_count: z.number().int().min(3).max(MAX_TARGETS), comparison_key: z.string().max(10000), is_global_score: z.literal(false) }),
  index: z.strictObject({ reported_score: boundedPercent.nullable(), verified_score: z.null(), maximum: z.literal(100),
    classification: z.literal("SELF_ASSESSMENT"), reported_coverage_percent: boundedPercent, verified_coverage_percent: z.literal(0),
    confidence: z.null(), minimum_reported_coverage_percent: z.literal(BRAND_INDEX_MIN_COVERAGE), status: z.enum(["needs_reports", "ready"]) }),
  subscores: z.strictObject({ domains: part(35), socials: part(25), markets: part(25), consistency: part(15) }),
  counts: z.strictObject({ requested: z.number().int().min(3).max(MAX_TARGETS), assessed: z.number().int().min(0).max(MAX_TARGETS),
    unassessed: z.number().int().min(0).max(MAX_TARGETS), owned: z.number().int().min(0).max(MAX_TARGETS),
    authorized: z.number().int().min(0).max(MAX_TARGETS), conflicts: z.number().int().min(0).max(MAX_TARGETS),
    matching_only: z.number().int().min(0).max(MAX_TARGETS), stale: z.number().int().min(0).max(MAX_TARGETS) }),
  targets: z.array(targetSchema).min(3).max(MAX_TARGETS),
  limitations: z.array(z.enum(LIMITATIONS)).length(LIMITATIONS.length),
});
export type BrandIndexResult = z.infer<typeof brandIndexResultSchema>;

function reportAge(at: string | null, now: number): BrandIndexResult["targets"][number]["status_freshness"] {
  if (!at) return "unknown";
  const elapsed = now - Date.parse(at);
  if (!Number.isFinite(elapsed)) return "unknown";
  return elapsed < 0 ? "future" : elapsed > BRAND_INDEX_REPORT_MAX_AGE_MS ? "stale" : "current";
}
type ReportTarget = BrandIndexResult["targets"][number];
const controlled = (target: ReportTarget) => target.status_freshness === "current" && ["reported_owned", "reported_authorized"].includes(target.reported_status);
const resolved = (target: ReportTarget) => controlled(target) || target.status_freshness === "current" && target.reported_status === "reported_conflict";
const roundPart = (value: number) => Math.round(value * 100) / 100;

/** Pure, deterministic given now. No DNS, crawling, database, AI or official-verification path. */
export function assessBrandPresence(value: unknown, now = Date.now()): BrandIndexResult {
  if (!Number.isSafeInteger(now) || now < 0 || now > 253_402_300_799_999) throw new Error("Invalid assessment time.");
  const input = brandIndexInputSchema.parse(value);
  const reports = new Map(input.observations.map(item => [item.target_id, item]));
  const targets: ReportTarget[] = targetsFor(input).map(target => {
    const report = reports.get(target.id);
    return { ...target, reported_status: report?.status ?? "unknown", status_freshness: reportAge(report?.reported_at ?? null, now),
      classification: "USER_SUPPLIED", source_url: report?.source_url ?? null, reported_at: report?.reported_at ?? null };
  });
  const domains = targets.filter(target => target.kind === "domain"), socials = targets.filter(target => target.kind === "social"),
    markets = targets.filter(target => target.kind === "market"), identities = [...domains, ...socials];
  const sameName = (target: ReportTarget) => (target.kind === "domain" ? parse(target.identifier).domainWithoutSuffix : target.identifier) === input.identity_label;
  const values = {
    domains: 35 * domains.filter(controlled).length / domains.length,
    socials: 25 * socials.filter(controlled).length / socials.length,
    markets: 25 * markets.filter(controlled).length / markets.length,
    consistency: 15 * identities.filter(target => controlled(target) && sameName(target)).length / identities.length,
  };
  const coverage = 35 * domains.filter(resolved).length / domains.length + 25 * socials.filter(resolved).length / socials.length
    + 25 * markets.filter(resolved).length / markets.length + 15 * identities.filter(resolved).length / identities.length;
  const ready = coverage >= BRAND_INDEX_MIN_COVERAGE && [domains, socials, markets].every(items => items.some(resolved));
  const canonicalScope = { domains: [...input.domains].sort(), socials: [...input.socials].sort((a, b) => a.platform.localeCompare(b.platform, "en")), markets: [...input.markets].sort() };
  return brandIndexResultSchema.parse({
    schema_version: BRAND_INDEX_SCHEMA_VERSION, methodology_version: BRAND_INDEX_METHODOLOGY_VERSION, generated_at: new Date(now).toISOString(),
    brand: { name: input.brand_name, identity_label: input.identity_label, primary_domain: input.primary_domain, classification: "USER_SUPPLIED" },
    scope: { ...canonicalScope, target_count: targets.length,
      comparison_key: JSON.stringify([BRAND_INDEX_METHODOLOGY_VERSION, input.brand_name, input.identity_label, input.primary_domain, canonicalScope]), is_global_score: false },
    index: { reported_score: ready ? Math.round(Object.values(values).reduce((sum, value) => sum + value, 0)) : null,
      verified_score: null, maximum: 100, classification: "SELF_ASSESSMENT", reported_coverage_percent: Math.floor(coverage),
      verified_coverage_percent: 0, confidence: null, minimum_reported_coverage_percent: BRAND_INDEX_MIN_COVERAGE, status: ready ? "ready" : "needs_reports" },
    subscores: Object.fromEntries(Object.entries(BRAND_INDEX_WEIGHTS).map(([key, max]) => [key, { score: roundPart(values[key as keyof typeof values]), max }])),
    counts: { requested: targets.length, assessed: targets.filter(resolved).length, unassessed: targets.filter(target => !resolved(target)).length,
      owned: targets.filter(target => controlled(target) && target.reported_status === "reported_owned").length,
      authorized: targets.filter(target => controlled(target) && target.reported_status === "reported_authorized").length,
      conflicts: targets.filter(target => resolved(target) && target.reported_status === "reported_conflict").length,
      matching_only: targets.filter(target => target.reported_status === "matching_name_only").length,
      stale: targets.filter(target => target.status_freshness === "stale" || target.status_freshness === "future").length },
    targets, limitations: [...LIMITATIONS],
  });
}
