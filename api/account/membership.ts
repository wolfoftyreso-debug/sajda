import { isAccountMembership } from "../../shared/account-membership.js";
import { AccountAccessError, requireAccount } from "../_shared/account-auth.js";
import { getAccountMembership } from "../_shared/account-membership.js";
import { createRequestId } from "../_shared/public-api.js";

interface RequestLike {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
}
interface ResponseLike {
  setHeader(name: string, value: string | number): void;
  status(code: number): ResponseLike;
  json(value: unknown): void;
}

export const config = { maxDuration: 20 };

/** Same verified session and ownership race guard as every account action. */
export function createAccountMembershipHandler(authorize = requireAccount, readMembership = getAccountMembership) {
  return async function handler(request: RequestLike, response: ResponseLike): Promise<void> {
    const requestId = createRequestId();
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Vary", "Cookie, X-Sajda-Account");
    response.setHeader("X-Request-Id", requestId);
    response.setHeader("X-Robots-Tag", "noindex, nofollow");
    if (request.method !== "GET") {
      response.setHeader("Allow", "GET");
      response.status(405).json({ error: "Use GET.", code: "method_not_allowed", requestId });
      return;
    }
    try {
      const account = await authorize(request.headers, { verifiedEmail: true, method: request.method });
      const membership = await readMembership(account);
      if (!isAccountMembership(membership)) throw new Error("Invalid membership result");
      response.status(200).json({ accountId: account.id, requestId, membership });
    } catch (error) {
      const failure = error instanceof AccountAccessError ? error
        : new AccountAccessError("membership_unavailable", 503, "Your account plan could not be checked. Refresh to try again.");
      if (failure.status === 429) response.setHeader("Retry-After", 60);
      if (failure.status >= 500) console.error(JSON.stringify({ event: "account_membership_failed", requestId, code: failure.code }));
      response.status(failure.status).json({ error: failure.message, code: failure.code, requestId });
    }
  };
}

export default createAccountMembershipHandler();
