import { AccountAccessError } from "../../_shared/account-error.js";
import { executeBrandLookup } from "../../_shared/brand-lookup.js";
import { executeBrandLookupRequest, parseBrandLookupRequest } from "../../_shared/brand-lookup-contract.js";
import { readBrandLookupBody, readBrandLookupHeader, type BrandLookupHttpRequest, type BrandLookupHttpResponse } from "../../_shared/brand-lookup-http.js";
import { createRequestId, setPublicApiHeaders } from "../../_shared/public-api.js";

export const config = { maxDuration: 15 };
const REQUESTS_PER_MINUTE = 12;
const MAX_RATE_BUCKETS = 4096;

/** Public name-first database lookup. Request guards are per-instance and do
 * not claim a durable global/project quota or grant account access. */
export function createPublicBrandLookupHandler(dependencies: { execute?: typeof executeBrandLookup; now?: () => number } = {}) {
  const requests = new Map<string, { startedAt: number; count: number }>();
  return async (request: BrandLookupHttpRequest, response: BrandLookupHttpResponse): Promise<void> => {
    const requestId = createRequestId();
    response.setHeader("Cache-Control", "no-store"); response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer"); response.setHeader("X-Robots-Tag", "noindex, nofollow");
    setPublicApiHeaders(response, { requestId, allowMethods: "POST, OPTIONS" });
    const send = (status: number, body: unknown) => {
      response.setHeader("Content-Type", "application/json; charset=utf-8"); response.status(status).json(body);
    };
    try {
      if (Object.keys(request.headers).some(key => key.toLowerCase() === "authorization")) {
        throw new AccountAccessError("authorization_not_supported", 400, "This public lookup does not accept Authorization. Connect without credentials.");
      }
      let hasQuery = Boolean(request.query && Object.keys(request.query).length);
      try { hasQuery ||= Boolean(request.url && new URL(request.url, "https://sajda.invalid").searchParams.size); }
      catch { throw new AccountAccessError("invalid_request", 400, "Use the published brand-lookup endpoint without URL query parameters."); }
      if (hasQuery) throw new AccountAccessError("invalid_request", 400, "Brand lookups do not accept URL query parameters.");
      if (request.method === "OPTIONS") { response.status(204).end(); return; }
      if (request.method !== "POST") {
        response.setHeader("Allow", "POST, OPTIONS");
        throw new AccountAccessError("method_not_allowed", 405, "Use POST for brand lookups.");
      }
      const now = (dependencies.now ?? Date.now)();
      for (const [key, bucket] of requests) if (now - bucket.startedAt >= 60_000) requests.delete(key);
      const identity = (readBrandLookupHeader(request, "x-forwarded-for")?.split(",")[0].trim() || "unknown").slice(0, 128);
      const current = requests.get(identity);
      const resetAt = current ? current.startedAt + 60_000 : now + 60_000;
      if (current && current.count >= REQUESTS_PER_MINUTE || !current && requests.size >= MAX_RATE_BUCKETS) {
        setPublicApiHeaders(response, { requestId, allowMethods: "POST, OPTIONS", rateLimit: { limit: REQUESTS_PER_MINUTE, remaining: 0, resetAt } });
        response.setHeader("Retry-After", Math.max(1, Math.ceil((resetAt - now) / 1000)));
        throw new AccountAccessError("rate_limited", 429, "The public lookup request limit has been reached. Wait before retrying.");
      }
      if (current) current.count++; else requests.set(identity, { startedAt: now, count: 1 });
      setPublicApiHeaders(response, { requestId, allowMethods: "POST, OPTIONS", rateLimit: {
        limit: REQUESTS_PER_MINUTE, remaining: REQUESTS_PER_MINUTE - (current?.count ?? 1), resetAt,
      } });
      const input = parseBrandLookupRequest(await readBrandLookupBody(request));
      send(200, await executeBrandLookupRequest(input, dependencies.execute ?? executeBrandLookup));
    } catch (error) {
      const safe = error instanceof AccountAccessError ? error
        : new AccountAccessError("lookup_unavailable", 503, "The brand lookup could not be completed. Try again later.");
      const retry = "retryAfterSeconds" in safe ? Number(safe.retryAfterSeconds) : NaN;
      if (safe.status === 429 && Number.isFinite(retry) && retry > 0) response.setHeader("Retry-After", Math.ceil(retry));
      send(safe.status, { code: safe.code, error: safe.message, requestId });
    }
  };
}

export default createPublicBrandLookupHandler();
