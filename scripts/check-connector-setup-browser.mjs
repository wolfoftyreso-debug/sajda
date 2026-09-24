/** Read-only responsive interaction check against an already running isolated fixture.
 * SAJDA_PLAYWRIGHT_ROOT=<bundled runtime> node --import tsx scripts/check-connector-setup-browser.mjs
 * Never starts/stops a server or follows external install links. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { connectorCopy } from "../src/i18n/connectorCopy.ts";
import { connectorDirectoryCopy, connectorInstructions } from "../src/i18n/connectorDirectoryCopy.ts";
import { CONNECTOR_HOSTS, connectorConfig, connectorInstallUrl } from "../src/lib/connectorSetup.ts";
import { CONNECTOR_HOST_INSTRUCTIONS, getConnectorOffer } from "../shared/connector-policy.ts";

const require = createRequire(process.env.SAJDA_PLAYWRIGHT_ROOT ? resolve(process.env.SAJDA_PLAYWRIGHT_ROOT, "connector-probe.cjs") : import.meta.url);
const { chromium } = require("playwright");
const origin = "http://127.0.0.1:8195";
const endpoint = "https://sajda-connector.vercel.app/api/mcp/public";
const output = resolve("tmp/connector-qa");
const languages = ["en", "sv", "es", "fr", "zh"];
const widths = [320, 390, 768, 1440];
assert.equal(CONNECTOR_HOSTS.length, 13, "The reviewed directory must expose all 13 supported setup paths");
await mkdir(output, { recursive: true });
const probe = await fetch(origin, { signal: AbortSignal.timeout(5000) });
assert.ok(probe.ok && (await probe.text()).includes("LOCAL UI FIXTURE — Sajda Responsive"), "Expected existing isolated fixture, not a live service");
const browser = await chromium.launch({ headless: true, channel: "msedge" });
const context = await browser.newContext({ locale: "en-US", reducedMotion: "reduce", permissions: ["clipboard-read", "clipboard-write"] });
const blocked = [], errors = [], measurements = [], logos = [], configurations = [], screenshots = [], failures = [];
await context.route("**/*", route => {
  const request = route.request(), url = new URL(request.url());
  if (url.origin !== origin || url.pathname.startsWith("/api/") || request.method() !== "GET") {
    blocked.push({ origin: url.origin, path: url.pathname, method: request.method() });
    return route.abort("blockedbyclient");
  }
  return route.continue();
});
const page = await context.newPage();
page.on("pageerror", error => errors.push({ url: page.url(), message: error.message }));
page.on("console", message => { if (message.type() === "error") errors.push({ url: page.url(), message: message.text() }); });
page.setDefaultTimeout(15000);
const measure = async (language, width, state) => {
  const data = await page.locator("#ai-assistants").evaluate(section => {
    const viewport = innerWidth;
    const visible = [...section.querySelectorAll("h2,h3,p,a,button,label,input,code,blockquote,li,span,img")].filter(el => {
      const r = el.getBoundingClientRect(), style = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && style.visibility !== "hidden" && !el.classList.contains("sr-only");
    });
    const describe = el => ({ tag: el.tagName, text: el.textContent?.slice(0, 100), width: el.getBoundingClientRect().width, right: el.getBoundingClientRect().right });
    return {
      viewport, pageWidth: document.documentElement.scrollWidth,
      outside: visible.filter(el => { const r = el.getBoundingClientRect(); return r.left < -1 || r.right > viewport + 1; }).map(describe),
      tightText: visible.filter(el => !el.children.length && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1 && !["INPUT"].includes(el.tagName)).map(describe),
      overlay: !!document.querySelector("vite-error-overlay,[data-nextjs-dialog],#webpack-dev-server-client-overlay"),
    };
  });
  measurements.push({ language, width, state, ...data });
  assert.equal(data.overlay, false, `${language}/${width}/${state}: error overlay`);
  assert.ok(data.pageWidth <= width, `${language}/${width}/${state}: page overflow ${data.pageWidth}`);
  assert.deepEqual(data.outside, [], `${language}/${width}/${state}: outside viewport`);
  assert.deepEqual(data.tightText, [], `${language}/${width}/${state}: text overflow`);
};
try {
  for (const language of languages) for (const width of widths) {
    const c = connectorCopy[language], directory = connectorDirectoryCopy[language];
    try {
      await page.setViewportSize({ width, height: width < 768 ? 900 : 1000 });
      await page.goto(`${origin}/developers?lang=${language}`, { waitUntil: "domcontentloaded" });
      await page.locator(`[data-responsive-fixture-language="${language}"] #ai-assistants`).waitFor();
      await page.evaluate(() => document.fonts.ready);
      const section = page.locator("#ai-assistants");
      assert.equal(await section.locator("h2").innerText(), c.title);
      assert.equal(await section.getByRole("checkbox").isChecked(), false);
      assert.equal(await section.getByRole("button", { name: c.copyInstructions, exact: true }).count(), 0);
      assert.equal(await section.locator("fieldset button").count(), CONNECTOR_HOSTS.length);
      await section.locator("fieldset img").evaluateAll(images => Promise.all(images.map(image => image.decode())));
      const loadedLogos = await section.locator("fieldset img").evaluateAll(images => images.map(image => ({
        src: image.getAttribute("src"), naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight,
        width: image.getBoundingClientRect().width, height: image.getBoundingClientRect().height,
      })));
      assert.deepEqual(loadedLogos.map(image => image.src).sort(), CONNECTOR_HOSTS.map(host => host.logo).sort());
      assert.ok(loadedLogos.every(image => image.naturalWidth > 0 && image.naturalHeight > 0 && image.width > 0 && image.height > 0),
        `${language}/${width}: every connector logo must load and render`);
      logos.push({ language, width, images: loadedLogos });
      for (const host of CONNECTOR_HOSTS) {
        const instructions = connectorInstructions(language, host);
        const button = section.getByRole("button", { name: host.name, exact: true });
        await button.click();
        assert.equal(await button.getAttribute("aria-pressed"), "true");
        const region = section.getByRole("region", { name: host.name, exact: true });
        assert.equal(await region.locator("li").count(), instructions.steps.length);
        for (const step of instructions.steps) assert.equal(await region.getByText(step, { exact: true }).count(), 1);
        assert.equal(await region.getByRole("link", { name: instructions.action, exact: true }).getAttribute("href"), connectorInstallUrl(host.id, endpoint));
        assert.equal(await region.getByRole("link", { name: c.documentation, exact: true }).getAttribute("href"), host.documentation);
        const configuration = connectorConfig(host.id, endpoint);
        if (configuration) {
          await region.getByRole("button", { name: host.id === "cursor" ? c.copyConfig : directory.copyConfig, exact: true }).click();
          assert.equal((await page.evaluate(() => navigator.clipboard.readText())).replaceAll("\r\n", "\n"), configuration.replaceAll("\r\n", "\n"));
          configurations.push({ language, width, host: host.id });
        }
        await measure(language, width, host.id);
      }
      await section.getByRole("button", { name: "Cursor", exact: true }).click();
      await section.getByRole("button", { name: c.copyConfig, exact: true }).click();
      assert.deepEqual(JSON.parse(await page.evaluate(() => navigator.clipboard.readText())), { mcpServers: { sajda: { url: endpoint } } });
      await section.getByRole("checkbox").check();
      assert.ok(await section.getByText(c.cursorCompanion, { exact: true }).isVisible());
      await section.getByRole("button", { name: c.copyInstructions, exact: true }).click();
      // The Windows clipboard normalizes LF to CRLF; compare the canonical content.
      assert.equal((await page.evaluate(() => navigator.clipboard.readText())).replaceAll("\r\n", "\n"), `${CONNECTOR_HOST_INSTRUCTIONS}\n\n${getConnectorOffer(language)}`.replaceAll("\r\n", "\n"));
      await measure(language, width, "companion-enabled");
      const screenshot = resolve(output, `developers-connector-${language}-${width}.png`);
      await section.screenshot({ path: screenshot }); screenshots.push(screenshot);
      await section.getByRole("checkbox").uncheck();
      assert.equal(await section.getByRole("button", { name: c.copyInstructions, exact: true }).count(), 0);
      console.log(JSON.stringify({ event: "connector_browser_case_pass", language, width }));
    } catch (error) {
      failures.push({ language, width, message: error.message });
      console.log(JSON.stringify({ event: "connector_browser_case_fail", ...failures.at(-1) }));
    }
  }
  assert.equal(errors.length, 0, "No browser runtime/console errors expected");
  assert.equal(blocked.length, 0, "No API or external requests expected");
  assert.equal(failures.length, 0, "All responsive cases must pass");
} finally {
  await writeFile(resolve(output, "report.json"), JSON.stringify({ measurements, logos, configurations, screenshots, errors, blocked, failures }, null, 2));
  await browser.close();
}
console.log(JSON.stringify({ event: "connector_browser_complete", cases: languages.length * widths.length,
  hosts: CONNECTOR_HOSTS.length, logoChecks: logos.reduce((total, value) => total + value.images.length, 0),
  configurationChecks: configurations.length, measurements: measurements.length,
  screenshots: screenshots.length, errors: errors.length, blocked: blocked.length }));
