/** Real browser QA of the pure local Brand Index. Synthetic declarations only.
 * node --import tsx scripts/check-brand-index-browser.mjs
 * SAJDA_PLAYWRIGHT_ROOT points to a folder containing Playwright's node_modules.
 * The script owns its loopback fixture; no account, provider, API or database use.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { connect } from "node:net";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { brandIndexCopy } from "../src/i18n/brandIndexCopy.ts";
import { SOCIAL_PLATFORMS } from "../shared/name-packages.ts";

const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(process.env.SAJDA_PLAYWRIGHT_ROOT ? resolve(process.env.SAJDA_PLAYWRIGHT_ROOT, "__sajda_brand_browser_qa.cjs") : import.meta.url);
const { chromium } = require("playwright");
const origin = "http://127.0.0.1:8191", output = resolve(project, "tmp/brand-index-browser");
await mkdir(output, { recursive: true });
const portIsFree = await new Promise(done => {
  const socket = connect({ host: "127.0.0.1", port: 8191 });
  socket.once("connect", () => { socket.destroy(); done(false); });
  socket.once("error", error => { socket.destroy(); done(error.code === "ECONNREFUSED"); });
  socket.setTimeout(1000, () => { socket.destroy(); done(false); });
});
assert.ok(portIsFree, "Harness startup blocked: fixture port8191 is already owned or cannot be safely checked.");
const server = spawn(process.execPath, [resolve(project, "node_modules/vite/bin/vite.js"), "--config", "tests/fixtures/name-packages.vite.ts"],
  { cwd: project, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, NO_COLOR: "1" } });
let serverLog = "", browser, phase = "harness_startup", combinations = 0;
let blockedExternalRequests = 0, blockedApiRequests = 0, privacyLeaks = 0;
const errors = [], measurements = [], screenshots = [], flowResults = [], startupAttempts = [];
const log = data => { serverLog = (serverLog + data.toString()).slice(-32_000); };
server.stdout.on("data", log); server.stderr.on("data", log);
try {
  let ready = false;
  const startupDeadline = Date.now() + 90_000;
  for (let attempt = 0; attempt < 90 && Date.now() < startupDeadline; attempt++) {
    if (server.exitCode !== null) throw new Error(`Fixture exited before startup: ${serverLog}`);
    try {
      const response = await fetch(`${origin}/brand-index/assessment`, { redirect: "error", signal: AbortSignal.timeout(1000) });
      if (response.ok && (await response.text()).includes("LOCAL UI FIXTURE — Sajda Name packages")) { ready = true; break; }
    } catch { /* Bounded startup readiness only; no product assertion retries. */ }
    await delay(200);
  }
  assert.ok(ready, `Harness startup timeout: ${serverLog}`);
  browser = await chromium.launch({ headless: true, channel: process.env.SAJDA_QA_BROWSER_CHANNEL || "msedge" });
  const context = await browser.newContext({ locale: "en-US", viewport: { width: 390, height: 900 } });
  context.setDefaultTimeout(15_000); context.setDefaultNavigationTimeout(30_000);
  await context.route("**/*", route => {
    const request = route.request(), url = new URL(request.url());
    if (request.url().includes("ExampleBrand") || request.url().includes("examplebrand.com") || request.postData()?.includes("ExampleBrand")) privacyLeaks++;
    if (url.origin !== origin) { blockedExternalRequests++; return route.abort("blockedbyclient"); }
    if (url.pathname.startsWith("/api/")) { blockedApiRequests++; return route.abort("blockedbyclient"); }
    return route.continue();
  });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  let clientReady = false;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await page.goto(`${origin}/brand-index/assessment?lang=en`, { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: brandIndexCopy.en.title, exact: true }).waitFor();
      startupAttempts.push({ attempt, ready: true }); clientReady = true; break;
    } catch (error) {
      startupAttempts.push({ attempt, ready: false, message: error.message });
      if (errors.length || attempt === 2) throw error;
    }
  }
  assert.ok(clientReady, "Client did not become ready within bounded startup attempts.");
  phase = "product_assertions";
  const measure = async (state, width, language) => {
    const dimensions = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
      overflowing: [...document.querySelectorAll("main *")].filter(element => {
        const box = element.getBoundingClientRect(); return box.width > 0 && (box.right > innerWidth + 1 || box.left < -1);
      }).map(element => ({ tag: element.tagName, text: element.textContent?.slice(0, 100) })).slice(0, 10) }));
    measurements.push({ state, width, language, ...dimensions });
    assert.ok(dimensions.scrollWidth <= dimensions.width, `Page overflow ${state}/${width}/${language}: ${JSON.stringify(dimensions)}`);
    assert.deepEqual(dimensions.overflowing, [], `Clipped content ${state}/${width}/${language}: ${JSON.stringify(dimensions)}`);
  };
  const screenshot = async name => { const file = resolve(output, name); await page.screenshot({ path: file }); screenshots.push(file); };
  const target = id => page.locator(`[data-brand-target="${id}"]`);
  const expand = async details => { if (!await details.evaluate(element => element.open)) await details.locator(":scope > summary").click(); };
  const record = async (id, status, language, source) => {
    const row = target(id);
    const group = row.locator("xpath=ancestor::details[not(@data-brand-target)][1]");
    await expand(group); await expand(row);
    await row.locator("select[data-brand-status]").selectOption(status);
    if (source !== undefined) await row.locator("input[data-brand-source]").fill(source);
    await row.getByRole("button", { name: brandIndexCopy[language].record, exact: true }).click();
    await row.getByRole("status").filter({ hasText: brandIndexCopy[language].saved }).waitFor();
    assert.equal(await row.getByRole("button", { name: brandIndexCopy[language].record, exact: true }).evaluate(element => element === document.activeElement), true, "Recording a report must retain focus, not jump to the result heading");
  };
  const score = () => page.locator("[data-brand-reported-score]").getAttribute("data-brand-reported-score");
  const assertUnverified = async () => assert.equal(await page.locator("[data-brand-verified-score]").getAttribute("data-brand-verified-score"), "unavailable");

  for (const width of [320, 390, 1440]) for (const language of ["en", "sv", "es", "fr", "zh"]) {
    const c = brandIndexCopy[language];
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${origin}/brand-index/assessment?lang=${language}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: c.title, exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.tagName), "BODY", "Opening the worksheet must not autofocus a field");
    assert.equal(await page.locator("#brand-index-name").inputValue(), "");
    assert.equal(await page.locator("[data-brand-index-result]").count(), 0);
    await measure("empty", width, language);
    if (width === 390 && ["en", "sv"].includes(language)) await screenshot(`brand-index-empty-${language}.png`);

    await page.getByRole("button", { name: c.build, exact: true }).click();
    await page.getByRole("alert").filter({ hasText: c.invalid }).waitFor();
    await page.locator("#brand-index-name").fill("ExampleBrand");
    await page.locator("#brand-index-identity").fill("examplebrand");
    await page.locator("#brand-index-primary").fill("examplebrand.com");
    await page.locator("#package-markets > details > summary").click();
    await measure("scope-expanded", width, language);
    await page.locator("#package-markets > details > summary").click();
    assert.equal((await page.locator("[data-selected-markets]").getAttribute("data-selected-markets")).split(",").length, 28);
    await page.locator('[data-market-preset="us"]').click();
    for (const platform of SOCIAL_PLATFORMS.filter(value => value !== "github")) await page.locator(`[data-brand-platform="${platform}"]`).uncheck();
    await page.getByRole("button", { name: c.build, exact: true }).click();
    await page.locator("[data-brand-index-result]").waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.id), "brand-index-result-title", "A newly built worksheet must announce its result heading");
    assert.equal(await score(), "unavailable"); await assertUnverified();
    assert.equal(await page.locator("[data-brand-target]").count(), 3);
    assert.equal(await page.locator("time").count(), 0);
    assert.equal(new URL(page.url()).searchParams.has("brand_name"), false);
    await measure("results-unassessed", width, language);
    await page.locator("#brand-index-result-title").scrollIntoViewIfNeeded();
    if (width === 390 && ["en", "sv"].includes(language)) await screenshot(`brand-index-unassessed-${language}.png`);

    await record("domain:examplebrand.com", "matching_name_only", language);
    assert.equal(await score(), "unavailable", "A matching domain is not ownership evidence");
    await assertUnverified();
    await record("domain:examplebrand.com", "reported_owned", language, "https://example.com/evidence");
    const timestamp = await target("domain:examplebrand.com").locator("time").getAttribute("datetime");
    await target("domain:examplebrand.com").locator("input[data-brand-source]").fill("https://example.com/changed-source");
    assert.equal(await target("domain:examplebrand.com").locator("time").getAttribute("datetime"), timestamp, "Editing a source URL does not verify or freshen a report");
    await measure("report-expanded", width, language);
    if (width === 390 && ["en", "sv"].includes(language)) {
      const file = resolve(output, `brand-index-report-${language}.png`);
      await target("domain:examplebrand.com").screenshot({ path: file }); screenshots.push(file);
    }
    await record("social:github:examplebrand", "reported_owned", language);
    assert.equal(await score(), "unavailable", "A current report in every category is required");
    await record("market:US", "reported_authorized", language);
    assert.equal(await score(), "100"); await assertUnverified();
    await page.getByText(c.warning, { exact: true }).waitFor();
    await page.locator("#brand-index-result-title").scrollIntoViewIfNeeded();
    await measure("self-reported-ready", width, language);
    if (width === 390 && ["en", "sv"].includes(language)) await screenshot(`brand-index-reported-${language}.png`);

    await page.getByRole("button", { name: c.edit, exact: true }).click();
    await page.getByRole("alert").filter({ hasText: c.resetWarning }).waitFor();
    await page.getByRole("button", { name: c.cancel, exact: true }).click();
    assert.equal(await score(), "100", "Cancel preserves reports and fixed scope");
    await page.getByRole("button", { name: c.edit, exact: true }).click();
    await page.getByRole("button", { name: c.reset, exact: true }).click();
    await page.locator("#brand-index-name").waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.id), "brand-index-name", "A confirmed reset must return focus to the brand-name field");
    assert.equal(await page.locator("#brand-index-name").inputValue(), "ExampleBrand");
    assert.equal(await page.locator("time").count(), 0);
    await page.getByRole("button", { name: c.build, exact: true }).click();
    await page.locator("[data-brand-index-result]").waitFor();
    assert.equal(await score(), "unavailable", "Changing scope cannot retain previous self-reports");
    await assertUnverified();
    assert.equal(await page.evaluate(() => window.__sajdaPackageFixture.searchCalls.length), 0);
    assert.equal(await page.evaluate(() => window.__sajdaPackageFixture.socialCalls.length), 0);
    combinations++; flowResults.push({ width, language, matchingNameNotProof: true, unknownIndexNull: true, selfReported100VerifiedNull: true, resetClearsReports: true, sourceEditPreservesTimestamp: true, transitionFocus: true, recordingPreservesFocus: true });
  }
  assert.deepEqual(errors, [], "No runtime exceptions");
  assert.equal(blockedExternalRequests, 0, "The worksheet must not even attempt external calls");
  assert.equal(blockedApiRequests, 0, "The worksheet must not attempt product API calls");
  assert.equal(privacyLeaks, 0, "Worksheet content must not appear in requests");
  const result = { event: "brand_index_browser_verified", syntheticDeclarationsOnly: true, independentOwnershipVerified: false,
    combinations, layoutMeasurements: measurements.length, startupAttempts, blockedExternalRequests, blockedApiRequests, privacyLeaks,
    runtimeErrors: errors, screenshots, flows: flowResults, measurements };
  await writeFile(resolve(output, "result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ ...result, measurements: undefined, flows: undefined }));
} catch (error) {
  const failure = { event: phase === "harness_startup" ? "brand_index_browser_harness_startup_failed" : "brand_index_browser_failed",
    phase, message: error.message, combinations, startupAttempts, errors, blockedExternalRequests, blockedApiRequests, privacyLeaks, measurements, serverLog };
  await writeFile(resolve(output, "failure.json"), JSON.stringify(failure, null, 2));
  console.error(JSON.stringify(failure)); throw error;
} finally {
  await browser?.close();
  // Only this exact child, whose port was free before spawn. Never terminate other Vite instances.
  if (server.exitCode === null && server.signalCode === null) {
    const stopped = new Promise(done => server.once("exit", done));
    server.kill(); await Promise.race([stopped, delay(5000)]);
    if (server.exitCode === null && server.signalCode === null) throw new Error(`Owned fixture process did not stop: PID ${server.pid}`);
  }
}
