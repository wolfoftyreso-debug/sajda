import type { IncomingMessage } from "node:http";
import { AccountAccessError } from "./_shared/account-error.js";
import { accountRequestOrigin, accountWebHeaders, requireSameOrigin } from "./_shared/account-origin.js";
import { getAccountAuth, type AccountAuth } from "./_shared/account-server.js";
import { accountEmailConfigured } from "./_shared/account-email.js";
import { createRequestId } from "./_shared/public-api.js";

type AuthRequest = Pick<IncomingMessage, "method" | "url" | "headers"> & {
  body?: unknown; query?: Record<string, unknown>; [Symbol.asyncIterator]?: IncomingMessage[typeof Symbol.asyncIterator];
};
interface AuthResponse {
  setHeader(name: string, value: string | string[] | number): void;
  status(code: number): AuthResponse;
  json(value: unknown): void;
  end(body?: string): void;
}

export const config = { maxDuration: 30 };
const postActions = new Set(["sign-in/email", "sign-up/email", "sign-out", "request-password-reset", "reset-password", "send-verification-email"]);
const mailActions = new Set(["sign-up/email", "request-password-reset", "send-verification-email"]);

export function authAction(request: AuthRequest): { action: string; search: URLSearchParams } {
  const url = new URL(request.url ?? "/api/auth", "https://routing.invalid");
  // Vercel's explicit rewrite preserves the action; local QA uses the original path.
  const rewritten = request.query?.authAction ?? url.searchParams.get("authAction");
  const action = url.pathname.startsWith("/api/auth/") ? url.pathname.slice(10) : rewritten;
  if (typeof action !== "string" || action.length > 512 || !/^[a-zA-Z0-9_/-]+$/u.test(action)) {
    throw new AccountAccessError("not_found", 404, "Account endpoint not found.");
  }
  url.searchParams.delete("authAction");
  return { action, search: url.searchParams };
}

async function authBody(request: AuthRequest): Promise<string> {
  const contentType = request.headers["content-type"];
  if (typeof contentType !== "string" || !/^application\/json(?:\s*;|$)/iu.test(contentType)) {
    throw new AccountAccessError("unsupported_media_type", 415, "Send an application/json request.");
  }
  let text: string;
  if (request.body !== undefined) text = typeof request.body === "string" ? request.body : JSON.stringify(request.body);
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
  if (Buffer.byteLength(text) > 16_384) throw new AccountAccessError("request_too_large", 413, "This account request is too large.");
  try {
    const body = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
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
      const getAllowed = action === "get-session" || action === "verify-email" || /^reset-password\/[A-Za-z0-9_-]{1,256}$/u.test(action);
      const allowed = getAllowed ? "GET" : postActions.has(action) ? "POST" : undefined;
      if (!allowed) throw new AccountAccessError("not_found", 404, "Account endpoint not found.");
      if (request.method !== allowed) {
        response.setHeader("Allow", allowed);
        throw new AccountAccessError("method_not_allowed", 405, `Use ${allowed} for this account action.`);
      }
      const origin = accountRequestOrigin(request.headers);
      if (allowed === "POST") requireSameOrigin(request.headers, origin);
      const body = allowed === "POST" ? await authBody(request) : undefined;
      if (mailActions.has(action) && !emailReady()) {
        throw new AccountAccessError("email_not_configured", 503, "Account email is not available yet. Please try again later.");
      }
      const headers = accountWebHeaders(request.headers);
      // Local QA has one real client address; never accept a browser's spoofed proxy IP.
      if (!process.env.VERCEL) headers.set("x-vercel-forwarded-for", "127.0.0.1");
      const result = await resolveAuth(origin).handler(new Request(`${origin}/api/auth/${action}?${search}`, { method: allowed, headers, body }));
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
