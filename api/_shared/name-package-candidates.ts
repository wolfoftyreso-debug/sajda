import { generateConnectorCandidates } from "./connector-candidates.js";
import { parseNamePackageSearchRequest, type NamePackageSearchRequest } from "./name-package-contract.js";
import { NAMES_API_TLDS } from "./names-contract.js";

export const NAME_PACKAGE_CANDIDATE_DOMAIN_LIMIT = 110;
export const NAME_PACKAGE_WEB_DOMAIN_LIMIT = 50;

/** Expand already-generated contextual/rule names into complete same-label
 * packages. The public browser flag only changes grouping, not provider access,
 * naming consent or any quota. Never spend beyond the normal UI work budget. */
export function expandNamePackageDomainMatrix<T extends { domain: string }>(
  candidates: readonly T[], tlds: readonly string[], maximumChecks = NAME_PACKAGE_WEB_DOMAIN_LIMIT,
): T[] {
  if (!tlds.length || tlds.some(tld => !NAMES_API_TLDS.includes(tld as typeof NAMES_API_TLDS[number]))
    || new Set(tlds).size !== tlds.length || !Number.isInteger(maximumChecks) || maximumChecks < 1
    || maximumChecks > NAME_PACKAGE_WEB_DOMAIN_LIMIT) throw new Error("Invalid name-package domain matrix.");
  const maximumLabels = Math.min(10, Math.floor(maximumChecks / tlds.length));
  const selected = new Map<string, T>();
  for (const candidate of candidates.slice(0, 120)) {
    if (selected.size >= maximumLabels) break;
    const match = /^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\.([a-z]+)$/u.exec(candidate.domain);
    if (!match || !NAMES_API_TLDS.includes(match[2] as typeof NAMES_API_TLDS[number]) || selected.has(match[1])) continue;
    selected.set(match[1], candidate);
  }
  return [...selected.entries()].flatMap(([label, candidate]) => tlds.map(tld => ({ ...candidate, domain: `${label}.${tld}` })));
}

/** Generate names first, then check every selected ending for each identical
 * label. A package is no longer an accidental group of unrelated search rows.
 * One request fits inside the existing 120-candidate connector reserve, retaining
 * its ordinary shared request quota, registry concurrency and provider deadlines. */
export function generateNamePackageCandidates(input: NamePackageSearchRequest): { labels: string[]; domains: string[] } {
  const parsed = parseNamePackageSearchRequest(input);
  const generated = generateConnectorCandidates({ query: parsed.query, tlds: parsed.tlds, count: 120, nameLanguage: parsed.nameLanguage });
  const labels = [...new Set(generated.map(candidate => candidate.label))].slice(0, parsed.count);
  const domains = labels.flatMap(label => parsed.tlds.map(tld => `${label}.${tld}`));
  if (!domains.length || domains.length > NAME_PACKAGE_CANDIDATE_DOMAIN_LIMIT) {
    throw new Error("Use a descriptive naming brief containing Latin-letter keywords.");
  }
  return { labels, domains };
}

/** Closed candidate membership; missing engine rows remain unknown evidence.
 * Only the ordinary intelligence projection may interpret the returned rows. */
export function completeNamePackageCandidateEvidence(payload: Record<string, unknown>, domains: readonly string[]): Record<string, unknown> {
  if (!Array.isArray(payload.results)) throw new Error("Name package search did not return candidate evidence.");
  const requested = new Set(domains);
  const rows = payload.results.filter(row => row && typeof row === "object" && !Array.isArray(row)
    && typeof row.domain === "string" && requested.has(row.domain));
  const observed = new Set(rows.map(row => row.domain));
  return { results: [...rows, ...domains.filter(domain => !observed.has(domain)).map(domain => ({
    domain, status: "unknown", authoritative: false, checkMethod: "none", source: null, checkedAt: null,
  }))] };
}
