import { timingSafeEqual } from "node:crypto";
import { brandMonitorsEnabled } from "../account/brand-monitors.js";
import { brandMonitorsStore } from "../_shared/brand-monitors-store.js";
import { createRequestId } from "../_shared/public-api.js";
import { readRequestQuery } from "../_shared/request-query.js";

interface RequestLike { method?: string; headers?: Record<string, string | string[] | undefined>; query?: Record<string, unknown>; url?: string }
interface ResponseLike { setHeader(name: string, value: string | number): void; status(code: number): ResponseLike; json(value: unknown): void }
export const config = { maxDuration: 180 };
export function validBrandMonitorsCronSecret(header: unknown, secret: unknown) {
  if (typeof secret !== "string" || secret.length < 32 || secret.length > 256 || typeof header !== "string") return false;
  const expected = Buffer.from(`Bearer ${secret}`), actual = Buffer.from(header);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export function createBrandMonitorsCronHandler(deps: { store?: Pick<typeof brandMonitorsStore, "tick">; enabled?: () => boolean;
  cronEnabled?: () => boolean; secret?: () => string | undefined } = {}) {
  return async (request: RequestLike, response: ResponseLike): Promise<void> => {
    const requestId = createRequestId();
    response.setHeader("Cache-Control", "private, no-store"); response.setHeader("X-Robots-Tag", "noindex, nofollow");
    response.setHeader("Content-Type", "application/json; charset=utf-8"); response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Request-Id", requestId);
    if (request.method !== "GET") { response.setHeader("Allow", "GET"); response.status(405).json({ code: "method_not_allowed", requestId }); return; }
    if (!validBrandMonitorsCronSecret(request.headers?.authorization, (deps.secret ?? (() => process.env.CRON_SECRET))())) {
      response.status(401).json({ code: "authentication_required", requestId }); return;
    }
    if (Object.keys(readRequestQuery(request)).length) { response.status(400).json({ code: "invalid_request", requestId }); return; }
    if (!(deps.enabled ?? brandMonitorsEnabled)() || !(deps.cronEnabled ?? (() => process.env.SAJDA_BRAND_MONITORS_CRON_ENABLED === "true"))()) {
      response.status(200).json({ state: "paused", requestId }); return;
    }
    try {
      const result = await (deps.store ?? brandMonitorsStore).tick();
      // Counts only: no owner, domain, source, price or credential in cron output.
      response.status(200).json({ state: result.busy ? "busy" : result.processed ? "advanced" : "idle", processed: result.processed, alerts: result.alerts, requestId });
    } catch {
      console.error(JSON.stringify({ event: "brand_monitor_cron_failed", requestId }));
      response.status(503).json({ code: "brand_monitors_unavailable", error: "Monitoring is temporarily unavailable. Retained check receipts will be reconciled on the next tick.", requestId });
    }
  };
}
export default createBrandMonitorsCronHandler();
