import { AccountAccessError, requireAccount } from "../_shared/account-auth.js";
import type { AccountHeaders } from "../_shared/account-origin.js";
import { readDelegatedAccount } from "../_shared/delegated-account.js";
import { createRequestId } from "../_shared/public-api.js";
import { accountDeletionInput, createAccountDeletionService } from "../_shared/account-deletion.js";

interface RequestLike { method?: string; headers?: AccountHeaders; query?: Record<string, unknown>; body?: unknown }
interface ResponseLike {
  setHeader(name: string, value: string | number): void;
  status(code: number): ResponseLike;
  json(body: unknown): void;
}
export const config = { maxDuration: 60 };
export function createAccountDeletionHandler(authorize = requireAccount, service = createAccountDeletionService()) {
  return async (request: RequestLike, response: ResponseLike): Promise<void> => {
    const requestId = createRequestId();
    for (const [key, value] of Object.entries({ "Cache-Control": "private, no-store", "Vary": "Cookie, Authorization",
      "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer", "X-Request-Id": requestId })) response.setHeader(key, value);
    try {
      if (request.method !== "POST") {
        response.setHeader("Allow", "POST");
        throw new AccountAccessError("method_not_allowed", 405, "Use POST to request or confirm account deletion.");
      }
      const delegated = readDelegatedAccount(request.headers ?? {}, "POST");
      if (delegated && (delegated.source !== "native" || !delegated.scopes.includes("account:delete"))) {
        throw new AccountAccessError("insufficient_scope", 403, "Use your own Sajda account to delete it.");
      }
      // Unverified accounts can delete too. The fresh email code proves control
      // of the account's email; verification is not an artificial removal barrier.
      const account = await authorize(request.headers, { method: "POST" });
      if (Object.keys(request.query ?? {}).length) throw new AccountAccessError("invalid_request", 400, "Do not include query parameters.");
      if (typeof request.headers?.["content-type"] !== "string" || !/^application\/json(?:\s*;|$)/iu.test(request.headers["content-type"])) {
        throw new AccountAccessError("unsupported_media_type", 415, "Send application/json.");
      }
      let body: unknown;
      try {
        const raw = request.body;
        const text = Buffer.isBuffer(raw) ? raw.toString("utf8") : typeof raw === "string" ? raw : JSON.stringify(raw);
        if (!text) throw new Error();
        if (Buffer.byteLength(text, "utf8") > 1024) throw new AccountAccessError("request_too_large", 413, "This request is too large.");
        body = JSON.parse(text);
      } catch (error) {
        if (error instanceof AccountAccessError) throw error;
        throw new AccountAccessError("invalid_request", 400, "Send a valid deletion request.");
      }
      const parsed = accountDeletionInput.safeParse(body);
      if (!parsed.success) throw new AccountAccessError("invalid_request", 400, "Request a deletion code, or confirm with the code and DELETE.");
      const result = await service.execute(account, parsed.data);
      response.status(200).json({ ...result, accountId: account.id, requestId });
    } catch (error) {
      const failure = error instanceof AccountAccessError ? error : new AccountAccessError("deletion_unavailable", 503,
        "Account deletion could not finish. Billing may already have stopped. Retry to confirm and finish deletion.");
      if (failure.status === 429) response.setHeader("Retry-After", 3600);
      if (failure.status >= 500) console.error(JSON.stringify({ event: "account_deletion_failed", code: failure.code, requestId }));
      response.status(failure.status).json({ code: failure.code, error: failure.message, requestId });
    }
  };
}
export default createAccountDeletionHandler();
