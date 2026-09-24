/** Real page layouts with isolated local auth/scan/service boundaries. Never uses live accounts or providers.
 * SAJDA_PLAYWRIGHT_ROOT=<bundled directory containing Playwright> node scripts/check-responsive-browser.mjs
 * SAJDA_RESPONSIVE_ROUTES and SAJDA_RESPONSIVE_WIDTHS can narrow a regression pass.
 * SAJDA_RESPONSIVE_CASES accepts an array of {route,language,width} for a focused mixed regression.
 * SAJDA_RESPONSIVE_SURFACE=native renders the real app shell with browser-only, disconnected service boundaries.
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
const require = createRequire(process.env.SAJDA_PLAYWRIGHT_ROOT ? resolve(process.env.SAJDA_PLAYWRIGHT_ROOT, "__sajda_responsive.cjs") : import.meta.url);
const { chromium } = require("playwright");
const origin = "http://127.0.0.1:8195";
const output = resolve(project, "tmp/responsive-browser", process.env.SAJDA_RESPONSIVE_LABEL || "current");
await mkdir(output, { recursive: true });
const free = await new Promise(done => { const socket = connect({ host: "127.0.0.1", port: 8195 });
  socket.once("connect", () => { socket.destroy(); done(false); }); socket.once("error", error => { socket.destroy(); done(error.code === "ECONNREFUSED"); }); socket.setTimeout(1000, () => { socket.destroy(); done(false); }); });
assert.ok(free, "Responsive fixture port 8195 is occupied or ownership cannot be safely checked.");
const server = spawn(process.execPath, [resolve(project, "node_modules/vite/bin/vite.js"), "--config", "tests/fixtures/responsive.vite.ts"], {
  cwd: project, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, NO_COLOR: "1" },
});
let log = "", browser;
const errors = [], blockedRequests = [], measurements = [], screenshots = [], routeFailures = [];
for (const stream of [server.stdout, server.stderr]) stream.on("data", data => { log = (log + data).slice(-24000); });
try {
  let ready = false;
  for (let attempt = 0; attempt < 150; attempt++) {
    if (server.exitCode !== null) throw new Error(`Fixture exited: ${log}`);
    try { const response = await fetch(origin, { signal: AbortSignal.timeout(1000) }); if (response.ok && (await response.text()).includes("LOCAL UI FIXTURE — Sajda Responsive")) { ready = true; break; } } catch { /* Bounded readiness only. */ }
    await delay(200);
  }
  assert.ok(ready, `Fixture startup timeout: ${log}`);
  console.log(JSON.stringify({ event: "responsive_fixture_ready", pid: server.pid }));
  browser = await chromium.launch({ headless: true, channel: process.env.SAJDA_QA_BROWSER_CHANNEL || "msedge" });
  const context = await browser.newContext({ locale: "en-US", viewport: { width: 390, height: 900 }, reducedMotion: "reduce" });
  context.setDefaultTimeout(20000); context.setDefaultNavigationTimeout(60000);
  await context.addInitScript(({ origin }) => {
    if (location.origin !== origin) return;
    const key = "sajda.swipe.wishlist.v1";
    if (new URLSearchParams(location.search).get("wishlist") !== "populated") { localStorage.removeItem(key); return; }
    const domain = "synthetic-name-preview.example", at = new Date().toISOString();
    localStorage.setItem(key, JSON.stringify([{ domain, category: "shortlist", tags: ["Synthetic preview", "Long-term naming shortlist"], savedAt: at, lastCheckedAt: at,
      result: { domain, tld: "example", status: "unknown", checkMethod: "none", source: "LOCAL RESPONSIVE FIXTURE — no registry observation", authoritative: false,
        registrarPrice: 0, estimatedValue: 0, confidenceScore: 0, rationale: "Synthetic saved item for layout only." } }]));
  }, { origin });
  await context.route("**/*", route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin || url.pathname.startsWith("/api/") || request.method() !== "GET") {
      blockedRequests.push({ origin: url.origin, path: url.pathname, method: request.method() }); return route.abort("blockedbyclient");
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.on("pageerror", error => { const detail = { url: page.url(), message: error.message }; errors.push(detail); console.log(JSON.stringify({ event: "runtime_error", ...detail })); });
  const widths = process.env.SAJDA_RESPONSIVE_WIDTHS?.split(",").map(Number) || [360, 390, 768, 820, 1024, 1180, 1440];
  const routes = process.env.SAJDA_RESPONSIVE_ROUTES?.split(",") || ["/", "/auth", "/pricing", "/brand-index", "/name-packages", "/developers", "/swipe", "/trading"];
  const languages = process.env.SAJDA_RESPONSIVE_LANGUAGES?.split(",") || ["en", "sv"];
  const cases = process.env.SAJDA_RESPONSIVE_CASES ? JSON.parse(process.env.SAJDA_RESPONSIVE_CASES) :
    routes.flatMap(route => languages.flatMap(language => widths.filter(width => process.env.SAJDA_RESPONSIVE_WIDTHS || language === "en" || [360, 768, 1024].includes(width)).map(width => ({ route, language, width }))));
  const capture = async (route, state, language, width) => {
    await page.evaluate(() => scrollTo(0, 0));
    const data = await page.evaluate(() => {
      const viewport = innerWidth;
      const brief = element => ({ tag: element.tagName.toLowerCase(), id: element.id || undefined,
        className: typeof element.className === "string" ? element.className.slice(0, 200) : "", text: element.textContent?.trim().replace(/\s+/g, " ").slice(0, 100),
        rect: Object.fromEntries(["x", "y", "width", "height", "right", "bottom"].map(key => [key, Math.round(element.getBoundingClientRect()[key] * 10) / 10])) });
      const elements = [...document.querySelectorAll("h1,h2,h3,h4,p,span,a,button,label,input,textarea,select,pre,td,th,[role=dialog],[role=tab],article")].filter(element => {
        const box = element.getBoundingClientRect(), style = getComputedStyle(element);
        return box.width > 0 && box.height > 0 && (element.tagName !== "SPAN" || element.textContent?.trim()) && style.visibility !== "hidden" && style.display !== "none" && !element.closest('[aria-hidden="true"]') && !element.classList.contains("sr-only");
      });
      const outside = elements.filter(element => { const box = element.getBoundingClientRect(); return box.left < -1 || box.right > viewport + 1; }).map(brief);
      const clipped = [];
      for (const element of elements) {
        const box = element.getBoundingClientRect();
        for (let ancestor = element.parentElement; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
          const style = getComputedStyle(ancestor), bounds = ancestor.getBoundingClientRect();
          if (["hidden", "clip"].includes(style.overflowX) && bounds.width > 0 && (box.left < bounds.left - 1 || box.right > bounds.right + 1)) {
            clipped.push({ ...brief(element), ancestor: brief(ancestor) }); break;
          }
        }
      }
      const intrinsicOverflow = elements.filter(element => element.children.length === 0 && element.scrollWidth > element.clientWidth + 1 && !["PRE", "INPUT", "TEXTAREA", "SELECT"].includes(element.tagName))
        .map(element => ({ ...brief(element), scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, overflowX: getComputedStyle(element).overflowX, textOverflow: getComputedStyle(element).textOverflow }));
      // Explicit CSS ellipsis is retained as a diagnostic; it is not accidental clipping.
      const intentionalEllipsis = intrinsicOverflow.filter(item => item.textOverflow === "ellipsis");
      const tightText = intrinsicOverflow.filter(item => item.textOverflow !== "ellipsis");
      const grids = [...document.querySelectorAll("main div,main section,main ul,main article")].filter(element => getComputedStyle(element).display === "grid")
        .map(element => ({ ...brief(element), columns: getComputedStyle(element).gridTemplateColumns })).filter(grid => grid.columns.includes(" ")).slice(0, 30);
      const forms = elements.filter(element => ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName)).map(element => ({ ...brief(element), fontSize: getComputedStyle(element).fontSize }));
      const headers = [...document.querySelectorAll("header")].map(element => ({ ...brief(element), position: getComputedStyle(element).position }));
      const controls = elements.filter(element => element.closest("header") && ["A", "BUTTON"].includes(element.tagName));
      const overlappingControls = [];
      for (let index = 0; index < controls.length; index++) for (const other of controls.slice(index + 1)) {
        const element = controls[index]; if (element.contains(other) || other.contains(element)) continue;
        const a = element.getBoundingClientRect(), b = other.getBoundingClientRect();
        if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) overlappingControls.push([brief(element), brief(other)]);
      }
      return { viewport, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight,
        outside: outside.slice(0, 50), clipped: clipped.slice(0, 50), tightText: tightText.slice(0, 50), intentionalEllipsis, grids, forms, headers, controlTargets: controls.map(brief), overlappingControls };
    });
    const item = { route, state, language, width, ...data }; measurements.push(item);
    console.log(JSON.stringify({ event: "layout_measured", route, state, language, width, overflow: data.outside.length + data.clipped.length + data.tightText.length + data.overlappingControls.length }));
    if (data.outside.length || data.clipped.length || data.tightText.length || data.overlappingControls.length || data.scrollWidth > width) console.log(JSON.stringify({ event: "layout_finding", route, state, language, width, outside: data.outside, clipped: data.clipped, tightText: data.tightText, overlappingControls: data.overlappingControls }));
    if (process.env.SAJDA_RESPONSIVE_CAPTURE_ALL === "true" || [320, 360, 768, 820, 1024, 1280, 1440].includes(width)) {
      const path = resolve(output, `${route === "/" ? "home" : route.slice(1).replaceAll("/", "-")}-${state}-${language}-${width}.png`);
      await page.screenshot({ path, fullPage: true }); screenshots.push(path);
    }
  };
  // One Edge process and one page, serially; live services are disconnected above and at Vite boundaries.
  const failedRoutes = new Set();
  for (const { route, language, width, states: requestedStates } of cases) {
    if (failedRoutes.has(`${route}:${language}`)) continue;
    const states = requestedStates || process.env.SAJDA_RESPONSIVE_STATES?.split(",") || (["/", "/name-packages"].includes(route) ? ["empty", "results"] : route === "/auth" && [360, 768].includes(width) ? ["empty", "signup"] : ["empty"]);
    for (const state of states) {
      await page.setViewportSize({ width, height: Number(process.env.SAJDA_RESPONSIVE_HEIGHT) || (width >= 768 ? 1000 : 900) });
      const params = new URLSearchParams({ lang: language });
      if (state === "results") params.set("state", state);
      if (state === "signup") params.set("mode", "signup");
      if (state === "populated") params.set("wishlist", "populated");
      try {
        for (let attempt = 0; attempt < 2; attempt++) {
          try { await page.goto(`${origin}${route}?${params}`, { waitUntil: "domcontentloaded" }); break; }
          catch (error) { if (attempt === 1 || !error.message.includes("Timeout")) throw error; }
        }
        await page.locator(`[data-responsive-fixture-language="${language}"] main`).first().waitFor();
        if (process.env.SAJDA_RESPONSIVE_SURFACE === "native") {
          const navigation = page.locator(".sajda-native-navigation");
          assert.equal(await navigation.locator("a").count(), 5, "Native shell retains five destinations");
          for (const link of await navigation.locator("a").all()) {
            const box = await link.boundingBox();
            assert.ok(box && box.width >= 44 && box.height >= 44 && box.x >= 0 && box.x + box.width <= width, "Native navigation stays tappable and within the viewport");
          }
          if (route === "/auth") assert.ok(await page.locator("main button").first().isDisabled(), "Browser fixture cannot claim native sign-in");
        }
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(100);
        await capture(route, state, language, width);
        if (route === "/swipe") {
          const dialog = page.getByRole("dialog");
          if (await dialog.isVisible()) { await page.keyboard.press("Escape"); await dialog.waitFor({ state: "hidden" }); }
          await capture(route, state === "populated" ? "header-populated" : "header", language, width);
          if (process.env.SAJDA_RESPONSIVE_WISHLIST === "true") {
            const trigger = page.locator("[data-swipe-wishlist-slot] button").first();
            await trigger.click(); await dialog.waitFor();
            const box = await dialog.boundingBox(), viewport = page.viewportSize();
            assert.ok(Math.abs(box.y) <= 1 && Math.abs(box.height - viewport.height) <= 1, `Wishlist must fill viewport height ${width}x${viewport.height}: ${JSON.stringify(box)}`);
            assert.ok(box.x >= -1 && box.x + box.width <= width + 1, "Wishlist must remain inside viewport width");
            const name = state === "populated" ? "wishlist-populated" : "wishlist";
            await capture(route, name, language, width);
            const scrollRegion = dialog.locator('[class*="overflow-y-auto"]').last();
            if (await scrollRegion.count()) {
              const scrolling = await scrollRegion.evaluate(element => { element.scrollTop = element.scrollHeight; return { top: element.scrollTop, height: element.scrollHeight, client: element.clientHeight }; });
              assert.ok(scrolling.height <= scrolling.client || scrolling.top > 0, "Wishlist content must be scrollable in short viewports");
              await capture(route, `${name}-bottom`, language, width);
            }
            await page.keyboard.press("Escape"); await dialog.waitFor({ state: "hidden" });
            assert.ok(await trigger.evaluate(element => element === document.activeElement), "Wishlist should restore trigger focus");
          }
        }
        if (route === "/primitives") {
          const trigger = page.getByRole("button", { name: "Open long dialog", exact: true });
          await trigger.click();
          const dialog = page.getByRole("dialog"); await dialog.waitFor();
          const box = await dialog.boundingBox(), viewport = page.viewportSize();
          assert.ok(box.y >= 0 && box.y + box.height <= viewport.height + 1, `Dialog must fit viewport ${width}x${viewport.height}: ${JSON.stringify(box)}`);
          assert.ok(await dialog.evaluate(element => element.contains(document.activeElement)), "Dialog must receive focus");
          const close = dialog.getByRole("button", { name: "Close", exact: true });
          const closeBox = await close.boundingBox(); assert.ok(closeBox.width >= 44 && closeBox.height >= 44, "Dialog close needs a 44px target");
          await capture(route, "dialog-open", language, width);
          const finish = dialog.getByRole("button", { name: "Finish review", exact: true });
          await finish.scrollIntoViewIfNeeded(); assert.ok(await finish.isVisible());
          await page.keyboard.press("Escape"); await dialog.waitFor({ state: "hidden" });
          assert.ok(await trigger.evaluate(element => element === document.activeElement), "Escape should restore trigger focus");
        }
      } catch (error) { routeFailures.push({ route, state, language, width, message: error.message }); failedRoutes.add(`${route}:${language}`); console.log(JSON.stringify({ event: "route_failure", ...routeFailures.at(-1) })); break; }
    }
  }
  const result = { event: "responsive_browser_measured", browser: "installed-msedge", surface: process.env.SAJDA_RESPONSIVE_SURFACE === "native" ? "native-shell-browser" : "web", syntheticFixturesOnly: true, measurements, screenshots, errors, blockedRequests, routeFailures };
  await writeFile(resolve(output, "result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ ...result, measurements: measurements.length, screenshots: screenshots.length, output }));
  assert.deepEqual(errors, [], "Page runtime exceptions"); assert.deepEqual(blockedRequests, [], "No live service requests should be attempted"); assert.deepEqual(routeFailures, [], "All fixture routes should render");
  assert.deepEqual(measurements.filter(item => item.scrollWidth > item.width || item.outside.length || item.clipped.length || item.tightText.length || item.overlappingControls.length)
    .map(({ route, state, language, width }) => ({ route, state, language, width })), [], "Responsive layouts must not overflow, clip content, or overlap header controls");
} catch (error) {
  await writeFile(resolve(output, "failure.json"), JSON.stringify({ message: error.message, errors, blockedRequests, routeFailures, measurements, log }, null, 2)); throw error;
} finally {
  await browser?.close();
  if (server.exitCode === null && server.signalCode === null) {
    const stopped = new Promise(done => server.once("exit", done)); server.kill(); await Promise.race([stopped, delay(5000)]);
    if (server.exitCode === null && server.signalCode === null) throw new Error(`Owned responsive fixture did not stop: ${server.pid}`);
  }
}
