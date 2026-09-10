import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "cheerio";
import { SEO_PAGES, DEFAULT_SEO_ORIGIN } from "./seo-routes.mjs";

const run = promisify(execFile);

/** Only public document metadata is returned, never response cookies or bodies. */
export function inspectSeoDocument({ path, status, headers, body }, canonicalOrigin, preview) {
  const $ = load(body);
  const meta = name => $(`meta[name="${name}"]`).attr("content") ?? "";
  const canonical = $('link[rel="canonical"]').attr("href") ?? "";
  const robots = `${meta("robots")} ${headers["x-robots-tag"] ?? ""}`;
  const issues = [];
  if (status !== 200) issues.push("http_not_200");
  if (!headers["content-type"]?.includes("text/html")) issues.push("not_html");
  if ($("h1").length !== 1) issues.push("h1_count");
  if (!$('title').text().trim()) issues.push("missing_title");
  if (!meta("description").trim()) issues.push("missing_description");
  if (canonical !== canonicalOrigin + path) issues.push("canonical_mismatch");
  if ($('html').attr("lang") !== "sv-SE") issues.push("language_mismatch");
  if (preview ? !/\bnoindex\b/u.test(robots) : /\bnoindex\b/u.test(robots)) issues.push("indexation_mismatch");
  let schemas = 0;
  $('script[type="application/ld+json"]').each((_index, node) => {
    try { JSON.parse($(node).text()); schemas++; } catch { issues.push("invalid_json_ld"); }
  });
  if (!schemas) issues.push("missing_json_ld");
  return { path, status, title: $('title').text(), canonical, headings: $("h1").length, schemas, issues };
}

async function httpGet(origin, path, cli) {
  if (cli) {
    // CLI handles its existing authenticated protection session. Do not extract
    // credentials, disable protection, follow redirects or print raw headers.
    const { stdout } = await run(process.execPath, [cli, "curl", path, "--deployment", origin,
      "--scope", "hypbit", "--", "--silent", "--show-error", "--max-time", "25", "--include"],
    { timeout: 40_000, maxBuffer: 2_000_000, windowsHide: true });
    const split = stdout.search(/\r?\n\r?\n/u);
    if (split < 0) throw new Error("invalid_http_envelope");
    const head = stdout.slice(0, split);
    const body = stdout.slice(split).replace(/^\r?\n\r?\n/u, "");
    const status = Number(head.match(/^HTTP\/[^ ]+\s+(\d{3})/u)?.[1]);
    const headers = {};
    for (const line of head.split(/\r?\n/u).slice(1)) {
      const separator = line.indexOf(":");
      if (separator > 0) headers[line.slice(0, separator).toLowerCase()] = line.slice(separator + 1).trim();
    }
    return { path, status, headers, body };
  }
  const response = await fetch(origin + path, { redirect: "manual", signal: AbortSignal.timeout(25_000) });
  return { path, status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() };
}

export async function auditSeoHttp({ origin, canonicalOrigin = DEFAULT_SEO_ORIGIN, preview = true, cli }) {
  const parsed = new URL(origin);
  if (parsed.protocol !== "https:" || parsed.origin !== origin || parsed.username || parsed.password) throw new Error("Use a bare HTTPS origin");
  const documents = [];
  // Small fixed concurrency: no discovery crawler and no product API calls.
  const queue = [...SEO_PAGES];
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (queue.length) {
      const page = queue.shift();
      try { documents.push(inspectSeoDocument(await httpGet(origin, page.path, cli), canonicalOrigin, preview)); }
      catch { documents.push({ path: page.path, issues: ["request_failed"] }); }
    }
  }));
  const checks = [];
  for (const path of ["/robots.txt", "/sitemap.xml", "/se/sok-doman/", "/sajda-audit-missing-route", "/auth", "/se/sok-doman?q=private-test-idea"]) {
    try {
      const result = await httpGet(origin, path, cli);
      const $ = load(result.body);
      const issues = [];
      if (path === "/sajda-audit-missing-route") {
        if (result.status !== 404) issues.push("soft_404");
      } else if (path.endsWith("/")) {
        const destination = result.headers.location;
        if (![301, 308].includes(result.status) || !destination || new URL(destination, origin).pathname !== path.slice(0, -1)) issues.push("redirect_mismatch");
      } else if (result.status !== 200) issues.push("http_not_200");
      if (path === "/sitemap.xml") {
        const locs = [...result.body.matchAll(/<loc>(.*?)<\/loc>/gu)].map(match => match[1]);
        const expected = preview ? [] : SEO_PAGES.map(page => canonicalOrigin + page.path);
        if (JSON.stringify(locs.sort()) !== JSON.stringify(expected.sort())) issues.push("sitemap_mismatch");
      }
      if (path === "/robots.txt" && (!/^User-agent:/imu.test(result.body) || (!preview && !result.body.includes(`Sitemap: ${canonicalOrigin}/sitemap.xml`)))) issues.push("robots_mismatch");
      if (path === "/auth" || path.includes("?")) {
        const robots = `${result.headers["x-robots-tag"] ?? ""} ${$('meta[name="robots"]').attr("content") ?? ""}`;
        if (!/\bnoindex\b/u.test(robots)) issues.push("private_or_query_page_indexable");
      }
      checks.push({ path, status: result.status, issues });
    } catch { checks.push({ path, issues: ["request_failed"] }); }
  }
  return { origin, canonicalOrigin, preview, documents: documents.sort((a, b) => a.path.localeCompare(b.path)), checks,
    passed: [...documents, ...checks].every(row => row.issues.length === 0) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const value = flag => {
    const index = args.indexOf(flag);
    const result = index < 0 ? undefined : args[index + 1];
    if (!result || result.startsWith("--")) throw new Error(`Missing value for ${flag}`);
    return result;
  };
  const report = await auditSeoHttp({ origin: value("--origin"), preview: !args.includes("--production"),
    canonicalOrigin: args.includes("--canonical") ? value("--canonical") : DEFAULT_SEO_ORIGIN,
    cli: args.includes("--vercel-cli") ? value("--vercel-cli") : undefined });
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
}
