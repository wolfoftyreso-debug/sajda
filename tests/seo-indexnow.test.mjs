import test from "node:test";
import assert from "node:assert/strict";
import { indexNowPayload, submitIndexNow } from "../scripts/seo-indexnow.mjs";
import { INDEXABLE_PAGES, SEO_PAGES } from "../scripts/seo-routes.mjs";

test("IndexNow never pings while the site is in noindex hold", async () => {
  const calls = [];
  const result = await submitIndexNow({
    VERCEL_ENV: "production",
    SAJDA_SEO_INDEXING: "index",
    SAJDA_CANONICAL_ORIGIN: "https://sajda-eight.vercel.app",
    SAJDA_INDEXNOW_KEY: "abc123def456",
  }, async (...args) => {
    calls.push(args);
    return new Response("ok", { status: 200 });
  });
  assert.deepEqual(result, { submitted: false, reason: "noindex" });
  assert.equal(calls.length, 0);
});

test("IndexNow submits only approved public URLs when indexing is enabled", async () => {
  const calls = [];
  const result = await submitIndexNow({
    VERCEL_ENV: "production",
    SAJDA_SEO_INDEXING: "index",
    SAJDA_CANONICAL_ORIGIN: "https://sajda.dev",
    SAJDA_INDEXNOW_KEY: "abc123def456",
  }, async (url, init) => {
    calls.push({ url, init });
    return new Response("ok", { status: 200 });
  });
  assert.equal(result.submitted, true);
  assert.equal(result.count, INDEXABLE_PAGES.length);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.redirect, "error");
  assert.ok(calls[0].init.signal instanceof AbortSignal);
  const payload = JSON.parse(calls[0].init.body);
  assert.equal(payload.keyLocation, "https://sajda.dev/abc123def456.txt");
  assert.equal(payload.urlList.length, INDEXABLE_PAGES.length);
  assert.ok(payload.urlList.includes("https://sajda.dev/pricing"));
  assert.ok(payload.urlList.includes("https://sajda.dev/brand-index"));
  assert.ok(!payload.urlList.includes("https://sajda.dev/brand-index/assessment"));
  assert.equal(payload.urlList.filter((url) => url.startsWith("https://sajda.dev/se")).length, SEO_PAGES.length);
  assert.deepEqual(indexNowPayload("https://sajda.dev", "abc123def456", "sajda.dev").urlList, payload.urlList);
});

test("IndexNow transport failures are bounded and never become successful submission", async () => {
  const environment = {
    VERCEL_ENV: "production",
    SAJDA_SEO_INDEXING: "index",
    SAJDA_CANONICAL_ORIGIN: "https://sajda.dev",
    SAJDA_INDEXNOW_KEY: "abc123def456",
  };
  assert.deepEqual(await submitIndexNow(environment, async () => { throw new Error("private provider detail"); }),
    { submitted: false, reason: "upstream_unavailable" });
  assert.deepEqual(await submitIndexNow(environment, async () => new Response("private body", { status: 429 })),
    { submitted: false, reason: "upstream_rejected" });
});
