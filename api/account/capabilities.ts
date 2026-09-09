import { AccountAccessError, requireAccount } from "../_shared/account-auth.js";
import { getAccountCapabilities } from "../_shared/account-entitlements.js";
import { createRequestId } from "../_shared/public-api.js";

interface RequestLike {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
}

interface ResponseLike {
  setHeader(name: string, value: string | number): void;
  status(code: number): ResponseLike;
  json(value: unknown): void;
}

export const config = { maxDuration: 20 };

function requestedCapability(request: RequestLike): "swipe_undo" {
  const contentType = request.headers?.["content-type"];
  if (typeof contentType !== "string" || !/^application\/json(?:\s*;|$)/iu.test(contentType)) {
    throw new AccountAccessError("unsupported_media_type", 415, "Send an application/json request.");
  }
  try {
    const encoded = typeof request.body === "string" ? request.body : JSON.stringify(request.body);
    if (encoded && Buffer.byteLength(encoded, "utf8") > 1024) {
      throw new AccountAccessError("request_too_large", 413, "This account request is too large.");
    }
    const value = encoded ? JSON.parse(encoded) : null;
    if (!value || typeof value !== "object" || Array.isArray(value)
      || Object.keys(value).length !== 1 || value.capability !== "swipe_undo") {
      throw new AccountAccessError("invalid_request", 400, "Choose a supported account action.");
    }
    return "swipe_undo";
  } catch (error) {
    if (error instanceof AccountAccessError) throw error;
    throw new AccountAccessError("invalid_request", 400, "Send a valid account request.");
  }
}

/**
 * GET is presentation only. Every undo must POST for a fresh authorization.
 * This endpoint never grants or renews access and never trusts a client plan.
 * Undo restores browser-local history; it is not a server-side deck mutation.
 */
export function createAccountCapabilitiesHandler(authorize = requireAccount, readCapabilities = getAccountCapabilities) {
  return async function handler(request: RequestLike, response: ResponseLike): Promise<void> {
    const requestId = createRequestId();
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Vary", "Cookie, X-Sajda-Account");
    response.setHeader("X-Request-Id", requestId);
    response.setHeader("X-Robots-Tag", "noindex, nofollow");

    if (!request.method || !["GET", "POST"].includes(request.method)) {
      response.setHeader("Allow", "GET, POST");
      response.status(405).json({ error: "Use GET or POST.", code: "method_not_allowed", requestId });
      return;
    }
    try {
      // Also verifies x-sajda-account against the actual session, and requires
      // exact same-origin evidence for POST before reading any entitlement.
      const account = await authorize(request.headers, { verifiedEmail: true, method: request.method });
      if (request.method === "POST") requestedCapability(request);
      const capabilities = await readCapabilities(account);
      if (typeof capabilities?.swipe_undo !== "boolean") throw new Error("Invalid capability result");

      if (request.method === "GET") {
        response.status(200).json({ capabilities: { swipe_undo: capabilities.swipe_undo }, accountId: account.id, requestId });
        return;
      }
      if (!capabilities.swipe_undo) {
        throw new AccountAccessError("premium_required", 403, "Undo requires an active premium entitlement.");
      }
      response.status(200).json({ ok: true, capability: "swipe_undo", accountId: account.id, requestId });
    } catch (error) {
      const failure = error instanceof AccountAccessError ? error
        : new AccountAccessError("capabilities_unavailable", 503, "Account access could not be checked. Nothing was undone; please retry.");
      if (failure.status === 429) response.setHeader("Retry-After", 60);
      if (failure.status >= 500) console.error(JSON.stringify({ event: "account_capabilities_failed", requestId, code: failure.code }));
      response.status(failure.status).json({ error: failure.message, code: failure.code, requestId });
    }
  };
}

export default createAccountCapabilitiesHandler();
