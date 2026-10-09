import { parse } from "tldts";
import { verifyBrandRegistryDomain } from "../domain-search.js";
import { brandEvidenceEntrySchema, brandRegistrySourceUrl, type BrandEvidenceEntry } from "../../shared/brand-evidence.js";
import { NAME_PACKAGE_EVIDENCE_MAX_AGE_MS, normalizePackageEvidenceTimestamp } from "../../shared/name-packages.js";
import { BRAND_CHECK_DOMAIN_LIMIT, BRAND_CHECK_METHODOLOGY_VERSION } from "../../shared/brand-checks.js";

export const BRAND_REGISTRY_METHODOLOGY_VERSION = BRAND_CHECK_METHODOLOGY_VERSION;
const approvedSuffixes = new Set(["com", "net", "org", "app", "dev", "ai", "xyz", "info", "biz"]);
/** A bounded source check, not a crawler, price quote, ownership proof or legal
 * clearance. All targets come from a saved report; declared source URLs are not
 * fetched. Unknown targets are retained rather than silently dropped. */
export async function checkBrandReportDomains(domains: readonly string[]): Promise<BrandEvidenceEntry[]> {
  if (!Array.isArray(domains) || !domains.length || domains.length > BRAND_CHECK_DOMAIN_LIMIT || new Set(domains).size !== domains.length) {
    throw new Error("invalid_brand_registry_scope");
  }
  for (const domain of domains) {
    if (typeof domain !== "string" || domain !== domain.toLowerCase() || domain.length > 253) throw new Error("invalid_brand_registry_scope");
    const parsed = parse(domain, { allowPrivateDomains: false });
    if (!parsed.isIcann || parsed.isIp || parsed.isPrivate || parsed.domain !== domain || parsed.subdomain) throw new Error("invalid_brand_registry_scope");
  }
  const output = new Array<BrandEvidenceEntry>(domains.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, domains.length) }, async () => {
    while (next < domains.length) {
      const index = next++, domain = domains[index];
      const unsupported: BrandEvidenceEntry = { id: `check:domain:${domain}`, target: domain, kind: "domain",
        state: "unknown", freshness: "unknown", source_url: null, observed_at: null,
        statement: "domain_check_unavailable", origin: "none" };
      if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.[a-z]+$/u.test(domain)
        || !approvedSuffixes.has(domain.split(".").at(-1)!)) { output[index] = unsupported; continue; }
      const row = await verifyBrandRegistryDomain(domain);
      const observed = normalizePackageEvidenceTimestamp(row.checkedAt), now = Date.now();
      const age = observed ? now - Date.parse(observed) : null;
      const freshness = age === null ? "unknown" : age < 0 ? "future" : age > NAME_PACKAGE_EVIDENCE_MAX_AGE_MS ? "stale" : "current";
      const source = brandRegistrySourceUrl(domain, row.source, row.checkMethod);
      const checked = source !== null && freshness === "current" && row.checkMethod === "rdap" && row.authoritative
        && (row.status === "available" || row.status === "taken");
      output[index] = brandEvidenceEntrySchema.parse({ id: `check:domain:${domain}`, target: domain, kind: "domain",
        state: checked ? "checked" : "unknown", freshness, source_url: source, observed_at: observed,
        statement: checked ? row.status === "available" ? "domain_available" : "domain_registered" : "domain_check_unavailable",
        origin: observed ? "provider_observation" : "none" });
    }
  }));
  return output;
}
