import { z } from "zod/v4";
import { BRAND_REPORT_MAX_BYTES, brandReportSaveSchema, brandReportSelectorSchema } from "../../shared/brand-reports.js";
import { AccountAccessError, requireAccount } from "../_shared/account-auth.js";
import { brandReportsStore } from "../_shared/brand-reports-store.js";
import { createRequestId } from "../_shared/public-api.js";
import { readRequestQuery } from "../_shared/request-query.js";

interface RequestLike { method?: string; headers?: Record<string, string | string[] | undefined>; query?: Record<string, unknown>; url?: string; body?: unknown }
interface ResponseLike { setHeader(name: string, value: string | number): void; status(code: number): ResponseLike; json(value: unknown): void }
const saveSchema = z.strictObject({ report: brandReportSaveSchema });
const historyQuerySchema = z.strictObject({ id: brandReportSelectorSchema.shape.id, history: z.literal("true") });
const getQuerySchema = z.strictObject({ id: brandReportSelectorSchema.shape.id,
  version: z.string().regex(/^[1-9][0-9]{0,2}$/u).transform(Number).pipe(brandReportSelectorSchema.shape.version.unwrap()).optional() });
export const config = { maxDuration: 15 };
function body(request: RequestLike) {
  if (typeof request.headers?.["content-type"] !== "string" || !/^application\/json(?:\s*;|$)/iu.test(request.headers["content-type"])) {
    throw new AccountAccessError("unsupported_media_type", 415, "Send an application/json request.");
  }
  try {
    const supplied = request.body;
    const encoded = typeof supplied === "string" ? supplied : JSON.stringify(supplied);
    if (!encoded || Buffer.byteLength(encoded, "utf8") > BRAND_REPORT_MAX_BYTES) {
      throw new AccountAccessError("request_too_large", 413, "This report request is too large.");
    }
    return saveSchema.parse(JSON.parse(encoded));
  } catch (error) {
    if (error instanceof AccountAccessError) throw error;
    throw new AccountAccessError("invalid_request", 400, "Enter valid report details and original self-assessment declarations.");
  }
}
/** Private persisted declarations, never an independent brand-control proof. */
export function createBrandReportsHandler(deps: {
  authorize?: typeof requireAccount; store?: typeof brandReportsStore; enabled?: () => boolean;
} = {}) {
  return async (request: RequestLike, response: ResponseLike): Promise<void> => {
    const requestId = createRequestId();
    for (const [name, value] of Object.entries({ "Cache-Control": "private, no-store", "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", Vary: "Cookie, Origin", "X-Request-Id": requestId,
      "X-Robots-Tag": "noindex, nofollow" })) response.setHeader(name, value);
    if (!(deps.enabled ?? (() => process.env.SAJDA_BRAND_REPORTS_ENABLED === "true"))()) {
      response.status(404).json({ code: "not_available", error: "Brand reports are not available in this environment.", requestId }); return;
    }
    if (!request.method || !["GET", "POST"].includes(request.method)) {
      response.setHeader("Allow", "GET, POST");
      response.status(405).json({ code: "method_not_allowed", error: "Use GET or POST.", requestId }); return;
    }
    try {
      const account = await (deps.authorize ?? requireAccount)(request.headers, { verifiedEmail: true, method: request.method });
      const query = readRequestQuery(request);
      const store = deps.store ?? brandReportsStore;
      if (request.method === "POST") {
        if (Object.keys(query).length) throw new AccountAccessError("invalid_request", 400, "Save requests do not accept query parameters.");
        const input = body(request);
        await store.limit(account.id);
        response.status(200).json({ accountId: account.id, report: await store.save(account.id, input.report), requestId }); return;
      }
      if (!Object.keys(query).length) {
        await store.limit(account.id);
        response.status(200).json({ accountId: account.id, reports: await store.list(account.id), requestId }); return;
      }
      if (query.history !== undefined) {
        const input = historyQuerySchema.safeParse(query);
        if (!input.success) throw new AccountAccessError("invalid_request", 400, "Use one report ID and history=true.");
        await store.limit(account.id);
        response.status(200).json({ accountId: account.id, versions: await store.history(account.id, input.data.id), requestId }); return;
      }
      const input = getQuerySchema.safeParse(query);
      if (!input.success) throw new AccountAccessError("invalid_request", 400, "Use one report ID and an optional saved version.");
      await store.limit(account.id);
      response.status(200).json({ accountId: account.id, report: await store.get(account.id, input.data), requestId });
    } catch (error) {
      const failure = error instanceof AccountAccessError ? error : new AccountAccessError("brand_reports_unavailable", 503,
        "Brand reports are temporarily unavailable. A save may have completed; retry the same save before editing again.");
      if (failure.status === 429) response.setHeader("Retry-After", 60);
      if (failure.status >= 500) console.error(JSON.stringify({ event: "brand_reports_failed", requestId, code: failure.code }));
      response.status(failure.status).json({ code: failure.code, error: failure.message, requestId });
    }
  };
}
export default createBrandReportsHandler();
