import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import middleware, { config } from "../middleware";
import { isNoindexBuild } from "../scripts/seo-routes.mjs";

const queryVariants = [
  "?q=private-idea", "?sort=price", "?neverSeenBefore=1", "?%75nrecognized=value",
  "?%E5%90%8D%E7%A7%B0=%E7%A7%98%E5%AF%86", "?=value", "?flag", "?q=first&q=second",
];

test("production indexing fails closed without an exact explicit activation", () => {
  for (const flag of [undefined, "", " ", "INDEX", "enabled", "false", "noindex"]) {
    assert.equal(isNoindexBuild({ VERCEL_ENV: "production", SAJDA_SEO_INDEXING: flag }), true);
  }
  assert.equal(isNoindexBuild({ VERCEL_ENV: "production", SAJDA_SEO_INDEXING: "index" }), false);
  assert.equal(isNoindexBuild({ VERCEL_ENV: "preview", SAJDA_SEO_INDEXING: "index" }), true);
  assert.equal(isNoindexBuild({ VERCEL_ENV: "development", SAJDA_SEO_INDEXING: "index" }), true);
  assert.equal(isNoindexBuild({}), false, "local static inspection build is unchanged");
});

test("official Vercel middleware continues static routing and marks all query keys", async () => {
  assert.deepEqual(config.matcher, ["/se", "/se/:path*"]);
  for (const suffix of queryVariants) {
    const response = middleware(new Request(`https://sajda-eight.vercel.app/se/sok-doman${suffix}`));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-middleware-next"), "1", "the official next helper must preserve downstream routing");
    assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
    assert.equal(response.headers.get("x-sajda-query-policy"), "noindex");
    assert.equal(response.headers.get("location"), null, "never redirect or rewrite private input");
    assert.equal(response.headers.get("set-cookie"), null);
    assert.equal(await response.text(), "", "middleware does not replace the static document");
    assert.ok([...response.headers.values()].every(value => !value.includes("private-idea")));
  }
  for (const route of ["/se", "/se/sok-doman", "/api/auth?q=x", "/assets/app.js?v=1", "/search?q=x", "/secret?q=x"]) {
    const response = middleware(new Request(`https://sajda-eight.vercel.app${route}`));
    assert.equal(response.headers.get("x-robots-tag"), null, route);
    assert.equal(response.headers.get("x-sajda-query-policy"), null, route);
    assert.equal(response.headers.get("x-middleware-next"), "1");
  }
  assert.equal(middleware(new Request("https://sajda-eight.vercel.app/se?anything=yes")).headers.get("x-robots-tag"), "noindex, nofollow");
});

test("production-mode HTTP fixture exposes noindex before serving an indexable HTML document", async () => {
  // Exercise the real middleware Response over HTTP with deliberately indexable
  // production HTML. This is not a substitute for the deployed Vercel probe.
  const production = { VERCEL_ENV: "production", SAJDA_SEO_INDEXING: "index" };
  assert.equal(isNoindexBuild(production), false);
  const html = '<!doctype html><html><head><meta name="robots" content="index, follow"></head><body><h1>Public entry</h1></body></html>';
  const server = createServer((incoming, outgoing) => {
    const request = new Request(`https://sajda-eight.vercel.app${incoming.url}`, { method: incoming.method });
    const result = middleware(request);
    outgoing.setHeader("Content-Type", "text/html; charset=utf-8");
    for (const [key, value] of result.headers) {
      if (!key.startsWith("x-middleware-")) outgoing.setHeader(key, value);
    }
    outgoing.end(incoming.method === "HEAD" ? undefined : html);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  try {
    const clean = await fetch(`${origin}/se/sok-doman`, { signal: AbortSignal.timeout(5000) });
    assert.equal(clean.status, 200);
    assert.equal(clean.headers.get("x-robots-tag"), null);
    assert.match(await clean.text(), /content="index, follow"/u);
    for (const suffix of queryVariants) {
      const response = await fetch(`${origin}/se/sok-doman${suffix}`, { signal: AbortSignal.timeout(5000) });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
      assert.equal(response.headers.get("x-sajda-query-policy"), "noindex");
      assert.equal(await response.text(), html, "no client script is needed to read the stricter HTTP directive");
    }
    const head = await fetch(`${origin}/se?unknown=value`, { method: "HEAD", signal: AbortSignal.timeout(5000) });
    assert.equal(head.headers.get("x-robots-tag"), "noindex, nofollow");
    assert.equal(await head.text(), "");
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
