import { createPrivateKey } from "node:crypto";
import { SignJWT } from "jose";
import { SignedDataVerifier, Status, Environment, type JWSTransactionDecodedPayload, type JWSRenewalInfoDecodedPayload,
  type ResponseBodyV2DecodedPayload } from "@apple/app-store-server-library";
import { z } from "zod";
import { appleRootCertificates } from "./apple-root-certificates.js";
import { nativeCommerceError, type NativeCommerceConfig, type NativePaidPlan } from "./native-commerce-config.js";

export const appleTransactionId = z.string().regex(/^[0-9]{1,40}$/);
const timestamp = z.number().int().positive().max(8_640_000_000_000_000);
export interface NativeSubscription {
  originalId: string; transactionId: string; productId: string; plan: NativePaidPlan;
  status: number; validFrom: number; expiresAt: number; revokedAt: number | null;
  signedAt: number; autoRenew: boolean;
}
export interface AppleVerifier {
  verifyAndDecodeTransaction(value: string): Promise<JWSTransactionDecodedPayload>;
  verifyAndDecodeRenewalInfo(value: string): Promise<JWSRenewalInfoDecodedPayload>;
  verifyAndDecodeNotification(value: string): Promise<ResponseBodyV2DecodedPayload>;
}
const statusEnvelope = z.object({
  environment: z.string(), bundleId: z.string(), appAppleId: z.number().optional(),
  data: z.array(z.object({ lastTransactions: z.array(z.object({
    status: z.number().int().min(1).max(5), originalTransactionId: appleTransactionId,
    signedTransactionInfo: z.string().min(20).max(16_000), signedRenewalInfo: z.string().min(20).max(16_000),
  })).max(30) })).max(10),
});
async function bounded<T>(work: Promise<T>, ms = 10_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([work, new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(nativeCommerceError()), ms);
  })]); } finally { if (timer) clearTimeout(timer); }
}

/** Apple-signed data is necessary but not sufficient: identity and current
 * subscription status are independently checked before writing any grant. */
