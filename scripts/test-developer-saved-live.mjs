/** Development-only saved-domain integration probe; no direct database access.
 * Requires BOTH SAJDA_DEVELOPER_LIVE_TEST=true and SAJDA_QA_SAVED_MUTATIONS=true.
 * Uses the baseline probe's SAJDA_QA_ORIGIN / EMAIL / PASSWORD and exact remote
 * development approval flags. Never use production or a non-QA account.
 * Creates one short-lived saved:read/saved:write key and one UUID.invalid fixture.
 * All numbers are synthetic zero placeholders, never prices/availability claims.
 * Finally removes only that previously absent domain and the key/session minted
 * here. No search, registrar, Trading, billing, native-auth or email operations.
 * Credentials, response bodies and account/domain identifiers never print.
 */
import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

if (process.env.SAJDA_DEVELOPER_LIVE_TEST !== "true" || process.env.SAJDA_QA_SAVED_MUTATIONS !== "true") {
  console.log(JSON.stringify({ event: "developer_saved_live_skipped", reason: "both_explicit_opt_ins_required" }));
  process.exit(0);
}

class ProbeFailure extends Error {
  constructor(step, status) { super("Saved-domain integration check failed."); this.step = step; this.status = Number.isInteger(status) ? status : undefined; }
}
let activeStep = "configuration";
let checks = 0;
const object = value => value && typeof value === "object" && !Array.isArray(value) ? value : {};
function check(step, condition, status) {
  activeStep = step;
  if (!condition) throw new ProbeFailure(step, status);
  checks++;
  console.log(JSON.stringify({ event: "developer_saved_live_check_passed", check: step }));
}
const failure = error => ({ check: error instanceof ProbeFailure ? error.step : activeStep,
  ...(error instanceof ProbeFailure && error.status !== undefined ? { status: error.status } : {}) });

