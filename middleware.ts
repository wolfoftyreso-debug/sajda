import { next } from "@vercel/functions";

// This runs before Vercel serves the static HTML, including cache hits. It is
// limited to the public SEO namespace and performs no external calls.
export const config = { matcher: ["/se", "/se/:path*"] };

export default function middleware(request: Request): Response {
  const url = new URL(request.url);
  const response = next();
  if ((url.pathname === "/se" || url.pathname.startsWith("/se/")) && url.search) {
    // Do not enumerate parameter names: unrecognized and encoded keys are
    // still transient variants, not approved landing pages. Never echo them.
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    // A constant marker makes this routing gate distinguishable from Vercel's
    // preview-wide noindex header without exposing any visitor input.
    response.headers.set("X-Sajda-Query-Policy", "noindex");
  }
  return response;
}
