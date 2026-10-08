/**
 * Opt-in real account lifecycle on ONE protected Sajda Preview + isolated Neon.
 * Local Better Auth signup/verification/reset callbacks capture mail in memory;
 * deployed login, session renewal/revocation, saved work and logout use real routes.
 * No provider email, live payment, production write or existing-user change.
 * Credentials/cookies/OIDC never enter child argv, traces, screenshots or receipts.
 */
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, realpath, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseEnv } from "node:util";
import { chromium, request as playwrightRequest } from "playwright";
import { createAccountAuth, createAccountPool } from "../api/_shared/account-server.ts";
import { authLifecycleConfiguration } from "./auth-lifecycle-policy.mjs";

const check = (value, code) => { if (!value) throw new Error(code); };
let phase = "configuration", setupAttempted = false, cleanupVerified = false;
const checks = [], checkpoints = [], forbiddenWrites = [], runtimeErrors = [];
let browser, pool, rawApi, createdUsers = [], verificationIdentifiers = [], captured = [], result, failure;
const activeRoutes = new Set(); let closing = false;
const runId = randomUUID(), localOrigin = "http://127.0.0.1:8097";
const emails = ["a", "b"].map(suffix => `auth-lifecycle-${runId}-${suffix}@example.test`);
const password = randomBytes(32).toString("base64url"), nextPassword = randomBytes(32).toString("base64url");
const domain = `auth-lifecycle-${runId}.test`;
const testIp = `2001:db8:${randomBytes(2).toString("hex")}:${randomBytes(2).toString("hex")}::1`;
const args = new Map(), allowedKeys = ["--preview-env", "--production-env", "--development-env", "--preview-host", "--preview-origin", "--expected-commit"];
const writePaths = new Set(["/api/auth/sign-in/email", "/api/auth/sign-out", "/api/auth/reset-password", "/api/account/saved-domains"]);
let transportFailures = 0, protectedOrigin, protectionToken, responseStatuses = {}, posts = [], measurements = [];

