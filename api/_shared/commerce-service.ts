import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
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
  type CheckoutReservation,
} from "./commerce-store.js";
import { PAID_PLAN_ORDER, PREMIUM_INTRO_OFFER, type PaidPlanId } from "../../shared/plans.js";
import { buildAddonSchedule, validateAddonSchedule, validateAddonInitialSchedule, type AddonChange, type AddonSubscription, type TradingAddonChangeResult, type TradingAddonSnapshot } from "./commerce-addon.js";
import { commerceId, commercePriceId } from "./commerce-config.js";

export interface BillingCheckoutIntent {
  offer?: typeof PREMIUM_INTRO_OFFER.id;
  returnTo?: "swipe";
}

export interface BillingSnapshot {
  tradingAddon?: TradingAddonSnapshot;
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
  premiumIntro: {
    id: typeof PREMIUM_INTRO_OFFER.id;
    eligible: boolean;
    ready: boolean;
    firstUnitAmount: 900;
    renewalUnitAmount: 1900;
    currency: "usd";
    interval: "month";
  } | null;
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
  function addonProvider(provider: CommerceProvider) {
    if (!provider.addonSubscription || !provider.addonSchedule || !provider.createAddonSchedule || !provider.updateAddonSchedule || !provider.releaseAddonSchedule)
      throw new CommerceError("addon_change_unavailable");
    return { subscription: provider.addonSubscription.bind(provider), schedule: provider.addonSchedule.bind(provider),
      create: provider.createAddonSchedule.bind(provider), update: provider.updateAddonSchedule.bind(provider), release: provider.releaseAddonSchedule.bind(provider) };
  }
  const resultFor = (change: AddonChange): TradingAddonChangeResult => ({ state: "scheduled",
    enabled: change.targetPlan === "trading", effectiveAt: new Date(change.effectiveAt * 1000).toISOString() });
  async function addonCurrent(store: CommerceStore, provider: CommerceProvider, lease: CommerceLease, forManagement = false) {
    if (!lease.customerId || lease.paymentHold || await store.appStoreSubscription(lease.ownerId, lease))
      throw new CommerceError("pro_subscription_required", 409);
    const actual = await provider.reconcile(lease.customerId, () => store.introReservations(lease));
    await store.sync(lease, actual);
    if (!actual.grant || actual.status !== "active" || !actual.subscriptionId || !["premium", "trading"].includes(actual.grant.plan ?? "trading"))
      throw new CommerceError("pro_subscription_required", 409);
    const api = addonProvider(provider), context = await api.subscription(actual.subscriptionId, lease.customerId, forManagement);
    if (context.plan !== (actual.grant.plan ?? "trading") || actual.grant.subscriptionId !== context.id
      || Date.parse(actual.grant.expiresAt) < context.end * 1000) throw new CommerceError("addon_change_review_required", 409);
    return { context, api, actual };
  }
  async function settledChange(config: CommerceConfig, store: CommerceStore, lease: CommerceLease, change: AddonChange,
    context: AddonSubscription, api: ReturnType<typeof addonProvider>): Promise<AddonChange> {
    if (!change.scheduleId || !change.body || change.subscriptionId !== context.id) throw new CommerceError("addon_change_review_required", 409);
    const verified = validateAddonSchedule(await api.schedule(change.scheduleId), lease.customerId!, change, config);
    if (verified === "released" || verified === "canceled") return store.saveAddonChange(lease, change, { state: "canceled" });
    if (context.plan === change.targetPlan && context.start >= change.effectiveAt)
      return change.state === "applied" ? change : store.saveAddonChange(lease, change, { state: "applied" });
    if (context.plan !== change.fromPlan || context.start !== change.periodStart || context.end !== change.effectiveAt
      || context.scheduleId !== change.scheduleId || change.effectiveAt <= Math.floor(Date.now() / 1000))
      throw new CommerceError("addon_change_review_required", 409);
    return change;
  }
  async function observedChange(config: CommerceConfig, store: CommerceStore, lease: CommerceLease, change: AddonChange,
    context: AddonSubscription, api: ReturnType<typeof addonProvider>): Promise<AddonChange> {
    if (change.state === "creating") {
      if (!change.scheduleId) return change;
      const resource = await api.schedule(change.scheduleId);
      if (change.body) {
        try {
          const state = validateAddonSchedule(resource, lease.customerId!, change, config);
          if (state === "released" || state === "canceled") return store.saveAddonChange(lease, change, { state: "canceled" });
          change = await store.saveAddonChange(lease, change, { state: "scheduled" });
        } catch (error) {
          // Only an unchanged, proven initial schedule permits later replay.
          validateAddonInitialSchedule(resource, lease.customerId!, context, change, config);
          if (!(error instanceof CommerceError)) throw error;
          return change;
        }
      } else {
        validateAddonInitialSchedule(resource, lease.customerId!, context, change, config);
        if ((resource as { status: string }).status === "released") return store.saveAddonChange(lease, change, { state: "canceled" });
        return change;
      }
    }
    if (["scheduled", "canceling"].includes(change.state)) return settledChange(config, store, lease, change, context, api);
    return change;
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
            premiumIntro: null,
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
            const state = await provider.reconcile(lease.customerId, () => store.introReservations(lease));
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
      const premiumIntro: BillingSnapshot["premiumIntro"] = config.premiumIntroEnabled ? {
        id: PREMIUM_INTRO_OFFER.id, eligible: false, ready: false,
        firstUnitAmount: PREMIUM_INTRO_OFFER.firstUnitAmount,
        renewalUnitAmount: PREMIUM_INTRO_OFFER.renewalUnitAmount,
        currency: PREMIUM_INTRO_OFFER.currency, interval: PREMIUM_INTRO_OFFER.interval,
      } : null;
      if (premiumIntro && plans.premium.ready && config.premiumIntroCouponId) {
        try {
          await provider.introCoupon(config.premiumIntroCouponId);
          if (!await store.introAvailable()) throw new CommerceError("intro_offer_unavailable", 409);
          // `ready=true, eligible=false` means verified ineligible, not unknown.
          // A missing/partial provider history never authorizes a price fallback.
          const unused = customer?.customerId ? await withLease(store, ownerId, async lease => {
            if (!lease.customerId) throw new CommerceError("provider_owner_mismatch");
            const history = await store.introReservations(lease);
            return await provider.introEligible(lease.customerId) && !history.some(row => row.completed);
          }) : true;
          premiumIntro.ready = true;
          premiumIntro.eligible = eligible && unused;
        } catch {
          console.error(JSON.stringify({ event: "commerce_intro_read_failed" }));
        }
      }
      let tradingAddon: TradingAddonSnapshot | undefined;
      if (!appStoreManaged && config.priceIds && provider.addonSubscription && await store.addonAvailable()) {
        try {
          tradingAddon = await withLease(store, ownerId, async lease => {
            if (!lease.customerId || terminal(lease.status)) return { canAdd: false, canRemove: false, pending: null };
            let change = await store.addonChange(lease);
            const api = addonProvider(provider);
            if (change) {
              const context = await api.subscription(change.subscriptionId, lease.customerId, true);
              change = await observedChange(config, store, lease, change, context, api);
              if (["creating", "scheduled", "canceling"].includes(change.state)) {
                const beforeRenewal = change.effectiveAt > Math.floor(Date.now() / 1000) + 120;
                const canRecoverId = Boolean(change.scheduleId) || Date.now() - Date.parse(change.createdAt) < 23 * 3600000;
                return { canAdd: false, canRemove: false, pending: { enabled: change.targetPlan === "trading",
                  effectiveAt: new Date(change.effectiveAt * 1000).toISOString(), state: change.state === "scheduled" ? "scheduled" : "processing",
                  canRetry: config.tradingAddonEnabled === true && change.state === "creating" && beforeRenewal
                    && Date.now() - Date.parse(change.createdAt) <= 25 * 60000 && lease.status === "active"
                    && customer?.activePlan === change.fromPlan && Boolean(customer?.accessExpiresAt && Date.parse(customer.accessExpiresAt) > Date.now()),
                  canCancel: beforeRenewal && canRecoverId } };
              }
            }
            // Absence of a paid Pro base is not a reason to hide billing
            // cancellation. A read-confirmed empty pending ledger permits the
            // portal, but never authorizes a new add-on or removes paid access.
            if (lease.status !== "active" || !customer?.activePlan || customer.activePlan === "basic")
              return { canAdd: false, canRemove: false, pending: null };
            // A paid subscriber who scheduled cancellation still needs billing
            // management. Only reads use the cancellation-tolerant validator;
            // purchase mutations retain its strict uncanceled contract.
            const { context } = await addonCurrent(store, provider, lease, true);
            if (context.scheduleId) {
              const owned = await store.addonScheduleOwner(lease, context.scheduleId);
              if (!owned || owned.state !== "applied" || validateAddonSchedule(await api.schedule(context.scheduleId), lease.customerId!, owned, config) !== "scheduled")
                throw new CommerceError("addon_change_review_required", 409);
            }
            const canChange = !context.cancellationScheduled && context.end > Math.floor(Date.now() / 1000) + 120;
            return { canAdd: canChange && config.tradingAddonEnabled === true && context.plan === "premium" && plans.trading.ready,
              canRemove: canChange && config.tradingAddonEnabled === true && context.plan === "trading" && Boolean(prices.premium), pending: null };
          });
        } catch { console.error(JSON.stringify({ event: "commerce_addon_read_failed" })); }
        customer = await store.read(ownerId);
      }
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
        premiumIntro,
        ...(tradingAddon ? { tradingAddon } : {}),
        ...(appStoreManaged ? { appStoreManaged: true } : {}),
      };
    },
    async changeTradingAddon(ownerId: string, requestKey: string, enabled: boolean): Promise<TradingAddonChangeResult> {
      const { config, store, provider } = resolve();
      if (config.tradingAddonEnabled !== true || !config.priceIds || !await store.addonAvailable()) throw new CommerceError("addon_change_unavailable");
      if (enabled && !(config.checkoutPlans?.trading ?? config.checkoutEnabled)) throw new CommerceError("addon_change_unavailable");
      const targetPlan = enabled ? "trading" : "premium", targetPriceId = commercePriceId(config, targetPlan);
      await provider.price(targetPlan);
      return withLease(store, ownerId, async lease => {
        const { context: originalContext, api } = await addonCurrent(store, provider, lease);
        let context = originalContext, change = await store.addonChange(lease, requestKey);
        if (change?.state === "scheduled") change = await settledChange(config, store, lease, change, context, api);
        if (change && change.targetPlan !== targetPlan && (!["canceled", "applied"].includes(change.state) || change.requestKey === requestKey))
          throw new CommerceError("addon_change_pending", 409);
        if (change?.state === "scheduled") return resultFor(change);
        if (change?.requestKey === requestKey && ["canceled", "applied"].includes(change.state))
          throw new CommerceError("addon_change_completed", 409);
        if (change?.state === "canceling") throw new CommerceError("addon_change_pending", 409);
        if (context.plan === targetPlan) throw new CommerceError("addon_already_selected", 409);
        if (!change || ["canceled", "applied"].includes(change.state)) {
          // A completed prior owned phase may still be attached for its final
          // month. Release only that proven schedule; never cancel subscription.
          if (context.scheduleId) {
            const owned = await store.addonScheduleOwner(lease, context.scheduleId);
            if (!owned || owned.state !== "applied" || validateAddonSchedule(await api.schedule(context.scheduleId), lease.customerId!, owned, config) !== "scheduled")
              throw new CommerceError("addon_change_review_required", 409);
            const released = await api.release(context.scheduleId, owned.id + "-applied");
            if (validateAddonSchedule(released, lease.customerId!, owned, config) !== "released") throw new CommerceError("addon_change_review_required", 409);
            context = await api.subscription(context.id, lease.customerId!);
            if (context.scheduleId) throw new CommerceError("addon_change_review_required", 409);
          }
          change = await store.reserveAddonChange(lease, requestKey, context, targetPlan, targetPriceId);
        }
        if (change.state !== "creating" || change.subscriptionId !== context.id || change.fromPlan !== context.plan
          || change.fromPriceId !== context.priceId || change.targetPlan !== targetPlan || change.targetPriceId !== targetPriceId
          || change.periodStart !== context.start || change.effectiveAt !== context.end
          || Date.now() - Date.parse(change.createdAt) > 25 * 60000) throw new CommerceError("addon_change_review_required", 409);
        let resource: unknown;
        if (!change.scheduleId) {
          // Exact persisted operation UUID is replayed even after an unknown
          // create response; Stripe's idempotency is not an entitlement.
          resource = await api.create(context.id, change.id);
          const scheduleId = commerceId((resource as { id?: unknown })?.id, "sub_sched");
          change = await store.saveAddonChange(lease, change, { scheduleId });
        } else resource = await api.schedule(change.scheduleId);
        if (change.body) {
          try {
            if (validateAddonSchedule(resource, lease.customerId!, change, config) === "scheduled") {
              change = await store.saveAddonChange(lease, change, { state: "scheduled" });
              return resultFor(change);
            }
          } catch { /* An unmodified one-phase schedule is verified below. */ }
          if (!isDeepStrictEqual(JSON.parse(JSON.stringify(buildAddonSchedule(resource, lease.customerId!, context, change, config))), change.body))
            throw new CommerceError("addon_change_review_required", 409);
        } else change = await store.saveAddonChange(lease, change, { body: buildAddonSchedule(resource, lease.customerId!, context, change, config) });
        const updated = await api.update(change.scheduleId!, change.body!, change.id);
        if (validateAddonSchedule(updated, lease.customerId!, change, config) !== "scheduled") throw new CommerceError("addon_change_review_required", 409);
        change = await store.saveAddonChange(lease, change, { state: "scheduled" });
        return resultFor(change);
      });
    },
    async cancelTradingAddonChange(ownerId: string, requestKey: string): Promise<{ state: "canceled" }> {
      const { config, store, provider } = resolve();
      if (!await store.addonAvailable()) throw new CommerceError("addon_change_unavailable");
      return withLease(store, ownerId, async lease => {
        const api = addonProvider(provider); let change = await store.addonCancelChange(lease, requestKey);
        if (change?.state === "canceled" && change.cancelRequestKey === requestKey) return { state: "canceled" };
        if (!lease.customerId || !change || !["creating", "scheduled", "canceling"].includes(change.state)
          || change.effectiveAt <= Math.floor(Date.now() / 1000) + 120) throw new CommerceError("addon_change_review_required", 409);
        const context = await api.subscription(change.subscriptionId, lease.customerId, true);
        if (context.id !== change.subscriptionId || context.plan !== change.fromPlan || context.start !== change.periodStart || context.end !== change.effectiveAt)
          throw new CommerceError("addon_change_review_required", 409);
        let current: unknown;
        if (!change.scheduleId) {
          if (Date.now() - Date.parse(change.createdAt) >= 23 * 3600000) throw new CommerceError("addon_change_review_required", 409);
          // Resolve the exact uncertain create, including a still-running request.
          // Never infer creation ownership merely from the subscription's ID.
          current = await api.create(context.id, change.id);
          change = await store.saveAddonChange(lease, change, { scheduleId: commerceId((current as { id?: unknown })?.id, "sub_sched") });
        } else current = await api.schedule(change.scheduleId);
        let verified: string;
        if (change.body) {
          try { verified = validateAddonSchedule(current, lease.customerId, change, config); }
          catch { validateAddonInitialSchedule(current, lease.customerId, context, change, config); verified = String((current as { status: unknown }).status); }
        } else { validateAddonInitialSchedule(current, lease.customerId, context, change, config); verified = String((current as { status: unknown }).status); }
        if (!["scheduled", "active", "released"].includes(verified)) throw new CommerceError("addon_change_review_required", 409);
        const canceling = change.state === "canceling" ? change : await store.saveAddonChange(lease, change, { state: "canceling", cancelRequestKey: requestKey });
        // The ledger UUID makes retries stable even with a new browser key.
        // Releasing keeps the existing subscription, period and paid access.
        if (!change.scheduleId) throw new CommerceError("addon_change_review_required", 409);
        const released = verified === "released" ? current : await api.release(change.scheduleId, change.id + "-cancel");
        if (change.body && verified === "scheduled" || change.body && verified === "released" && (released as { metadata?: { sajda_addon_change?: string } }).metadata?.sajda_addon_change === change.id) {
          if (validateAddonSchedule(released, lease.customerId, change, config) !== "released") throw new CommerceError("addon_change_review_required", 409);
        } else {
          validateAddonInitialSchedule(released, lease.customerId, context, change, config);
          if ((released as { status: unknown }).status !== "released") throw new CommerceError("addon_change_review_required", 409);
        }
        await store.saveAddonChange(lease, canceling, { state: "canceled" });
        return { state: "canceled" };
      });
    },
    async checkout(
      ownerId: string,
      requestKey: string,
      origin: string,
      plan: PaidPlanId = "trading",
      intent: BillingCheckoutIntent = {},
    ): Promise<string> {
      const { config, store, provider } = resolve();
      const enabled = config.checkoutPlans?.[plan] ?? (plan === "trading" && config.checkoutEnabled);
      if (!enabled)
        throw new CommerceError(intent.offer ? "intro_offer_unavailable" : "checkout_disabled", intent.offer ? 409 : 503);
      if (intent.offer !== undefined && (intent.offer !== PREMIUM_INTRO_OFFER.id || plan !== "premium" || !config.premiumIntroEnabled))
        throw new CommerceError("intro_offer_unavailable", 409);
      if (intent.returnTo !== undefined && intent.returnTo !== "swipe") throw new CommerceError("checkout_context_conflict", 409);
      if (intent.offer) {
        try { if (!await store.introAvailable()) throw new Error("offer_schema_not_ready"); }
        catch { throw new CommerceError("intro_offer_unavailable", 409); }
      }
      if (await store.appStoreSubscription(ownerId))
        throw new CommerceError("app_store_subscription_exists", 409);
      const priceId = config.priceIds?.[plan] ?? (plan === "trading" ? config.priceId : "");
      if (!priceId) throw new CommerceError("billing_price_unavailable");
      const assertReservationPrice = (reservation: CheckoutReservation) => {
        if (["creating", "open"].includes(reservation.state) && reservation.priceId !== priceId)
          throw new CommerceError("billing_price_unavailable");
      };
      const assertReservationPlan = (reservation: CheckoutReservation) => {
        // The owner lease prevents parallel checkouts, but its existing session
        // can belong to another plan. Never substitute that plan's payment URL
        // for the customer's selection, even when they supply a fresh key.
        if ((reservation.plan ?? "trading") !== plan)
          throw new CommerceError("checkout_plan_conflict", 409);
        assertReservationPrice(reservation);
        if (reservation.offer !== intent.offer) throw new CommerceError("intro_offer_unavailable", 409);
        if (reservation.returnTo !== intent.returnTo) throw new CommerceError("checkout_context_conflict", 409);
        if (reservation.offer && !reservation.couponId) throw new CommerceError("intro_offer_unavailable", 409);
      };
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
        const state = await provider.reconcile(customerId, () => store.introReservations(lease));
        await store.sync(lease, state);
        let reservation = await store.existingReservation(lease, requestKey);
        if (!terminal(state.status)) {
          // A declined payment may leave the SAME hosted session recoverable.
          // Never create a second subscription; only return its proven session.
          if (state.status === "incomplete" && reservation?.offer && reservation.sessionId) {
            assertReservationPlan(reservation);
            const existing = await provider.checkout(reservation.sessionId, customerId, plan, { ...reservation });
            if (existing.status === "open" && existing.subscriptionId === state.subscriptionId) {
              await store.saveCheckout(lease, reservation.id, existing);
              return safeStripeUrl(existing.url, "checkout");
            }
          }
          throw new CommerceError("subscription_exists", 409);
        }
        const reserveNew = async (): Promise<CheckoutReservation> => {
          let couponId: string | undefined;
          if (intent.offer) {
            couponId = config.premiumIntroCouponId;
            if (!couponId) throw new CommerceError("intro_offer_unavailable", 409);
            try {
              // First subscription of any plan/status, not merely first Premium.
              // Complete provider history + local consumed intent are checked
              // under the same owner lease immediately before reservation.
              const history = await store.introReservations(lease);
              if (history.some(row => row.completed) || !await provider.introEligible(customerId))
                throw new CommerceError("intro_offer_unavailable", 409);
              await provider.introCoupon(couponId);
            } catch (error) {
              if (error instanceof CommerceError && error.code === "billing_busy") throw error;
              throw new CommerceError("intro_offer_unavailable", 409);
            }
          }
          return store.reservation(lease, requestKey, priceId, origin, plan, { ...intent, couponId });
        };
        reservation ??= await reserveNew();
        // A stored open session may actually be completed or expired. Verify
        // its persisted intent with Stripe before deciding whether a NEW key
        // may select another offer/context. A genuinely open session can never
        // substitute its plan or price for the customer's current selection.
        if ((reservation.plan ?? "trading") === plan) {
          assertReservationPrice(reservation);
          if (!reservation.sessionId && Date.now() - Date.parse(reservation.createdAt) <= 25 * 60000)
            assertReservationPlan(reservation);
        }
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
            { ...reservation },
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
            reservation = await reserveNew();
            assertReservationPlan(reservation);
          }
        }
        if (reservation.sessionId) {
          const existing = await provider.checkout(
            reservation.sessionId,
            customerId,
            reservation.plan ?? "trading",
            { ...reservation },
          );
          await store.saveCheckout(lease, reservation.id, existing);
          if (existing.status === "open") {
            assertReservationPlan(reservation);
            return safeStripeUrl(existing.url, "checkout");
          }
          if (existing.status === "complete") {
            // A previous paid checkout does not permanently block a returning
            // canceled subscriber. Only a fresh key with verified terminal
            // subscription state can start a new purchase. reserveNew rechecks
            // intro history/consumption; it never silently reapplies the offer.
            if (reservation.requestKey === requestKey || !["canceled", "incomplete_expired"].includes(state.status))
              throw new CommerceError("checkout_completed", 409);
          } else if (reservation.requestKey === requestKey)
            throw new CommerceError("checkout_expired", 409);
          reservation = await reserveNew();
          assertReservationPlan(reservation);
        }
        assertReservationPlan(reservation);
        if (
          reservation.state !== "creating" ||
          reservation.priceId !== priceId || (reservation.plan ?? "trading") !== plan
        )
          throw new CommerceError("checkout_expired", 409);
        // Fixed persisted parameters keep retries identical; before its one-hour
        // expiry becomes too near, stop and require operator reconciliation.
        if (Date.now() - Date.parse(reservation.createdAt) > 25 * 60000)
          throw new CommerceError("billing_reconciliation_required", 409);
        // Even before the provider resource exists, a retry keeps the exact
        // persisted coupon. A config change cannot mutate its idempotent body.
        if (reservation.offer) {
          try { await provider.introCoupon(reservation.couponId!); }
          catch { throw new CommerceError("intro_offer_unavailable", 409); }
        }
        const created = await provider.createCheckout({
          id: reservation.id,
          customerId,
          origin: reservation.origin,
          createdAt: reservation.createdAt,
          plan,
          offer: reservation.offer,
          couponId: reservation.couponId,
          returnTo: reservation.returnTo,
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
      const { config, store, provider } = resolve();
      if (!(await store.read(ownerId))?.customerId)
        throw new CommerceError("billing_customer_missing", 409);
      return withLease(store, ownerId, async (lease) => {
        if (!lease.customerId)
          throw new CommerceError("billing_customer_missing", 409);
        // An applied final schedule must not strand whole-subscription cancel.
        // This explicit action may release only our fully verified finished
        // price transition. It never grants access or changes its paid Price.
        if (lease.subscriptionId && provider.addonSubscription && await store.addonAvailable()) {
          const api = addonProvider(provider);
          let context: AddonSubscription | null = null;
          try { context = await api.subscription(lease.subscriptionId, lease.customerId, true); }
          catch (error) { if (!(error instanceof CommerceError)) throw error; }
          if (context?.scheduleId) {
            const owned = await store.addonScheduleOwner(lease, context.scheduleId);
            if (owned?.body && ["scheduled", "creating", "applied"].includes(owned.state)
              && context.plan === owned.targetPlan && context.start >= owned.effectiveAt) {
              const resource = await api.schedule(context.scheduleId);
              if (validateAddonSchedule(resource, lease.customerId, owned, config) !== "scheduled") throw new CommerceError("addon_change_review_required", 409);
              const released = await api.release(context.scheduleId, owned.id + "-applied");
              if (validateAddonSchedule(released, lease.customerId, owned, config) !== "released") throw new CommerceError("addon_change_review_required", 409);
              if (owned.state !== "applied") await store.saveAddonChange(lease, owned, { state: "applied" });
            }
          }
        }
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
        const current = await provider.reconcile(lease.customerId, () => store.introReservations(lease));
        await store.sync(lease, current, { event, hash });
      });
      return { duplicate: false, ignored: false };
    },
  };
}
export const commerceService = createCommerceService();
