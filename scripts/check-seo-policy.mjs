import assert from "node:assert/strict";
import {
  AI_CRAWLERS,
  DEFAULT_SEO_ORIGIN,
  PRIVATE_CRAWL_PATHS,
  PRIVATE_RESULT_PATHS,
  PUBLIC_INDEX_PATHS,
  SEARCH_CRAWLERS,
  SEO_LOCALES,
  isPrivateResultPath,
  isPublicIndexPath,
  hreflangAlternates,
  htmlRobotsContent,
  indexNowSubmission,
  isIndexableCanonicalOrigin,
  isNoindexBuild,
  resolveSeoBuildOrigin,
  robotsTxt,
  shouldPublishIndexNow,
  siteVerificationTags,
  sitemapIndexXml,
  sitemapLastmod,
  sitemapPagesXml,
  emptySitemapXml,
} from "./seo-policy.mjs";

assert.equal(
  isNoindexBuild({ VERCEL_ENV: "preview", SAJDA_SEO_INDEXING: "index" }),
  true,
  "a Vercel Preview must remain noindex even when an index override is present",
);
assert.equal(
  isNoindexBuild({ VERCEL_ENV: "development", SAJDA_SEO_INDEXING: "index" }),
  true,
  "a Vercel development deployment must remain noindex",
);
assert.equal(
  isNoindexBuild({ VERCEL_ENV: "production", SAJDA_SEO_INDEXING: "index" }),
  false,
  "a deliberate production index build on a branded origin must remain index-eligible",
);
assert.equal(
  isNoindexBuild({
    VERCEL_ENV: "production",
    SAJDA_SEO_INDEXING: "index",
    SAJDA_CANONICAL_ORIGIN: "https://sajda-eight.vercel.app",
  }),
  true,
  "a Vercel preview host cannot become an indexable search origin",
);
assert.equal(
  isNoindexBuild({
    VERCEL_ENV: "production",
    SAJDA_SEO_INDEXING: "index",
    SAJDA_CANONICAL_ORIGIN: "https://sajda.dev",
  }),
  false,
  "the final branded origin plus an explicit index flag is index-eligible",
);
assert.equal(
  isNoindexBuild({ VERCEL_ENV: "production", SAJDA_SEO_INDEXING: "noindex" }),
  true,
  "an explicit production noindex override must remain available",
);
for (const flag of [undefined, "", " ", "enabled", "INDEX", "false"]) {
  assert.equal(isNoindexBuild({ VERCEL_ENV: "production", SAJDA_SEO_INDEXING: flag }), true,
    "production must require an exact, explicit index decision");
}
assert.equal(isNoindexBuild({}), false, "an environment-less local build keeps its inspection behavior");
assert.equal(isNoindexBuild({ SAJDA_SEO_INDEXING: "noindex" }), true, "local noindex override remains supported");
assert.equal(isIndexableCanonicalOrigin("https://sajda.dev"), true);
assert.equal(isIndexableCanonicalOrigin("https://sajda-eight.vercel.app"), false);
assert.equal(
  resolveSeoBuildOrigin({}),
  DEFAULT_SEO_ORIGIN,
  "the default static and browser canonical origins must agree",
);
assert.equal(
  resolveSeoBuildOrigin({
    SAJDA_CANONICAL_ORIGIN: "https://example.test",
    VITE_SAJDA_CANONICAL_ORIGIN: "https://example.test",
  }),
  "https://example.test",
  "matching static and browser canonical origins must be accepted",
);
assert.throws(
  () => resolveSeoBuildOrigin({
    SAJDA_CANONICAL_ORIGIN: "https://static.example.test",
    VITE_SAJDA_CANONICAL_ORIGIN: "https://browser.example.test",
  }),
  /must resolve to the same HTTPS origin/u,
  "a mismatched static and browser canonical origin must fail closed",
);

