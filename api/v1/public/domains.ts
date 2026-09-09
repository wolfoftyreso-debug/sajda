import domainSearchHandler, { createPublicApiEngineRequest } from "../../domain-search.js";
import { NAMES_API_MAX_BODY_BYTES, parseNamesApiRequest } from "../../_shared/names-contract.js";
import {
  createRequestId,
  setPublicApiHeaders,
  withMachineErrorCode,
} from "../../_shared/public-api.js";

/**
 * Public, no-key developer API for small domain searches.
 *
 * This is intentionally a strict, bounded subset of the consumer product
 * route. It does not issue keys, infer a user identity, create a customer
 * account, expose provider credentials, or imply a paid plan. The protected
 * `POST /api/v1/domains` route remains separate and uses a user-managed,
 * server-side Sajda API key.
 */

interface VercelRequestLike {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

interface VercelResponseLike {
  setHeader(name: string, value: string | number): void;
  status(code: number): VercelResponseLike;
  json(payload: unknown): void;
  end(payload?: string): void;
}

export const config = { maxDuration: 30 };

function sendJson(response: VercelResponseLike, status: number, payload: unknown): void {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "same-origin");
  response.status(status).json(withMachineErrorCode(status, payload));
}

function headerValue(request: VercelRequestLike, name: string): string {
  const value = request.headers[name] ?? request.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function isJsonRequest(request: VercelRequestLike): boolean {
  return /^application\/json(?:\s*;|$)/iu.test(headerValue(request, "content-type").trim());
}

function asJsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Buffer.isBuffer(value)) {
    throw new Error("A JSON object is required.");
  }
  return value as Record<string, unknown>;
}

function parseJson(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Buffer.isBuffer(value)) {
    const serialized = JSON.stringify(value);
    if (!serialized || Buffer.byteLength(serialized, "utf8") > NAMES_API_MAX_BODY_BYTES) {
      throw new Error("The request body is too large.");
    }
    return asJsonObject(value);
  }

  const text = Buffer.isBuffer(value) ? value.toString("utf8") : String(value ?? "");
  if (Buffer.byteLength(text, "utf8") > NAMES_API_MAX_BODY_BYTES) throw new Error("The request body is too large.");
  try {
    return asJsonObject(JSON.parse(text || "{}"));
  } catch (error) {
    if (error instanceof Error && error.message === "A JSON object is required.") throw error;
    throw new Error("Invalid JSON.");
  }
}

async function readJson(request: VercelRequestLike): Promise<Record<string, unknown>> {
  if (request.body !== undefined) return parseJson(request.body);

  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request as unknown as AsyncIterable<Uint8Array | string>) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > NAMES_API_MAX_BODY_BYTES) throw new Error("The request body is too large.");
    chunks.push(buffer);
  }
  return parseJson(Buffer.concat(chunks));
}

export default async function handler(request: VercelRequestLike, response: VercelResponseLike): Promise<void> {
  const requestId = createRequestId();
  setPublicApiHeaders(response, { requestId, allowMethods: "POST, OPTIONS" });

  if (request.method === "OPTIONS") {
    response.setHeader("Allow", "POST, OPTIONS");
    response.status(204).end();
    return;
  }
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST, OPTIONS");
    sendJson(response, 405, { error: "Only POST requests are supported." });
    return;
  }
  if (!isJsonRequest(request)) {
    sendJson(response, 415, { error: "Content-Type must be application/json." });
    return;
  }
  if (headerValue(request, "authorization")) {
    sendJson(response, 400, {
      error: "This public endpoint does not accept Authorization. Use /api/v1/domains with a server-side Sajda API key.",
      code: "authorization_not_supported",
    });
    return;
  }

  try {
    const body = parseNamesApiRequest(await readJson(request));
    // Keep the caller's network headers so the shared anonymous engine uses
    // its existing conservative per-IP budget. The parsed body is the strict
    // documented contract; no consumer-only advanced inputs reach the engine.
    await domainSearchHandler(
      createPublicApiEngineRequest({ method: "POST", headers: request.headers }, body, requestId),
      response,
    );
  } catch (error) {
    const status = error instanceof Error && /body is too large/iu.test(error.message) ? 413 : 400;
    sendJson(response, status, {
      error: error instanceof Error ? error.message : "The public API request could not be completed.",
    });
  }
}