async function main() {
  check(process.env.SAJDA_AUTH_LIFECYCLE_PREVIEW_TEST === "1" && !process.env.VERCEL && process.env.VERCEL_ENV !== "production", "explicit_local_preview_opt_in_required");
  for (const argument of process.argv.slice(2)) {
    const split = argument.indexOf("="); check(split > 0, "invalid_argument");
    const key = argument.slice(0, split); check(allowedKeys.includes(key) && !args.has(key), "unknown_or_duplicate_argument"); args.set(key, argument.slice(split + 1));
  }
  check(args.size === allowedKeys.length, "missing_argument");
  const privateRoot = await realpath(path.resolve(".vercel"));
  const privateEnv = async (key, name) => {
    const file = await realpath(path.resolve(args.get(key))); check(file === path.join(privateRoot, name), "private_environment_path_mismatch");
    return parseEnv(await readFile(file, "utf8"));
  };
  const preview = await privateEnv("--preview-env", ".env.auth-lifecycle.preview.local");
  const production = await privateEnv("--production-env", ".env.auth-lifecycle.production.local");
  const development = await privateEnv("--development-env", ".env.auth-lifecycle.development.local");
  const linkedProject = JSON.parse(await readFile(path.join(privateRoot, "project.json"), "utf8"));
  const actualCommit = (await promisify(execFile)("git", ["rev-parse", "HEAD"], { windowsHide: true })).stdout.trim();
  const configuration = authLifecycleConfiguration({ preview, production, development, linkedProject,
    origin: args.get("--preview-origin"), expectedHost: args.get("--preview-host"), expectedCommit: args.get("--expected-commit"), actualCommit });
  protectedOrigin = configuration.origin; protectionToken = configuration.protectionToken;
  pool = createAccountPool(configuration.database);
  rawApi = await playwrightRequest.newContext({ timeout: 35_000, ignoreHTTPSErrors: false });
  const health = await remote(rawApi, "/api/health");
  check(health.status === 200, "protected_preview_health_failed"); checks.push("actual_protected_preview_health");
  check((await pool.query("SELECT current_schema() AS schema")).rows[0].schema === "public", "unexpected_database_schema");
  check((await pool.query("SELECT count(*)::integer AS count FROM public.sajda_auth_user WHERE email=ANY($1::text[])", [emails])).rows[0].count === 0, "fixture_collision");

  phase = "local_real_sdk_signup_and_verification";
  const localAuth = createAccountAuth({ origin: localOrigin, secret: randomBytes(48).toString("base64url"), pool, environment: {},
    sendEmail: async message => { check(emails.includes(message.to) && ["verify", "reset"].includes(message.kind), "unexpected_test_mail_recipient"); captured.push(message); } });
  const local = (route, method = "GET", body) => localAuth.handler(new Request(new URL(route, localOrigin), {
    method, headers: { origin: localOrigin, "content-type": "application/json", "x-vercel-forwarded-for": testIp },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }));
  for (const email of emails) {
    setupAttempted = true;
    const signup = await local("/api/auth/sign-up/email", "POST", { email, password, name: "Disposable auth lifecycle QA", callbackURL: `${localOrigin}/auth` });
    check(signup.status === 200, "local_sdk_signup_failed");
    const rows = (await pool.query('SELECT id,"emailVerified" FROM public.sajda_auth_user WHERE email=$1', [email])).rows;
    check(rows.length === 1 && rows[0].emailVerified === false && typeof rows[0].id === "string", "unverified_signup_not_stored");
    const id = rows[0].id; createdUsers.push({ id, email });
    const message = captured.find(value => value.kind === "verify" && value.to === email);
    check(message, "local_verification_callback_missing");
    const verify = new URL(message.url); check(verify.origin === localOrigin && verify.pathname === "/api/auth/verify-email", "local_verify_link_mismatch");
    const verified = await local(verify.pathname + verify.search); check(verified.status === 302, "local_signed_verification_failed");
    check((await pool.query('SELECT "emailVerified" FROM public.sajda_auth_user WHERE id=$1 AND email=$2', [id, email])).rows[0]?.emailVerified === true, "verified_owner_not_stored");
  }
  check((await pool.query('SELECT count(*)::integer AS count FROM public.sajda_auth_session WHERE "userId"=ANY($1::text[])', [createdUsers.map(value => value.id)])).rows[0].count === 0, "signup_must_not_grant_session");
  checks.push("local_real_sdk_signup_unverified_then_signed_verify_without_auto_session");

  phase = "compiled_auth_responsiveness_and_deployed_login";
  browser = await chromium.launch({ headless: true, channel: process.env.SAJDA_QA_BROWSER_CHANNEL || "msedge" });
  const contextA = await context(), contextB = await context();
  const pageA = await contextA.newPage(), pageB = await contextB.newPage();
  await pageA.goto(`${protectedOrigin}/auth?next=%2Faccount%23trading&lang=en`, { waitUntil: "domcontentloaded" });
  for (const width of [320, 390, 768, 1440]) {
    await pageA.setViewportSize({ width, height: 900 });
    await pageA.locator("#email").waitFor();
    const measurement = await pageA.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth,
      inputs: [...document.querySelectorAll('input[id="email"],input[id="password"]')].map(node => ({ id: node.id, label: !!document.querySelector(`label[for="${node.id}"]`), width: node.getBoundingClientRect().width })) }));
    check(measurement.scroll <= width + 1 && measurement.inputs.length === 2 && measurement.inputs.every(value => value.label && value.width >= 100), "compiled_auth_layout_failed"); measurements.push(measurement);
  }
  await pageA.setViewportSize({ width: 390, height: 900 });
  await login(pageA, emails[0], password, "/account", "#trading");
  const ownerA = createdUsers[0].id, ownerB = createdUsers[1].id;
  const sessionA = await remote(contextA.request, "/api/auth/get-session"); assertSession(sessionA, ownerA);
  check(!("token" in sessionA.body) && !("token" in sessionA.body.session) && !("ipAddress" in sessionA.body.session) && !("userAgent" in sessionA.body.session), "session_credentials_exposed");
  const cookieA = await sessionCookie(contextA);
  check(cookieA.secure && cookieA.httpOnly && cookieA.sameSite === "Lax" && cookieA.path === "/" && cookieA.domain === new URL(protectedOrigin).hostname, "cookie_security_contract_failed");
  checks.push("compiled_ui_deployed_email_password_login_safe_return_same_account_cookie_session");
  const saved = await remote(contextA.request, "/api/account/saved-domains", { method: "POST", body: { domain }, owner: ownerA });
  check(saved.status === 200, "deployed_saved_domain_failed");
  const duplicated = await remote(contextA.request, "/api/account/saved-domains", { method: "POST", body: { domain }, owner: ownerA });
  check(duplicated.status === 200, "duplicate_saved_domain_failed");
  await pageA.reload({ waitUntil: "domcontentloaded" });
  const retained = await remote(contextA.request, "/api/account/saved-domains", { owner: ownerA });
  check(retained.status === 200 && retained.body.items?.filter(value => value.domain === domain).length === 1, "saved_work_reload_not_retained");
  await pageB.goto(`${protectedOrigin}/auth?next=%2Faccount&lang=en`, { waitUntil: "domcontentloaded" });
  await login(pageB, emails[1], password, "/account");
  const isolated = await remote(contextB.request, "/api/account/saved-domains", { owner: ownerB });
  check(isolated.status === 200 && isolated.body.items?.length === 0, "cross_owner_saved_work_exposed");
  const stale = await remote(contextA.request, "/api/account/saved-domains", { owner: ownerB });
  check(stale.status === 409 && stale.body.code === "account_changed", "stale_owner_not_rejected");
  checks.push("real_saved_work_idempotent_reload_and_cross_owner_isolation");

  phase = "deployed_read_and_session_renewal";
  await pool.query('UPDATE public.sajda_auth_session SET "expiresAt"=statement_timestamp()+interval \'5 days\' WHERE id=$1 AND "userId"=$2', [sessionA.body.session.id, ownerA]);
  const aged = (await pool.query('SELECT "expiresAt" FROM public.sajda_auth_session WHERE id=$1 AND "userId"=$2', [sessionA.body.session.id, ownerA])).rows[0].expiresAt;
  check((await remote(contextA.request, "/api/account/saved-domains", { owner: ownerA })).status === 200, "aged_session_account_read_failed");
  check((await pool.query('SELECT "expiresAt" FROM public.sajda_auth_session WHERE id=$1 AND "userId"=$2', [sessionA.body.session.id, ownerA])).rows[0].expiresAt.getTime() === aged.getTime(), "protected_read_extended_session");
  const renewed = await remote(contextA.request, "/api/auth/get-session"); assertSession(renewed, ownerA);
  check(Date.parse(renewed.body.session.expiresAt) > aged.getTime() + 24 * 60 * 60 * 1000, "session_not_renewed");
  checks.push("account_authorization_does_not_extend_session_explicit_session_read_renews");

  phase = "deployed_logout_and_returning_account";
  const loggedOut = pageA.waitForResponse(response => new URL(response.url()).pathname === "/api/auth/sign-out" && response.request().method() === "POST");
  await pageA.getByRole("button", { name: "Sign out", exact: true }).click(); check((await loggedOut).status() === 200, "compiled_ui_logout_failed");
  await pageA.waitForURL(url => url.pathname === "/");
  const replay = await remote(rawApi, "/api/account/saved-domains", { owner: ownerA, cookie: `${cookieA.name}=${cookieA.value}` });
  check(replay.status === 401, "logged_out_cookie_replayed");
  check((await remote(contextA.request, "/api/auth/get-session")).body === null, "logout_session_remains");
  await pageA.goto(`${protectedOrigin}/auth?next=%2Faccount&lang=en`, { waitUntil: "domcontentloaded" });
  await login(pageA, emails[0], password, "/account");
  const returned = await remote(contextA.request, "/api/account/saved-domains", { owner: ownerA });
  check(returned.status === 200 && returned.body.items?.some(value => value.domain === domain), "returning_account_lost_saved_work");
  checks.push("compiled_ui_logout_cookie_replay_denied_real_return_login_retained_work");

  phase = "captured_local_reset_deployed_password_change";
  const beforeReset = await sessionCookie(contextA);
  const resetRequested = await local("/api/auth/request-password-reset", "POST", { email: emails[0], redirectTo: `${localOrigin}/auth?mode=update-password` });
  check(resetRequested.status === 200, "local_reset_request_failed");
  const resetMessage = captured.findLast(value => value.kind === "reset" && value.to === emails[0]); check(resetMessage, "local_reset_callback_missing");
  const resetUrl = new URL(resetMessage.url), resetToken = resetUrl.pathname.split("/").at(-1);
  check(resetUrl.origin === localOrigin && /^\/api\/auth\/reset-password\/[A-Za-z0-9_-]+$/u.test(resetUrl.pathname) && resetToken, "local_reset_link_mismatch");
  verificationIdentifiers.push(`reset-password:${resetToken}`);
  check((await remote(rawApi, "/api/auth/reset-password", { method: "POST", body: { token: resetToken, newPassword: nextPassword } })).status === 200, "deployed_reset_failed");
  check((await remote(rawApi, "/api/auth/reset-password", { method: "POST", body: { token: resetToken, newPassword: nextPassword } })).status === 400, "deployed_reset_replay_not_rejected");
  check((await remote(rawApi, "/api/account/saved-domains", { owner: ownerA, cookie: `${beforeReset.name}=${beforeReset.value}` })).status === 401, "reset_did_not_revoke_session");
  check((await remote(rawApi, "/api/auth/sign-in/email", { method: "POST", body: { email: emails[0], password } })).status === 401, "old_password_still_works");
  check((await remote(rawApi, "/api/auth/sign-in/email", { method: "POST", body: { email: emails[0], password: nextPassword } })).status === 200, "new_password_not_accepted");
  checks.push("captured_local_reset_real_deployed_change_replay_denied_old_password_denied_all_sessions_revoked");

  phase = "deployed_expired_session_denial";
  const sessionB = await remote(contextB.request, "/api/auth/get-session"); assertSession(sessionB, ownerB);
  await pool.query('UPDATE public.sajda_auth_session SET "expiresAt"=statement_timestamp()-interval \'1 minute\' WHERE id=$1 AND "userId"=$2', [sessionB.body.session.id, ownerB]);
  check((await remote(contextB.request, "/api/account/saved-domains", { owner: ownerB })).status === 401, "expired_session_access_granted");
  check((await remote(contextB.request, "/api/auth/get-session")).body === null, "expired_session_restored");
  checks.push("expired_real_session_denied_not_silently_renewed");
  check(forbiddenWrites.length === 0 && runtimeErrors.length === 0 && transportFailures === 0, "unexpected_runtime_or_write");
  result = { event: "auth_lifecycle_preview_verified", runId, expectedCommit: args.get("--expected-commit"), origin: protectedOrigin,
    checks, measurements, responseStatuses, actualBrowserLogin: true, routeMocks: false, realResponseProtectionProxy: true,
    localSdkSignupVerification: true, deployedSignup: false, localCapturedResetRequest: true, deployedPasswordReset: true,
    inboxDelivery: false, providerEmailsSent: 0, existingUserChanges: 0, productionWrites: 0, paymentCalls: 0,
    socialProviderLifecycle: false, actualIPhone: false, voiceOver: false, runtimeExceptions: runtimeErrors.length,
    unexpectedWrites: forbiddenWrites.length, transportFailures, localSourceCommitMatches: true, deploymentCommitMustBeVerifiedSeparately: true };
}