const noindexRobots = robotsTxt(true, "https://sajda.dev");
const indexRobots = robotsTxt(false, "https://sajda.dev");
assert.match(noindexRobots, /User-agent: \*\nDisallow: \//u);
assert.doesNotMatch(noindexRobots, /Sitemap:/u);
assert.match(indexRobots, /User-agent: \*\nAllow: \//u);
assert.match(indexRobots, /Sitemap: https:\/\/sajda.dev\/sitemap.xml/u);
assert.deepEqual([...PUBLIC_INDEX_PATHS], ["/pricing", "/brand-index"]);
assert.deepEqual([...PRIVATE_RESULT_PATHS], ["/brand-index/assessment"]);
assert.equal(isPublicIndexPath("/pricing/"), true);
assert.equal(isPublicIndexPath("/brand-index"), true);
assert.equal(isPublicIndexPath("/brand-index/assessment"), false);
assert.equal(isPrivateResultPath("/brand-index/assessment"), true);
assert.equal(isPrivateResultPath("/brand-index/assessment/share"), true);
assert.equal(isPrivateResultPath("/brand-index"), false);
assert.ok(!PRIVATE_CRAWL_PATHS.includes("/pricing"));
assert.ok(!PRIVATE_CRAWL_PATHS.includes("/brand-index"));
assert.ok(PRIVATE_CRAWL_PATHS.includes("/brand-index/assessment"));
for (const path of PRIVATE_CRAWL_PATHS) assert.match(indexRobots, new RegExp(`Disallow: ${path}`, "u"));
assert.doesNotMatch(indexRobots, /Disallow: \/pricing(?:\n|$)/u);
assert.doesNotMatch(indexRobots, /Disallow: \/brand-index(?:\n|$)/u);
assert.ok(AI_CRAWLERS.includes("OAI-SearchBot") && AI_CRAWLERS.includes("ChatGPT-User")
  && AI_CRAWLERS.includes("Claude-SearchBot") && AI_CRAWLERS.includes("Perplexity-User")
  && AI_CRAWLERS.includes("Applebot-Extended"));
for (const agent of [...SEARCH_CRAWLERS, ...AI_CRAWLERS]) {
  assert.match(noindexRobots, new RegExp(`User-agent: ${agent}\\nDisallow: /`, "u"), agent);
  assert.match(indexRobots, new RegExp(`User-agent: ${agent}\\nAllow: /`, "u"), agent);
  for (const path of PRIVATE_CRAWL_PATHS) {
    assert.match(indexRobots, new RegExp(`User-agent: ${agent}\\nAllow: /\\n[\\s\\S]*?Disallow: ${path}`, "u"), `${agent} ${path}`);
  }
  assert.doesNotMatch(indexRobots, new RegExp(`User-agent: ${agent}\\nDisallow: /\\n`, "u"), agent);
}
assert.equal(htmlRobotsContent(true), "noindex, nofollow");
assert.match(htmlRobotsContent(false), /^index, follow/u);

assert.match(emptySitemapXml(), /<urlset xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9"><\/urlset>/u);
assert.match(sitemapIndexXml("https://sajda.dev"), /<loc>https:\/\/sajda.dev\/sitemap-pages.xml<\/loc>/u);
assert.doesNotMatch(sitemapIndexXml("https://sajda.dev"), /<lastmod>/u);
assert.match(sitemapIndexXml("https://sajda.dev", "2026-10-05"), /<lastmod>2026-10-05<\/lastmod>/u);
assert.match(sitemapPagesXml(["https://sajda.dev/se"], "2026-10-05"), /<lastmod>2026-10-05<\/lastmod>/u);
assert.equal(sitemapLastmod({}), null);
assert.equal(sitemapLastmod({ SAJDA_SITEMAP_LASTMOD: "2026-10-05" }), "2026-10-05");
assert.equal(sitemapLastmod({ SAJDA_SITEMAP_LASTMOD: "not-a-date" }), null);

const links = hreflangAlternates("/se/sok-doman", "https://sajda.dev");
assert.deepEqual(links, [
  { hreflang: "sv-SE", href: "https://sajda.dev/se/sok-doman" },
  { hreflang: "x-default", href: "https://sajda.dev/se/sok-doman" },
]);
assert.deepEqual(SEO_LOCALES.map(locale => locale.language), ["sv", "en", "es", "fr", "zh"]);
assert.equal(SEO_LOCALES.filter(locale => locale.published).length, 1, "only published locales emit hreflang");

assert.deepEqual(siteVerificationTags({}), []);
assert.deepEqual(
  siteVerificationTags({
    SAJDA_GOOGLE_SITE_VERIFICATION: "google-token-value",
    SAJDA_BING_SITE_VERIFICATION: "bing-token-value",
  }),
  [
    { name: "google-site-verification", content: "google-token-value" },
    { name: "msvalidate.01", content: "bing-token-value" },
  ],
);
assert.deepEqual(siteVerificationTags({ SAJDA_GOOGLE_SITE_VERIFICATION: "bad token" }), []);

const noindexIndexNow = indexNowSubmission({
  VERCEL_ENV: "production",
  SAJDA_SEO_INDEXING: "index",
  SAJDA_CANONICAL_ORIGIN: "https://sajda-eight.vercel.app",
  SAJDA_INDEXNOW_KEY: "abc123def456",
});
assert.deepEqual(noindexIndexNow, { submit: false, reason: "noindex" });
assert.equal(shouldPublishIndexNow({
  VERCEL_ENV: "production",
  SAJDA_SEO_INDEXING: "index",
  SAJDA_CANONICAL_ORIGIN: "https://sajda-eight.vercel.app",
  SAJDA_INDEXNOW_KEY: "abc123def456",
}), false);

const indexIndexNow = indexNowSubmission({
  VERCEL_ENV: "production",
  SAJDA_SEO_INDEXING: "index",
  SAJDA_CANONICAL_ORIGIN: "https://sajda.dev",
  SAJDA_INDEXNOW_KEY: "abc123def456",
});
assert.equal(indexIndexNow.submit, true);
assert.equal(indexIndexNow.reason, "index");
assert.deepEqual(
  indexNowSubmission({ VERCEL_ENV: "production", SAJDA_SEO_INDEXING: "index", SAJDA_CANONICAL_ORIGIN: "https://sajda.dev" }),
  { submit: false, reason: "missing_key" },
);

console.log("SEO policy: OK");
