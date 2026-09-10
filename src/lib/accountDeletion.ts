import { z } from "zod";

const receipt = z.object({
  accountId: z.string().min(1).max(200),
  deletionRequestId: z.string().uuid(),
  requestId: z.string().min(1).max(200),
});
const challenge = receipt.extend({ status: z.literal("confirmation_required"), expiresAt: z.string().datetime() });
const deleted = receipt.extend({ status: z.literal("deleted"), billing: z.enum(["none", "canceled"]) });
export type DeletionChallenge = z.infer<typeof challenge>;

/** Receipt identity is independent of the diagnostic request ID. */
export function parseDeletionChallenge(value: unknown, accountId: string, expectedRequestId: string, now = Date.now()): DeletionChallenge {
  const parsed = challenge.safeParse(value);
  if (!parsed.success || parsed.data.accountId !== accountId || parsed.data.deletionRequestId !== expectedRequestId
    || Date.parse(parsed.data.expiresAt) <= now || Date.parse(parsed.data.expiresAt) > now + 16 * 60_000) {
    throw new Error("Invalid account deletion confirmation response.");
  }
  return parsed.data;
}
export function parseDeletionReceipt(value: unknown, accountId: string, expectedRequestId: string) {
  const parsed = deleted.safeParse(value);
  if (!parsed.success || parsed.data.accountId !== accountId || parsed.data.deletionRequestId !== expectedRequestId) {
    throw new Error("Account deletion could not be confirmed.");
  }
  return parsed.data;
}
export function isDeletionCode(value: string) { return /^[0-9]{8}$/.test(value); }

/** Secure UUID fallback for older supported WebKit versions. */
export function newDeletionRequestId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
