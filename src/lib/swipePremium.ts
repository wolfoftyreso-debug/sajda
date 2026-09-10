import { accountRequest, readAccountSession } from "@/integrations/neon/auth";
import { throwIfCancelled } from "./abort";
import { assertAccountSessionOwner, type AccountRequestScope } from "@/lib/accountRequestScope";

export type SwipePremiumErrorCode = "premium_required" | "unauthenticated" | "email_verification_required" | "account_changed" | "unavailable" | "invalid_response";
const errorMessages: Record<SwipePremiumErrorCode, string> = {
  premium_required: "Swipe Undo requires an active premium entitlement.",
  unauthenticated: "Sign in before using Swipe Undo.",
  email_verification_required: "Verify your email address before using Swipe Undo.",
  account_changed: "Your account changed. Reopen Swipe before trying again.",
  unavailable: "Swipe access could not be verified. No card was changed. Try again.",
  invalid_response: "Swipe access could not be confirmed. No card was changed. Try again.",
};

export class SwipePremiumError extends Error {
  constructor(readonly code: SwipePremiumErrorCode) {
    super(errorMessages[code]);
    this.name = "SwipePremiumError";
  }
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function validRequestId(value: unknown): value is string {
  return typeof value === "string" && /^req_[A-Za-z0-9_-]{16}$/u.test(value);
}

function safeFailure(error: unknown): Error {
  if (error instanceof SwipePremiumError) return error;
  if (error instanceof Error && error.name === "AbortError") return error;
  const record = object(error);
  if (record?.code === "account_changed") return new SwipePremiumError("account_changed");
  if (record?.status === 401) return new SwipePremiumError("unauthenticated");
  if (record?.code === "email_verification_required" && record.status === 403) return new SwipePremiumError("email_verification_required");
  if (record?.code === "premium_required" && record.status === 403) return new SwipePremiumError("premium_required");
  return new SwipePremiumError("unavailable");
}

async function confirmCurrentOwner(scope: AccountRequestScope): Promise<void> {
  throwIfCancelled(scope.signal);
  const session = await readAccountSession();
  throwIfCancelled(scope.signal);
  if (!session) throw new SwipePremiumError("unauthenticated");
  assertAccountSessionOwner(session.user.id, scope.accountId);
  if (!Number.isFinite(session.expires_at) || Number(session.expires_at) <= Date.now() / 1000) {
    throw new SwipePremiumError("unauthenticated");
  }
}

/** For display only. A true value is never authorization to change a card. */
export async function getSwipeCapabilities(options: AccountRequestScope): Promise<{ swipe_undo: boolean }> {
  const scope = { accountId: options.accountId, signal: options.signal };
  if (!scope.accountId) throw new SwipePremiumError("unauthenticated");
  try {
    const response = object(await accountRequest<unknown>("/api/account/capabilities", scope));
    const capabilities = object(response?.capabilities);
    if (response?.accountId !== scope.accountId && typeof response?.accountId === "string") {
      throw new SwipePremiumError("account_changed");
    }
    if (!validRequestId(response?.requestId) || response.accountId !== scope.accountId || response.error !== undefined
      || response.code !== undefined || response.ok === false || typeof capabilities?.swipe_undo !== "boolean") {
      throw new SwipePremiumError("invalid_response");
    }
    await confirmCurrentOwner(scope);
    return { swipe_undo: capabilities.swipe_undo };
  } catch (error) { throw safeFailure(error); }
}

/** Each action performs a fresh server authorization; no local plan or cache. */
export async function authorizeSwipeUndo(options: AccountRequestScope): Promise<{ accountId: string; requestId: string }> {
  const scope = { accountId: options.accountId, signal: options.signal };
  if (!scope.accountId) throw new SwipePremiumError("unauthenticated");
  try {
    const response = object(await accountRequest<unknown>("/api/account/capabilities", {
      ...scope, method: "POST", body: { capability: "swipe_undo" },
    }));
    if (response?.accountId !== scope.accountId && typeof response?.accountId === "string") {
      throw new SwipePremiumError("account_changed");
    }
    if (response?.ok !== true || response.capability !== "swipe_undo" || response.accountId !== scope.accountId
      || response.error !== undefined || response.code !== undefined || !validRequestId(response.requestId)) {
      throw new SwipePremiumError("invalid_response");
    }
    // Also reject an account switch while the authorization was in flight.
    // The consuming UI must still honor its owner scope and abort on unmount.
    await confirmCurrentOwner(scope);
    return { accountId: scope.accountId, requestId: response.requestId };
  } catch (error) { throw safeFailure(error); }
}
