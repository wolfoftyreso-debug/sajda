/**
 * Marketplace listings represent transferable registrable domains, never a
 * hostname or a delegated subdomain. The database owns the final check; this
 * browser-side companion keeps invalid input out of drafts and gives sellers
 * an immediate, explicit result.
 *
 * The list intentionally covers the suffixes Sajda currently accepts for
 * marketplace listings. Add a suffix here and in the matching Neon migration
 * before exposing it in a seller flow. A broad hostname regex is
 * not enough: `www.example.com` and `shop.example.com` are hostnames, not
 * transferable registration assets.
 */
export const MARKETPLACE_REGISTRABLE_SUFFIXES = [
  "ac.nz", "ac.uk", "ac.jp", "ac.za", "ae", "ai", "app", "ar", "art", "asia", "at", "au",
  "be", "biz", "blog", "br", "ca", "ch", "chat", "city", "click", "cl", "club", "cloud", "cn",
  "co", "co.in", "co.jp", "co.ke", "co.nz", "co.uk", "co.za", "com", "com.ar", "com.au", "com.br",
  "com.cn", "com.co", "com.es", "com.hk", "com.mx", "com.my", "com.ng", "com.pe", "com.ph", "com.pk",
  "com.sa", "com.sg", "com.tr", "com.tw", "com.ua", "com.uy", "com.ve", "company", "consulting", "de",
  "design", "dev", "digital", "dk", "domains", "edu.au", "edu.cn", "edu.es", "edu.in", "email", "es",
  "eu", "events", "finance", "firm.in", "fi", "fr", "fun", "games", "gen.in", "global", "gov.au", "gov.cn",
  "govt.nz", "gr", "group", "hk", "id", "id.au", "ie", "in", "info", "io", "is", "it", "jp", "ke",
  "kr", "link", "live", "lt", "lu", "lv", "market", "media", "me", "mobi", "mx", "my", "name", "net",
  "net.au", "net.br", "net.cn", "net.in", "net.nz", "net.za", "network", "news", "ng", "nl", "no", "nu",
  "nz", "online", "org", "org.au", "org.br", "org.cn", "org.es", "org.in", "org.nz", "org.uk", "org.za",
  "pe", "ph", "pk", "pl", "pro", "pt", "qa", "ro", "ru", "sa", "se", "sg", "shop", "site", "sk",
  "software", "space", "store", "studio", "systems", "tech", "tel", "th", "today", "tools", "top", "tr",
  "travel", "tw", "ua", "uk", "us", "ve", "vip", "vn", "website", "works", "world", "xyz", "za",
] as const;

const marketplaceSuffixSet = new Set<string>(MARKETPLACE_REGISTRABLE_SUFFIXES);
const DOMAIN_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

function closestSupportedSuffix(labels: readonly string[]): string | null {
  for (let index = 0; index < labels.length; index += 1) {
    const suffix = labels.slice(index).join(".");
    if (marketplaceSuffixSet.has(suffix)) return suffix;
  }
  return null;
}

/**
 * Normalises one apex domain only. A protocol and one root trailing slash are
 * harmless paste artifacts; `www`, paths, ports, credentials, and subdomains
 * are rejected rather than silently rewritten to a different asset.
 */
export function normalizeMarketplaceApexDomain(value: string): string | null {
  let source = value.trim().toLowerCase();
  if (!source) return null;

  source = source.replace(/^https?:\/\//i, "");
  source = source.replace(/\/+$/, "").replace(/\.$/, "");
  if (!source || source.startsWith("www.") || /[\s/?#@:%]/.test(source)) return null;
  if (source.length < 3 || source.length > 253) return null;

  const labels = source.split(".");
  if (labels.some((label) => !DOMAIN_LABEL_PATTERN.test(label))) return null;

  const suffix = closestSupportedSuffix(labels);
  if (!suffix) return null;

  const suffixLabels = suffix.split(".").length;
  return labels.length === suffixLabels + 1 ? source : null;
}

export function isMarketplaceApexDomain(value: string): boolean {
  return normalizeMarketplaceApexDomain(value) !== null;
}
