import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SEO_PAGES,
  canonicalUrl,
  isNoindexBuild,
  resolveSeoBuildOrigin,
} from "./seo-routes.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputArgument = process.argv[2] || "dist";
const outputDirectory = resolve(projectRoot, outputArgument);
const canonicalOrigin = resolveSeoBuildOrigin();
const noindex = isNoindexBuild();
const robotsContent = noindex
  ? "noindex, nofollow"
  : "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1";

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

function seoStyles() {
  return `<style data-sajda-seo-static>
    .sajda-seo-page { max-width: 960px; margin: 0 auto; padding: 40px 24px 72px; color: #111b33; background: #f7faff; font-family: "Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif; }
    .sajda-seo-skip { position: absolute; left: -9999px; }
    .sajda-seo-skip:focus { left: 24px; top: 16px; z-index: 2; padding: 10px 14px; border-radius: 8px; background: #fff; color: #111b33; box-shadow: 0 4px 18px rgba(20, 43, 80, .16); }
    .sajda-seo-header { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding-bottom: 26px; border-bottom: 1px solid #d7e3f6; }
    .sajda-seo-brand { color: #1477e8; font-size: 1.35rem; font-weight: 800; letter-spacing: -.04em; text-decoration: none; }
    .sajda-seo-nav { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 12px 18px; font-size: .9rem; }
    .sajda-seo-nav a, .sajda-seo-links a { color: #225a9d; text-decoration: none; }
    .sajda-seo-nav a:hover, .sajda-seo-links a:hover { text-decoration: underline; }
    .sajda-seo-hero { padding: 70px 0 44px; }
    .sajda-seo-eyebrow { margin: 0 0 12px; color: #1477e8; font-size: .78rem; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
    .sajda-seo-page h1 { max-width: 800px; margin: 0; color: #111b33; font-size: clamp(2.15rem, 5vw, 4.2rem); line-height: 1.02; letter-spacing: -.065em; }
    .sajda-seo-lead { max-width: 700px; margin: 22px 0 0; color: #506785; font-size: clamp(1.05rem, 2vw, 1.3rem); line-height: 1.65; }
    .sajda-seo-action { display: inline-flex; align-items: center; margin-top: 28px; padding: 13px 18px; border-radius: 12px; background: #1477e8; color: #fff; font-weight: 800; text-decoration: none; box-shadow: 0 10px 24px rgba(20, 119, 232, .21); }
    .sajda-seo-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
    .sajda-seo-card, .sajda-seo-method { border: 1px solid #d7e3f6; border-radius: 18px; background: rgba(255, 255, 255, .82); padding: 24px; }
    .sajda-seo-card h2, .sajda-seo-links h2, .sajda-seo-method h2 { margin: 0 0 10px; font-size: 1.12rem; letter-spacing: -.03em; }
    .sajda-seo-card p, .sajda-seo-method p { margin: 0; color: #506785; line-height: 1.65; }
    .sajda-seo-links { margin-top: 18px; padding: 26px 0; border-top: 1px solid #d7e3f6; }
    .sajda-seo-links ul { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 24px; margin: 14px 0 0; padding: 0; list-style: none; }
    .sajda-seo-method { margin-top: 18px; background: #ecf5ff; }
    .sajda-seo-footer { margin-top: 38px; color: #70839d; font-size: .84rem; }
    @media (max-width: 640px) { .sajda-seo-page { padding: 24px 18px 52px; } .sajda-seo-header { align-items: flex-start; flex-direction: column; } .sajda-seo-nav { justify-content: flex-start; } .sajda-seo-hero { padding: 48px 0 32px; } .sajda-seo-grid, .sajda-seo-links ul { grid-template-columns: 1fr; } }
  </style>`;
}

function breadcrumbJsonLd(page, canonical) {
  // Only emit locations that exist today. Some page copy has a conceptual
  // category (for example "Toppdomäner"), but that category does not have a
  // public canonical URL yet and must not be invented in structured data.
  const items = [
    {
      "@type": "ListItem",
      position: 1,
      name: "Sajda",
      item: canonicalUrl("/se", canonicalOrigin),
    },
  ];

  if (page.path !== "/se") {
    items.push({
      "@type": "ListItem",
      position: 2,
      name: page.breadcrumb.at(-1),
      item: canonical,
    });
  }

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items,
  };
}

function pageJsonLd(page, canonical) {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: page.h1,
    description: page.description,
    url: canonical,
    inLanguage: "sv-SE",
    isPartOf: {
      "@type": "WebSite",
      name: "Sajda",
      url: canonicalOrigin,
    },
  };
}