async function run() {
  let target;
  try { target = new URL(process.env.SAJDA_QA_ORIGIN || "http://127.0.0.1:8095"); }
  catch { throw new ProbeFailure("valid_qa_origin"); }
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(target.hostname);
  const approvedRemote = process.env.SAJDA_QA_ALLOW_REMOTE_DEV === "true"
    && process.env.SAJDA_QA_APPROVED_DEV_ORIGIN === target.origin && target.protocol === "https:"
    && !["sajda.dev", "www.sajda.dev", "sajda.com", "www.sajda.com"].includes(target.hostname);
  check("approved_development_target", ((loopback && ["http:", "https:"].includes(target.protocol)) || approvedRemote)
    && !target.username && !target.password && target.pathname === "/" && !target.search && !target.hash);
  const email = process.env.SAJDA_QA_EMAIL, password = process.env.SAJDA_QA_PASSWORD;
  check("qa_credentials_supplied", typeof email === "string" && email.length > 0 && typeof password === "string" && password.length > 0);
  const origin = target.origin, runId = randomUUID(), domain = `sajda-qa-${runId}.invalid`, keyName = `sajda-saved-qa-${runId}`;
  const scopes = ["saved:read", "saved:write"], cookies = new Map(), cleanupFailures = [];
  let accountId, keyId, apiKey, client, keyAttempted = false, saveAttempted = false, absentConfirmed = false;
  const allowedPaths = new Map([
    ["/api/auth/sign-in/email", ["POST"]], ["/api/auth/get-session", ["GET"]], ["/api/auth/sign-out", ["POST"]],
    ["/api/developer/api-keys", ["GET", "POST", "DELETE"]], ["/api/account/saved-domains", ["GET", "DELETE"]],
    ["/api/v1/account", ["GET", "POST", "DELETE"]],
  ]);
  function rememberCookies(response) {
    for (const line of response.headers.getSetCookie()) {
      const pair = line.split(";", 1)[0], separator = pair.indexOf("=");
      if (separator < 1) continue;
      const name = pair.slice(0, separator), value = pair.slice(separator + 1);
      if (!/^(?:__Secure-)?sajda\.[A-Za-z0-9_.-]+$/u.test(name)) continue;
      if (!value || /(?:^|;)\s*Max-Age=0(?:;|$)/iu.test(line)) cookies.delete(name); else cookies.set(name, value);
    }
  }
  async function request(step, path, { method = "GET", body, browser = false, bearer, expected = 200 } = {}) {
    activeStep = step;
    const url = new URL(path, origin);
    if (url.origin !== origin || url.username || url.password || url.hash || !allowedPaths.get(url.pathname)?.includes(method)
      || (url.pathname === "/api/v1/account" && url.searchParams.get("resource") !== "saved-domains")) throw new ProbeFailure("request_target_guard");
    const headers = { Accept: "application/json", Origin: origin,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      ...(browser ? { Cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join("; "), ...(accountId ? { "X-Sajda-Account": accountId } : {}) } : {}) };
    const response = await fetch(url, { method, headers, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(35000),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    if (browser) rememberCookies(response);
    let payload;
    try { payload = object(await response.json()); } catch { throw new ProbeFailure(`${step}_json`, response.status); }
    check(step, (Array.isArray(expected) ? expected : [expected]).includes(response.status), response.status);
    return payload;
  }
  async function mcp(step, name, args = {}) {
    activeStep = step;
    if (!["saved_domains_list", "saved_domains_save", "saved_domains_remove"].includes(name)) throw new ProbeFailure("mcp_tool_guard");
    const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 35000 });
    const content = object(result.structuredContent);
    check(step, result.isError !== true && content.ok === true && content.status === 200, content.status);
    return object(content.data);
  }
  // Bounded full enumeration proves the random domain did not pre-exist and
  // checks pagination while ensuring cleanup never touches another saved entry.
  async function savedList(step, protocol = "rest") {
    let cursor;
    const items = [], seen = new Set();
    for (let page = 0; page < 10; page++) {
      const data = protocol === "mcp" ? await mcp(`${step}_${page}`, "saved_domains_list", cursor ? { cursor } : {})
        : await request(`${step}_${page}`, `${protocol === "browser" ? "/api/account/saved-domains" : "/api/v1/account?resource=saved-domains"}${cursor ? `${protocol === "browser" ? "?" : "&"}cursor=${encodeURIComponent(cursor)}` : ""}`,
          protocol === "browser" ? { browser: true } : { bearer: apiKey });
      if (!Array.isArray(data.items) || data.items.length > 100) throw new ProbeFailure(`${step}_list_shape`);
      for (const item of data.items) {
        if (typeof object(item).id !== "string" || typeof object(item).domain !== "string" || seen.has(item.id)) throw new ProbeFailure(`${step}_list_identity`);
        seen.add(item.id); items.push(item);
      }
      if (data.nextCursor === null) return items;
      if (typeof data.nextCursor !== "string" || !/^[1-9][0-9]{0,18}$/u.test(data.nextCursor) || data.nextCursor === cursor) throw new ProbeFailure(`${step}_cursor`);
      cursor = data.nextCursor;
    }
    throw new ProbeFailure(`${step}_bounded_page_limit`);
  }
  const snapshot = phase => ({ domain, registrarPrice: 0, estimatedValue: 0, confidenceScore: 0,
    rationale: `Synthetic integration QA fixture ${runId}; phase ${phase}. No availability, registration, price or valuation claim. Zero values are placeholders. Remove after this probe.` });
  function onlyFixture(step, items, phase, id) {
    const matches = items.filter(item => item.domain === domain), item = object(matches[0]);
    check(step, matches.length === 1 && (id === undefined || item.id === id) && item.rationale === snapshot(phase).rationale
      && item.registrar_price === 0 && item.estimated_value === 0 && item.confidence_score === 0);
    return item.id;
  }
  const withoutFixture = items => JSON.stringify(items.filter(item => item.domain !== domain).sort((a, b) => a.id.localeCompare(b.id)));
  try {
    await request("browser_login", "/api/auth/sign-in/email", { method: "POST", browser: true, body: { email, password } });
    check("browser_session_cookie", [...cookies.keys()].some(name => /(?:^|\.)session_token$/u.test(name)));
    const session = await request("browser_session", "/api/auth/get-session?disableCookieCache=true", { browser: true });
    accountId = object(session.user).id;
    check("verified_existing_account", typeof accountId === "string" && accountId.length > 0
      && object(session.user).emailVerified === true && object(session.session).userId === accountId);
    const before = await savedList("browser_saved_before", "browser");
    check("synthetic_domain_previously_absent", !before.some(item => item.domain === domain));
    absentConfirmed = true;
    keyAttempted = true;
    const created = await request("create_saved_only_key", "/api/developer/api-keys", { method: "POST", browser: true,
      expected: 201, body: { name: keyName, scopes, expiresInDays: 1 } });
    keyId = typeof object(created.key).id === "string" ? created.key.id : undefined;
    apiKey = typeof created.apiKey === "string" ? created.apiKey : undefined;
    check("nonproduction_saved_only_key", ["development", "preview"].includes(object(created.key).environment)
      && /^sj_test_[A-Za-z0-9_-]{16}_[A-Za-z0-9_-]{43}$/u.test(apiKey || "") && Boolean(keyId)
      && JSON.stringify(object(created.key).scopes) === JSON.stringify(scopes)
      && Date.parse(object(created.key).expiresAt) > Date.now() && Date.parse(object(created.key).expiresAt) <= Date.now() + 25 * 3600000);
    activeStep = "mcp_initialize";
    client = new Client({ name: "sajda-development-saved-probe", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL("/api/mcp", origin), {
      requestInit: { headers: { Authorization: `Bearer ${apiKey}`, Origin: origin }, redirect: "error" },
      fetch: async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        if (url.origin !== origin || url.pathname !== "/api/mcp" || url.username || url.password || url.hash) throw new ProbeFailure("mcp_target_guard");
        return fetch(input, { ...init, redirect: "error", signal: AbortSignal.any([...(init?.signal ? [init.signal] : []), AbortSignal.timeout(35000)]) });
      },
    });
    await client.connect(transport, { timeout: 35000 });
    check("mcp_initialize", client.getServerVersion()?.name === "sajda" && !transport.sessionId);
    saveAttempted = true;
    const saved = await request("rest_save_fixture", "/api/v1/account?resource=saved-domains", { method: "POST", bearer: apiKey, body: snapshot("rest") });
    const firstId = object(saved.item).id;
    check("rest_save_confirmed", saved.ok === true && object(saved.item).domain === domain && typeof firstId === "string");
    onlyFixture("mcp_observes_rest_save", await savedList("mcp_after_rest", "mcp"), "rest", firstId);
    const updated = await mcp("mcp_update_fixture", "saved_domains_save", snapshot("mcp-update"));
    check("mcp_update_preserves_identity", updated.ok === true && object(updated.item).domain === domain && object(updated.item).id === firstId);
    onlyFixture("rest_observes_mcp_update", await savedList("rest_after_update"), "mcp-update", firstId);
    onlyFixture("browser_observes_mcp_update", await savedList("browser_after_update", "browser"), "mcp-update", firstId);
    check("mcp_remove_confirmed", (await mcp("mcp_remove_fixture", "saved_domains_remove", { domain })).ok === true);
    check("rest_observes_mcp_removal", !(await savedList("rest_after_mcp_remove")).some(item => item.domain === domain));
    const resaved = await mcp("mcp_save_fixture", "saved_domains_save", snapshot("mcp-save"));
    check("mcp_save_confirmed", resaved.ok === true && object(resaved.item).domain === domain && typeof object(resaved.item).id === "string");
    onlyFixture("rest_observes_mcp_save", await savedList("rest_after_mcp_save"), "mcp-save", resaved.item.id);
    const removed = await request("rest_remove_fixture", "/api/v1/account?resource=saved-domains", { method: "DELETE", bearer: apiKey, body: { domain } });
    check("rest_remove_confirmed", removed.ok === true);
    check("mcp_observes_rest_removal", !(await savedList("mcp_after_rest_remove", "mcp")).some(item => item.domain === domain));
    check("preexisting_saved_entries_unchanged", withoutFixture(await savedList("browser_saved_after", "browser")) === withoutFixture(before));
  } catch (error) {
    const safe = failure(error); throw new ProbeFailure(safe.check, safe.status);
  } finally {
    if (client) try { await client.close(); } catch { cleanupFailures.push("mcp_transport"); }
    // Even a failed/timed-out save can have committed. Cleanup always addresses
    // our exact random domain, and only after proving it absent before this run.
    if (saveAttempted && absentConfirmed && accountId && cookies.size) {
      try {
        const removed = await request("cleanup_exact_fixture", "/api/account/saved-domains", { method: "DELETE", browser: true, body: { domain } });
        check("cleanup_fixture_acknowledged", removed.ok === true);
        check("cleanup_fixture_absent", !(await savedList("cleanup_browser_saved", "browser")).some(item => item.domain === domain));
      } catch { cleanupFailures.push("own_saved_fixture"); }
    }
    if (keyAttempted && accountId && cookies.size) {
      try {
        if (!keyId) {
          const listed = await request("cleanup_find_own_key", "/api/developer/api-keys", { browser: true });
          if (!Array.isArray(listed.keys)) throw new ProbeFailure("cleanup_key_list_shape");
          const matches = listed.keys.filter(row => object(row).name === keyName);
          if (matches.length > 1) throw new ProbeFailure("cleanup_key_ambiguous");
          keyId = typeof matches[0]?.id === "string" ? matches[0].id : undefined;
        }
        if (keyId) await request("cleanup_exact_key", `/api/developer/api-keys?id=${encodeURIComponent(keyId)}`, { method: "DELETE", browser: true, expected: [200, 404] });
        if (apiKey) await request("cleanup_key_replay_denied", "/api/v1/account?resource=saved-domains", { bearer: apiKey, expected: 401 });
      } catch { cleanupFailures.push("own_api_key"); }
    }
    if (cookies.size) {
      try { await request("cleanup_browser_session", "/api/auth/sign-out", { method: "POST", browser: true, body: {} }); }
      catch { cleanupFailures.push("own_browser_session"); }
    }
    cookies.clear(); apiKey = undefined;
    if (cleanupFailures.length) {
      console.error(JSON.stringify({ event: "developer_saved_live_cleanup_incomplete", resources: cleanupFailures }));
      process.exitCode = 1;
    }
  }
  check("probe_cleanup_complete", cleanupFailures.length === 0);
  console.log(JSON.stringify({ event: "developer_saved_live_complete", checks, syntheticDomains: 1, searchCalls: 0, tradingMutationCalls: 0, billingProviderCalls: 0 }));
}

try { await run(); }
catch (error) {
  console.error(JSON.stringify({ event: "developer_saved_live_failed", ...failure(error), completedChecks: checks }));
  process.exitCode = 1;
}
