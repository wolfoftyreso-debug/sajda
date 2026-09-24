import type { NamePackage } from "../../shared/name-packages";

/** Counts displayed packages, not domains or legal clearances. Categories are disjoint. */
export function summarizePackageResults(packages: readonly NamePackage[], requiredTlds?: readonly string[]) {
  let available = 0, registered = 0, unconfirmed = 0;
  for (const pkg of packages) {
    const domains = requiredTlds?.length ? [...new Set(requiredTlds.map(tld => tld.trim().toLowerCase().replace(/^\./u, "")))].map(tld => pkg.domains.find(domain => domain.domain === `${pkg.label}.${tld}`)) : pkg.domains;
    const current = (domain: NamePackage["domains"][number] | undefined) => domain?.evidenceStatus === "fresh" && domain.availabilityVerified;
    if (domains.some(domain => current(domain) && domain?.status === "available")) available++;
    else if (domains.length > 0 && domains.every(domain => current(domain) && domain?.status === "taken")) registered++;
    else unconfirmed++;
  }
  return { count: packages.length, available, registered, unconfirmed };
}
