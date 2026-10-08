import type Stripe from "stripe";
import { CommerceError, commerceId, commercePriceId, type CommerceConfig } from "./commerce-config.js";
import { validateCommercePrice } from "./commerce-provider.js";

export type AddonPlan = "premium" | "trading";
export interface AddonSubscription {
  id: string; plan: AddonPlan; priceId: string; start: number; end: number;
  scheduleId: string | null; metadata: Record<string, string>;
}
export interface AddonChange {
  id: string; requestKey: string; subscriptionId: string; fromPlan: AddonPlan; targetPlan: AddonPlan;
  fromPriceId: string; targetPriceId: string; periodStart: number; effectiveAt: number;
  createdAt: string; scheduleId: string | null; body: Stripe.SubscriptionScheduleUpdateParams | null;
  state: "creating" | "scheduled" | "canceling" | "canceled" | "applied";
  cancelRequestKey?: string;
}
export interface TradingAddonChangeResult { state: "scheduled"; enabled: boolean; effectiveAt: string }
export interface TradingAddonSnapshot {
  canAdd: boolean; canRemove: boolean;
  pending: { enabled: boolean; effectiveAt: string; canCancel: boolean; state: "processing" | "scheduled"; canRetry: boolean } | null;
}
const obj = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const id = (value: unknown): string => typeof value === "string" ? value : String(obj(value).id ?? "");
const fail = (): never => { throw new CommerceError("addon_change_review_required", 409); };
const epoch = (value: unknown): number => typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : fail();
function metadata(value: unknown): Record<string, string> {
  const row = obj(value);
  if (Object.keys(row).length > 50 || Object.entries(row).some(([key, val]) => key.length > 40 || typeof val !== "string" || val.length > 500)) return fail();
  return row as Record<string, string>;
}
export function validateAddonSubscription(value: unknown, customerId: string, config: CommerceConfig, now = Date.now(), forRelease = false): AddonSubscription {
  const sub = obj(value), items = obj(sub.items), rows = items.data;
  if (sub.object !== "subscription" || sub.livemode !== (config.mode === "live") || id(sub.customer) !== customerId
    || !(forRelease ? ["active", "past_due", "unpaid"].includes(String(sub.status)) : sub.status === "active")
    || sub.pause_collection || sub.pending_update || !forRelease && (sub.cancel_at_period_end === true || sub.cancel_at != null)
    || sub.collection_method !== "charge_automatically" || items.has_more !== false || !Array.isArray(rows) || rows.length !== 1 || obj(rows[0]).quantity !== 1) return fail();
  const item = obj(rows[0]), plan = (["premium", "trading"] as const).find(candidate => {
    try { validateCommercePrice(item.price, config, candidate, false); return true; }
    catch (error) { if (error instanceof CommerceError && error.code === "billing_price_unavailable") return false; throw error; }
  });
  if (!plan) throw new CommerceError("pro_subscription_required", 409);
  const start = epoch(item.current_period_start), end = epoch(item.current_period_end), seconds = Math.floor(now / 1000);
  if (start > seconds || end <= seconds + (forRelease ? 0 : 120) || end - start > 45 * 86400) return fail();
  return { id: commerceId(sub.id, "sub"), plan, priceId: commercePriceId(config, plan), start, end,
    scheduleId: sub.schedule == null ? null : commerceId(sub.schedule, "sub_sched"), metadata: metadata(sub.metadata) };
}
function schedule(value: unknown, customerId: string, change: AddonChange, config: CommerceConfig): Record<string, unknown> {
  const row = obj(value);
  if (row.object !== "subscription_schedule" || row.livemode !== (config.mode === "live") || id(row.customer) !== customerId
    || change.scheduleId !== null && row.id !== change.scheduleId
    || !["active", "released", "completed", "canceled"].includes(String(row.status))
    || id(row.subscription ?? row.released_subscription) !== change.subscriptionId) return fail();
  commerceId(row.id, "sub_sched");
  return row;
}
function standardInvoiceSettings(value: unknown): boolean {
  if (value == null) return true;
  const settings = obj(value);
  return Object.entries(settings).every(([key, val]) => key === "issuer"
    ? val == null || obj(val).type === "self" && obj(val).account == null
    : val == null || Array.isArray(val) && val.length === 0);
}
function standardDefaults(value: unknown): void {
  const defaults = obj(value);
  if (["application_fee_percent", "billing_thresholds", "on_behalf_of", "transfer_data"].some(key => defaults[key] != null)
    || defaults.collection_method != null && defaults.collection_method !== "charge_automatically"
    || defaults.billing_cycle_anchor != null && defaults.billing_cycle_anchor !== "automatic"
    || defaults.automatic_tax != null && (obj(defaults.automatic_tax).enabled !== false || obj(defaults.automatic_tax).liability != null)
    || !standardInvoiceSettings(defaults.invoice_settings)) return fail();
}
/** A persisted ID returned by our idempotent from_subscription call proves
 * creation; this validator proves release cannot discard an unknown future. */
