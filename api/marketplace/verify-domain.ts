import { createRequestId } from "../_shared/public-api.js";

/**
 * Marketplace DNS control verification is intentionally unavailable while its
 * state, authorization and rate limiting move from the legacy provider to
 * Neon behind Vercel Functions. Keeping this endpoint explicit avoids a
 * misleading partial verification result or a fallback to legacy credentials.
 */

interface VercelRequestLike {
  method?: string;
}

interface VercelResponseLike {
  setHeader(name: string, value: string | number): void;
  status(code: number): VercelResponseLike;
  json(payload: unknown): void;
}

const MIGRATION_PENDING_CODE = "marketplace_verifier_migration_pending";

function setSafeResponseHeaders(response: VercelResponseLike, requestId: string): void {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "same-origin");
  response.setHeader("Vary", "Authorization");
  response.setHeader("X-Request-Id", requestId);
}

function sendJson(
  response: VercelResponseLike,
  status: number,
  requestId: string,
  payload: Record<string, unknown>,
): void {
  setSafeResponseHeaders(response, requestId);
  response.status(status).json({ ...payload, requestId });
}

export default function handler(request: VercelRequestLike, response: VercelResponseLike): void {
  const requestId = createRequestId();

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    sendJson(response, 405, requestId, {
      error: "Only POST requests are supported.",
      code: "method_not_allowed",
    });
    return;
  }

  sendJson(response, 503, requestId, {
    error: "Marketplace domain verification is temporarily unavailable while it is migrated to Neon.",
    code: MIGRATION_PENDING_CODE,
    status: "migration_pending",
  });
}
