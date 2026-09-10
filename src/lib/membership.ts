import { accountRequest, readAccountSession } from "@/integrations/neon/auth";
import { assertAccountSessionOwner, type AccountRequestScope } from "@/lib/accountRequestScope";
import { isAccountMembership, type AccountMembership } from "../../shared/account-membership";

export type MembershipErrorCode = "unauthenticated" | "email_verification_required" | "account_changed" | "unavailable" | "invalid_response" | "expired";
export class MembershipError extends Error {
  constructor(readonly code: MembershipErrorCode, readonly requestId?: string) {
    super("Your account access could not be confirmed. Try again.");
    this.name = "MembershipError";
  }
}
function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function requestId(value: unknown): string | undefined {
  return typeof value === "string" && /^req_[A-Za-z0-9_-]{16}$/u.test(value) ? value : undefined;
}
export async function getAccountMembership(options: AccountRequestScope): Promise<AccountMembership> {
  const scope = { accountId: options.accountId, signal: options.signal };
  if (!scope.accountId) throw new MembershipError("unauthenticated");
  try {
    const response = object(await accountRequest<unknown>("/api/account/membership", scope));
    const reference = requestId(response?.requestId);
    if (typeof response?.accountId === "string" && response.accountId !== scope.accountId) throw new MembershipError("account_changed", reference);
    if (!reference || response?.accountId !== scope.accountId || response.error !== undefined
      || response.code !== undefined || response.ok === false || !isAccountMembership(response.membership)) {
      throw new MembershipError("invalid_response", reference);
    }
    scope.signal?.throwIfAborted();
    const session = await readAccountSession();
    scope.signal?.throwIfAborted();
    if (!session || !Number.isFinite(session.expires_at) || Number(session.expires_at) <= Date.now() / 1000) throw new MembershipError("unauthenticated", reference);
    assertAccountSessionOwner(session.user.id, scope.accountId);
    if (response.membership.expiresAt && Date.parse(response.membership.expiresAt) <= Date.now()) throw new MembershipError("expired", reference);
    return response.membership;
  } catch (error) {
    if (error instanceof MembershipError || error instanceof Error && error.name === "AbortError") throw error;
    const failure = object(error);
    const code = failure?.code === "account_changed" ? "account_changed"
      : failure?.status === 401 ? "unauthenticated"
      : failure?.status === 403 && failure.code === "email_verification_required" ? "email_verification_required" : "unavailable";
    throw new MembershipError(code, requestId(failure?.requestId));
  }
}
