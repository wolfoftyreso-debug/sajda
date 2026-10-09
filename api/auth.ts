import type { IncomingMessage } from "node:http";
import { AccountAccessError } from "./_shared/account-error.js";
import { accountRequestOrigin, accountWebHeaders, requireSameOrigin } from "./_shared/account-origin.js";
import { getAccountAuth, type AccountAuth } from "./_shared/account-server.js";
import { accountEmailConfigured } from "./_shared/account-email.js";
import { createRequestId } from "./_shared/public-api.js";

type AuthRequest = Pick<IncomingMessage, "method" | "url" | "headers"> & {
  body?: unknown; [Symbol.asyncIterator]?: IncomingMessage[typeof Symbol.asyncIterator];
};
interface AuthResponse {
  setHeader(name: string, value: string | string[] | number): void;
  status(code: number): AuthResponse;
  json(value: unknown): void;
  end(body?: string): void;
}

export const config = { maxDuration: 30 };
const postActions = new Set(["sign-in/email", "sign-in/social", "sign-up/email", "sign-out", "request-password-reset", "reset-password", "send-verification-email"]);
const mailActions = new Set(["sign-up/email", "request-password-reset", "send-verification-email"]);
const oauthCallback = /^callback\/(?:google|twitter|github|apple)$/u;

export function authAction(request: AuthRequest): { action: string; search: URLSearchParams } {
  const url = new URL(request.url ?? "/api/auth", "https://routing.invalid");
  // Vercel's rewrite preserves the action in the URL. Reading the legacy
  // request.query getter makes the platform invoke Node's deprecated url.parse().
  const rewrittenActions = url.searchParams.getAll("authAction");
  const rewritten = rewrittenActions.length === 1 ? rewrittenActions[0] : null;
  const action = url.pathname.startsWith("/api/auth/") ? url.pathname.slice(10) : rewritten;
  if (typeof action !== "string" || action.length > 512 || !/^[a-zA-Z0-9_/-]+$/u.test(action)) {
    throw new AccountAccessError("not_found", 404, "Account endpoint not found.");
  }
  url.searchParams.delete("authAction");
  return { action, search: url.searchParams };
}

async function authBody(request: AuthRequest, allowForm = false): Promise<string> {
  const contentType = request.headers["content-type"];
  const json = typeof contentType === "string" && /^application\/json(?:\s*;|$)/iu.test(contentType);
  const form = allowForm && typeof contentType === "string" && /^application\/x-www-form-urlencoded(?:\s*;|$)/iu.test(contentType);
  if (!json && !form) {
    throw new AccountAccessError("unsupported_media_type", 415, "Send an application/json request.");
  }
  const declaredSize = request.headers["content-length"];
  if (declaredSize !== undefined && (typeof declaredSize !== "string" || !/^\d+$/u.test(declaredSize))) {
    throw new AccountAccessError("invalid_request", 400, "Enter valid account details.");
  }
  if (Number(declaredSize) > 16_384) throw new AccountAccessError("request_too_large", 413, "This account request is too large.");
  // Vercel can parse JSON lazily when body is first read. Malformed JSON is
  // client input, not an authentication outage; do not evaluate that getter twice.
  let value: unknown;
  try { value = request.body; }
  catch (error) {
    if (error instanceof SyntaxError || error instanceof Error && "statusCode" in error && error.statusCode === 400) {
      throw new AccountAccessError("invalid_request", 400, "Enter valid account details.");
    }
    throw error;
  }
  let text: string;
  if (value !== undefined) {
    try {
      if (typeof value === "string") text = value;
      else if (Buffer.isBuffer(value)) text = value.toString("utf8");
      else if (form && value && typeof value === "object" && !Array.isArray(value)) {
        const params = new URLSearchParams();
        for (const [key, item] of Object.entries(value)) {
          if (typeof item !== "string") throw new Error();
          params.set(key, item);
        }
        text = params.toString();
      } else text = JSON.stringify(value);
    }
    catch { throw new AccountAccessError("invalid_request", 400, "Enter valid account details."); }
  }
  else {
    const chunks: Buffer[] = [];
    let size = 0;
    if (request[Symbol.asyncIterator]) for await (const chunk of request as IncomingMessage) {
      size += Buffer.byteLength(chunk);
      if (size > 16_384) throw new AccountAccessError("request_too_large", 413, "This account request is too large.");
      chunks.push(Buffer.from(chunk));
    }
    text = Buffer.concat(chunks).toString("utf8") || "{}";
  }
  if (typeof text !== "string") throw new AccountAccessError("invalid_request", 400, "Enter valid account details.");
  if (Buffer.byteLength(text) > 16_384) throw new AccountAccessError("request_too_large", 413, "This account request is too large.");
  try {
    if (json) {
      const body = JSON.parse(text);
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    } else {
      const body = new URLSearchParams(text);
      if (![...body.keys()].every(key => /^[a-z_]{1,32}$/u.test(key))) throw new Error();
    }
  } catch { throw new AccountAccessError("invalid_request", 400, "Enter valid account details."); }
  return text;
}

