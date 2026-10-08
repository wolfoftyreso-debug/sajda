import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { CommerceError, type CommerceConfig } from "../api/_shared/commerce-config";
import { buildAddonSchedule, validateAddonSchedule, validateAddonSubscription, type AddonChange, type AddonSubscription } from "../api/_shared/commerce-addon";
import { createCommerceService } from "../api/_shared/commerce-service";
import { billingAction } from "../api/_shared/commerce-http";
import type { CommerceStore, CommerceLease } from "../api/_shared/commerce-store";
import type { CommerceProvider, BillingState } from "../api/_shared/commerce-provider";
import { readFile } from "node:fs/promises";

const config: CommerceConfig = { namespace: "development", mode: "test", secretKey: "sk_test_fixtureNotReal1234", webhookSecret: "whsec_fixtureNotReal1234",
  priceId: "price_trading", priceIds: { basic: "price_basic", premium: "price_premium", trading: "price_trading" },
  portalConfigurationId: "bpc_fixture", checkoutEnabled: true, tradingAddonEnabled: true, checkoutPlans: { basic: true, premium: true, trading: true } };
const code = (expected: string) => (error: unknown) => error instanceof CommerceError && error.code === expected;
const seconds = Math.floor(Date.now() / 1000), start = seconds - 86400, end = seconds + 10 * 86400;
const price = (plan: "premium" | "trading") => ({ object: "price", id: config.priceIds![plan], active: true, livemode: false,
  currency: "usd", unit_amount: plan === "premium" ? 1900 : 4900, unit_amount_decimal: plan === "premium" ? "1900" : "4900",
  type: "recurring", billing_scheme: "per_unit", recurring: { interval: "month", interval_count: 1, usage_type: "licensed" }, tax_behavior: "exclusive" });
const subscription = () => ({ id: "sub_fixture", object: "subscription", customer: "cus_fixture", livemode: false, status: "active",
  collection_method: "charge_automatically", pause_collection: null, pending_update: null, cancel_at_period_end: false, cancel_at: null,
  schedule: null as string | null, metadata: { sajda_namespace: "development", sajda_plan: "premium" },
  items: { has_more: false, data: [{ quantity: 1, price: price("premium"), current_period_start: start, current_period_end: end }] } });
const change = (): AddonChange => ({ id: randomUUID(), requestKey: randomUUID(), subscriptionId: "sub_fixture",
  fromPlan: "premium", targetPlan: "trading", fromPriceId: "price_premium", targetPriceId: "price_trading",
  periodStart: start, effectiveAt: end, createdAt: new Date().toISOString(), scheduleId: "sub_sched_fixture", body: null, state: "creating" });
const phase = () => ({ start_date: start, end_date: end, currency: "usd", collection_method: null, proration_behavior: "create_prorations",
  items: [{ price: "price_premium", quantity: 1, discounts: [], tax_rates: [], metadata: {} }], discounts: [], metadata: {},
  add_invoice_items: [], default_tax_rates: [], invoice_settings: null, automatic_tax: { enabled: false }, billing_cycle_anchor: null,
  application_fee_percent: null, billing_thresholds: null, on_behalf_of: null, transfer_data: null, trial_end: null, default_payment_method: null, description: null });
const initial = () => ({ id: "sub_sched_fixture", object: "subscription_schedule", livemode: false, customer: "cus_fixture",
  subscription: "sub_fixture", released_subscription: null, status: "active", end_behavior: "release", metadata: {},
  current_phase: { start_date: start, end_date: end }, phases: [phase()] });
