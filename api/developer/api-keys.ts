import { createRequestId } from "../_shared/public-api.js";

/**
 * Same-origin developer-key control plane.
 *
 * Self-service developer keys are deliberately unavailable until the Neon
 * Auth + Neon Postgres implementation is provisioned, migrated, and verified.
 * Returning a stable machine-readable 503 is safer than falling back to the
 * retired key store or exposing a partial key-management flow.
 */

interface VercelRequestLike {
  method?: string;
}

interface VercelResponseLike {
  setHeader(name: string, value: string | number): void;
  status(code: number): VercelResponseLike;
  json(payload: unknown): void;
}

type DeveloperApiKeyErrorCode =
  | "method_not_allowed"
  | "developer_keys_migration_pending";

export const config = { maxDuration: 10 };

function setResponseHeaders(response: VercelResponseLike, requestId: string): void {
  // These responses are deliberately same-origin and non-cacheable. Do not
  // add CORS headers: this endpoint will eventually manage user credentials.
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "same-origin");
  response.setHeader("Vary", "Authorization");
  response.setHeader("X-Request-Id", requestId);
}

function sendError(
  response: VercelResponseLike,
  status: number,
  requestId: string,
  code: DeveloperApiKeyErrorCode,
  error: string,
): void {
  setResponseHeaders(response, requestId);
  response.status(status).json({ error, code, requestId });
}

export default async function handler(
  request: VercelRequestLike,
  response: VercelResponseLike,
): Promise<void> {
  const requestId = createRequestId();
  const method = request.method ?? "";

  if (method !== "GET" && method !== "POST" && method !== "DELETE") {
    response.setHeader("Allow", "GET, POST, DELETE");
    sendError(
      response,
      405,
      requestId,
      "method_not_allowed",
      "Only GET, POST, and DELETE requests are supported.",
    );
    return;
  }

  sendError(
    response,
    503,
    requestId,
    "developer_keys_migration_pending",
    "Self-service API keys are temporarily unavailable while Sajda migrates to Neon.",
  );
}
