import { randomBytes } from "node:crypto";

/**
 * Shared response policy for Sajda's deliberately anonymous API surfaces.
 *
 * These headers are intentionally limited to endpoints that are safe for
 * browser and server-to-server use without a customer credential. Protected
 * integration routes must not import this policy: allowing cross-origin
 * credentialed calls would make it too easy to put an API key in a browser.
 */

export const PUBLIC_API_REVISION = "2026-08-25";

export interface HeaderResponseLike {
  setHeader(name: string, value: string | number): void;
}

export interface PublicRateLimit {
  limit: number;
  remaining: number;
  resetAt: number;
}

export function createRequestId(): string {
  // Server-generated only. Do not reflect a caller-provided header into
  // response traces or logs.
  return `req_${randomBytes(12).toString("base64url")}`;
}

export function setPublicApiHeaders(
  response: HeaderResponseLike,
  options: {
    requestId: string;
    allowMethods: string;
    rateLimit?: PublicRateLimit;
  },
): void {
  // Public routes accept no cookies and never allow credentials. `*` is safe
  // here because these endpoints are explicitly anonymous and do not expose
  // a tenant, key, account, or private search history.
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", options.allowMethods);
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader(
    "Access-Control-Expose-Headers",
    "X-Request-Id, X-Sajda-Public-Api-Version, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After",
  );
  response.setHeader("Access-Control-Max-Age", "600");
  response.setHeader("X-Sajda-Public-Api-Version", PUBLIC_API_REVISION);
  response.setHeader("X-Request-Id", options.requestId);

  if (!options.rateLimit) return;
  response.setHeader("X-RateLimit-Limit", String(options.rateLimit.limit));
  response.setHeader("X-RateLimit-Remaining", String(options.rateLimit.remaining));
  response.setHeader("X-RateLimit-Reset", String(Math.ceil(options.rateLimit.resetAt / 1_000)));
}

export function publicError(
  status: number,
  error: string,
  code = defaultPublicErrorCode(status),
): { error: string; code: string } {
  return { error, code };
}

/** Adds a stable machine-readable error code without changing the existing
 * human-readable `error` field consumed by Sajda's product UI. */
export function withMachineErrorCode(status: number, payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const record = payload as Record<string, unknown>;
  if (typeof record.error !== "string" || typeof record.code === "string") return payload;
  return publicError(status, record.error);
}

export function defaultPublicErrorCode(status: number): string {
  if (status === 400) return "invalid_request";
  if (status === 401) return "invalid_api_key";
  if (status === 405) return "method_not_allowed";
  if (status === 413) return "request_too_large";
  if (status === 415) return "unsupported_media_type";
  if (status === 429) return "rate_limited";
  return "internal_error";
}
