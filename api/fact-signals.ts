/**
 * Read-only, source-attributed market-context feed for Sajda's small signals.
 *
 * It exposes only curated historical sale records and a fixed, optional
 * aggregate source. It is intentionally not a generic feed reader, scraper,
 * marketplace price feed, appraisal endpoint, or individual-sale API.
 */

import { getFactSignalFeed } from "./_shared/fact-signals.mjs";
import {
  createRequestId,
  setPublicApiHeaders,
  withMachineErrorCode,
} from "./_shared/public-api.js";

interface VercelRequestLike {
  method?: string;
  url?: string;
}

interface VercelResponseLike {
  setHeader(name: string, value: string | number): void;
  status(code: number): VercelResponseLike;
  json(payload: unknown): void;
  end(payload?: string): void;
}

function sendJson(response: VercelResponseLike, status: number, payload: unknown): void {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  // The shared source module owns its bounded cache. Keeping HTTP responses
  // private/no-store means the request ID is a real response correlation ID
  // rather than a stale CDN header reused for a different caller.
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "same-origin");
  response.status(status).json(withMachineErrorCode(status, payload));
}

function parseLimit(value: string | null): number {
  if (value === null || value === "") return 6;
  if (!/^(?:[1-9]|10)$/u.test(value)) throw new Error("limit must be an integer from 1 to 10.");
  return Number(value);
}

function parseTld(value: string | null): string {
  if (value === null || value === "") return "com";
  if (!/^\.?[a-z]{2,12}$/iu.test(value)) throw new Error("tld must be a supported extension.");
  return value;
}

export default async function handler(request: VercelRequestLike, response: VercelResponseLike): Promise<void> {
  const requestId = createRequestId();
  setPublicApiHeaders(response, { requestId, allowMethods: "GET, OPTIONS" });

  if (request.method === "OPTIONS") {
    response.setHeader("Allow", "GET, OPTIONS");
    response.status(204).end();
    return;
  }
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET, OPTIONS");
    sendJson(response, 405, { error: "Only GET requests are supported." });
    return;
  }

  try {
    const url = new URL(request.url ?? "/api/fact-signals", "https://sajda.invalid");
    const payload = await getFactSignalFeed({
      tld: parseTld(url.searchParams.get("tld")),
      limit: parseLimit(url.searchParams.get("limit")),
      environment: process.env,
    });
    sendJson(response, 200, payload);
  } catch (error) {
    sendJson(response, 400, {
      error: error instanceof Error ? error.message : "The fact signal request could not be completed.",
    });
  }
}
