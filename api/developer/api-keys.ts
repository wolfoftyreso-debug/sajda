import { createRequestId } from "../_shared/public-api.js";
import { AccountAccessError, requireAccount } from "../_shared/account-auth.js";
import { API_KEY_LIMITS, API_KEY_SCOPES, createDeveloperApiKeyService } from "../_shared/developer-api-keys.js";

/**
 * Same-origin developer-key control plane.
 *
 * Only a fresh, verified Sajda browser session or internally delegated native
 * account session manages credentials. No network header grants delegation.
 * API keys themselves cannot create, list, or revoke other API keys.
 */

interface VercelRequestLike {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  query?: Record<string, unknown>;
  body?: unknown;
}

interface VercelResponseLike {
  setHeader(name: string, value: string | number): void;
  status(code: number): VercelResponseLike;
  json(payload: unknown): void;
}

export const config = { maxDuration: 20 };

function setResponseHeaders(response: VercelResponseLike, requestId: string): void {
  // These responses are deliberately same-origin and non-cacheable. Do not
  // add CORS headers: this endpoint will eventually manage user credentials.
  response.setHeader("Cache-Control", "private, no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Vary", "Cookie");
  response.setHeader("X-Robots-Tag", "noindex, nofollow");
  response.setHeader("X-Request-Id", requestId);
}

function sendError(
  response: VercelResponseLike,
  status: number,
  requestId: string,
  code: string,
  error: string,
): void {
  setResponseHeaders(response, requestId);
  response.status(status).json({ error, code, requestId });
}

function readBody(request: VercelRequestLike): Record<string, unknown> {
  const contentType = request.headers?.["content-type"];
  if (typeof contentType !== "string" || !/^application\/json(?:\s*;|$)/iu.test(contentType)) {
    throw new AccountAccessError("unsupported_media_type", 415, "Send an application/json request.");
  }
  try {
    const encoded = Buffer.isBuffer(request.body) ? request.body.toString("utf8")
      : typeof request.body === "string" ? request.body : JSON.stringify(request.body);
    if (!encoded || Buffer.byteLength(encoded, "utf8") > 4096) throw new AccountAccessError("request_too_large", 413, "This API key request is too large.");
    const value: unknown = JSON.parse(encoded);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof AccountAccessError) throw error;
    throw new AccountAccessError("invalid_request", 400, "Send a valid API key request.");
  }
}

export function createDeveloperApiKeysHandler(authorize = requireAccount, service = createDeveloperApiKeyService()) {
return async function handler(
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

  try {
    const account = await authorize(request.headers, { verifiedEmail: true, method });
    setResponseHeaders(response, requestId);
    if (method === "GET") {
      response.status(200).json({ keys: await service.list(account), scopes: API_KEY_SCOPES, limits: API_KEY_LIMITS, requestId });
    } else if (method === "POST") {
      response.status(201).json({ ...await service.create(account, readBody(request)), requestId });
    } else {
      let id = request.query?.id;
      if (request.body !== undefined) {
        const input = readBody(request);
        if (Object.keys(input).some(key => key !== "id") || (id !== undefined && id !== input.id)) {
          throw new AccountAccessError("invalid_request", 400, "Choose one API key to revoke.");
        }
        id = input.id;
      }
      response.status(200).json({ key: await service.revoke(account, id), requestId });
    }
  } catch (error) {
    const failure = error instanceof AccountAccessError ? error
      : new AccountAccessError("developer_keys_unavailable", 503, "API keys are temporarily unavailable. Please try again.");
    if (failure.status === 429) response.setHeader("Retry-After", "60");
    sendError(response, failure.status, requestId, failure.code, failure.message);
  }
}
}

export default createDeveloperApiKeysHandler();
