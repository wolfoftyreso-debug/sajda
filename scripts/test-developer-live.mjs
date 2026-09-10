/** Real HTTP integration probe. No direct database access.
 *
 * Explicit opt-in: SAJDA_DEVELOPER_LIVE_TEST=true
 * Required secrets: SAJDA_QA_EMAIL / SAJDA_QA_PASSWORD (never CLI arguments).
 * Target: SAJDA_QA_ORIGIN, default http://127.0.0.1:8095.
 * Non-loopback preview targets additionally require BOTH
 * SAJDA_QA_ALLOW_REMOTE_DEV=true and SAJDA_QA_APPROVED_DEV_ORIGIN=<exact origin>.
 * Never use production. Server must have SAJDA_NATIVE_ENABLED=true for this QA.
 * Optional SAJDA_QA_EXACT_SEARCH=true also checks example.com once through REST
 * and once through MCP, using actual registry/price sources but no AI generation.
 * Without that separate opt-in there is no provider work.
 *
 * Only new QA credentials are created/revoked. Account/user rows, saved data,
 * subscriptions and Trading runs are not intentionally changed. Scope-denial
 * probes remove a random nonexistent saved domain; they never start research.
 * All credentials live only in process memory. Only check names/statuses print.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const optedIn = process.env.SAJDA_DEVELOPER_LIVE_TEST === "true";
if (!optedIn) {
  console.log(JSON.stringify({ event: "developer_live_test_skipped", reason: "explicit_opt_in_required" }));
  process.exit(0);
}

class ProbeFailure extends Error {
  constructor(step, status) {
    super("Developer integration check failed.");
    this.step = step;
    this.status = Number.isInteger(status) ? status : undefined;
  }
}
const passed = [];
let activeStep = "configuration";
function check(step, condition, status) {
  activeStep = step;
  if (!condition) throw new ProbeFailure(step, status);
  passed.push(step);
  console.log(JSON.stringify({ event: "developer_live_check_passed", check: step }));
}
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function equivalent(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function safeFailure(error) {
  // Never serialize Error.message/stack/cause, an HTTP body, credentials,
  // account identifiers, membership data or an SDK transport error.
  return { check: error instanceof ProbeFailure ? error.step : activeStep,
    ...(error instanceof ProbeFailure && error.status !== undefined ? { status: error.status } : {}) };
}

async function run() {
  let url;
  try { url = new URL(process.env.SAJDA_QA_ORIGIN || "http://127.0.0.1:8095"); }
  catch { throw new ProbeFailure("valid_qa_origin"); }
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  const approvedRemote = process.env.SAJDA_QA_ALLOW_REMOTE_DEV === "true"
    && process.env.SAJDA_QA_APPROVED_DEV_ORIGIN === url.origin && url.protocol === "https:"
    && !["sajda.dev", "www.sajda.dev", "sajda.com", "www.sajda.com"].includes(url.hostname);
  check("approved_development_target", (loopback && ["http:", "https:"].includes(url.protocol) || approvedRemote)
    && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash);
  const origin = url.origin;
  const email = process.env.SAJDA_QA_EMAIL, password = process.env.SAJDA_QA_PASSWORD;
  check("qa_credentials_supplied", typeof email === "string" && email.length > 0 && typeof password === "string" && password.length > 0);
  const cookies = new Map();
  const keyName = `sajda-live-qa-${randomUUID()}`;
  let accountId, keyId, apiKey, nativeToken, keyCreateAttempted = false, keyRevoked = false, nativeRevoked = false;
  let client;
  const cleanupFailures = [];

  function rememberCookies(response) {
    for (const line of response.headers.getSetCookie()) {
      const pair = line.split(";", 1)[0], separator = pair.indexOf("=");
      if (separator < 1) continue;
      const name = pair.slice(0, separator), value = pair.slice(separator + 1);
      if (!/^(?:__Secure-)?sajda\.[A-Za-z0-9_.-]+$/u.test(name)) continue;
      if (!value || /(?:^|;)\s*Max-Age=0(?:;|$)/iu.test(line)) cookies.delete(name);
      else cookies.set(name, value);
    }
  }
  async function request(step, path, { method = "GET", body, bearer, browser = false, expected = 200, headers: extraHeaders = {} } = {}) {
    activeStep = step;
    const target = new URL(path, origin);
    if (target.origin !== origin || !target.pathname.startsWith("/api/") || target.username || target.password) throw new ProbeFailure("request_target_guard");
    const headers = { Accept: "application/json", Origin: origin, ...extraHeaders,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      ...(browser ? { Cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join("; "),
        ...(accountId ? { "X-Sajda-Account": accountId } : {}) } : {}) };
    const response = await fetch(target, { method, headers, redirect: "error", cache: "no-store",
      signal: AbortSignal.timeout(35000), ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    if (browser) rememberCookies(response);
    const text = await response.text();
    let payload;
    try { payload = text ? JSON.parse(text) : null; } catch { throw new ProbeFailure(`${step}_json`, response.status); }
    check(step, Array.isArray(expected) ? expected.includes(response.status) : response.status === expected, response.status);
    return { data: object(payload), status: response.status, headers: response.headers };
  }
  async function mcpCall(name, args = {}, expected = 200) {
    activeStep = `mcp_${name}`;
    const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 35000 });
    const structured = object(result.structuredContent);
    check(`mcp_${name}`, structured.status === expected && structured.ok === (expected < 400)
      && (expected < 400 ? result.isError !== true : result.isError === true), structured.status);
    return structured;
  }
  const exactSearch = process.env.SAJDA_QA_EXACT_SEARCH === "true";
  let searchCalls = 0;
  const readonlyScopes = [...(exactSearch ? ["domains:search"] : []), "account:read", "saved:read", "trading:read"];

  try {
    await request("browser_login", "/api/auth/sign-in/email", { method: "POST", browser: true, body: { email, password } });
    check("browser_received_session_cookie", [...cookies.keys()].some(name => /(?:^|\.)session_token$/u.test(name)));
    const webSession = await request("browser_session", "/api/auth/get-session?disableCookieCache=true", { browser: true });
    accountId = object(webSession.data.user).id;
    check("verified_existing_account", typeof accountId === "string" && accountId.length > 0
      && object(webSession.data.user).emailVerified === true && object(webSession.data.session).userId === accountId);
    const webMembership = await request("browser_membership", "/api/account/membership", { browser: true });
    check("browser_membership_owner", webMembership.data.accountId === accountId);
    const webSaved = await request("browser_saved_domains", "/api/account/saved-domains", { browser: true });
    check("browser_saved_list_shape", Array.isArray(webSaved.data.items));

    keyCreateAttempted = true;
    const created = await request(exactSearch ? "create_exact_check_key" : "create_readonly_api_key", "/api/developer/api-keys", {
      method: "POST", browser: true, body: { name: keyName, scopes: readonlyScopes, expiresInDays: 1 }, expected: 201 });
    const key = object(created.data.key);
    keyId = typeof key.id === "string" ? key.id : undefined;
    apiKey = typeof created.data.apiKey === "string" ? created.data.apiKey : undefined;
    check(exactSearch ? "key_has_approved_exact_check_scopes" : "key_is_nonproduction_and_readonly", ["preview", "development"].includes(key.environment)
      && /^sj_test_[A-Za-z0-9_-]{16}_[A-Za-z0-9_-]{43}$/u.test(apiKey || "") && Boolean(keyId)
      && equivalent(key.scopes, readonlyScopes));
    check("key_has_finite_expiry", Number.isFinite(Date.parse(key.expiresAt)) && Date.parse(key.expiresAt) > Date.now()
      && Date.parse(key.expiresAt) <= Date.now() + 25 * 60 * 60 * 1000);
    const listed = await request("list_owned_api_keys", "/api/developer/api-keys", { browser: true });
    check("listed_key_never_reveals_secret", Array.isArray(listed.data.keys)
      && listed.data.keys.some(row => object(row).id === keyId) && !JSON.stringify(listed.data).includes(apiKey)
      && !JSON.stringify(listed.data).includes("secret_hash"));

    const restMembership = await request("rest_membership", "/api/v1/account?resource=membership", { bearer: apiKey });
    check("rest_matches_browser_membership", restMembership.data.accountId === accountId
      && equivalent(restMembership.data.membership, webMembership.data.membership));
    const restSaved = await request("rest_saved_domains", "/api/v1/account?resource=saved-domains", { bearer: apiKey });
    check("rest_matches_browser_saved_domains", equivalent(restSaved.data.items, webSaved.data.items)
      && restSaved.data.nextCursor === webSaved.data.nextCursor);
    const restTrading = await request("rest_trading_status_read", "/api/v1/account?resource=trading-status", { bearer: apiKey });
    check("rest_trading_status_is_readonly_shape", typeof restTrading.data.access === "boolean" && !("candidates" in restTrading.data));
    const nonexistentDomain = `qa-${randomUUID()}.com`;
    const deniedRest = await request("readonly_rest_write_denied", "/api/v1/account?resource=saved-domains", {
      method: "DELETE", bearer: apiKey, body: { domain: nonexistentDomain }, expected: 403 });
    check("readonly_rest_scope_error", deniedRest.data.code === "insufficient_scope");

    activeStep = "mcp_initialize";
    client = new Client({ name: "sajda-development-live-probe", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL("/api/mcp", origin), {
      requestInit: { headers: { Authorization: `Bearer ${apiKey}`, Origin: origin }, redirect: "error", signal: AbortSignal.timeout(180000) },
      fetch: async (input, init) => {
        const target = new URL(input instanceof Request ? input.url : String(input));
        if (target.origin !== origin || target.pathname !== "/api/mcp") throw new ProbeFailure("mcp_target_guard");
        return fetch(input, { ...init, redirect: "error", signal: AbortSignal.any([...(init?.signal ? [init.signal] : []), AbortSignal.timeout(35000)]) });
      },
    });
    await client.connect(transport, { timeout: 35000 });
    check("mcp_initialize", client.getServerVersion()?.name === "sajda" && !transport.sessionId);
    activeStep = "mcp_tool_discovery";
    const catalogue = await client.listTools();
    check("mcp_tool_discovery", ["account_membership", "saved_domains_list", "trading_status", "saved_domains_remove"]
      .every(name => catalogue.tools.some(tool => tool.name === name)));
    const mcpMembership = await mcpCall("account_membership");
    check("mcp_matches_browser_membership", object(mcpMembership.data).accountId === accountId
      && equivalent(object(mcpMembership.data).membership, webMembership.data.membership));
    const mcpSaved = await mcpCall("saved_domains_list");
    check("mcp_matches_browser_saved_domains", equivalent(object(mcpSaved.data).items, webSaved.data.items));
    const mcpTrading = await mcpCall("trading_status");
    check("mcp_trading_status_is_readonly_shape", typeof object(mcpTrading.data).access === "boolean" && !("candidates" in object(mcpTrading.data)));
    const deniedTool = await mcpCall("saved_domains_remove", { domain: nonexistentDomain }, 403);
    check("readonly_mcp_scope_error", object(deniedTool.error).code === "insufficient_scope");

    if (exactSearch) {
      const input = { domains: ["example.com"], providers: ["cloudflare"], locale: "en" };
      const validateExactResult = (step, data) => {
        const results = Array.isArray(data.results) ? data.results : [];
        check(step, results.length === 1 && results[0].domain === "example.com"
          && results[0].status === "taken" && results[0].authoritative === true
          && data.checked === 1 && Number.isFinite(Date.parse(data.checkedAt)));
      };
      searchCalls++;
      const checked = await request("rest_exact_domain_check", "/api/v1/domains", {
        method: "POST", bearer: apiKey, body: { ...input, tlds: ["com"], count: 1 } });
      validateExactResult("rest_exact_domain_registry_evidence", checked.data);
      searchCalls++;
      const mcpChecked = await mcpCall("domains_check", input);
      validateExactResult("mcp_exact_domain_registry_evidence", object(mcpChecked.data));
    }

    await request("revoke_api_key", `/api/developer/api-keys?id=${encodeURIComponent(keyId)}`, { method: "DELETE", browser: true });
    keyRevoked = true;
    await request("revoked_rest_bearer_denied", "/api/v1/account?resource=membership", { bearer: apiKey, expected: 401 });
    await request("revoked_mcp_bearer_denied", "/api/mcp", { method: "POST", bearer: apiKey, expected: 401,
      headers: { Accept: "application/json, text/event-stream" },
      body: { jsonrpc: "2.0", id: 1, method: "tools/list" } });

    const verifier = randomBytes(48).toString("base64url"), wrongVerifier = randomBytes(48).toString("base64url"), state = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const authorized = await request("native_authorize_from_web_session", "/api/native/auth", {
      method: "POST", browser: true, body: { action: "authorize", challenge, state } });
    let callback;
    try { callback = new URL(authorized.data.callback); } catch { throw new ProbeFailure("native_callback_valid"); }
    const code = callback.searchParams.get("code");
    check("native_callback_and_state", callback.protocol === "com.hypbit.sajda:" && callback.hostname === "auth"
      && callback.pathname === "/callback" && callback.searchParams.get("state") === state
      && /^[A-Za-z0-9_-]{43}$/u.test(code || ""));
    await request("native_wrong_verifier_denied", "/api/native/auth", {
      method: "POST", body: { action: "exchange", code, verifier: wrongVerifier }, expected: 401 });
    const exchanged = await request("native_pkce_exchange", "/api/native/auth", { method: "POST", body: { action: "exchange", code, verifier } });
    nativeToken = typeof exchanged.data.token === "string" ? exchanged.data.token : undefined;
    check("native_session_token_is_distinct_and_expiring", /^sjn_[A-Za-z0-9_-]{43}$/u.test(nativeToken || "")
      && nativeToken !== apiKey && Date.parse(exchanged.data.expiresAt) > Date.now());
    await request("native_authorization_code_replay_denied", "/api/native/auth", {
      method: "POST", body: { action: "exchange", code, verifier }, expected: 401 });
    const nativeSession = await request("native_session_read", "/api/native/auth", { bearer: nativeToken });
    check("native_session_owner", object(object(nativeSession.data.session).user).id === accountId);
    const nativeMembership = await request("native_membership_read", "/api/native/account", { method: "POST", bearer: nativeToken,
      body: { path: "/api/account/membership", method: "GET", accountId } });
    check("native_matches_browser_membership", nativeMembership.data.accountId === accountId
      && equivalent(nativeMembership.data.membership, webMembership.data.membership));
    const deniedBilling = await request("native_billing_denied", "/api/native/account", { method: "POST", bearer: nativeToken, expected: 403,
      body: { path: "/api/account/billing", method: "POST", accountId, body: { action: "checkout", plan: "trading" } } });
    check("native_billing_gate", deniedBilling.data.code === "unsupported_native_action");
    await request("native_token_cannot_authorize_web_account", "/api/account/membership", {
      bearer: nativeToken, headers: { "X-Sajda-Account": accountId }, expected: 401 });
    await request("native_logout", "/api/native/auth", { method: "POST", bearer: nativeToken, body: { action: "logout" } });
    nativeRevoked = true;
    await request("native_revoked_session_denied", "/api/native/auth", { bearer: nativeToken, expected: 401 });
    await request("native_revoked_account_denied", "/api/native/account", { method: "POST", bearer: nativeToken, expected: 401,
      body: { path: "/api/account/membership", method: "GET", accountId } });
  } catch (error) {
    // Freeze the failing stage before cleanup issues its own HTTP requests.
    const failure = safeFailure(error);
    throw new ProbeFailure(failure.check, failure.status);
  } finally {
    // Cleanup is restricted to credentials minted by this run. Never revoke
    // pre-existing keys, delete users, or mutate a saved domain / Trading run.
    if (client) try { await client.close(); } catch { cleanupFailures.push("mcp_transport_close"); }
    if (nativeToken && !nativeRevoked) {
      try { await request("cleanup_native_session", "/api/native/auth", { method: "POST", bearer: nativeToken, body: { action: "logout" }, expected: [200, 401] }); }
      catch { cleanupFailures.push("new_native_session"); }
    }
    if (keyCreateAttempted && !keyRevoked && accountId && cookies.size) {
      try {
        if (!keyId) {
          const listed = await request("cleanup_find_new_key", "/api/developer/api-keys", { browser: true });
          const matches = Array.isArray(listed.data.keys) ? listed.data.keys.filter(row => object(row).name === keyName) : [];
          if (matches.length > 1) throw new ProbeFailure("cleanup_key_ambiguous");
          keyId = typeof matches[0]?.id === "string" ? matches[0].id : undefined;
        }
        if (keyId) await request("cleanup_new_api_key", `/api/developer/api-keys?id=${encodeURIComponent(keyId)}`, {
          method: "DELETE", browser: true, expected: [200, 404] });
      } catch { cleanupFailures.push("new_api_key"); }
    }
    if (cookies.size) {
      try { await request("cleanup_qa_browser_session", "/api/auth/sign-out", { method: "POST", browser: true, body: {} }); }
      catch { cleanupFailures.push("new_browser_session"); }
    }
    cookies.clear();
    apiKey = undefined; nativeToken = undefined;
    if (cleanupFailures.length) {
      console.error(JSON.stringify({ event: "developer_live_cleanup_incomplete", resources: cleanupFailures }));
      process.exitCode = 1;
    }
  }
  check("probe_credentials_cleaned_up", cleanupFailures.length === 0);
  console.log(JSON.stringify({ event: "developer_live_test_complete", checks: passed.length, searchCalls, tradingMutationCalls: 0, billingProviderCalls: 0 }));
}

try { await run(); }
catch (error) {
  console.error(JSON.stringify({ event: "developer_live_test_failed", ...safeFailure(error), completedChecks: passed.length }));
  process.exitCode = 1;
}