function appliedBody(body: ReturnType<typeof buildAddonSchedule>) {
  return { ...initial(), metadata: body.metadata, phases: body.phases!.map((item, index) => ({ ...item,
    end_date: index === 0 ? end : end + 30 * 86400, discounts: item.discounts === "" ? [] : item.discounts, default_tax_rates: [],
    items: item.items.map(value => ({ ...value, discounts: value.discounts === "" ? [] : value.discounts, tax_rates: [] })) })) };
}
test("add-on subscription requires a real active, uncanceled, exactly-one-item Pro or bundle contract", () => {
  assert.equal(validateAddonSubscription(subscription(), "cus_fixture", config).plan, "premium");
  for (const patch of [{ livemode: true }, { customer: "cus_other" }, { status: "past_due" }, { pending_update: {} },
    { cancel_at_period_end: true }, { collection_method: "send_invoice" }, { items: { has_more: true, data: subscription().items.data } },
    { items: { has_more: false, data: [...subscription().items.data, ...subscription().items.data] } }])
    assert.throws(() => validateAddonSubscription({ ...subscription(), ...patch }, "cus_fixture", config), code("addon_change_review_required"));
});
test("schedule preserves the paid current period; only a next-period single bundle Price is selected", () => {
  const intent = change(), context = validateAddonSubscription(subscription(), "cus_fixture", config), body = buildAddonSchedule(initial(), "cus_fixture", context, intent, config);
  assert.equal(body.phases![0].end_date, end); assert.equal(body.phases![0].items[0].price, "price_premium");
  assert.equal(body.phases![1].start_date, end); assert.equal(body.phases![1].items[0].price, "price_trading");
  assert.equal(body.proration_behavior, "none"); assert.equal(body.end_behavior, "release");
  assert.equal(body.phases![1].discounts, ""); assert.equal(body.phases![1].metadata!.sajda_offer, "");
  assert.equal(validateAddonSchedule(appliedBody(body), "cus_fixture", intent, config), "scheduled");
  for (const mutate of [
    (value: ReturnType<typeof appliedBody>) => { value.customer = "cus_other"; },
    (value: ReturnType<typeof appliedBody>) => { value.phases[1].items[0].price = "price_free"; },
    (value: ReturnType<typeof appliedBody>) => { value.phases[1].start_date = end - 1; },
    (value: ReturnType<typeof appliedBody>) => { value.metadata = { sajda_addon_change: "foreign" }; },
    (value: ReturnType<typeof appliedBody>) => { value.phases[1].trial = true; },
    (value: ReturnType<typeof appliedBody>) => { value.phases[1].items[0].billing_thresholds = { usage_gte: 1 }; },
    (value: ReturnType<typeof appliedBody>) => { value.default_settings = { automatic_tax: { enabled: true } }; },
    (value: ReturnType<typeof appliedBody>) => { value.phases[1].metadata = { ...value.phases[1].metadata, sajda_namespace: "production" }; },
  ]) { const candidate = structuredClone(appliedBody(body)); mutate(candidate); assert.throws(() => validateAddonSchedule(candidate, "cus_fixture", intent, config)); }
});
test("unsupported current-phase settings and unknown schedule ownership never get silently rewritten", () => {
  const context = validateAddonSubscription(subscription(), "cus_fixture", config);
  for (const patch of [{ metadata: { external_owner: "someone" } }, { phases: [{ ...phase(), default_tax_rates: ["txr_custom"] }] },
    { phases: [{ ...phase(), trial_end: end }] }, { phases: [{ ...phase(), add_invoice_items: [{ price: "price_extra" }] }] },
    { phases: [{ ...phase(), items: [{ ...phase().items[0], billing_thresholds: { usage_gte: 1 } }] }] },
    { default_settings: { automatic_tax: { enabled: true } } }, { default_settings: { invoice_settings: { issuer: { type: "account", account: "acct_other" } } } }])
    assert.throws(() => buildAddonSchedule({ ...initial(), ...patch }, "cus_fixture", context, change(), config), code("addon_change_review_required"));
});
test("first-month once discount is reused by Discount identity, never redeemed again, and removed next month", () => {
  const raw = initial(); raw.phases[0].discounts = [{ discount: "di_existing", coupon: "coupon_once", promotion_code: null }] as never;
  const body = buildAddonSchedule(raw, "cus_fixture", validateAddonSubscription(subscription(), "cus_fixture", config), change(), config);
  assert.deepEqual(body.phases![0].discounts, [{ discount: "di_existing" }]); assert.equal(body.phases![1].discounts, "");
});

