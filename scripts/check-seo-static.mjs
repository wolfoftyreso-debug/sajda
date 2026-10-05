import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "cheerio";
import {
  AI_TRAINING_CRAWLERS,
  PRIVATE_CRAWL_PATHS,
  SEARCH_CRAWLERS,
  SEO_PAGES,
  SITEMAP_PAGES_PATH,
  canonicalUrl,
  hreflangAlternates,
  htmlRobotsContent,
  indexNowKeyPath,
  isNoindexBuild,
  resolveIndexNowKey,
  resolveSeoBuildOrigin,
  shouldPublishIndexNow,
  siteVerificationTags,
} from "./seo-routes.mjs";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const outputDirectory = resolve(projectRoot, process.argv[2] || "dist");
const canonicalOrigin = resolveSeoBuildOrigin();
const noindex = isNoindexBuild();
const expectedRobots = htmlRobotsContent(noindex);
const read = name => readFile(resolve(outputDirectory, name), "utf8");
const sitemap = load(await read("sitemap.xml"), { xmlMode: true });
const sitemapPages = load(await read("sitemap-pages.xml"), { xmlMode: true });
const robots = await read("robots.txt");
const appShell = load(await read("index.html"));
let serviceWorker = "";
try { serviceWorker = await read("sw.js"); } catch (error) { if (error.code !== "ENOENT") throw error; }

