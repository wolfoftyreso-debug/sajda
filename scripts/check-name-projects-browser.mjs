/** Browser QA of the loopback-only fixture. Never uses real accounts or providers. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const require = createRequire(process.env.SAJDA_PLAYWRIGHT_ROOT
  ? resolve(process.env.SAJDA_PLAYWRIGHT_ROOT, "__sajda_browser_qa.cjs") : import.meta.url);
const { chromium } = require("playwright");
const browser = await chromium.launch({ headless: true, channel: "msedge" });
const output = resolve("tmp/name-projects-browser");
await mkdir(output, { recursive: true });
let layouts = 0;
try {
  const context = await browser.newContext();
  await context.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const open = async (state = "ready", language = "en") => {
    await page.goto(`http://127.0.0.1:8190/name-projects-preview.html?state=${state}&lang=${language}`);
    await page.locator("#name-projects-title").waitFor();
    if (state !== "disabled" && state !== "empty") await page.locator("#project-title").waitFor();
  };
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const language of ["en", "sv", "es", "fr", "zh"]) {
      await open("ready", language);
      await page.locator("details summary").click();
      const dimensions = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
      assert.ok(dimensions.scroll <= dimensions.width, `Horizontal overflow at ${width}/${language}: ${dimensions.scroll}`);
      layouts++;
      if (width === 390 && language === "en") await page.screenshot({ path: resolve(output, "projects-mobile.png"), fullPage: true });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await open("empty");
  await page.getByRole("button", { name: "Create a name project", exact: true }).click();
  await page.locator("#project-title").fill("Browser-tested project");
  await page.locator("#project-description").fill("A helpful app for founders");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Project saved" }).waitFor();
  await page.getByRole("link", { name: "Find names for this project", exact: true }).click();
  await page.getByRole("heading", { name: "Fixture destination" }).waitFor();
  assert.equal(await page.evaluate(() => Boolean(history.state.usr?.nameProject?.title === "Browser-tested project" && history.state.usr?.nameProjectAccountId)), true);
  assert.equal(new URL(page.url()).search, "", "The brief never travels in query parameters");
  await open("save-error");
  await page.locator("#project-title").fill("Retry receipt");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await page.getByRole("button", { name: "Retry the same save", exact: true }).waitFor();
  assert.equal(await page.locator("#project-title").isDisabled(), true);
  await page.getByRole("button", { name: "Retry the same save", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Project saved" }).waitFor();
  assert.equal(await page.locator("#project-title").inputValue(), "Retry receipt");
  await open("disabled");
  await page.getByRole("alert").filter({ hasText: "Projects are not available" }).waitFor();
  assert.equal(await page.locator("#project-title").count(), 0);
  assert.deepEqual(errors, [], "No browser runtime exceptions");
  console.log(JSON.stringify({ event: "project_browser_fixture_verified", layouts, createSaveAndSearchHandoff: true, uncertainRetry: true, disabledState: true, runtimeErrors: errors.length, realAccounts: false, realProviders: false, screenshot: resolve(output, "projects-mobile.png") }));
} finally { await browser.close(); }