function fixture() {
  let context: AddonSubscription = validateAddonSubscription(subscription(), "cus_fixture", config);
  let saved: AddonChange | null = null, raw: unknown = initial(), creates = 0, updates = 0, releases = 0;
  let unknownCreate = false, unknownUpdate = false, rejectedUpdate = false, unknownRelease = false, busy = false, migration = true, appStore = false, paid = true, portals = 0;
  const state = (): BillingState => ({ status: "active", subscriptionId: context.id, cancelAtPeriodEnd: false, grant: paid ? {
    plan: context.plan, subscriptionId: context.id, invoiceId: "in_paid", priceId: context.priceId,
    validFrom: new Date(context.start * 1000).toISOString(), expiresAt: new Date(context.end * 1000).toISOString() } : null });
  const lease: CommerceLease = { ownerId: "owner", customerId: "cus_fixture", customerKey: randomUUID(), createdAt: new Date().toISOString(),
    status: "active", subscriptionId: "sub_fixture", paymentHold: false, accessExpiresAt: new Date(end * 1000).toISOString(), syncedAt: new Date().toISOString(),
    token: randomUUID(), fence: 1 };
  const store = {
    addonAvailable: async () => migration, appStoreSubscription: async () => appStore,
    read: async () => ({ ...lease, activePlan: paid ? context.plan : null }), introReservations: async () => [],
    acquire: async () => { if (busy) throw new CommerceError("billing_busy", 409); busy = true; return lease; }, release: async () => { busy = false; },
    sync: async (_lease: unknown, value: BillingState) => { assert.deepEqual(value.grant, state().grant); },
    addonChange: async (_lease: unknown, key?: string) => saved && (saved.requestKey === key || ["creating", "scheduled", "canceling"].includes(saved.state)) ? structuredClone(saved) : null,
    addonCancelChange: async (_lease: unknown, key: string) => saved && (saved.cancelRequestKey === key || ["creating", "scheduled", "canceling"].includes(saved.state)) ? structuredClone(saved) : null,
    addonScheduleOwner: async (_lease: unknown, id: string) => saved?.scheduleId === id ? structuredClone(saved) : null,
    reserveAddonChange: async (_lease: unknown, key: string, current: AddonSubscription, targetPlan: "premium" | "trading", targetPriceId: string) =>
      saved = { ...change(), requestKey: key, scheduleId: null, fromPlan: current.plan, fromPriceId: current.priceId, targetPlan, targetPriceId,
        periodStart: current.start, effectiveAt: current.end, body: null },
    saveAddonChange: async (_lease: unknown, value: AddonChange, patch: Partial<AddonChange>) => { assert.equal(value.state, saved!.state); saved = { ...saved!, ...patch }; return structuredClone(saved); },
  } as unknown as CommerceStore;
  const provider = {
    price: async (plan: "premium" | "trading") => ({ currency: "usd", unitAmount: plan === "premium" ? 1900 : 4900, interval: "month", intervalCount: 1, taxBehavior: "exclusive" }),
    reconcile: async () => state(), addonSubscription: async () => structuredClone(context),
    portal: async () => { portals++; return "https://billing.stripe.com/p/session/fixture"; },
    addonSchedule: async () => structuredClone(raw),
    createAddonSchedule: async () => { creates++; context.scheduleId = "sub_sched_fixture"; if (unknownCreate) { unknownCreate = false; throw new Error("unknown_create"); } return raw; },
    updateAddonSchedule: async (_id: unknown, body: ReturnType<typeof buildAddonSchedule>) => {
      if (rejectedUpdate) { rejectedUpdate = false; throw new Error("update_not_applied"); }
      updates++; raw = appliedBody(body); if (unknownUpdate) { unknownUpdate = false; throw new Error("unknown_update"); } return raw;
    },
    releaseAddonSchedule: async () => { releases++; raw = { ...raw as object, status: "released", subscription: null, released_subscription: context.id };
      context.scheduleId = null; if (unknownRelease) { unknownRelease = false; throw new Error("unknown_release"); } return raw; },
  } as unknown as CommerceProvider;
  let feature = true;
  const service = createCommerceService({ config: () => ({ ...config, tradingAddonEnabled: feature }), store: () => store, provider: () => provider });
  return { service, store, provider, get saved() { return saved; }, get context() { return context; }, get counts() { return { creates, updates, releases }; }, get portals() { return portals; },
    set feature(value: boolean) { feature = value; },
    set rejectedUpdate(value: boolean) { rejectedUpdate = value; },
    set unknownCreate(value: boolean) { unknownCreate = value; }, set unknownUpdate(value: boolean) { unknownUpdate = value; },
    set unknownRelease(value: boolean) { unknownRelease = value; }, set migration(value: boolean) { migration = value; }, set appStore(value: boolean) { appStore = value; },
    set paid(value: boolean) { paid = value; }, set raw(value: unknown) { raw = value; },
    get raw() { return raw; }, age(minutes: number) { saved!.createdAt = new Date(Date.now() - minutes * 60000).toISOString(); },
    bundle() { context = { ...context, plan: "trading", priceId: "price_trading" }; },
    applied() { context = { ...context, plan: saved!.targetPlan, priceId: saved!.targetPriceId, start: end, end: end + 30 * 86400 }; },
    reorderBody() {
      const reorder = (value: unknown): unknown => Array.isArray(value) ? value.map(reorder) : value && typeof value === "object"
        ? Object.fromEntries(Object.entries(value).reverse().map(([key, val]) => [key, reorder(val)])) : value;
      saved!.body = reorder(JSON.parse(JSON.stringify(saved!.body))) as AddonChange["body"];
    },
  };
}
test("selecting Trading schedules one bundle without granting access or changing the current paid Pro invoice", async () => {
  const f = fixture(), key = randomUUID(), result = await f.service.changeTradingAddon("owner", key, true);
  assert.deepEqual(result, { state: "scheduled", enabled: true, effectiveAt: new Date(end * 1000).toISOString() });
  assert.equal(f.context.plan, "premium"); assert.equal(f.saved!.state, "scheduled"); assert.deepEqual(f.counts, { creates: 1, updates: 1, releases: 0 });
  assert.deepEqual(await f.service.changeTradingAddon("owner", key, true), result);
  assert.deepEqual(await f.service.changeTradingAddon("owner", randomUUID(), true), result);
  await assert.rejects(() => f.service.changeTradingAddon("owner", randomUUID(), false), code("addon_change_pending"));
  assert.deepEqual(f.counts, { creates: 1, updates: 1, releases: 0 });
});