assert.equal(appShell('meta[name="robots"]').attr("content"), "noindex, nofollow", "interactive shell must remain noindex");
assert.equal(appShell('meta[property="og:image"]').attr("content"), `${canonicalOrigin}/og.png`, "the app shell needs a share image");
assert.equal(appShell('meta[name="twitter:card"]').attr("content"), "summary_large_image");
assert.equal(appShell('meta[name="twitter:image"]').attr("content"), `${canonicalOrigin}/og.png`);
assert.equal(appShell('meta[name="sajda-seo-indexing"]').length, 1, "one immutable build policy");
assert.equal(appShell('meta[name="sajda-seo-indexing"]').attr("content"), noindex ? "noindex" : "index");
for (const tag of siteVerificationTags()) {
  assert.equal(appShell(`meta[name="${tag.name}"]`).attr("content"), tag.content, tag.name);
}
assert.doesNotMatch(serviceWorker, /robots\.txt|sitemap\.xml|sitemap-pages\.xml/iu, "crawler controls must never be precached");
assert.equal(sitemapPages("urlset").attr("xmlns"), "http://www.sitemaps.org/schemas/sitemap/0.9");
const pageUrls = sitemapPages("url > loc").map((_, node) => sitemapPages(node).text()).get();
const expectedUrls = noindex ? [] : SEO_PAGES.map(page => canonicalUrl(page.path, canonicalOrigin));
assert.deepEqual([...pageUrls].sort(), [...expectedUrls].sort(), "page sitemap must contain exactly the approved canonical URLs");
if (noindex) {
  assert.equal(sitemap("urlset").attr("xmlns"), "http://www.sitemaps.org/schemas/sitemap/0.9");
  assert.equal(sitemap("url").length, 0, "noindex sitemap index stays an empty well-formed urlset");
  assert.equal(sitemap("lastmod").length, 0);
  assert.equal(sitemapPages("lastmod").length, 0);
  assert.match(robots, /User-agent:\s*\*\s*\r?\nDisallow:\s*\//u);
  assert.doesNotMatch(robots, /Sitemap:/iu);
  for (const agent of [...SEARCH_CRAWLERS, ...AI_TRAINING_CRAWLERS]) {
    assert.match(robots, new RegExp(`User-agent:\\s*${agent}\\s*\\r?\\nDisallow:\\s*/`, "u"), agent);
  }
} else {
  assert.equal(sitemap("sitemapindex").attr("xmlns"), "http://www.sitemaps.org/schemas/sitemap/0.9");
  assert.deepEqual(sitemap("sitemap > loc").map((_, node) => sitemap(node).text()).get(), [`${canonicalOrigin}${SITEMAP_PAGES_PATH}`]);
  assert.match(robots, /Allow:\s*\//u);
  assert.ok(robots.includes(`Sitemap: ${canonicalOrigin}/sitemap.xml`));
  for (const path of PRIVATE_CRAWL_PATHS) assert.match(robots, new RegExp(`Disallow:\\s*${path.replaceAll("/", "\\/")}`, "u"), path);
  for (const agent of SEARCH_CRAWLERS) assert.match(robots, new RegExp(`User-agent:\\s*${agent}`, "u"), agent);
  for (const agent of AI_TRAINING_CRAWLERS) {
    assert.match(robots, new RegExp(`User-agent:\\s*${agent}\\s*\\r?\\nDisallow:\\s*/`, "u"), agent);
  }
}
if (shouldPublishIndexNow()) {
  const key = resolveIndexNowKey();
  assert.equal(await read(indexNowKeyPath(key).slice(1)), `${key}\n`);
} else {
  assert.equal(shouldPublishIndexNow(), false, "IndexNow key file is not published while noindex");
}

const knownPaths = new Set(SEO_PAGES.map(page => page.path));
const allowedProductPaths = new Set(["/", "/legal"]);
const allowedSources = new Set(["https://www.registry.google/domains/app/", "https://www.registry.google/domains/dev/"]);
const graph = new Map();
for (const key of ["path", "title", "description", "h1"]) {
  assert.equal(new Set(SEO_PAGES.map(page => page[key])).size, SEO_PAGES.length, `unique ${key} per intended page`);
}
for (const page of SEO_PAGES) {
  const $ = load(await read(`${page.path.slice(1)}.html`));
  const canonical = canonicalUrl(page.path, canonicalOrigin);
  assert.equal($("html").attr("lang"), "sv-SE", page.path);
  assert.equal($("title").text(), page.title, page.path);
  assert.equal($('meta[name="description"]').attr("content"), page.description, page.path);
  assert.equal($('meta[name="robots"]').length, 1, page.path);
  assert.equal($('meta[name="robots"]').attr("content"), expectedRobots, page.path);
  assert.equal($('meta[name="sajda-seo-indexing"]').length, 1, page.path);
  assert.equal($('meta[name="sajda-seo-indexing"]').attr("content"), noindex ? "noindex" : "index", page.path);
  assert.equal($('link[rel="canonical"]').length, 1, page.path);
  assert.equal($('link[rel="canonical"]').attr("href"), canonical, page.path);
  const alternates = hreflangAlternates(page.path, canonicalOrigin);
  assert.deepEqual(
    $('link[rel="alternate"][hreflang]').toArray().map(node => [$(node).attr("hreflang"), $(node).attr("href")]),
    alternates.map(link => [link.hreflang, link.href]),
    "hreflang must list only published locales plus x-default",
  );
  assert.equal($('link[hreflang="sv-SE"]').attr("href"), canonical, page.path);
  assert.equal($('link[hreflang="x-default"]').attr("href"), canonical, page.path);
  assert.equal($('link[hreflang="en"]').length, 0, "do not invent unbuilt translated SEO URLs");
  for (const [key, value] of Object.entries({
    "og:title": page.title, "og:description": page.description, "og:url": canonical, "og:locale": "sv_SE",
  })) assert.equal($(`meta[property="${key}"]`).attr("content"), value, page.path);
  assert.equal($('meta[property="og:image"]').attr("content"), `${canonicalOrigin}/og.png`, page.path);
  assert.equal($('meta[property="og:image:width"]').attr("content"), "1200", page.path);
  assert.equal($('meta[property="og:image:height"]').attr("content"), "630", page.path);
  assert.equal($('meta[name="twitter:card"]').attr("content"), "summary_large_image", page.path);
  assert.equal($('meta[name="twitter:image"]').attr("content"), `${canonicalOrigin}/og.png`, page.path);
  assert.equal($('meta[name="twitter:title"]').attr("content"), page.title);
  assert.equal($('meta[name="twitter:description"]').attr("content"), page.description);
  assert.equal($("main").length, 1, "one main landmark");
  assert.equal($("h1").length, 1, "one actual product H1");
  assert.equal($("h1").text().trim(), page.h1, page.path);
  const records = $('script[type="application/ld+json"]').map((_, node) => JSON.parse($(node).text())).get();
  assert.equal(records.length, page.path === "/se" ? 3 : 4, page.path);
  assert.equal($('script[type="application/ld+json"][data-sajda-seo-document]').length, records.length);
  const webPage = records.find(item => item["@type"] === "WebPage");
  assert.equal(webPage?.url, canonical, page.path);
  assert.equal(webPage?.name, page.h1, page.path);
  assert.equal(webPage?.inLanguage, "sv-SE", page.path);
  assert.equal(webPage?.isPartOf?.url, `${canonicalOrigin}/se`, "website reference must be an indexable public entry");
  const organization = records.find(item => item["@type"] === "Organization");
  assert.equal(organization?.url, `${canonicalOrigin}/se`, page.path);
  const website = records.find(item => item["@type"] === "WebSite");
  assert.equal(website?.url, `${canonicalOrigin}/se`, page.path);
  assert.equal(website?.potentialAction?.["@type"], "SearchAction", page.path);
  const breadcrumb = records.find(item => item["@type"] === "BreadcrumbList");
  if (page.path !== "/se") {
    assert.ok(breadcrumb?.itemListElement.length >= 2, page.path);
    assert.equal(breadcrumb.itemListElement.at(-1).item, canonical, page.path);
    for (const [index, item] of breadcrumb.itemListElement.entries()) {
      assert.equal(item.position, index + 1);
      assert.ok(knownPaths.has(new URL(item.item).pathname), "breadcrumb destinations must exist");
    }
  }
  // The actual product module and FAQs are present before JavaScript executes.
  if (page.path !== "/se/sa-fungerar-sajda") {
    assert.equal($("form").length, 1, page.path);
    assert.ok($("details summary").length >= 2, `${page.path}: server-rendered FAQ`);
    assert.equal($("form input[name]").length, 0, "domain ideas may not become GET query strings without JavaScript");
    assert.ok($("noscript").text().includes("JavaScript"), "explicit non-JavaScript product state");
  }
  const links = new Set();
  for (const node of $("a[href]").toArray()) {
    const href = $(node).attr("href");
    assert.ok(knownPaths.has(href) || allowedProductPaths.has(href) || allowedSources.has(href), `${page.path}: unknown link ${href}`);
    if (knownPaths.has(href)) links.add(href);
  }
  graph.set(page.path, links);
  for (const asset of $('script[type="module"][src], link[rel="stylesheet"][href]').toArray()) {
    const href = $(asset).attr("src") ?? $(asset).attr("href");
    assert.ok(href.startsWith("/assets/"), "built Vite asset path");
    await read(href.slice(1));
  }
}
const reachable = new Set();
const pending = ["/se"];
while (pending.length) {
  const path = pending.pop();
  if (reachable.has(path)) continue;
  reachable.add(path);
  pending.push(...graph.get(path));
}
assert.equal(reachable.size, SEO_PAGES.length, "every sitemap page must be reachable from the Swedish hub");
console.log(`SEO static: OK (${SEO_PAGES.length} Swedish ${noindex ? "noindex preview" : "index-eligible"} routes; HTML content, metadata, structured data, assets and crawl graph).`);
