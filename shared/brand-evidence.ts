import { parse } from "tldts";
import { z } from "zod/v4";
import {
  NAME_PACKAGE_EVIDENCE_MAX_AGE_MS, SOCIAL_PLATFORMS, socialObservationSchema, buildNamePackages, applyPackageObservations,
  type NamePackage,
} from "./name-packages.js";

export const BRAND_EVIDENCE_SCHEMA_VERSION = "sajda.brand-evidence.v1" as const;
export const BRAND_EVIDENCE_MAX_ENTRIES = 200;
export const BRAND_EVIDENCE_AGENT_INSTRUCTIONS = "Brand results include evidence_report. Present checked provider observations, reported user claims, listed source assertions and unknown areas separately. Keep exact targets, original observation dates, source URLs and freshness. A checked registration or found profile does not verify ownership or social registrability; a listed source relationship is not an independent check. Unknown or expired evidence does not mean absent, free or safe. Counts refer to scoped signal items, not unique identities; use this ledger rather than legacy readiness-input coverage for the four-state summary. Never claim legal clearance or active comprehensive brand monitoring from this snapshot.";
export const BRAND_EVIDENCE_REPORT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const BRAND_EVIDENCE_STATEMENTS = [
  "domain_available", "domain_registered", "domain_check_unavailable",
  "social_profile_found", "social_profile_not_found", "social_check_unknown",
  "company_not_checked", "trademark_not_checked", "reported_owned", "reported_authorized",
  "reported_conflict", "reported_matching_name_only", "report_unknown",
  "source_lists_website", "source_lists_social", "ownership_not_verified", "continuous_monitoring_not_active",
] as const;
export type BrandEvidenceStatement = typeof BRAND_EVIDENCE_STATEMENTS[number];
const timestamp = z.string().datetime({ offset: true }).refine(value => Number.isFinite(Date.parse(value)));
function hasControlCharacters(value: string, includeSpace = false): boolean {
  return [...value].some(character => {
    const code = character.codePointAt(0)!;
    return code <= (includeSpace ? 32 : 31) || code >= 127 && code <= 159;
  });
}
const text = (max: number) => z.string().min(1).max(max).refine(value => !hasControlCharacters(value));

/** Display-only provenance URL, never a fetch target. No secrets, private hosts,
 * redirect queries or arbitrary fragments. Wikidata property anchors identify
 * the exact public assertion and are deliberately retained. */
export function safeBrandEvidenceSourceUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2000 || hasControlCharacters(value, true)) return null;
  try {
    const url = new URL(value), host = parse(url.hostname, { allowPrivateDomains: false });
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.search
      || !host.isIcann || host.isIp || !host.domain || host.isPrivate
      || url.hash && !(url.hostname === "www.wikidata.org" && /^#P[1-9][0-9]*$/u.test(url.hash))) return null;
    return url.toString();
  } catch { return null; }
}
export const brandEvidenceSourceUrlSchema = z.string().max(2000).url().refine(value => safeBrandEvidenceSourceUrl(value) !== null);
const registrySources: Readonly<Record<string, { source: string; url: string }>> = {
  com: { source: "verisign-rdap", url: "https://rdap.verisign.com/com/v1/domain/" },
  net: { source: "verisign-rdap", url: "https://rdap.verisign.com/net/v1/domain/" },
  org: { source: "public-interest-registry-rdap", url: "https://rdap.publicinterestregistry.org/rdap/domain/" },
  app: { source: "google-registry-rdap", url: "https://pubapi.registry.google/rdap/domain/" },
  dev: { source: "google-registry-rdap", url: "https://pubapi.registry.google/rdap/domain/" },
  ai: { source: "identity-digital-rdap", url: "https://rdap.identitydigital.services/rdap/domain/" },
  xyz: { source: "centralnic-rdap", url: "https://rdap.centralnic.com/xyz/domain/" },
  info: { source: "identity-digital-rdap", url: "https://rdap.identitydigital.services/rdap/domain/" },
  biz: { source: "nic-biz-rdap", url: "https://rdap.nic.biz/domain/" },
};
/** Resolve only audited source identifiers (or their exact published endpoint).
 * A returned link describes provenance, not a new check or a freshness renewal.
 * Optional method guards prevent a WHOIS/DNS attempt borrowing an RDAP source. */
