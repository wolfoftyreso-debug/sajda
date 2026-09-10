import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom";
import SeoProductPage from "../src/pages/SeoProductPage";
import SajdaMethodology from "../src/pages/SajdaMethodology";
import { seoProductPages } from "../src/lib/seoProductPages";
import { seoDocuments, seoStructuredData } from "../src/lib/seoDocuments";

export { seoDocuments, seoStructuredData };

/** Build-time rendering of the actual product, not a second crawler-only page. */
export function renderSeoPage(pathname: string): string {
  const page = Object.values(seoProductPages).find(item => item.path === pathname);
  if (!page && pathname !== "/se/sa-fungerar-sajda") throw new Error(`No product page for ${pathname}`);
  return renderToStaticMarkup(
    <StaticRouter location={pathname}>
      {page ? <SeoProductPage pageId={page.id} /> : <SajdaMethodology />}
    </StaticRouter>,
  );
}
