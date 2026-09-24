/**
 * Real browser / synthetic-provider QA. Runs its own loopback-only Vite fixture.
 * Run: node --import tsx scripts/check-name-packages-browser.mjs
 * Set SAJDA_PLAYWRIGHT_ROOT to the folder containing Playwright's node_modules.
 * No production accounts, APIs, GitHub lookups, database, AI or provider requests.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { connect } from "node:net";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { namePackagesCopy } from "../src/i18n/namePackagesCopy.ts";
import { brandWorkspaceCopy } from "../src/i18n/brandWorkspaceCopy.ts";
import { namePackageResultCopy } from "../src/i18n/namePackageResultCopy.ts";
import { NAME_PACKAGE_MARKET_CODES } from "../shared/name-package-markets.ts";

const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(process.env.SAJDA_PLAYWRIGHT_ROOT
  ? resolve(process.env.SAJDA_PLAYWRIGHT_ROOT, "__sajda_package_browser_qa.cjs") : import.meta.url);
const { chromium } = require("playwright");
const origin = "http://127.0.0.1:8191", output = resolve(project, "tmp/name-packages-browser");
await mkdir(output, { recursive: true });
// Never drive or terminate another process that already owns the fixture port.
const portIsFree = await new Promise(resolve => {
  const socket = connect({ host: "127.0.0.1", port: 8191 });
  socket.once("connect", () => { socket.destroy(); resolve(false); });
  socket.once("error", error => { socket.destroy(); resolve(error.code === "ECONNREFUSED"); });
  socket.setTimeout(1000, () => { socket.destroy(); resolve(false); });
});
assert.ok(portIsFree, "Fixture port8191 is already occupied or cannot be safely verified.");
const server = spawn(process.execPath, [resolve(project, "node_modules/vite/bin/vite.js"), "--config", "tests/fixtures/name-packages.vite.ts"],
  { cwd: project, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, NO_COLOR: "1" } });
let serverLog = "", browser;
server.stdout.on("data", data => { serverLog += data.toString(); });
server.stderr.on("data", data => { serverLog += data.toString(); });
let layouts = 0, blockedExternalRequests = 0;
const measurements = [], screenshots = [], errors = [];
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(`Fixture server stopped: ${serverLog}`);
    try {
      const response = await fetch(`${origin}/name-packages-preview.html`, { redirect: "error", signal: AbortSignal.timeout(1000) });
      if (response.ok && (await response.text()).includes("LOCAL UI FIXTURE — Sajda Name packages")) { ready = true; break; }
    } catch { /* Starting loopback server. */ }
    await delay(200);
  }
  assert.ok(ready, `Fixture did not start: ${serverLog}`);
  browser = await chromium.launch({ headless: true, channel: process.env.SAJDA_QA_BROWSER_CHANNEL || "msedge" });
  const context = await browser.newContext({ acceptDownloads: true, locale: "en-US" });
  await context.route("**/*", route => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    blockedExternalRequests++; return route.abort("blockedbyclient");
  });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  const open = async (state = "ready", language = "en") => {
    await page.goto(`${origin}/name-packages-preview.html?state=${state}&lang=${language}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.getByRole("heading", { name: brandWorkspaceCopy[language].title, exact: true }).waitFor();
    if (!["empty", "search-error"].includes(state)) await page.locator("#package-results-title").waitFor();
  };
  const measure = async (label, width, language) => {
    const dimensions = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth,
      body: document.body.scrollWidth, overflowing: [...document.querySelectorAll("main *")].filter(element => {
        const box = element.getBoundingClientRect(); return box.width > 0 && (box.right > innerWidth + 1 || box.left < -1);
      }).map(element => ({ tag: element.tagName, text: element.textContent?.slice(0, 80) })).slice(0, 6) }));
    measurements.push({ label, width, language, ...dimensions });
    assert.ok(dimensions.scroll <= dimensions.width, `Horizontal page overflow ${label}/${width}/${language}: ${JSON.stringify(dimensions)}`);
    assert.ok(dimensions.overflowing.length === 0, `Clipped child content ${label}/${width}/${language}: ${JSON.stringify(dimensions)}`);
  };
  const screenshot = async (name, fullPage = false) => {
    const path = resolve(output, name); await page.screenshot({ path, fullPage }); screenshots.push(path);
  };
  const article = name => page.getByRole("article", { name, exact: true });
  const configure = async language => {
    if (!await page.locator("#package-theme").count()) await page.getByRole("button", { name: namePackagesCopy[language].editSearch, exact:true }).click();
    const summary=page.locator("#package-search-form summary").filter({hasText:brandWorkspaceCopy[language].configure}).first();
    if (!await summary.evaluate(element=>element.parentElement.open)) await summary.click();
  };
  const expand = async (name, language) => {
    const summary = article(name).locator("summary").filter({ hasText: namePackagesCopy[language].details }).first();
    if (!await summary.evaluate(element => element.parentElement.open)) await summary.click();
  };
  const github = language => page.getByRole("button", { name: namePackagesCopy[language].github, exact: true });

  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const language of ["en", "sv", "es", "fr", "zh"]) {
      await open("ready", language);
      assert.equal(await page.evaluate(() => scrollY), 0, "Opening existing results must not force-scroll the page");
      await measure("collapsed", width, language);
      await configure(language);
      assert.equal(await page.locator("[data-market-coverage]").getAttribute("data-requested-markets"), "28");
      assert.equal(await page.locator("[data-market-coverage]").getAttribute("data-checked-markets"), "0");
      await page.locator('[data-market-preset="all"]').click();
      assert.equal(await page.locator("[data-market-coverage]").getAttribute("data-requested-markets"), String(NAME_PACKAGE_MARKET_CODES.length));
      assert.equal(await page.evaluate(() => window.__sajdaPackageFixture.searchCalls.length), 0, "A market preset must not submit a domain search");
      assert.equal(await page.evaluate(() => window.__sajdaPackageFixture.socialCalls.length), 0, "Market selection must not query social profiles");
      await page.locator("#package-markets summary").click();
      await measure("markets-expanded", width, language);
      await page.locator("#package-markets summary").click();
      await page.locator("#package-market-review > details > summary").click();
      await page.locator('[data-market-review="US"] > summary').click();
      await page.locator('[data-market-review="JP"] > summary').click();
      await measure("country-review-expanded", width, language);
      if (width === 390 && language === "en") {
        await page.locator('[data-market-review="US"]').scrollIntoViewIfNeeded();
        await screenshot("market-review-mobile-en.png");
      }
      await page.locator("#package-market-review > details > summary").click();
      await page.locator('[data-market-preset="us-eu"]').click();
      await expand("nordform", language);
      await article("nordform").getByText(namePackagesCopy[language].manual, { exact: true }).first().waitFor();
      await measure("expanded", width, language);
      await github(language).click();
      await page.getByRole("status").filter({ hasText: namePackagesCopy[language].githubDone }).waitFor();
      await article("nordform").getByText(namePackagesCopy[language].profileFound, { exact: true }).waitFor();
      await expand("alviona", language);
      await article("alviona").getByText(namePackagesCopy[language].notFound, { exact: true }).waitFor();
      await measure("checked", width, language);
      layouts++;
      if (width === 390 && ["en", "sv"].includes(language)) {
        await page.locator("#package-results-title").scrollIntoViewIfNeeded();
        await screenshot(`packages-mobile-${language}.png`);
        const path = resolve(output, `package-detail-mobile-${language}.png`);
        await article("nordform").screenshot({ path }); screenshots.push(path);
        await article("alviona").locator("summary").filter({ hasText: namePackagesCopy[language].details }).first().click();
        const summaryPath = resolve(output, `package-summary-mobile-${language}.png`);
        await article("alviona").screenshot({ path: summaryPath }); screenshots.push(summaryPath);
      }
    }
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await open("empty", "en");
  await screenshot("packages-mobile-empty-en.png");
  await page.getByRole("heading", { name: namePackagesCopy.en.empty, exact: true }).waitFor();
  await page.getByRole("button", { name: namePackagesCopy.en.find, exact: true }).click();
  await page.getByRole("alert").filter({ hasText: namePackagesCopy.en.invalid }).waitFor();
  const privateBrief = "PRIVATE_FIXTURE_BRIEF_7f829 do not export or put in URLs";
  await page.locator("#package-theme").fill("A calm founder planning app");
  await page.locator("#package-brief").fill(privateBrief);
  await configure("en");
  await page.locator('[data-market-preset="us"]').click();
  await page.getByRole("button", { name: namePackagesCopy.en.find, exact: true }).click();
  await page.locator("#package-results-title").waitFor();
  await page.waitForFunction(() => document.activeElement?.id === "package-results-title");
  assert.equal(await page.getByRole("article").count(), 3);
  assert.equal(await page.evaluate(() => window.__sajdaPackageFixture.searchCalls.length), 1);
  assert.equal(await page.evaluate(() => window.__sajdaPackageFixture.searchCalls[0].brief), privateBrief);
  assert.equal(new URL(page.url()).search.includes("founder"), false);
  await github("en").click();
  await page.getByRole("status").filter({ hasText: namePackagesCopy.en.githubDone }).waitFor();
  const calls = await page.evaluate(() => window.__sajdaPackageFixture.socialCalls);
  assert.equal(calls.length, 1);
  assert.deepEqual(Object.keys(calls[0]), ["handles"]);
  assert.equal(JSON.stringify(calls).includes(privateBrief), false);
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: namePackagesCopy.en.download, exact: true }).click();
  const download = await downloadEvent;
  assert.match(download.suggestedFilename(), /^sajda-name-packages-\d{4}-\d{2}-\d{2}\.html$/u);
  const reportPath = resolve(output, "synthetic-package-report.html");
  await download.saveAs(reportPath);
  const report = await readFile(reportPath, "utf8");
  assert.ok(report.includes(namePackagesCopy.en.profileFound) && report.includes(namePackagesCopy.en.notFound));
  assert.ok(report.includes(namePackagesCopy.en.manual) && report.includes("70/100"));
  assert.ok(report.includes("USPTO") && report.includes("state registration"), "Export includes selected US official review paths");
  assert.ok(!report.includes("EUIPO") && !report.includes("Bolagsverket"), "Unselected countries must not leak into the exported review plan");
  assert.ok(!report.includes(privateBrief) && !report.includes("local-name-package-fixture"));
  assert.ok(!/<script|<iframe|<img|<link/iu.test(report), "Export has no scripts or external resources");
  await expand("alviona", "en");
  const hrefs = await article("alviona").locator("a[href]").evaluateAll(links => links.map(link => ({ href: link.href, rel: link.rel, target: link.target })));
  assert.ok(hrefs.some(link => link.href === "https://github.com/alviona"));
  assert.ok(hrefs.some(link => link.href.endsWith("#package-market-review")));
  const marketLinks = await page.locator('#package-market-review a[href^="https:"]').evaluateAll(links => links.map(link => ({ href: link.href, rel: link.rel, target: link.target })));
  assert.ok(marketLinks.some(link => link.href.startsWith("https://www.uspto.gov/")));
  assert.ok(marketLinks.some(link => link.href.startsWith("https://www.sba.gov/")));
  for (const link of [...hrefs.filter(link => !link.href.startsWith(origin)), ...marketLinks]) {
    assert.ok(link.href.startsWith("https://")); assert.equal(link.target, "_blank"); assert.match(link.rel, /noopener/u); assert.match(link.rel, /noreferrer/u);
  }
  assert.ok(marketLinks.every(link => !link.href.includes("alviona")), "Legal-source links do not transmit candidate names");
  const editSearch = page.getByRole("button", { name: namePackagesCopy.en.editSearch, exact: true });
  await editSearch.waitFor();
  assert.equal(await page.locator("#package-theme").count(), 0, "Successful search collapses the form instead of burying results");
  await editSearch.click();
  await configure("en");
  assert.equal(await page.locator("#package-theme").inputValue(), "A calm founder planning app");
  assert.equal(await page.locator("#package-brief").inputValue(), privateBrief);
  await page.getByRole("checkbox", { name: "X", exact: true }).uncheck();
  await page.getByRole("button", { name: namePackagesCopy.en.find, exact: true }).click();
  await page.locator("#package-results-title").waitFor();
  assert.equal(await page.locator("#package-theme").count(), 0);
  assert.equal(await page.evaluate(() => window.__sajdaPackageFixture.searchCalls.length), 2);
  await expand("alviona", "en");
  assert.equal(await article("alviona").locator("strong").filter({ hasText: /^X$/u }).count(), 0);

  await open("ready", "en");
  await article("nordform").getByRole("button", {name:brandWorkspaceCopy.en.compare,exact:true}).click();
  await article("alviona").getByRole("button", {name:brandWorkspaceCopy.en.compare,exact:true}).click();
  assert.equal(await page.locator("[data-package-comparison] [data-candidate-brand-index]").count(),2);
  await measure("comparison",390,"en");
  await page.getByRole("button",{name:brandWorkspaceCopy.en.clear,exact:true}).click();
  await article("nordform").getByRole("button",{name:brandWorkspaceCopy.en.check,exact:true}).click();
  await page.getByRole("status").filter({hasText:brandWorkspaceCopy.en.checked}).waitFor();
  assert.equal(await page.getByRole("article").count(),3,"Exact checks retain unrelated packages");
  await article("nordform").getByText(brandWorkspaceCopy.en.conflicts,{exact:true}).waitFor();
  assert.deepEqual(await page.evaluate(()=>window.__sajdaPackageFixture.exactCalls[0]),["nordform.com","nordform.se"]);
  await open("exact-error","en");
  await article("nordform").getByRole("button",{name:brandWorkspaceCopy.en.check,exact:true}).click();
  await page.getByRole("alert").filter({hasText:brandWorkspaceCopy.en.checkFailed}).waitFor();
  assert.equal(await page.getByRole("article").count(),3);
  await article("nordform").getByRole("button",{name:brandWorkspaceCopy.en.check,exact:true}).click();
  await page.getByRole("status").filter({hasText:brandWorkspaceCopy.en.checked}).waitFor();
  await open("empty","en");
  await page.getByRole("button",{name:brandWorkspaceCopy.en.exact,exact:true}).first().click();
  await page.locator("#package-theme").fill("a long business description");
  await page.locator('button[type="submit"]').click();
  await page.getByRole("alert").filter({hasText:brandWorkspaceCopy.en.exactInvalid}).waitFor();
  await page.locator("#package-theme").fill("nordform.com");
  await page.locator('button[type="submit"]').click();
  await page.locator("#package-results-title").waitFor();
  assert.deepEqual(await page.evaluate(()=>window.__sajdaPackageFixture.searchCalls[0].domains),["nordform.com","nordform.ai"]);
  await open("github-error", "en");
  await github("en").click();
  await page.getByRole("alert").filter({ hasText: namePackagesCopy.en.githubError }).waitFor();
  assert.equal(await page.getByRole("article").count(), 3);
  await github("en").click();
  await page.getByRole("status").filter({ hasText: namePackagesCopy.en.githubDone }).waitFor();

  await open("search-error", "en");
  await page.locator("#package-theme").fill("A useful founder app");
  await page.getByRole("button", { name: namePackagesCopy.en.find, exact: true }).click();
  await page.getByRole("alert").filter({ hasText: namePackageResultCopy.en.failedEmpty }).waitFor();
  assert.equal(await page.locator("#package-theme").inputValue(), "A useful founder app");
  assert.equal(await page.getByRole("button", { name: namePackagesCopy.en.find, exact: true }).isEnabled(), true);

  for (const [state, expected] of [["restored", namePackagesCopy.en.unknown], ["stale", namePackagesCopy.en.stale]]) {
    await open(state, "en"); await expand("alviona", "en");
    await article("alviona").getByText(expected, { exact: true }).first().waitFor();
    assert.equal(await article("alviona").getByText(namePackagesCopy.en.available, { exact: true }).count(), 0);
  }
  await open("partial", "en"); await expand("alviona", "en");
  await article("alviona").getByText("alviona.se", { exact: true }).waitFor();
  await article("alviona").getByText(namePackagesCopy.en.selectedUnverified, { exact: true }).waitFor();
  const partialSummary = namePackagesCopy.en.domainSummary.replace("{available}", "1").replace("{total}", "2");
  await article("alviona").getByText(partialSummary, { exact: true }).waitFor();
  for (const language of ["en", "sv"]) {
    await open("clarity", language);
    const summary = page.locator("[data-package-result-summary]");
    await summary.scrollIntoViewIfNeeded();
    assert.equal(await page.getByRole("article").count(), 6);
    const text = await summary.innerText();
    assert.match(text, language === "en" ? /6 of 10 candidate name packages/u : /6 av 10 namnförslag/u);
    assert.match(text, language === "en" ? /available domain: 4 of 6/u : /4 av 6 paket/u);
    assert.match(text, language === "en" ? /No confirmed available domain: 1/u : /1 paket saknar bekräftat ledig domän/u);
    await measure("result-clarity", 390, language);
    await screenshot(`result-clarity-mobile-${language}.png`);
    await summary.getByRole("button", { name: namePackageResultCopy[language].adjust, exact: true }).click();
    await page.locator("#package-theme").waitFor();
    assert.equal(await page.evaluate(() => window.__sajdaPackageFixture.searchCalls.length), 0, "Recovery only opens the editor");
  }
  await open("guest", "en");
  assert.equal(await github("en").count(), 0);
  const signIn = page.getByRole("link", { name: namePackagesCopy.en.signIn, exact: true });
  assert.equal(await signIn.getAttribute("href"), "/auth?next=%2Fname-packages");
  await signIn.click(); await page.getByRole("heading", { name: "Fixture destination", exact: true }).waitFor();

  assert.deepEqual(errors, [], "No browser runtime exceptions");
  const result = { event: "name_package_browser_fixture_verified", layouts, layoutMeasurements: measurements.length,
    emptySearchToPackage: true, validation: true, exactNameMode: true, comparison: true, perPackageRecheckRetainsBoard: true, exactFailureRetry: true, syntheticProfileFoundAnd404: true, reportExport: true,
    safeExternalLinks: true, resultsFocusAfterSearch: true, noForcedScrollOnVisit: true, editSearchPreservesBrief: true, editedChannelSearch: true, providerFailureAndRetry: true, searchFailureRecovery: true, guestSignInRoute: true,
    staleAndRestoredEvidence: true, missingRequestedExtensionUnverified: true, partialResultExplanation: true, runtimeErrors: errors.length, blockedExternalRequests,
    selectableMarkets: NAME_PACKAGE_MARKET_CODES.length, marketSelectionWithoutProviderCalls: true, marketScopedExport: true, legalMarketsChecked: 0,
    realAccounts: false, realProviders: false, realDatabase: false, screenshots, report: reportPath, measurements };
  await writeFile(resolve(output, "result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(JSON.stringify({ event: "name_package_browser_fixture_failed", message: error.message, layouts, errors, serverLog }));
  throw error;
} finally {
  await browser?.close();
  if (server.exitCode === null) { server.kill(); await Promise.race([new Promise(resolve => server.once("exit", resolve)), delay(5000)]); }
}
