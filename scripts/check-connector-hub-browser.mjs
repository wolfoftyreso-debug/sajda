/** Read-only browser audit of the public connector hub. Never follows setup links.
 * SAJDA_AGENT_BROWSER_CLI=<path to agent-browser.js> node scripts/check-connector-hub-browser.mjs */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { CONNECTOR_HOSTS } from "../shared/connector-catalogue.mjs";

const cli = process.env.SAJDA_AGENT_BROWSER_CLI;
assert.ok(cli, "Configure SAJDA_AGENT_BROWSER_CLI with the installed agent-browser.js path");
const origin = "https://sajda-connector.vercel.app";
const output = resolve("tmp/connector-hub-qa");
const session = "sajda-account-hub-qa";
const measurements = [], screenshots = [];
await mkdir(output, { recursive: true });
function run(...args) {
  const result = spawnSync(process.execPath, [cli, "--session", session, "--json", ...args], {
    encoding: "utf8", timeout: 45000, windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout || result.error?.message);
  const response = JSON.parse(result.stdout);
  assert.equal(response.success, true, JSON.stringify(response.error));
  return response.data;
}
try {
  run("open", origin);
  run("wait", "--load", "networkidle");
  run("snapshot", "-i");
  for (const width of [320, 390, 768, 1440]) {
    run("set", "viewport", String(width), "1000");
    const data = run("eval", `(async () => {
      await document.fonts.ready;
      const images = [...document.querySelectorAll('#setup img')];
      await Promise.all(images.map(image => image.decode()));
      const visible = [...document.querySelectorAll('main h1,main h2,main h3,main p,main a,main li,main pre,main img')]
        .filter(element => element.getBoundingClientRect().width > 0 && getComputedStyle(element).visibility !== 'hidden');
      return {
        viewport: innerWidth, pageWidth: document.documentElement.scrollWidth,
        outside: visible.filter(element => {const rect=element.getBoundingClientRect();return rect.left < -1 || rect.right > innerWidth+1;})
          .map(element => ({tag:element.tagName,text:element.textContent?.slice(0,80)})),
        overlay: !!document.querySelector('vite-error-overlay,[data-nextjs-dialog],#webpack-dev-server-client-overlay'),
        images: images.map(image => ({src:image.getAttribute('src'),naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight,
          width:image.getBoundingClientRect().width,height:image.getBoundingClientRect().height})),
        title: document.querySelector('h1')?.textContent,
      };
    })()`).result;
    measurements.push({ width, ...data });
    assert.equal(data.viewport, width);
    assert.ok(data.pageWidth <= width, `${width}: horizontal overflow ${data.pageWidth}`);
    assert.deepEqual(data.outside, [], `${width}: content outside viewport`);
    assert.equal(data.overlay, false);
    assert.ok(data.title?.trim(), "The page must have meaningful content");
    assert.deepEqual(data.images.map(image => image.src).sort(), CONNECTOR_HOSTS.map(host => host.logo).sort());
    assert.equal(data.images.length, 13);
    assert.ok(data.images.every(image => image.naturalWidth > 0 && image.naturalHeight > 0 && image.width > 0 && image.height > 0));
    for (const [name, selector] of [["setup", "#setup"], ["account", "#account"]]) {
      const path = resolve(output, `hub-${name}-${width}.png`);
      // Keep captures inside the real viewport: a tall off-screen element clip
      // can be blank in the installed browser CLI even when its DOM is valid.
      run("eval", `document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:"start"})`);
      run("screenshot", path);
      screenshots.push(path);
    }
    console.log(JSON.stringify({ event: "connector_hub_browser_case_pass", width, logos: data.images.length }));
  }
  const errors = run("errors");
  const consoleMessages = run("console");
  assert.deepEqual(errors.errors, [], "No browser runtime errors expected");
  assert.equal(consoleMessages.messages.filter(message => message.type === "error").length, 0, "No browser console errors expected");
  await writeFile(resolve(output, "report.json"), JSON.stringify({ origin, measurements, screenshots, errors, consoleMessages }, null, 2));
} finally {
  run("close");
}
console.log(JSON.stringify({ event: "connector_hub_browser_complete", cases: measurements.length, logoChecks: measurements.reduce((count, item) => count + item.images.length, 0), screenshots: screenshots.length }));
