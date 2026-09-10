import { isLocalTestMode } from "@/lib/localTestMode";
import type { AccountSession } from "./account-types";
import type { createManagedAccountClient } from "./managed-client";
import { assertAccountSessionOwner, type AccountRequestScope } from "@/lib/accountRequestScope";
import { isNativeApp } from "@/lib/appSurface";
import { readNativeSession, nativeRequest } from "@/lib/nativeTransport";

export const isAccountAuthConfigured = import.meta.env.VITE_ACCOUNT_AUTH_ENABLED === "true" && !isLocalTestMode();
export const accountAuthUnavailableReason = isLocalTestMode() ? "local_test" : "not_configured";

type AccountClient = ReturnType<typeof createManagedAccountClient>;
let clientPromise: Promise<AccountClient> | undefined;

/** Same-origin Vercel auth owns passwords and secure session cookies. */
export async function getAccountAuthClient(): Promise<AccountClient> {
  if (!isAccountAuthConfigured) throw new Error("Account access is not configured.");
  clientPromise ??= import("./managed-client")
    .then(({ createManagedAccountClient }) => createManagedAccountClient())
    .catch(error => { clientPromise = undefined; throw error; });
  return clientPromise;
}

export function accountError(error: unknown, fallback: string): Error {
  if (error && typeof error === "object" && "code" in error) {
    const code = String(error.code);
    const safe = new Error(fallback);
    Object.assign(safe, { code });
    return safe;
  }
  return new Error(fallback);
}

export async function readAccountSession(): Promise<AccountSession | null> {
  if (!isAccountAuthConfigured) return null;
  if (isNativeApp) return readNativeSession();
  const client = await getAccountAuthClient();
  const result = await client.getSession({ query: { disableCookieCache: true } });
  if (result.error) throw accountError(result.error, "Could not restore your account session.");
  if (!result.data?.user || !result.data.session) return null;
  const { user, session } = result.data;
  return {
    user: {
      id: user.id,
      email: user.email,
      email_verified: user.emailVerified,
      created_at: new Date(user.createdAt).toISOString(),
      last_sign_in_at: new Date(session.createdAt).toISOString(),
    },
    expires_at: Math.floor(new Date(session.expiresAt).getTime() / 1000),
  };
}

/** API errors carry only the safe application message and correlation ID. */
export async function accountRequest<T>(path: string, options: AccountRequestScope & { method?: string; body?: unknown }): Promise<T> {
  const target = new URL(path, window.location.origin);
  if (target.origin !== window.location.origin || target.username || target.password || !target.pathname.startsWith("/api/account/")) throw new Error("Invalid account API path.");
  // Snapshot the initiating account before an asynchronous session check.
  const { accountId, signal, body, method = "GET" } = options;
  signal?.throwIfAborted();
  const current = await readAccountSession();
  signal?.throwIfAborted();
  assertAccountSessionOwner(current?.user.id, accountId);
  if (isNativeApp) {
    const response = await nativeRequest("/api/native/account","POST",{path,method,body,accountId},signal);
    const payload = await response.json().catch(()=>null);
    signal?.throwIfAborted();
    if (!response.ok || !payload) {
      const error = new Error(payload?.error ?? "Your app account request could not be completed.");
      Object.assign(error,{status:response.status,code:payload?.code,requestId:payload?.requestId});
      throw error;
    }
    return payload as T;
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timeout = window.setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(target, {
      method,
      headers: { "X-Sajda-Account": accountId, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: "no-store",
      credentials: "same-origin",
      redirect: "error",
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    signal?.throwIfAborted();
    if (!response.ok || !payload) {
      const error = new Error(typeof payload?.error === "string" ? payload.error : "Your account request could not be completed. Try again.");
      Object.assign(error, { code: payload?.code, requestId: payload?.requestId, status: response.status });
      throw error;
    }
    return payload as T;
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}
