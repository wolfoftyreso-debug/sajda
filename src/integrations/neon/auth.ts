import { isLocalTestMode } from "@/lib/localTestMode";
import { throwIfCancelled } from "@/lib/abort";
import type { AccountSession } from "./account-types";
import type { createManagedAccountClient } from "./managed-client";
import { assertAccountSessionOwner, type AccountRequestScope } from "@/lib/accountRequestScope";
import { isNativeApp } from "@/lib/appSurface";
import { readNativeSession, nativeRequest } from "@/lib/nativeTransport";

export const isAccountAuthConfigured = import.meta.env.VITE_ACCOUNT_AUTH_ENABLED === "true" && !isLocalTestMode();
export const accountAuthUnavailableReason = isLocalTestMode() ? "local_test" : "not_configured";

type AccountClient = ReturnType<typeof createManagedAccountClient>;
let clientPromise: Promise<AccountClient> | undefined;
let sessionReadRevision = 0;
let pendingSessionRead: Promise<AccountSession | null> | undefined;

/** Forget pending reads, never store a completed session as authorization. */
export function invalidateAccountSessionReads(): void {
  sessionReadRevision += 1;
  pendingSessionRead = undefined;
}

function assertSessionReadRevision(revision: number): void {
  if (revision !== sessionReadRevision) {
    throw Object.assign(new Error("Your account changed while checking the session. Try again."), { code: "account_changed", status: 409 });
  }
}

/** Same-origin Vercel auth owns passwords and secure session cookies. */
export async function getAccountAuthClient(): Promise<AccountClient> {
  if (!isAccountAuthConfigured) throw new Error("Account access is not configured.");
  clientPromise ??= import("./managed-client")
    .then(({ createManagedAccountClient }) => createManagedAccountClient())
    .catch(error => { clientPromise = undefined; throw error; });
  return clientPromise;
}

export function accountError(error: unknown, fallback: string): Error {
  const safe = new Error(fallback);
  if (error && typeof error === "object") {
    if ("code" in error && typeof error.code === "string") Object.assign(safe, { code: error.code });
    // Keep only classification metadata, never a provider body, URL or message.
    if ("status" in error && Number.isInteger(error.status) && Number(error.status) >= 100 && Number(error.status) <= 599) {
      Object.assign(safe, { status: error.status });
    }
  }
  return safe;
}

async function readFreshAccountSession(revision: number): Promise<AccountSession | null> {
  const client = await getAccountAuthClient();
  assertSessionReadRevision(revision);
  const result = await client.getSession({ query: { disableCookieCache: true } });
  assertSessionReadRevision(revision);
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

export async function readAccountSession(options: { coalesce?: boolean } = {}): Promise<AccountSession | null> {
  if (!isAccountAuthConfigured) return null;
  if (isNativeApp) return readNativeSession();
  // The default remains fresh: a post-response owner check must never join a
  // read started before that response. Only explicit preflight/background
  // callers share the currently pending read; settled results are discarded.
  const revision = sessionReadRevision;
  if (!options.coalesce) {
    const result = await readFreshAccountSession(revision);
    assertSessionReadRevision(revision);
    return result;
  }
  if (!pendingSessionRead) {
    const pending = readFreshAccountSession(revision).finally(() => {
      if (pendingSessionRead === pending) pendingSessionRead = undefined;
    });
    pendingSessionRead = pending;
  }
  const result = await pendingSessionRead;
  assertSessionReadRevision(revision);
  return result ? { ...result, user: { ...result.user } } : null;
}

/** API errors carry only the safe application message and correlation ID. */
export async function accountRequest<T>(path: string, options: AccountRequestScope & { method?: string; body?: unknown }): Promise<T> {
  // Capacitor can expose an opaque ("null") origin. Native requests carry only
  // canonical relative routes to the bridge; this base is never fetched.
  if (isNativeApp && (typeof path !== "string" || path.length > 1000
    || !/^\/api\/account\/[a-z-]+(?:\?[^#\\]*)?$/u.test(path) || /[\s\p{Cc}]/u.test(path))) {
    throw new Error("Invalid account API path.");
  }
  const origin = isNativeApp ? "https://sajda.invalid" : window.location.origin;
  const target = new URL(path, origin);
  if (target.origin !== origin || target.username || target.password || !target.pathname.startsWith("/api/account/")) throw new Error("Invalid account API path.");
  // Snapshot the initiating account before an asynchronous session check.
  const { accountId, signal, body, method = "GET" } = options;
  const revision = sessionReadRevision;
  throwIfCancelled(signal);
  const current = await readAccountSession({ coalesce: true });
  throwIfCancelled(signal);
  if (!isNativeApp) assertSessionReadRevision(revision);
  assertAccountSessionOwner(current?.user.id, accountId);
  if (isNativeApp) {
    const response = await nativeRequest("/api/native/account","POST",{path,method,body,accountId},signal);
    const payload = await response.json().catch(()=>null);
    throwIfCancelled(signal);
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
    throwIfCancelled(signal);
    assertSessionReadRevision(revision);
    if (!response.ok || !payload) {
      const error = new Error(typeof payload?.error === "string" ? payload.error : "Your account request could not be completed. Try again.");
      Object.assign(error, { code: payload?.code, requestId: payload?.requestId, status: response.status });
      throw error;
    }
    return payload as T;
  } catch (error) {
    throwIfCancelled(signal);
    assertSessionReadRevision(revision);
    throw error;
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}
