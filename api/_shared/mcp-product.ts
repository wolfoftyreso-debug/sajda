import { createHash } from "node:crypto";
import domainSearch, { createTrustedApiEngineRequest } from "../domain-search.js";
import membership from "../account/membership.js";
import savedDomains from "../account/saved-domains.js";
import trading from "../account/lost-domains.js";
import { AccountAccessError } from "./account-error.js";
import { createDelegatedAccountHeaders } from "./delegated-account.js";
import { assertApiKeyScopes, consumeApiKeyQuota } from "./developer-api-keys.js";
import { parseNamesApiRequest } from "./names-contract.js";
import { createRequestId } from "./public-api.js";
import { productOperationScope, type McpOperation, type McpProductExecutor, type McpProductResult } from "./mcp-tools.js";

/** Captures the same handler's JSON, without forwarding its browser headers. */
function captureResponse() {
  let status = 200;
  let data: unknown;
  let completed = false;
  const headers = new Map<string, string>();
  const response = {
    setHeader(name: string, value: string | number) { headers.set(name.toLowerCase(), String(value)); },
    status(value: number) { status = value; return response; },
    json(value: unknown) { data = value; completed = true; },
    end(value?: string) { data = value ? JSON.parse(value) : {}; completed = true; },
  };
  return { response, result(): McpProductResult {
    if (!completed || !data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("Product handler did not return an object response.");
    }
    const retry = Number(headers.get("retry-after"));
    return { status, data: data as Record<string, unknown>,
      ...(Number.isFinite(retry) && retry > 0 ? { retryAfterSeconds: retry } : {}) };
  } };
}

function presentTrading(result: McpProductResult, operation: McpOperation, args: Record<string, unknown>): McpProductResult {
  if (result.status < 200 || result.status >= 300) return result;
  if (result.data.access !== true && operation === "trading_report") {
    return { status: 403, data: { code: "plus_required", error: "Active Sajda Trading access is required to read this report.", requestId: result.data.requestId } };
  }
  const { candidates, quoteUpdates, ...status } = result.data;
  if (operation !== "trading_report") return { ...result, data: status };
  const rows = Array.isArray(candidates) ? candidates : [];
  const offset = typeof args.offset === "number" ? args.offset : 0;
  const limit = typeof args.limit === "number" ? args.limit : 25;
  const page = rows.slice(offset, offset + limit);
  const visibleDomains = new Set(page.map(row => row && typeof row === "object" && "domain" in row ? row.domain : null));
  const quotes = quoteUpdates && typeof quoteUpdates === "object" && !Array.isArray(quoteUpdates)
    ? Object.fromEntries(Object.entries(quoteUpdates).filter(([domain]) => visibleDomains.has(domain))) : {};
  return { ...result, data: { ...status, candidates: page, totalCandidates: rows.length,
    nextOffset: offset + page.length < rows.length ? offset + page.length : null,
    ...(Object.keys(quotes).length ? { quoteUpdates: quotes } : {}) } };
}

/** Production defaults are the website's real product handlers, not copies. */
export function createMcpProductExecutor(dependencies: {
  domainSearch?: typeof domainSearch;
  membership?: typeof membership;
  savedDomains?: typeof savedDomains;
  trading?: typeof trading;
  quota?: typeof consumeApiKeyQuota;
} = {}): McpProductExecutor {
  return async (operation, args, principal) => {
    // Check again at the product boundary even if called outside MCP registration.
    const scope = productOperationScope(operation);
    assertApiKeyScopes(principal, [scope]);
    const output = captureResponse();
    if (operation === "domains_check" || operation === "domains_search") {
      const input = operation === "domains_check" ? { ...args,
        tlds: [...new Set((args.domains as string[]).map(value => value.split(".").at(-1)!))] } : args;
      let parsed: ReturnType<typeof parseNamesApiRequest>;
      try { parsed = parseNamesApiRequest(input); } catch {
        throw new AccountAccessError("invalid_request", 400, "Use valid domains or search criteria with supported TLDs.");
      }
      const quota = await (dependencies.quota ?? consumeApiKeyQuota)(principal, "domains");
      if (!quota.allowed) return { status: 429, data: { code: "rate_limited", error: "The shared search quota is exhausted. Retry after the reset time." },
        retryAfterSeconds: Math.max(1, Math.ceil((quota.resetAt - Date.now()) / 1000)) };
      // Stable, non-secret owner identity shares the engine quota across this
      // account's keys. Raw bearer tokens, cookies and caller headers stop here.
      const clientId = `mcp_${createHash("sha256").update(`${principal.environment}:${principal.userId}`).digest("hex").slice(0, 48)}`;
      const request = createTrustedApiEngineRequest({ method: "POST", headers: {} }, parsed, clientId, createRequestId());
      await (dependencies.domainSearch ?? domainSearch)(request, output.response);
      return output.result();
    }
    let method = "GET";
    let body: unknown;
    let query: Record<string, unknown> | undefined;
    if (operation === "saved_domains_list") query = args;
    else if (operation === "saved_domains_save" || operation === "saved_domains_remove") {
      method = operation === "saved_domains_save" ? "POST" : "DELETE";
      body = args;
    } else if (operation === "trading_start") { method = "POST"; body = { action: "start", ...args }; }
    else if (operation === "trading_advance") { method = "POST"; body = { action: "advance", ...args }; }
    else if (operation === "trading_stop") { method = "POST"; body = { action: "cancel", ...args }; }
    else if (operation === "trading_refresh_quote") { method = "POST"; body = { action: "refresh_quote", ...args }; }
    const headers = createDelegatedAccountHeaders({ userId: principal.userId, credentialId: principal.keyId,
      scopes: principal.scopes, environment: principal.environment, source: "api-key" },
    scope, method);
    const request = { method, headers, ...(body !== undefined ? { body } : {}), ...(query ? { query } : {}) };
    if (operation === "account_membership") await (dependencies.membership ?? membership)(request, output.response);
    else if (operation.startsWith("saved_domains_")) await (dependencies.savedDomains ?? savedDomains)(request, output.response);
    else {
      await (dependencies.trading ?? trading)(request, output.response);
      return presentTrading(output.result(), operation, args);
    }
    return output.result();
  };
}

export const executeMcpProduct = createMcpProductExecutor();
