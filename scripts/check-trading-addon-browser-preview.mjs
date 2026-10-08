/**
 * Compiled-browser QA of Trading's Pro add-on. All account/billing/scenario
 * responses below are explicitly SYNTHETIC transport fixtures. Actual React,
 * styles, client owner checks and Radix dialogs are unchanged. No database,
 * auth, Stripe, email, registry or other provider mutation is performed.
 *
 * Local: SAJDA_TRADING_ADDON_BROWSER_TEST=1 node --import tsx <script> --local
 * Preview: same opt-in, --preview-origin=https://sajda-<id>-hypbit.vercel.app
 *   --development-env=.vercel/.env.brand-monitors.development.local
 *   --expected-commit=<40 lowercase hex SHA>
 * --check-fixtures validates only in-memory shared membership/catalog shapes.
 * Preview's actual anonymous auth GET and billing rejection are separately
 * fetched, unchanged and without cookies, before any fixture interception.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, realpath, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseEnv } from "node:util";
import { chromium } from "playwright";
import { BASE_PLAN_ORDER, PLANS, TRADING_ADDON } from "../shared/plans.ts";
import { isAccountMembership } from "../shared/account-membership.ts";
import { tradingPurchaseCopy } from "../src/i18n/tradingPurchaseCopy.ts";
import { tradingAddonCopy } from "../src/i18n/tradingAddonCopy.ts";
import { getPlusBillingCopy } from "../src/i18n/plusBillingCopy.ts";

const copy = tradingPurchaseCopy.en, addonCopy = tradingAddonCopy.en;
const billingCopy = getPlusBillingCopy("en");
const trace = "req_0123456789abcdef";
const owner = "synthetic-trading-addon-browser-owner";
const stamp = "2026-10-08T12:00:00.000Z";
const effectiveAt = "2030-11-08T13:14:00.000Z";
const expiresAt = "2030-11-08T13:13:00.000Z";
const widths = [320, 390, 768, 1440];
const owned = value => ({ accountId: owner, requestId: trace, ...value });
const check = value => assert.ok(value);
function membership(plan) {
  const trading = plan === "trading";
  return { plan, basePlan: plan === "trading" ? "premium" : plan, addons: { trading },
    accessSource: plan === "free" ? "free" : "subscription", expiresAt: plan === "free" ? null : expiresAt,
    capabilities: { save_domains: true, swipe_undo: ["premium", "trading"].includes(plan), trading } };
}
function price(unitAmount) {
  return { currency: "usd", unitAmount, interval: "month", intervalCount: 1, taxBehavior: "exclusive" };
}
function fixture(plan = "premium", pending = null, omitAddon = false) {
  const guest = plan === null, current = guest ? "free" : plan;
  const active = current !== "free";
  return { guest, membership: membership(current),
    billing: owned({ ready: true, mode: "test", price: price(4900), status: active ? "active" : "none",
      canCheckout: !active, canManage: active, accessExpiresAt: active ? expiresAt : null,
      activePlan: active ? current : null, premiumIntro: null,
      plans: Object.fromEntries(["basic", "premium", "trading"].map(id => [id, { ready: true, price: price(PLANS[id].unitAmount), canCheckout: !active }])),
      ...(!omitAddon ? { tradingAddon: { canAdd: current === "premium" && !pending, canRemove: current === "trading" && !pending, pending } } : {}) }),
  };
}
const pending = (enabled, state = "scheduled") => ({ enabled, effectiveAt, canCancel: true, state, canRetry: state === "processing" });
function checkFixtures() {
  assert.deepEqual(BASE_PLAN_ORDER, ["free", "basic", "premium"]);
  check(PLANS.premium.unitAmount === 1900 && TRADING_ADDON.unitAmount === 3000 && TRADING_ADDON.totalUnitAmount === 4900);
  for (const plan of ["free", "basic", "premium", "trading"]) check(isAccountMembership(membership(plan)));
  check(fixture("premium", pending(true)).membership.capabilities.trading === false);
  check(fixture("trading", pending(false)).membership.capabilities.trading === true);
  check(!("tradingAddon" in fixture("premium", null, true).billing));
  console.info(JSON.stringify({ event: "trading_addon_synthetic_fixture_contract_pass", networkCalls: 0, databaseWrites: 0, providerWrites: 0 }));
}

let phase = "configuration", browser, server, context, page, artifactPath, finalResult;
const results = [], layouts = [], posts = [], intercepted = [], blocked = [], errors = [], screenshots = [], focusReceipts = [];
let realReads = [], token, origin;
async function json(route, value, status = 200) {
  await route.fulfill({ status, contentType: "application/json", headers: { "cache-control": "no-store" }, body: JSON.stringify(value) });
}
async function newFixtureContext(state) {
  if (context) await context.close();
  context = await browser.newContext({ locale: "en-US", viewport: { width: 390, height: 900 }, reducedMotion: "reduce", serviceWorkers: "block" });
  context.setDefaultTimeout(20_000); context.setDefaultNavigationTimeout(45_000);
  await context.addInitScript(() => localStorage.setItem("name-quest.language.v2", "en"));
  await context.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    try {
      if (url.origin !== origin.origin) { blocked.push({ kind: "external", method, path: url.pathname }); await route.abort("blockedbyclient"); return; }
      if (url.pathname.startsWith("/api/")) {
        const endpoint = url.pathname;
        intercepted.push({ method, endpoint, synthetic: true });
        if (method === "GET" && endpoint === "/api/auth/get-session") {
          await json(route, state.guest ? null : {
            user: { id: owner, email: "synthetic-trading-browser@example.test", emailVerified: true, name: "SYNTHETIC Trading browser QA", createdAt: stamp, updatedAt: stamp },
            session: { id: "synthetic-trading-session", userId: owner, createdAt: stamp, updatedAt: stamp, expiresAt },
          }); return;
        }
        if (method === "GET" && endpoint === "/api/auth-providers") {
          await json(route, { providers: ["google", "twitter", "github", "apple"].map(id => ({ id, enabled: false })) }); return;
        }
        if (endpoint.startsWith("/api/account/")) {
          check(!state.guest && request.headers()["x-sajda-account"] === owner);
          if (method === "GET" && endpoint === "/api/account/membership") { await json(route, owned({ membership: state.membership })); return; }
          if (method === "GET" && endpoint === "/api/account/billing") { await json(route, state.billing); return; }
          if (method === "GET" && endpoint === "/api/account/lost-domains") {
            await json(route, owned({ access: state.membership.capabilities.trading, enabled: false, sourcesAvailable: 0,
              activeRun: null, latestRun: null, latestAttempt: null, candidates: [], candidatesOmitted: 0, quoteRefreshEnabled: false, quoteUpdates: {} })); return;
          }
          if (method === "GET" && endpoint === "/api/account/trading-scenarios") { await json(route, owned({ scenarios: [] })); return; }
          if (method === "POST" && endpoint === "/api/account/billing") {
            const body = request.postDataJSON();
            const allowed = body.action === "trading-addon" ? ["action", "requestKey", "enabled"] : ["action", "requestKey"];
            check(["trading-addon", "cancel-trading-addon-change"].includes(body.action));
            assert.deepEqual(Object.keys(body).sort(), allowed.sort());
            check(/^[0-9a-f-]{36}$/iu.test(body.requestKey));
            if (body.action === "trading-addon") check(typeof body.enabled === "boolean");
            posts.push({ action: body.action, enabled: body.enabled ?? null, synthetic: true });
            if (state.mutationGate) await state.mutationGate;
            if (body.action === "trading-addon") {
              state.billing.tradingAddon = { canAdd: false, canRemove: false, pending: pending(body.enabled) };
              await json(route, owned({ state: "scheduled", enabled: body.enabled, effectiveAt }));
            } else {
              state.billing.tradingAddon = { canAdd: state.membership.plan === "premium", canRemove: state.membership.plan === "trading", pending: null };
              await json(route, owned({ state: "canceled" }));
            }
            return;
          }
        }
        blocked.push({ kind: "unexpected_api", method, path: endpoint });
        await route.abort("blockedbyclient"); return;
      }
      if (!["GET", "HEAD"].includes(method)) { blocked.push({ kind: "write", method, path: url.pathname }); await route.abort("blockedbyclient"); return; }
      if (token) {
        const response = await route.fetch({ headers: { ...request.headers(), "x-vercel-trusted-oidc-idp-token": token }, maxRedirects: 0, maxRetries: 0, timeout: 60_000 });
        check(response.status() < 300 || response.status() >= 400);
        await route.fulfill({ response }); return;
      }
      await route.continue();
    } catch {
      errors.push({ kind: "transport_fixture_contract", method, path: url.pathname });
      await route.abort("failed").catch(() => {});
    }
  });
  page = await context.newPage();
  page.on("pageerror", () => errors.push({ kind: "browser_runtime_exception" }));
  return state;
}
async function goto(route) {
  await page.goto(new URL(route, origin).href, { waitUntil: "networkidle" });
  await page.locator("main").waitFor();
}
async function assertPrices() {
  assert.deepEqual(await page.locator("[data-plan]").evaluateAll(nodes => nodes.map(node => node.getAttribute("data-plan"))), ["free", "basic", "premium"]);
  check(await page.locator('[data-plan-price="premium"]').innerText() === "USD 19 / month");
  check(await page.locator("[data-addon-price]").innerText() === "+ USD 30 / month");
  check((await page.locator("[data-addon-total]").innerText()).includes("USD 49 / month"));
  check(await page.locator('[data-plan="trading"]').count() === 0);
}
async function layout(label) {
  const state = await page.evaluate(() => {
    const width = innerWidth;
    const clipped = [...document.querySelectorAll("main button,main a,main input,main h1,main h2,[role=dialog] button,[role=dialog]")]
      .filter(node => { const s = getComputedStyle(node), r = node.getBoundingClientRect(); return s.display !== "none" && s.visibility !== "hidden" && r.width > 0 && r.height > 0; })
      .filter(node => { const r = node.getBoundingClientRect(); return r.left < -1 || r.right > width + 1; })
      .map(node => ({ tag: node.tagName, role: node.getAttribute("role"), text: (node.textContent || "").trim().slice(0, 70) }));
    return { width, documentWidth: document.documentElement.scrollWidth, clipped };
  });
  layouts.push({ label, ...state });
  check(state.documentWidth <= state.width && state.clipped.length === 0);
}
async function screenshot(name) {
  const file = path.join(artifactPath, name);
  await page.screenshot({ path: file, fullPage: true });
  screenshots.push(file);
}
async function pendingTime(expectedTrading) {
  await page.locator("[data-addon-pending]").waitFor();
  check(await page.locator("[data-addon-pending] time").getAttribute("datetime") === effectiveAt);
  check((await page.locator("[data-addon-pending] time").innerText()).endsWith(" UTC"));
  check(await page.locator("[data-addon-access]").getAttribute("data-addon-access") === (expectedTrading ? "active" : "inactive"));
  check(await page.locator("[data-account-plan]").getAttribute("data-account-plan") === "premium");
  check(await page.locator('[data-addon="trading"] a[href="/plus"]').count() === (expectedTrading ? 1 : 0));
}
async function openDialog(triggerText, title) {
  const trigger = page.getByRole("button", { name: triggerText, exact: true });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: title, exact: true });
  await dialog.waitFor();
  check(await dialog.evaluate(node => node.contains(document.activeElement)));
  return { trigger, dialog };
}
async function confirmSynthetic(triggerText, title, confirmationText, state) {
  const before = posts.length;
  let release;
  state.mutationGate = new Promise(resolve => { release = resolve; });
  try {
    const { dialog } = await openDialog(triggerText, title);
    check(posts.length === before);
    const button = dialog.getByRole("button", { name: confirmationText, exact: true });
    await button.focus();
    // Two native click events in one turn exercise the actual request-ref lock.
    await button.evaluate(node => { node.click(); node.click(); });
    await page.waitForFunction(() => [...document.querySelectorAll('[role="dialog"] button')].some(node => node.disabled && node.textContent.includes("Confirming")));
    const deadline = Date.now() + 5000;
    while (posts.length === before && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
    check(posts.length === before + 1);
    await layout(`${title} busy`);
  } finally { release?.(); state.mutationGate = null; }
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  check(posts.length === before + 1);
}
async function runBrowser() {
  phase = "guest_prices_auth_same_account";
  await newFixtureContext(fixture(null));
  await goto("/pricing#trading-addon"); await assertPrices();
  const auth = page.locator('[data-addon="trading"] a[href="/auth?next=%2Fpricing%23trading-addon"]');
  check(await auth.count() === 1);
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 }); await layout("guest pricing");
  }
  await page.setViewportSize({ width: 390, height: 900 });
  await screenshot("guest-pricing-390.png");
  await auth.click();
  check(new URL(page.url()).pathname === "/auth" && new URL(page.url()).searchParams.get("next") === "/pricing#trading-addon");
  check(await page.getByRole("heading", { level: 1 }).count() === 1);
  results.push({ scenario: phase, syntheticTransport: true, pass: true });

  phase = "pro_add_dialog_focus_escape";
  const pro = await newFixtureContext(fixture("premium"));
  await goto("/pricing#trading-addon"); await assertPrices();
  await page.getByRole("button", { name: copy.add, exact: true }).waitFor();
  const before = posts.length;
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    const { trigger, dialog } = await openDialog(copy.add, copy.confirmAdd);
    await layout("Pro add dialog"); check(posts.length === before);
    check((await dialog.innerText()).includes(copy.addTerms));
    if (width === 390) await screenshot("pro-add-dialog-390.png");
    await page.keyboard.press("Escape"); await dialog.waitFor({ state: "hidden" });
    check(posts.length === before);
    const handle = await trigger.elementHandle();
    const restored = await page.waitForFunction(node => document.activeElement === node, handle, { timeout: 1500 }).then(() => true).catch(() => false);
    focusReceipts.push({ width, restoredAfterEscape: restored, maximumWaitMs: 1500,
      actualFocusedTag: await page.evaluate(() => document.activeElement?.tagName) });
  }
  results.push({ scenario: phase, syntheticTransport: true, widths, pass: focusReceipts.every(row => row.restoredAfterEscape) });
  phase = "pro_add_single_request_no_early_grant";
  await confirmSynthetic(copy.add, copy.confirmAdd, copy.confirm, pro);
  await pendingTime(false);
  check(pro.membership.capabilities.trading === false);
  await screenshot("pro-scheduled-add-1440.png");
  results.push({ scenario: phase, syntheticTransport: true, pass: true });

  phase = "cancel_pending_retains_pro";
  await confirmSynthetic(copy.cancelChange, copy.confirmCancel, copy.cancelChange, pro);
  await page.getByRole("button", { name: copy.add, exact: true }).waitFor();
  check(await page.locator("[data-addon-pending]").count() === 0 && !pro.membership.capabilities.trading);
  results.push({ scenario: phase, syntheticTransport: true, pass: true });

  phase = "active_remove_preserves_paid_access";
  const active = await newFixtureContext(fixture("trading"));
  await goto("/pricing#trading-addon");
  await confirmSynthetic(copy.remove, copy.confirmRemove, copy.confirm, active);
  await pendingTime(true);
  check(active.membership.capabilities.trading === true);
  results.push({ scenario: phase, syntheticTransport: true, pass: true });

  phase = "processing_retry_no_date_no_early_grant";
  const processing = await newFixtureContext(fixture("premium", pending(true, "processing")));
  await goto("/pricing#trading-addon");
  await page.locator("[data-addon-processing]").waitFor();
  check((await page.locator("[data-addon-processing]").innerText()) === copy.processing);
  check(await page.locator("[data-addon-pending] time").count() === 0);
  check(await page.locator("[data-addon-access]").getAttribute("data-addon-access") === "inactive");
  await confirmSynthetic(copy.retry, copy.confirmRetry, copy.retry, processing);
  await pendingTime(false);
  results.push({ scenario: phase, syntheticTransport: true, pass: true });

  phase = "processing_cancel_is_not_subscription_cancel";
  const processingCancel = await newFixtureContext(fixture("premium", pending(true, "processing")));
  await goto("/pricing#trading-addon");
  await confirmSynthetic(copy.cancelChange, copy.confirmCancel, copy.cancelChange, processingCancel);
  check(processingCancel.membership.plan === "premium");
  await page.getByRole("button", { name: copy.add, exact: true }).waitFor();
  results.push({ scenario: phase, syntheticTransport: true, pass: true });

  phase = "omitted_addon_dto_no_portal";
  await newFixtureContext(fixture("premium", null, true));
  await goto("/pricing#trading-addon");
  await page.getByRole("button", { name: copy.refresh, exact: true }).waitFor();
  check(await page.getByRole("button", { name: copy.add, exact: true }).count() === 0);
  check(await page.getByRole("button", { name: billingCopy.portal, exact: true }).count() === 0);
  check(await page.getByRole("button", { name: "Manage subscription", exact: true }).count() === 0);
  results.push({ scenario: phase, syntheticTransport: true, pass: true });

  for (const plan of ["premium", "trading"]) {
    phase = `${plan}_account_and_plus_four_widths`;
    await newFixtureContext(fixture(plan, pending(plan === "premium")));
    await goto("/account#trading");
    await page.locator('[data-current-plan="premium"]').waitFor();
    check((await page.locator('[data-current-plan="premium"]').innerText()) === "Pro");
    check(await page.locator("[data-trading-addon]").getAttribute("data-trading-addon") === (plan === "trading" ? "active" : "inactive"));
    check(await page.locator('#trading a[href="/pricing#trading-addon"]').count() === 1);
    for (const width of widths) { await page.setViewportSize({ width, height: 900 }); await layout(`${plan} account`); }
    await goto("/plus");
    await page.locator('[aria-label="' + billingCopy.title + '"]').waitFor({ state: "attached" });
    const details = page.locator("details").filter({ has: page.locator("summary", { hasText: addonCopy.billing }) });
    if (await details.count()) await details.locator("summary").click();
    const billingRegion = page.locator('[aria-label="' + billingCopy.title + '"]');
    await billingRegion.locator(`time[datetime="${effectiveAt}"]`).waitFor();
    check((await billingRegion.locator(`time[datetime="${effectiveAt}"]`).innerText()).includes("UTC"));
    check(await billingRegion.getByRole("button", { name: billingCopy.portal, exact: true }).count() === 0);
    check(await billingRegion.locator('a[href="/pricing#trading-addon"]').count() === 1);
    check(await billingRegion.locator('a[href^="/auth"]').count() === 0);
    for (const width of widths) { await page.setViewportSize({ width, height: 900 }); await layout(`${plan} plus`); }
    await page.setViewportSize({ width: 390, height: 900 });
    await screenshot(`${plan}-plus-pending-390.png`);
    results.push({ scenario: phase, syntheticTransport: true, widths, pass: true });
  }
  for (const state of [fixture("premium", pending(true, "processing")), fixture("premium", null, true)]) {
    phase = state.billing.tradingAddon?.pending ? "plus_processing_no_date_no_portal" : "plus_unknown_no_portal";
    await newFixtureContext(state); await goto("/plus");
    const region = page.locator('[aria-label="' + billingCopy.title + '"]');
    await region.waitFor();
    await region.getByRole("link", { name: addonCopy.manage, exact: true }).waitFor();
    check(await region.getByRole("button", { name: billingCopy.portal, exact: true }).count() === 0);
    check(await region.locator(`time[datetime="${effectiveAt}"]`).count() === 0);
    if (state.billing.tradingAddon?.pending) check((await region.innerText()).includes(addonCopy.processingChange));
    results.push({ scenario: phase, syntheticTransport: true, pass: true });
  }
  check(blocked.length === 0 && errors.length === 0 && focusReceipts.every(row => row.restoredAfterEscape));
}

async function main() {
  if (process.argv.length === 3 && process.argv[2] === "--check-fixtures") { checkFixtures(); return; }
  check(process.env.SAJDA_TRADING_ADDON_BROWSER_TEST === "1" && !process.env.VERCEL);
  const args = process.argv.slice(2), local = args.length === 1 && args[0] === "--local";
  let expectedCommit = null;
  artifactPath = path.resolve(".vercel", local ? "trading-addon-browser-local" : "trading-addon-browser-preview");
  await mkdir(artifactPath, { recursive: true });
  try {
    if (local) {
      const { createServer } = await import("vite");
      server = await createServer({ server: { host: "127.0.0.1", port: 0, strictPort: false },
        define: { "import.meta.env.VITE_ACCOUNT_AUTH_ENABLED": JSON.stringify("true"),
          "import.meta.env.VITE_LOCAL_TEST_MODE": JSON.stringify("false"), "import.meta.env.VITE_SAJDA_SURFACE": JSON.stringify("web") } });
      await server.listen();
      origin = new URL(server.resolvedUrls.local[0]);
      check(origin.hostname === "127.0.0.1");
    } else {
      const options = new Map(args.map(value => { const at = value.indexOf("="); check(at > 0); return [value.slice(0, at), value.slice(at + 1)]; }));
      check(args.length === 3 && options.size === 3 && ["--preview-origin", "--development-env", "--expected-commit"].every(key => options.has(key)));
      origin = new URL(options.get("--preview-origin"));
      check(origin.protocol === "https:" && /^sajda-[a-z0-9]{9}-hypbit\.vercel\.app$/u.test(origin.hostname) && origin.pathname === "/" && !origin.hash && !origin.search && !origin.port && !origin.username && !origin.password);
      expectedCommit = options.get("--expected-commit"); check(/^[a-f0-9]{40}$/u.test(expectedCommit));
      const vercelRoot = await realpath(path.resolve(".vercel"));
      const file = await realpath(path.resolve(options.get("--development-env")));
      check(file === path.join(vercelRoot, ".env.brand-monitors.development.local"));
      const linked = JSON.parse(await readFile(path.join(vercelRoot, "project.json"), "utf8"));
      check(linked.projectId === "prj_UO900Jp4qJF1eS4hkOrebIzwMVlI" && linked.orgId === "team_GP2MTfBKmxj8ajYLvQtV7clA");
      token = parseEnv(await readFile(file, "utf8")).VERCEL_OIDC_TOKEN;
      const claims = JSON.parse(Buffer.from((token || "").split(".")[1] || "", "base64url").toString("utf8"));
      check(token && claims.project_id === linked.projectId && claims.owner_id === linked.orgId && claims.environment === "development" && claims.exp * 1000 > Date.now() + 300_000);
      phase = "actual_anonymous_read_only_baseline";
      for (const [endpoint, expected] of [["/api/auth/get-session", 200], ["/api/account/billing", 401]]) {
        const response = await fetch(new URL(endpoint, origin), { headers: { "x-vercel-trusted-oidc-idp-token": token }, redirect: "error", signal: AbortSignal.timeout(30_000) });
        check(response.status === expected && response.headers.get("content-type")?.includes("application/json"));
        const data = await response.json(); if (endpoint.endsWith("get-session")) check(data === null);
        realReads.push({ endpoint, status: response.status, synthetic: false, anonymous: true });
      }
    }
    browser = await chromium.launch({ headless: true, channel: process.env.SAJDA_QA_BROWSER_CHANNEL || "msedge" });
    await runBrowser();
    finalResult = { event: "trading_addon_compiled_browser_pass", origin: origin.origin, expectedCommit,
      sourceCommitVerification: local ? "not-applicable-local-current-working-tree" : "expected SHA supplied by operator; deployment binding verified separately",
      environment: local ? "actual-local-Vite-development-compilation" : "actual-protected-Preview-assets",
      syntheticAccountTransport: true, syntheticBillingTransport: true, syntheticMutationTransport: true,
      realReads, results, layouts, focusReceipts, syntheticPosts: posts, interceptedReadCount: intercepted.filter(row => row.method === "GET").length,
      runtimeExceptions: errors.length, blockedUnexpectedRequests: blocked.length, databaseWrites: 0, providerWrites: 0,
      realCheckoutTransactions: 0, physicalIPhone: "NOT TESTED", VoiceOver: "NOT TESTED", screenshots };
  } catch (error) {
    let ui = null;
    if (page && !page.isClosed()) {
      ui = await page.evaluate(() => ({ path: location.pathname, title: document.querySelector("h1")?.textContent?.trim(),
        dialogs: [...document.querySelectorAll('[role="dialog"]')].map(node => node.textContent?.slice(0, 1400)),
        activeElement: { tag: document.activeElement?.tagName, text: document.activeElement?.textContent?.trim().slice(0, 100) },
        alerts: [...document.querySelectorAll('[role="alert"]')].map(node => node.textContent?.slice(0, 700)) })).catch(() => null);
      await screenshot("failure.png").catch(() => {});
    }
    finalResult = { event: "trading_addon_compiled_browser_failed", phase, failureKind: error?.name ?? "unknown",
      failureSourceLines: [...String(error?.stack ?? "").matchAll(/check-trading-addon-browser-preview\.mjs:\d+:\d+/gu)].slice(0, 3).map(row => row[0]),
      origin: origin?.origin ?? null, realReads, results, layouts, focusReceipts, syntheticPosts: posts, errors, blocked, ui, screenshots, databaseWrites: 0, providerWrites: 0 };
    process.exitCode = 1;
  } finally {
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
    await server?.close().catch(() => {});
    if (finalResult) {
      finalResult.ownedBrowserAndServerClosed = true;
      await writeFile(path.join(artifactPath, "result.json"), JSON.stringify(finalResult, null, 2) + "\n");
      console.info(JSON.stringify({ event: finalResult.event, phase: finalResult.phase ?? "complete", scenariosPassed: results.length, layouts: layouts.length,
        realAnonymousReads: realReads.length, syntheticPosts: posts.length, databaseWrites: 0, providerWrites: 0, resultFile: path.join(artifactPath, "result.json") }));
    }
  }
}
await main();
