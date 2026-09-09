import { createHash } from "node:crypto";
import { getNeonSql } from "../_shared/neon.js";
import { AccountAccessError, requireAccount, type VerifiedAccount } from "../_shared/account-auth.js";
import { createRequestId } from "../_shared/public-api.js";
import { parseSavedDomainCursor, removeDomainInput, saveDomainInput } from "../_shared/saved-domain-input.js";

interface RequestLike {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  query?: Record<string, unknown>;
  body?: unknown;
}

interface ResponseLike {
  setHeader(name: string, value: string | number): void;
  status(code: number): ResponseLike;
  json(value: unknown): void;
}

export const config = { maxDuration: 15 };
const PAGE_SIZE = 100;
const REQUESTS_PER_MINUTE = 120;

function requestBody(request: RequestLike): unknown {
  const contentType = request.headers?.["content-type"];
  if (typeof contentType !== "string" || !/^application\/json(?:\s*;|$)/iu.test(contentType)) {
    throw new AccountAccessError("unsupported_media_type", 415, "Send an application/json request.");
  }
  try {
    const encoded = typeof request.body === "string" ? request.body : JSON.stringify(request.body);
    if (!encoded || Buffer.byteLength(encoded, "utf8") > 8192) {
      throw new AccountAccessError("request_too_large", 413, "This saved-domain request is too large.");
    }
    return JSON.parse(encoded);
  } catch (error) {
    if (error instanceof AccountAccessError) throw error;
    throw new AccountAccessError("invalid_request", 400, "Send a valid saved-domain request.");
  }
}

async function applyRateLimit(account: VerifiedAccount): Promise<void> {
  const sql = getNeonSql();
  const subject = createHash("sha256").update(`saved-domains:${account.id}`).digest("hex");
  const rows = await sql`
    INSERT INTO sajda.function_rate_limits (scope, subject_hash, window_started_at, request_count)
    VALUES ('saved-domains', ${subject}, date_trunc('minute', now()), 1)
    ON CONFLICT (scope, subject_hash, window_started_at)
    DO UPDATE SET request_count = sajda.function_rate_limits.request_count + 1, updated_at = now()
    RETURNING request_count
  `;
  const count = Number(rows[0]?.request_count);
  if (!Number.isSafeInteger(count) || count < 1) throw new Error("Invalid rate-limit response");
  if (count > REQUESTS_PER_MINUTE) {
    throw new AccountAccessError("rate_limited", 429, "Too many saved-domain requests. Wait a moment and try again.");
  }
}

/** Every query is owner-scoped. A body/query user_id is never trusted. */
export function createSavedDomainsHandler(authorize = requireAccount) {
return async function handler(request: RequestLike, response: ResponseLike): Promise<void> {
  const requestId = createRequestId();
  response.setHeader("Cache-Control", "private, no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Vary", "Cookie");
  response.setHeader("X-Request-Id", requestId);
  response.setHeader("X-Robots-Tag", "noindex, nofollow");

  if (!request.method || !["GET", "POST", "DELETE"].includes(request.method)) {
    response.setHeader("Allow", "GET, POST, DELETE");
    response.status(405).json({ error: "Use GET, POST, or DELETE.", code: "method_not_allowed", requestId });
    return;
  }

  try {
    const account = await authorize(request.headers, { verifiedEmail: true, method: request.method });
    let body: ReturnType<typeof saveDomainInput.parse> | ReturnType<typeof removeDomainInput.parse> | undefined;
    let cursor: string | null = null;
    if (request.method === "GET") {
      try { cursor = parseSavedDomainCursor(request.query?.cursor); } catch {
        throw new AccountAccessError("invalid_cursor", 400, "Use a valid saved-domain page cursor.");
      }
    } else {
      const parsed = (request.method === "POST" ? saveDomainInput : removeDomainInput).safeParse(requestBody(request));
      if (!parsed.success) throw new AccountAccessError("invalid_request", 400, "Enter a valid domain and valid saved-domain details.");
      body = parsed.data;
    }

    await applyRateLimit(account);
    const sql = getNeonSql();

    if (request.method === "GET") {
      const rows = await sql`
        SELECT id::text, domain, registrar_price::float8, estimated_value::float8,
               confidence_score::float8, rationale, created_at, updated_at
        FROM sajda.saved_domains
        WHERE user_id = ${account.id} AND (${cursor}::bigint IS NULL OR id < ${cursor}::bigint)
        ORDER BY id DESC LIMIT ${PAGE_SIZE + 1}
      `;
      const items = rows.slice(0, PAGE_SIZE);
      response.status(200).json({ items, nextCursor: rows.length > PAGE_SIZE ? items[items.length - 1].id : null, requestId });
      return;
    }

    if (request.method === "DELETE") {
      await sql`DELETE FROM sajda.saved_domains WHERE user_id = ${account.id} AND domain = ${body!.domain}`;
      // Idempotent retries: deleting an already removed domain still succeeds.
      response.status(200).json({ ok: true, requestId });
      return;
    }

    const snapshot = body as ReturnType<typeof saveDomainInput.parse>;
    const rows = await sql`
      INSERT INTO sajda.saved_domains (user_id, domain, registrar_price, estimated_value, confidence_score, rationale)
      VALUES (${account.id}, ${snapshot.domain}, ${snapshot.registrarPrice}, ${snapshot.estimatedValue}, ${snapshot.confidenceScore}, ${snapshot.rationale})
      ON CONFLICT (user_id, domain) DO UPDATE SET
        registrar_price = EXCLUDED.registrar_price, estimated_value = EXCLUDED.estimated_value,
        confidence_score = EXCLUDED.confidence_score, rationale = EXCLUDED.rationale, updated_at = now()
      RETURNING id::text, domain
    `;
    if (!rows[0]?.id || rows[0].domain !== snapshot.domain) throw new Error("Save was not confirmed");
    response.status(200).json({ ok: true, item: rows[0], requestId });
  } catch (error) {
    const failure = error instanceof AccountAccessError
      ? error
      : new AccountAccessError("saved_domains_unavailable", 503, "Your saved domains are temporarily unavailable. Nothing was confirmed saved; please retry.");
    if (failure.status === 429) response.setHeader("Retry-After", 60);
    if (failure.status >= 500) console.error(JSON.stringify({ event: "saved_domains_failed", requestId, code: failure.code }));
    response.status(failure.status).json({ error: failure.message, code: failure.code, requestId });
  }
}
}

export default createSavedDomainsHandler();
