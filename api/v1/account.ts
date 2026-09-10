import { AccountAccessError } from "../_shared/account-error.js";
import { accountRequestOrigin } from "../_shared/account-origin.js";
import { assertApiKeyScopes, consumeApiKeyQuota, requireApiKey } from "../_shared/developer-api-keys.js";
import { executeMcpProduct } from "../_shared/mcp-product.js";
import { parseProductOperationInput, productOperationScope, type McpOperation, type McpProductExecutor } from "../_shared/mcp-tools.js";
import { createRequestId } from "../_shared/public-api.js";

interface RequestLike {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  query?: Record<string, unknown>;
  body?: unknown;
}
interface ResponseLike {
  setHeader(name: string, value: string | number): void;
  status(code: number): ResponseLike;
  json(value: unknown): void;
}

export const config = { maxDuration: 60 };
const MAX_BODY_BYTES = 8192;

async function readBody(request: RequestLike): Promise<Record<string, unknown>> {
  if (typeof request.headers["content-type"] !== "string" || !/^application\/json(?:\s*;|$)/iu.test(request.headers["content-type"])) {
    throw new AccountAccessError("unsupported_media_type", 415, "Send an application/json request.");
  }
  let text: string;
  let suppliedBody: unknown;
  try { suppliedBody = request.body; } catch {
    throw new AccountAccessError("invalid_request", 400, "Send a valid JSON object.");
  }
  if (suppliedBody !== undefined) text = typeof suppliedBody === "string" ? suppliedBody
    : Buffer.isBuffer(suppliedBody) ? suppliedBody.toString("utf8") : JSON.stringify(suppliedBody);
  else {
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of request as unknown as AsyncIterable<Uint8Array | string>) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buffer.length;
      if (bytes > MAX_BODY_BYTES) throw new AccountAccessError("request_too_large", 413, "The account request body is too large.");
      chunks.push(buffer);
    }
    text = Buffer.concat(chunks).toString("utf8");
  }
  if (text && Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) {
    throw new AccountAccessError("request_too_large", 413, "The account request body is too large.");
  }
  try {
    const body = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body;
  } catch {
    throw new AccountAccessError("invalid_request", 400, "Send a valid JSON object.");
  }
}

function queryNumber(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]{0,4})$/u.test(value)) {
    throw new AccountAccessError("invalid_request", 400, "Use a valid pagination number.");
  }
  return Number(value);
}

/** One explicit REST dispatcher for account state shared with the website. */
export function createAccountApiHandler(dependencies: {
  authorize?: typeof requireApiKey;
  quota?: typeof consumeApiKeyQuota;
  execute?: McpProductExecutor;
  requestOrigin?: typeof accountRequestOrigin;
} = {}) {
  return async (request: RequestLike, response: ResponseLike): Promise<void> => {
    const requestId = createRequestId();
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("X-Robots-Tag", "noindex, nofollow");
    response.setHeader("X-Sajda-Api-Version", "v1");
    response.setHeader("X-Request-Id", requestId);
    response.setHeader("Vary", "Authorization, Origin");
    try {
      const origin = (dependencies.requestOrigin ?? accountRequestOrigin)(request.headers);
      if (request.headers.origin !== undefined && request.headers.origin !== origin) {
        throw new AccountAccessError("invalid_origin", 403, "This request origin is not allowed.");
      }
      const principal = await (dependencies.authorize ?? requireApiKey)(request.headers);
      const query = request.query ?? {};
      const resource = query.resource;
      if (typeof resource !== "string" || !["membership", "saved-domains", "trading", "trading-status"].includes(resource)) {
        throw new AccountAccessError("invalid_resource", 400, "Choose membership, saved-domains, trading, or trading-status.");
      }
      const allowedMethods = resource === "saved-domains" ? ["GET", "POST", "DELETE"] : resource === "trading" ? ["GET", "POST"] : ["GET"];
      if (!request.method || !allowedMethods.includes(request.method)) {
        response.setHeader("Allow", allowedMethods.join(", "));
        throw new AccountAccessError("method_not_allowed", 405, "Use a supported method for this resource.");
      }
      const allowedQuery = request.method === "GET" && resource === "saved-domains" ? ["resource", "cursor"]
        : request.method === "GET" && resource === "trading" ? ["resource", "offset", "limit"] : ["resource"];
      if (Object.keys(query).some(key => !allowedQuery.includes(key))) {
        throw new AccountAccessError("invalid_request", 400, "Use only documented query parameters for this resource.");
      }
      let operation: McpOperation;
      let args: Record<string, unknown> = {};
      if (resource === "membership") operation = "account_membership";
      else if (resource === "trading-status") operation = "trading_status";
      else if (resource === "saved-domains") {
        operation = request.method === "GET" ? "saved_domains_list" : request.method === "POST" ? "saved_domains_save" : "saved_domains_remove";
        args = request.method === "GET" ? (query.cursor === undefined ? {} : { cursor: query.cursor }) : await readBody(request);
      } else if (request.method === "GET") {
        operation = "trading_report";
        const offset = queryNumber(query.offset), limit = queryNumber(query.limit);
        args = { ...(offset === undefined ? {} : { offset }), ...(limit === undefined ? {} : { limit }) };
      } else {
        const { action, ...input } = await readBody(request);
        const actions: Record<string, McpOperation> = { start: "trading_start", advance: "trading_advance", cancel: "trading_stop", refresh_quote: "trading_refresh_quote" };
        if (typeof action !== "string" || !Object.hasOwn(actions, action)) {
          throw new AccountAccessError("invalid_request", 400, "Choose start, advance, cancel, or refresh_quote.");
        }
        operation = actions[action];
        args = input;
      }
      const parsed = parseProductOperationInput(operation, args);
      assertApiKeyScopes(principal, [productOperationScope(operation)]);
      const quota = await (dependencies.quota ?? consumeApiKeyQuota)(principal, "requests");
      if (!quota.allowed) {
        response.setHeader("Retry-After", Math.max(1, Math.ceil((quota.resetAt - Date.now()) / 1000)));
        throw new AccountAccessError("rate_limited", 429, "The account API request limit has been reached.");
      }
      const result = await (dependencies.execute ?? executeMcpProduct)(operation, parsed, principal);
      const productRequestId = typeof result.data.requestId === "string" ? result.data.requestId : requestId;
      response.setHeader("X-Request-Id", productRequestId);
      if (result.retryAfterSeconds !== undefined) response.setHeader("Retry-After", result.retryAfterSeconds);
      response.status(result.status).json({ ...result.data, requestId: productRequestId });
    } catch (error) {
      const safe = error instanceof AccountAccessError ? error
        : new AccountAccessError("account_api_unavailable", 503, "Account operations are temporarily unavailable. Reuse the request key when retrying a mutation.");
      if (safe.status === 401) response.setHeader("WWW-Authenticate", 'Bearer realm="sajda-api", error="invalid_token"');
      response.status(safe.status).json({ code: safe.code, error: safe.message, requestId });
    }
  };
}

export default createAccountApiHandler();
