import domainSearch, { createTrustedApiEngineRequest, createTrustedConnectorEngineRequest } from "../domain-search.js";
import membership from "../account/membership.js";
import savedDomains from "../account/saved-domains.js";
import trading from "../account/lost-domains.js";
import nameProjects from "../account/name-projects.js";
import socialProfiles from "../account/name-package-social.js";
import tradingScenarios from "../account/trading-scenarios.js";
import { AccountAccessError } from "./account-error.js";
import { createDelegatedAccountHeaders } from "./delegated-account.js";
import { apiKeyEngineClientId, assertApiKeyScopes, consumeApiKeyQuota } from "./developer-api-keys.js";
import { parseNamesApiRequest } from "./names-contract.js";
import { createRequestId } from "./public-api.js";
import { recordNamePackageMetrics } from "./name-package-metrics.js";
import { parseProductOperationInput, productOperationScope, type McpOperation, type McpProductExecutor, type McpProductResult } from "./mcp-tools.js";
import { parseNamePackageSearchRequest } from "./name-package-contract.js";
import { projectNamePackageIntelligence } from "../../shared/name-package-intelligence.js";
import { completeNamePackageCandidateEvidence, generateNamePackageCandidates } from "./name-package-candidates.js";
import { executeBrandIndexAssessment } from "./brand-index.js";
import { executeBrandLookup } from "./brand-lookup.js";
import { executeBrandLookupRequest } from "./brand-lookup-contract.js";
import { executeBusinessNamesRecommendation } from "./business-names.js";

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

/** The browser save handlers return a whole workspace for refresh. A write-only
 * API key must receive only its mutation receipt, never unrelated saved data. */
function presentWorkspaceMutation(result: McpProductResult, operation: McpOperation, args: Record<string, unknown>): McpProductResult {
  if (result.status < 200 || result.status >= 300 || operation !== "name_projects_save" && operation !== "trading_scenarios_save") return result;
  const field = operation === "name_projects_save" ? "projects" : "scenarios";
  const input = args[operation === "name_projects_save" ? "project" : "scenario"] as { id: string };
  const rows = result.data[field];
  const receipt = Array.isArray(rows) ? rows.filter(row => row && typeof row === "object" && row.id === input.id) : [];
  if (receipt.length !== 1) return { status: 503, data: { code: "mutation_receipt_unavailable",
    error: "The save may have completed, but its receipt is unavailable. Retry the identical request before editing again." } };
  return { ...result, data: { accountId: result.data.accountId, requestId: result.data.requestId, [field]: receipt } };
}

