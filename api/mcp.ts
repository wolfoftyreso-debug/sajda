import type { ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { ErrorCode, isJSONRPCRequest, JSONRPCMessageSchema } from "@modelcontextprotocol/sdk/types.js";
import { AccountAccessError } from "./_shared/account-error.js";
import { accountRequestOrigin } from "./_shared/account-origin.js";
import { consumeApiKeyQuota, requireApiKey } from "./_shared/developer-api-keys.js";
import { executeMcpProduct } from "./_shared/mcp-product.js";
import { createSajdaMcpServer, SAJDA_MCP_VERSION, type McpProductExecutor } from "./_shared/mcp-tools.js";
import { createRequestId } from "./_shared/public-api.js";
import { readBody, sendError, type McpRequest } from "./_shared/mcp-transport.js";

export { readBody, sendError, type McpRequest } from "./_shared/mcp-transport.js";

export const config = { maxDuration: 60 };

/** Remote, bearer-authenticated Streamable HTTP with no process-local session. */
export function createMcpHandler(dependencies: {
  authorize?: typeof requireApiKey;
  quota?: typeof consumeApiKeyQuota;
  execute?: McpProductExecutor;
  requestOrigin?: typeof accountRequestOrigin;
} = {}) {
  return async (request: McpRequest, response: ServerResponse): Promise<void> => {
    const requestId = createRequestId();
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("X-Robots-Tag", "noindex, nofollow");
    response.setHeader("Vary", "Authorization, Origin, MCP-Protocol-Version");
    response.setHeader("X-Request-Id", requestId);
    response.setHeader("X-Sajda-MCP-Version", SAJDA_MCP_VERSION);
    try {
      const expectedOrigin = (dependencies.requestOrigin ?? accountRequestOrigin)(request.headers);
      if (request.headers.origin !== undefined && request.headers.origin !== expectedOrigin) {
        throw new AccountAccessError("invalid_origin", 403, "This request origin is not allowed.");
      }
      const principal = await (dependencies.authorize ?? requireApiKey)(request.headers);
      // GET has no stream, DELETE has no session to delete. Both are explicitly
      // allowed to return 405 by the Streamable HTTP specification.
      if (request.method !== "POST") {
        response.setHeader("Allow", "POST");
        sendError(response, 405, ErrorCode.InvalidRequest, "Use POST for this stateless MCP endpoint.", requestId, "method_not_allowed");
        return;
      }
      const quota = await (dependencies.quota ?? consumeApiKeyQuota)(principal, "requests");
      if (!quota.allowed) {
        response.setHeader("Retry-After", String(Math.max(1, Math.ceil((quota.resetAt - Date.now()) / 1000))));
        throw new AccountAccessError("rate_limited", 429, "The API request limit has been reached. Retry after the reset time.");
      }
      // The SDK validates media negotiation, JSON-RPC shape, protocol headers,
      // initialization, method dispatch and schemas. The wrapper bounds input
      // before passing Vercel's already-parsed body to the transport.
      const body = await readBody(request);
      // Recent MCP revisions require exactly one JSON-RPC message per POST.
      // SDK 1.x retains legacy batch support, so enforce this at our boundary.
      if (Array.isArray(body) || !JSONRPCMessageSchema.safeParse(body).success) {
        throw new AccountAccessError("invalid_request", 400, "Send one valid JSON-RPC 2.0 message per request.");
      }
      if (isJSONRPCRequest(body) && body.method === "tools/call" && body.params?.task !== undefined) {
        sendError(response, 200, ErrorCode.InvalidParams, "Task-augmented tool calls are not supported. Use an ordinary tool call.",
          requestId, "unsupported_task", body.id);
        return;
      }
      const server = createSajdaMcpServer(principal, dependencies.execute ?? executeMcpProduct, requestId);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      // Register cleanup before dispatch; handleRequest may finish immediately.
      response.once("close", () => { void server.close().catch(() => {}); });
      await server.connect(transport);
      await transport.handleRequest(request, response, body);
    } catch (error) {
      if (response.headersSent || response.writableEnded) return;
      const safe = error instanceof AccountAccessError ? error
        : new AccountAccessError("mcp_unavailable", 503, "Sajda MCP is temporarily unavailable.");
      if (safe.status === 401) response.setHeader("WWW-Authenticate", 'Bearer realm="sajda-mcp", error="invalid_token"');
      sendError(response, safe.status, safe.code === "parse_error" ? ErrorCode.ParseError
        : safe.status >= 500 ? ErrorCode.InternalError : ErrorCode.InvalidRequest, safe.message, requestId, safe.code);
    }
  };
}

export default createMcpHandler();
