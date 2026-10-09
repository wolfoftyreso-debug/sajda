import { brandChecksHistorySelectorSchema, brandChecksStartSchema } from "../../shared/brand-checks.js";
import { AccountAccessError, requireAccount } from "../_shared/account-auth.js";
import { brandChecksStore } from "../_shared/brand-checks-store.js";
import { createRequestId } from "../_shared/public-api.js";
import { readRequestQuery } from "../_shared/request-query.js";
import { z } from "zod/v4";

interface RequestLike { method?: string; headers?: Record<string, string | string[] | undefined>; query?: Record<string, unknown>; url?: string; body?: unknown }
interface ResponseLike { setHeader(name: string, value: string | number): void; status(code: number): ResponseLike; json(value: unknown): void }
const integer = z.string().regex(/^(?:0|[1-9][0-9]{0,2})$/u).transform(Number);
const querySchema = z.strictObject({ reportId: brandChecksHistorySelectorSchema.shape.reportId,
  version: integer.optional(), offset: integer.optional(), limit: integer.optional() }).pipe(brandChecksHistorySelectorSchema);
export const config = { maxDuration: 60 };
function body(request: RequestLike) {
  if (typeof request.headers?.["content-type"] !== "string" || !/^application\/json(?:\s*;|$)/iu.test(request.headers["content-type"])) {
    throw new AccountAccessError("unsupported_media_type", 415, "Send an application/json request.");
  }
  try {
    const supplied = request.body, encoded = typeof supplied === "string" ? supplied : JSON.stringify(supplied);
    if (!encoded) throw new AccountAccessError("invalid_request", 400, "Send the saved report identity as a JSON object.");
    if (Buffer.byteLength(encoded, "utf8") > 1024) throw new AccountAccessError("request_too_large", 413, "This check request is too large.");
    return brandChecksStartSchema.parse(JSON.parse(encoded));
  } catch (error) {
    if (error instanceof AccountAccessError) throw error;
    throw new AccountAccessError("invalid_request", 400, "Select one saved report, its latest version and one check request identifier.");
  }
}
export function createBrandChecksHandler(deps: {
  authorize?: typeof requireAccount; store?: typeof brandChecksStore; enabled?: () => boolean;
} = {}) {
  return async (request: RequestLike, response: ResponseLike): Promise<void> => {
    const requestId = createRequestId();
    for (const [name, value] of Object.entries({ "Cache-Control": "private, no-store", "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", Vary: "Cookie, Origin", "X-Request-Id": requestId,
      "X-Robots-Tag": "noindex, nofollow" })) response.setHeader(name, value);
    if (!(deps.enabled ?? (() => process.env.SAJDA_BRAND_REPORTS_ENABLED === "true" && process.env.SAJDA_BRAND_CHECKS_ENABLED === "true"))()) {
      response.status(404).json({ code: "not_available", error: "Saved report checks are not available in this environment.", requestId }); return;
    }
    if (!request.method || !["GET", "POST"].includes(request.method)) {
      response.setHeader("Allow", "GET, POST"); response.status(405).json({ code: "method_not_allowed", error: "Use GET or POST.", requestId }); return;
    }
    try {
      const account = await (deps.authorize ?? requireAccount)(request.headers, { verifiedEmail: true, method: request.method });
      const query = readRequestQuery(request), store = deps.store ?? brandChecksStore;
      if (request.method === "POST") {
        if (Object.keys(query).length) throw new AccountAccessError("invalid_request", 400, "Check starts do not accept query parameters.");
        const input = body(request); await store.limit(account.id);
        response.status(200).json({ accountId: account.id, run: await store.start(account.id, input), requestId }); return;
      }
      const input = querySchema.safeParse(query);
      if (!input.success) throw new AccountAccessError("invalid_request", 400, "Use one saved report ID and optional version, offset and limit.");
      await store.limit(account.id);
      response.status(200).json({ accountId: account.id, ...await store.history(account.id, input.data), requestId });
    } catch (error) {
      const failure = error instanceof AccountAccessError ? error : new AccountAccessError("brand_checks_unavailable", 503,
        "Registry check status is temporarily unavailable. The check may have started; retry the same request before starting another.");
      if (failure.status === 429 && failure.code !== "check_daily_limit") response.setHeader("Retry-After", 60);
      if (failure.status >= 500) console.error(JSON.stringify({ event: "brand_checks_failed", requestId, code: failure.code }));
      response.status(failure.status).json({ code: failure.code, error: failure.message, requestId });
    }
  };
}
export default createBrandChecksHandler();
