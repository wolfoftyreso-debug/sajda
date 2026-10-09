import { accountRequest, readAccountSession } from "@/integrations/neon/auth";
import { assertAccountSessionOwner, type AccountRequestScope } from "./accountRequestScope";
import { throwIfCancelled } from "./abort";
import {
  brandChecksStartSchema, brandChecksHistorySelectorSchema, brandCheckResponseSchema, brandChecksHistoryResponseSchema,
  type BrandChecksStartInput, type BrandChecksHistorySelector, type BrandCheckRun,
} from "../../shared/brand-checks";

export type BrandChecksErrorCode = "unavailable" | "disabled" | "not_found" | "conflict" | "request_conflict" | "pending" | "limit" | "daily_limit" | "scope_empty" | "scope_limit" | "invalid" | "invalid_response" | "account_changed" | "unauthenticated" | "verification_required" | "rate_limited";
export class BrandChecksError extends Error {
  constructor(readonly code: BrandChecksErrorCode, readonly requestId?: string, readonly writeMayHaveCompleted = false) { super(code); this.name = "BrandChecksError"; }
}
export function brandCheckFailureIsUncertain(error: unknown): boolean {
  return !(error instanceof BrandChecksError) || error.writeMayHaveCompleted || ["unavailable", "invalid_response", "account_changed", "unauthenticated"].includes(error.code);
}
export function confirmBrandCheckStart(run: BrandCheckRun, input: BrandChecksStartInput): BrandCheckRun {
  if (run.id !== input.requestKey || run.reportId !== input.reportId || run.reportVersion !== input.expectedVersion) throw new BrandChecksError("invalid_response");
  return run;
}
function classify(cause: unknown): BrandChecksError {
  if (cause instanceof BrandChecksError) return cause;
  const detail = (cause && typeof cause === "object" ? cause : {}) as { status?: number; code?: string; requestId?: string };
  const code: BrandChecksErrorCode = detail.code === "account_changed" ? "account_changed" : detail.status === 401 ? "unauthenticated" : detail.status === 403 ? "verification_required"
    : detail.code === "report_not_found" ? "not_found" : detail.code === "check_request_conflict" ? "request_conflict" : detail.code === "check_pending" ? "pending"
      : detail.code === "check_limit_reached" ? "limit" : detail.code === "check_daily_limit" ? "daily_limit" : detail.code === "check_scope_empty" ? "scope_empty" : detail.code === "check_scope_limit" ? "scope_limit"
        : detail.status === 404 ? "disabled" : detail.status === 409 ? "conflict" : detail.status === 429 ? "rate_limited" : detail.status === 400 || detail.status === 413 ? "invalid" : "unavailable";
  return new BrandChecksError(code, typeof detail.requestId === "string" && /^req_[A-Za-z0-9_-]{16}$/u.test(detail.requestId) ? detail.requestId : undefined);
}
async function request(scope: AccountRequestScope, selector?: BrandChecksHistorySelector, raw?: BrandChecksStartInput) {
  const accountId = scope?.accountId, signal = scope?.signal;
  let transportReturned = false;
  try {
    throwIfCancelled(signal);
    if (!accountId || typeof accountId !== "string") throw new BrandChecksError("unauthenticated");
    if (selector === undefined && raw === undefined) throw new BrandChecksError("invalid");
    const start = raw === undefined ? undefined : brandChecksStartSchema.safeParse(raw);
    const selected = selector === undefined ? undefined : brandChecksHistorySelectorSchema.safeParse(selector);
    if (start && !start.success || selected && !selected.success) throw new BrandChecksError("invalid");
    const input = start?.success ? start.data : undefined, query = selected?.success ? selected.data : undefined;
    const params = new URLSearchParams();
    if (query) { params.set("reportId", query.reportId); if (query.version !== undefined) params.set("version", String(query.version)); params.set("offset", String(query.offset)); params.set("limit", String(query.limit)); }
    const serialized = params.toString();
    const value = await accountRequest<unknown>(`/api/account/brand-checks${serialized ? `?${serialized}` : ""}`, { accountId, signal, ...(input ? { method: "POST", body: input } : {}) });
    transportReturned = true; throwIfCancelled(signal);
    const parsed = input ? brandCheckResponseSchema.safeParse(value) : brandChecksHistoryResponseSchema.safeParse(value);
    if (!parsed.success) throw new BrandChecksError("invalid_response");
    if (parsed.data.accountId !== accountId) throw new BrandChecksError("account_changed");
    const session = await readAccountSession(); throwIfCancelled(signal);
    if (!session || typeof session.expires_at !== "number" || !Number.isFinite(session.expires_at) || session.expires_at <= Date.now() / 1000) throw new BrandChecksError("unauthenticated");
    assertAccountSessionOwner(session.user?.id, accountId);
    if (session.user.email_verified !== true) throw new BrandChecksError("verification_required");
    if ("run" in parsed.data) { if (!input) throw new BrandChecksError("invalid_response"); confirmBrandCheckStart(parsed.data.run, input); }
    else if (!query || parsed.data.offset !== query.offset || parsed.data.limit !== query.limit || parsed.data.runs.some((run, index, rows) => run.reportId !== query.reportId || query.version !== undefined && run.reportVersion !== query.version || index > 0 && Date.parse(rows[index - 1].requestedAt) < Date.parse(run.requestedAt))
      || new Set(parsed.data.runs.map(run => run.id)).size !== parsed.data.runs.length) throw new BrandChecksError("invalid_response");
    return parsed.data;
  } catch (cause) {
    if (signal?.aborted) throw cause;
    const error = classify(cause);
    throw raw !== undefined && transportReturned ? new BrandChecksError(error.code, error.requestId, true) : error;
  }
}
export async function getBrandChecks(scope: AccountRequestScope, selector: BrandChecksHistorySelector) {
  const value = await request(scope, selector);
  if (!("runs" in value)) throw new BrandChecksError("invalid_response");
  return value;
}
export async function startBrandCheck(scope: AccountRequestScope, input: BrandChecksStartInput) {
  const value = await request(scope, undefined, input);
  if (!("run" in value)) throw new BrandChecksError("invalid_response");
  return value;
}