/** Production defaults are the website's real product handlers, not copies. */
export function createMcpProductExecutor(dependencies: {
  domainSearch?: typeof domainSearch;
  membership?: typeof membership;
  savedDomains?: typeof savedDomains;
  trading?: typeof trading;
  nameProjects?: typeof nameProjects;
  socialProfiles?: typeof socialProfiles;
  tradingScenarios?: typeof tradingScenarios;
  quota?: typeof consumeApiKeyQuota;
  lookup?: typeof executeBrandLookup;
} = {}): McpProductExecutor {
  const execute: McpProductExecutor = async (operation, suppliedArgs, principal) => {
    // Check again at the product boundary even if called outside MCP registration.
    const scope = productOperationScope(operation);
    assertApiKeyScopes(principal, [scope]);
    const args = parseProductOperationInput(operation, suppliedArgs);
    if (operation === "business_names_recommend") {
      let requestId: string | undefined;
      const data = await executeBusinessNamesRecommendation(args, async input => {
        const result = await execute("name_packages_search", input, principal);
        requestId = result.requestId;
        if (result.status < 200 || result.status >= 300) {
          const error = new AccountAccessError(typeof result.data.code === "string" ? result.data.code : "search_unavailable",
            result.status, typeof result.data.error === "string" ? result.data.error : "Naming checks could not be completed.");
          if (result.retryAfterSeconds !== undefined) Object.assign(error, { retryAfterSeconds: result.retryAfterSeconds });
          throw error;
        }
        return result.data;
      });
      return { status: 200, data, ...(requestId ? { requestId } : {}) };
    }
    if (operation === "brand_lookup") return { status: 200, data: await executeBrandLookupRequest(args, dependencies.lookup ?? executeBrandLookup) };
    if (operation === "brand_index_assess") return { status: 200, data: executeBrandIndexAssessment(args) };
    const output = captureResponse();
    if (operation === "domains_check" || operation === "domains_search" || operation === "name_packages_search") {
      const packageInput = operation === "name_packages_search" ? parseNamePackageSearchRequest(args) : null;
      let packageCandidates: ReturnType<typeof generateNamePackageCandidates> | null = null;
      try { if (packageInput) packageCandidates = generateNamePackageCandidates(packageInput); }
      catch { throw new AccountAccessError("invalid_request", 400, "Use a descriptive naming brief containing Latin-letter keywords, without URLs or markup."); }
      const input = packageInput ? { query: packageInput.query, tlds: packageInput.tlds,
        count: packageInput.count, locale: packageInput.locale,
        ...(packageInput.providers ? { providers: packageInput.providers } : {}) }
        : operation === "domains_check" ? { ...args,
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
      const clientId = apiKeyEngineClientId(principal);
      const engineRequestId = createRequestId();
      const request = packageCandidates
        ? createTrustedConnectorEngineRequest({ method: "POST", headers: {} }, parsed, clientId, engineRequestId, packageCandidates.domains)
        : createTrustedApiEngineRequest({ method: "POST", headers: {} }, parsed, clientId, engineRequestId);
      await (dependencies.domainSearch ?? domainSearch)(request, output.response);
      const result = output.result();
      if (!packageInput) return result;
      if (result.status < 200 || result.status >= 300) {
        const status = result.status === 429 ? 429 : result.status === 400 ? 400 : 503;
        return { status, data: { code: status === 429 ? "rate_limited" : status === 400 ? "invalid_request" : "search_unavailable",
          error: status === 429 ? "The shared search quota is exhausted. Retry after the reset time."
            : status === 400 ? "Use descriptive Latin-letter keywords and supported domain endings. Change the input before retrying."
            : "Name-package checks could not be completed. Try again later." },
          ...(result.retryAfterSeconds !== undefined ? { retryAfterSeconds: result.retryAfterSeconds } : {}) };
      }
      const intelligence = projectNamePackageIntelligence(completeNamePackageCandidateEvidence(result.data, packageCandidates!.domains), {
        platforms: packageInput.platforms, requiredTlds: packageInput.tlds, markets: packageInput.markets, limit: packageInput.count,
      });
      recordNamePackageMetrics(intelligence, { requestId: engineRequestId, surface: "account" });
      return { ...result, requestId: engineRequestId, data: intelligence };
    }
    let method = "GET";
    let body: unknown;
    let query: Record<string, unknown> | undefined;
    if (operation === "saved_domains_list") query = args;
    else if (operation === "name_projects_save") { method = "POST"; body = { action: "save", ...args }; }
    else if (operation === "trading_scenarios_save") { method = "POST"; body = { action: "save", ...args }; }
    else if (operation === "social_profiles_check") { method = "POST"; body = args; }
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
    else if (operation === "name_projects_list" || operation === "name_projects_save") await (dependencies.nameProjects ?? nameProjects)(request, output.response);
    else if (operation === "social_profiles_check") await (dependencies.socialProfiles ?? socialProfiles)(request, output.response);
    else if (operation === "trading_scenarios_list" || operation === "trading_scenarios_save") await (dependencies.tradingScenarios ?? tradingScenarios)(request, output.response);
    else if (operation.startsWith("saved_domains_")) await (dependencies.savedDomains ?? savedDomains)(request, output.response);
    else {
      await (dependencies.trading ?? trading)(request, output.response);
      return presentTrading(output.result(), operation, args);
    }
    return presentWorkspaceMutation(output.result(), operation, args);
  };
  return execute;
}

export const executeMcpProduct = createMcpProductExecutor();