function renderStaticContent(page) {
  const navigation = [
    { label: "Sök domän", path: "/se/sok-doman" },
    { label: "Hitta namn", path: "/se/domannamn-generator" },
    { label: "Företagsnamn", path: "/se/foretagsnamn-generator" },
    { label: "Domänändelser", path: "/se/toppdomaner" },
    { label: "Domänguide", path: "/se/guide" },
    { label: ".se eller .com", path: "/se/guide/se-eller-com" },
    { label: "Så fungerar Sajda", path: "/se/sa-fungerar-sajda" },
  ];

  const cards = page.sections
    .map(
      (section) => `<article class="sajda-seo-card">
        <h2>${escapeHtml(section.heading)}</h2>
        <p>${escapeHtml(section.body)}</p>
      </article>`,
    )
    .join("\n");

  const links = page.links
    .map(
      (link) => `<li><a href="${escapeHtml(link.path)}">${escapeHtml(link.label)} <span aria-hidden="true">→</span></a></li>`,
    )
    .join("\n");

  return `<main class="sajda-seo-page" id="sajda-seo-content">
    <a class="sajda-seo-skip" href="#sajda-seo-main">Hoppa till innehållet</a>
    <header class="sajda-seo-header">
      <a class="sajda-seo-brand" href="/se" aria-label="Sajda, svensk startsida">sajda</a>
      <nav class="sajda-seo-nav" aria-label="Sajda navigation">
        ${navigation
          .map((link) => `<a href="${escapeHtml(link.path)}">${escapeHtml(link.label)}</a>`)
          .join("\n")}
      </nav>
    </header>
    <section class="sajda-seo-hero" id="sajda-seo-main">
      <p class="sajda-seo-eyebrow">Sajda · domänbeslut</p>
      <h1>${escapeHtml(page.h1)}</h1>
      <p class="sajda-seo-lead">${escapeHtml(page.lead)}</p>
      <a class="sajda-seo-action" href="${escapeHtml(page.actionPath)}">${escapeHtml(page.actionLabel)} <span aria-hidden="true">→</span></a>
    </section>
    <section class="sajda-seo-grid" aria-label="Om denna sida">
      ${cards}
    </section>
    <section class="sajda-seo-links" aria-labelledby="sajda-seo-next">
      <h2 id="sajda-seo-next">Fortsätt i Sajda</h2>
      <ul>${links}</ul>
    </section>
    <aside class="sajda-seo-method" aria-labelledby="sajda-seo-method-title">
      <h2 id="sajda-seo-method-title">Metod och aktualitet</h2>
      <p>Sajda använder registry- och leverantörskällor när en domän kan kontrolleras. Status, pris och villkor kan ändras efter kontrollen, så bekräfta alltid underlaget hos den leverantör du väljer innan köp.</p>
    </aside>
    <footer class="sajda-seo-footer">Sajda hjälper dig att hitta och undersöka domänalternativ. Du fattar det slutliga köpbeslutet.</footer>
  </main>`;
}

function replaceRequired(html, expression, replacement, label) {
  if (!expression.test(html)) {
    throw new Error(`Could not find ${label} in the Vite HTML shell.`);
  }

  return html.replace(expression, replacement);
}

function renderPageHtml(shell, page) {
  const canonical = canonicalUrl(page.path, canonicalOrigin);
  const alternate = `<link rel="alternate" hreflang="sv-SE" href="${escapeHtml(canonical)}" />`;
  const jsonLd = [pageJsonLd(page, canonical), breadcrumbJsonLd(page, canonical)]
    .map((item) => `<script type="application/ld+json">${safeJson(item)}</script>`)
    .join("\n");
  const staticHead = [
    alternate,
    seoStyles(),
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
    `<div id="root">${renderStaticContent(page)}</div>`,
    "the React root",
  );

  return html;
}

function validateRenderedPage(page, html) {
  const canonical = canonicalUrl(page.path, canonicalOrigin);
  const requiredFragments = [
    `<title>${escapeHtml(page.title)}</title>`,
    `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
    `<link rel="alternate" hreflang="sv-SE" href="${escapeHtml(canonical)}" />`,
    `<h1>${escapeHtml(page.h1)}</h1>`,
    '<script type="module" crossorigin src="/assets/',
    '<link rel="stylesheet" crossorigin href="/assets/',
  ];

  if (requiredFragments.some((fragment) => !html.includes(fragment))) {
    throw new Error(`Static SEO validation failed for ${page.path}.`);
  }

  if ((html.match(/application\/ld\+json/g) || []).length !== 2) {
    throw new Error(`Static SEO structured-data validation failed for ${page.path}.`);
  }
}

function sitemapXml() {
  // A preview must never act as a second discovery surface for production.
  // Its individual documents are noindex and its sitemap deliberately has no
  // production URLs. The production build remains the sole publishable map.
  const entries = noindex ? [] : SEO_PAGES.map((page) => {
    const url = canonicalUrl(page.path, canonicalOrigin);
    return `  <url>\n    <loc>${escapeXml(url)}</loc>\n  </url>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.length ? `\n${entries.join("\n")}\n` : ""}</urlset>\n`;
}

function robotsTxt() {
  if (noindex) {
    return "User-agent: *\nDisallow: /\n";
  }

  return `User-agent: *\nAllow: /\n\nSitemap: ${canonicalOrigin}/sitemap.xml\n`;
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

  await Promise.all(
    SEO_PAGES.map(async (page) => {
      const filename = `${page.path.slice(1)}.html`;
      const target = resolve(outputDirectory, filename);
      const html = renderPageHtml(shell, page);
      validateRenderedPage(page, html);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, html, "utf8");
    }),
  );

  await Promise.all([
    writeFile(resolve(outputDirectory, "sitemap.xml"), sitemapXml(), "utf8"),
    writeFile(resolve(outputDirectory, "robots.txt"), robotsTxt(), "utf8"),
  ]);

  const mode = noindex ? "noindex preview" : "index-eligible";
  console.log(`SEO static: wrote ${SEO_PAGES.length} ${mode} Swedish pages to ${relative(projectRoot, outputDirectory) || outputDirectory}.`);
}

await main();
