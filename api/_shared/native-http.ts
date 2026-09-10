import type { AccountHeaders } from "./account-origin.js";
import { AccountAccessError } from "./account-error.js";
export interface NativeRequest { method?: string; headers: AccountHeaders; body?: unknown }
export interface NativeResponse {
  setHeader(name: string, value: string | number): void;
  status(code: number): NativeResponse;
  json(body: unknown): void;
}
export async function nativeJson(request: NativeRequest): Promise<unknown> {
  if (!/^application\/json(?:;|$)/i.test(String(request.headers["content-type"] ?? ""))) {
    throw new AccountAccessError("unsupported_media_type", 415, "Send application/json.");
  }
  let value: unknown;
  try { value = request.body; } catch {
    throw new AccountAccessError("invalid_request", 400, "Send a valid app request.");
  }
  if (value === undefined) {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request as unknown as AsyncIterable<Uint8Array>) {
      size += chunk.length;
      if (size > 16_384) throw new AccountAccessError("request_too_large", 413, "This app request is too large.");
      chunks.push(Buffer.from(chunk));
    }
    value = Buffer.concat(chunks).toString("utf8");
  }
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (!text || Buffer.byteLength(text) > 16_384) throw new AccountAccessError("request_too_large", 413, "This app request is too large.");
  try { return JSON.parse(text); } catch { throw new AccountAccessError("invalid_request", 400, "Send a valid app request."); }
}
export function nativeResponseHeaders(response: NativeResponse, requestId: string) {
  response.setHeader("Cache-Control", "private, no-store");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Robots-Tag", "noindex, nofollow");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Request-Id", requestId);
  response.setHeader("Vary", "Authorization");
}
export function nativeFailure(error: unknown, response: NativeResponse, requestId: string) {
  const failure = error instanceof AccountAccessError ? error
    : new AccountAccessError("native_unavailable", 503, "App access is temporarily unavailable. Retry without changing accounts.");
  if (failure.status === 429) response.setHeader("Retry-After", 60);
  if (failure.status >= 500) console.error(JSON.stringify({ event: "native_request_failed", requestId, code: failure.code }));
  response.status(failure.status).json({ error: failure.message, code: failure.code, requestId });
}
