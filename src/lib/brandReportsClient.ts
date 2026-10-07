import { accountRequest, readAccountSession } from "@/integrations/neon/auth";
import { assertAccountSessionOwner, type AccountRequestScope } from "./accountRequestScope";
import { throwIfCancelled } from "./abort";
import {
  BRAND_REPORT_MAX_BYTES, brandReportSaveSchema, brandReportSelectorSchema,
  brandReportsListResponseSchema, brandReportResponseSchema, brandReportHistoryResponseSchema,
  type BrandReportSaveInput, type BrandReportSelector, type BrandReportSnapshot,
} from "../../shared/brand-reports";

export type BrandReportsErrorCode = "unavailable" | "disabled" | "not_found" | "conflict" | "request_conflict" | "invalid" | "invalid_response" | "account_changed" | "unauthenticated" | "verification_required" | "limit" | "version_limit" | "rate_limited";
export class BrandReportsError extends Error {
  constructor(readonly code: BrandReportsErrorCode, readonly requestId?: string, readonly writeMayHaveCompleted = false) { super(code); this.name = "BrandReportsError"; }
}

/** A lost response is not evidence of a failed write. Retry the immutable request. */
export function brandReportSaveFailureIsUncertain(error: unknown): boolean {
  return !(error instanceof BrandReportsError) || error.writeMayHaveCompleted || error.code === "unavailable" || error.code === "invalid_response" || error.code === "account_changed" || error.code === "unauthenticated";
}

export function confirmBrandReportSave(report: BrandReportSnapshot, input: BrandReportSaveInput): BrandReportSnapshot {
  if (report.id !== input.id || report.version !== input.expectedVersion + 1 || report.title !== input.title
    || JSON.stringify(report.assessment) !== JSON.stringify(input.assessment)) throw new BrandReportsError("invalid_response");
  return report;
}

function classify(cause: unknown): BrandReportsError {
  if (cause instanceof BrandReportsError) return cause;
  const detail = (cause && typeof cause === "object" ? cause : {}) as { status?: number; code?: string; requestId?: string };
  const code: BrandReportsErrorCode = detail.code === "account_changed" ? "account_changed" : detail.status === 401 ? "unauthenticated" : detail.status === 403 ? "verification_required"
    : detail.code === "report_not_found" ? "not_found" : detail.code === "report_request_conflict" ? "request_conflict"
      : detail.code === "report_limit" ? "limit" : detail.code === "report_version_limit" ? "version_limit"
        : detail.status === 404 ? "disabled" : detail.status === 409 ? "conflict" : detail.status === 429 ? "rate_limited"
          : detail.status === 400 || detail.status === 413 ? "invalid" : "unavailable";
  return new BrandReportsError(code, typeof detail.requestId === "string" && /^req_[A-Za-z0-9_-]{16}$/u.test(detail.requestId) ? detail.requestId : undefined);
}

async function request(scope: AccountRequestScope, selector?: BrandReportSelector, raw?: BrandReportSaveInput, history = false) {
  const accountId = scope?.accountId, signal = scope?.signal;
  let transportReturned = false;
  try {
    throwIfCancelled(signal);
    if (typeof accountId !== "string" || !accountId.trim()) throw new BrandReportsError("unauthenticated");
    // Strict parsing clones both owner-independent payload and selector before IO.
    const input = raw === undefined ? undefined : brandReportSaveSchema.safeParse(raw);
    const selected = selector === undefined ? undefined : brandReportSelectorSchema.safeParse(selector);
    if (input && !input.success || selected && !selected.success) throw new BrandReportsError("invalid");
    const payload = input?.success ? input.data : undefined, query = selected?.success ? selected.data : undefined;
    if (payload && new TextEncoder().encode(JSON.stringify({ report: payload })).byteLength > BRAND_REPORT_MAX_BYTES) throw new BrandReportsError("invalid");
    const params = new URLSearchParams();
    if (query) { params.set("id", query.id); if (query.version !== undefined) params.set("version", String(query.version)); if (history) params.set("history", "true"); }
    const serialized = params.toString(), suffix = serialized ? `?${serialized}` : "";
    const value = await accountRequest<unknown>(`/api/account/brand-reports${suffix}`, { accountId, signal, ...(payload ? { method: "POST", body: { report: payload } } : {}) });
    transportReturned = true;
    throwIfCancelled(signal);
    const parsed = history ? brandReportHistoryResponseSchema.safeParse(value) : payload || query ? brandReportResponseSchema.safeParse(value) : brandReportsListResponseSchema.safeParse(value);
    if (!parsed.success) throw new BrandReportsError("invalid_response");
    if (parsed.data.accountId !== accountId) throw new BrandReportsError("account_changed");
    const session = await readAccountSession();
    throwIfCancelled(signal);
    if (!session || typeof session.expires_at !== "number" || !Number.isFinite(session.expires_at) || session.expires_at <= Date.now() / 1000) throw new BrandReportsError("unauthenticated");
    assertAccountSessionOwner(session.user?.id, accountId);
    if (session.user.email_verified !== true) throw new BrandReportsError("verification_required");
    if ("report" in parsed.data) {
      if (payload) confirmBrandReportSave(parsed.data.report, payload);
      else if (!query || parsed.data.report.id !== query.id || query.version !== undefined && parsed.data.report.version !== query.version) throw new BrandReportsError("invalid_response");
    }
    if ("reports" in parsed.data && new Set(parsed.data.reports.map(row => row.id)).size !== parsed.data.reports.length) throw new BrandReportsError("invalid_response");
    if ("versions" in parsed.data && (!query || parsed.data.versions.some(row => row.id !== query.id) || new Set(parsed.data.versions.map(row => row.version)).size !== parsed.data.versions.length)) throw new BrandReportsError("invalid_response");
    return parsed.data;
  } catch (cause) {
    if (signal?.aborted) throw cause;
    const error = classify(cause);
    // A 200 followed by an unusable/changed session must retain the save key,
    // unlike a server rejection before writing. The provider details stay private.
    throw raw !== undefined && transportReturned ? new BrandReportsError(error.code, error.requestId, true) : error;
  }
}

export async function getBrandReports(scope: AccountRequestScope) {
  const value = await request(scope);
  if (!("reports" in value)) throw new BrandReportsError("invalid_response");
  return value;
}
export async function getBrandReport(scope: AccountRequestScope, selector: BrandReportSelector) {
  const value = await request(scope, selector);
  if (!("report" in value)) throw new BrandReportsError("invalid_response");
  return value;
}
export async function getBrandReportHistory(scope: AccountRequestScope, id: string) {
  const value = await request(scope, { id }, undefined, true);
  if (!("versions" in value)) throw new BrandReportsError("invalid_response");
  return value;
}
export async function saveBrandReport(scope: AccountRequestScope, input: BrandReportSaveInput) {
  const value = await request(scope, undefined, input);
  if (!("report" in value)) throw new BrandReportsError("invalid_response");
  return value;
}