export function createNativeCommerceProvider(config: NativeCommerceConfig, dependencies: {
  verifier?: AppleVerifier; fetch?: typeof fetch; now?: () => number;
} = {}) {
  const verifier = dependencies.verifier ?? new SignedDataVerifier(appleRootCertificates(), true,
    config.environment, config.bundleId, config.appAppleId);
  const clock = dependencies.now ?? Date.now;
  const appIdMatches = (value: number | undefined) => value === config.appAppleId
    || config.environment === Environment.SANDBOX && value === undefined;
  const verify = async (signed: string) => {
    if (signed.length > 16_000) throw nativeCommerceError("invalid_apple_transaction", 400);
    const transaction = await bounded(verifier.verifyAndDecodeTransaction(signed));
    if (transaction.bundleId !== config.bundleId || transaction.environment !== config.environment
      || transaction.type !== "Auto-Renewable Subscription" || transaction.inAppOwnershipType !== "PURCHASED"
      || !transaction.productId || !config.products[transaction.productId]
      || !z.string().uuid().safeParse(transaction.appAccountToken).success
      || !appleTransactionId.safeParse(transaction.originalTransactionId).success
      || !appleTransactionId.safeParse(transaction.transactionId).success) throw nativeCommerceError("invalid_apple_transaction", 400);
    return transaction;
  };
  return {
    verifyTransaction: verify,
    async notification(signed: string) {
      const value = await bounded(verifier.verifyAndDecodeNotification(signed));
      if (value.version !== "2.0" || !z.string().uuid().safeParse(value.notificationUUID).success
        || typeof value.notificationType !== "string" || value.notificationType.length > 100
        || !timestamp.safeParse(value.signedDate).success || value.signedDate! > clock() + 60_000
        || value.data && (value.data.bundleId !== config.bundleId || value.data.environment !== config.environment
          || !appIdMatches(value.data.appAppleId))) throw nativeCommerceError("invalid_apple_notification", 400);
      return value;
    },
    async current(originalId: string, accountToken: string): Promise<NativeSubscription[]> {
      appleTransactionId.parse(originalId);
      const issuedAt = Math.floor(clock() / 1000);
      const token = await new SignJWT({ bid: config.bundleId }).setProtectedHeader({ alg: "ES256", kid: config.keyId, typ: "JWT" })
        .setIssuer(config.issuerId).setIssuedAt(issuedAt).setExpirationTime(issuedAt + 300)
        .setAudience("appstoreconnect-v1").sign(createPrivateKey(config.privateKey));
      const host = config.environment === Environment.PRODUCTION ? "api.storekit.apple.com" : "api.storekit-sandbox.apple.com";
      const response = await (dependencies.fetch ?? fetch)(`https://${host}/inApps/v1/subscriptions/${originalId}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, redirect: "error",
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok || !response.body) throw nativeCommerceError();
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.length;
          if (size > 512_000) throw nativeCommerceError("invalid_apple_response");
          chunks.push(part.value);
        }
      } finally { await reader.cancel().catch(() => undefined); }
      const value = statusEnvelope.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      if (value.bundleId !== config.bundleId || value.environment !== config.environment
        || !appIdMatches(value.appAppleId)) throw nativeCommerceError("invalid_apple_response");
      const records: NativeSubscription[] = [];
      for (const item of value.data.flatMap(group => group.lastTransactions)) {
        const tx = await bounded(verifier.verifyAndDecodeTransaction(item.signedTransactionInfo));
        // Another Sajda profile using the same Apple Account must not be linked.
        if (tx.appAccountToken?.toLowerCase() !== accountToken.toLowerCase()) continue;
        await verify(item.signedTransactionInfo);
        const renewal = await bounded(verifier.verifyAndDecodeRenewalInfo(item.signedRenewalInfo));
        if (tx.originalTransactionId !== item.originalTransactionId
          || renewal.originalTransactionId !== tx.originalTransactionId || renewal.environment !== config.environment
          || renewal.productId !== tx.productId || ![0, 1].includes(Number(renewal.autoRenewStatus))
          || !timestamp.safeParse(tx.purchaseDate).success || !timestamp.safeParse(tx.expiresDate).success
          || !timestamp.safeParse(tx.signedDate).success || !timestamp.safeParse(renewal.signedDate).success
          || tx.signedDate! > clock() + 60_000 || renewal.signedDate! > clock() + 60_000
          || tx.purchaseDate! > clock() + 60_000 || tx.expiresDate! <= tx.purchaseDate!) throw nativeCommerceError("invalid_apple_response");
        let expiresAt = tx.expiresDate!;
        if (item.status === Status.BILLING_GRACE_PERIOD) {
          if (!timestamp.safeParse(renewal.gracePeriodExpiresDate).success
            || renewal.gracePeriodExpiresDate! <= expiresAt) throw nativeCommerceError("invalid_apple_response");
          expiresAt = renewal.gracePeriodExpiresDate!;
        }
        const revokedAt = tx.revocationDate ?? (item.status === Status.REVOKED || tx.isUpgraded === true ? clock() : null);
        if (revokedAt !== null && !timestamp.safeParse(revokedAt).success) throw nativeCommerceError("invalid_apple_response");
        records.push({ originalId: tx.originalTransactionId!, transactionId: tx.transactionId!, productId: tx.productId!,
          plan: config.products[tx.productId!], status: item.status, validFrom: tx.purchaseDate!, expiresAt,
          revokedAt, signedAt: Math.max(tx.signedDate!, renewal.signedDate!), autoRenew: renewal.autoRenewStatus === 1 });
      }
      if (!records.some(item => item.originalId === originalId)
        || new Set(records.map(item => item.originalId)).size !== records.length) throw nativeCommerceError("apple_account_mismatch", 409);
      return records;
    },
  };
}
