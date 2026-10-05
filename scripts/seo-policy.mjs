/**
 * Single crawl/indexing policy for HTML meta, X-Robots-Tag, robots.txt,
 * sitemaps, IndexNow, and verification tags. Build, middleware, and checks
 * must call these helpers instead of inventing a second set of rules.
 */

export const DEFAULT_SEO_ORIGIN = "https://sajda.dev";

export const SEO_INDEX_ROBOTS =
  "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1";
export const SEO_NOINDEX_ROBOTS = "noindex, nofollow";

export const SITEMAP_PAGES_PATH = "/sitemap-pages.xml";

/** Search crawlers follow the site indexing mode for public documents. */
export const SEARCH_CRAWLERS = Object.freeze([
  "Googlebot",
  "Bingbot",
  "DuckDuckBot",
  "Applebot",
  "Yandex",
]);

/** Training/answer crawlers. Disallow while noindex; keep them off the
 * public corpus even after search indexing is enabled unless an operator
 * later publishes a dedicated allow list. */
export const AI_TRAINING_CRAWLERS = Object.freeze([
  "GPTBot",
  "ClaudeBot",
  "PerplexityBot",
  "Google-Extended",
  "CCBot",
  "anthropic-ai",
  "Bytespider",
]);

/** Application, account, and API surfaces stay out of every crawl mode. */
export const PRIVATE_CRAWL_PATHS = Object.freeze([
  "/account",
  "/admin",
  "/api",
  "/auth",
  "/brand-index",
  "/connect",
  "/history",
  "/install",
  "/marketplace",
  "/my-domains",
  "/name-packages",
  "/plus",
  "/pricing",
  "/projects",
  "/swipe",
  "/top-10-today",
  "/watchlist",
]);

/**
 * UI languages. Only locales with a published SEO surface emit hreflang.
 * Do not invent translated acquisition URLs before those pages exist.
 */
export const SEO_LOCALES = Object.freeze([
  { language: "sv", hreflang: "sv-SE", pathPrefix: "/se", published: true, xDefault: true, ogLocale: "sv_SE" },
  { language: "en", hreflang: "en", pathPrefix: "/en", published: false, xDefault: false, ogLocale: "en_US" },
  { language: "es", hreflang: "es", pathPrefix: "/es", published: false, xDefault: false, ogLocale: "es_ES" },
  { language: "fr", hreflang: "fr", pathPrefix: "/fr", published: false, xDefault: false, ogLocale: "fr_FR" },
  { language: "zh", hreflang: "zh-Hans", pathPrefix: "/zh", published: false, xDefault: false, ogLocale: "zh_CN" },
]);

export function normalizeSeoOrigin(value) {
  const candidate = value?.trim() || DEFAULT_SEO_ORIGIN;
  const url = new URL(candidate);

  if (url.protocol !== "https:") {
    throw new Error("SAJDA_CANONICAL_ORIGIN must use https.");
  }

  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("SAJDA_CANONICAL_ORIGIN must be a bare origin, for example https://sajda.dev.");
  }

  return url.origin;
}

export function resolveSeoOrigin(value = process.env.SAJDA_CANONICAL_ORIGIN) {
  return normalizeSeoOrigin(value);
}

export function resolveSeoBuildOrigin(environment = process.env) {
  const staticOrigin = normalizeSeoOrigin(environment.SAJDA_CANONICAL_ORIGIN);
  const browserOrigin = normalizeSeoOrigin(environment.VITE_SAJDA_CANONICAL_ORIGIN);

  if (staticOrigin !== browserOrigin) {
    throw new Error(
      "SAJDA_CANONICAL_ORIGIN and VITE_SAJDA_CANONICAL_ORIGIN must resolve to the same HTTPS origin.",
    );
  }

  return staticOrigin;
}

export function isIndexableCanonicalOrigin(origin) {
  try {
    const host = new URL(origin).hostname.toLowerCase();
    if (host.endsWith(".vercel.app") || host.endsWith(".vercel.dev")) return false;
    if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") return false;
    return true;
  } catch {
    return false;
  }
}

export function isNoindexBuild(environment = process.env) {
  // Preview and development deployments are never a second search surface.
  // This check deliberately comes before an operator override: allowing an
  // accidental `SAJDA_SEO_INDEXING=index` in Preview would expose canonical
  // production pages from a non-production host.
  const vercelEnvironment = environment.VERCEL_ENV?.trim();
  if (vercelEnvironment && vercelEnvironment !== "production") return true;

  if (environment.SAJDA_SEO_INDEXING?.trim() === "noindex") return true;

  if (environment.SAJDA_SEO_INDEXING?.trim() === "index") {
    // A Vercel preview host is never the final branded search origin. Flipping
    // SAJDA_SEO_INDEXING=index is not enough until SAJDA_CANONICAL_ORIGIN is
    // a real launch domain.
    const origin = normalizeSeoOrigin(environment.SAJDA_CANONICAL_ORIGIN);
    if (!isIndexableCanonicalOrigin(origin)) return true;
    return false;
  }

  // Missing, empty or misspelled production settings must not publish a new
  // search surface. An explicit index decision is required for production.
  if (vercelEnvironment === "production") return true;

  return false;
}

