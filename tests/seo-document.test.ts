import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { load } from "cheerio";
import { createServer } from "vite";
import { seoDocuments, seoDocumentForPath, seoHreflangAlternates, seoStructuredData, seoRobotsForLocation, SEO_HREFLANG_LOCALES, SEO_INDEX_ROBOTS, SEO_NOINDEX_ROBOTS, isPublicIndexPath, isPrivateResultPath } from "../src/lib/seoDocuments";

test("SEO indexing requires a clean approved URL, canonical host and explicit build policy", () => {
  const base = { pathname: "/se/sok-doman", search: "", origin: "https://sajda.dev", canonicalOrigin: "https://sajda.dev", buildPolicy: "index" };
  assert.equal(seoRobotsForLocation(base), SEO_INDEX_ROBOTS);
  assert.equal(seoRobotsForLocation({ ...base, pathname: "/pricing" }), SEO_INDEX_ROBOTS);
  assert.equal(seoRobotsForLocation({ ...base, pathname: "/brand-index" }), SEO_INDEX_ROBOTS);
  assert.equal(isPublicIndexPath("/pricing"), true);
  assert.equal(isPublicIndexPath("/brand-index/assessment"), false);
  assert.equal(isPrivateResultPath("/brand-index/assessment"), true);
  for (const override of [
    { pathname: "/" }, { pathname: "/account" }, { pathname: "/se/not-a-page" },
    { pathname: "/brand-index/assessment" },
    { search: "?q=my-private-name.test" }, { search: "?sort=price" },
    { pathname: "/pricing", search: "?plan=trading" },
    { origin: "https://sajda-test-hypbit.vercel.app" }, { origin: "http://127.0.0.1:8095" },
    { buildPolicy: "noindex" }, { buildPolicy: null },
  ]) assert.equal(seoRobotsForLocation({ ...base, ...override }), SEO_NOINDEX_ROBOTS, JSON.stringify(override));
});

