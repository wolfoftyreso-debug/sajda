import { NAMES_API_MAX_EXACT_DOMAINS, NAMES_API_TLDS } from "../../api/_shared/names-contract";
import { brandRegistrySourceUrl, createBrandEvidenceReport, type BrandEvidenceEntry } from "../../shared/brand-evidence";
import { NAME_PACKAGE_EVIDENCE_MAX_AGE_MS, normalizePackageEvidenceTimestamp, type PackageDomainInput } from "../../shared/name-packages";
import { runAnonymousSearch } from "./localTestSearch";
import type { Language } from "../i18n/LanguageProvider";

/** The same bounded exact-domain capability as name packages; no crawler or AI. */
export function buildBrandDomainCheckPlan(domains: readonly string[]) {
  if (!Array.isArray(domains) || domains.length < 1 || domains.length > 20 || new Set(domains).size !== domains.length) throw new Error("invalid_domain_scope");
  const supported: string[] = [], unsupported: string[] = [];
  for (const domain of domains) {
    if (typeof domain !== "string" || domain.length > 253) throw new Error("invalid_domain_scope");
    const suffix = domain.split(".").at(-1)!;
    if (/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.[a-z]+$/u.test(domain)
      && NAMES_API_TLDS.includes(suffix as typeof NAMES_API_TLDS[number])) supported.push(domain);
    else unsupported.push(domain);
  }
  const batches: string[][] = [];
  for (let start = 0; start < supported.length; start += NAMES_API_MAX_EXACT_DOMAINS) batches.push(supported.slice(start, start + NAMES_API_MAX_EXACT_DOMAINS));
  return { batches, supported, unsupported };
}

export function projectBrandDomainEvidence(domains: readonly string[], rows: readonly PackageDomainInput[], now = Date.now()) {
  buildBrandDomainCheckPlan(domains);
  if (new Set(rows.map(row => row.domain)).size !== rows.length || rows.some(row => !domains.includes(row.domain))) throw new Error("invalid_domain_response");
  const entries: BrandEvidenceEntry[] = domains.map(domain => {
    const row = rows.find(item => item.domain === domain), at = normalizePackageEvidenceTimestamp(row?.checkedAt);
    const elapsed = at ? now - Date.parse(at) : null;
    const freshness = elapsed === null ? "unknown" : elapsed < 0 ? "future" : elapsed > NAME_PACKAGE_EVIDENCE_MAX_AGE_MS ? "stale" : "current";
    const source = row ? brandRegistrySourceUrl(domain, row.source, row.checkMethod) : null;
    const checked = freshness === "current" && row?.availabilityVerified === true && row.checkMethod === "rdap" && source !== null && (row.status === "available" || row.status === "taken");
    return { id: `check:domain:${domain}`, target: domain, kind: "domain", state: checked ? "checked" : "unknown", freshness,
      source_url: source, observed_at: at, origin: row ? "provider_observation" : "none",
      statement: checked ? row.status === "available" ? "domain_available" : "domain_registered" : "domain_check_unavailable" };
  });
  return createBrandEvidenceReport(entries, now);
}

/** Applies per-batch allowance; partial results stay visible and dates stay original. */
export async function checkBrandDomainBatch(domains: string[], language: Language, signal: AbortSignal): Promise<PackageDomainInput[]> {
  const plan = buildBrandDomainCheckPlan(domains);
  if (plan.unsupported.length || plan.batches.length !== 1 || signal.aborted) throw new Error("invalid_domain_batch");
  const response = await runAnonymousSearch([], domains.length, "", language, { domains, signal });
  if (signal.aborted) throw new Error("cancelled");
  if (response.results.length > domains.length || new Set(response.results.map(row => row.domain)).size !== response.results.length
    || response.results.some(row => !domains.includes(row.domain))) throw new Error("invalid_domain_response");
  return response.results.map(row => ({ domain: row.domain, status: row.status, availabilityVerified: row.authoritative,
    checkMethod: row.checkMethod, checkedAt: normalizePackageEvidenceTimestamp(row.checkedAt), source: row.source }));
}