export function brandRegistrySourceUrl(domain: string, source: unknown, checkMethod?: string): string | null {
  if (typeof domain !== "string" || domain !== domain.toLowerCase() || domain.length > 253) return null;
  const parsed = parse(domain, { allowPrivateDomains: false });
  if (!parsed.isIcann || parsed.isIp || parsed.domain !== domain || parsed.subdomain || !parsed.publicSuffix) return null;
  const registry = registrySources[parsed.publicSuffix];
  if (!registry || checkMethod !== undefined && checkMethod !== "rdap" && checkMethod !== "none") return null;
  const expected = `${registry.url}${domain}`;
  return source === registry.source || source === expected ? expected : null;
}

export const brandEvidenceEntrySchema = z.strictObject({
  id: text(400), target: text(1400),
  kind: z.enum(["domain", "social", "company", "trademark", "market", "ownership", "monitoring"]),
  state: z.enum(["checked", "reported", "listed", "unknown"]),
  freshness: z.enum(["current", "stale", "future", "unknown"]),
  source_url: brandEvidenceSourceUrlSchema.nullable().describe("Public source reference only; its existence is not verification or ownership proof."),
  observed_at: timestamp.nullable().describe("Original provider observation, user-report or source-retrieval time. Report generation never renews it."),
  statement: z.enum(BRAND_EVIDENCE_STATEMENTS),
  origin: z.enum(["provider_observation", "user_report", "source_assertion", "none"]),
}).superRefine((entry, context) => {
  const fail = (message: string) => context.addIssue({ code: "custom", message });
  const statementKinds: Record<BrandEvidenceStatement, readonly BrandEvidenceEntry["kind"][]> = {
    domain_available: ["domain"], domain_registered: ["domain"], domain_check_unavailable: ["domain"],
    social_profile_found: ["social"], social_profile_not_found: ["social"], social_check_unknown: ["social"],
    company_not_checked: ["company"], trademark_not_checked: ["trademark"],
    reported_owned: ["domain", "social", "market"], reported_authorized: ["domain", "social", "market"],
    reported_conflict: ["domain", "social", "market"], reported_matching_name_only: ["domain", "social", "market"],
    report_unknown: ["domain", "social", "market"], source_lists_website: ["domain"], source_lists_social: ["social"],
    ownership_not_verified: ["ownership"], continuous_monitoring_not_active: ["monitoring"],
  };
  if (!statementKinds[entry.statement].includes(entry.kind)) fail("Evidence statements must match their signal kind.");
  const providerStatements: readonly BrandEvidenceStatement[] = ["domain_available", "domain_registered", "domain_check_unavailable", "social_profile_found", "social_profile_not_found", "social_check_unknown"];
  const userStatements: readonly BrandEvidenceStatement[] = ["reported_owned", "reported_authorized", "reported_conflict", "reported_matching_name_only", "report_unknown"];
  const sourceStatements: readonly BrandEvidenceStatement[] = ["source_lists_website", "source_lists_social"];
  const absentStatements: readonly BrandEvidenceStatement[] = ["domain_check_unavailable", "social_check_unknown", "company_not_checked", "trademark_not_checked", "report_unknown", "ownership_not_verified", "continuous_monitoring_not_active"];
  const allowed = entry.origin === "provider_observation" ? providerStatements : entry.origin === "user_report" ? userStatements
    : entry.origin === "source_assertion" ? sourceStatements : absentStatements;
  if (!allowed.includes(entry.statement)) fail("Evidence origin must match the statement, including unresolved or expired observations.");
  if (entry.state === "checked" && (entry.origin !== "provider_observation" || entry.freshness !== "current"
    || entry.observed_at === null || !["domain_available", "domain_registered", "social_profile_found", "social_profile_not_found"].includes(entry.statement))) fail("Checked signals require a current dated provider observation.");
  if (entry.state === "reported" && (entry.origin !== "user_report" || entry.freshness !== "current"
    || entry.observed_at === null || !["reported_owned", "reported_authorized", "reported_conflict", "reported_matching_name_only"].includes(entry.statement))) fail("Reported signals require a current dated user report.");
  if (entry.state === "listed" && (entry.origin !== "source_assertion" || entry.freshness !== "current"
    || entry.observed_at === null || entry.source_url === null || !["source_lists_website", "source_lists_social"].includes(entry.statement))) fail("Listed signals require a dated source assertion, not independent verification.");
  if (entry.origin === "none" && (entry.state !== "unknown" || entry.observed_at !== null || entry.freshness !== "unknown")) fail("Absent evidence cannot have a dated observation or a resolved state.");
  if (entry.kind === "ownership" && (entry.state !== "unknown" || entry.statement !== "ownership_not_verified")) fail("This report does not verify ownership.");
  if (entry.kind === "monitoring" && (entry.state !== "unknown" || entry.statement !== "continuous_monitoring_not_active")) fail("A snapshot is not continuous monitoring.");
});
export type BrandEvidenceEntry = z.infer<typeof brandEvidenceEntrySchema>;
const count = z.number().int().min(0).max(BRAND_EVIDENCE_MAX_ENTRIES);
export const brandEvidenceReportSchema = z.strictObject({
  schema_version: z.literal(BRAND_EVIDENCE_SCHEMA_VERSION), generated_at: timestamp,
  entries: z.array(brandEvidenceEntrySchema).max(BRAND_EVIDENCE_MAX_ENTRIES),
  summary: z.strictObject({ total: count, checked: count, reported: count, listed: count, unknown: count,
    checked_coverage_percent: z.number().int().min(0).max(100).describe("Current checked signal items divided by all scoped signal items, not verified ownership or legal coverage.") }),
  ownership_verified: z.literal(false), legal_clearance: z.literal(false), continuous_monitoring: z.literal(false),
}).superRefine((report, context) => {
  if (new Set(report.entries.map(entry => entry.id)).size !== report.entries.length) context.addIssue({ code: "custom", message: "Evidence item IDs must be unique." });
  const expected = summarize(report.entries);
  for (const key of Object.keys(expected) as (keyof typeof expected)[]) {
    if (report.summary[key] !== expected[key]) context.addIssue({ code: "custom", message: "Evidence counts must match the scoped items.", path: ["summary", key] });
  }
  for (const [index, entry] of report.entries.entries()) {
    const expectedAge = entry.origin === "none" ? "unknown" : freshness(entry.observed_at, Date.parse(report.generated_at), maxAge(entry.origin));
    if (entry.freshness !== expectedAge || entry.state !== "unknown" && expectedAge !== "current") {
      context.addIssue({ code: "custom", message: "All evidence freshness must match its original observation and report generation time.", path: ["entries", index, "freshness"] });
    }
  }
});
export type BrandEvidenceReport = z.infer<typeof brandEvidenceReportSchema>;

