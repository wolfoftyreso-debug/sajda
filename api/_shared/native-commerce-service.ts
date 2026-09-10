import { createHash } from "node:crypto";
import { nativeCommerceConfig, nativeCommerceError, type NativeCommerceConfig } from "./native-commerce-config.js";
import { createNativeCommerceProvider, type NativeSubscription } from "./native-commerce-provider.js";
import { createNativeCommerceStore, type NativeCommerceStore, type NativeCommerceEvent } from "./native-commerce-store.js";

export function createNativeCommerceService(config: NativeCommerceConfig, dependencies: {
  store?: NativeCommerceStore; provider?: ReturnType<typeof createNativeCommerceProvider>; now?: () => number;
} = {}) {
  const store = dependencies.store ?? createNativeCommerceStore(config);
  const provider = dependencies.provider ?? createNativeCommerceProvider(config);
  const clock = dependencies.now ?? Date.now;
  async function reconcile(ownerId: string, originalId?: string, event?: NativeCommerceEvent) {
    const lease = await store.lease(ownerId);
    try {
      const ids = originalId ? [originalId] : lease.originalIds;
      const all = new Map<string,NativeSubscription>();
      for (const id of ids) {
        for (const subscription of await provider.current(id,lease.accountToken)) all.set(subscription.originalId,subscription);
      }
      await store.save(lease,[...all.values()],event);
    } finally { await store.release(lease).catch(()=>undefined); }
  }
  return {
    async catalog(ownerId: string) {
      const identity = await store.identity(ownerId,true);
      if (!identity) throw nativeCommerceError("apple_account_missing",409);
      return { enabled: true, purchasesEnabled: config.purchasesEnabled && !(await store.externalBilling(ownerId)), accountId: ownerId,
        appAccountToken: identity.accountToken, products: Object.entries(config.products).map(([id,plan])=>({id,plan})) };
    },
    async synchronize(ownerId: string, signedTransaction?: string) {
      if (signedTransaction) {
        const tx = await provider.verifyTransaction(signedTransaction);
        const identity = await store.identity(ownerId);
        if (!identity || identity.accountToken.toLowerCase() !== tx.appAccountToken!.toLowerCase()) {
          throw nativeCommerceError("apple_account_mismatch",409);
        }
        await reconcile(ownerId,tx.originalTransactionId);
      } else if (await store.identity(ownerId)) await reconcile(ownerId);
      return { ok: true, accountId: ownerId, hasActiveSubscription: await store.active(ownerId) };
    },
    async refresh(ownerId: string) {
      const identity = await store.identity(ownerId);
      if (identity && identity.originalIds.length && (!identity.checkedAt || clock()-identity.checkedAt>300_000)) {
        await reconcile(ownerId);return true;
      }
      return false;
    },
    async notification(signedPayload: string) {
      const value = await provider.notification(signedPayload);
      const event = { id: value.notificationUUID!, type: value.notificationType!,
        hash: createHash("sha256").update(signedPayload).digest("hex") };
      if (await store.event(event)) return { ok:true, duplicate:true };
      if (!value.data?.signedTransactionInfo) { await store.ignore(event); return {ok:true,ignored:true}; }
      const tx = await provider.verifyTransaction(value.data.signedTransactionInfo);
      const owner = await store.ownerForToken(tx.appAccountToken!);
      // Deleted accounts are never recreated by a later Apple renewal/refund.
      if (!owner) { await store.ignore(event); return {ok:true,ignored:true}; }
      await reconcile(owner,tx.originalTransactionId,event);
      return {ok:true};
    },
    async batch() {
      await store.pruneEvents();
      const owners = await store.staleOwners();
      let completed = 0;
      const started = clock();
      for (const owner of owners) {
        if (clock()-started>40_000) break;
        try { await reconcile(owner); completed++; }
        catch { console.error(JSON.stringify({event:"native_commerce_reconcile_failed"})); }
      }
      return {checked:completed,selected:owners.length};
    },
  };
}

/** Fresh read side for both website and app. A provider outage cannot renew
 * access: the SQL read model expires cached Apple access after 24 hours. */
export async function refreshNativeCommerceMembership(ownerId:string) {
  const config = nativeCommerceConfig();
  if (!config) return false;
  try { return await createNativeCommerceService(config).refresh(ownerId); }
  catch { console.error(JSON.stringify({event:"native_commerce_membership_refresh_failed"}));return false; }
}
