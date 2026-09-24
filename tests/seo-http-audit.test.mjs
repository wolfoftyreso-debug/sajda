import test from "node:test";
import assert from "node:assert/strict";
import { auditSeoHttp, inspectSeoDocument, inspectSeoRobots } from "../scripts/audit-seo-http.mjs";

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

test("HTTP SEO audit applies case-insensitive, duplicate and Google-specific restrictions", () => {
  for (const rules of ["NOINDEX, FOLLOW", "none", "NONE"]) {
    assert.ok(inspectSeoDocument(fixture(rules), "https://example.test", false).issues.includes("indexation_mismatch"));
  }
  assert.deepEqual(inspectSeoDocument(fixture("index, follow, max-image-preview: none"), "https://example.test", false).issues, []);
  for (const name of ["robots", "ROBOTS", "googlebot", "GoogleBot"]) {
    const response = fixture("index, follow");
    response.body = response.body.replace("</head>", `<meta name="${name}" content="NOINDEX"></head>`);
    assert.ok(inspectSeoDocument(response, "https://example.test", false).issues.includes("indexation_mismatch"));
  }
  for (const rules of ["NOINDEX", "none", "Googlebot: NOINDEX", "googlebot: nofollow, none"]) {
    const response = fixture("index, follow");
    response.headers["x-robots-tag"] = rules;
    assert.ok(inspectSeoDocument(response, "https://example.test", false).issues.includes("indexation_mismatch"));
  }
  for (const rules of ["max-image-preview:none", "max-image-preview: none", "otherbot: noindex, nofollow", "otherbot: none"]) {
    const response = fixture("index, follow");
    response.headers["x-robots-tag"] = rules;
    assert.deepEqual(inspectSeoDocument(response, "https://example.test", false).issues, []);
  }
});

test("HTTP SEO audit validates crawl rules instead of only finding a sitemap line", () => {
  const origin = "https://example.test";
  const sitemap = `Sitemap: ${origin}/sitemap.xml\n`;
  assert.deepEqual(inspectSeoRobots(`User-agent: *\nAllow: /\n${sitemap}`, origin, origin, false), []);
  assert.ok(inspectSeoRobots(`User-agent: *\nDisallow: /\n${sitemap}`, origin, origin, false).includes("canonical_page_blocked"));
  assert.ok(inspectSeoRobots(`User-agent: *\nAllow: /\nUser-agent: Googlebot\nDisallow: /se/guide\n${sitemap}`, origin, origin, false).includes("canonical_page_blocked"));
  assert.deepEqual(inspectSeoRobots("User-agent: *\nDisallow: /\n", origin, origin, true), []);
  assert.ok(inspectSeoRobots("User-agent: *\nAllow: /\n", origin, origin, true).includes("preview_crawlable"));
});

test("production audit cannot sign off a protected preview or another canonical host", async () => {
  await assert.rejects(auditSeoHttp({ origin: "https://preview.test", canonicalOrigin: "https://production.test", preview: false }), /canonical origin/u);
  await assert.rejects(auditSeoHttp({ origin: "https://production.test", canonicalOrigin: "https://production.test", preview: false, cli: "vercel-cli" }), /unauthenticated HTTP/u);
});
