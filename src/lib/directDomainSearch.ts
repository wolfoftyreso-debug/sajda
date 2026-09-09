import { isPublicSearchMode } from "@/lib/anonymousSearchMode";

/**
 * Turns an explicit domain entry into a bounded set of registry checks.
 *
 * Supported examples:
 *   saida.com, saida.dev, saida.ai
 *   saida.com .dev .ai
 *   saida .com .dev .ai
 *
 * The server still validates every domain independently. This parser only
 * keeps the input understandable and prevents a full domain from being
 * mistaken for a creative naming theme.
 */
const SUPPORTED_TLDS = new Set([
  "com",
  "net",
  "org",
  "app",
  "dev",
  "ai",
  "xyz",
  "info",
  "biz",
  "se",
  "nu",
  "io",
]);

const MAX_DIRECT_DOMAINS = 12;
const PUBLIC_UNVERIFIABLE_TLDS = new Set(["io"]);
const LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
const FULL_DOMAIN_PATTERN = /^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\.([a-z]{2,24})$/i;
const TLD_SUFFIX_PATTERN = /^\.([a-z]{2,24})$/i;

export interface DirectDomainSearch {
  domains: string[];
  tlds: string[];
  /** Public-mode suffixes deliberately blocked before a false check can run. */
  blockedTlds: string[];
  /** A safe fallback theme for older deployments that do not support domains. */
  fallbackTheme: string;
}

function normaliseToken(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/[),;:!?]+$/g, "")
    .replace(/\/$/, "");
}

function getSupportedTld(value: string | undefined): string | null {
  if (!value) return null;
  const tld = value.toLowerCase();
  if (!SUPPORTED_TLDS.has(tld)) return null;
  if (isPublicSearchMode() && PUBLIC_UNVERIFIABLE_TLDS.has(tld)) return null;
  return tld;
}

function isBlockedPublicTld(value: string | undefined): boolean {
  return Boolean(value)
    && isPublicSearchMode()
    && PUBLIC_UNVERIFIABLE_TLDS.has(value.toLowerCase());
}

function getBareLabel(value: string): string | null {
  const label = value.toLowerCase();
  return LABEL_PATTERN.test(label) ? label : null;
}

/**
 * Returns no domains until the user has entered an unambiguous exact-domain
 * syntax. Ordinary themes such as "health platform" remain creative searches.
 */
export function parseDirectDomainSearch(value: string): DirectDomainSearch {
  const tokens = value
    .split(/[\s,;\n]+/)
    .map(normaliseToken)
    .filter(Boolean);
  const domains: string[] = [];
  const labels: string[] = [];
  const blockedTlds: string[] = [];
  let activeLabel: string | null = null;

  const addDomain = (label: string, tld: string) => {
    const domain = `${label}.${tld}`;
    if (!domains.includes(domain) && domains.length < MAX_DIRECT_DOMAINS) {
      domains.push(domain);
    }
    if (!labels.includes(label)) labels.push(label);
  };
  const addBlockedTld = (tld: string | undefined) => {
    if (!tld || !isBlockedPublicTld(tld) || blockedTlds.includes(tld.toLowerCase())) return;
    blockedTlds.push(tld.toLowerCase());
  };

  for (let index = 0; index < tokens.length && domains.length < MAX_DIRECT_DOMAINS; index += 1) {
    const token = tokens[index]!;
    const fullDomain = token.match(FULL_DOMAIN_PATTERN);
    if (fullDomain) {
      const label = getBareLabel(fullDomain[1]!);
      const rawTld = fullDomain[2];
      const tld = getSupportedTld(rawTld);
      if (label && tld) {
        activeLabel = label;
        addDomain(label, tld);
      } else {
        addBlockedTld(rawTld);
        activeLabel = null;
      }
      continue;
    }

    const suffix = token.match(TLD_SUFFIX_PATTERN);
    const rawSuffixTld = suffix?.[1];
    const tld = getSupportedTld(rawSuffixTld);
    if (tld && activeLabel) {
      addDomain(activeLabel, tld);
      continue;
    }
    addBlockedTld(rawSuffixTld);
    if (suffix) activeLabel = null;

    // `saida .com .dev .ai`: treat a bare label as an exact search only when
    // it is immediately followed by a supported dotted extension.
    const nextSuffix = tokens[index + 1]?.match(TLD_SUFFIX_PATTERN);
    const rawNextTld = nextSuffix?.[1];
    const nextTld = getSupportedTld(rawNextTld);
    const label = getBareLabel(token);
    if (label && nextTld) activeLabel = label;
    if (label && !nextTld) addBlockedTld(rawNextTld);
  }

  // Exact checks can include up to twelve names. Keep the companion TLD list
  // in step with that boundary, even though the server primarily uses
  // `domains` for the exact check itself.
  const tlds = Array.from(new Set(domains.map((domain) => domain.split(".").at(-1)!))).slice(0, 12);
  return {
    domains,
    tlds,
    blockedTlds,
    fallbackTheme: labels.join(" "),
  };
}
