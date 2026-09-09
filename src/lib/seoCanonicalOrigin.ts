/**
 * Public SEO routes are generated at build time and then hydrated in React.
 * Keep the browser-side value explicit so a build cannot silently reapply a
 * different canonical after the static document has been served.
 */
export const SEO_CANONICAL_ORIGIN = (
  import.meta.env.VITE_SAJDA_CANONICAL_ORIGIN?.trim() || "https://sajda.dev"
).replace(/\/$/u, "");