function maxAge(origin: BrandEvidenceEntry["origin"]): number {
  return origin === "user_report" ? BRAND_EVIDENCE_REPORT_MAX_AGE_MS : NAME_PACKAGE_EVIDENCE_MAX_AGE_MS;
}
function freshness(at: string | null, now: number, maximumAge: number): BrandEvidenceEntry["freshness"] {
  if (!at || !timestamp.safeParse(at).success) return "unknown";
  const age = now - Date.parse(at);
  return age < 0 ? "future" : age > maximumAge ? "stale" : "current";
}
function summarize(entries: readonly BrandEvidenceEntry[]) {
  const checked = entries.filter(entry => entry.state === "checked").length;
  return { total: entries.length, checked, reported: entries.filter(entry => entry.state === "reported").length,
    listed: entries.filter(entry => entry.state === "listed").length, unknown: entries.filter(entry => entry.state === "unknown").length,
    checked_coverage_percent: entries.length ? Math.floor(100 * checked / entries.length) : 0 };
}
/** Summary and time validity are recomputed, never taken from an API caller or
 * saved score. Multiple signals about one target remain separately inspectable. */
export function createBrandEvidenceReport(entries: readonly BrandEvidenceEntry[], now = Date.now()): BrandEvidenceReport {
  if (!Number.isSafeInteger(now) || now < 0 || now > 253_402_300_799_999) throw new Error("Invalid evidence report time.");
  const current = z.array(brandEvidenceEntrySchema).max(BRAND_EVIDENCE_MAX_ENTRIES).parse(entries).map(entry => {
    const age = entry.origin === "none" ? "unknown" : freshness(entry.observed_at, now, maxAge(entry.origin));
    return { ...entry, freshness: age, state: age === "current" ? entry.state : "unknown" } satisfies BrandEvidenceEntry;
  });
  return brandEvidenceReportSchema.parse({ schema_version: BRAND_EVIDENCE_SCHEMA_VERSION, generated_at: new Date(now).toISOString(),
    entries: current, summary: summarize(current), ownership_verified: false, legal_clearance: false, continuous_monitoring: false });
}
function unknownEntry(id: string, target: string, kind: BrandEvidenceEntry["kind"], statement: BrandEvidenceStatement): BrandEvidenceEntry {
  return { id, target, kind, statement, state: "unknown", freshness: "unknown", origin: "none", source_url: null, observed_at: null };
}
function unresolvedScope(identity: string): BrandEvidenceEntry[] {
  return [unknownEntry(`company:${identity}`, identity, "company", "company_not_checked"),
    unknownEntry(`trademark:${identity}`, identity, "trademark", "trademark_not_checked"),
    unknownEntry(`ownership:${identity}`, identity, "ownership", "ownership_not_verified"),
    unknownEntry(`monitoring:${identity}`, identity, "monitoring", "continuous_monitoring_not_active")];
}

