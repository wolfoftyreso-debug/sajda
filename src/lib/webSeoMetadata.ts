import { SEO_CANONICAL_ORIGIN } from "./seoCanonicalOrigin";
import { applyDocumentMetadata, applySharePreviewMetadata, type Language } from "@/i18n/LanguageProvider";
import { isPublicIndexPath, seoDocumentForPath, seoHreflangAlternates, seoRobotsForLocation, seoStructuredData } from "./seoDocuments";

function setHeadValue(tag: "meta" | "link", attribute: string, key: string, field: string, value: string) {
  const selector = `${tag}[${attribute}='${key}']`;
  const node = document.head.querySelector(selector) ?? document.createElement(tag);
  node.setAttribute(attribute, key);
  node.setAttribute(field, value);
  if (!node.parentNode) document.head.appendChild(node);
}

/** One web-only owner prevents static SEO data leaking across client-side routes. */
export function applyWebSeoMetadata(pathname: string, search: string, origin: string, language: Language = "en"): void {
  const page = seoDocumentForPath(pathname);
  const canonicalPath = page?.path ?? (isPublicIndexPath(pathname) ? pathname.replace(/\/+$/u, "") || "/" : "/");
  const canonical = `${SEO_CANONICAL_ORIGIN}${canonicalPath}`;
  const buildPolicy = document.head.querySelector("meta[name='sajda-seo-indexing']")?.getAttribute("content") ?? null;
  document.head.querySelectorAll("[data-sajda-seo-document]").forEach(node => node.remove());
  setHeadValue("meta", "name", "robots", "content", seoRobotsForLocation({
    pathname, search, origin, canonicalOrigin: SEO_CANONICAL_ORIGIN, buildPolicy,
  }));
  setHeadValue("link", "rel", "canonical", "href", canonical);
  setHeadValue("meta", "property", "og:url", "content", canonical);
  applySharePreviewMetadata();
  if (!page) {
    applyDocumentMetadata(language, pathname.startsWith("/se/") ? "/" : pathname);
    if (isPublicIndexPath(pathname)) {
      for (const link of seoHreflangAlternates(canonicalPath, SEO_CANONICAL_ORIGIN)) {
        const alternate = document.createElement("link");
        alternate.setAttribute("rel", "alternate");
        alternate.setAttribute("hreflang", link.hreflang);
        alternate.setAttribute("href", link.href);
        alternate.setAttribute("data-sajda-seo-document", "");
        document.head.appendChild(alternate);
      }
    }
    return;
  }

  document.title = page.title;
  document.documentElement.lang = "sv-SE";
  for (const key of ["description", "twitter:description"]) setHeadValue("meta", "name", key, "content", page.description);
  setHeadValue("meta", "name", "twitter:title", "content", page.title);
  setHeadValue("meta", "property", "og:title", "content", page.title);
  setHeadValue("meta", "property", "og:description", "content", page.description);
  setHeadValue("meta", "property", "og:locale", "content", "sv_SE");
  for (const link of seoHreflangAlternates(page.path, SEO_CANONICAL_ORIGIN)) {
    const alternate = document.createElement("link");
    alternate.setAttribute("rel", "alternate");
    alternate.setAttribute("hreflang", link.hreflang);
    alternate.setAttribute("href", link.href);
    alternate.setAttribute("data-sajda-seo-document", "");
    document.head.appendChild(alternate);
  }
  for (const record of seoStructuredData(page, SEO_CANONICAL_ORIGIN)) {
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.setAttribute("data-sajda-seo-document", "");
    script.textContent = JSON.stringify(record);
    document.head.appendChild(script);
  }
}

