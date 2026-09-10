import { AccountAccessError } from "./account-error.js";
import type { AccountHeaders } from "./account-origin.js";
import { getNeonSql } from "./neon.js";

export interface DelegatedAccountPrincipal {
  userId: string;
  credentialId: string;
  scopes: readonly string[];
  source: "api-key" | "native";
  environment: string;
}

interface Delegation { principal: DelegatedAccountPrincipal; method: string; expiresAt: number }
// Deliberately not represented by a header value: HTTP clients cannot forge this
// capability. Each adapter must authenticate its credential and scope first.
const delegations = new WeakMap<AccountHeaders, Delegation>();

export function createDelegatedAccountHeaders(
  principal: DelegatedAccountPrincipal, requiredScope: string, method = "GET",
): AccountHeaders {
  const environment = process.env.VERCEL_ENV || "development";
  if (!principal.userId || !principal.credentialId || principal.environment !== environment
    || !principal.scopes.includes(requiredScope)
    || !["GET", "POST", "DELETE"].includes(method)) {
    throw new AccountAccessError("insufficient_scope", 403, "This credential cannot perform this action.");
  }
  const headers: AccountHeaders = Object.freeze({
    "x-sajda-account": principal.userId,
    ...(method !== "GET" ? { "content-type": "application/json" } : {}),
  });
  delegations.set(headers, {
    principal: Object.freeze({ ...principal, scopes: Object.freeze([...principal.scopes]) }),
    method, expiresAt: Date.now() + 60_000,
  });
  return headers;
}

export function readDelegatedAccount(
  headers: AccountHeaders, method?: string,
): DelegatedAccountPrincipal | null {
  const delegation = delegations.get(headers);
  if (!delegation) return null;
  if (delegation.expiresAt <= Date.now() || method !== delegation.method
    || delegation.principal.environment !== (process.env.VERCEL_ENV || "development")) {
    throw new AccountAccessError("invalid_credential", 401, "Authenticate this request again.");
  }
  return delegation.principal;
}

export async function verifyDelegatedUser(principal: DelegatedAccountPrincipal, verifiedEmail = false) {
  const sql = getNeonSql();
  const rows = await sql`SELECT id, "emailVerified" FROM public.sajda_auth_user WHERE id = ${principal.userId}`;
  const user = rows[0];
  if (!user || user.id !== principal.userId) {
    throw new AccountAccessError("invalid_credential", 401, "This account is no longer available.");
  }
  if (verifiedEmail && user.emailVerified !== true) {
    throw new AccountAccessError("email_verification_required", 403, "Confirm your email address before using this account feature.");
  }
  return { id: principal.userId, emailVerified: user.emailVerified === true };
}