/** Input must be the package's actual registry/profile observations, not a
 * submitted ownership claim. Registration and profile existence have deliberately
 * narrower statements than identity ownership or handle availability. */
export function buildCandidateBrandEvidenceReport(pkg: NamePackage, now = Date.now()): BrandEvidenceReport {
  // Reuse the conservative package normalizer: duplicates, requested-only
  // alternatives and unsupported evidence methods must not inflate coverage.
  const platforms = SOCIAL_PLATFORMS.filter(platform => pkg.socials.some(social => social.platform === platform));
  const canonical = buildNamePackages(pkg.domains, { platforms, observedAt: null, now, limit: 10 })
    .find(candidate => candidate.label === pkg.label);
  if (!canonical) throw new Error("A valid name package is required for evidence reporting.");
  const domains = canonical.domains.map(domain => {
    const at = timestamp.safeParse(domain.checkedAt).success ? domain.checkedAt : null;
    const age = freshness(at, now, NAME_PACKAGE_EVIDENCE_MAX_AGE_MS);
    const original = pkg.domains.find(row => row.domain === domain.domain && row.checkedAt === domain.checkedAt);
    const method = domain.checkMethod === "none" && domain.evidenceStatus !== "fresh" ? original?.checkMethod : domain.checkMethod;
    const registryUrl = brandRegistrySourceUrl(domain.domain, domain.source, method);
    const provider = at !== null && !original?.requestedAlternative
      && (method !== undefined && ["rdap", "das", "whois"].includes(method) || registryUrl !== null);
    const checked = provider && domain.availabilityVerified && age === "current" && ["available", "taken"].includes(domain.status);
    return { id: `check:domain:${domain.domain}`, target: domain.domain, kind: "domain", state: checked ? "checked" : "unknown",
      freshness: provider ? age : "unknown", source_url: registryUrl ?? safeBrandEvidenceSourceUrl(domain.source), observed_at: provider ? at : null,
      statement: checked ? domain.status === "available" ? "domain_available" : "domain_registered" : "domain_check_unavailable",
      origin: provider ? "provider_observation" : "none" } satisfies BrandEvidenceEntry;
  });
  const observations = pkg.socials.flatMap(social => {
    const result = socialObservationSchema.safeParse({ platform: social.platform, handle: social.handle, status: social.status,
      checkedAt: social.checkedAt, sourceUrl: social.sourceUrl });
    return result.success && result.data.handle === pkg.label ? [result.data] : [];
  }).slice(0, 600);
  const current = applyPackageObservations(canonical, observations, now);
  const socials = platforms.map(platform => {
    const live = current.socials.find(social => social.platform === platform)!;
    const historical = observations.filter(observation => observation.platform === platform)
      .sort((a, b) => Date.parse(b.checkedAt) - Date.parse(a.checkedAt))[0];
    const social = live.checkedAt ? live : historical;
    const parsed = socialObservationSchema.safeParse({ platform, handle: social?.handle, status: social?.status,
      checkedAt: social?.checkedAt, sourceUrl: social?.sourceUrl });
    const age = parsed.success ? freshness(parsed.data.checkedAt, now, NAME_PACKAGE_EVIDENCE_MAX_AGE_MS) : "unknown";
    const checked = parsed.success && age === "current" && social?.status !== "unknown";
    return { id: `check:social:${platform}:${pkg.label}`, target: `${platform}:${pkg.label}`, kind: "social",
      state: checked ? "checked" : "unknown", freshness: age, source_url: parsed.success ? safeBrandEvidenceSourceUrl(parsed.data.sourceUrl) : null,
      observed_at: parsed.success ? parsed.data.checkedAt : null, statement: checked ? social?.status === "profile_found" ? "social_profile_found" : "social_profile_not_found" : "social_check_unknown",
      origin: parsed.success ? "provider_observation" : "none" } satisfies BrandEvidenceEntry;
  });
  return createBrandEvidenceReport([...domains, ...socials, ...unresolvedScope(pkg.label)], now);
}

