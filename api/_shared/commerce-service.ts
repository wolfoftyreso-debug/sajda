import { createHash } from "node:crypto";
import {
  CommerceError,
  commerceConfig,
  type CommerceConfig,
  safeStripeUrl,
} from "./commerce-config.js";
import {
  createCommerceProvider,
  type CommerceProvider,
  type CommercePrice,
  type SubscriptionStatus,
} from "./commerce-provider.js";
import {
  createCommerceStore,
  type CommerceStore,
  type CommerceLease,
} from "./commerce-store.js";
import { PAID_PLAN_ORDER, type PaidPlanId } from "../../shared/plans.js";

export interface BillingSnapshot {
  ready: boolean;
  mode: "test" | "live" | null;
  price: CommercePrice | null;
  status: SubscriptionStatus;
  canCheckout: boolean;
  canManage: boolean;
  accessExpiresAt: string | null;
  appStoreManaged?: boolean;
  activePlan: PaidPlanId | null;
  plans: Record<PaidPlanId, { ready: boolean; price: CommercePrice | null; canCheckout: boolean }>;
}
const terminal = (status: SubscriptionStatus) =>
  ["none", "canceled", "incomplete_expired"].includes(status);
export function createCommerceService(
  deps: {
    config?: () => CommerceConfig;
    provider?: (config: CommerceConfig) => CommerceProvider;
    store?: (config: CommerceConfig) => CommerceStore;
  } = {},
) {
  const configured = deps.config ?? commerceConfig;
  function resolve() {
    const config = configured();
    return {
      config,
      provider: (deps.provider ?? createCommerceProvider)(config),
      store: (deps.store ?? createCommerceStore)(config),
    };
  }
  async function withLease<T>(
    store: CommerceStore,
    ownerId: string,
    fn: (lease: CommerceLease) => Promise<T>,
  ): Promise<T> {
    const lease = await store.acquire(ownerId);
    try {
      return await fn(lease);
    } finally {
      await store
        .release(lease)
        .catch(() =>
          console.error(
            JSON.stringify({ event: "commerce_lease_release_failed" }),
          ),
        );
    }
  }
  return {
    async read(ownerId: string): Promise<BillingSnapshot> {
      let services: ReturnType<typeof resolve>;
      try {
        services = resolve();
      } catch (error) {
        if (
          error instanceof CommerceError &&
          error.code === "billing_not_configured"
        )
          return {
            ready: false,
            mode: null,
            price: null,
            status: "none",
            canCheckout: false,
            canManage: false,
            accessExpiresAt: null,
          } as BillingSnapshot;
        throw error;
      }
      const { config, store, provider } = services;
      const appStoreManaged = await store.appStoreSubscription(ownerId);
      let customer = await store.read(ownerId);
      let reconciled = true;
      if (
        customer?.customerId &&
        (!customer.syncedAt ||
          Date.now() - Date.parse(customer.syncedAt) > 60000)
      ) {
        try {
          await withLease(store, ownerId, async (lease) => {
            if (!lease.customerId)
              throw new CommerceError("provider_owner_mismatch");
            const state = await provider.reconcile(lease.customerId);
            await store.sync(lease, state);
          });
          customer = await store.read(ownerId);
        } catch {
          reconciled = false;
          console.error(
            JSON.stringify({ event: "commerce_read_reconciliation_failed" }),
          );
        }
      }
      const availablePlans = config.priceIds ? PAID_PLAN_ORDER : (["trading"] as const);
      const priceResults = await Promise.all(availablePlans.map(async plan => {
        try { return [plan, await provider.price(plan)] as const; }
        catch { console.error(JSON.stringify({ event: "commerce_price_read_failed", plan })); return [plan, null] as const; }
      }));
      const prices = Object.fromEntries(priceResults) as Partial<Record<PaidPlanId, CommercePrice | null>>;
      const eligible = !appStoreManaged && terminal(customer?.status ?? "none") && !customer?.paymentHold;
      const plans = Object.fromEntries(PAID_PLAN_ORDER.map(plan => {
        const price = prices[plan] ?? null;
        const enabled = config.checkoutPlans?.[plan] ?? (plan === "trading" && config.checkoutEnabled);
        const ready = enabled && price !== null && reconciled;
        return [plan, { ready, price, canCheckout: ready && eligible }];
      })) as BillingSnapshot["plans"];
      const price = plans.trading.price;
      const ready = plans.trading.ready;
      return {
        ready,
        mode: config.mode,
        price,
        status: customer?.status ?? "none",
        canCheckout: plans.trading.canCheckout,
        canManage: Boolean(customer?.customerId),
        accessExpiresAt: customer?.accessExpiresAt ?? null,
        activePlan: customer?.activePlan ?? null,
        plans,
        ...(appStoreManaged ? { appStoreManaged: true } : {}),
      };
    },
    async checkout(
      ownerId: string,
      requestKey: string,
      origin: string,
      plan: PaidPlanId = "trading",
    ): Promise<string> {
      const { config, store, provider } = resolve();
      const enabled = config.checkoutPlans?.[plan] ?? (plan === "trading" && config.checkoutEnabled);
      if (!enabled)
        throw new CommerceError("checkout_disabled", 503);
      if (await store.appStoreSubscription(ownerId))
        throw new CommerceError("app_store_subscription_exists", 409);
      const priceId = config.priceIds?.[plan] ?? (plan === "trading" ? config.priceId : "");
      if (!priceId) throw new CommerceError("billing_price_unavailable");
      await provider.price(plan);
      return withLease(store, ownerId, async (lease) => {
        if (await store.appStoreSubscription(ownerId, lease))
          throw new CommerceError("app_store_subscription_exists", 409);
        if (lease.paymentHold)
          throw new CommerceError("billing_review_required", 409);
        let customerId = lease.customerId;
        if (!customerId) {
          // Stripe may prune idempotency after24h. Never blindly repeat an
          // uncertain old customer creation and create duplicate billing state.
          if (Date.now() - Date.parse(lease.createdAt) > 23 * 3600000)
            throw new CommerceError("billing_reconciliation_required", 409);
          customerId = await provider.createCustomer(
            lease.customerKey,
            ownerId,
          );
          await store.customer(lease, customerId);
        }
        const state = await provider.reconcile(customerId);
        await store.sync(lease, state);
        if (!terminal(state.status))
          throw new CommerceError("subscription_exists", 409);
        let reservation = await store.reservation(
          lease,
          requestKey,
          priceId,
          origin,
          plan,
        );
        if (
          reservation.state === "creating" &&
          !reservation.sessionId &&
          Date.now() - Date.parse(reservation.createdAt) > 25 * 60000
        ) {
          // A timed-out create may have succeeded remotely. Recover by the
          // server's persisted UUID, never by browser-provided customer data.
          const recovered = await provider.recoverCheckout(
            customerId,
            reservation.id,
            reservation.createdAt,
            reservation.plan ?? "trading",
          );
          if (recovered) {
            await store.saveCheckout(lease, reservation.id, recovered);
            reservation = {
              ...reservation,
              sessionId: recovered.id,
              state: recovered.status,
            };
          } else {
            // Complete bounded listing found no resource; the old request is
            // retired, not blindly replayed beyond Stripe's idempotency window.
            await store.abandonCheckout(lease, reservation.id);
            if (reservation.requestKey === requestKey)
              throw new CommerceError("checkout_expired", 409);
            reservation = await store.reservation(
              lease,
              requestKey,
              priceId,
              origin,
              plan,
            );
          }
        }
        if (reservation.sessionId) {
          const existing = await provider.checkout(
            reservation.sessionId,
            customerId,
            reservation.plan ?? "trading",
          );
          await store.saveCheckout(lease, reservation.id, existing);
          if (existing.status === "open")
            return safeStripeUrl(existing.url, "checkout");
          if (existing.status === "complete")
            throw new CommerceError("checkout_completed", 409);
          if (reservation.requestKey === requestKey)
            throw new CommerceError("checkout_expired", 409);
          reservation = await store.reservation(
            lease,
            requestKey,
            priceId,
            origin,
            plan,
          );
        }
        if (
          reservation.state !== "creating" ||
          reservation.priceId !== priceId || (reservation.plan ?? "trading") !== plan
        )
          throw new CommerceError("checkout_expired", 409);
        // Fixed persisted parameters keep retries identical; before its one-hour
        // expiry becomes too near, stop and require operator reconciliation.
        if (Date.now() - Date.parse(reservation.createdAt) > 25 * 60000)
          throw new CommerceError("billing_reconciliation_required", 409);
        const created = await provider.createCheckout({
          id: reservation.id,
          customerId,
          origin: reservation.origin,
          createdAt: reservation.createdAt,
          plan,
        });
        await store.saveCheckout(lease, reservation.id, created);
        if (created.status !== "open")
          throw new CommerceError("checkout_completed", 409);
        return safeStripeUrl(created.url, "checkout");
      });
    },
    async portal(
      ownerId: string,
      requestKey: string,
      origin: string,
    ): Promise<string> {
      const { store, provider } = resolve();
      if (!(await store.read(ownerId))?.customerId)
        throw new CommerceError("billing_customer_missing", 409);
      return withLease(store, ownerId, async (lease) => {
        if (!lease.customerId)
          throw new CommerceError("billing_customer_missing", 409);
        // A price outage or paused new sales must never prevent cancellation.
        return safeStripeUrl(
          await provider.portal(lease.customerId, origin, requestKey),
          "portal",
        );
      });
    },
    async webhook(
      body: Buffer,
      signature: string,
    ): Promise<{ duplicate: boolean; ignored: boolean }> {
      const { store, provider } = resolve();
      const event = await provider.verifyEvent(body, signature);
      const hash = createHash("sha256").update(body).digest("hex");
      if (await store.processed(event.id, hash))
        return { duplicate: true, ignored: false };
      const supported =
        /^customer\.subscription\.(created|updated|deleted|paused|resumed)$/u.test(
          event.type,
        ) ||
        /^invoice\.(paid|payment_succeeded|payment_failed|payment_action_required|voided|marked_uncollectible)$/u.test(
          event.type,
        ) ||
        /^checkout\.session\.(completed|async_payment_succeeded|async_payment_failed|expired)$/u.test(
          event.type,
        ) ||
        event.type === "charge.refunded" ||
        event.type === "charge.dispute.created";
      const ownerId =
        supported && event.customerId
          ? await store.ownerFor(event.customerId)
          : null;
      if (!ownerId || !event.customerId) {
        await store.ignore(event, hash);
        return { duplicate: false, ignored: true };
      }
      await withLease(store, ownerId, async (lease) => {
        if (!lease.customerId || lease.customerId !== event.customerId)
          throw new CommerceError("provider_owner_mismatch");
        // Always retrieve present state; even an old delivery sees current
        // cancellation/payment status and cannot restore a stale paid period.
        const current = await provider.reconcile(lease.customerId);
        await store.sync(lease, current, { event, hash });
      });
      return { duplicate: false, ignored: false };
    },
  };
}
export const commerceService = createCommerceService();
