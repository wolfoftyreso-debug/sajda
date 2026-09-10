import { AccountAccessError, requireAccount } from "../_shared/account-auth.js";
import { readDelegatedAccount } from "../_shared/delegated-account.js";
import type { AccountHeaders } from "../_shared/account-origin.js";
import { createRequestId } from "../_shared/public-api.js";
import { createNativeSessionsService, parseAppSessionCursor, parseAppSessionId } from "../_shared/native-sessions.js";

interface RequestLike { method?: string; headers?: AccountHeaders; query?: Record<string, unknown>; body?: unknown }
interface ResponseLike {
  setHeader(name: string, value: string | number): void;
  status(code: number): ResponseLike;
  json(body: unknown): void;
}
export const config = { maxDuration: 20 };

function revokeInput(request: RequestLike): string {
  const contentType = request.headers?.["content-type"];
  if (typeof contentType !== "string" || !/^application\/json(?:\s*;|$)/iu.test(contentType)) {
    throw new AccountAccessError("unsupported_media_type", 415, "Send an application/json request.");
  }
  try {
    // Vercel's body getter can itself throw for malformed JSON; read it once.
    const body = request.body;
    const text = Buffer.isBuffer(body) ? body.toString("utf8") : typeof body === "string" ? body : JSON.stringify(body);
    if (!text) throw new AccountAccessError("invalid_request", 400, "Choose one app connection to disconnect.");
    if (Buffer.byteLength(text, "utf8") > 1024) throw new AccountAccessError("request_too_large", 413, "This app-connection request is too large.");
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== 1 || !("id" in value)) {
      throw new AccountAccessError("invalid_request", 400, "Choose one app connection to disconnect.");
    }
    return parseAppSessionId(value.id);
  } catch (error) {
    if (error instanceof AccountAccessError) throw error;
    throw new AccountAccessError("invalid_request", 400, "Send a valid app-connection request.");
  }
}

export function createAppSessionsHandler(authorize = requireAccount, service = createNativeSessionsService()) {
  return async function handler(request: RequestLike, response: ResponseLike): Promise<void> {
    const requestId = createRequestId(), method = request.method ?? "";
    for (const [name, value] of Object.entries({
      "Cache-Control": "private, no-store", "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
      "Vary": "Cookie, Authorization", "X-Robots-Tag": "noindex, nofollow", "X-Request-Id": requestId,
    })) response.setHeader(name, value);
    try {
      if (method !== "GET" && method !== "DELETE") {
        response.setHeader("Allow", "GET, DELETE");
        throw new AccountAccessError("method_not_allowed", 405, "Use GET or DELETE for app connections.");
      }
      const delegated = readDelegatedAccount(request.headers ?? {}, method);
      if (delegated && (delegated.source !== "native" || !delegated.scopes.includes("sessions:manage"))) {
        throw new AccountAccessError("insufficient_scope", 403, "Use your Sajda account to manage app connections.");
      }
      const account = await authorize(request.headers, { verifiedEmail: true, method });
      const query = request.query ?? {};
      if (Object.keys(query).some(key => method !== "GET" || key !== "cursor")) {
        throw new AccountAccessError("invalid_request", 400, "Use only an app-connection cursor when listing connections.");
      }
      if (method === "GET") {
        parseAppSessionCursor(query.cursor);
        response.status(200).json({ ...await service.list(account, query.cursor),
          currentSessionId: delegated?.source === "native" ? parseAppSessionId(delegated.credentialId) : null,
          accountId: account.id, requestId });
      } else {
        response.status(200).json({ ...await service.revoke(account, revokeInput(request)), accountId: account.id, requestId });
      }
    } catch (error) {
      const failure = error instanceof AccountAccessError ? error
        : new AccountAccessError("app_sessions_unavailable", 503, "Your app connections are temporarily unavailable. Retry to confirm their status.");
      if (failure.status === 429) response.setHeader("Retry-After", 60);
      if (failure.status >= 500) console.error(JSON.stringify({ event: "app_sessions_failed", requestId, code: failure.code }));
      response.status(failure.status).json({ error: failure.message, code: failure.code, requestId });
    }
  };
}
export default createAppSessionsHandler();
