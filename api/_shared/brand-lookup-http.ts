import { AccountAccessError } from "./account-error.js";

export const BRAND_LOOKUP_MAX_BODY_BYTES = 6_144;
export interface BrandLookupHttpRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  query?: Record<string, unknown>;
  url?: string;
}
export interface BrandLookupHttpResponse {
  setHeader(name: string, value: string | number): void;
  status(code: number): BrandLookupHttpResponse;
  json(value: unknown): void;
  end(value?: string): void;
}
const invalidBody = () => new AccountAccessError("invalid_request", 400, "Send a valid JSON brand-lookup request.");
const oversized = () => new AccountAccessError("request_too_large", 413, "The brand-lookup request body exceeds 6 KiB.");

export function readBrandLookupHeader(request: BrandLookupHttpRequest, name: string): string | undefined {
  const entries = Object.entries(request.headers).filter(([key]) => key.toLowerCase() === name);
  if (!entries.length) return undefined;
  if (entries.length !== 1 || typeof entries[0][1] !== "string") {
    throw new AccountAccessError("invalid_request", 400, "Use one value for each request header.");
  }
  return entries[0][1];
}

/** Bounded raw/lazy/streamed JSON support, with no body or header diagnostics. */
export async function readBrandLookupBody(request: BrandLookupHttpRequest): Promise<unknown> {
  if (!/^application\/json(?:\s*;|$)/iu.test(readBrandLookupHeader(request, "content-type")?.trim() ?? "")) {
    throw new AccountAccessError("unsupported_media_type", 415, "Send an application/json request.");
  }
  const declaredLength = readBrandLookupHeader(request, "content-length");
  if (declaredLength !== undefined) {
    if (!/^\d+$/u.test(declaredLength)) throw invalidBody();
    if (Number(declaredLength) > BRAND_LOOKUP_MAX_BODY_BYTES) throw oversized();
  }
  let supplied: unknown;
  try { supplied = request.body; } catch { throw invalidBody(); }
  let text: string;
  if (supplied !== undefined) {
    try { text = typeof supplied === "string" ? supplied : Buffer.isBuffer(supplied)
      ? supplied.toString("utf8") : JSON.stringify(supplied); }
    catch { throw invalidBody(); }
  } else {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request as unknown as AsyncIterable<Uint8Array | string>) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > BRAND_LOOKUP_MAX_BODY_BYTES) throw oversized();
      chunks.push(bytes);
    }
    text = Buffer.concat(chunks).toString("utf8");
  }
  if (text && Buffer.byteLength(text, "utf8") > BRAND_LOOKUP_MAX_BODY_BYTES) throw oversized();
  try { return JSON.parse(text); } catch { throw invalidBody(); }
}