test("structured data names only built pages and includes real breadcrumb parents", () => {
  const paths = new Set(seoDocuments.map(page => page.path));
  assert.equal(paths.size, 22);
  for (const page of seoDocuments) {
    const records = seoStructuredData(page, "https://sajda.dev");
    assert.equal(records.length, page.path === "/se" ? 3 : 4);
    assert.ok(records.some(item => item["@type"] === "Organization"));
    assert.ok(records.some(item => item["@type"] === "WebSite" && item.potentialAction === undefined));
    assert.equal(records[0].name, page.h1);
    assert.equal(records[0].url, `https://sajda.dev${page.path}`);
    const breadcrumb = records.find(item => item["@type"] === "BreadcrumbList");
    if (!breadcrumb) continue;
    const items = breadcrumb.itemListElement as Array<{ position: number; item: string }>;
    assert.ok(items.length >= 2);
    assert.ok(items.every((item, index) => item.position === index + 1 && paths.has(new URL(item.item).pathname)));
    assert.equal(items.at(-1)?.item, `https://sajda.dev${page.path}`);
  }
  const tld = seoStructuredData(seoDocumentForPath("/se/toppdomaner/app")!, "https://sajda.dev")[1];
  assert.match(JSON.stringify(tld), /https:\/\/sajda.dev\/se\/toppdomaner"/u);
});

test("actual SEO product HTML and route metadata remain aligned before JavaScript", async (t) => {
  const server = await createServer({ configFile: false, root: process.cwd(),
    define: { "import.meta.env.VITE_SAJDA_CANONICAL_ORIGIN": JSON.stringify("https://sajda.dev") },
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { "@": path.resolve("src") } },
    server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom" });
  try {
    const { renderSeoPage } = await server.ssrLoadModule("/scripts/render-seo-page.tsx");
    for (const page of seoDocuments) await t.test(page.path, () => {
      const $ = load(renderSeoPage(page.path));
      assert.equal($("h1").length, 1);
      assert.equal($("main").length, 1);
      assert.equal($("h1").text(), page.h1);
      if (page.path !== "/se/sa-fungerar-sajda") {
        assert.ok($("details summary").length >= 2);
        assert.equal($("form").length, 1);
        assert.equal($("form input[name]").length, 0, "a non-JS submit cannot put private names in a GET URL");
        assert.ok($("noscript").text().includes("JavaScript"));
      }
    });

    const { applyWebSeoMetadata } = await server.ssrLoadModule("/src/lib/webSeoMetadata.ts");
    // DOM adapter exercises actual mutation behavior, including node removal,
    // while keeping this regression independent of a browser or external API.
    const $ = load('<html lang="en"><head><title>Sajda</title><meta name="sajda-seo-indexing" content="index"></head><body></body></html>');
    const wrap = (node: ReturnType<typeof $.root>[0]) => ({
      get parentNode() { return node.parent; },
      setAttribute(name: string, value: string) { $(node).attr(name, value); },
      getAttribute(name: string) { return $(node).attr(name) ?? null; },
      set type(value: string) { $(node).attr("type", value); },
      set textContent(value: string) { $(node).text(value); },
      remove() { $(node).remove(); },
      node,
    });
    const head = $("head");
    const fixture = {
      get title() { return $("title").text(); },
      set title(value: string) { $("title").text(value); },
      documentElement: { get lang() { return $("html").attr("lang"); }, set lang(value: string) { $("html").attr("lang", value); } },
      head: {
        querySelector(selector: string) { const node = head.find(selector)[0]; return node ? wrap(node) : null; },
        querySelectorAll(selector: string) { return head.find(selector).toArray().map(wrap); },
        appendChild(child: ReturnType<typeof wrap>) { head.append(child.node); },
      },
      createElement(tag: string) {
        const node = $(`<${tag}></${tag}>`)[0];
        $(node).remove();
        return wrap(node);
      },
      querySelector(selector: string) { const node = $(selector)[0]; return node ? wrap(node) : null; },
    };
    const prior = Object.getOwnPropertyDescriptor(globalThis, "document");
    Object.defineProperty(globalThis, "document", { configurable: true, value: fixture });
    try {
      applyWebSeoMetadata("/se/sok-doman", "", "https://sajda.dev");
      assert.equal($('meta[name="robots"]').attr("content"), SEO_INDEX_ROBOTS);
      assert.equal($('[data-sajda-seo-document]').length, 6);
      assert.deepEqual(seoHreflangAlternates("/se/sok-doman", "https://sajda.dev"), [
        { hreflang: "sv-SE", href: "https://sajda.dev/se/sok-doman" },
        { hreflang: "x-default", href: "https://sajda.dev/se/sok-doman" },
      ]);
      assert.equal(SEO_HREFLANG_LOCALES.length, 5);
      applyWebSeoMetadata("/se/toppdomaner/app", "", "https://sajda.dev");
      assert.equal($('link[hreflang="sv-SE"]').attr("href"), "https://sajda.dev/se/toppdomaner/app");
      assert.equal($('link[hreflang="x-default"]').attr("href"), "https://sajda.dev/se/toppdomaner/app");
      assert.equal($('link[hreflang="en"]').length, 0);
      assert.equal($('script[type="application/ld+json"]').length, 4);
      const records = $('script[type="application/ld+json"]').toArray().map(node => JSON.parse($(node).text()));
      assert.equal(records.find(item => item["@type"] === "WebPage")?.url, "https://sajda.dev/se/toppdomaner/app");
      assert.equal(records.filter(item => item["@type"] === "WebPage").length, 1, "previous page structured data must be replaced");
      assert.equal(records.find(item => item["@type"] === "WebSite")?.potentialAction, undefined);
      applyWebSeoMetadata("/se/toppdomaner/app", "?q=private", "https://sajda.dev");
      assert.equal($('meta[name="robots"]').attr("content"), SEO_NOINDEX_ROBOTS);
      assert.doesNotMatch($("head").html() ?? "", /private/u);
      applyWebSeoMetadata("/account", "", "https://sajda.dev", "en");
      assert.equal($('[data-sajda-seo-document]').length, 0, "private app must not retain old public structured data or hreflang");
      assert.equal($('meta[name="robots"]').attr("content"), SEO_NOINDEX_ROBOTS);
      assert.equal($('link[rel="canonical"]').length, 1);
      assert.equal($("html").attr("lang"), "en");
      assert.equal($("title").text(), "Sajda — Domain search");
      assert.doesNotMatch($('meta[name="description"]').attr("content") ?? "", /\.app-domän/u);
      assert.equal($('meta[property="og:locale"]').attr("content"), "en_US");
      assert.equal($('meta[property="og:title"]').attr("content"), $("title").text());
      assert.equal($('meta[name="twitter:title"]').attr("content"), $("title").text());
      applyWebSeoMetadata("/pricing", "", "https://sajda.dev", "fr");
      assert.equal($("html").attr("lang"), "fr");
      assert.match($("title").text(), /Tarifs/u);
      assert.equal($('meta[name="robots"]').attr("content"), SEO_INDEX_ROBOTS);
      assert.equal($('link[rel="canonical"]').attr("href"), "https://sajda.dev/pricing");
      assert.equal($('link[hreflang]').length, 0, "a single English product URL is not a localized alternate set");
      applyWebSeoMetadata("/brand-index", "", "https://sajda.dev", "en");
      assert.equal($('meta[name="robots"]').attr("content"), SEO_INDEX_ROBOTS);
      assert.equal($('link[rel="canonical"]').attr("href"), "https://sajda.dev/brand-index");
      assert.match($("title").text(), /Look up an existing brand/u);
      applyWebSeoMetadata("/brand-index/assessment", "", "https://sajda.dev", "en");
      assert.equal($('meta[name="robots"]').attr("content"), SEO_NOINDEX_ROBOTS);
      assert.equal($('link[rel="canonical"]').attr("href"), "https://sajda.dev/");
      applyWebSeoMetadata("/pricing", "?plan=trading", "https://sajda.dev", "en");
      assert.equal($('meta[name="robots"]').attr("content"), SEO_NOINDEX_ROBOTS);
      applyWebSeoMetadata("/se", "", "https://preview.vercel.app");
      assert.equal($('meta[name="robots"]').attr("content"), SEO_NOINDEX_ROBOTS);
      $('meta[name="sajda-seo-indexing"]').attr("content", "noindex");
      applyWebSeoMetadata("/se", "", "https://sajda.dev");
      assert.equal($('meta[name="robots"]').attr("content"), SEO_NOINDEX_ROBOTS, "explicit production hold survives hydration");
    } finally {
      if (prior) Object.defineProperty(globalThis, "document", prior);
      else Reflect.deleteProperty(globalThis, "document");
    }
  } finally { await server.close(); }
});
