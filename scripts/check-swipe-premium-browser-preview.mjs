/** Opt-in, isolated browser QA for Swipe's Premium introduction and return.
 * Registry cards are EXPLICITLY SYNTHETIC, intercepted only at the exact
 * /api/domain-search route. Auth, authorization and billing GET use unchanged
 * real Preview responses. No checkout, email, entitlement or production writes.
 * Run: node --import tsx scripts/check-swipe-premium-browser-preview.mjs
 * with the same six fenced environment/origin/runtime arguments as the
 * brand-monitor browser probe. --check-fixtures performs no network or DB work.
 */
import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { readFile, realpath, mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { parseEnv } from "node:util";
import { Pool } from "pg";
import { hashPassword } from "better-auth/crypto";
import { PREMIUM_INTRO_OFFER, PLANS } from "../shared/plans.ts";
import { swipePremiumCopy } from "../src/i18n/swipePremiumCopy.ts";
import { getPlusBillingCopy } from "../src/i18n/plusBillingCopy.ts";
import { toVerifiedSwipeDeck } from "../src/lib/swipeDeck.ts";
import { createSwipeUndo } from "../src/lib/swipeUndo.ts";
import { SWIPE_CHECKOUT_CHECKPOINT_KEY as KEY, saveSwipeCheckoutCheckpoint, consumeSwipeCheckoutCheckpoint } from "../src/lib/swipeCheckoutCheckpoint.ts";

const copy = swipePremiumCopy.en;
let phase = "configuration", setupAttempted = false, created = false, cleanupVerified = false, cleanupFailed = false;
let safeDiagnostics = null;
const check = value => assert.ok(value);
const memoryStorage = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); } };
};
function fixtureDeck(tlds, observedAt) {
  return Array.from({ length: 100 }, (_, index) => {
    const label = `qafixt${String.fromCharCode(97 + Math.floor(index / 26))}${String.fromCharCode(97 + index % 26)}`;
    const tld = tlds[index % tlds.length];
    const offer = { providerId: "cloudflare", registrar: "Cloudflare", purchaseUrl: "https://domains.cloudflare.com/",
      priceSourceUrl: "https://developers.cloudflare.com/registrar/", currency: "USD", checkedAt: null, priceVerified: false,
      priceStatus: "not_connected", dataSource: "provider_search_page", connectorState: "official_api_not_configured",
      note: "SYNTHETIC QA unconnected-price shape; no domain price or availability was fetched." };
    return { domain: `${label}.${tld}`, tld, status: "available", checkMethod: "rdap",
      source: "SYNTHETIC browser QA observation — not a real registry result", checkedAt: observedAt,
      authoritative: true, registrarPrice: 0, estimatedValue: 0, confidenceScore: 42,
      rationale: "Synthetic card for navigation testing only; not an availability, value or purchase claim.",
      registrarOffer: offer, registrarOffers: [offer] };
  });
}
function checkpointRaw(state, ownerId) {
  const storage = memoryStorage();
  check(saveSwipeCheckoutCheckpoint({ ...state, ownerId }, { storage }));
  return storage.getItem(KEY);
}
function validateCheckpoint(raw, ownerId, search) {
  const storage = memoryStorage(); storage.setItem(KEY, raw);
  const state = consumeSwipeCheckoutCheckpoint({ ownerId, pathname: "/swipe", search }, { storage });
  check(state && state.deck.length === 100 && state.deckIndex === 1 && state.undo?.deckIndex === 0 && state.undo.direction === "skip");
  check(storage.getItem(KEY) === null && consumeSwipeCheckoutCheckpoint({ ownerId, pathname: "/swipe", search }, { storage }) === null);
  return state;
}
function checkFixtures() {
  const deck = fixtureDeck(["com", "dev", "ai"], "2026-10-08T12:00:00.000Z");
  check(toVerifiedSwipeDeck(deck, ["com", "dev", "ai"]).length === 100);
  const state = { deck, selectedTlds: ["com", "dev", "ai"], deckIndex: 1, generation: 1,
    undo: createSwipeUndo({ card: deck[0], deckIndex: 0, generation: 1, direction: "skip", beforeSaved: [], afterSaved: [] }) };
  const raw = checkpointRaw(state, null);
  assert.deepEqual(validateCheckpoint(raw, "synthetic-owner", "?premium=offer"), state);
  assert.deepEqual(validateCheckpoint(checkpointRaw(state, "synthetic-owner"), "synthetic-owner", "?billing=cancel"), state);
  assert.deepEqual(validateCheckpoint(checkpointRaw(state, "synthetic-owner"), "synthetic-owner", "?billing=success"), state);
  check(!/"(?:entitlement|premium|token|access_token|session)"\s*:/u.test(raw));
  console.info(JSON.stringify({ event: "swipe_premium_browser_fixture_contract_verified", syntheticCards: 100, realRegistryChecks: 0, networkCalls: 0, databaseWrites: 0 }));
}

