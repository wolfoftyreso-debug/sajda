import { next } from "@vercel/functions";

// This runs before Vercel serves the static HTML, including cache hits. It is
// limited to the public SEO namespace and performs no external calls.
// Vercel can resolve unreserved encoded path characters to the same static file
// while Request.url still contains the encoding. Match only the four spellings
// of the literal `se` segment and literal/single-encoded slash boundaries,
// including leading separators collapsed by Vercel, not unrelated namespaces.
// Accepted by the official Vercel routing-utils middleware matcher compiler.
export const config = { matcher: ["/((?:/|%2[fF])*(?:s|%73)(?:e|%65)(?:/.*|%2[fF].*)?)"] };

function isSeoNamespace(pathname: string): boolean {
  // Decode once, and only the bytes relevant to the namespace and its boundary.
  // Do not recursively decode %25 or case-fold /SE. Malformed suffix escapes
  // cannot throw or prevent noindex for an otherwise matching /se namespace.
  const decodedPath = pathname.replace(/%(?:73|65|2[fF])/gu, encoded => decodeURIComponent(encoded)).replace(/^\/+/, "/");
  return decodedPath === "/se" || decodedPath.startsWith("/se/");
}

export default function middleware(request: Request): Response {
  const url = new URL(request.url);
  const response = next();
  if (isSeoNamespace(url.pathname) && url.search) {
    // Do not enumerate parameter names: unrecognized and encoded keys are
    // still transient variants, not approved landing pages. Never echo them.
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    // A constant marker makes this routing gate distinguishable from Vercel's
    // preview-wide noindex header without exposing any visitor input.
    response.headers.set("X-Sajda-Query-Policy", "noindex");
  }
  return response;
}
