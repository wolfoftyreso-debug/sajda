/**
 * Public OpenAPI document for Sajda's anonymous and protected API surfaces.
 * It intentionally contains no key, tenant, provider credential, or
 * deployment-specific secret.
 */

import { openApiDocument } from "./_shared/openapi-document.mjs";
import {
  createRequestId,
  setPublicApiHeaders,
  withMachineErrorCode,
} from "./_shared/public-api.js";

export { openApiDocument };

interface VercelRequestLike {
  method?: string;
}

interface VercelResponseLike {
  setHeader(name: string, value: string | number): void;
  status(code: number): VercelResponseLike;
  json(payload: unknown): void;
  end(payload?: string): void;
}

function sendJson(response: VercelResponseLike, status: number, payload: unknown): void {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.status(status).json(withMachineErrorCode(status, payload));
}

export default function handler(request: VercelRequestLike, response: VercelResponseLike): void {
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
  sendJson(response, 200, openApiDocument);
}
