/**
 * Strict request contract shared by the protected server-to-server integration API
 * and the no-key public developer API. Keeping it here prevents a feature
 * from accidentally being available to one surface but undocumented on the
 * other.
 */

export type NamesApiLocale = "en" | "sv" | "es" | "fr" | "zh";
export type NamesApiCreativeMode = "light" | "medium" | "heavy" | "deep";

export const NAMES_API_MAX_BODY_BYTES = 6_144;
export const NAMES_API_MAX_QUERY_CHARS = 100;
export const NAMES_API_MAX_EXACT_DOMAINS = 10;
export const NAMES_API_MAX_COUNT = 10;

export const NAMES_API_TLDS = [
  "com", "net", "org", "app", "dev", "ai", "xyz", "info", "biz", "se", "nu",
] as const;

export const NAMES_API_PROVIDERS = [
  "loopia", "cloudflare", "godaddy", "namecheap", "porkbun", "dynadot", "route53", "onecom",
  "ionos", "ovhcloud", "squarespace", "hostinger", "gandi", "hover", "spaceship", "namecom",
  "namesilo", "alibabacloud", "internetbs", "wix",
] as const;

const allowedTlds = new Set<string>(NAMES_API_TLDS);
const allowedProviders = new Set<string>(NAMES_API_PROVIDERS);
const supportedLocales = new Set<NamesApiLocale>(["en", "sv", "es", "fr", "zh"]);
const creativeModes = new Set<NamesApiCreativeMode>(["light", "medium", "heavy", "deep"]);
const allowedBodyKeys = new Set(["query", "domains", "tlds", "count", "locale", "providers", "creativeMode"]);
const domainPattern = /^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\.(com|net|org|app|dev|ai|xyz|info|biz|se|nu)$/u;

export type NamesApiRequest = {
  theme: string;
  tlds: string[];
  count: number;
  locale: NamesApiLocale;
  providers: string[];
  domains?: string[];
  creativeMode?: NamesApiCreativeMode;
};

function requireString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string") throw new Error(`${field} must be a string.`);
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new Error(`${field} must be no longer than ${maxLength} characters.`);
  return normalized;
}

function parseTlds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > NAMES_API_TLDS.length) {
    throw new Error(`tlds must contain 1–${NAMES_API_TLDS.length} supported TLDs.`);
  }
  const tlds: string[] = [];
  for (const valueItem of value) {
    if (typeof valueItem !== "string") throw new Error("Each TLD must be a string.");
    const tld = valueItem.trim().toLowerCase().replace(/^\./u, "");
    if (!allowedTlds.has(tld) || tlds.includes(tld)) {
      throw new Error("Each TLD must be a unique supported TLD.");
    }
    tlds.push(tld);
  }
  return tlds;
}

function parseDomains(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length < 1 || value.length > NAMES_API_MAX_EXACT_DOMAINS) {
    throw new Error(`domains must contain 1–${NAMES_API_MAX_EXACT_DOMAINS} exact domains.`);
  }
  const domains: string[] = [];
  for (const valueItem of value) {
    const domain = requireString(valueItem, "Each domain", 253).toLowerCase();
    if (!domainPattern.test(domain) || domains.includes(domain)) {
      throw new Error("Each domain must be a unique, fully-qualified domain with a supported TLD.");
    }
    domains.push(domain);
  }
  return domains;
}

function parseProviders(value: unknown): string[] {
  if (value === undefined) return ["loopia"];
  if (!Array.isArray(value) || value.length < 1 || value.length > NAMES_API_PROVIDERS.length) {
    throw new Error(`providers must contain 1–${NAMES_API_PROVIDERS.length} supported provider IDs.`);
  }
  const providers: string[] = [];
  for (const valueItem of value) {
    if (typeof valueItem !== "string") throw new Error("Each provider must be a string.");
    const provider = valueItem.trim().toLowerCase();
    if (!allowedProviders.has(provider) || providers.includes(provider)) {
      throw new Error("Each provider must be a unique supported provider ID.");
    }
    providers.push(provider);
  }
  return providers;
}

/**
 * Parses the stable, documented API subset. The anonymous product route
 * deliberately retains its richer UI-only inputs; public API users should
 * depend only on this strict contract.
 */
export function parseNamesApiRequest(body: Record<string, unknown>): NamesApiRequest {
  for (const key of Object.keys(body)) {
    if (!allowedBodyKeys.has(key)) throw new Error(`Unsupported field: ${key}.`);
  }

  const query = body.query === undefined ? "" : requireString(body.query, "query", NAMES_API_MAX_QUERY_CHARS);
  const domains = parseDomains(body.domains);
  const tlds = parseTlds(body.tlds);
  if (domains?.some((domain) => !tlds.includes(domain.split(".").at(-1)!))) {
    throw new Error("Each exact domain must use one of the selected TLDs.");
  }
  const countValue = body.count ?? NAMES_API_MAX_COUNT;
  if (!Number.isInteger(countValue) || typeof countValue !== "number" || countValue < 1 || countValue > NAMES_API_MAX_COUNT) {
    throw new Error(`count must be an integer from 1 to ${NAMES_API_MAX_COUNT}.`);
  }
  const localeValue = body.locale ?? "en";
  if (typeof localeValue !== "string" || !supportedLocales.has(localeValue as NamesApiLocale)) {
    throw new Error("locale must be one of en, sv, es, fr, or zh.");
  }
  const creativeModeValue = body.creativeMode;
  if (creativeModeValue !== undefined && (typeof creativeModeValue !== "string" || !creativeModes.has(creativeModeValue as NamesApiCreativeMode))) {
    throw new Error("creativeMode must be one of light, medium, heavy, or deep.");
  }

  return {
    theme: query,
    ...(domains ? { domains } : {}),
    tlds,
    count: countValue,
    locale: localeValue as NamesApiLocale,
    providers: parseProviders(body.providers),
    ...(creativeModeValue ? { creativeMode: creativeModeValue as NamesApiCreativeMode } : {}),
  };
}