interface ReportedTarget {
  id: string; kind: "domain" | "social" | "market"; identifier: string; reported_status: string;
  source_url?: string | null; reported_at?: string | null;
}
/** A source link supplied by the account holder does not change the origin. */
export function buildPresenceBrandEvidenceReport(identity: string, targets: readonly ReportedTarget[], now = Date.now()): BrandEvidenceReport {
  const entries = targets.map(target => {
    const at = target.reported_at ?? null;
    const age = freshness(at, now, BRAND_EVIDENCE_REPORT_MAX_AGE_MS);
    const known = ["reported_owned", "reported_authorized", "reported_conflict", "matching_name_only"].includes(target.reported_status);
    const reported = known && age === "current";
    return { id: `report:${target.id}`, target: target.kind === "social" ? target.id.slice(7) : target.identifier, kind: target.kind,
      state: reported ? "reported" : "unknown", freshness: at ? age : "unknown", source_url: safeBrandEvidenceSourceUrl(target.source_url),
      observed_at: at, statement: known ? target.reported_status === "matching_name_only" ? "reported_matching_name_only" : target.reported_status as BrandEvidenceStatement : "report_unknown",
      origin: at || known || target.source_url ? "user_report" : "none" } satisfies BrandEvidenceEntry;
  });
  return createBrandEvidenceReport([...entries, ...unresolvedScope(identity)], now);
}

interface LookupProfileEvidence {
  retrieved_at: string; entity: { entity_id: string };
  assertions: readonly { statement_id: string; kind: "website" | "social"; platform?: string | null; value: string; source_url: string }[];
}
/** Freshness describes when Sajda read the database assertion, not when the
 * asserted real-world relationship was checked. It never enters checked coverage. */
export function buildLookupBrandEvidenceReport(profile: LookupProfileEvidence, now = Date.now()): BrandEvidenceReport {
  const age = freshness(profile.retrieved_at, now, NAME_PACKAGE_EVIDENCE_MAX_AGE_MS);
  const entries = profile.assertions.map(assertion => ({ id: `listed:${assertion.statement_id}`,
    target: assertion.kind === "website" ? assertion.value : `${assertion.platform}:${assertion.value}`,
    kind: assertion.kind === "website" ? "domain" : "social", state: age === "current" ? "listed" : "unknown",
    freshness: age, source_url: safeBrandEvidenceSourceUrl(assertion.source_url), observed_at: profile.retrieved_at,
    statement: assertion.kind === "website" ? "source_lists_website" : "source_lists_social", origin: "source_assertion" }) satisfies BrandEvidenceEntry);
  return createBrandEvidenceReport([...entries, ...unresolvedScope(profile.entity.entity_id)], now);
}
