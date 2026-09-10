import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "cheerio";
import { SEO_PAGES, canonicalUrl, isNoindexBuild, resolveSeoBuildOrigin } from "./seo-routes.mjs";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const outputDirectory = resolve(projectRoot, process.argv[2] || "dist");
const canonicalOrigin = resolveSeoBuildOrigin();
const noindex = isNoindexBuild();
const expectedRobots = noindex
  ? "noindex, nofollow"
  : "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1";
const read = name => readFile(resolve(outputDirectory, name), "utf8");
const sitemap = load(await read("sitemap.xml"), { xmlMode: true });
const robots = await read("robots.txt");
const appShell = load(await read("index.html"));
let serviceWorker = "";
try { serviceWorker = await read("sw.js"); } catch (error) { if (error.code !== "ENOENT") throw error; }

assert.equal(appShell('meta[name="robots"]').attr("content"), "noindex, nofollow", "interactive shell must remain noindex");
assert.equal(appShell('meta[name="sajda-seo-indexing"]').length, 1, "one immutable build policy");
assert.equal(appShell('meta[name="sajda-seo-indexing"]').attr("content"), noindex ? "noindex" : "index");
assert.doesNotMatch(serviceWorker, /robots\.txt|sitemap\.xml/iu, "crawler controls must never be precached");
assert.equal(sitemap("urlset").attr("xmlns"), "http://www.sitemaps.org/schemas/sitemap/0.9");
assert.equal(sitemap("lastmod").length, 0, "build time is not an editorial modification date");
const urls = sitemap("url > loc").map((_, node) => sitemap(node).text()).get();
const expectedUrls = noindex ? [] : SEO_PAGES.map(page => canonicalUrl(page.path, canonicalOrigin));
assert.deepEqual([...urls].sort(), [...expectedUrls].sort(), "sitemap must contain exactly the approved canonical URLs");
if (noindex) {
  assert.match(robots, /^User-agent:\s*\*\s*\r?\nDisallow:\s*\/\s*$/u);
  assert.doesNotMatch(robots, /Sitemap:/iu);
} else {
  assert.match(robots, /Allow:\s*\//u);
  assert.ok(robots.includes(`Sitemap: ${canonicalOrigin}/sitemap.xml`));
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
  assert.equal($('link[rel="alternate"][hreflang]').length, 1, "do not invent unbuilt translated SEO URLs");
  assert.equal($('link[hreflang="sv-SE"]').attr("href"), canonical, page.path);
  for (const [key, value] of Object.entries({
    "og:title": page.title, "og:description": page.description, "og:url": canonical, "og:locale": "sv_SE",
  })) assert.equal($(`meta[property="${key}"]`).attr("content"), value, page.path);
  assert.equal($('meta[name="twitter:title"]').attr("content"), page.title);
  assert.equal($('meta[name="twitter:description"]').attr("content"), page.description);
  assert.equal($("main").length, 1, "one main landmark");
  assert.equal($("h1").length, 1, "one actual product H1");
  assert.equal($("h1").text().trim(), page.h1, page.path);
  const records = $('script[type="application/ld+json"]').map((_, node) => JSON.parse($(node).text())).get();
  assert.equal(records.length, page.path === "/se" ? 1 : 2, page.path);
  assert.equal($('script[type="application/ld+json"][data-sajda-seo-document]').length, records.length);
  const webPage = records.find(item => item["@type"] === "WebPage");
  assert.equal(webPage?.url, canonical, page.path);
  assert.equal(webPage?.name, page.h1, page.path);
  assert.equal(webPage?.inLanguage, "sv-SE", page.path);
  assert.equal(webPage?.isPartOf?.url, `${canonicalOrigin}/se`, "website reference must be an indexable public entry");
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
