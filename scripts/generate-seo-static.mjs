import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import {
  INDEXABLE_PAGES,
  PUBLIC_INDEX_PAGES,
  SEO_PAGES,
  canonicalUrl,
  hreflangAlternates,
  htmlRobotsContent,
  isNoindexBuild,
  resolveIndexNowKey,
  resolveSeoBuildOrigin,
  robotsTxt,
  shouldPublishIndexNow,
  siteVerificationTags,
  sitemapIndexXml,
  sitemapLastmod,
  sitemapPagesXml,
  emptySitemapXml,
} from "./seo-routes.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputArgument = process.argv[2] || "dist";
const outputDirectory = resolve(projectRoot, outputArgument);
const canonicalOrigin = resolveSeoBuildOrigin();
const noindex = isNoindexBuild();
const robotsContent = htmlRobotsContent(noindex);
const lastmod = sitemapLastmod();

function escapeHtml(value) {
  return String(value).replace(/[&<>\"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

function escapeXml(value) {
  return escapeHtml(value);
}

function safeJson(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function replaceRequired(html, expression, replacement, label) {
  if (!expression.test(html)) {
    throw new Error(`Could not find ${label} in the Vite HTML shell.`);
  }

  return html.replace(expression, replacement);
}

function publicIndexHead(page) {
  return hreflangAlternates(page.path, canonicalOrigin)
    .map((link) => `<link rel="alternate" hreflang="${escapeHtml(link.hreflang)}" href="${escapeHtml(link.href)}" data-sajda-seo-document />`)
    .join("\n");
}

function renderPublicIndexHtml(shell, page) {
  const canonical = canonicalUrl(page.path, canonicalOrigin);
  let html = shell;
  html = replaceRequired(html, /<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(page.title)}</title>`, "the page title");
  html = replaceRequired(
    html,
    /<meta\s+name=(['"])description\1\s+content=(['"])[\s\S]*?\2\s*\/>/i,
    `<meta name="description" content="${escapeHtml(page.description)}" />`,
    "the meta description",
  );
  html = replaceRequired(
    html,
    /<meta\s+name=(['"])robots\1\s+content=(['"])[\s\S]*?\2\s*\/>/i,
    `<meta name="robots" content="${robotsContent}" />`,
    "the meta robots directive",
  );
  html = replaceRequired(
    html,
    /<link\s+rel=(['"])canonical\1\s+href=(['"])[\s\S]*?\2\s*\/>/i,
    `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
    "the canonical link",
  );
  html = replaceRequired(
    html,
    /<meta\s+property=(['"])og:title\1\s+content=(['"])[\s\S]*?\2\s*\/>/i,
    `<meta property="og:title" content="${escapeHtml(page.title)}" />`,
    "the Open Graph title",
  );
  html = replaceRequired(
    html,
    /<meta\s+property=(['"])og:description\1\s+content=(['"])[\s\S]*?\2\s*\/>/i,
    `<meta property="og:description" content="${escapeHtml(page.description)}" />`,
    "the Open Graph description",
  );
  html = replaceRequired(
    html,
    /<meta\s+property=(['"])og:url\1\s+content=(['"])[\s\S]*?\2\s*\/>/i,
    `<meta property="og:url" content="${escapeHtml(canonical)}" />`,
    "the Open Graph URL",
  );
  html = replaceRequired(
    html,
    /<meta\s+name=(['"])twitter:title\1\s+content=(['"])[\s\S]*?\2\s*\/>/i,
    `<meta name="twitter:title" content="${escapeHtml(page.title)}" />`,
    "the Twitter title",
  );
  html = replaceRequired(
    html,
    /<meta\s+name=(['"])twitter:description\1\s+content=(['"])[\s\S]*?\2\s*\/>/i,
    `<meta name="twitter:description" content="${escapeHtml(page.description)}" />`,
    "the Twitter description",
  );
  html = replaceRequired(html, /<\/head>/i, `${publicIndexHead(page)}\n</head>`, "the head closing tag");
  return html;
}

function validatePublicIndexPage(page, html) {
  const canonical = canonicalUrl(page.path, canonicalOrigin);
  const requiredFragments = [
    `<title>${escapeHtml(page.title)}</title>`,
    `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
    `<meta name="robots" content="${robotsContent}" />`,
    '<script type="module" crossorigin src="/assets/',
    '<link rel="stylesheet" crossorigin href="/assets/',
  ];
  if (requiredFragments.some((fragment) => !html.includes(fragment))) {
    throw new Error(`Static public-index validation failed for ${page.path}.`);
  }
  if (html.includes('data-sajda-seo-document')) {
    throw new Error(`Static public-index page ${page.path} must not claim untranslated hreflang alternatives.`);
  }
}

function renderPageHtml(shell, page, markup, records) {
  const canonical = canonicalUrl(page.path, canonicalOrigin);
  const alternates = hreflangAlternates(page.path, canonicalOrigin)
    .map((link) => `<link rel="alternate" hreflang="${escapeHtml(link.hreflang)}" href="${escapeHtml(link.href)}" data-sajda-seo-document />`)
    .join("\n");
  const jsonLd = records
    .map((item) => `<script type="application/ld+json" data-sajda-seo-document>${safeJson(item)}</script>`)
    .join("\n");
  const staticHead = [
    alternates,
    jsonLd,
  ].join("\n");

  let html = shell;
  html = replaceRequired(html, /<html\s+lang=(['"])[^'"]*\1>/i, '<html lang="sv-SE">', "the html language attribute");
  html = replaceRequired(html, /<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(page.title)}</title>`, "the page title");
  html = replaceRequired(
    html,
    /<meta\s+name=(['"])description\1\s+content=(['"])[\s\S]*?\2\s*\/>/i,
    `<meta name="description" content="${escapeHtml(page.description)}" />`,
    "the meta description",
  );
  html = replaceRequired(
    html,
    /<meta\s+name=(['"])robots\1\s+content=(['"])[\s\S]*?\2\s*\/>/i,
    `<meta name="robots" content="${robotsContent}" />`,
    "the meta robots directive",
  );
  html = replaceRequired(
    html,
    /<link\s+rel=(['"])canonical\1\s+href=(['"])[\s\S]*?\2\s*\/>/i,
    `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
    "the canonical link",
  );
  html = replaceRequired(
    html,
    /<meta\s+property=(['"])og:title\1\s+content=(['"])[\s\S]*?\2\s*\/>/i,
    `<meta property="og:title" content="${escapeHtml(page.title)}" />`,
    "the Open Graph title",
  );
  html = replaceRequired(
    html,
    /<meta\s+property=(['"])og:description\1\s+content=(['"])[\s\S]*?\2\s*\/>/i,
    `<meta property="og:description" content="${escapeHtml(page.description)}" />`,
    "the Open Graph description",
  );
  html = replaceRequired(
    html,
    /<meta\s+property=(['"])og:url\1\s+content=(['"])[\s\S]*?\2\s*\/>/i,
    `<meta property="og:url" content="${escapeHtml(canonical)}" />`,
    "the Open Graph URL",
  );
  html = replaceRequired(
    html,
    /<meta\s+property=(['"])og:locale\1\s+content=(['"])[\s\S]*?\2\s*\/>/i,
    '<meta property="og:locale" content="sv_SE" />',
    "the Open Graph locale",
  );
  html = replaceRequired(
    html,
    /<meta\s+name=(['"])twitter:title\1\s+content=(['"])[\s\S]*?\2\s*\/>/i,
    `<meta name="twitter:title" content="${escapeHtml(page.title)}" />`,
    "the Twitter title",
  );
  html = replaceRequired(
    html,
    /<meta\s+name=(['"])twitter:description\1\s+content=(['"])[\s\S]*?\2\s*\/>/i,
    `<meta name="twitter:description" content="${escapeHtml(page.description)}" />`,
    "the Twitter description",
  );
  html = replaceRequired(html, /<\/head>/i, `${staticHead}\n</head>`, "the head closing tag");
  html = replaceRequired(
    html,
    /<div\s+id=(['"])root\1><\/div>/i,
    `<div id="root">${markup}</div>`,
    "the React root",
  );

  return html;
}

function validateRenderedPage(page, html) {
  const canonical = canonicalUrl(page.path, canonicalOrigin);
  const requiredFragments = [
    `<title>${escapeHtml(page.title)}</title>`,
    `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
    `<link rel="alternate" hreflang="sv-SE" href="${escapeHtml(canonical)}" data-sajda-seo-document />`,
    `<link rel="alternate" hreflang="x-default" href="${escapeHtml(canonical)}" data-sajda-seo-document />`,
    escapeHtml(page.h1),
    '<script type="module" crossorigin src="/assets/',
    '<link rel="stylesheet" crossorigin href="/assets/',
  ];

  if (requiredFragments.some((fragment) => !html.includes(fragment))) {
    throw new Error(`Static SEO validation failed for ${page.path}.`);
  }

  const jsonLdCount = (html.match(/application\/ld\+json/g) || []).length;
  if (jsonLdCount !== (page.path === "/se" ? 3 : 4)) {
    throw new Error(`Static SEO structured-data validation failed for ${page.path}.`);
  }
}

function sitemapDocuments() {
  // A preview / noindex hold must never act as a second discovery surface.
  // The urlset stays well-formed and empty; index mode publishes a sitemap
  // index that points at the approved page list.
  if (noindex) {
    return { index: emptySitemapXml(), pages: emptySitemapXml() };
  }
  const urls = INDEXABLE_PAGES.map((page) => escapeXml(canonicalUrl(page.path, canonicalOrigin)));
  return {
    index: sitemapIndexXml(canonicalOrigin, lastmod),
    pages: sitemapPagesXml(urls, lastmod),
  };
}

async function main() {
  const shellPath = resolve(outputDirectory, "index.html");
  let shell;

  try {
    shell = await readFile(shellPath, "utf8");
  } catch (error) {
    const outputLabel = relative(projectRoot, outputDirectory) || outputDirectory;
    throw new Error(`Cannot generate SEO pages because ${outputLabel}/index.html does not exist. Run Vite first.`, { cause: error });
  }

  // A stable build policy also travels with the interactive shell. Client-side
  // navigation may never infer indexability from a preview hostname or erase an
  // explicit production noindex choice.
  shell = shell.replace(/<meta\s+name="sajda-seo-indexing"[^>]*>\s*/giu, "");
  const verification = siteVerificationTags()
    .map((tag) => `<meta name="${escapeHtml(tag.name)}" content="${escapeHtml(tag.content)}" />`)
    .join("\n");
  shell = replaceRequired(shell, /<\/head>/i,
    `${verification ? `${verification}\n` : ""}<meta name="sajda-seo-indexing" content="${noindex ? "noindex" : "index"}" />\n</head>`, "the head closing tag");
  shell = shell.replace(/https:\/\/sajda\.dev\//g, `${canonicalOrigin}/`);
  await writeFile(shellPath, shell, "utf8");

  const renderer = await createServer({
    configFile: false, root: projectRoot, mode: "production", appType: "custom",
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { "@": resolve(projectRoot, "src") } },
    server: { middlewareMode: true, hmr: false, watch: null },
  });
  try {
    const { renderSeoPage, seoDocuments, seoStructuredData } = await renderer.ssrLoadModule("/scripts/render-seo-page.tsx");
    await Promise.all(SEO_PAGES.map(async page => {
      const document = seoDocuments.find(item => item.path === page.path);
      for (const key of ["title", "description", "h1"]) {
        if (!document || document[key] !== page[key]) throw new Error(`Static/client SEO ${key} mismatch for ${page.path}.`);
      }
      const target = resolve(outputDirectory, `${page.path.slice(1)}.html`);
      const html = renderPageHtml(shell, page, renderSeoPage(page.path), seoStructuredData(document, canonicalOrigin));
      validateRenderedPage(page, html);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, html, "utf8");
    }));
    await Promise.all(PUBLIC_INDEX_PAGES.map(async page => {
      const target = resolve(outputDirectory, `${page.path.slice(1)}.html`);
      const html = renderPublicIndexHtml(shell, page);
      validatePublicIndexPage(page, html);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, html, "utf8");
    }));
  } finally {
    await renderer.close();
  }

  const sitemaps = sitemapDocuments();
  const outputs = [
    writeFile(resolve(outputDirectory, "sitemap.xml"), sitemaps.index, "utf8"),
    writeFile(resolve(outputDirectory, "sitemap-pages.xml"), sitemaps.pages, "utf8"),
    writeFile(resolve(outputDirectory, "robots.txt"), robotsTxt(noindex, canonicalOrigin), "utf8"),
  ];
  if (shouldPublishIndexNow()) {
    const key = resolveIndexNowKey();
    outputs.push(writeFile(resolve(outputDirectory, `${key}.txt`), `${key}\n`, "utf8"));
  }
  await Promise.all(outputs);

  const mode = noindex ? "noindex preview" : "index-eligible";
  console.log(`SEO static: wrote ${SEO_PAGES.length} Swedish and ${PUBLIC_INDEX_PAGES.length} public ${mode} pages to ${relative(projectRoot, outputDirectory) || outputDirectory}.`);
}

await main();
