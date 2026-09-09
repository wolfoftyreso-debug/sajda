import { AccountAccessError } from "./account-auth.js";
import { canonicalTradingRegistrarDomain } from "../../shared/trading-registrar.js";

export interface LostDomainsRequest {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
}
export interface LostDomainsResponse {
  setHeader(name: string, value: string | number): void;
  status(code: number): LostDomainsResponse;
  json(value: unknown): void;
}
export type LostDomainsAction = { action: "start"; requestKey: string }
  | { action: "advance" | "cancel"; runId: string }
  | { action:"refresh_quote";runId:string;domain:string;requestKey:string };

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;

export function parseLostDomainsAction(request: LostDomainsRequest): LostDomainsAction {
  const contentType = request.headers?.["content-type"];
  if (typeof contentType !== "string" || !/^application\/json(?:\s*;|$)/iu.test(contentType)) {
    throw new AccountAccessError("unsupported_media_type", 415, "Send an application/json request.");
  }
  try {
    const encoded = typeof request.body === "string" ? request.body : JSON.stringify(request.body);
    if (encoded && Buffer.byteLength(encoded) > 1024) throw new AccountAccessError("request_too_large", 413, "This request is too large.");
    const value = encoded ? JSON.parse(encoded) : null;
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid shape");
    if(value.action==="refresh_quote") {
      if(Object.keys(value).length!==4 || typeof value.runId!=="string" || !uuid.test(value.runId)
        || typeof value.requestKey!=="string" || !uuid.test(value.requestKey) || typeof value.domain!=="string"
        || canonicalTradingRegistrarDomain(value.domain)!==value.domain) throw new Error("Invalid quote request");
      return {action:"refresh_quote",runId:value.runId.toLowerCase(),domain:value.domain,requestKey:value.requestKey.toLowerCase()};
    }
    if(Object.keys(value).length!==2) throw new Error("Invalid shape");
    if (value.action === "start" && typeof value.requestKey === "string" && uuid.test(value.requestKey)) {
      return { action: "start", requestKey: value.requestKey.toLowerCase() };
    }
    if (["advance", "cancel"].includes(value.action) && typeof value.runId === "string" && uuid.test(value.runId)) {
      return { action: value.action, runId: value.runId.toLowerCase() };
    }
    throw new Error("Invalid action");
  } catch (error) {
    if (error instanceof AccountAccessError) throw error;
    throw new AccountAccessError("invalid_request", 400, "Choose a valid Lost Domains action.");
  }
}

export function lostDomainsHeaders(response: LostDomainsResponse, requestId: string): void {
  response.setHeader("Cache-Control", "private, no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Vary", "Cookie, X-Sajda-Account");
  response.setHeader("X-Robots-Tag", "noindex, nofollow");
  response.setHeader("X-Request-Id", requestId);
}

export function lostDomainsEnabled(): boolean {
  return process.env.SAJDA_LOST_DOMAINS_ENABLED === "true";
}

export function lostDomainsFailure(error: unknown, response: LostDomainsResponse, requestId: string): void {
  const failure = error instanceof AccountAccessError ? error
    : new AccountAccessError("lost_domains_unavailable", 503, "The review could not be updated. Your saved report is unchanged; retry shortly.");
  if (failure.status === 429) response.setHeader("Retry-After", 60);
  if (failure.status >= 500) console.error(JSON.stringify({ event: "lost_domains_failed", requestId, code: failure.code }));
  response.status(failure.status).json({ code: failure.code, error: failure.message, requestId });
}