export function validateAddonInitialSchedule(value: unknown, customerId: string, context: AddonSubscription, change: AddonChange, config: CommerceConfig): void {
  const row = schedule(value, customerId, change, config), phases = row.phases, current = obj(row.current_phase);
  if (row.status === "released") return;
  if (row.status !== "active" || context.id !== change.subscriptionId || context.plan !== change.fromPlan
    || context.start !== change.periodStart || context.end !== change.effectiveAt || !Array.isArray(phases) || phases.length !== 1
    || current.start_date !== change.periodStart || current.end_date !== change.effectiveAt
    || Object.keys(metadata(row.metadata)).length !== 0) return fail();
  const first = obj(phases[0]), items = first.items;
  if (first.start_date !== change.periodStart || first.end_date !== change.effectiveAt || !Array.isArray(items) || items.length !== 1
    || id(obj(items[0]).price) !== change.fromPriceId || obj(items[0]).quantity !== 1) return fail();
}
/** Only the application-created monthly/card contract is supported. Unknown
 * custom taxes, trials, fees or invoice additions must not be silently dropped. */
function phaseInput(value: unknown, change: AddonChange): Stripe.SubscriptionScheduleUpdateParams.Phase {
  const phase = obj(value), items = phase.items;
  if (!Array.isArray(items) || items.length !== 1 || id(obj(items[0]).price) !== change.fromPriceId || obj(items[0]).quantity !== 1
    || epoch(phase.start_date) !== change.periodStart || epoch(phase.end_date) !== change.effectiveAt
    || phase.currency !== "usd" || phase.collection_method != null && phase.collection_method !== "charge_automatically"
    || phase.billing_cycle_anchor != null && phase.billing_cycle_anchor !== "automatic"
    || phase.trial === true
    || ["application_fee_percent", "billing_thresholds", "on_behalf_of", "transfer_data", "trial_end"].some(key => phase[key] != null)
    || ["add_invoice_items", "default_tax_rates"].some(key => phase[key] != null && (!Array.isArray(phase[key]) || (phase[key] as unknown[]).length > 0))
    || phase.automatic_tax != null && obj(phase.automatic_tax).enabled !== false
    || phase.automatic_tax != null && obj(phase.automatic_tax).liability != null
    || !standardInvoiceSettings(phase.invoice_settings) || obj(items[0]).billing_thresholds != null
    || ["discounts", "tax_rates"].some(key => obj(items[0])[key] != null && (!Array.isArray(obj(items[0])[key]) || (obj(items[0])[key] as unknown[]).length > 0))) return fail();
  const discounts = phase.discounts == null ? [] : phase.discounts;
  if (!Array.isArray(discounts) || discounts.length > 1) return fail();
  const preserved = discounts.map(value => {
    const discount = obj(value);
    // Reuse the existing Discount, never redeem its once-only Coupon again.
    if (!/^di_[A-Za-z0-9]+$/u.test(id(discount.discount)) || discount.promotion_code != null) return fail();
    return { discount: id(discount.discount) };
  });
  return { start_date: change.periodStart, end_date: change.effectiveAt,
    items: [{ price: change.fromPriceId, quantity: 1, metadata: metadata(obj(items[0]).metadata), discounts: "", tax_rates: "" }],
    currency: "usd", collection_method: "charge_automatically", proration_behavior: "none", automatic_tax: { enabled: false },
    billing_cycle_anchor: "automatic", default_tax_rates: "",
    discounts: preserved.length ? preserved : "", metadata: metadata(phase.metadata),
    ...(phase.default_payment_method == null ? {} : { default_payment_method: commerceId(phase.default_payment_method, "pm") }),
    ...(phase.description == null ? {} : { description: typeof phase.description === "string" ? phase.description : fail() }) };
}
export function buildAddonSchedule(value: unknown, customerId: string, context: AddonSubscription, change: AddonChange, config: CommerceConfig): Stripe.SubscriptionScheduleUpdateParams {
  const row = schedule(value, customerId, change, config), phases = row.phases, current = obj(row.current_phase);
  standardDefaults(row.default_settings);
  if (row.status !== "active" || context.id !== change.subscriptionId || context.plan !== change.fromPlan
    || context.start !== change.periodStart || context.end !== change.effectiveAt || !Array.isArray(phases) || phases.length !== 1
    || current.start_date !== change.periodStart || current.end_date !== change.effectiveAt
    || Object.keys(metadata(row.metadata)).length !== 0) return fail();
  const first = phaseInput(phases[0], change);
  const futureMetadata = { ...context.metadata, sajda_namespace: config.namespace, sajda_plan: change.targetPlan,
    sajda_addon_change: change.id, sajda_offer: "", sajda_coupon: "", sajda_checkout: "" };
  return { end_behavior: "release", proration_behavior: "none", metadata: { sajda_namespace: config.namespace, sajda_addon_change: change.id },
    phases: [first, { ...first, start_date: change.effectiveAt, end_date: undefined, duration: { interval: "month", interval_count: 1 },
      items: [{ price: change.targetPriceId, quantity: 1, discounts: "", tax_rates: "" }], discounts: "", metadata: futureMetadata }] };
}
/** Read-back verifies the complete future contract, not a local button click. */
export function validateAddonSchedule(value: unknown, customerId: string, change: AddonChange, config: CommerceConfig): "scheduled" | "released" | "completed" | "canceled" {
  const row = schedule(value, customerId, change, config), meta = metadata(row.metadata);
  if (meta.sajda_namespace !== config.namespace || meta.sajda_addon_change !== change.id) return fail();
  if (row.status === "released" || row.status === "canceled") return row.status;
  standardDefaults(row.default_settings);
  const phases = row.phases;
  if (!Array.isArray(phases) || phases.length !== 2 || row.end_behavior !== "release") return fail();
  const first = obj(phases[0]), next = obj(phases[1]), nextItems = next.items, nextMeta = metadata(next.metadata);
  phaseInput(first, change);
  phaseInput(next, { ...change, fromPriceId: change.targetPriceId, periodStart: change.effectiveAt, effectiveAt: epoch(next.end_date) });
  if (!Array.isArray(nextItems) || nextItems.length !== 1 || id(obj(nextItems[0]).price) !== change.targetPriceId || obj(nextItems[0]).quantity !== 1
    || next.start_date !== change.effectiveAt || epoch(next.end_date) <= change.effectiveAt || epoch(next.end_date) - change.effectiveAt > 32 * 86400
    || first.proration_behavior !== "none" || next.proration_behavior !== "none" || (next.discounts != null && (!Array.isArray(next.discounts) || next.discounts.length !== 0))
    || nextMeta.sajda_namespace !== config.namespace || nextMeta.sajda_addon_change !== change.id || nextMeta.sajda_plan !== change.targetPlan
    || nextMeta.sajda_offer !== "" || nextMeta.sajda_coupon !== "" || nextMeta.sajda_checkout !== "") return fail();
  return row.status === "completed" ? "completed" : "scheduled";
}