test("reload observes an uncertain update without writing Stripe; uncertain create stays explicitly processing", async () => {
  for (const stage of ["unknownCreate", "unknownUpdate"] as const) {
    const f = fixture(); f[stage] = true;
    await assert.rejects(() => f.service.changeTradingAddon("owner", randomUUID(), true));
    const before = f.counts, snapshot = await f.service.read("owner");
    assert.deepEqual(f.counts, before, "GET cannot mutate a provider schedule");
    assert.equal(snapshot.tradingAddon!.pending!.state, stage === "unknownUpdate" ? "scheduled" : "processing");
    assert.equal(snapshot.tradingAddon!.pending!.canCancel, true);
    assert.equal(snapshot.tradingAddon!.pending!.canRetry, stage === "unknownCreate");
    if (stage === "unknownCreate") await f.service.changeTradingAddon("owner", randomUUID(), true);
    assert.equal(f.saved!.state, "scheduled");
  }
});

test("uncertain create and frozen body can be aborted after retry expires without grant or duplicate subscription", async () => {
  for (const stage of ["unknownCreate", "unknownUpdate"] as const) {
    const f = fixture(); f[stage] = true;
    await assert.rejects(() => f.service.changeTradingAddon("owner", randomUUID(), true));
    f.age(40); f.paid = false;
    const snapshot = await f.service.read("owner");
    assert.equal(snapshot.tradingAddon!.pending!.canCancel, true); assert.equal(snapshot.tradingAddon!.pending!.canRetry, false);
    await f.service.cancelTradingAddonChange("owner", randomUUID());
    assert.equal(f.saved!.state, "canceled"); assert.equal(f.context.scheduleId, null); assert.equal(f.context.plan, "premium");
    assert.equal(f.counts.releases, 1); assert.equal(f.counts.updates, stage === "unknownUpdate" ? 1 : 0);
  }
});

test("unsupported settings after own initial create still allow safe abort, not silent rewriting", async () => {
  const f = fixture(); f.raw = { ...initial(), phases: [{ ...phase(), items: [{ ...phase().items[0], billing_thresholds: { usage_gte: 1 } }] }] };
  await assert.rejects(() => f.service.changeTradingAddon("owner", randomUUID(), true));
  assert.equal(f.saved!.scheduleId, "sub_sched_fixture"); assert.equal(f.saved!.body, null);
  assert.equal((await f.service.read("owner")).tradingAddon!.pending!.state, "processing");
  await f.service.cancelTradingAddonChange("owner", randomUUID()); assert.equal(f.counts.releases, 1); assert.equal(f.counts.updates, 0);
});

