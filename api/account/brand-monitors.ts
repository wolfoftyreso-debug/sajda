import { z } from "zod/v4";
import { brandMonitorsMutationSchema, brandMonitorsSelectorSchema } from "../../shared/brand-monitors.js";
import { AccountAccessError, requireAccount } from "../_shared/account-auth.js";
import { brandMonitorsStore } from "../_shared/brand-monitors-store.js";
import { createRequestId } from "../_shared/public-api.js";
import { readRequestQuery } from "../_shared/request-query.js";

interface RequestLike { method?: string; headers?: Record<string, string | string[] | undefined>; query?: Record<string, unknown>; url?: string; body?: unknown }
interface ResponseLike { setHeader(name: string, value: string | number): void; status(code: number): ResponseLike; json(value: unknown): void }
const integer = z.string().regex(/^(?:0|[1-9][0-9]{0,3})$/u).transform(Number);
const querySchema = z.strictObject({ reportId: brandMonitorsSelectorSchema.shape.reportId,
  alertOffset: integer.optional(), alertLimit: integer.optional() }).pipe(brandMonitorsSelectorSchema);
export const config = { maxDuration: 20 };
export function brandMonitorsEnabled() {
  return process.env.SAJDA_BRAND_REPORTS_ENABLED === "true" && process.env.SAJDA_BRAND_CHECKS_ENABLED === "true"
    && process.env.SAJDA_BRAND_MONITORS_ENABLED === "true";
}
function body(request: RequestLike) {
  if (typeof request.headers?.["content-type"] !== "string" || !/^application\/json(?:\s*;|$)/iu.test(request.headers["content-type"])) {
    throw new AccountAccessError("unsupported_media_type", 415, "Send an application/json request.");
  }
  try {
    const raw = typeof request.body === "string" ? request.body : JSON.stringify(request.body);
    if (!raw) throw new AccountAccessError("invalid_request", 400, "Send one monitor action as a JSON object.");
    if (Buffer.byteLength(raw, "utf8") > 4096) throw new AccountAccessError("request_too_large", 413, "This monitor request is too large.");
    return brandMonitorsMutationSchema.parse(JSON.parse(raw));
  } catch (error) {
    if (error instanceof AccountAccessError) throw error;
    throw new AccountAccessError("invalid_request", 400, "Select one saved report, action, current version and request identifier.");
  }
}
export function createBrandMonitorsHandler(deps: { authorize?: typeof requireAccount; store?: typeof brandMonitorsStore; enabled?: () => boolean } = {}) {
  return async (request: RequestLike, response: ResponseLike): Promise<void> => {
    const requestId = createRequestId();
    for (const [key, value] of Object.entries({ "Cache-Control": "private, no-store", "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", Vary: "Cookie, Origin", "X-Request-Id": requestId,
      "X-Robots-Tag": "noindex, nofollow" })) response.setHeader(key, value);
    if (!(deps.enabled ?? brandMonitorsEnabled)()) {
      response.status(404).json({ code: "not_available", error: "Saved-report monitoring is not available in this environment.", requestId }); return;
    }
    if (!request.method || !["GET", "POST"].includes(request.method)) {
      response.setHeader("Allow", "GET, POST"); response.status(405).json({ code: "method_not_allowed", error: "Use GET or POST.", requestId }); return;
    }
    try {
      const account = await (deps.authorize ?? requireAccount)(request.headers, { verifiedEmail: true, method: request.method });
      const query = readRequestQuery(request), store = deps.store ?? brandMonitorsStore;
      if (request.method === "POST") {
        if (Object.keys(query).length) throw new AccountAccessError("invalid_request", 400, "Monitor changes do not accept query parameters.");
        const input = body(request); await store.limit(account.id);
        response.status(200).json({ accountId: account.id, ...await store.mutate(account.id, input), requestId }); return;
      }
      const input = querySchema.safeParse(query);
      if (!input.success) throw new AccountAccessError("invalid_request", 400, "Use one saved report ID and optional alert offset and limit.");
      await store.limit(account.id);
      response.status(200).json({ accountId: account.id, ...await store.get(account.id, input.data), requestId });
    } catch (error) {
      const failure = error instanceof AccountAccessError ? error : new AccountAccessError("brand_monitors_unavailable", 503,
        "Monitor status is temporarily unavailable. A change may have been saved; retry the same request before changing it again.");
      if (failure.status === 429) response.setHeader("Retry-After", 60);
      if (failure.status >= 500) console.error(JSON.stringify({ event: "brand_monitors_failed", requestId, code: failure.code }));
      response.status(failure.status).json({ code: failure.code, error: failure.message, requestId });
    }
  };
}
export default createBrandMonitorsHandler();
