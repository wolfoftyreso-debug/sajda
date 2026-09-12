import type { ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { ErrorCode, isJSONRPCRequest, JSONRPCMessageSchema } from "@modelcontextprotocol/sdk/types.js";
import { AccountAccessError } from "../_shared/account-error.js";
import { accountRequestOrigin } from "../_shared/account-origin.js";
import { createRequestId } from "../_shared/public-api.js";
import { createPublicMcpExecutor, createPublicMcpServer, PUBLIC_MCP_VERSION, type PublicMcpExecutor } from "../_shared/public-mcp-tools.js";
import { readBody, sendError, type McpRequest } from "../_shared/mcp-transport.js";

export const config = { maxDuration: 60 };
const clientOrigins = new Set(["https://chatgpt.com", "https://claude.ai", "https://grok.com"]);

/** Separate authless endpoint. Never downgrade the authenticated /api/mcp.
 * Search quota is the existing anonymous engine quota, not an API-key grant.
 * The metadata limiter is only a bounded per-instance abuse guard. */
export function createPublicMcpHandler(dependencies: {
  execute?: PublicMcpExecutor; requestOrigin?: typeof accountRequestOrigin; now?: () => number;
} = {}) {
  const metadataBudget = new Map<string, { start: number; count: number }>();
  return async (request: McpRequest, response: ServerResponse): Promise<void> => {
    const requestId = createRequestId();
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("X-Robots-Tag", "noindex, nofollow");
    response.setHeader("X-Request-Id", requestId);
    response.setHeader("X-Sajda-MCP-Version", PUBLIC_MCP_VERSION);
    response.setHeader("Vary", "Origin, MCP-Protocol-Version");
    try {
      const expected = (dependencies.requestOrigin ?? accountRequestOrigin)(request.headers);
      const origin = request.headers.origin;
      if (origin !== undefined && (typeof origin !== "string" || (origin !== expected && !clientOrigins.has(origin)))) {
        throw new AccountAccessError("invalid_origin", 403, "This browser origin is not allowed. Use a server-side MCP client.");
      }
      if (request.headers.authorization !== undefined) {
        throw new AccountAccessError("authorization_not_supported", 400, "Connect without authentication. Use /api/mcp for scoped private API-key access.");
      }
      if (origin) {
        response.setHeader("Access-Control-Allow-Origin", origin);
        response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
        response.setHeader("Access-Control-Allow-Headers", "Content-Type, MCP-Protocol-Version");
        response.setHeader("Access-Control-Expose-Headers", "X-Request-Id, Retry-After");
      }
      if (request.method === "OPTIONS") { response.statusCode = 204; response.end(); return; }
      if (request.method !== "POST") {
        response.setHeader("Allow", "POST, OPTIONS");
        sendError(response, 405, ErrorCode.InvalidRequest, "Use POST for stateless Streamable HTTP.", requestId, "method_not_allowed"); return;
      }
      const now = (dependencies.now ?? Date.now)();
      for (const [key, value] of metadataBudget) if (now - value.start >= 60_000) metadataBudget.delete(key);
      const header = request.headers["x-forwarded-for"];
      const identity = (typeof header === "string" ? header.split(",")[0].trim() : "unknown").slice(0, 128);
      const budget = metadataBudget.get(identity);
      if (budget && budget.count >= 120 || !budget && metadataBudget.size >= 4096) {
        response.setHeader("Retry-After", "60");
        throw new AccountAccessError("rate_limited", 429, "Too many connector requests. Wait one minute.");
      }
      if (budget) budget.count++; else metadataBudget.set(identity, { start: now, count: 1 });
      const body = await readBody(request);
      if (Array.isArray(body) || !JSONRPCMessageSchema.safeParse(body).success) {
        throw new AccountAccessError("invalid_request", 400, "Send one valid JSON-RPC 2.0 message per request.");
      }
      if (isJSONRPCRequest(body) && body.method === "tools/call" && body.params?.task !== undefined) {
        sendError(response, 200, ErrorCode.InvalidParams, "Task-augmented tool calls are not supported.", requestId, "unsupported_task", body.id); return;
      }
      const server = createPublicMcpServer(dependencies.execute ?? createPublicMcpExecutor(request.headers, requestId), requestId);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      response.once("close", () => { void server.close().catch(() => {}); });
      await server.connect(transport);
      await transport.handleRequest(request, response, body);
    } catch (error) {
      if (response.headersSent || response.writableEnded) return;
      const safe = error instanceof AccountAccessError ? error : new AccountAccessError("mcp_unavailable", 503, "Sajda MCP is temporarily unavailable.");
      sendError(response, safe.status, safe.code === "parse_error" ? ErrorCode.ParseError : safe.status >= 500 ? ErrorCode.InternalError : ErrorCode.InvalidRequest,
        safe.message, requestId, safe.code);
    }
  };
}
export default createPublicMcpHandler();
