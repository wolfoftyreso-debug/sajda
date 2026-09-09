import assert from "node:assert/strict";
import {
  DEFAULT_SEO_ORIGIN,
  isNoindexBuild,
  resolveSeoBuildOrigin,
} from "./seo-routes.mjs";

assert.equal(
  isNoindexBuild({ VERCEL_ENV: "preview", SAJDA_SEO_INDEXING: "index" }),
  true,
  "a Vercel Preview must remain noindex even when an index override is present",
);
assert.equal(
  isNoindexBuild({ VERCEL_ENV: "development", SAJDA_SEO_INDEXING: "index" }),
  true,
  "a Vercel development deployment must remain noindex",
);
assert.equal(
  isNoindexBuild({ VERCEL_ENV: "production", SAJDA_SEO_INDEXING: "index" }),
  false,
  "a deliberate production index build must remain index-eligible",
);
assert.equal(
  isNoindexBuild({ VERCEL_ENV: "production", SAJDA_SEO_INDEXING: "noindex" }),
  true,
  "an explicit production noindex override must remain available",
);
assert.equal(
  resolveSeoBuildOrigin({}),
  DEFAULT_SEO_ORIGIN,
  "the default static and browser canonical origins must agree",
);
assert.equal(
  resolveSeoBuildOrigin({
    SAJDA_CANONICAL_ORIGIN: "https://example.test",
    VITE_SAJDA_CANONICAL_ORIGIN: "https://example.test",
  }),
  "https://example.test",
  "matching static and browser canonical origins must be accepted",
);
assert.throws(
  () => resolveSeoBuildOrigin({
    SAJDA_CANONICAL_ORIGIN: "https://static.example.test",
    VITE_SAJDA_CANONICAL_ORIGIN: "https://browser.example.test",
  }),
  /must resolve to the same HTTPS origin/u,
  "a mismatched static and browser canonical origin must fail closed",
);

console.log("SEO policy: OK");
