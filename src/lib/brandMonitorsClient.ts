import { accountRequest, readAccountSession } from "@/integrations/neon/auth";
import { assertAccountSessionOwner, type AccountRequestScope } from "./accountRequestScope";
import { throwIfCancelled } from "./abort";
import {
  brandMonitorsMutationSchema, brandMonitorsSelectorSchema, brandMonitorsResponseSchema, brandMonitorMutationResponseSchema,
  type BrandMonitorsMutationInput, type BrandMonitorsSelector,
} from "../../shared/brand-monitors";
import type { z } from "zod/v4";

export type BrandMonitorsErrorCode = "unavailable" | "disabled" | "not_found" | "conflict" | "request_conflict" | "entitlement_required" | "history_full" | "version_limit" | "request_limit" | "invalid" | "invalid_response" | "account_changed" | "unauthenticated" | "verification_required" | "rate_limited";
export class BrandMonitorsError extends Error {
  constructor(readonly code: BrandMonitorsErrorCode, readonly requestId?: string, readonly writeMayHaveCompleted = false) { super(code); this.name = "BrandMonitorsError"; }
}
export function brandMonitorFailureIsUncertain(error: unknown): boolean {
  return !(error instanceof BrandMonitorsError) || error.writeMayHaveCompleted || ["unavailable", "invalid_response", "account_changed", "unauthenticated"].includes(error.code);
}
type MutationResponse = z.infer<typeof brandMonitorMutationResponseSchema>;
export function confirmBrandMonitorMutation(value: MutationResponse, input: BrandMonitorsMutationInput): MutationResponse {
  const monitor = value.monitor;
  if (monitor.reportId !== input.reportId
    || input.action === "enable" && (monitor.version !== 1 || monitor.reportVersion !== input.expectedReportVersion || monitor.status !== "active")
    || ["pause", "resume", "rebind"].includes(input.action) && "expectedMonitorVersion" in input && monitor.version !== (input.action === "pause" ? Math.min(input.expectedMonitorVersion + 1, 10000) : input.expectedMonitorVersion + 1)
    || input.action === "pause" && (monitor.status !== "paused" || monitor.pauseReason !== "user")
    || (input.action === "resume" || input.action === "rebind") && monitor.status !== "active"
    || input.action === "rebind" && monitor.reportVersion !== input.expectedReportVersion
    || input.action === "ack" && (value.acknowledgedAlert?.id !== input.alertId || value.acknowledgedAlert.reportId !== input.reportId || value.acknowledgedAlert.acknowledgedAt === null)
    || input.action !== "ack" && value.acknowledgedAlert !== null) throw new BrandMonitorsError("invalid_response");
  return value;
}
function classify(cause: unknown): BrandMonitorsError {
  if (cause instanceof BrandMonitorsError) return cause;
  const detail = (cause && typeof cause === "object" ? cause : {}) as { status?: number; code?: string; requestId?: string };
  const code: BrandMonitorsErrorCode = detail.code === "account_changed" ? "account_changed" : detail.status === 401 ? "unauthenticated"
    : detail.code === "monitor_plan_required" || detail.code === "monitor_plan_limit" ? "entitlement_required"
      : detail.code === "monitor_history_full" ? "history_full" : detail.code === "monitor_version_limit" ? "version_limit" : detail.code === "monitor_request_limit" ? "request_limit"
      : detail.status === 403 ? "verification_required" : detail.code === "report_not_found" || detail.code === "monitor_not_found" || detail.code === "alert_not_found" ? "not_found"
        : detail.code === "monitor_request_conflict" ? "request_conflict" : detail.status === 404 ? "disabled" : detail.status === 409 ? "conflict"
          : detail.status === 429 ? "rate_limited" : detail.status === 400 || detail.status === 413 ? "invalid" : "unavailable";
  return new BrandMonitorsError(code, typeof detail.requestId === "string" && /^req_[A-Za-z0-9_-]{16}$/u.test(detail.requestId) ? detail.requestId : undefined);
}
async function request(scope: AccountRequestScope, selector?: BrandMonitorsSelector, raw?: BrandMonitorsMutationInput) {
  const accountId = scope?.accountId, signal = scope?.signal;
  let transportReturned = false;
  try {
    throwIfCancelled(signal);
    if (!accountId || typeof accountId !== "string") throw new BrandMonitorsError("unauthenticated");
    if (selector === undefined && raw === undefined) throw new BrandMonitorsError("invalid");
    const mutation = raw === undefined ? undefined : brandMonitorsMutationSchema.safeParse(raw);
    const selected = selector === undefined ? undefined : brandMonitorsSelectorSchema.safeParse(selector);
    if (mutation && !mutation.success || selected && !selected.success) throw new BrandMonitorsError("invalid");
    const input = mutation?.success ? mutation.data : undefined, query = selected?.success ? selected.data : undefined;
    const params = new URLSearchParams();
    if (query) { params.set("reportId", query.reportId); params.set("alertOffset", String(query.alertOffset)); params.set("alertLimit", String(query.alertLimit)); }
    const serialized = params.toString();
    const value = await accountRequest<unknown>(`/api/account/brand-monitors${serialized ? `?${serialized}` : ""}`, { accountId, signal, ...(input ? { method: "POST", body: input } : {}) });
    transportReturned = true; throwIfCancelled(signal);
    const parsed = input ? brandMonitorMutationResponseSchema.safeParse(value) : brandMonitorsResponseSchema.safeParse(value);
    if (!parsed.success) throw new BrandMonitorsError("invalid_response");
    if (parsed.data.accountId !== accountId) throw new BrandMonitorsError("account_changed");
    const session = await readAccountSession(); throwIfCancelled(signal);
    if (!session || typeof session.expires_at !== "number" || !Number.isFinite(session.expires_at) || session.expires_at <= Date.now() / 1000) throw new BrandMonitorsError("unauthenticated");
    assertAccountSessionOwner(session.user?.id, accountId);
    if (session.user.email_verified !== true) throw new BrandMonitorsError("verification_required");
    if ("acknowledgedAlert" in parsed.data) { if (!input) throw new BrandMonitorsError("invalid_response"); confirmBrandMonitorMutation(parsed.data, input); }
    else if (!query || parsed.data.monitor && parsed.data.monitor.reportId !== query.reportId || parsed.data.alertOffset !== query.alertOffset || parsed.data.alertLimit !== query.alertLimit
      || parsed.data.alerts.some((alert, index, rows) => alert.reportId !== query.reportId || index > 0 && Date.parse(rows[index - 1].createdAt) < Date.parse(alert.createdAt))) throw new BrandMonitorsError("invalid_response");
    return parsed.data;
  } catch (cause) {
    if (signal?.aborted) throw cause;
    const error = classify(cause);
    throw raw !== undefined && transportReturned ? new BrandMonitorsError(error.code, error.requestId, true) : error;
  }
}
export async function getBrandMonitors(scope: AccountRequestScope, selector: BrandMonitorsSelector) {
  const value = await request(scope, selector);
  if ("acknowledgedAlert" in value) throw new BrandMonitorsError("invalid_response");
  return value;
}
export async function changeBrandMonitor(scope: AccountRequestScope, input: BrandMonitorsMutationInput) {
  const value = await request(scope, undefined, input);
  if (!("acknowledgedAlert" in value)) throw new BrandMonitorsError("invalid_response");
  return value;
}