test("unresolved create older than Stripe's guaranteed idempotency window is not recreated or released by guess", async () => {
  const f = fixture(); f.unknownCreate = true;
  await assert.rejects(() => f.service.changeTradingAddon("owner", randomUUID(), true)); f.age(24 * 60);
  const before = f.counts, snapshot = await f.service.read("owner");
  assert.equal(snapshot.tradingAddon!.pending!.canCancel, false); assert.equal(snapshot.tradingAddon!.pending!.canRetry, false);
  await assert.rejects(() => f.service.cancelTradingAddonChange("owner", randomUUID()), code("addon_change_review_required"));
  assert.deepEqual(f.counts, before);
});

test("the default-off rollout stops new changes but does not trap an existing pending change", async () => {
  const f = fixture(); f.feature = false;
  await assert.rejects(() => f.service.changeTradingAddon("owner", randomUUID(), true), code("addon_change_unavailable"));
  assert.deepEqual(f.counts, { creates: 0, updates: 0, releases: 0 });
  f.feature = true; await f.service.changeTradingAddon("owner", randomUUID(), true); f.feature = false;
  assert.equal((await f.service.read("owner")).tradingAddon!.pending!.canCancel, true);
  await f.service.cancelTradingAddonChange("owner", randomUUID()); assert.equal(f.counts.releases, 1);
});

test("explicit portal action releases only an already-applied owned final phase, even if renewal access is unpaid", async () => {
  for (const paid of [true, false]) {
    const f = fixture(); await f.service.changeTradingAddon("owner", randomUUID(), true); f.applied(); f.paid = paid; f.feature = false;
    const now = Date.now; Date.now = () => (end + 10) * 1000;
    try {
      const before = { plan: f.context.plan, start: f.context.start, end: f.context.end };
      const snapshot = await f.service.read("owner");
      assert.equal(snapshot.tradingAddon!.pending, null);
      if (!paid) { assert.equal(snapshot.tradingAddon!.canAdd, false); assert.equal(snapshot.tradingAddon!.canRemove, false); }
      assert.equal(await f.service.portal("owner", randomUUID(), "https://sajda.example.test"), "https://billing.stripe.com/p/session/fixture");
      assert.equal(f.counts.releases, 1); assert.equal(f.saved!.state, "applied"); assert.equal(f.portals, 1);
      assert.deepEqual({ plan: f.context.plan, start: f.context.start, end: f.context.end }, before); assert.equal(f.context.scheduleId, null);
      await f.service.portal("owner", randomUUID(), "https://sajda.example.test"); assert.equal(f.counts.releases, 1);
    } finally { Date.now = now; }
  }
});

test("a next-phase race cannot be presented as canceling the earlier pending plan change", async () => {
  const f = fixture(); await f.service.changeTradingAddon("owner", randomUUID(), true); f.applied();
  await assert.rejects(() => f.service.cancelTradingAddonChange("owner", randomUUID()), code("addon_change_review_required"));
  assert.equal(f.counts.releases, 0);
});
test("unknown creation/update responses are recovered with the persisted contract and operation identity", async () => {
  for (const stage of ["unknownCreate", "unknownUpdate"] as const) {
    const f = fixture(), key = randomUUID(); f[stage] = true;
    await assert.rejects(() => f.service.changeTradingAddon("owner", key, true));
    const id = f.saved!.id; assert.equal(f.saved!.state, "creating");
    assert.equal((await f.service.changeTradingAddon("owner", key, true)).enabled, true);
    assert.equal(f.saved!.id, id); assert.equal(f.saved!.state, "scheduled");
    assert.equal(f.counts.updates, 1, "A successful but unknown update is read back, not charged/applied twice");
  }
});