/** Better Auth transport returns session credentials by default; Sajda is cookie-only. */
export function publicAuthResult(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const result = { ...value } as Record<string, unknown>;
  delete result.token;
  if (result.session && typeof result.session === "object") {
    result.session = { ...result.session };
    delete (result.session as Record<string, unknown>).token;
    delete (result.session as Record<string, unknown>).ipAddress;
    delete (result.session as Record<string, unknown>).userAgent;
  }
  return result;
}

export function createAuthHandler(resolveAuth: (origin: string) => Pick<AccountAuth, "handler"> = getAccountAuth, emailReady = accountEmailConfigured) {
  return async (request: AuthRequest, response: AuthResponse): Promise<void> => {
    const requestId = createRequestId();
    for (const [name, value] of Object.entries({
      "Cache-Control": "private, no-store", "Vary": "Cookie", "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow", "X-Request-Id": requestId,
    })) response.setHeader(name, value);
    try {
      const { action, search } = authAction(request);
      const isOauthCallback = oauthCallback.test(action);
      const getAllowed = action === "get-session" || action === "verify-email" || /^reset-password\/[A-Za-z0-9_-]{1,256}$/u.test(action);
      const allowed = isOauthCallback ? ["GET", "POST"] : getAllowed ? ["GET"] : postActions.has(action) ? ["POST"] : [];
      if (!allowed.length) throw new AccountAccessError("not_found", 404, "Account endpoint not found.");
      if (!request.method || !allowed.includes(request.method)) {
        response.setHeader("Allow", allowed.join(", "));
        throw new AccountAccessError("method_not_allowed", 405, `Use ${allowed.join(" or ")} for this account action.`);
      }
      const origin = accountRequestOrigin(request.headers);
      if (request.method === "POST" && !isOauthCallback) requireSameOrigin(request.headers, origin);
      const body = request.method === "POST" ? await authBody(request, isOauthCallback) : undefined;
      if (mailActions.has(action) && !emailReady()) {
        throw new AccountAccessError("email_not_configured", 503, "Account email is not available yet. Please try again later.");
      }
      const headers = accountWebHeaders(request.headers);
      // Local QA has one real client address; never accept a browser's spoofed proxy IP.
      if (!process.env.VERCEL) headers.set("x-vercel-forwarded-for", "127.0.0.1");
      const result = await resolveAuth(origin).handler(new Request(`${origin}/api/auth/${action}?${search}`, { method: request.method, headers, body }));
      const retryAfter = result.headers.get("retry-after") ?? result.headers.get("x-retry-after");
      if (retryAfter && /^\d{1,6}$/u.test(retryAfter)) response.setHeader("Retry-After", retryAfter);
      for (const name of ["content-type", "location", "retry-after"]) {
        const value = result.headers.get(name);
        if (value) response.setHeader(name, value);
      }
      const cookies = result.headers.getSetCookie();
      if (cookies.length) response.setHeader("Set-Cookie", cookies);
      response.status(result.status);
      if (result.status >= 500) {
        console.error(JSON.stringify({ event: "account_auth_failed", requestId, code: "provider_error" }));
        response.json({ code: "auth_unavailable", message: "Account access is temporarily unavailable. Please retry.", requestId });
      } else {
        const text = await result.text();
        // Verification/reset redirects can carry application/json with no body.
        if (text.trim() && result.headers.get("content-type")?.includes("application/json")) response.json(publicAuthResult(JSON.parse(text)));
        else response.end(text);
      }
    } catch (error) {
      const failure = error instanceof AccountAccessError ? error : new AccountAccessError("auth_unavailable", 503, "Account access is temporarily unavailable. Please retry.");
      if (failure.status >= 500) console.error(JSON.stringify({ event: "account_auth_failed", requestId, code: failure.code,
        errorType: error instanceof Error ? error.name : "unknown",
      }));
      response.status(failure.status).json({ code: failure.code, message: failure.message, requestId });
    }
  };
}

export default createAuthHandler();
