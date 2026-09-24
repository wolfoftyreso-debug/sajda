import { AccountAccessError } from "./account-error.js";
import { NAMES_API_MAX_BODY_BYTES } from "./names-contract.js";

export interface NamePackageHttpRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  query?: Record<string, unknown>;
  url?: string;
}
export interface NamePackageHttpResponse {
  setHeader(name: string, value: string | number): void;
  status(code: number): NamePackageHttpResponse;
  json(value: unknown): void;
  end(value?: string): void;
}

export function setNamePackageResponseHeaders(response: NamePackageHttpResponse): void {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Robots-Tag", "noindex, nofollow");
}

export function sendNamePackageJson(response: NamePackageHttpResponse, status: number, payload: unknown): void {
  setNamePackageResponseHeaders(response);
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.status(status).json(payload);
}

export function readNamePackageHeader(request: NamePackageHttpRequest, name: string): string | undefined {
  const entries = Object.entries(request.headers).filter(([key]) => key.toLowerCase() === name);
  if (!entries.length) return undefined;
  if (entries.length !== 1 || typeof entries[0][1] !== "string") {
    throw new AccountAccessError("invalid_request", 400, "Use one value for each request header.");
  }
  return entries[0][1];
}

export function assertNamePackageQuery(request: NamePackageHttpRequest): void {
  if (request.query && Object.keys(request.query).length
    || request.url && new URL(request.url, "https://sajda.invalid").searchParams.size) {
    throw new AccountAccessError("invalid_request", 400, "Name-package searches do not accept URL query parameters.");
  }
}

export async function readNamePackageBody(request: NamePackageHttpRequest): Promise<unknown> {
  const contentType = readNamePackageHeader(request, "content-type");
  if (typeof contentType !== "string" || !/^application\/json(?:\s*;|$)/iu.test(contentType.trim())) {
    throw new AccountAccessError("unsupported_media_type", 415, "Send an application/json request.");
  }
  let supplied: unknown;
  try { supplied = request.body; } catch {
    throw new AccountAccessError("invalid_request", 400, "Send a valid JSON object.");
  }
  let text: string;
  if (supplied !== undefined) {
    try { text = typeof supplied === "string" ? supplied : Buffer.isBuffer(supplied)
      ? supplied.toString("utf8") : JSON.stringify(supplied); }
    catch { throw new AccountAccessError("invalid_request", 400, "Send a valid JSON object."); }
  } else {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request as unknown as AsyncIterable<Uint8Array | string>) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > NAMES_API_MAX_BODY_BYTES) throw new AccountAccessError("request_too_large", 413, "The name-package request body is too large.");
      chunks.push(bytes);
    }
    text = Buffer.concat(chunks).toString("utf8");
  }
  if (text && Buffer.byteLength(text, "utf8") > NAMES_API_MAX_BODY_BYTES) {
    throw new AccountAccessError("request_too_large", 413, "The name-package request body is too large.");
  }
  try { return JSON.parse(text); } catch {
    throw new AccountAccessError("invalid_request", 400, "Send a valid JSON object.");
  }
}
