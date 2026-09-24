/** Real Edge/Chromium UI, synthetic source responses. No real Wikidata, auth or provider use.
 * node --import tsx scripts/check-brand-lookup-browser.mjs
 * SAJDA_PLAYWRIGHT_ROOT points to the bundled dependency directory.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { connect } from "node:net";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { brandLookupCopy } from "../src/i18n/brandLookupCopy.ts";
import { syntheticBrandMatches, syntheticBrandProfile } from "../tests/fixtures/brand-lookup.ts";
const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(process.env.SAJDA_PLAYWRIGHT_ROOT ? resolve(process.env.SAJDA_PLAYWRIGHT_ROOT, "__sajda_brand_lookup_qa.cjs") : import.meta.url);
const { chromium } = require("playwright");
const origin = "http://127.0.0.1:8191", output = resolve(project, "tmp/brand-lookup-browser");
await mkdir(output, { recursive: true });
const free = await new Promise(done => { const socket = connect({ host: "127.0.0.1", port: 8191 });
  socket.once("connect", () => { socket.destroy(); done(false); }); socket.once("error", error => { socket.destroy(); done(error.code === "ECONNREFUSED"); }); socket.setTimeout(1000, () => { socket.destroy(); done(false); }); });
assert.ok(free, "Harness startup blocked: port8191 is occupied or cannot be verified; no existing process will be terminated.");
const server = spawn(process.execPath, [resolve(project, "node_modules/vite/bin/vite.js"), "--config", "tests/fixtures/name-packages.vite.ts"], { cwd: project, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, NO_COLOR: "1" } });
let log = "", browser, phase = "harness_startup", external = 0, unexpectedApi = 0, layouts = 0;
const errors = [], calls = [], measurements = [], screenshots = [], startup = [], failedQueries = new Set();
server.stdout.on("data", data => { log = (log + data).slice(-32000); }); server.stderr.on("data", data => { log = (log + data).slice(-32000); });
try {
  const deadline = Date.now() + 90000; let ready = false;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Fixture exited: ${log}`);
    try { const result = await fetch(`${origin}/brand-index`, { signal: AbortSignal.timeout(1000) }); if (result.ok && (await result.text()).includes("LOCAL UI FIXTURE — Sajda Name packages")) { ready = true; break; } } catch { /* Bounded harness readiness only. */ }
    await delay(200);
  }
  assert.ok(ready, `Fixture startup timeout: ${log}`);
  browser = await chromium.launch({ headless: true, channel: process.env.SAJDA_QA_BROWSER_CHANNEL || "msedge" });
  const context = await browser.newContext({ locale: "en-US", viewport: { width: 390, height: 900 } });
  context.setDefaultTimeout(15000); context.setDefaultNavigationTimeout(30000);
  await context.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) { external++; return route.abort("blockedbyclient"); }
    if (url.pathname === "/api/v1/public/brand-lookup") {
      assert.equal(request.method(), "POST"); assert.equal(url.search, "");
      const headers = request.headers(); assert.equal(headers.authorization, undefined); assert.equal(headers.cookie, undefined); assert.equal(headers["x-sajda-account"], undefined);
      const body = request.postDataJSON(); calls.push(body);
      if (body.operation === "search" && body.query === "UnavailableSynthetic" && !failedQueries.has(body.locale)) { failedQueries.add(body.locale); return route.fulfill({ status: 503, json: { error: "source_unavailable" } }); }
      return route.fulfill({ status: 200, json: body.operation === "search" ? syntheticBrandMatches(body.query, body.locale, body.query === "UnlistedSynthetic") : syntheticBrandProfile(body.entity_id, body.locale) });
    }
    if (url.pathname.startsWith("/api/")) { unexpectedApi++; return route.abort("blockedbyclient"); }
    return route.continue();
  });
  const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
  let clientReady = false;
  for (let attempt = 1; attempt <= 2; attempt++) { try { await page.goto(`${origin}/brand-index?lang=en`, { waitUntil: "domcontentloaded" }); await page.getByRole("heading", { name: brandLookupCopy.en.title, exact: true }).waitFor(); startup.push({ attempt, ready: true }); clientReady = true; break; } catch (error) { startup.push({ attempt, ready: false, message: error.message }); if (errors.length || attempt === 2) throw error; } }
  assert.ok(clientReady); phase = "product_assertions";
  const measure = async (state, width, language) => {
    const data = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, overflowing: [...document.querySelectorAll("main *")].filter(element => { const box = element.getBoundingClientRect(); return box.width > 0 && (box.left < -1 || box.right > innerWidth + 1); }).map(element => ({ tag: element.tagName, text: element.textContent?.slice(0, 80) })).slice(0, 8) }));
    measurements.push({ state, language, width, ...data }); assert.ok(data.scrollWidth <= width, `${state}/${language}/${width}: page overflow`); assert.deepEqual(data.overflowing, [], `${state}/${language}/${width}: clipped content`);
  };
  const screenshot = async name => { const file = resolve(output, name); await page.screenshot({ path: file }); screenshots.push(file); };
  for (const width of [320, 390, 1440]) for (const language of ["en", "sv", "es", "fr", "zh"]) {
    const c = brandLookupCopy[language]; failedQueries.delete(language);
    await page.setViewportSize({ width, height: 900 }); await page.goto(`${origin}/brand-index?lang=${language}`, { waitUntil: "domcontentloaded" }); await page.getByRole("heading", { name: c.title, exact: true }).waitFor();
    const initialCalls = calls.length;
    assert.equal(await page.locator("#brand-lookup-query").inputValue(), ""); assert.equal(await page.locator("main input").count(), 1); await page.getByText(c.disclosure, { exact: true }).waitFor();
    await measure("empty", width, language); if (width === 390 && ["en", "sv"].includes(language)) await screenshot(`brand-lookup-empty-${language}.png`);
    await page.getByRole("button", { name: c.search, exact: true }).click(); await page.getByRole("alert").waitFor(); assert.equal(calls.length, initialCalls);
    await page.locator("#brand-lookup-query").fill("ExampleBrand"); assert.equal(calls.length, initialCalls);
    await page.getByRole("button", { name: c.search, exact: true }).click(); await page.locator('[data-brand-match="Q905"]').waitFor();
    assert.equal(calls.length, initialCalls + 1); assert.equal(await page.locator("[data-brand-lookup-profile]").count(), 0); assert.equal(await page.locator("[data-brand-match]").count(), 5);
    assert.equal(await page.evaluate(() => document.activeElement?.id), "brand-lookup-results-title");
    assert.ok(await page.locator("#brand-lookup-results-title").evaluate(element => element.getBoundingClientRect().top >= 0 && (element.getBoundingClientRect().top <= 48 || scrollY + innerHeight >= document.documentElement.scrollHeight - 1)), "A completed search must align choices at the top or the maximum available scroll position");
    await measure("matches", width, language); if (width === 390 && ["en", "sv"].includes(language)) await screenshot(`brand-lookup-matches-${language}.png`);
    await page.locator('[data-brand-match="Q902"]').getByRole("button", { name: c.choose, exact: true }).click(); await page.locator('[data-brand-lookup-profile="Q902"]').waitFor();
    assert.equal(calls.length, initialCalls + 2); assert.deepEqual(calls.at(-1), { operation: "profile", entity_id: "Q902", locale: language });
    assert.equal(await page.locator("[data-brand-lookup-index]").getAttribute("data-brand-lookup-index"), "unavailable"); assert.equal(await page.locator("[data-brand-verified-count]").innerText(), "0"); assert.equal(await page.locator("[data-brand-listed-count]").innerText(), "2");
    assert.equal(await page.evaluate(() => document.activeElement?.id), "brand-lookup-profile-title");
    assert.ok(await page.locator("#brand-lookup-profile-title").evaluate(element => element.getBoundingClientRect().top >= 0 && (element.getBoundingClientRect().top <= 48 || scrollY + innerHeight >= document.documentElement.scrollHeight - 1)), "The chosen profile must align at the top or the maximum available scroll position");
    await page.getByText(c.sourceClaims, { exact: true }).waitFor(); assert.equal(await page.locator('time[datetime="2022-01-02T12:00:00.000Z"]').count(), 1);
    assert.ok(await page.locator("[data-brand-assertion]").first().evaluate(element => {
      const top = element.getBoundingClientRect().top, warning = document.querySelector("[data-brand-source-warning]").getBoundingClientRect().top;
      return top > warning && top < innerHeight && top < document.querySelector("[data-brand-lookup-index]").getBoundingClientRect().top;
    }), "Real source links must be visible before the unavailable index, under a clear non-verification label");
    await measure("profile", width, language); if (width === 390 && ["en", "sv"].includes(language)) await screenshot(`brand-lookup-profile-${language}.png`);
    await page.getByRole("button", { name: c.change, exact: true }).click(); await page.locator('[data-brand-match="Q902"]').waitFor(); assert.equal(calls.length, initialCalls + 2);
    await page.locator("#brand-lookup-query").fill("UnlistedSynthetic"); await page.getByRole("button", { name: c.search, exact: true }).click(); await page.getByRole("heading", { name: c.noMatches, exact: true }).waitFor();
    await page.getByText(c.noMatchesHelp, { exact: true }).waitFor(); await measure("no-matches", width, language);
    if (width === 390 && language === "sv") await screenshot("brand-lookup-no-matches-sv.png");
    await page.locator("#brand-lookup-query").fill("UnavailableSynthetic"); await page.getByRole("button", { name: c.search, exact: true }).click(); await page.getByRole("alert").filter({ hasText: c.unavailable }).waitFor();
    assert.equal(await page.getByRole("heading", { name: c.noMatches, exact: true }).count(), 0); await measure("unavailable", width, language);
    if (width === 390 && language === "sv") await screenshot("brand-lookup-unavailable-sv.png");
    await page.getByRole("button", { name: c.retry, exact: true }).click(); await page.locator('[data-brand-match="Q901"]').waitFor();
    assert.equal(new URL(page.url()).searchParams.get("query"), null); assert.equal(new URL(page.url()).search.includes("ExampleBrand"), false);
    assert.equal(await page.evaluate(() => window.__sajdaPackageFixture.searchCalls.length), 0); assert.equal(await page.evaluate(() => window.__sajdaPackageFixture.socialCalls.length), 0);
    layouts++;
  }
  assert.equal(external, 0); assert.equal(unexpectedApi, 0); assert.deepEqual(errors, []);
  const result = { event: "brand_lookup_browser_verified", syntheticSourceOnly: true, realWikidataTested: false, layouts, measurements, startup, expectedSyntheticPublicCalls: calls.length, blockedExternalRequests: external, unexpectedApiRequests: unexpectedApi, errors, screenshots };
  await writeFile(resolve(output, "result.json"), JSON.stringify(result, null, 2)); console.log(JSON.stringify({ ...result, measurements: measurements.length }));
} catch (error) {
  const failure = { event: phase === "harness_startup" ? "brand_lookup_harness_startup_failed" : "brand_lookup_browser_failed", phase, message: error.message, layouts, measurements, startup, errors, log };
  await writeFile(resolve(output, "failure.json"), JSON.stringify(failure, null, 2)); console.error(JSON.stringify(failure)); throw error;
} finally {
  await browser?.close();
  if (server.exitCode === null && server.signalCode === null) { const stopped = new Promise(done => server.once("exit", done)); server.kill(); await Promise.race([stopped, delay(5000)]); if (server.exitCode === null && server.signalCode === null) throw new Error(`Owned fixture process did not stop: ${server.pid}`); }
}
