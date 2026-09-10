import test from "node:test";
import assert from "node:assert/strict";
import { inspectSeoDocument } from "../scripts/audit-seo-http.mjs";

const fixture = (robots = "noindex, nofollow") => ({ path: "/se", status: 200, headers: { "content-type": "text/html" },
  body: `<html lang="sv-SE"><head><title>Sajda</title><meta name="description" content="Domain research"><meta name="robots" content="${robots}"><link rel="canonical" href="https://example.test/se"><script type="application/ld+json">{"@type":"WebPage"}</script></head><body><h1>Sajda</h1></body></html>` });

test("HTTP SEO audit accepts matching protected-preview and production metadata", () => {
  assert.deepEqual(inspectSeoDocument(fixture(), "https://example.test", true).issues, []);
  assert.deepEqual(inspectSeoDocument(fixture("index, follow"), "https://example.test", false).issues, []);
});
test("HTTP SEO audit rejects protection login pages, wrong canonicals and stale indexation", () => {
  const result = inspectSeoDocument({ path: "/se", status: 401, headers: {}, body: "Sign in to deployment" }, "https://example.test", true);
  for (const code of ["http_not_200", "not_html", "h1_count", "canonical_mismatch", "indexation_mismatch", "missing_json_ld"]) assert.ok(result.issues.includes(code));
  assert.ok(inspectSeoDocument(fixture("index, follow"), "https://example.test", true).issues.includes("indexation_mismatch"));
});
test("HTTP SEO audit honors restrictive response headers and never returns response credentials", () => {
  const response = fixture("index, follow");
  response.headers["x-robots-tag"] = "noindex";
  response.headers["set-cookie"] = "private-fixture";
  assert.ok(inspectSeoDocument(response, "https://example.test", false).issues.includes("indexation_mismatch"));
  assert.ok(!JSON.stringify(inspectSeoDocument(response, "https://example.test", false)).includes("private-fixture"));
});
