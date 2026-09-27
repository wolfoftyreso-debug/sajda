import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { fetchConnectorRegistrarOffers, type ConnectorRegistrarResult } from "../../api/_shared/connector-registrar.js";

const PATH = "/api/internal/registrar/cloudflare";
const MAX_BODY_BYTES = 8 * 1024;
const MAX_DOMAINS = 180;
const BATCH_SIZE = 20;
const CONCURRENCY = 3;
const TOKEN = /^[A-Za-z0-9_-]{32,128}$/u;

function send(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Robots-Tag", "noindex, nofollow");
  response.end(JSON.stringify(body));
}

function authorized(header: IncomingMessage["headers"]["authorization"], expected: string | undefined): boolean {
  if (typeof header !== "string" || typeof expected !== "string" || !TOKEN.test(expected)) return false;
  const match = /^Bearer ([A-Za-z0-9_-]{32,128})$/u.exec(header);
  if (!match) return false;
  const supplied = Buffer.from(match[1]), configured = Buffer.from(expected);
  return supplied.length === configured.length && timingSafeEqual(supplied, configured);
}

function validDomain(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 253 || value !== value.toLowerCase()) return false;
  const labels = value.split(".");
  return labels.length >= 2 && /^[a-z]{2,63}$/u.test(labels.at(-1)!)
    && labels.every(label => !label.startsWith("xn--") && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(label));
}

async function body(request: IncomingMessage): Promise<unknown> {
  const contentType = request.headers["content-type"];
  if (typeof contentType !== "string" || !/^application\/json(?:\s*;.*)?$/iu.test(contentType)) throw new Error("content_type");
  const declared = request.headers["content-length"];
  if (typeof declared === "string" && (!/^\d+$/u.test(declared) || Number(declared) > MAX_BODY_BYTES)) throw new Error("body_size");
  let size = 0, text = "";
  for await (const value of request) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error("body_size");
    text += chunk.toString("utf8");
  }
  return JSON.parse(text);
}

async function mapLimit<T, R>(values: readonly T[], limit: number, task: (value: T) => Promise<R>): Promise<R[]> {
  const output = new Array<R>(values.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor++;
      output[index] = await task(values[index]);
    }
  }));
  return output;
}

async function quote(domains: string[]): Promise<ConnectorRegistrarResult> {
  const batches = Array.from({ length: Math.ceil(domains.length / BATCH_SIZE) }, (_, index) =>
    domains.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE));
  const results = await mapLimit(batches, CONCURRENCY, batch => fetchConnectorRegistrarOffers(batch));
  if (results.some(result => result.status !== "ok")) {
    const failed = results.find(result => result.status !== "ok")!;
    return { status: failed.status, ...(failed.failureReason ? { failureReason: failed.failureReason } : {}), offers: {},
      checkedDomains: results.reduce((total, result) => total + result.checkedDomains, 0) };
  }
  return { status: "ok", offers: Object.assign({}, ...results.map(result => result.offers)),
    checkedDomains: results.reduce((total, result) => total + result.checkedDomains, 0) };
}

/** Purpose-scoped private bridge. It cannot register, reserve, renew or buy a domain. */
export default async function handler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if ((request.url || "").split("?")[0] !== PATH) { send(response, 404, { error: "not_found" }); return; }
  if (request.method !== "POST") { response.setHeader("Allow", "POST"); send(response, 405, { error: "method_not_allowed" }); return; }
  if (!authorized(request.headers.authorization, process.env.SAJDA_REGISTRAR_BRIDGE_TOKEN)) {
    response.setHeader("WWW-Authenticate", 'Bearer realm="sajda-registrar-bridge"');
    send(response, 401, { error: "unauthorized" }); return;
  }
  try {
    const payload = await body(request);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)
      || Object.keys(payload).length !== 1 || !("domains" in payload)
      || !Array.isArray(payload.domains) || payload.domains.length < 1 || payload.domains.length > MAX_DOMAINS
      || !payload.domains.every(validDomain) || new Set(payload.domains).size !== payload.domains.length) {
      send(response, 400, { error: "invalid_request" }); return;
    }
    send(response, 200, await quote(payload.domains));
  } catch {
    send(response, 400, { error: "invalid_request" });
  }
}