export function htmlRobotsContent(noindex) {
  return noindex ? SEO_NOINDEX_ROBOTS : SEO_INDEX_ROBOTS;
}

export function localizedSeoPath(path, locale) {
  if (locale.language === "sv") return path;
  if (path === "/se" || path.startsWith("/se/")) {
    return `${locale.pathPrefix}${path.slice(3)}`;
  }
  if (path === "/") return locale.pathPrefix;
  return `${locale.pathPrefix}${path}`;
}

export function hreflangAlternates(canonicalPath, origin) {
  const links = [];
  for (const locale of SEO_LOCALES) {
    if (!locale.published) continue;
    const href = `${origin}${localizedSeoPath(canonicalPath, locale)}`;
    links.push({ hreflang: locale.hreflang, href });
    if (locale.xDefault) links.push({ hreflang: "x-default", href });
  }
  return links;
}

function crawlRules(userAgent, disallowPaths) {
  return [`User-agent: ${userAgent}`, ...disallowPaths.map((path) => `Disallow: ${path}`)].join("\n");
}

export function robotsTxt(noindex, origin) {
  const namedBots = [...SEARCH_CRAWLERS, ...AI_TRAINING_CRAWLERS];
  if (noindex) {
    return [
      crawlRules("*", ["/"]),
      ...namedBots.map((agent) => crawlRules(agent, ["/"])),
    ].join("\n\n") + "\n";
  }

  return [
    ["User-agent: *", "Allow: /", ...PRIVATE_CRAWL_PATHS.map((path) => `Disallow: ${path}`)].join("\n"),
    ...SEARCH_CRAWLERS.map((agent) =>
      ["User-agent: " + agent, "Allow: /", ...PRIVATE_CRAWL_PATHS.map((path) => `Disallow: ${path}`)].join("\n"),
    ),
    ...AI_TRAINING_CRAWLERS.map((agent) => crawlRules(agent, ["/"])),
    `Sitemap: ${origin}/sitemap.xml`,
  ].join("\n\n") + "\n";
}

export function sitemapLastmod(environment = process.env) {
  const value = environment.SAJDA_SITEMAP_LASTMOD?.trim();
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  return value;
}

export function emptySitemapXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>\n`;
}

export function sitemapIndexXml(origin, lastmod = null) {
  const lastmodLine = lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : "";
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <sitemap>\n    <loc>${origin}${SITEMAP_PAGES_PATH}</loc>${lastmodLine}\n  </sitemap>\n</sitemapindex>\n`;
}

export function sitemapPagesXml(urls, lastmod = null) {
  const lastmodLine = lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : "";
  const entries = urls.map((url) => `  <url>\n    <loc>${url}</loc>${lastmodLine}\n  </url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${
    entries.length ? `\n${entries.join("\n")}\n` : ""
  }</urlset>\n`;
}

const VERIFICATION_TOKEN = /^[\w-]{8,128}$/u;

export function siteVerificationTags(environment = process.env) {
  const tags = [];
  const google = environment.SAJDA_GOOGLE_SITE_VERIFICATION?.trim();
  const bing = environment.SAJDA_BING_SITE_VERIFICATION?.trim();
  if (google && VERIFICATION_TOKEN.test(google)) {
    tags.push({ name: "google-site-verification", content: google });
  }
  if (bing && VERIFICATION_TOKEN.test(bing)) {
    tags.push({ name: "msvalidate.01", content: bing });
  }
  return tags;
}

const INDEXNOW_KEY = /^[a-fA-F0-9-]{8,128}$/u;

export function resolveIndexNowKey(environment = process.env) {
  const key = environment.SAJDA_INDEXNOW_KEY?.trim() ?? "";
  return INDEXNOW_KEY.test(key) ? key : null;
}

export function indexNowKeyPath(key) {
  return `/${key}.txt`;
}

export function shouldPublishIndexNow(environment = process.env) {
  return !isNoindexBuild(environment) && Boolean(resolveIndexNowKey(environment));
}

export function indexNowSubmission(environment = process.env) {
  const noindex = isNoindexBuild(environment);
  const key = resolveIndexNowKey(environment);
  if (noindex) return { submit: false, reason: "noindex" };
  if (!key) return { submit: false, reason: "missing_key" };
  return { submit: true, reason: "index", key };
}

export function organizationStructuredData(origin) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Sajda",
    url: `${origin}/se`,
    logo: `${origin}/og.png`,
  };
}

export function websiteStructuredData(origin) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Sajda",
    url: `${origin}/se`,
    inLanguage: "sv-SE",
    publisher: { "@type": "Organization", name: "Sajda", url: `${origin}/se` },
    potentialAction: {
      "@type": "SearchAction",
      target: `${origin}/se/sok-doman?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}
