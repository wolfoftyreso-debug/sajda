/**
 * Opt-in compiled Preview UI → private API → isolated Neon → reload/recheck.
 * Two new synthetic owners only; local SDK mail is captured, never delivered.
 * At most two explicit two-domain public checks. No AI, payment or social calls.
 * Credentials/OIDC stay in memory, never argv, traces, screenshots or receipts.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify, parseEnv } from "node:util";
import { readFile, realpath, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, request as playwrightRequest } from "playwright";
import { createAccountAuth, createAccountPool } from "../api/_shared/account-server.ts";
import { authLifecycleConfiguration } from "./auth-lifecycle-policy.mjs";
import { workspaceSearchAllowed, workspaceRegistryEvidence, workspaceProjectSaveBody } from "./name-workspace-policy.mjs";
import { cleanupNameWorkspaceFixtures } from "./name-workspace-cleanup.mjs";
import { renewalDatabaseTarget as reviewedDatabaseTarget } from "./stripe-renewal-policy.mjs";
import { nameProjectSchema, nameProjectInputSchema } from "../shared/name-projects.ts";

class WorkspaceProbeError extends Error {}
const check = (condition, code) => { if (!condition) throw new WorkspaceProbeError(code); };
const runId = randomUUID(), label = `sajdaqa${randomBytes(6).toString("hex")}`;
const emails = ["a", "b"].map(suffix => `name-workspace-${runId}-${suffix}@example.test`);
const password = randomBytes(32).toString("base64url"), localOrigin = "http://127.0.0.1:8097";
const testIp = `2001:db8:${randomBytes(2).toString("hex")}:${randomBytes(2).toString("hex")}::1`;
const args = new Map(), argumentKeys = ["--preview-env", "--production-env", "--development-env", "--preview-host", "--preview-origin", "--expected-commit"];
const writePaths = new Set(["/api/auth/sign-in/email", "/api/account/name-projects", "/api/domain-search"]);
const activeRoutes = new Set(), checks = [], checkpoints = [], users = [], runtimeErrors = [], violations = [];
let browser, api, pool, protectedOrigin, protectionToken, phase = "configuration", setupAttempted = false;
let closing = false, transportFailures = 0, cleanupVerified = false, searches = 0, browserProjectWrites = 0, captured = [], failure, result;
let reconcileTarget;

async function main() {
  check(process.env.SAJDA_NAME_WORKSPACE_PREVIEW_TEST === "1" && !process.env.VERCEL && process.env.VERCEL_ENV !== "production", "explicit_local_preview_opt_in_required");
  for (const argument of process.argv.slice(2)) {
    const separator = argument.indexOf("="); check(separator > 0, "invalid_argument");
    const key = argument.slice(0, separator); check(argumentKeys.includes(key) && !args.has(key), "unknown_or_duplicate_argument");
    args.set(key, argument.slice(separator + 1));
  }
  check(args.size === argumentKeys.length, "missing_argument");
  const privateRoot = await realpath(path.resolve(".vercel"));
  const environment = async (key, name) => {
    const file = await realpath(path.resolve(args.get(key))); check(file === path.join(privateRoot, name), "private_environment_path_mismatch");
    return parseEnv(await readFile(file, "utf8"));
  };
  const preview = await environment("--preview-env", ".env.auth-lifecycle.preview.local");
  const production = await environment("--production-env", ".env.auth-lifecycle.production.local");
  const development = await environment("--development-env", ".env.auth-lifecycle.development.local");
  const linkedProject = JSON.parse(await readFile(path.join(privateRoot, "project.json"), "utf8"));
  const reviewedTarget = async () => {
    const manifest = async name => {
      const file = await realpath(path.join(privateRoot, name)); check(file === path.join(privateRoot, name), "private_manifest_path_mismatch");
      return JSON.parse(await readFile(file, "utf8"));
    };
    return { preview: await environment("--preview-env", ".env.auth-lifecycle.preview.local"),
      production: await environment("--production-env", ".env.auth-lifecycle.production.local"), freshPreview: preview, linkedProject,
      previewManifest: await manifest("migration-target.preview.json"), productionManifest: await manifest("migration-target.production.json") };
  };
  const pinned = reviewedDatabaseTarget(await reviewedTarget());
  reconcileTarget = async () => { reviewedDatabaseTarget({ ...await reviewedTarget(), expectedFingerprint: pinned.fingerprint }); };
  const actualCommit = (await promisify(execFile)("git", ["rev-parse", "HEAD"], { windowsHide: true })).stdout.trim();
  check(!(await promisify(execFile)("git", ["status", "--porcelain"], { windowsHide: true })).stdout.trim(), "clean_source_tree_required");
  const configuration = authLifecycleConfiguration({ preview, production, development, linkedProject,
    origin: args.get("--preview-origin"), expectedHost: args.get("--preview-host"), expectedCommit: args.get("--expected-commit"), actualCommit });
  // build-vercel derives the client flag from this server flag + real auth.
  // The browser must separately prove the deployed Save action is present.
  check(preview.SAJDA_NAME_PROJECTS_ENABLED === "true", "preview_workspace_flag_required");
  protectedOrigin = configuration.origin; protectionToken = configuration.protectionToken;
  pool = createAccountPool(configuration.database); api = await playwrightRequest.newContext({ timeout: 35_000, ignoreHTTPSErrors: false });
  check((await remote(api, "/api/health")).status === 200, "preview_health_failed");
  check((await remote(api, "/api/account/name-projects")).status === 401, "anonymous_project_access_not_denied");
  check((await pool.query("SELECT current_schema() AS schema")).rows[0].schema === "public", "unexpected_database_schema");
  check((await pool.query("SELECT count(*)::integer AS count FROM public.sajda_auth_user WHERE email=ANY($1::text[])", [emails])).rows[0].count === 0, "fixture_collision");

  phase = "local_real_sdk_fixture_signup_verification";
  const auth = createAccountAuth({ origin: localOrigin, secret: randomBytes(48).toString("base64url"), pool, environment: {},
    sendEmail: async message => { check(emails.includes(message.to) && message.kind === "verify", "unexpected_email"); captured.push(message); } });
  const local = (route, body) => auth.handler(new Request(new URL(route, localOrigin), { method: body === undefined ? "GET" : "POST",
    headers: { origin: localOrigin, "content-type": "application/json", "x-vercel-forwarded-for": testIp },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) }));
  for (const email of emails) {
    setupAttempted = true;
    check((await local("/api/auth/sign-up/email", { email, password, name: "Disposable name workspace QA", callbackURL: `${localOrigin}/auth` })).status === 200, "fixture_signup_failed");
    const allocated = (await pool.query('SELECT id,"emailVerified" FROM public.sajda_auth_user WHERE email=$1', [email])).rows;
    check(allocated.length === 1 && typeof allocated[0].id === "string" && allocated[0].emailVerified === false, "fixture_signup_not_stored");
    users.push({ id: allocated[0].id, email });
    const message = captured.find(value => value.to === email); check(message, "verification_callback_missing");
    const link = new URL(message.url); check(link.origin === localOrigin && link.pathname === "/api/auth/verify-email", "verification_link_invalid");
    check((await local(link.pathname + link.search)).status === 302, "signed_verification_failed");
  }
  checks.push("local_real_sdk_verified_fixture_accounts_no_email_delivery");
  browser = await chromium.launch({ headless: true, channel: process.env.SAJDA_QA_BROWSER_CHANNEL || "msedge" });
  const contextA = await context(), contextB = await context(), pageA = await contextA.newPage(), pageB = await contextB.newPage();
  const ownerA = users[0].id, ownerB = users[1].id;
  phase = "compiled_login_exact_package_search";
  await login(pageA, emails[0], "/name-packages");
  await pageA.locator("#package-theme").waitFor();
  await pageA.getByRole("button", { name: "Check a name", exact: true }).first().click();
  await pageA.locator("#package-theme").fill(label);
  const observations = await exactSearch(pageA);
  checks.push("compiled_exact_package_search_actual_registry_response_with_evidence");

  phase = "compiled_brand_package_save_and_neon";
  const article = pageA.locator('article').filter({ has: pageA.getByRole("heading", { name: label, exact: true }) }).first();
  await article.getByRole("button", { name: "Save brand package", exact: true }).click();
  const dialog = pageA.getByRole("dialog"); await dialog.getByLabel("Project name", { exact: true }).fill("Disposable name workspace QA");
  const saveResponse = pageA.waitForResponse(response => new URL(response.url()).pathname === "/api/account/name-projects" && response.request().method() === "POST");
  await dialog.getByRole("button", { name: "Save brand package", exact: true }).click();
  const save = await saveResponse; check(save.status() === 200, "compiled_package_save_failed");
  const snapshot = await save.json(); check(snapshot.accountId === ownerA && snapshot.projects?.length === 1, "owner_snapshot_invalid");
  const project = nameProjectSchema.parse(snapshot.projects[0]);
  check(project.version === 1 && project.brandShortlist?.length === 1 && project.brandShortlist[0].label === label
    && project.brandShortlist[0].source === "user_supplied" && project.brandShortlist[0].requiredTlds.join(",") === "com,ai", "saved_configuration_invalid");
  const persisted = (await pool.query("SELECT version,payload FROM sajda.name_projects WHERE namespace='preview' AND owner_id=$1 AND id=$2", [ownerA, project.id])).rows;
  check(persisted.length === 1 && persisted[0].version === 1
    && JSON.stringify(nameProjectInputSchema.shape.brandShortlist.parse(persisted[0].payload.brandShortlist)) === JSON.stringify(project.brandShortlist), "actual_neon_save_mismatch");
  check(!JSON.stringify(persisted[0].payload).includes("availabilityVerified") && !JSON.stringify(persisted[0].payload).includes("packageScore"), "configuration_promoted_to_saved_evidence");
  await dialog.getByText("Brand package saved", { exact: true }).waitFor();
  await dialog.getByRole("link", { name: "Open project", exact: true }).click(); await pageA.waitForURL(url => url.pathname === "/projects");
  await pageA.reload({ waitUntil: "domcontentloaded" }); await pageA.getByRole("link", { name: "Open and recheck", exact: true }).waitFor();
  check(await pageA.locator("#project-title").inputValue() === project.title, "reload_lost_project");
  checks.push("compiled_ui_save_actual_private_api_neon_reload_configuration_not_fresh_evidence");

  phase = "idempotency_conflict_and_owner_isolation";
  const brief = Object.fromEntries(Object.entries(project).filter(([key]) => !["version", "createdAt", "updatedAt"].includes(key)));
  const input = nameProjectInputSchema.parse({ ...brief, expectedVersion: 0 });
  const repeated = await remote(contextA.request, "/api/account/name-projects", { method: "POST", owner: ownerA, body: workspaceProjectSaveBody(input) });
  check(repeated.status === 200 && repeated.body.projects?.length === 1 && repeated.body.projects[0].version === 1, "duplicate_save_not_idempotent");
  const conflict = await remote(contextA.request, "/api/account/name-projects", { method: "POST", owner: ownerA, body: workspaceProjectSaveBody({ ...input, title: "Stale edit must not overwrite" }) });
  check(conflict.status === 409 && conflict.body.code === "project_conflict", "stale_edit_not_denied");
  await login(pageB, emails[1], "/projects");
  const isolated = await remote(contextB.request, "/api/account/name-projects", { owner: ownerB });
  check(isolated.status === 200 && isolated.body.accountId === ownerB && isolated.body.projects?.length === 0, "cross_owner_exposure");
  check((await remote(contextA.request, "/api/account/name-projects", { owner: ownerB })).status === 409, "stale_owner_header_not_rejected");
  check((await pool.query("SELECT version,payload->>'title' AS title FROM sajda.name_projects WHERE namespace='preview' AND owner_id=$1 AND id=$2", [ownerA, project.id])).rows[0].title === project.title, "conflict_modified_project");
  checks.push("real_project_duplicate_retry_stale_edit_rejection_and_two_owner_isolation");

  phase = "compiled_reopen_explicit_recheck";
  await pageA.getByRole("link", { name: "Open and recheck", exact: true }).click(); await pageA.waitForURL(url => url.pathname === "/name-packages");
  check(await pageA.locator("#package-theme").inputValue() === label && searches === 1, "reopen_did_not_preserve_explicit_configuration");
  check(!new URL(pageA.url()).search.includes(label), "private_configuration_leaked_to_url");
  await exactSearch(pageA); check(searches === 2, "explicit_recheck_not_executed");
  checks.push("compiled_reopen_prefills_private_saved_configuration_no_auto_check_explicit_recheck_preserves_observation_dates");
  result = { event: "name_workspace_preview_verified", runId, origin: protectedOrigin, expectedCommit: args.get("--expected-commit"), checks,
    registryObservations: observations, publicExactSearchRequests: searches, maximumRequestedDomainObservations: 4,
    routeMocks: false, realResponseProtectionProxy: true, actualBrowserLogin: true, actualNeonPersistence: true,
    localSdkSignupVerification: true, deployedSignup: false, providerEmailsSent: 0, paymentCalls: 0, aiCalls: 0, socialCalls: 0,
    productionWrites: 0, existingUserChanges: 0, actualIPhone: false, voiceOver: false, deploymentCommitMustBeVerifiedSeparately: true };
}

async function login(page, email, destination) {
  await page.goto(`${protectedOrigin}/auth?next=${encodeURIComponent(destination)}&lang=en`, { waitUntil: "domcontentloaded" });
  await page.locator("#email").fill(email); await page.locator("#password").fill(password);
  const reply = page.waitForResponse(response => new URL(response.url()).pathname === "/api/auth/sign-in/email" && response.request().method() === "POST");
  await page.locator('form button[type="submit"]').click(); check((await reply).status() === 200, "compiled_login_failed");
  await page.waitForURL(url => url.pathname === destination);
}
async function exactSearch(page) {
  const reply = page.waitForResponse(response => new URL(response.url()).pathname === "/api/domain-search" && response.request().method() === "POST", { timeout: 70_000 });
  await page.locator('#package-search-form button[type="submit"]').click(); const response = await reply;
  checkpoints.push({ phase, path: "/api/domain-search", method: "POST", status: response.status() });
  check(response.status() === 200, "actual_exact_search_failed"); const payload = await response.json();
  const evidence = workspaceRegistryEvidence(payload, label);
  check(evidence, "exact_pair_with_fresh_registry_evidence_required");
  await page.locator("#package-results-title").waitFor(); await page.locator("[data-candidate-brand-index]").first().waitFor();
  return evidence;
}
async function remote(client, route, options = {}) {
  check(["/api/health", "/api/account/name-projects"].includes(route), "remote_path_not_allowed");
  const method = options.method ?? "GET"; check(method === "GET" || method === "POST" && route === "/api/account/name-projects", "remote_method_not_allowed");
  let response; try { response = await client.fetch(new URL(route, protectedOrigin).toString(), { method, maxRedirects: 0, maxRetries: 0,
    headers: { "x-vercel-trusted-oidc-idp-token": protectionToken, origin: protectedOrigin, ...(options.owner ? { "x-sajda-account": options.owner } : {}) },
    ...(options.body === undefined ? {} : { data: options.body }), timeout: 35_000 }); } catch { throw new Error("private_transport_failed"); }
  const status = response.status(); checkpoints.push({ phase, path: route, method, status });
  let body; try { body = await response.json(); } catch { throw new Error("unexpected_remote_response"); } return { status, body };
}
async function context() {
  const value = await browser.newContext({ locale: "en-US", viewport: { width: 390, height: 900 }, reducedMotion: "reduce", serviceWorkers: "block" });
  value.setDefaultTimeout(25_000); value.setDefaultNavigationTimeout(45_000);
  value.on("page", page => page.on("pageerror", () => runtimeErrors.push("browser_runtime_exception")));
  await value.route("**/*", route => {
    const task = (async () => {
      try {
        const request = route.request(), target = new URL(request.url());
        if (target.origin !== protectedOrigin) { violations.push("external_browser_request"); return await route.abort("blockedbyclient"); }
        if (!["GET", "HEAD"].includes(request.method())) {
          if (request.method() !== "POST" || !writePaths.has(target.pathname)) { violations.push("unexpected_write"); return await route.abort("blockedbyclient"); }
          if (target.pathname === "/api/domain-search") {
            if (!workspaceSearchAllowed(request.postDataJSON(), label, searches)) { violations.push("search_spend_fence"); return await route.abort("blockedbyclient"); }
            searches++;
          }
          if (target.pathname === "/api/account/name-projects" && browserProjectWrites++ >= 1) {
            violations.push("unexpected_repeated_project_write"); return await route.abort("blockedbyclient");
          }
        }
        const response = await route.fetch({ headers: { ...request.headers(), "x-vercel-trusted-oidc-idp-token": protectionToken }, maxRedirects: 0, maxRetries: 0, timeout: 70_000 });
        await route.fulfill({ response });
      } catch { if (!closing) transportFailures++; await route.abort("failed").catch(() => undefined); }
    })(); activeRoutes.add(task); task.finally(() => activeRoutes.delete(task)); return task;
  }); return value;
}

