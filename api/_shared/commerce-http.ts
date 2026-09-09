import type { IncomingMessage } from "node:http";
import { z } from "zod";
import { createHash } from "node:crypto";
import { AccountAccessError } from "./account-error.js";
import { CommerceError } from "./commerce-config.js";
import { getNeonSql } from "./neon.js";

export type BillingRequest = Pick<IncomingMessage, "method" | "headers"> & {
  body?: unknown;
  on?: IncomingMessage["on"];
  [Symbol.asyncIterator]?: IncomingMessage[typeof Symbol.asyncIterator];
};
export interface BillingResponse {
  setHeader(name: string, value: string | number): void;
  status(code: number): BillingResponse;
  json(body: unknown): void;
}
export function billingHeaders(
  response: BillingResponse,
  requestId: string,
): void {
  for (const [name, value] of Object.entries({
    "Cache-Control": "private, no-store",
    Vary: "Cookie",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow",
    "X-Request-Id": requestId,
  }))
    response.setHeader(name, value);
}
const action = z
  .object({
    action: z.enum(["checkout", "portal"]),
    requestKey: z.string().uuid(),
  })
  .strict();
export async function billingAction(
  request: BillingRequest,
): Promise<z.infer<typeof action>> {
  if (
    typeof request.headers["content-type"] !== "string" ||
    !/^application\/json(?:\s*;|$)/iu.test(request.headers["content-type"])
  )
    throw new CommerceError("unsupported_media_type", 415);
  let value = request.body;
  if (value === undefined)
    value = (await rawWebhookBody(request, 2048)).toString("utf8");
  try {
    if (Buffer.isBuffer(value)) value = value.toString("utf8");
    if (typeof value === "string") {
      if (Buffer.byteLength(value) > 2048) throw new Error();
      value = JSON.parse(value);
    }
    if (Buffer.byteLength(JSON.stringify(value)) > 2048) throw new Error();
    return action.parse(value);
  } catch {
    throw new CommerceError("invalid_billing_request", 400);
  }
}
export async function rawWebhookBody(
  request: BillingRequest,
  maximum = 262144,
): Promise<Buffer> {
  const length = request.headers["content-length"];
  if (
    typeof length === "string" &&
    (!/^\d+$/u.test(length) || Number(length) > maximum)
  )
    throw new CommerceError("request_too_large", 413);
  // @vercel/node addHelpers installs a lazy JSON body getter, while restoring
  // the original bytes to req.on('data'/'end'). Do not invoke that getter.
  // Explicit Buffer/string values support local transports without re-encoding
  // a parsed object and claiming that the original signature was verified.
  const descriptor = Object.getOwnPropertyDescriptor(request, "body");
  const body =
    descriptor && "value" in descriptor ? descriptor.value : undefined;
  if (Buffer.isBuffer(body)) {
    if (body.length > maximum)
      throw new CommerceError("request_too_large", 413);
    return body;
  }
  if (typeof body === "string") {
    if (Buffer.byteLength(body) > maximum)
      throw new CommerceError("request_too_large", 413);
    return Buffer.from(body);
  }
  if (body !== undefined)
    throw new CommerceError("raw_webhook_body_required", 400);
  if (request.on)
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let bytes = 0,
        settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve(Buffer.concat(chunks));
      };
      const timer = setTimeout(
        () => finish(new CommerceError("webhook_body_timeout", 408)),
        5000,
      );
      timer.unref();
      request.on!("data", (chunk: Buffer | string) => {
        if (settled) return;
        const buffer = Buffer.from(chunk);
        bytes += buffer.length;
        if (bytes > maximum) {
          finish(new CommerceError("request_too_large", 413));
          return;
        }
        chunks.push(buffer);
      });
      request.on!("end", () => finish());
      request.on!("error", () =>
        finish(new CommerceError("invalid_webhook_body", 400)),
      );
    });
  let lengthSoFar = 0;
  const chunks: Buffer[] = [];
  if (request[Symbol.asyncIterator])
    for await (const chunk of request as IncomingMessage) {
      const buffer = Buffer.from(chunk);
      lengthSoFar += buffer.length;
      if (lengthSoFar > maximum)
        throw new CommerceError("request_too_large", 413);
      chunks.push(buffer);
    }
  return Buffer.concat(chunks);
}
export async function limitBilling(
  ownerId: string,
  method: string,
): Promise<void> {
  const subject = createHash("sha256")
    .update(`commerce:${ownerId}`)
    .digest("hex");
  const rows = await getNeonSql().query(
    `INSERT INTO sajda.function_rate_limits(scope,subject_hash,window_started_at,request_count)
    VALUES($1,$2,date_trunc('minute',statement_timestamp()),1)
    ON CONFLICT(scope,subject_hash,window_started_at) DO UPDATE SET request_count=sajda.function_rate_limits.request_count+1,updated_at=statement_timestamp()
    RETURNING request_count`,
    [method === "POST" ? "commerce-mutate" : "commerce-read", subject],
    { fetchOptions: { signal: AbortSignal.timeout(3500) } },
  );
  const count = Number(rows[0]?.request_count);
  if (!Number.isSafeInteger(count) || count < 1)
    throw new CommerceError("billing_unavailable");
  if (count > (method === "POST" ? 6 : 30))
    throw new CommerceError("billing_rate_limited", 429);
}
export function billingFailure(
  error: unknown,
  response: BillingResponse,
  requestId: string,
  webhook = false,
): void {
  const failure =
    error instanceof CommerceError || error instanceof AccountAccessError
      ? error
      : new CommerceError("billing_unavailable");
  const status = webhook && failure.status === 409 ? 503 : failure.status;
  if (status >= 500)
    console.error(
      JSON.stringify({
        event: webhook ? "commerce_webhook_failed" : "commerce_request_failed",
        requestId,
        code: failure.code,
      }),
    );
  if (status === 429 || status === 503) response.setHeader("Retry-After", 5);
  response.status(status).json({ code: failure.code, requestId });
}
