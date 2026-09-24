import { AccountAccessError } from "../../_shared/account-error.js";
import { executeBrandIndexAssessment, parseBrandIndexRequest } from "../../_shared/brand-index.js";
import { createRequestId, setPublicApiHeaders } from "../../_shared/public-api.js";

export const config = { maxDuration: 10 };
export const BRAND_INDEX_MAX_BODY_BYTES = 65_536;
const REQUESTS_PER_MINUTE = 120;
const MAX_RATE_BUCKETS = 4096;

interface RequestLike {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  query?: Record<string, unknown>;
  url?: string;
}
interface ResponseLike {
  setHeader(name: string, value: string | number): void;
  status(code: number): ResponseLike;
  json(value: unknown): void;
  end(value?: string): void;
}

function invalidRequest(): AccountAccessError {
  return new AccountAccessError("invalid_request", 400, "Send one JSON object using the published brand-index request schema.");
}
function header(request: RequestLike, name: string): string | undefined {
  const entries = Object.entries(request.headers).filter(([key]) => key.toLowerCase() === name);
  if (!entries.length) return undefined;
  if (entries.length !== 1 || typeof entries[0][1] !== "string") throw invalidRequest();
  return entries[0][1];
}
function tooLarge(): AccountAccessError {
  return new AccountAccessError("request_too_large", 413, "The brand-index request body exceeds 64 KiB.");
}
async function readBody(request: RequestLike): Promise<unknown> {
  if (!/^application\/json(?:\s*;|$)/iu.test(header(request, "content-type")?.trim() ?? "")) {
    throw new AccountAccessError("unsupported_media_type", 415, "Send an application/json request.");
  }
  let supplied: unknown;
  try { supplied = request.body; } catch { throw invalidRequest(); }
  let text: string;
  if (supplied !== undefined) {
    try { text = typeof supplied === "string" ? supplied : Buffer.isBuffer(supplied)
      ? supplied.toString("utf8") : JSON.stringify(supplied); }
    catch { throw invalidRequest(); }
  } else {
    let size = 0;
    const chunks: Buffer[] = [];
    for await (const chunk of request as unknown as AsyncIterable<Uint8Array | string>) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > BRAND_INDEX_MAX_BODY_BYTES) throw tooLarge();
      chunks.push(bytes);
    }
    text = Buffer.concat(chunks).toString("utf8");
  }
  if (text && Buffer.byteLength(text, "utf8") > BRAND_INDEX_MAX_BODY_BYTES) throw tooLarge();
  try { return JSON.parse(text); } catch { throw invalidRequest(); }
}

/** Public CPU-only calculator. Its small per-instance guard grants no identity,
 * account access, provider quota, storage, or independent verification. */
export function createPublicBrandIndexHandler(dependencies: {
  assess?: typeof executeBrandIndexAssessment;
  now?: () => number;
} = {}) {
  const requests = new Map<string, { startedAt: number; count: number }>();
  return async (request: RequestLike, response: ResponseLike): Promise<void> => {
    const requestId = createRequestId();
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("X-Robots-Tag", "noindex, nofollow");
    setPublicApiHeaders(response, { requestId, allowMethods: "POST, OPTIONS" });
    const send = (status: number, data: unknown) => {
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.status(status).json(data);
    };
    try {
      if (Object.keys(request.headers).some(key => key.toLowerCase() === "authorization")) {
        throw new AccountAccessError("authorization_not_supported", 400,
          "This public calculator does not accept Authorization. Connect without credentials.");
      }
      if (request.query && Object.keys(request.query).length
        || request.url && new URL(request.url, "https://sajda.invalid").searchParams.size) {
        throw new AccountAccessError("invalid_request", 400, "The brand-index calculator does not accept URL query parameters.");
      }
      if (request.method === "OPTIONS") { response.status(204).end(); return; }
      if (request.method !== "POST") {
        response.setHeader("Allow", "POST, OPTIONS");
        throw new AccountAccessError("method_not_allowed", 405, "Use POST for brand self-assessments.");
      }
      const now = (dependencies.now ?? Date.now)();
      for (const [key, bucket] of requests) if (now - bucket.startedAt >= 60_000) requests.delete(key);
      const identity = (header(request, "x-forwarded-for")?.split(",")[0].trim() || "unknown").slice(0, 128);
      const current = requests.get(identity);
      const resetAt = current ? current.startedAt + 60_000 : now + 60_000;
      if (current && current.count >= REQUESTS_PER_MINUTE || !current && requests.size >= MAX_RATE_BUCKETS) {
        setPublicApiHeaders(response, { requestId, allowMethods: "POST, OPTIONS",
          rateLimit: { limit: REQUESTS_PER_MINUTE, remaining: 0, resetAt } });
        response.setHeader("Retry-After", Math.max(1, Math.ceil((resetAt - now) / 1000)));
        throw new AccountAccessError("rate_limited", 429, "The public assessment request limit has been reached. Wait before retrying.");
      }
      if (current) current.count++; else requests.set(identity, { startedAt: now, count: 1 });
      setPublicApiHeaders(response, { requestId, allowMethods: "POST, OPTIONS", rateLimit: {
        limit: REQUESTS_PER_MINUTE, remaining: REQUESTS_PER_MINUTE - (current?.count ?? 1), resetAt,
      } });
      const input = parseBrandIndexRequest(await readBody(request));
      send(200, (dependencies.assess ?? executeBrandIndexAssessment)(input, now));
    } catch (error) {
      const safe = error instanceof AccountAccessError ? error
        : new AccountAccessError("assessment_unavailable", 503, "The brand self-assessment could not be calculated.");
      send(safe.status, { code: safe.code, error: safe.message, requestId });
    }
  };
}

export default createPublicBrandIndexHandler();
