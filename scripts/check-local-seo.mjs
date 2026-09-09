import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { canonicalUrl, isNoindexBuild, resolveSeoBuildOrigin } from "./seo-routes.mjs";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const host = "127.0.0.1";
const expectedRobots = isNoindexBuild()
  ? "noindex, nofollow"
  : "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1";

function reservePort() {
  return new Promise((resolvePort, reject) => {
    const listener = createServer();
    listener.once("error", reject);
    listener.listen(0, host, () => {
      const address = listener.address();
      if (!address || typeof address === "string") {
        listener.close();
        reject(new Error("Could not reserve a loopback port for the SEO check."));
        return;
      }

      listener.close((error) => error ? reject(error) : resolvePort(address.port));
    });
  });
}

function waitForServer(child, port) {
  return new Promise((resolveReady, reject) => {
    let logs = "";
    let settled = false;
    const expectedLine = `Sajda full app is listening on http://${host}:${port}`;
    const timeout = setTimeout(() => finish(new Error(`Local SEO server did not start within 8 seconds.\n${logs}`)), 8_000);

    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.stdout?.off("data", onOutput);
      child.stderr?.off("data", onOutput);
      child.off("exit", onExit);
      error ? reject(error) : resolveReady();
    };
    const onOutput = (chunk) => {
      logs += chunk.toString();
      if (logs.includes(expectedLine)) finish();
    };
    const onExit = (code, signal) => finish(new Error(`Local SEO server exited before it was ready (code ${code ?? "none"}, signal ${signal ?? "none"}).\n${logs}`));

    child.stdout?.on("data", onOutput);
    child.stderr?.on("data", onOutput);
    child.once("exit", onExit);
  });
}

async function stopServer(child) {
  if (child.exitCode !== null || child.signalCode) return;
  child.kill();
  await Promise.race([
    once(child, "exit"),
    new Promise((resolveDone) => setTimeout(resolveDone, 2_000)),
  ]);
}

async function get(baseUrl, path) {
  return fetch(`${baseUrl}${path}`, { redirect: "manual" });
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`Local SEO check failed: ${label}. Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`);
  }
}

function assertIncludes(value, expected, label) {
  if (!value.includes(expected)) {
    throw new Error(`Local SEO check failed: ${label}.`);
  }
}

function assertStartsWith(value, expected, label) {
  if (!value.startsWith(expected)) {
    throw new Error(`Local SEO check failed: ${label}. Expected a value starting with ${JSON.stringify(expected)}, received ${JSON.stringify(value)}.`);
  }
}

const port = await reservePort();
const child = spawn(
  process.execPath,
  ["--env-file-if-exists=.env.local", resolve(projectRoot, "infra", "local-server", "full-app-server.mjs")],
  {
    cwd: projectRoot,
    env: { ...process.env, NAME_QUEST_WEB_PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  },
);

try {
  await waitForServer(child, port);
  const baseUrl = `http://${host}:${port}`;
  const canonicalOrigin = resolveSeoBuildOrigin();
  const canonical = canonicalUrl("/se/sok-doman", canonicalOrigin);

  const seo = await get(baseUrl, "/se/sok-doman");
  assertEqual(seo.status, 200, "the clean SEO URL must resolve");
  assertStartsWith(seo.headers.get("content-type") ?? "", "text/html", "the SEO document must be HTML");
  assertEqual(seo.headers.get("cache-control"), "no-cache", "the SEO document must revalidate");
  assertEqual(seo.headers.get("x-robots-tag"), null, "the index-eligible SEO document must not carry a noindex header");
  const seoHtml = await seo.text();
  assertIncludes(seoHtml, `<link rel="canonical" href="${canonical}" />`, "the SEO document canonical must be preserved by the local server");
  assertIncludes(seoHtml, `<meta name="robots" content="${expectedRobots}" />`, "the SEO document robots directive must be preserved by the local server");

  const trailing = await get(baseUrl, "/se/sok-doman/");
  assertEqual(trailing.status, 308, "the trailing-slash SEO URL must redirect");
  assertEqual(trailing.headers.get("location"), "/se/sok-doman", "the trailing-slash SEO URL must redirect to its canonical path");

  const sitemap = await get(baseUrl, "/sitemap.xml");
  assertEqual(sitemap.status, 200, "sitemap.xml must resolve");
  assertStartsWith(sitemap.headers.get("content-type") ?? "", "application/xml", "sitemap.xml must have an XML content type");
  assertEqual(sitemap.headers.get("cache-control"), "no-cache", "sitemap.xml must revalidate");
  const sitemapXml = await sitemap.text();
  if (isNoindexBuild()) {
    if (/<url\b/iu.test(sitemapXml)) throw new Error("Local SEO check failed: a noindex build must not expose sitemap URLs.");
  } else {
    assertIncludes(sitemapXml, `<loc>${canonical}</loc>`, "sitemap.xml must contain the SEO canonical");
  }

  const robots = await get(baseUrl, "/robots.txt");
  assertEqual(robots.status, 200, "robots.txt must resolve");
  assertStartsWith(robots.headers.get("content-type") ?? "", "text/plain", "robots.txt must have a text content type");
  assertEqual(robots.headers.get("cache-control"), "no-cache", "robots.txt must revalidate");
  const robotsText = await robots.text();
  if (isNoindexBuild()) {
    assertIncludes(robotsText, "Disallow: /", "a noindex build robots.txt must block crawling");
  } else {
    assertIncludes(robotsText, `Sitemap: ${canonicalOrigin}/sitemap.xml`, "robots.txt must name the canonical sitemap");
  }

  const appShell = await get(baseUrl, "/");
  assertEqual(appShell.status, 200, "the app shell must resolve");
  assertEqual(appShell.headers.get("x-robots-tag"), "noindex, nofollow", "the interactive app shell must remain noindex");

  const missing = await get(baseUrl, "/this-route-does-not-exist");
  assertEqual(missing.status, 404, "an unknown clean URL must be a real 404");
  assertEqual(missing.headers.get("x-robots-tag"), "noindex, nofollow", "an unknown clean URL must be noindex");

  console.log("Local SEO HTTP: OK");
} finally {
  await stopServer(child);
}
