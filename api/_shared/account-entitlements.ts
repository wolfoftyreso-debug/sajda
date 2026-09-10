import type { VerifiedAccount } from "./account-auth.js";
import { getAccountMembership } from "./account-membership.js";

export interface AccountCapabilities { swipe_undo: boolean }

/**
 * Every undo authorization reads the same live membership as account UI.
 * Trading includes Premium; revocation/expiry never leaves a copied grant.
 */
export async function getAccountCapabilities(account: VerifiedAccount): Promise<AccountCapabilities> {
  const membership = await getAccountMembership(account);
  return { swipe_undo: membership.capabilities.swipe_undo };
}
