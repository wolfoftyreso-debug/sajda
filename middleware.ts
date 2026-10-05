import { next } from "@vercel/functions";
import { isNoindexBuild } from "./scripts/seo-policy.mjs";

// This runs before Vercel serves the static HTML, including cache hits. It is
// limited to public SEO documents (/se, /pricing, /brand-index) plus the
// private Brand Index result path, and performs no external calls.
// Vercel can resolve unreserved encoded path characters to the same static file
// while Request.url still contains the encoding. Match only the four spellings
// of the literal `se` segment and literal/single-encoded slash boundaries,
// including leading separators collapsed by Vercel, not unrelated namespaces.
// Accepted by the official Vercel routing-utils middleware matcher compiler.
export const config = {
  matcher: [
    "/((?:/|%2[fF])*(?:s|%73)(?:e|%65)(?:/.*|%2[fF].*)?)",
    "/pricing",
    "/brand-index",
    "/brand-index/assessment",
  ],
};

function isSeoNamespace(pathname: string): boolean {
  // Decode once, and only the bytes relevant to the namespace and its boundary.
  // Do not recursively decode %25 or case-fold /SE. Malformed suffix escapes
  // cannot throw or prevent noindex for an otherwise matching /se namespace.
  const decodedPath = pathname.replace(/%(?:73|65|2[fF])/gu, encoded => decodeURIComponent(encoded)).replace(/^\/+/, "/");
  return decodedPath === "/se" || decodedPath.startsWith("/se/");
}

function normalizeMiddlewarePath(pathname: string): string {
  const path = pathname.replace(/\/+$/u, "");
  return path || "/";
}

export function applySeoRobotsHeaders(
  url: URL,
  response: Response,
  environment: NodeJS.ProcessEnv = process.env,
): Response {
  const path = normalizeMiddlewarePath(url.pathname);
  const privateResult = path === "/brand-index/assessment" || path.startsWith("/brand-index/assessment/");
  const publicIndex = path === "/pricing" || path === "/brand-index";
  if (privateResult) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    if (url.search) response.headers.set("X-Sajda-Query-Policy", "noindex");
    return response;
  }
  if (!publicIndex && !isSeoNamespace(url.pathname)) return response;
  // Query variants are never landing pages. The site-wide hold also marks
  // clean public documents noindex until a branded origin is indexed.
  if (url.search || isNoindexBuild(environment)) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    if (url.search) response.headers.set("X-Sajda-Query-Policy", "noindex");
  }
  return response;
}

export default function middleware(request: Request): Response {
  const url = new URL(request.url);
  return applySeoRobotsHeaders(url, next());
}