test("JSONB reordering does not break exact semantic retry, while a changed value still fails closed", async () => {
  for (const corrupt of [false, true]) {
    const f = fixture(), key = randomUUID(); f.rejectedUpdate = true;
    await assert.rejects(() => f.service.changeTradingAddon("owner", key, true)); f.reorderBody();
    if (corrupt) f.saved!.body!.phases![1].items[0].price = "price_other";
    if (corrupt) { await assert.rejects(() => f.service.changeTradingAddon("owner", key, true), code("addon_change_review_required")); assert.equal(f.counts.updates, 0); }
    else { await f.service.changeTradingAddon("owner", key, true); assert.equal(f.counts.updates, 1); }
  }
});
test("canceling a pending change releases only its owned schedule and leaves paid Pro and its period intact", async () => {
  const f = fixture(), cancelKey = randomUUID();
  await f.service.changeTradingAddon("owner", randomUUID(), true); f.unknownRelease = true;
  await assert.rejects(() => f.service.cancelTradingAddonChange("owner", cancelKey));
  assert.equal(f.saved!.state, "canceling");
  assert.deepEqual(await f.service.cancelTradingAddonChange("owner", cancelKey), { state: "canceled" });
  assert.deepEqual(await f.service.cancelTradingAddonChange("owner", cancelKey), { state: "canceled" });
  assert.equal(f.context.plan, "premium"); assert.equal(f.context.end, end); assert.equal(f.context.scheduleId, null);
  assert.equal(f.counts.releases, 1); assert.equal(f.saved!.state, "canceled");
});
test("removing Trading schedules Pro on the same subscription without removing already-paid Trading", async () => {
  const f = fixture(); f.bundle(); f.raw = { ...initial(), phases: [{ ...phase(), items: [{ ...phase().items[0], price: "price_trading" }] }] };
  const result = await f.service.changeTradingAddon("owner", randomUUID(), false);
  assert.equal(result.enabled, false); assert.equal(f.context.plan, "trading");
  assert.equal(f.saved!.targetPlan, "premium"); assert.equal(f.saved!.subscriptionId, "sub_fixture"); assert.equal(f.saved!.targetPriceId, "price_premium");
});
test("no migration, Apple-managed subscription or unpaid current period can start an add-on mutation", async () => {
  for (const cause of ["migration", "appStore", "paid"] as const) {
    const f = fixture(); f[cause] = cause === "appStore";
    await assert.rejects(() => f.service.changeTradingAddon("owner", randomUUID(), true));
    assert.deepEqual(f.counts, { creates: 0, updates: 0, releases: 0 }); assert.equal(f.saved, null);
  }
});
test("an externally modified future phase never gets overwritten on retry", async () => {
  const f = fixture(), key = randomUUID(); f.unknownUpdate = true;
  await assert.rejects(() => f.service.changeTradingAddon("owner", key, true));
  f.raw = { ...appliedBody(f.saved!.body!), metadata: { foreign: "operator" } };
  await assert.rejects(() => f.service.changeTradingAddon("owner", key, true), code("addon_change_review_required"));
  assert.equal(f.counts.updates, 1);
});
test("add-on API accepts only explicit booleans, account-scoped request UUIDs and server-owned contracts", async () => {
  const requestKey = randomUUID(), headers = { "content-type": "application/json" };
  assert.equal((await billingAction({ headers, body: { action: "trading-addon", requestKey, enabled: true } })).enabled, true);
  assert.equal((await billingAction({ headers, body: { action: "cancel-trading-addon-change", requestKey } })).action, "cancel-trading-addon-change");
  for (const body of [
    { action: "trading-addon", requestKey }, { action: "trading-addon", requestKey, enabled: "true" },
    { action: "trading-addon", requestKey, enabled: true, priceId: "price_free" }, { action: "trading-addon", requestKey, enabled: true, plan: "trading" },
    { action: "cancel-trading-addon-change", requestKey, enabled: false }, { action: "portal", requestKey, enabled: true },
  ]) await assert.rejects(() => billingAction({ headers, body }), code("invalid_billing_request"));
});
test("additive schedule ledger is isolated, fenced and cannot itself create access", async () => {
  const sql = await readFile(new URL("../db/migrations/0027_trading_addon_changes.sql", import.meta.url), "utf8");
  assert.match(sql, /REFERENCES sajda.commerce_customers\(namespace,owner_id\)/u);
  assert.match(sql, /WHERE state IN \('creating','scheduled','canceling'\)/u);
  assert.match(sql, /request_body IS NULL OR schedule_id IS NOT NULL/u);
  assert.doesNotMatch(sql, /INSERT INTO sajda.commerce_access|UPDATE sajda.commerce_access|DROP TABLE/iu);
});