async function main() {
  if (process.argv.length === 3 && process.argv[2] === "--check-fixtures") { checkFixtures(); return; }
  check(process.env.SAJDA_SWIPE_PREMIUM_BROWSER_PREVIEW_TEST === "1" && !process.env.VERCEL);
  const keys = ["--preview-env", "--production-env", "--development-env", "--preview-host", "--preview-origin", "--playwright-root"];
  const args = new Map(process.argv.slice(2).map(value => { const index = value.indexOf("="); check(index > 0); return [value.slice(0, index), value.slice(index + 1)]; }));
  check(args.size === 6 && process.argv.slice(2).length === 6 && [...args.keys()].every(key => keys.includes(key)));
  const root = await realpath(path.resolve(".vercel"));
  const env = async (key, expected) => { const file = await realpath(path.resolve(args.get(key) ?? "")); check(file === path.join(root, expected)); return parseEnv(await readFile(file, "utf8")); };
  const preview = await env("--preview-env", ".env.brand-monitors.preview.local"), production = await env("--production-env", ".env.brand-monitors.production.local");
  const development = await env("--development-env", ".env.brand-monitors.development.local");
  const previousPreview = parseEnv(await readFile(path.join(root, ".env.brand-reports.preview.local"), "utf8"));
  check(preview.DATABASE_URL && production.DATABASE_URL && previousPreview.DATABASE_URL);
  const database = new URL(preview.DATABASE_URL), productionDatabase = new URL(production.DATABASE_URL);
  check(["postgres:", "postgresql:"].includes(database.protocol) && database.hostname.endsWith(".neon.tech") && database.hostname === args.get("--preview-host"));
  check(new URL(previousPreview.DATABASE_URL).hostname === database.hostname);
  check(`${database.hostname.replace("-pooler.", ".")}${database.pathname}` !== `${productionDatabase.hostname.replace("-pooler.", ".")}${productionDatabase.pathname}`);
  const origin = new URL(args.get("--preview-origin") ?? "");
  check(origin.protocol === "https:" && /^sajda-[a-z0-9]{9}-hypbit\.vercel\.app$/u.test(origin.hostname) && origin.pathname === "/" && !origin.search && !origin.hash && !origin.port && !origin.username && !origin.password);
  const linked = JSON.parse(await readFile(path.join(root, "project.json"), "utf8"));
  check(linked.projectId === "prj_UO900Jp4qJF1eS4hkOrebIzwMVlI" && linked.orgId === "team_GP2MTfBKmxj8ajYLvQtV7clA");
  const token = development.VERCEL_OIDC_TOKEN;
  const claims = JSON.parse(Buffer.from((token ?? "").split(".")[1] ?? "", "base64url").toString("utf8"));
  check(token && claims.project_id === linked.projectId && claims.owner_id === linked.orgId && claims.environment === "development" && Number.isFinite(claims.exp) && claims.exp * 1000 > Date.now() + 300_000);
  const expectedSourceCommit = process.env.SAJDA_QA_EXPECTED_COMMIT ?? null;
  check(expectedSourceCommit === null || /^[a-f0-9]{40}$/u.test(expectedSourceCommit));
  const require = createRequire(path.resolve(args.get("--playwright-root") ?? "", "__sajda_swipe_premium_browser_qa.cjs"));
  const { chromium } = require("playwright");
  const browserChannel = process.env.SAJDA_QA_BROWSER_CHANNEL || "msedge";
  database.searchParams.set("sslmode", "verify-full"); database.searchParams.delete("options");
  const pool = new Pool({ connectionString: database.toString(), max: 2, connectionTimeoutMillis: 8_000, query_timeout: 10_000 });
  const runId = randomUUID(), owner = randomUUID(), email = `swipe-premium-browser-${owner}@example.test`, password = `Sajda-${randomBytes(28).toString("base64url")}`;
  const artifacts = path.join(root, "swipe-premium-browser");
  const measurements = [], sessionResponses = [], billingReceipts = [], capabilities = [], fixtureRequests = [], posts = [], blockedWrites = [];
  let browser, result, blockedExternal = 0, transportFailures = 0, runtimeExceptions = 0, actualLogin = false;
  let fixtureFailure = false, observedAt, guestState;
  try {
    phase = "protected_preview_health";
    const health = await fetch(new URL("/api/health", origin), { headers: { "x-vercel-trusted-oidc-idp-token": token }, redirect: "error", signal: AbortSignal.timeout(30_000) });
    check(health.status === 200 && health.headers.get("content-type")?.includes("application/json"));
    phase = "disposable_free_auth_setup";
    const passwordHash = await hashPassword(password);
    const transaction = await pool.connect(); setupAttempted = true;
    try {
      await transaction.query("BEGIN");
      check((await transaction.query("SELECT id FROM public.sajda_auth_user WHERE id=$1 OR email=$2", [owner, email])).rows.length === 0);
      await transaction.query('INSERT INTO public.sajda_auth_user(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [owner, "Synthetic Swipe Premium browser fixture", email]);
      await transaction.query('INSERT INTO public.sajda_auth_account(id,"accountId","providerId","userId",password) VALUES($1,$2,\'credential\',$2,$3)', [randomUUID(), owner, passwordHash]);
      await transaction.query("COMMIT"); created = true;
    } catch (error) { await transaction.query("ROLLBACK"); throw error; }
    finally { transaction.release(); }
    await mkdir(artifacts, { recursive: true });
    browser = await chromium.launch({ headless: true, channel: browserChannel });
    const context = await browser.newContext({ locale: "en-US", viewport: { width: 390, height: 900 }, reducedMotion: "reduce", serviceWorkers: "block" });
    context.setDefaultTimeout(20_000); context.setDefaultNavigationTimeout(45_000);
    await context.route("**/*", async route => {
      const request = route.request(), target = new URL(request.url());
      if (target.origin !== origin.origin) { blockedExternal++; return route.abort("blockedbyclient"); }
      if (target.pathname === "/api/domain-search") {
        // This sole intercepted endpoint is NOT evidence of a registry result.
        // A complete long deck avoids accidental prefetch/provider expenditure.
        try {
          const input = request.postDataJSON();
          check(request.method() === "POST" && input.swipe === true && input.count === 100 && input.minLength === 3 && input.maxLength === 9 && input.theme === ""
            && Array.isArray(input.tlds) && input.tlds.length > 0 && input.tlds.every(tld => ["com", "dev", "ai", "app", "net", "org", "xyz", "info", "biz"].includes(tld)));
          check(fixtureRequests.length === 0); observedAt = new Date(Date.now() - 3_600_000).toISOString();
          const deck = fixtureDeck(input.tlds, observedAt); check(toVerifiedSwipeDeck(deck, input.tlds).length === 100);
          fixtureRequests.push({ path: target.pathname, cards: 100, synthetic: true, providerRequests: 0 });
          return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ results: deck }) });
        } catch { fixtureFailure = true; return route.abort("blockedbyclient"); }
      }
      if (!["GET", "HEAD"].includes(request.method())) {
        let allowed = request.method() === "POST" && target.pathname === "/api/auth/sign-in/email";
        if (allowed) { try { const body = request.postDataJSON(); allowed = body.email === email && body.password === password; } catch { allowed = false; } }
        if (request.method() === "POST" && target.pathname === "/api/account/capabilities") {
          try { const body = request.postDataJSON(); allowed = actualLogin && request.headers()["x-sajda-account"] === owner && Object.keys(body).length === 1 && body.capability === "swipe_undo"; }
          catch { allowed = false; }
        }
        if (!allowed) { blockedWrites.push({ path: target.pathname, method: request.method() }); return route.abort("blockedbyclient"); }
        posts.push(target.pathname);
      }
      try {
        // Unlike continue(headers), this cannot forward private protection
        // headers on a redirect. Real backend response bodies stay unchanged.
        const response = await route.fetch({ headers: { ...request.headers(), "x-vercel-trusted-oidc-idp-token": token }, maxRedirects: 0, maxRetries: 0, timeout: 60_000 });
        if (target.pathname === "/api/account/billing" && request.method() === "GET") {
          const value = await response.json().catch(() => null);
          billingReceipts.push({ status: response.status(), accountMatches: value?.accountId === owner, mode: value?.mode ?? null,
            introReady: value?.premiumIntro?.ready === true, introEligible: value?.premiumIntro?.eligible === true });
        }
        if (target.pathname === "/api/account/capabilities" && request.method() === "POST") {
          const value = await response.json().catch(() => null);
          capabilities.push({ status: response.status(), code: value?.code ?? null });
        }
        if (target.pathname === "/api/auth/get-session") sessionResponses.push(response.status());
        return await route.fulfill({ response });
      } catch { transportFailures++; return route.abort("failed").catch(() => undefined); }
    });
    const page = await context.newPage();
    page.on("pageerror", () => { runtimeExceptions++; });
    const undo = () => page.locator('button[aria-describedby="swipe-undo-hint"]');
    const dialog = () => page.getByRole("dialog", { name: copy.title, exact: true });
    const cardTitle = () => page.locator('main [role="group"] h2');
    const measure = async (width, stage) => {
      await page.setViewportSize({ width, height: 900 });
      const value = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
        clippedControls: [...document.querySelectorAll('main :is(button,input,a,h1,h2),[role="dialog"] :is(button,a,h2,p)')].filter(element => {
          const box = element.getBoundingClientRect(), style = getComputedStyle(element);
          return box.width > 0 && style.visibility !== "hidden" && (box.right > innerWidth + 1 || box.left < -1);
        }).length }));
      measurements.push({ stage, ...value }); safeDiagnostics = { stage, ...value };
      check(value.scrollWidth <= value.width && value.clippedControls === 0);
      console.info(JSON.stringify({ event: "swipe_premium_browser_layout_verified", stage, ...value }));
    };
    const assertOffer = async (authenticated = false) => {
      await dialog().waitFor();
      check(await page.locator("[data-intro-price]").innerText() === copy.firstMonth && await page.locator("[data-intro-renewal]").innerText() === copy.renewal);
      check((await page.locator("[data-premium-offer]").innerText()).includes(copy.terms));
      if (authenticated) {
        await dialog().getByRole("button", { name: copy.testUpgrade, exact: true }).waitFor();
        check(await dialog().getByRole("button", { name: copy.testUpgrade, exact: true }).isEnabled());
        check((await page.locator("[data-premium-offer]").innerText()).includes(getPlusBillingCopy("en").testMode));
      } else await dialog().getByRole("link", { name: copy.signIn, exact: true }).waitFor();
    };
    const closeWithKeyboard = async () => {
      const close = dialog().getByRole("button", { name: copy.close, exact: true });
      await close.focus(); await page.keyboard.press("Tab"); await page.keyboard.press("Shift+Tab");
      check(await close.evaluate(element => element === document.activeElement && (getComputedStyle(element).boxShadow !== "none" || getComputedStyle(element).outlineStyle !== "none")));
      await close.press("Enter"); await dialog().waitFor({ state: "hidden" });
      check(await undo().evaluate(element => element === document.activeElement));
    };
    phase = "guest_synthetic_deck_real_swipe";
    await page.goto(new URL("/swipe?lang=en", origin).toString(), { waitUntil: "domcontentloaded" });
    await page.getByRole("dialog", { name: "Deck controls", exact: true }).waitFor();
    await page.getByRole("button", { name: "Start swiping", exact: true }).click();
    await cardTitle().waitFor();
    const firstDomain = await cardTitle().innerText();
    await page.getByRole("button", { name: `Skip ${firstDomain}`, exact: true }).click();
    await page.waitForFunction(previous => document.querySelector('main [role="group"] h2')?.textContent !== previous, firstDomain);
    await page.waitForFunction(() => !document.querySelector('button[aria-describedby="swipe-undo-hint"]')?.disabled);
    const secondDomain = await cardTitle().innerText(); check(firstDomain !== secondDomain && fixtureRequests.length === 1);
    for (const width of [320, 390, 768, 1440]) {
      phase = `guest_offer_keyboard_${width}`;
      await undo().focus(); await undo().press("Enter"); await assertOffer(); await measure(width, "guest_offer");
      if (width === 390) await dialog().screenshot({ path: path.join(artifacts, "guest-intro-mobile.png") });
      await closeWithKeyboard(); check(await cardTitle().innerText() === secondDomain);
    }
    check(billingReceipts.length === 0 && capabilities.length === 0);
    phase = "guest_auth_cta_saves_real_checkpoint";
    await page.setViewportSize({ width: 390, height: 900 }); await undo().click(); await assertOffer();
    await dialog().getByRole("link", { name: copy.signIn, exact: true }).click();
    await page.waitForURL(url => url.pathname === "/auth" && new URLSearchParams(url.search).get("next") === "/swipe?premium=offer");
    const actualCheckpoint = await page.evaluate(key => sessionStorage.getItem(key), KEY); check(actualCheckpoint);
    guestState = validateCheckpoint(actualCheckpoint, owner, "?premium=offer");
    check(guestState.deck[0].domain === firstDomain && guestState.deck[1].domain === secondDomain && guestState.deck.every(value => value.checkedAt === observedAt));
    check(guestState.deck.every(value => value.registrarOffer?.checkedAt === null && value.registrarOffer.priceVerified === false
      && value.registrarOffers?.length === 1 && value.registrarOffers[0].checkedAt === null));
    phase = "real_auth_and_server_intro_eligibility";
    await page.locator("#email").fill(email); await page.locator("#password").fill(password);
    const signIn = page.waitForResponse(response => new URL(response.url()).pathname === "/api/auth/sign-in/email" && response.request().method() === "POST");
    const billing = page.waitForResponse(response => new URL(response.url()).pathname === "/api/account/billing" && response.request().method() === "GET");
    await page.locator('form button[type="submit"]').click(); check((await signIn).status() === 200);
    await page.waitForURL(url => url.pathname === "/swipe" && new URLSearchParams(url.search).get("premium") === "offer");
    const http = await billing, value = await http.json();
    safeDiagnostics = { billingStatus: http.status(), accountMatches: value.accountId === owner, mode: value.mode ?? null,
      introReady: value.premiumIntro?.ready === true, introEligible: value.premiumIntro?.eligible === true };
    check(http.status() === 200 && value.accountId === owner && value.mode === "test" && value.status === "none" && value.activePlan === null
      && value.plans.premium.ready === true && value.plans.premium.canCheckout === true && value.plans.premium.price.unitAmount === PLANS.premium.unitAmount
      && value.premiumIntro?.id === PREMIUM_INTRO_OFFER.id && value.premiumIntro.ready === true && value.premiumIntro.eligible === true
      && value.premiumIntro.firstUnitAmount === 900 && value.premiumIntro.renewalUnitAmount === 1900 && value.premiumIntro.currency === "usd" && value.premiumIntro.interval === "month");
    const session = await page.evaluate(async () => { const response = await fetch("/api/auth/get-session", { credentials: "same-origin", cache: "no-store" }); return { status: response.status, value: await response.json() }; });
    check(session.status === 200 && session.value?.user?.id === owner && session.value.user.emailVerified === true); actualLogin = true;
    check((await pool.query('SELECT count(*)::integer AS total FROM public.sajda_auth_session WHERE "userId"=$1', [owner])).rows[0].total >= 1);
    check(await page.evaluate(key => sessionStorage.getItem(key) === null, KEY));
    check(await cardTitle().innerText() === secondDomain && (await page.locator('main [role="group"]').innerText()).includes(copy.previousCheck));
    check((await page.locator('main [role="group"]').innerText()).includes("Card 2")
      && (await page.locator('button[aria-label="Deck settings"]').innerText()).includes(`(${guestState.selectedTlds.length})`));
    await assertOffer(true); safeDiagnostics = null;
    for (const width of [320, 390, 768, 1440]) {
      phase = `authenticated_offer_keyboard_${width}`;
      await measure(width, "authenticated_offer"); await assertOffer(true);
      if (width === 390) await dialog().screenshot({ path: path.join(artifacts, "authenticated-intro-mobile.png") });
      await closeWithKeyboard(); check(await cardTitle().innerText() === secondDomain);
      const authorization = page.waitForResponse(response => new URL(response.url()).pathname === "/api/account/capabilities" && response.request().method() === "POST");
      await undo().press("Enter"); const denied = await authorization; const receipt = await denied.json();
      check(denied.status() === 403 && receipt.code === "premium_required"); await assertOffer(true);
      check(await cardTitle().innerText() === secondDomain);
    }
    await closeWithKeyboard();
    phase = "synthetic_owned_checkout_return_no_access_grant";
    const returns = [];
    for (const marker of ["cancel", "success"]) {
      const raw = checkpointRaw(guestState, owner); validateCheckpoint(raw, owner, `?billing=${marker}`);
      await page.evaluate(({ key, raw }) => sessionStorage.setItem(key, raw), { key: KEY, raw });
      await page.goto(new URL(`/swipe?billing=${marker}&lang=en`, origin).toString(), { waitUntil: "domcontentloaded" });
      await cardTitle().waitFor(); await page.waitForFunction(() => !document.querySelector('button[aria-describedby="swipe-undo-hint"]')?.disabled);
      check(await cardTitle().innerText() === secondDomain && await page.evaluate(key => sessionStorage.getItem(key) === null, KEY));
      check((await page.locator('main [role="group"]').innerText()).includes(copy.previousCheck));
      check((await page.locator('main [role="group"]').innerText()).includes("Card 2")
        && (await page.locator('button[aria-label="Deck settings"]').innerText()).includes(`(${guestState.selectedTlds.length})`));
      check((await page.locator('[aria-live="polite"]').allTextContents()).some(text => text === (marker === "success" ? copy.returnPending : copy.cancelled)));
      const authorization = page.waitForResponse(response => new URL(response.url()).pathname === "/api/account/capabilities" && response.request().method() === "POST");
      await undo().click(); const denied = await authorization;
      check(denied.status() === 403 && (await denied.json()).code === "premium_required"); await assertOffer(true);
      check(await cardTitle().innerText() === secondDomain); returns.push({ marker, syntheticNavigation: true, checkpointConsumed: true, undoDenied: true, cardUnchanged: true });
      await closeWithKeyboard();
    }
    phase = "one_use_checkpoint_reload_and_database_no_payment";
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("dialog", { name: "Deck controls", exact: true }).waitFor();
    await page.waitForLoadState("networkidle");
    check(await cardTitle().count() === 0 && fixtureRequests.length === 1);
    for (const table of ["commerce_customers", "commerce_checkouts", "commerce_access"]) check((await pool.query(`SELECT count(*)::integer AS total FROM sajda.${table} WHERE owner_id=$1`, [owner])).rows[0].total === 0);
    check((await pool.query("SELECT count(*)::integer AS total FROM sajda.account_entitlements WHERE user_id=$1", [owner])).rows[0].total === 0);
    check(posts.filter(value => value === "/api/auth/sign-in/email").length === 1 && posts.filter(value => value === "/api/account/capabilities").length === 6);
    check(billingReceipts.length >= 1 && billingReceipts.every(value => value.status === 200 && value.accountMatches && value.mode === "test" && value.introReady && value.introEligible));
    check(capabilities.length === 6 && capabilities.every(value => value.status === 403 && value.code === "premium_required"));
    check(!fixtureFailure && blockedWrites.length === 0 && transportFailures === 0 && runtimeExceptions === 0);
    result = { event: "swipe_premium_authenticated_browser_preview_verified", runId, previewOrigin: origin.origin, expectedSourceCommit,
      commitMetadataSource: "operator_supplied_expected_preview_commit", browser: browserChannel, realResponseProtectionProxy: true,
      syntheticRegistryDeck: true, interceptedPath: "/api/domain-search", fixtureRequests: fixtureRequests.length, syntheticCards: 100, realRegistryChecks: 0,
      realGuestSwipe: true, guestUndoOffer: true, guestAuthCheckpointSavedByUi: true, actualBrowserLogin: true, actualSessionStored: true,
      realServerBillingGet: true, firstMonthUsd: 9, subsequentMonthsUsd: 19, realServerIntroReady: true, realServerIntroEligible: true,
      authenticatedReturnPreservesCardAndEndings: true, historicalAvailabilityLabel: true, originalCheckpointObservationDatesPreserved: true,
      returnUiObservationDatetimesDisplayed: false, syntheticUnconnectedPriceDatesPreserved: true,
      measurements, keyboardCloseActivation: true, focusVisible: true, focusReturnsToUndo: true, realFreeUndoDenials: capabilities.length,
      syntheticCheckoutReturns: returns, oneUseCheckpointNotReplayedOnReload: true, paidAccessGrantedFromUrl: false,
      sessionReadStatuses: sessionResponses.reduce((counts, status) => ({ ...counts, [status]: (counts[status] ?? 0) + 1 }), {}), billingGetRequests: billingReceipts.length,
      runtimeExceptions, transportFailures, blockedExternalRequests: blockedExternal, blockedWrites: blockedWrites.length,
      checkoutPosts: 0, paymentTransactions: 0, emailCalls: 0, productionWrites: 0, actualIPhone: false, voiceOver: false };
  } finally {
    const testedPhase = phase; phase = "exact_fixture_cleanup";
    await browser?.close().catch(() => undefined);
    try {
      let retired = 0;
      if (setupAttempted) {
        // Lost COMMIT acknowledgements must still reconcile the exact allocated
        // synthetic identity. Never delete an existing account or shared IP rate.
        const removed = await pool.query("DELETE FROM public.sajda_auth_user WHERE id=$1 AND email=$2 RETURNING id", [owner, email]);
        retired = removed.rows.length; check(retired <= 1 && (!created || retired === 1));
        const commerceHash = createHash("sha256").update(`commerce:${owner}`).digest("hex");
        for (const scope of ["commerce-read", "commerce-mutate"]) {
          await pool.query("DELETE FROM sajda.function_rate_limits WHERE scope=$1 AND subject_hash=$2", [scope, commerceHash]);
          check((await pool.query("SELECT count(*)::integer AS total FROM sajda.function_rate_limits WHERE scope=$1 AND subject_hash=$2", [scope, commerceHash])).rows[0].total === 0);
        }
        const membershipHash = createHash("sha256").update(`account-membership:preview:${owner}`).digest("hex");
        await pool.query("DELETE FROM sajda.function_rate_limits WHERE scope='account-membership' AND subject_hash=$1", [membershipHash]);
        check((await pool.query("SELECT count(*)::integer AS total FROM sajda.function_rate_limits WHERE scope='account-membership' AND subject_hash=$1", [membershipHash])).rows[0].total === 0);
        check((await pool.query("SELECT count(*)::integer AS total FROM public.sajda_auth_user WHERE id=$1 OR email=$2", [owner, email])).rows[0].total === 0);
        for (const table of ["sajda_auth_account", "sajda_auth_session"]) check((await pool.query(`SELECT count(*)::integer AS total FROM public.${table} WHERE "userId"=$1`, [owner])).rows[0].total === 0);
        for (const table of ["commerce_customers", "commerce_checkouts", "commerce_access"]) check((await pool.query(`SELECT count(*)::integer AS total FROM sajda.${table} WHERE owner_id=$1`, [owner])).rows[0].total === 0);
        check((await pool.query("SELECT count(*)::integer AS total FROM sajda.account_entitlements WHERE user_id=$1", [owner])).rows[0].total === 0);
      }
      cleanupVerified = true; phase = testedPhase;
      const receipt = { event: "swipe_premium_browser_preview_cleanup_verified", runId, previewOrigin: origin.origin, expectedSourceCommit,
        retiredFixtures: retired, remainingFixtures: 0, accountScopedCommerceRatesRemaining: 0, accountScopedMembershipRatesRemaining: 0,
        sharedIpAuthRateLimitsModified: false, actualLoginTested: actualLogin };
      await mkdir(artifacts, { recursive: true }); await writeFile(path.join(artifacts, "cleanup.json"), JSON.stringify(receipt, null, 2)); console.info(JSON.stringify(receipt));
    } catch { cleanupFailed = true; }
    finally { await pool.end().catch(() => { cleanupFailed = true; }); }
  }
  if (cleanupFailed) throw new Error("Synthetic fixture cleanup unconfirmed");
  check(result && cleanupVerified);
  result.cleanupConfirmed = true; result.remainingFixtures = 0;
  await writeFile(path.join(artifacts, "result.json"), JSON.stringify(result, null, 2)); console.info(JSON.stringify(result));
}
main().catch(error => { console.error(JSON.stringify({ event: "swipe_premium_authenticated_browser_preview_failed", phase,
  failureClass: ["TimeoutError", "AssertionError"].includes(error?.name) ? error.name : "SuppressedError", diagnostics: safeDiagnostics,
  cleanupRequired: setupAttempted, cleanupConfirmed: !setupAttempted || cleanupVerified && !cleanupFailed, rawPrivateDetailsSuppressed: true })); process.exitCode = 1; });
