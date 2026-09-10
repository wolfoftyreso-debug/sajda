import { AccountAccessError } from "./account-error.js";
import { accountRequestOrigin, accountWebHeaders, requireSameOrigin, type AccountHeaders } from "./account-origin.js";
import { getAccountAuth } from "./account-server.js";
import { readDelegatedAccount, verifyDelegatedUser } from "./delegated-account.js";

export { AccountAccessError } from "./account-error.js";
export interface VerifiedAccount { id: string; emailVerified: boolean }

/** The initiating ID is a race guard, never an identity credential. */
export function verifySessionAccount(value: unknown, expectedId: unknown, verifiedEmail = false): VerifiedAccount {
  const result = value as { user?: { id?: unknown; emailVerified?: unknown }; session?: { userId?: unknown; expiresAt?: unknown } } | null;
  const id = result?.user?.id;
  const expiry = new Date(String(result?.session?.expiresAt ?? "")).getTime();
  if (typeof id !== "string" || !id || id.length > 200 || result?.session?.userId !== id
    || !Number.isFinite(expiry) || expiry <= Date.now()) {
    throw new AccountAccessError("invalid_session", 401, "Your session has expired. Sign in again.");
  }
  if (typeof expectedId !== "string" || expectedId !== id) {
    throw new AccountAccessError("account_changed", 409, "Your account changed. Reload before trying again.");
  }
  const emailVerified = result?.user?.emailVerified === true;
  if (verifiedEmail && !emailVerified) {
    throw new AccountAccessError("email_verification_required", 403, "Confirm your email address before using this account feature.");
  }
  return { id, emailVerified };
}

export async function requireAccount(
  headers: AccountHeaders = {},
  options: { verifiedEmail?: boolean; method?: string } = {},
): Promise<VerifiedAccount> {
  const delegated = readDelegatedAccount(headers, options.method);
  if (delegated) {
    try { return await verifyDelegatedUser(delegated, options.verifiedEmail); }
    catch (error) {
      if (error instanceof AccountAccessError) throw error;
      throw new AccountAccessError("auth_unavailable", 503, "Account verification is temporarily unavailable. Try again.");
    }
  }
  const cookie = headers.cookie;
  if (typeof cookie !== "string" || cookie.length > 8192
    || !/(?:^|;\s*)(?:__Secure-)?sajda\.session_token=[^;\s]+/u.test(cookie)
    || (cookie.match(/(?:^|;\s*)(?:__Secure-)?sajda\.session_token=/gu)?.length ?? 0) !== 1) {
    throw new AccountAccessError("authentication_required", 401, "Sign in to your Sajda account to continue.");
  }
  const origin = accountRequestOrigin(headers);
  if (options.method && !["GET", "HEAD"].includes(options.method)) requireSameOrigin(headers, origin);
  try {
    const value = await getAccountAuth(origin).api.getSession({
      headers: accountWebHeaders(headers), query: { disableCookieCache: true, disableRefresh: true },
    });
    return verifySessionAccount(value, headers["x-sajda-account"], options.verifiedEmail);
  } catch (error) {
    if (error instanceof AccountAccessError) throw error;
    throw new AccountAccessError("auth_unavailable", 503, "Account verification is temporarily unavailable. Try again.");
  }
}
