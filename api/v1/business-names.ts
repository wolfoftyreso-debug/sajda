import { AccountAccessError } from "../_shared/account-error.js";
import { accountRequestOrigin } from "../_shared/account-origin.js";
import { assertApiKeyScopes, consumeApiKeyQuota, requireApiKey } from "../_shared/developer-api-keys.js";
import { executeMcpProduct } from "../_shared/mcp-product.js";
import type { McpProductExecutor } from "../_shared/mcp-tools.js";
import { parseBusinessNamesRequest } from "../_shared/business-names-contract.js";
import { assertNamePackageQuery, readNamePackageBody, readNamePackageHeader, sendNamePackageJson,
  setNamePackageResponseHeaders, type NamePackageHttpRequest, type NamePackageHttpResponse } from "../_shared/name-package-http.js";
import { createRequestId } from "../_shared/public-api.js";

export const config = { maxDuration: 30 };

/** API and MCP share the same recommendation operation and one domain quota. */
export function createBusinessNamesApiHandler(dependencies: {
  authorize?: typeof requireApiKey; quota?: typeof consumeApiKeyQuota;
  execute?: McpProductExecutor; requestOrigin?: typeof accountRequestOrigin;
} = {}) {
  return async (request: NamePackageHttpRequest, response: NamePackageHttpResponse): Promise<void> => {
    const requestId = createRequestId();
    setNamePackageResponseHeaders(response);
    response.setHeader("X-Sajda-Api-Version", "v1");
    response.setHeader("X-Request-Id", requestId);
    response.setHeader("Vary", "Authorization, Origin");
    try {
      assertNamePackageQuery(request);
      if (request.method !== "POST") {
        response.setHeader("Allow", "POST");
        throw new AccountAccessError("method_not_allowed", 405, "Use POST for business-name recommendations.");
      }
      const expectedOrigin = (dependencies.requestOrigin ?? accountRequestOrigin)(request.headers);
      const suppliedOrigin = readNamePackageHeader(request, "origin");
      if (suppliedOrigin !== undefined && suppliedOrigin !== expectedOrigin) {
        throw new AccountAccessError("invalid_origin", 403, "This request origin is not allowed.");
      }
      const principal = await (dependencies.authorize ?? requireApiKey)(request.headers, ["domains:search"]);
      assertApiKeyScopes(principal, ["domains:search"]);
      const input = parseBusinessNamesRequest(await readNamePackageBody(request));
      const quota = await (dependencies.quota ?? consumeApiKeyQuota)(principal, "requests");
      if (!quota.allowed) {
        response.setHeader("Retry-After", Math.max(1, Math.ceil((quota.resetAt - Date.now()) / 1000)));
        throw new AccountAccessError("rate_limited", 429, "The shared account API request limit has been reached.");
      }
      const result = await (dependencies.execute ?? executeMcpProduct)("business_names_recommend", input, principal);
      if (result.requestId) response.setHeader("X-Request-Id", result.requestId);
      if (result.retryAfterSeconds !== undefined) response.setHeader("Retry-After", result.retryAfterSeconds);
      sendNamePackageJson(response, result.status, result.data);
    } catch (error) {
      const safe = error instanceof AccountAccessError ? error
        : new AccountAccessError("search_unavailable", 503, "Business-name checks could not be completed. Try again later.");
      const retry = "retryAfterSeconds" in safe ? Number(safe.retryAfterSeconds) : NaN;
      if (Number.isFinite(retry) && retry > 0) response.setHeader("Retry-After", Math.ceil(retry));
      if (safe.status === 401) response.setHeader("WWW-Authenticate", 'Bearer realm="sajda-api", error="invalid_token"');
      sendNamePackageJson(response, safe.status, { code: safe.code, error: safe.message, requestId });
    }
  };
}

export default createBusinessNamesApiHandler();
