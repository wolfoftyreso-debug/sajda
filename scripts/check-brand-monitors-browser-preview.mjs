/** Genuine authenticated browser QA on one explicitly fenced preview.
 * Only a disposable @example.test user is created; no emails, payments or
 * existing accounts are changed. Password/token/cookies stay in memory.
 * Run through node --import tsx, with the exact six arguments used below.
 */
import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { readFile, realpath, mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { parseEnv } from "node:util";
import { Pool } from "pg";
import { hashPassword } from "better-auth/crypto";
import { brandReportResponseSchema, brandReportsListResponseSchema } from "../shared/brand-reports.ts";
import { brandCheckResponseSchema, brandChecksHistoryResponseSchema } from "../shared/brand-checks.ts";
import { brandMonitorsResponseSchema, brandMonitorMutationResponseSchema, brandMonitorAlertSchema, BRAND_MONITOR_METHODOLOGY_VERSION } from "../shared/brand-monitors.ts";
import { brandMonitorsCopy } from "../src/i18n/brandMonitorsCopy.ts";
import { brandIndexCopy } from "../src/i18n/brandIndexCopy.ts";
import { SOCIAL_PLATFORMS } from "../shared/name-packages.ts";

let phase = "configuration", setupAttempted = false, created = false, cleanupVerified = false, cleanupFailed = false;
const check = value => assert.ok(value);
async function main() {
  check(process.env.SAJDA_BRAND_MONITORS_BROWSER_PREVIEW_TEST === "1" && !process.env.VERCEL);
  const keys = ["--preview-env", "--production-env", "--development-env", "--preview-host", "--preview-origin", "--playwright-root"];
  const args = new Map(process.argv.slice(2).map(value => { const index = value.indexOf("="); check(index > 0); return [value.slice(0, index), value.slice(index + 1)]; }));
  check(args.size === 6 && process.argv.slice(2).length === 6 && [...args.keys()].every(key => keys.includes(key)));
  const root = await realpath(path.resolve(".vercel"));
  const env = async (key, expected) => { const file = await realpath(path.resolve(args.get(key) ?? "")); check(file === path.join(root, expected)); return parseEnv(await readFile(file, "utf8")); };
  const preview = await env("--preview-env", ".env.brand-monitors.preview.local"), production = await env("--production-env", ".env.brand-monitors.production.local");
  const development = await env("--development-env", ".env.brand-monitors.development.local");
  const previousPreview = parseEnv(await readFile(path.join(root, ".env.brand-reports.preview.local"), "utf8"));
  check(preview.DATABASE_URL && production.DATABASE_URL && preview.SAJDA_BRAND_REPORTS_ENABLED === "true" && preview.SAJDA_BRAND_CHECKS_ENABLED === "true" && preview.SAJDA_BRAND_MONITORS_ENABLED === "true");
  const database = new URL(preview.DATABASE_URL), productionDatabase = new URL(production.DATABASE_URL);
  check(["postgres:", "postgresql:"].includes(database.protocol) && database.hostname.endsWith(".neon.tech") && database.hostname === args.get("--preview-host"));
  check(previousPreview.DATABASE_URL && new URL(previousPreview.DATABASE_URL).hostname === database.hostname);
  check(`${database.hostname.replace("-pooler.", ".")}${database.pathname}` !== `${productionDatabase.hostname.replace("-pooler.", ".")}${productionDatabase.pathname}`);
  const origin = new URL(args.get("--preview-origin") ?? "");
  check(origin.protocol === "https:" && /^sajda-[a-z0-9]{9}-hypbit\.vercel\.app$/u.test(origin.hostname) && origin.pathname === "/" && !origin.search && !origin.hash && !origin.port && !origin.username && !origin.password);
  const linked = JSON.parse(await readFile(path.join(root, "project.json"), "utf8"));
  check(linked.projectId === "prj_UO900Jp4qJF1eS4hkOrebIzwMVlI" && linked.orgId === "team_GP2MTfBKmxj8ajYLvQtV7clA");
  const token = development.VERCEL_OIDC_TOKEN;
  const claims = JSON.parse(Buffer.from((token ?? "").split(".")[1] ?? "", "base64url").toString("utf8"));
  check(token && claims.project_id === linked.projectId && claims.owner_id === linked.orgId && claims.environment === "development" && Number.isFinite(claims.exp) && claims.exp * 1000 > Date.now() + 300_000);
  const require = createRequire(path.resolve(args.get("--playwright-root") ?? "", "__sajda_brand_monitors_browser_qa.cjs"));
  const { chromium } = require("playwright");
  const browserChannel = process.env.SAJDA_QA_BROWSER_CHANNEL || "msedge";
  database.searchParams.set("sslmode", "verify-full"); database.searchParams.delete("options");
  const pool = new Pool({ connectionString: database.toString(), max: 2, connectionTimeoutMillis: 8_000, query_timeout: 10_000 });
  const owner = randomUUID(), email = `brand-monitor-browser-${owner}@example.test`, password = `Sajda-${randomBytes(28).toString("base64url")}`;
  let browser, transaction, reportId, firstRun, syntheticAlert;
  const measurements = [], runtimeErrors = [], posts = [], blockedWrites = [];
  let blockedExternal = 0, transportFailures = 0, actualLogin = false, declaredAt;
  try {
    phase = "protected_preview_health";
    // The trusted short-lived token is sent only to this exact preview origin.
    const health = await fetch(new URL("/api/health", origin), { headers: { "x-vercel-trusted-oidc-idp-token": token }, redirect: "error", signal: AbortSignal.timeout(30_000) });
    check(health.status === 200 && health.headers.get("content-type")?.includes("application/json"));
    phase = "disposable_auth_setup";
    check((await pool.query("SELECT to_regclass('sajda.brand_check_runs') IS NOT NULL AS ready")).rows[0].ready === true);
    const passwordHash = await hashPassword(password);
    transaction = await pool.connect(); setupAttempted = true; await transaction.query("BEGIN");
    try {
      check((await transaction.query("SELECT id FROM public.sajda_auth_user WHERE id=$1 OR email=$2", [owner, email])).rows.length === 0);
      await transaction.query('INSERT INTO public.sajda_auth_user(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [owner, "Synthetic browser brand-monitor fixture", email]);
      await transaction.query('INSERT INTO public.sajda_auth_account(id,"accountId","providerId","userId",password) VALUES($1,$2,\'credential\',$2,$3)', [randomUUID(), owner, passwordHash]);
      await transaction.query("INSERT INTO sajda.account_entitlements(user_id,capability,grant_source,source_reference,expires_at) VALUES($1,'swipe_undo','operator',$2,statement_timestamp()+interval '2 hours')", [owner, `synthetic-preview-browser-monitor:${owner}`]);
      await transaction.query("COMMIT"); created = true;
    } catch (error) { await transaction.query("ROLLBACK"); throw error; }
    finally { transaction.release(); transaction = undefined; }
    phase = "real_email_password_browser_login";
    browser = await chromium.launch({ headless: true, channel: browserChannel });
    const context = await browser.newContext({ locale: "en-US", viewport: { width: 390, height: 900 }, reducedMotion: "reduce", serviceWorkers: "block" });
    context.setDefaultTimeout(20_000); context.setDefaultNavigationTimeout(45_000);
    await context.route("**/*", async route => {
      const request = route.request(), target = new URL(request.url());
      if (target.origin !== origin.origin) { blockedExternal++; return route.abort("blockedbyclient"); }
      if (!["GET", "HEAD"].includes(request.method())) {
        if (request.method() !== "POST" || !["/api/auth/sign-in/email", "/api/account/brand-reports", "/api/account/brand-checks", "/api/account/brand-monitors"].includes(target.pathname)) {
          blockedWrites.push({ path: target.pathname, method: request.method() }); return route.abort("blockedbyclient");
        }
        posts.push(target.pathname);
      }
      // Fetch the unchanged real server response, never follow a redirect with
      // private headers. route.continue(headers) would forward them on redirects.
      try {
        const response = await route.fetch({ headers: { ...request.headers(), "x-vercel-trusted-oidc-idp-token": token }, maxRedirects: 0, maxRetries: 0, timeout: 60_000 });
        return await route.fulfill({ response });
      } catch {
        // Playwright request errors can include header call logs. Do not allow
        // a route handler rejection to expose credentials through stderr.
        transportFailures++; return route.abort("failed").catch(() => undefined);
      }
    });
    const page = await context.newPage();
    page.on("pageerror", () => runtimeErrors.push("browser_runtime_exception"));
    page.on("dialog", dialog => dialog.dismiss());
    await page.goto(new URL("/auth?next=%2Fbrand-index%2Fassessment&lang=en", origin).toString(), { waitUntil: "domcontentloaded" });
    await page.locator("#email").fill(email); await page.locator("#password").fill(password);
    const signIn = page.waitForResponse(response => new URL(response.url()).pathname === "/api/auth/sign-in/email" && response.request().method() === "POST");
    await page.locator('form button[type="submit"]').click(); check((await signIn).status() === 200);
    await page.waitForURL(url => url.pathname === "/brand-index/assessment");
    await page.locator("[data-brand-account-reports] [data-brand-report-refresh]").waitFor();
    const session = await page.evaluate(async () => { const response = await fetch("/api/auth/get-session", { credentials: "same-origin", cache: "no-store" }); return { status: response.status, value: await response.json() }; });
    check(session.status === 200 && session.value?.user?.id === owner && session.value.user.emailVerified === true); actualLogin = true;
    check((await pool.query('SELECT count(*)::integer AS total FROM public.sajda_auth_session WHERE "userId"=$1', [owner])).rows[0].total >= 1);
    phase = "build_record_and_save_real_ui";
    await page.locator("#brand-index-name").fill("Synthetic Example"); await page.locator("#brand-index-identity").fill("example");
    await page.locator("#brand-index-primary").fill("example.com"); await page.locator("#brand-index-domains").fill("example.co.uk");
    await page.locator('[data-market-preset="us"]').click();
    for (const platform of SOCIAL_PLATFORMS.filter(value => value !== "github")) await page.locator(`[data-brand-platform="${platform}"]`).uncheck();
    await page.getByRole("button", { name: brandIndexCopy.en.build, exact: true }).click();
    await page.locator("[data-brand-index-result]").waitFor();
    check(await page.evaluate(() => document.activeElement?.id === "brand-index-result-title"));
    const target = page.locator('[data-brand-target="domain:example.com"]');
    await target.evaluate(element => { for (let node = element; node; node = node.parentElement) if (node.tagName === "DETAILS") node.open = true; });
    await target.locator("[data-brand-status]").selectOption("reported_owned"); await target.locator("[data-brand-source]").fill("https://example.com/about");
    await target.getByRole("button", { name: brandIndexCopy.en.record, exact: true }).click();
    declaredAt = await target.locator("time").getAttribute("datetime"); check(declaredAt);
    const savedResponse = page.waitForResponse(response => new URL(response.url()).pathname === "/api/account/brand-reports" && response.request().method() === "POST");
    await page.locator("[data-brand-report-save]").click(); const savedHttp = await savedResponse; check(savedHttp.status() === 200);
    const saved = brandReportResponseSchema.parse(await savedHttp.json()); check(saved.accountId === owner && saved.report.version === 1 && saved.report.result.index.verified_score === null);
    reportId = saved.report.id; check(saved.report.assessment.observations[0].reported_at === declaredAt);
    await page.locator("[data-brand-saved-checks]").waitFor();
    const checkButton = page.locator("[data-brand-archived-check-start]"); await checkButton.waitFor();
    await page.waitForFunction(() => !document.querySelector("[data-brand-archived-check-start]")?.disabled);
    phase = "real_saved_registry_check";
    const startedResponse = page.waitForResponse(response => new URL(response.url()).pathname === "/api/account/brand-checks" && response.request().method() === "POST", { timeout: 60_000 });
    await checkButton.click(); const startedHttp = await startedResponse; check(startedHttp.status() === 200);
    const started = brandCheckResponseSchema.parse(await startedHttp.json()); check(started.accountId === owner && started.run.reportId === reportId && started.run.reportVersion === 1 && started.run.status === "completed"); firstRun = started.run;
    const unsupported = firstRun.entries.find(entry => entry.target === "example.co.uk"), supported = firstRun.entries.find(entry => entry.target === "example.com");
    check(unsupported?.state === "unknown" && unsupported.source_url === null && unsupported.observed_at === null);
    check(supported?.state === "checked" && supported.statement === "domain_registered" && supported.source_url === "https://rdap.verisign.com/com/v1/domain/example.com" && supported.observed_at);
    await page.locator('[data-brand-latest-check-status="completed"]').waitFor();
    const verifyDates = async () => {
      check(await page.locator('[data-brand-target="domain:example.com"] time').getAttribute("datetime") === declaredAt);
      const storedTimes = await page.locator('[data-brand-latest-check-status="completed"] time').evaluateAll(nodes => nodes.map(node => node.dateTime));
      check(storedTimes.includes(firstRun.requestedAt) && storedTimes.includes(firstRun.completedAt) && storedTimes.includes(supported.observed_at));
      check(await page.locator('[data-brand-verified-score="unavailable"]').count() === 1);
    };
    await verifyDates();
    phase = "real_daily_monitor_configuration";
    await page.waitForFunction(() => !document.querySelector("[data-brand-monitor-enable]")?.disabled);
    const monitoringCall = async selector => {
      const response = page.waitForResponse(reply => new URL(reply.url()).pathname === "/api/account/brand-monitors" && reply.request().method() === "POST");
      await page.locator(selector).click(); const http = await response; check(http.status() === 200); const receipt = brandMonitorMutationResponseSchema.parse(await http.json());
      check(receipt.accountId === owner && receipt.monitor.reportId === reportId); return receipt;
    };
    const enabled = await monitoringCall("[data-brand-monitor-enable]");
    check(enabled.monitor.status === "active" && enabled.monitor.reportVersion === 1 && enabled.monitor.version === 1);
    await page.locator('[data-brand-monitor-status="active"]').waitFor();
    check(await page.locator("[data-brand-monitor-scheduler-off]").innerText() === brandMonitorsCopy.en.scheduleOff);
    const paused = await monitoringCall("[data-brand-monitor-pause]"); check(paused.monitor.status === "paused" && paused.monitor.version === 2);
    await page.waitForFunction(() => !document.querySelector("[data-brand-monitor-resume]")?.disabled);
    const resumed = await monitoringCall("[data-brand-monitor-resume]"); check(resumed.monitor.status === "active" && resumed.monitor.version === 3);

    phase = "synthetic_alert_render_and_actual_acknowledgment";
    // This is an explicitly synthetic status-change fixture, not evidence that
    // example.com changed registration. Current observation copies the genuine
    // manually retrieved registered signal; its predecessor is test data.
    syntheticAlert = brandMonitorAlertSchema.parse({ id: randomUUID(), reportId, reportVersion: 1, monitorVersion: 3, runId: firstRun.id, target: "example.com",
      kind: "registration_changed", previous: { status: "available", sourceUrl: supported.source_url, observedAt: new Date(Date.parse(supported.observed_at) - 86_400_000).toISOString() },
      current: { status: "registered", sourceUrl: supported.source_url, observedAt: supported.observed_at }, createdAt: new Date().toISOString(),
      acknowledgedAt: null, methodologyVersion: BRAND_MONITOR_METHODOLOGY_VERSION });
    await pool.query("INSERT INTO sajda.brand_monitor_alerts(namespace,owner_id,id,report_id,report_version,monitor_version,run_id,target,previous_observation,current_observation,created_at) VALUES('preview',$1,$2::uuid,$3::uuid,1,3,$4::uuid,$5,$6::jsonb,$7::jsonb,$8::timestamptz)",
      [owner, syntheticAlert.id, reportId, firstRun.id, syntheticAlert.target, JSON.stringify(syntheticAlert.previous), JSON.stringify(syntheticAlert.current), syntheticAlert.createdAt]);
    const alertRefresh = page.waitForResponse(reply => new URL(reply.url()).pathname === "/api/account/brand-monitors" && reply.request().method() === "GET");
    await page.locator("[data-brand-monitor-refresh]").click(); check((await alertRefresh).status() === 200);
    const alertCard = page.locator(`[data-brand-monitor-alert="${syntheticAlert.id}"]`);
    await alertCard.waitFor(); check(await alertCard.getAttribute("data-brand-alert-read") === "false");
    check((await alertCard.locator("time").evaluateAll(nodes => nodes.map(node => node.dateTime))).includes(syntheticAlert.previous.observedAt));
    check((await alertCard.locator("time").evaluateAll(nodes => nodes.map(node => node.dateTime))).includes(syntheticAlert.current.observedAt));
    const acknowledged = await monitoringCall(`[data-brand-alert-ack="${syntheticAlert.id}"]`);
    check(acknowledged.acknowledgedAlert.id === syntheticAlert.id && acknowledged.acknowledgedAlert.acknowledgedAt);
    await page.waitForFunction(id => document.querySelector(`[data-brand-monitor-alert="${id}"]`)?.getAttribute("data-brand-alert-read") === "true", syntheticAlert.id);

    phase = "saved_scope_change_requires_explicit_rebind";
    const secondary = page.locator('[data-brand-target="domain:example.co.uk"]');
    await secondary.evaluate(element => { for (let node = element; node; node = node.parentElement) if (node.tagName === "DETAILS") node.open = true; });
    await secondary.locator("[data-brand-status]").selectOption("reported_conflict");
    await secondary.getByRole("button", { name: brandIndexCopy.en.record, exact: true }).click();
    const updatedResponse = page.waitForResponse(response => new URL(response.url()).pathname === "/api/account/brand-reports" && response.request().method() === "POST");
    await page.locator("[data-brand-report-save]").click(); const updatedHttp = await updatedResponse; check(updatedHttp.status() === 200);
    const updated = brandReportResponseSchema.parse(await updatedHttp.json()); check(updated.report.version === 2 && updated.report.assessment.observations.find(value => value.target_id === "domain:example.com").reported_at === declaredAt);
    await page.locator('[data-brand-monitor-status="paused"]').waitFor();
    check(await page.locator("[data-brand-monitoring]").innerText().then(value => value.includes(brandMonitorsCopy.en.report_changed)));
    await page.waitForFunction(() => !document.querySelector("[data-brand-monitor-rebind]")?.disabled);
    const rebound = await monitoringCall("[data-brand-monitor-rebind]");
    check(rebound.monitor.reportVersion === 2 && rebound.monitor.status === "active" && rebound.monitor.baselineCount === 0);
    await page.locator('[data-brand-monitor-status="active"]').waitFor();

    phase = "refresh_reopen_persistence";
    const writesBeforeReload = posts.length;
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator(`[data-brand-report-open="${reportId}"]`).click();
    await page.locator('[data-brand-monitor-status="active"]').waitFor();
    check(await page.locator('[data-brand-target="domain:example.com"] time').getAttribute("datetime") === declaredAt);
    check(await page.locator(`[data-brand-monitor-alert="${syntheticAlert.id}"]`).getAttribute("data-brand-alert-read") === "true");
    check(posts.length === writesBeforeReload);
    const archived = await page.evaluate(async ({ owner, reportId }) => {
      const response = await fetch(`/api/account/brand-checks?reportId=${reportId}&version=1&offset=0&limit=20`, { headers: { "X-Sajda-Account": owner }, cache: "no-store", credentials: "same-origin" });
      return { status: response.status, value: await response.json() };
    }, { owner, reportId });
    check(archived.status === 200); const history = brandChecksHistoryResponseSchema.parse(archived.value); check(history.accountId === owner && history.total === 1); assert.deepEqual(history.runs[0], firstRun);
    const list = await page.evaluate(async owner => { const response = await fetch("/api/account/brand-reports", { headers: { "X-Sajda-Account": owner }, cache: "no-store", credentials: "same-origin" }); return { status: response.status, value: await response.json() }; }, owner);
    check(list.status === 200 && brandReportsListResponseSchema.parse(list.value).reports[0].version === 2);
    phase = "responsive_keyboard_actual_preview";
    for (const width of [320, 390, 768, 1440]) {
      phase = `responsive_measure_${width}`;
      await page.setViewportSize({ width, height: 900 });
      const measurement = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
        clippedControls: [...document.querySelectorAll("main :is(button,input,select,textarea,summary,h1,h2,h3,h4,h5)")].filter(element => {
          const box = element.getBoundingClientRect(), style = getComputedStyle(element); return box.width > 0 && style.visibility !== "hidden" && (box.right > innerWidth + 1 || box.left < -1);
        }).length }));
      measurements.push(measurement); console.info(JSON.stringify({ event: "brand_monitors_browser_layout_measurement", ...measurement }));
      check(measurement.scrollWidth <= measurement.width && measurement.clippedControls === 0);
      phase = `responsive_keyboard_focus_${width}`;
      await page.waitForFunction(() => { const button = document.querySelector("[data-brand-monitor-refresh]"); return button && !button.disabled; });
      const refresh = page.locator("[data-brand-monitor-refresh]"); await refresh.focus();
      // Programmatic focus after mouse input need not match :focus-visible.
      // Move with the real keyboard before testing its visible focus styling.
      await page.keyboard.press("Tab"); await page.keyboard.press("Shift+Tab");
      check(await refresh.evaluate(element => element === document.activeElement && getComputedStyle(element).outlineStyle !== "none" || element === document.activeElement && getComputedStyle(element).boxShadow !== "none"));
      phase = `responsive_keyboard_activate_${width}`;
      const refreshed = page.waitForResponse(response => new URL(response.url()).pathname === "/api/account/brand-monitors" && response.request().method() === "GET");
      await refresh.press("Enter"); check((await refreshed).status() === 200);
      check(await page.locator(`[data-brand-monitor-alert="${syntheticAlert.id}"]`).getAttribute("data-brand-alert-read") === "true");
    }
    await mkdir(path.join(root, "brand-monitors-browser"), { recursive: true });
    await page.setViewportSize({ width: 390, height: 900 });
    await page.locator("[data-brand-monitoring]").screenshot({ path: path.join(root, "brand-monitors-browser", "daily-monitoring-mobile.png") });
    phase = "database_ui_receipt_agreement";
    const stored = await pool.query("SELECT status,entries,report_version FROM sajda.brand_check_runs WHERE namespace='preview' AND owner_id=$1 AND report_id=$2", [owner, reportId]);
    check(stored.rows.length === 1 && stored.rows[0].status === "completed" && stored.rows[0].report_version === 1); assert.deepEqual(stored.rows[0].entries, firstRun.entries);
    const finalMonitoring = await page.evaluate(async ({ owner, reportId }) => { const response = await fetch(`/api/account/brand-monitors?reportId=${reportId}&alertOffset=0&alertLimit=20`, { headers: { "X-Sajda-Account": owner }, cache: "no-store", credentials: "same-origin" }); return { status: response.status, value: await response.json() }; }, { owner, reportId });
    check(finalMonitoring.status === 200); const finalState = brandMonitorsResponseSchema.parse(finalMonitoring.value);
    check(finalState.monitor.reportVersion === 2 && finalState.monitor.status === "active" && finalState.currentPlan === "premium" && finalState.capacity.limit === 5 && finalState.cronScheduled === false);
    check(finalState.alerts[0].acknowledgedAt && finalState.alerts[0].previous.observedAt === syntheticAlert.previous.observedAt && finalState.alerts[0].current.observedAt === syntheticAlert.current.observedAt);
    const dbMonitor = await pool.query("SELECT report_version,status,version FROM sajda.brand_monitors WHERE namespace='preview' AND owner_id=$1 AND report_id=$2", [owner, reportId]); check(dbMonitor.rows.length === 1 && dbMonitor.rows[0].report_version === 2 && dbMonitor.rows[0].status === "active");
    const dbAlert = await pool.query("SELECT acknowledged_at FROM sajda.brand_monitor_alerts WHERE namespace='preview' AND owner_id=$1 AND id=$2", [owner, syntheticAlert.id]); check(dbAlert.rows[0].acknowledged_at.toISOString() === finalState.alerts[0].acknowledgedAt);
    check(posts.filter(item => item === "/api/account/brand-checks").length === 1 && posts.filter(item => item === "/api/account/brand-reports").length === 2 && posts.filter(item => item === "/api/account/brand-monitors").length === 5 && blockedWrites.length === 0 && runtimeErrors.length === 0 && transportFailures === 0);
    const result = { event: "brand_monitors_authenticated_browser_preview_verified", actualBrowserLogin: true, browser: browserChannel, routeMocks: false, realResponseProtectionProxy: true,
      actualSessionStored: true, realUiSave: true, realUiRegistryCheck: true, supportedObservationChecked: true, unsupportedObservationUnknown: true,
      realUiMonitorEnablePauseResumeRebind: true, syntheticAlertFixture: true, realUiAlertAcknowledgment: true, exactServerPremiumAllowance: 5, previewSchedulerTruthfullyOff: true, scheduledWorkerExecuted: false, noLiveRegistrationChangeClaim: true,
      reloadWithoutNewProviderRequest: true, originalDeclarationDatesPreserved: true, originalProviderDatesPreserved: true, databaseReceiptUiAgreement: true,
      measurements, keyboardActivation: true, focusVisible: true, runtimeExceptions: runtimeErrors.length, blockedExternalRequests: blockedExternal, transportFailures,
      sourceCheckPosts: 1, reportSavePosts: 2, monitoringPosts: 5, ownershipVerified: false, legalClearance: false, continuousMonitoring: false,
      actualIPhone: false, voiceOver: false, emailCalls: 0, paymentCalls: 0, productionWrites: 0 };
    await writeFile(path.join(root, "brand-monitors-browser", "result.json"), JSON.stringify(result, null, 2)); console.info(JSON.stringify(result));
  } finally {
    const testedPhase = phase; phase = "exact_fixture_cleanup";
    await browser?.close().catch(() => undefined);
    try {
      let removedCount = 0;
      if (setupAttempted) {
        // A lost COMMIT acknowledgement is not proof that the fixture was not
        // inserted. Always reconcile this exact allocated identity, never others.
        const removed = await pool.query("DELETE FROM public.sajda_auth_user WHERE id=$1 AND email=$2 RETURNING id", [owner, email]);
        removedCount = removed.rows.length; check(removedCount <= 1 && (!created || removedCount === 1));
        for (const scope of ["brand-reports", "brand-checks", "brand-monitors", "account-membership"]) {
          const hash = createHash("sha256").update(`${scope}:preview:${owner}`).digest("hex");
          await pool.query("DELETE FROM sajda.function_rate_limits WHERE scope=$1 AND subject_hash=$2", [scope, hash]);
          check((await pool.query("SELECT count(*)::integer AS total FROM sajda.function_rate_limits WHERE scope=$1 AND subject_hash=$2", [scope, hash])).rows[0].total === 0);
        }
        check((await pool.query("SELECT count(*)::integer AS total FROM public.sajda_auth_user WHERE id=$1 OR email=$2", [owner, email])).rows[0].total === 0);
        for (const table of ["sajda_auth_account", "sajda_auth_session"]) check((await pool.query(`SELECT count(*)::integer AS total FROM public.${table} WHERE "userId"=$1`, [owner])).rows[0].total === 0);
        for (const table of ["brand_reports", "brand_report_versions", "brand_report_requests", "brand_check_runs", "brand_monitors", "brand_monitor_alerts", "brand_monitor_requests"]) check((await pool.query(`SELECT count(*)::integer AS total FROM sajda.${table} WHERE owner_id=$1`, [owner])).rows[0].total === 0);
      }
      if (setupAttempted) check((await pool.query("SELECT count(*)::integer AS total FROM sajda.account_entitlements WHERE user_id=$1", [owner])).rows[0].total === 0);
      cleanupVerified = true; phase = testedPhase;
      console.info(JSON.stringify({ event: "brand_monitors_browser_preview_cleanup_verified", retiredFixtures: removedCount, remainingFixtures: 0, accountScopedRatesRemaining: 0, sharedIpAuthRateLimitsModified: false, actualLoginTested: actualLogin }));
    } catch { cleanupFailed = true; }
    finally { await pool.end().catch(() => { cleanupFailed = true; }); }
  }
  if (cleanupFailed) throw new Error("Synthetic fixture cleanup unconfirmed");
}
main().catch(() => { console.error(JSON.stringify({ event: "brand_monitors_authenticated_browser_preview_failed", phase,
  cleanupRequired: setupAttempted, cleanupConfirmed: !setupAttempted || cleanupVerified && !cleanupFailed, rawPrivateDetailsSuppressed: true })); process.exitCode = 1; });
