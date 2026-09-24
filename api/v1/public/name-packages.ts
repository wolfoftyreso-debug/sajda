import { AccountAccessError } from "../../_shared/account-error.js";
import { parseNamePackageSearchRequest } from "../../_shared/name-package-contract.js";
import { assertNamePackageQuery, readNamePackageBody, sendNamePackageJson, setNamePackageResponseHeaders, type NamePackageHttpRequest, type NamePackageHttpResponse } from "../../_shared/name-package-http.js";
import { createPublicMcpExecutor, type PublicMcpExecutor } from "../../_shared/public-mcp-tools.js";
import { createRequestId, setPublicApiHeaders } from "../../_shared/public-api.js";

export const config = { maxDuration: 30 };

/** Anonymous exploration shares the engine's existing public search budget. */
export function createPublicNamePackagesApiHandler(dependencies: { execute?: PublicMcpExecutor } = {}) {
  return async (request: NamePackageHttpRequest, response: NamePackageHttpResponse): Promise<void> => {
    const requestId = createRequestId();
    setNamePackageResponseHeaders(response);
    setPublicApiHeaders(response, { requestId, allowMethods: "POST, OPTIONS" });
    try {
      assertNamePackageQuery(request);
      if (Object.keys(request.headers).some(name => name.toLowerCase() === "authorization")) {
        throw new AccountAccessError("authorization_not_supported", 400,
          "This public endpoint does not accept Authorization. Use /api/v1/name-packages for scoped API-key access.");
      }
      if (request.method === "OPTIONS") { response.status(204).end(); return; }
      if (request.method !== "POST") {
        response.setHeader("Allow", "POST, OPTIONS");
        throw new AccountAccessError("method_not_allowed", 405, "Use POST for name-package searches.");
      }
      const input = parseNamePackageSearchRequest(await readNamePackageBody(request));
      const execute = dependencies.execute ?? createPublicMcpExecutor(request.headers, requestId);
      const result = await execute("name_packages_search", input);
      sendNamePackageJson(response, 200, result);
    } catch (error) {
      const safe = error instanceof AccountAccessError ? error
        : new AccountAccessError("search_unavailable", 503, "Name-package checks could not be completed. Try again later.");
      const retry = "retryAfterSeconds" in safe ? Number(safe.retryAfterSeconds) : NaN;
      if (Number.isFinite(retry) && retry > 0) response.setHeader("Retry-After", Math.ceil(retry));
      sendNamePackageJson(response, safe.status, { code: safe.code, error: safe.message, requestId });
    }
  };
}

export default createPublicNamePackagesApiHandler();