async function remote(client, route, options = {}) {
  check(/^\/api\/(?:health|auth\/get-session|auth\/sign-in\/email|auth\/sign-out|auth\/reset-password|account\/saved-domains)$/u.test(route), "remote_path_not_allowed");
  const method = options.method ?? "GET"; check(method === "GET" || method === "POST" && writePaths.has(route), "remote_method_not_allowed");
  let response;
  try {
    response = await client.fetch(new URL(route, protectedOrigin).toString(), { method, maxRedirects: 0, maxRetries: 0,
      headers: { "x-vercel-trusted-oidc-idp-token": protectionToken, origin: protectedOrigin,
        ...(options.owner ? { "x-sajda-account": options.owner } : {}), ...(options.cookie ? { cookie: options.cookie } : {}) },
      ...(options.body === undefined ? {} : { data: options.body }), timeout: 35_000 });
  } catch { throw new Error("private_remote_transport_failed"); }
  const status = response.status(); responseStatuses[status] = (responseStatuses[status] ?? 0) + 1;
  let body; try { body = await response.json(); } catch { throw new Error("unexpected_remote_response"); }
  checkpoints.push({ phase, path: route, method, status }); return { status, body };
}

async function context() {
  const value = await browser.newContext({ locale: "en-US", viewport: { width: 390, height: 900 }, reducedMotion: "reduce", serviceWorkers: "block" });
  value.setDefaultTimeout(25_000); value.setDefaultNavigationTimeout(45_000);
  value.on("page", page => page.on("pageerror", () => runtimeErrors.push("browser_runtime_exception")));
  await value.route("**/*", route => {
    const task = (async () => {
      try {
        const request = route.request(), target = new URL(request.url());
        if (target.origin !== protectedOrigin) return await route.abort("blockedbyclient");
        if (!["GET", "HEAD"].includes(request.method())) {
          if (request.method() !== "POST" || !writePaths.has(target.pathname)) { forbiddenWrites.push({ path: target.pathname, method: request.method() }); return await route.abort("blockedbyclient"); }
          posts.push(target.pathname);
        }
        const response = await route.fetch({ headers: { ...request.headers(), "x-vercel-trusted-oidc-idp-token": protectionToken }, maxRedirects: 0, maxRetries: 0, timeout: 60_000 });
        await route.fulfill({ response });
      } catch { if (!closing) transportFailures++; await route.abort("failed").catch(() => undefined); }
    })();
    activeRoutes.add(task); task.finally(() => activeRoutes.delete(task)); return task;
  });
  return value;
}
async function login(page, email, secret, expectedPath, expectedHash = "") {
  await page.locator("#email").fill(email); await page.locator("#password").fill(secret);
  const response = page.waitForResponse(value => new URL(value.url()).pathname === "/api/auth/sign-in/email" && value.request().method() === "POST");
  await page.locator('form button[type="submit"]').click(); check((await response).status() === 200, "real_ui_login_failed");
  await page.waitForURL(value => value.pathname === expectedPath && value.hash === expectedHash);
}
function assertSession(response, owner) {
  check(response.status === 200 && response.body?.user?.id === owner && response.body?.session?.userId === owner
    && response.body.user.emailVerified === true && Date.parse(response.body.session.expiresAt) > Date.now(), "actual_owner_session_failed");
}
async function sessionCookie(contextValue) {
  const cookies = (await contextValue.cookies(protectedOrigin)).filter(value => /^(?:__Secure-)?sajda\.session_token$/u.test(value.name));
  check(cookies.length === 1, "actual_session_cookie_missing"); return cookies[0];
}

