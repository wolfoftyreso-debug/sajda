import { createHash, timingSafeEqual } from "node:crypto";
import domainSearchHandler, { createTrustedApiEngineRequest } from "../domain-search.js";
import { authenticatePersistedApiKey } from "../_shared/developer-api-keys.js";
import { NAMES_API_MAX_BODY_BYTES, parseNamesApiRequest } from "../_shared/names-contract.js";
import { createRequestId, withMachineErrorCode } from "../_shared/public-api.js";

/**
 * Authenticated Sajda Domains API, version 1.
 *
 * This route is deliberately a narrow wrapper around the audited anonymous
 * search engine. Its customer credentials are generated through the
 * authenticated same-origin developer-key endpoint and retained only as
 * SHA-256 digests in the server-side database. The legacy server-only
 * `SAJDA_API_KEY_HASHES` allow-list remains valid during migration.
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

interface ApiKeyRecord {
  id: string;
  hash: Buffer;
}

interface ApiRateLimitEntry {
  startedAt: number;
  count: number;
}

interface ApiQuotaResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

const API_VERSION = "v1";
const API_REQUESTS_PER_MINUTE = 4;
const API_KEY_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{2,63}$/u;
const API_KEY_HASH_PATTERN = /^[a-f0-9]{64}$/u;
const API_KEY_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,256}$/u;
const apiRateLimits = new Map<string, ApiRateLimitEntry>();

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

function setApiResponseHeaders(response: VercelResponseLike, requestId: string, quota?: ApiQuotaResult): void {
  response.setHeader("X-Sajda-Api-Version", API_VERSION);
  response.setHeader("X-Request-Id", requestId);
  response.setHeader("Vary", "Authorization");
  if (!quota) return;
  response.setHeader("X-RateLimit-Limit", String(API_REQUESTS_PER_MINUTE));
  response.setHeader("X-RateLimit-Remaining", String(quota.remaining));
  response.setHeader("X-RateLimit-Reset", String(Math.ceil(quota.resetAt / 1_000)));
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
  const stream = request as unknown as AsyncIterable<Uint8Array | string>;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > NAMES_API_MAX_BODY_BYTES) throw new Error("The request body is too large.");
    chunks.push(buffer);
  }
  return parseJson(Buffer.concat(chunks));
}

function configuredApiKeys(): ApiKeyRecord[] {
  const configured = process.env.SAJDA_API_KEY_HASHES?.trim();
  if (!configured) return [];

  const records: ApiKeyRecord[] = [];
  const usedIds = new Set<string>();
  for (const entry of configured.split(/[\n,]/u)) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const separator = trimmed.indexOf(":");
    if (separator < 1 || separator !== trimmed.lastIndexOf(":")) return [];
    const id = trimmed.slice(0, separator).trim();
    const hash = trimmed.slice(separator + 1).trim().toLowerCase();
    if (!API_KEY_ID_PATTERN.test(id) || !API_KEY_HASH_PATTERN.test(hash) || usedIds.has(id)) return [];
    usedIds.add(id);
    records.push({ id, hash: Buffer.from(hash, "hex") });
  }
  return records;
}

async function authenticatedClientId(request: VercelRequestLike): Promise<string | undefined> {
  const authorization = headerValue(request, "authorization");
  if (!authorization.startsWith("Bearer ")) return undefined;
  const token = authorization.slice("Bearer ".length);
  if (!API_KEY_TOKEN_PATTERN.test(token)) return undefined;

  // New keys use a public lookup segment and a server-only hash. The verifier
  // reads exactly one active-key candidate and compares a fixed-length digest.
  // No key material, browser session, or provider credential reaches the
  // domain engine. An unavailable database does not accidentally authorize a
  // new key; the legacy static hash list is still checked below for existing
  // operator integrations during the migration window.
  const persisted = await authenticatePersistedApiKey(token);
  if (persisted.status === "authenticated") return persisted.clientId;

  const candidateHash = createHash("sha256").update(token, "utf8").digest();
  let authenticatedId: string | undefined;
  for (const configured of configuredApiKeys()) {
    // Every configured hash has the same 32-byte length. Compare every entry
    // so a valid prefix/position does not alter the comparison work.
    if (timingSafeEqual(candidateHash, configured.hash)) authenticatedId = configured.id;
  }
  return authenticatedId;
}

function takeApiQuota(clientId: string): ApiQuotaResult {
  const now = Date.now();
  for (const [key, value] of apiRateLimits) {
    if (now - value.startedAt >= 60_000) apiRateLimits.delete(key);
  }

  const existing = apiRateLimits.get(clientId);
  const startedAt = existing?.startedAt ?? now;
  const resetAt = startedAt + 60_000;
  const count = existing?.count ?? 0;
  if (count >= API_REQUESTS_PER_MINUTE) {
    return { allowed: false, remaining: 0, resetAt };
  }

  const nextCount = count + 1;
  apiRateLimits.set(clientId, { startedAt, count: nextCount });
  return { allowed: true, remaining: API_REQUESTS_PER_MINUTE - nextCount, resetAt };
}

function isJsonRequest(request: VercelRequestLike): boolean {
  return /^application\/json(?:\s*;|$)/iu.test(headerValue(request, "content-type").trim());
}

export default async function handler(request: VercelRequestLike, response: VercelResponseLike): Promise<void> {
  const requestId = createRequestId();

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    setApiResponseHeaders(response, requestId);
    sendJson(response, 405, { error: "Only POST requests are supported." });
    return;
  }
  if (!isJsonRequest(request)) {
    setApiResponseHeaders(response, requestId);
    sendJson(response, 415, { error: "Content-Type must be application/json." });
    return;
  }

  const clientId = await authenticatedClientId(request);
  if (!clientId) {
    setApiResponseHeaders(response, requestId);
    sendJson(response, 401, { error: "Invalid API key." });
    return;
  }

  const quota = takeApiQuota(clientId);
  setApiResponseHeaders(response, requestId, quota);
  if (!quota.allowed) {
    response.setHeader("Retry-After", String(Math.max(1, Math.ceil((quota.resetAt - Date.now()) / 1_000))));
    sendJson(response, 429, { error: "API rate limit exceeded. Please retry after the reset time." });
    return;
  }

  try {
    const body = parseNamesApiRequest(await readJson(request));
    // Deliberately pass only the sanitized payload into the public engine. It
    // gets a server-only Symbol identity for its own per-client quota; the raw
    // Authorization value never reaches that engine or any provider adapter.
    const engineRequest = createTrustedApiEngineRequest({ method: "POST", headers: {} }, body, clientId, requestId);
    await domainSearchHandler(engineRequest, response);
  } catch (error) {
    const status = error instanceof Error && /body is too large/iu.test(error.message) ? 413 : 400;
    sendJson(response, status, {
      error: error instanceof Error ? error.message : "The API request could not be completed.",
    });
  }
}
