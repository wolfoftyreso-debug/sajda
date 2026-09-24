import assert from "node:assert/strict";
import test from "node:test";
import { brandLookupEndpoint, lookupBrand, safeBrandLookupLink } from "../src/lib/brandLookupClient";
import { syntheticBrandMatches, syntheticBrandProfile } from "./fixtures/brand-lookup";

test("anonymous brand lookup validates transport and strict response correspondence", async t => {
  const original = globalThis.fetch;
  try {
    await t.test("web stays relative; native requires an explicit clean HTTPS origin", () => {
      assert.equal(brandLookupEndpoint(false), "/api/v1/public/brand-lookup");
      assert.equal(brandLookupEndpoint(true, "https://sajda.example/"), "https://sajda.example/api/v1/public/brand-lookup");
      for (const origin of [undefined, "", "http://sajda.example", "https://user:secret@sajda.example", "https://sajda.example/path", "https://sajda.example/?secret=1", "https://sajda.example/#app"]) assert.throws(() => brandLookupEndpoint(true, origin));
    });
    await t.test("query stays in a cookie-free POST body and the caller controls cancellation", async () => {
      const controller = new AbortController();
      globalThis.fetch = async (url, init) => {
        assert.equal(url, "/api/v1/public/brand-lookup"); assert.equal(init?.method, "POST"); assert.equal(init?.credentials, "omit");
        assert.equal(init?.cache, "no-store"); assert.equal(init?.redirect, "error"); assert.equal(init?.referrerPolicy, "no-referrer"); assert.equal(init?.signal, controller.signal);
        assert.deepEqual(JSON.parse(String(init?.body)), { operation: "search", query: "品牌示例", locale: "zh" });
        assert.deepEqual(init?.headers, { "Content-Type": "application/json", Accept: "application/json" });
        return Response.json(syntheticBrandMatches("品牌示例", "zh"));
      };
      assert.equal((await lookupBrand({ operation: "search", query: " 品牌示例 ", locale: "zh" }, { signal: controller.signal })).operation, "search");
    });
    await t.test("no matches is a valid result, while provider and malformed responses fail", async () => {
      const request = { operation: "search" as const, query: "ExampleBrand", locale: "en" as const }, options = { signal: new AbortController().signal };
      globalThis.fetch = async () => Response.json(syntheticBrandMatches("ExampleBrand", "en", true));
      const empty = await lookupBrand(request, options); assert.equal(empty.operation, "search"); if (empty.operation === "search") assert.equal(empty.status, "no_matches");
      for (const response of [Response.json({ error: "source_unavailable" }, { status: 503 }), Response.json({}), Response.json({ ...syntheticBrandMatches(), query: "Another brand" }), Response.json({ ...syntheticBrandMatches(), locale: "sv" }), Response.json({ ...syntheticBrandMatches(), status: "no_matches" }), Response.json({ ...syntheticBrandMatches(), candidates: [] }), Response.json({ ...syntheticBrandMatches(), verified_index: 100 })]) {
        globalThis.fetch = async () => response; await assert.rejects(lookupBrand(request, options));
      }
    });
    await t.test("profile matches the requested ID; canonical entity redirects remain explicit", async () => {
      const request = { operation: "profile" as const, entity_id: "Q901", locale: "en" as const }, options = { signal: new AbortController().signal };
      globalThis.fetch = async () => Response.json(syntheticBrandProfile("Q902")); await assert.rejects(lookupBrand(request, options));
      const redirected = syntheticBrandProfile("Q901"); redirected.entity.entity_id = "Q902"; redirected.entity.source_url = "https://www.wikidata.org/wiki/Q902";
      globalThis.fetch = async () => Response.json(redirected); const response = await lookupBrand(request, options);
      assert.equal(response.operation, "profile"); if (response.operation === "profile") { assert.equal(response.requested_entity_id, "Q901"); assert.equal(response.index.score, null); }
    });
    await t.test("source URLs cannot become executable or credential-bearing links", () => {
      for (const url of [null, "javascript:alert(1)", "data:text/html,hello", "file:///tmp/file", "https://user:secret@example.com/"]) assert.equal(safeBrandLookupLink(url), null);
      assert.equal(safeBrandLookupLink("https://example.com/"), "https://example.com/");
    });
  } finally { globalThis.fetch = original; }
});
