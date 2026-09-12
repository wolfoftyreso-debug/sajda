import type { IncomingMessage, ServerResponse } from "node:http";
import { AccountAccessError } from "./account-error.js";

const MAX_BODY_BYTES = 16_384;
export type McpRequest = IncomingMessage & { body?: unknown };

export function sendError(response: ServerResponse, status: number, code: number, message: string,
  requestId: string, reason: string, id?: string | number): void {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify({ jsonrpc: "2.0", ...(id === undefined ? {} : { id }), error: { code, message, data: { code: reason, requestId } } }));
}

export async function readBody(request: McpRequest): Promise<unknown> {
  let text: string;
  let suppliedBody: unknown;
  // Vercel exposes a lazy getter which throws for malformed JSON.
  try { suppliedBody = request.body; } catch {
    throw new AccountAccessError("parse_error", 400, "Send valid JSON.");
  }
  if (suppliedBody !== undefined) {
    text = typeof suppliedBody === "string" ? suppliedBody : Buffer.isBuffer(suppliedBody)
      ? suppliedBody.toString("utf8") : JSON.stringify(suppliedBody);
  } else {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > MAX_BODY_BYTES) throw new AccountAccessError("request_too_large", 413, "The MCP request body is too large.");
      chunks.push(bytes);
    }
    text = Buffer.concat(chunks).toString("utf8");
  }
  if (text && Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) {
    throw new AccountAccessError("request_too_large", 413, "The MCP request body is too large.");
  }
  try { return JSON.parse(text); } catch {
    throw new AccountAccessError("parse_error", 400, "Send valid JSON.");
  }
}