try { await main(); }
catch (error) { failure = { event: "name_workspace_preview_failed", runId, phase, checkpoints,
  ...(error instanceof WorkspaceProbeError ? { code: error.message } : {}), rawPrivateDetailsSuppressed: true }; process.exitCode = 1; }
finally {
  closing = true;
  await browser?.close().catch(() => { transportFailures++; }); await api?.dispose().catch(() => { transportFailures++; });
  let timer; await Promise.race([Promise.allSettled([...activeRoutes]), new Promise(resolve => { timer = setTimeout(() => { transportFailures++; resolve(); }, 20_000); })]); clearTimeout(timer);
  if (activeRoutes.size > 0) transportFailures++;
  if (pool) {
    try {
      if (setupAttempted) {
        await reconcileTarget();
        await cleanupNameWorkspaceFixtures(pool, { runId, users, testIp });
      }
      cleanupVerified = true;
    } catch { failure = { ...(failure ?? { event: "name_workspace_preview_failed", runId, phase: "fixture_cleanup" }), cleanupUnconfirmed: true, rawPrivateDetailsSuppressed: true }; process.exitCode = 1; }
    await pool.end().catch(() => { cleanupVerified = false; process.exitCode = 1; });
  }
  captured = []; protectionToken = undefined;
}
if (!failure && cleanupVerified && transportFailures === 0 && activeRoutes.size === 0 && !runtimeErrors.length && !violations.length) {
  const receipt = { ...result, cleanupVerified: true, remainingFixtures: 0, runtimeExceptions: 0, unexpectedWrites: 0, transportFailures: 0,
    activeRoutesAfterClose: 0, sharedIpAuthRateLimitsModified: false };
  const output = path.resolve(".vercel/name-workspace-preview"); await mkdir(output, { recursive: true });
  await writeFile(path.join(output, "result.json"), JSON.stringify(receipt, null, 2)); console.info(JSON.stringify(receipt));
} else { console.error(JSON.stringify({ ...(failure ?? { event: "name_workspace_preview_failed", runId, phase: "teardown" }), cleanupVerified, setupAttempted, transportFailures, violations, runtimeErrors })); process.exitCode = 1; }
