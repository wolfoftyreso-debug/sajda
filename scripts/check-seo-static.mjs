import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SEO_PAGES, canonicalUrl, isNoindexBuild, resolveSeoBuildOrigin } from "./seo-routes.mjs";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const outputDirectory = resolve(projectRoot, process.argv[2] || "dist");
const canonicalOrigin = resolveSeoBuildOrigin();
const noindex = isNoindexBuild();
const expectedRobots = noindex
  ? "noindex, nofollow"
  : "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1";

async function readRequired(relativePath) {
  try {
    return await readFile(resolve(outputDirectory, relativePath), "utf8");
  } catch (error) {
    const label = error instanceof Error ? error.message : String(error);
    throw new Error(`SEO static check could not read ${relativePath}: ${label}`);
  }
}

async function readOptional(relativePath) {
  try {
    return await readFile(resolve(outputDirectory, relativePath), "utf8");
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") return null;
    throw error;
  }
}

function assertIncludes(value, expected, label) {
  if (!value.includes(expected)) {
    throw new Error(`SEO static check failed: ${label}`);
  }
}

function assertMatches(value, pattern, label) {
  if (!pattern.test(value)) {
    throw new Error(`SEO static check failed: ${label}`);
  }
}

function assertEqual(value, expected, label) {
  if (value !== expected) {
    throw new Error(`SEO static check failed: ${label}`);
  }
}

function readJsonLd(html, pagePath) {
  const blocks = [...html.matchAll(/<script\s+type=(['"])application\/ld\+json\1>([\s\S]*?)<\/script>/giu)];
  if (blocks.length !== 2) {
    throw new Error(`SEO static check failed: ${pagePath} must contain exactly two JSON-LD blocks`);
  }

  return blocks.map((block, index) => {
    try {
      return JSON.parse(block[2]);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`SEO static check failed: ${pagePath} JSON-LD block ${index + 1} is invalid: ${reason}`);
    }
  });
}

const sitemap = await readRequired("sitemap.xml");
const robots = await readRequired("robots.txt");
const appShell = await readRequired("index.html");
const serviceWorker = await readOptional("sw.js");

assertIncludes(appShell, '<meta name="robots" content="noindex, nofollow" />', "the interactive application shell must remain noindex");
if (serviceWorker && (/robots\.txt/iu.test(serviceWorker) || /sitemap\.xml/iu.test(serviceWorker))) {
  throw new Error("SEO static check failed: the service worker must not precache crawler-control files.");
}

assertMatches(sitemap, /<urlset\b[^>]*sitemaps\.org\/schemas\/sitemap\/0\.9/u, "sitemap.xml must be a sitemap urlset");
if (/<lastmod>/iu.test(sitemap)) {
  throw new Error("SEO static check failed: sitemap.xml must not claim a fresh modification date for every generated page.");
}

if (noindex) {
  assertMatches(robots, /^User-agent:\s*\*\s*\r?\nDisallow:\s*\/\s*$/u, "preview robots.txt must disallow crawling");
  if (/\bSitemap:/iu.test(robots) || /<url\b/iu.test(sitemap)) {
    throw new Error("SEO static check failed: a noindex preview must not publish a production sitemap.");
  }
} else {
  assertIncludes(robots, `Sitemap: ${canonicalOrigin}/sitemap.xml`, "robots.txt must point to the canonical sitemap");
}

for (const page of SEO_PAGES) {
  const filename = `${page.path.slice(1)}.html`;
  const html = await readRequired(filename);
  const canonical = canonicalUrl(page.path, canonicalOrigin);

  assertMatches(html, /<html\s+lang=["']sv-SE["']/iu, `${page.path} must declare sv-SE`);
  assertIncludes(html, `<title>${page.title}</title>`, `${page.path} title must be route-specific`);
  assertIncludes(html, `<link rel="canonical" href="${canonical}" />`, `${page.path} canonical must be self-referential`);
  assertIncludes(html, `<meta property="og:title" content="${page.title}" />`, `${page.path} Open Graph title must be route-specific`);
  assertIncludes(html, `<meta property="og:description" content="${page.description}" />`, `${page.path} Open Graph description must be route-specific`);
  assertIncludes(html, `<meta property="og:url" content="${canonical}" />`, `${page.path} Open Graph URL must match canonical`);
  assertIncludes(html, '<meta property="og:locale" content="sv_SE" />', `${page.path} Open Graph locale must be Swedish`);
  assertIncludes(html, `<meta name="twitter:title" content="${page.title}" />`, `${page.path} Twitter title must be route-specific`);
  assertIncludes(html, `<meta name="twitter:description" content="${page.description}" />`, `${page.path} Twitter description must be route-specific`);
  assertIncludes(html, `<meta name="robots" content="${expectedRobots}" />`, `${page.path} must carry the correct build-specific robots directive`);
  const robotsMetaCount = (html.match(/<meta\s+name=(['"])robots\1\s+content=/giu) || []).length;
  assertEqual(robotsMetaCount, 1, `${page.path} must not emit conflicting robots directives`);
  assertIncludes(html, `<h1>${page.h1}</h1>`, `${page.path} must contain a server-rendered H1`);
  const jsonLd = readJsonLd(html, page.path);
  const webPage = jsonLd.find((entry) => entry["@type"] === "WebPage");
  const breadcrumb = jsonLd.find((entry) => entry["@type"] === "BreadcrumbList");
  if (!webPage || !breadcrumb) {
    throw new Error(`SEO static check failed: ${page.path} must include WebPage and BreadcrumbList JSON-LD.`);
  }
  assertEqual(webPage.url, canonical, `${page.path} WebPage JSON-LD URL must match canonical`);
  assertEqual(webPage.inLanguage, "sv-SE", `${page.path} WebPage JSON-LD language must be Swedish`);
  assertEqual(breadcrumb.itemListElement?.[0]?.item, canonicalUrl("/se", canonicalOrigin), `${page.path} breadcrumb root must be the Swedish SEO home`);

  if (!noindex) {
    assertIncludes(sitemap, `<loc>${canonical}</loc>`, `${page.path} must be included in sitemap.xml`);
  }
}

console.log(`SEO static: OK (${SEO_PAGES.length} Swedish ${noindex ? "noindex preview" : "index-eligible"} routes).`);
