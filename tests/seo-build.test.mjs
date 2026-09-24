import test from "node:test";
import assert from "node:assert/strict";
import { createStaticBuildEnvironment } from "../scripts/build-static.mjs";
import { isNoindexBuild } from "../scripts/seo-routes.mjs";

test("dotenv indexing holds reach the plain Node static generator", () => {
  const environment = createStaticBuildEnvironment({
    SAJDA_CANONICAL_ORIGIN: "https://example.test",
    SAJDA_SEO_INDEXING: "noindex",
  }, {});
  assert.equal(environment.SAJDA_SEO_INDEXING, "noindex");
  assert.equal(isNoindexBuild(environment), true);
  assert.equal(environment.VITE_SAJDA_CANONICAL_ORIGIN, "https://example.test");
  assert.equal(isNoindexBuild(createStaticBuildEnvironment({ VERCEL_ENV: "production" }, {})), true);
  assert.equal(isNoindexBuild(createStaticBuildEnvironment({ VERCEL_ENV: "preview", SAJDA_SEO_INDEXING: "index" }, {})), true);
});

test("process settings retain precedence without letting local mode disable indexing protection", () => {
  const environment = createStaticBuildEnvironment({
    SAJDA_CANONICAL_ORIGIN: "https://dotenv.test", SAJDA_SEO_INDEXING: "noindex", VERCEL_ENV: "preview",
  }, {
    SAJDA_CANONICAL_ORIGIN: "https://process.test", SAJDA_SEO_INDEXING: "index", VERCEL_ENV: "production",
  });
  assert.equal(environment.SAJDA_CANONICAL_ORIGIN, "https://process.test");
  assert.equal(environment.VITE_SAJDA_CANONICAL_ORIGIN, "https://process.test");
  assert.equal(isNoindexBuild(environment), false);
  const local = createStaticBuildEnvironment({ SAJDA_SEO_INDEXING: "noindex" }, {}, true);
  assert.equal(local.VITE_LOCAL_TEST_MODE, "true");
  assert.equal(local.VITE_PUBLIC_SEARCH_MODE, "false");
  assert.equal(isNoindexBuild(local), true);
});

test("static and hydrated canonicals cannot diverge across environment sources", () => {
  assert.throws(() => createStaticBuildEnvironment({ SAJDA_CANONICAL_ORIGIN: "https://dotenv.test" }, {
    VITE_SAJDA_CANONICAL_ORIGIN: "https://other.test",
  }), /must match/u);
});
