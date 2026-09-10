import { seoProductPages } from "./seoProductPages";

export const SEO_INDEX_ROBOTS = "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1";
export const SEO_NOINDEX_ROBOTS = "noindex, nofollow";

export interface SeoDocument {
  path: string;
  title: string;
  description: string;
  h1: string;
  label: string;
}

export const seoDocuments: readonly SeoDocument[] = [
  ...Object.values(seoProductPages).map(page => ({
    path: page.path, title: page.title, description: page.description, h1: page.h1, label: page.eyebrow,
  })),
  {
    path: "/se/sa-fungerar-sajda",
    title: "Så fungerar Sajda — underlag för ditt domänval | Sajda",
    description: "Se hur Sajda hittar, kontrollerar och jämför domännamn. Status, priskällor och osäkerhet visas så att du kan välja själv.",
    h1: "Ett domänval blir bättre när underlaget följer med.",
    label: "Så fungerar Sajda",
  },
];

export function seoDocumentForPath(pathname: string): SeoDocument | undefined {
  return seoDocuments.find(page => page.path === pathname.replace(/\/$/u, ""));
}

/** Only real, published parents belong in the breadcrumb trail. */
export function seoBreadcrumbs(page: SeoDocument): Array<{ path: string; name: string }> {
  const trail = [{ path: "/se", name: "Sajda Sverige" }];
  if (page.path === "/se") return trail;
  for (const [path, name] of [["/se/toppdomaner", "Domänändelser"], ["/se/guide", "Domänguide"]]) {
    if (page.path.startsWith(`${path}/`)) trail.push({ path, name });
  }
  return [...trail, { path: page.path, name: page.label }];
}

export function seoStructuredData(page: SeoDocument, origin: string): Record<string, unknown>[] {
  const records: Record<string, unknown>[] = [{
    "@context": "https://schema.org", "@type": "WebPage", name: page.h1,
    description: page.description, url: `${origin}${page.path}`, inLanguage: "sv-SE",
    isPartOf: { "@type": "WebSite", name: "Sajda", url: `${origin}/se` },
  }];
  const trail = seoBreadcrumbs(page);
  // A one-item trail is not eligible for Google's BreadcrumbList feature.
  if (trail.length > 1) records.push({
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: trail.map((item, index) => ({
      "@type": "ListItem", position: index + 1, name: item.name, item: `${origin}${item.path}`,
    })),
  });
  return records;
}

/** Query-bearing, preview, unknown and interactive URLs never become indexable. */
export function seoRobotsForLocation(input: {
  pathname: string; search: string; origin: string; canonicalOrigin: string; buildPolicy: string | null;
}): string {
  return input.buildPolicy === "index" && input.origin === input.canonicalOrigin
    && !input.search && seoDocumentForPath(input.pathname)
    ? SEO_INDEX_ROBOTS : SEO_NOINDEX_ROBOTS;
}
