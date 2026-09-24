/** Isolated auth presentation QA in installed Edge; never imports real auth.
 * node --import tsx scripts/check-auth-browser.mjs
 * SAJDA_PLAYWRIGHT_ROOT is a directory containing Playwright's node_modules.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { connect } from "node:net";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(process.env.SAJDA_PLAYWRIGHT_ROOT ? resolve(process.env.SAJDA_PLAYWRIGHT_ROOT, "__sajda_auth_qa.cjs") : import.meta.url);
const { chromium } = require("playwright");
const origin = "http://127.0.0.1:8193", output = resolve(project, "tmp/auth-browser");
const returnPath = "/developers#access";
const fields = { email: "fixture@example.invalid", password: "local-fixture-password" };
await mkdir(output, { recursive: true });
const portIsFree = await new Promise(done => {
  const socket = connect({ host: "127.0.0.1", port: 8193 });
  socket.once("connect", () => { socket.destroy(); done(false); });
  socket.once("error", error => { socket.destroy(); done(error.code === "ECONNREFUSED"); });
  socket.setTimeout(1000, () => { socket.destroy(); done(false); });
});
assert.ok(portIsFree, "Auth fixture port 8193 is already owned or cannot be safely checked.");
const server = spawn(process.execPath, [resolve(project, "node_modules/vite/bin/vite.js"), "--config", "tests/fixtures/auth.vite.ts"],
  { cwd: project, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, NO_COLOR: "1" } });
let browser, serverLog = "", combinations = 0, phase = "harness_startup";
const errors = [], measurements = [], screenshots = [], flows = [], blockedRequests = [], startupAttempts = [];
const log = data => { serverLog = (serverLog + data.toString()).slice(-24000); };
server.stdout.on("data", log); server.stderr.on("data", log);
try {
  let ready = false;
  for (let attempt = 0; attempt < 90; attempt++) {
    if (server.exitCode !== null) throw new Error(`Auth fixture exited: ${serverLog}`);
    try {
      const response = await fetch(`${origin}/auth`, { signal: AbortSignal.timeout(1000) });
      if (response.ok && (await response.text()).includes("LOCAL UI FIXTURE — Sajda Auth")) { ready = true; break; }
    } catch { /* Bounded readiness checks only. */ }
    await delay(200);
  }
  assert.ok(ready, `Auth fixture startup failed: ${serverLog}`);
  browser = await chromium.launch({ headless: true, channel: process.env.SAJDA_QA_BROWSER_CHANNEL || "msedge" });
  const context = await browser.newContext({ locale: "en-US", viewport: { width: 390, height: 900 }, reducedMotion: "reduce" });
  context.setDefaultTimeout(15000); context.setDefaultNavigationTimeout(30000);
  await context.route("**/*", route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin || url.pathname.startsWith("/api/") || request.method() !== "GET") {
      blockedRequests.push({ origin: url.origin, path: url.pathname, method: request.method() });
      return route.abort("blockedbyclient");
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  const open = async (language, mode = "", extra = {}) => {
    const params = new URLSearchParams({ lang: language, next: returnPath, ...extra });
    if (mode) params.set("mode", mode);
    await page.goto(`${origin}/auth?${params}`, { waitUntil: "domcontentloaded" });
    await page.locator(`[data-auth-fixture-language="${language}"] main`).waitFor();
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.locator("h1").count(), 1, "Auth states need one primary heading");
  };
  const screenshot = async (state, language, width) => {
    if (!["en", "sv"].includes(language)) return;
    await page.evaluate(() => scrollTo(0, 0));
    const file = resolve(output, `auth-${state}-${language}-${width}.png`);
    await page.screenshot({ path: file, fullPage: true }); screenshots.push(file);
  };
  const measure = async (state, language, width) => {
    const dimensions = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
      overflowing: [...document.querySelectorAll(".sajda-auth :is(input, button, a, h1, h2, p, label, img)")].filter(element => {
        const box = element.getBoundingClientRect(), styles = getComputedStyle(element);
        return box.width > 0 && styles.visibility !== "hidden" && (box.right > innerWidth + 1 || box.left < -1);
      }).map(element => ({ tag: element.tagName, text: element.textContent?.slice(0, 100) })).slice(0, 12) }));
    measurements.push({ state, language, width, ...dimensions });
    assert.ok(dimensions.scrollWidth <= dimensions.width, `Page overflow ${state}/${language}/${width}: ${JSON.stringify(dimensions)}`);
    assert.deepEqual(dimensions.overflowing, [], `Clipped auth content ${state}/${language}/${width}: ${JSON.stringify(dimensions)}`);
    assert.equal(new URL(page.url()).searchParams.get("next"), returnPath);
  };
  const credentials = async (password = fields.password) => { await page.locator("#email").fill(fields.email); await page.locator("#password").fill(password); };
  const submit = () => page.locator('form button[type="submit"]').click();
  const setError = code => page.evaluate(value => { window.__sajdaAuthFixture.errorCode = value; }, code);
  const calls = () => page.evaluate(() => window.__sajdaAuthFixture.calls);
  const hasNoServiceCalls = async () => assert.equal((await calls()).length, 0);

  for (let attempt = 1; attempt <= 2; attempt++) {
    try { await open("en"); startupAttempts.push({ attempt, ready: true }); break; }
    catch (error) {
      startupAttempts.push({ attempt, ready: false, message: error.message });
      if (errors.length || attempt === 2) throw error;
    }
  }
  phase = "product_assertions";
  // One browser and one page, serially, keeps this workstation responsive.
  for (const width of [320, 390, 1440]) for (const language of ["en", "sv", "es", "fr", "zh"]) {
    await page.setViewportSize({ width, height: 900 });
    await open(language); phase = "product_assertions";
    assert.equal(await page.evaluate(() => document.activeElement?.tagName), "BODY", "Auth must not open the mobile keyboard on arrival");
    const logo = page.getByRole("img", { name: "Sajda", exact: true });
    await logo.waitFor();
    assert.equal(await logo.evaluate(element => element.complete && element.naturalWidth > 0), true, "The real Sajda logo must load");
    assert.match(await logo.getAttribute("src"), /sajda-logo\.svg$/);
    for (const id of ["email", "password"]) {
      const input = page.locator(`#${id}`);
      assert.equal(await input.evaluate(element => parseFloat(getComputedStyle(element).fontSize) >= 16), true, "Fields avoid mobile zoom");
      assert.ok((await input.boundingBox()).height >= 48, "Fields need comfortable tap targets");
    }
    await hasNoServiceCalls(); await measure("sign-in", language, width); await screenshot("sign-in", language, width);
    await submit();
    assert.equal(await page.locator('#email[aria-invalid="true"]').count(), 1);
    assert.equal(await page.locator('#password[aria-invalid="true"]').count(), 1);
    await hasNoServiceCalls(); await measure("validation", language, width);
    await credentials();
    const toggle = page.locator('[data-auth-password-toggle="password"]');
    await toggle.focus(); await toggle.press("Enter"); assert.equal(await page.locator("#password").getAttribute("type"), "text");
    assert.equal(await toggle.getAttribute("aria-pressed"), "true");
    await toggle.press("Space"); assert.equal(await page.locator("#password").getAttribute("type"), "password");
    await hasNoServiceCalls();
    assert.equal(await page.locator('a[href="/legal#terms"]').count(), 1);
    assert.equal(await page.locator('a[href="/legal#privacy"]').count(), 1);
    await setError("INVALID_EMAIL_OR_PASSWORD"); await submit(); await page.getByRole("alert").waitFor();
    assert.doesNotMatch(await page.locator("main").innerText(), /PRIVATE_PROVIDER_DETAIL/);
    assert.equal((await calls())[0].method, "signIn");
    await measure("error", language, width); await screenshot("error", language, width);

    await open(language, "signup");
    assert.equal(await page.locator("#password").getAttribute("autocomplete"), "new-password");
    assert.equal(await page.locator("#password-requirements").count(), 1);
    await measure("sign-up", language, width); await screenshot("sign-up", language, width);
    await credentials("short"); await submit(); await hasNoServiceCalls();
    await page.locator("#password").fill(fields.password); await submit();
    await page.waitForURL(url => !url.searchParams.has("mode"));
    assert.deepEqual(await calls(), [{ method: "signUp", email: fields.email, passwordLength: fields.password.length, nextPath: returnPath }]);
    assert.equal(new URL(page.url()).searchParams.get("next"), returnPath);

    await open(language, "reset");
    assert.equal(await page.locator("#password").count(), 0);
    await measure("reset", language, width); await screenshot("reset", language, width);
    await page.locator("#email").fill(fields.email); await submit();
    await page.locator("form").waitFor({ state: "detached" });
    assert.deepEqual(await calls(), [{ method: "requestPasswordReset", email: fields.email, nextPath: returnPath }]);
    await measure("reset-sent", language, width);

    await open(language, "update-password");
    assert.equal(await page.locator("form").count(), 0); await hasNoServiceCalls();
    await measure("reset-invalid", language, width);
    await open(language, "update-password", { token: "local-recovery-token" });
    await page.waitForURL(url => !url.searchParams.has("token"));
    await page.locator("#confirm-password").waitFor();
    await measure("update-password", language, width);
    await page.locator("#password").fill(fields.password); await page.locator("#confirm-password").fill(fields.password); await submit();
    await page.locator("form").waitFor({ state: "detached" });
    assert.deepEqual(await calls(), [{ method: "updatePassword", passwordLength: fields.password.length, token: "local-recovery-token" }]);
    await measure("password-updated", language, width);
    combinations++; flows.push({ language, width, logoLoaded: true, noOverflow: true, validation: true, passwordToggle: true, nextPreserved: true, recoveryTokenRemoved: true });
  }

  await page.setViewportSize({ width: 390, height: 900 });
  await open("en");
  await page.getByRole("button", { name: "Sign up", exact: true }).click();
  assert.equal(new URL(page.url()).searchParams.get("mode"), "signup");
  assert.equal(new URL(page.url()).searchParams.get("next"), returnPath);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: "Forgot password?", exact: true }).click();
  assert.equal(new URL(page.url()).searchParams.get("next"), returnPath);
  await page.getByRole("button", { name: "Back to sign in", exact: true }).click();
  await credentials("x"); await submit();
  await page.locator("[data-auth-fixture-destination]").waitFor();
  assert.equal(new URL(page.url()).pathname + new URL(page.url()).hash, returnPath);
  await open("sv", "", { fixture: "unavailable" });
  assert.equal(await page.locator("form").count(), 0); await hasNoServiceCalls();
  await measure("unavailable", "sv", 390); await screenshot("unavailable", "sv", 390);
  assert.deepEqual(blockedRequests, [], "Auth presentation must never attempt real auth or API requests");
  assert.deepEqual(errors, [], "Auth presentation has no runtime exceptions");
  const result = { event: "auth_browser_verified", browser: "installed-msedge", localStubsOnly: true, realAccountsCreated: 0, emailsSent: 0,
    combinations, layoutMeasurements: measurements.length, startupAttempts, runtimeErrors: errors, blockedRequests, screenshots, flows, measurements };
  await writeFile(resolve(output, "result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ ...result, measurements: undefined, flows: undefined }));
} catch (error) {
  const failure = { event: "auth_browser_failed", phase, message: error.message, combinations, startupAttempts, errors, blockedRequests, measurements, serverLog };
  await writeFile(resolve(output, "failure.json"), JSON.stringify(failure, null, 2));
  console.error(JSON.stringify(failure)); throw error;
} finally {
  await browser?.close();
  if (server.exitCode === null && server.signalCode === null) {
    const stopped = new Promise(done => server.once("exit", done)); server.kill(); await Promise.race([stopped, delay(5000)]);
    if (server.exitCode === null && server.signalCode === null) throw new Error(`Owned fixture process did not stop: PID ${server.pid}`);
  }
}