try { await main(); }
catch { failure = { event: "auth_lifecycle_preview_failed", phase, checkpoints, rawPrivateDetailsSuppressed: true }; process.exitCode = 1; }
finally {
  // Retain the exact-origin/write fence during closing. Removing it first could
  // let a late browser request bypass the allowlist or forward a private header.
  closing = true;
  await browser?.close().catch(() => { transportFailures++; }); await rawApi?.dispose().catch(() => { transportFailures++; });
  let drainTimer;
  await Promise.race([
    Promise.allSettled([...activeRoutes]),
    new Promise(resolve => { drainTimer = setTimeout(() => { transportFailures++; resolve(); }, 20_000); }),
  ]);
  clearTimeout(drainTimer);
  if (activeRoutes.size > 0) transportFailures++;
  if (pool) {
    try {
      if (setupAttempted) {
        // Reconcile a lost signup acknowledgement by the two exact new emails.
        const allocated = (await pool.query("SELECT id,email FROM public.sajda_auth_user WHERE email=ANY($1::text[])", [emails])).rows;
        check(allocated.length <= 2 && allocated.every(value => emails.includes(value.email) && typeof value.id === "string"), "fixture_cleanup_binding_failed");
        for (const value of allocated) {
          check(!createdUsers.some(owned => owned.email === value.email && owned.id !== value.id), "fixture_owner_changed");
          await pool.query("DELETE FROM public.sajda_auth_verification WHERE value=$1 OR identifier=ANY($2::text[])", [value.id, verificationIdentifiers]);
          const removed = await pool.query("DELETE FROM public.sajda_auth_user WHERE id=$1 AND email=$2 RETURNING id", [value.id, value.email]); check(removed.rows.length === 1, "fixture_user_not_removed");
          for (const table of ["sajda_auth_account", "sajda_auth_session"]) check((await pool.query(`SELECT count(*)::integer AS count FROM public.${table} WHERE "userId"=$1`, [value.id])).rows[0].count === 0, "fixture_auth_children_remain");
          check((await pool.query("SELECT count(*)::integer AS count FROM sajda.saved_domains WHERE user_id=$1", [value.id])).rows[0].count === 0, "fixture_saved_work_remains");
          const subjectHash = createHash("sha256").update(`saved-domains:${value.id}`).digest("hex");
          await pool.query("DELETE FROM sajda.function_rate_limits WHERE scope='saved-domains' AND subject_hash=$1", [subjectHash]);
          check((await pool.query("SELECT count(*)::integer AS count FROM sajda.function_rate_limits WHERE scope='saved-domains' AND subject_hash=$1", [subjectHash])).rows[0].count === 0, "fixture_account_rate_remains");
        }
        check((await pool.query("SELECT count(*)::integer AS count FROM public.sajda_auth_user WHERE email=ANY($1::text[])", [emails])).rows[0].count === 0, "fixture_users_remain");
        // Only the local CLI's allocated test-net limiter keys are retired.
        // Deployed shared-IP auth buckets remain untouched.
        await pool.query("DELETE FROM public.sajda_auth_rate_limit WHERE key=ANY($1::text[])", [["/sign-up/email", "/verify-email", "/request-password-reset"].map(route => `${testIp}|${route}`)]);
      }
      cleanupVerified = true;
    } catch { failure = { ...(failure ?? { event: "auth_lifecycle_preview_failed", phase: "fixture_cleanup" }), cleanupUnconfirmed: true, rawPrivateDetailsSuppressed: true }; process.exitCode = 1; }
    await pool.end().catch(() => { cleanupVerified = false; process.exitCode = 1; });
  }
  captured = []; protectionToken = undefined;
}
if (!failure && cleanupVerified && transportFailures === 0 && activeRoutes.size === 0 && runtimeErrors.length === 0 && forbiddenWrites.length === 0) {
  const publicResult = { ...result, runtimeExceptions: runtimeErrors.length, unexpectedWrites: forbiddenWrites.length, transportFailures,
    activeRoutesAfterClose: activeRoutes.size, cleanupVerified: true, remainingFixtures: 0, sharedIpAuthRateLimitsModified: false };
  const output = path.resolve(".vercel/auth-lifecycle-preview"); await mkdir(output, { recursive: true });
  await writeFile(path.join(output, "result.json"), JSON.stringify(publicResult, null, 2)); console.info(JSON.stringify(publicResult));
} else {
  console.error(JSON.stringify({ ...(failure ?? { event: "auth_lifecycle_preview_failed", phase: "transport_teardown" }), cleanupVerified, setupAttempted, transportFailures })); process.exitCode = 1;
}
