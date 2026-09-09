import { parse } from "tldts";
import { z } from "zod";

/** Evidence gates for a human acquisition decision, never an automated purchase or appraisal. */
export const TRADING_ACQUISITION_METHODOLOGY = "evidence-gated-acquisition-v1" as const;
export const TRADING_ACQUISITION_GATES = ["registrability", "exact_quote", "renewal", "fees", "tax", "mandatory_addons", "history", "rights", "valuation"] as const;
export type TradingAcquisitionGate = typeof TRADING_ACQUISITION_GATES[number];
export const TRADING_ACQUISITION_REASONS = ["invalid_domain", "technical_exclusion", "registrability_unverified", "registrar_unavailable",
  "exact_quote_missing_or_stale", "standard_tld_price_only", "provider_identity_mismatch", "renewal_unknown", "fees_unknown", "tax_unknown",
  "mandatory_addons_unknown", "history_review_required", "history_risk_identified", "rights_review_required", "rights_risk_identified",
  "valuation_review_required", "valuation_currency_mismatch", "manual_purchase_confirmation_required"] as const;
export type TradingAcquisitionReason = typeof TRADING_ACQUISITION_REASONS[number];

// Explicit product freshness policy, not a provider guarantee or legal clearance duration.
export const TRADING_ACQUISITION_FRESHNESS_MS = Object.freeze({ quote: 5 * 60_000, registrability: 5 * 60_000,
  history: 7 * 86_400_000, rights: 30 * 86_400_000, valuation: 30 * 86_400_000, comparable: 3 * 366 * 86_400_000 });
const MAX_MINOR = 100_000_000_000;
// The first adapters are restricted to currencies with two minor-unit decimal places. No implicit FX.
const currency = z.enum(["USD", "EUR", "GBP", "SEK", "NOK", "DKK", "CAD", "AUD", "CHF"]);
const minor = z.number().int().nonnegative().max(MAX_MINOR);
const identifier = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{1,127}$/u);
const timestamp = z.string().refine(value => value.length === 24 && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value);
function canonicalDomain(value: string): string | null {
  const candidate = value.trim().toLowerCase().replace(/\.$/u, "");
  if (candidate.length > 253 || !/^[a-z0-9.-]+$/u.test(candidate) || candidate.split(".").some(label => !label || label.length > 63 || label.startsWith("-") || label.endsWith("-") || label.startsWith("xn--"))) return null;
  const result = parse(candidate, { allowPrivateDomains: true });
  return result.isIcann && !result.isPrivate && result.domain === candidate ? candidate : null;
}
const domain = z.string().refine(value => canonicalDomain(value) === value);
const sourceUrl = z.string().max(2048).refine(value => {
  try {
    const url = new URL(value), host = parse(url.hostname, { allowPrivateDomains: true });
    return url.protocol === "https:" && !url.username && !url.password && !url.port && !url.hash && host.isIcann && !host.isPrivate && !host.isIp;
  } catch { return false; }
});
const observation = { domain, sourceUrl, checkedAt: timestamp, expiresAt: timestamp };
const providerMethod = z.enum(["official_registrar_api", "official_registrar_checkout"]);
const registrabilitySchema = z.object({ ...observation, providerId: identifier, method: providerMethod,
  status: z.enum(["available", "unavailable", "unknown"]) }).strict();
const extraCostSchema = z.object({ treatment: z.enum(["included", "specified", "unknown"]),
  initialMinor: minor.nullable(), renewalMinor: minor.nullable() }).strict();
const quoteSchema = z.object({ ...observation, providerId: identifier, method: providerMethod, quoteId: identifier,
  scope: z.enum(["exact_domain", "standard_tld"]), currency,
  acquisitionMinor: minor.nullable(), renewalMinor: minor.nullable(),
  initialTermYears: z.number().int().min(1).max(10).nullable(), renewalTermYears: z.number().int().min(1).max(10).nullable(),
  fees: extraCostSchema, tax: extraCostSchema, mandatoryAddOns: extraCostSchema }).strict();
const reviewSchema = z.object({ ...observation, reviewId: identifier, method: z.literal("documented_review"),
  status: z.enum(["no_material_flags_identified", "risk_identified", "unknown"]),
  evidenceUrls: z.array(sourceUrl).min(1).max(20) }).strict();
const rightsSchema = reviewSchema.extend({ intendedUse: z.string().trim().min(3).max(300),
  jurisdictions: z.array(z.string().regex(/^[A-Z]{2}$/u)).min(1).max(20) }).strict();
const comparableSchema = z.object({ domain, currency, amountMinor: minor.positive(), soldAt: timestamp,
  sourceUrl, sourceKind: z.enum(["primary_public_filing", "licensed_sale_record", "broker_confirmation"]),
  comparability: z.literal("reviewed_comparable") }).strict();
const valuationSchema = z.object({ ...observation, reviewId: identifier, method: z.literal("documented_comparable_review"),
  currency, lowerMinor: minor.positive(), upperMinor: minor.positive(),
  comparables: z.array(comparableSchema).min(3).max(30), rationale: z.string().trim().min(30).max(2000) }).strict();

// Required keeps public types accurate when imported by this app's non-strict-null TS configuration.
export type TradingRegistrabilityEvidence = Required<z.infer<typeof registrabilitySchema>>;
export type TradingExactQuoteEvidence = Required<z.infer<typeof quoteSchema>>;
export type TradingHistoryReviewEvidence = Required<z.infer<typeof reviewSchema>>;
export type TradingRightsReviewEvidence = Required<z.infer<typeof rightsSchema>>;
export type TradingValuationReviewEvidence = Required<z.infer<typeof valuationSchema>>;
export interface TradingAcquisitionInput {
  domain: string;
  excluded?: boolean;
  registrability?: TradingRegistrabilityEvidence | null;
  quote?: TradingExactQuoteEvidence | null;
  history?: TradingHistoryReviewEvidence | null;
  rights?: TradingRightsReviewEvidence | null;
  valuation?: TradingValuationReviewEvidence | null;
}
export interface TradingCostScenario {
  years: 1 | 3 | 5;
  coveredYears: number;
  currency: z.infer<typeof currency>;
  totalMinor: number;
  renewalCycles: number;
  basis: "current_price_scenario";
}
export interface TradingAcquisition {
  version: 1;
  methodology: typeof TRADING_ACQUISITION_METHODOLOGY;
  domain: string;
  evaluatedAt: string;
  /** Earliest underlying evidence deadline; re-reading a report never extends a decision window. */
  validUntil: string | null;
  status: "research_only" | "due_diligence_required" | "acquisition_review_ready" | "excluded";
  readyForAcquisitionReview: boolean;
  /** Below a reviewed range is a research signal, never a guaranteed undervaluation or profit. */
  priceSignal: "none" | "below_reviewed_range" | "not_below_reviewed_range";
  gates: Record<TradingAcquisitionGate, boolean>;
  missingChecks: TradingAcquisitionGate[];
  reasons: TradingAcquisitionReason[];
  totalCostScenarios: TradingCostScenario[];
  comparison: { currency: z.infer<typeof currency>; lowerMinor: number; upperMinor: number; threeYearCostMinor: number;
    differenceToLowerMinor: number; basis: "reviewed_range_not_sale_guarantee" } | null;
  /** This model never executes trades or provides unconditional buy instructions. */
  requiresHumanConfirmation: true;
}

function fresh(evidence: { checkedAt: string; expiresAt: string }, now: number, maximumAge: number): boolean {
  const checked = Date.parse(evidence.checkedAt), expiry = Date.parse(evidence.expiresAt);
  return checked <= now && now - checked < maximumAge && expiry > now && expiry > checked;
}
function costKnown(cost: z.infer<typeof extraCostSchema>): boolean {
  return cost.treatment === "included" ? cost.initialMinor === 0 && cost.renewalMinor === 0
    : cost.treatment === "specified" && cost.initialMinor !== null && cost.renewalMinor !== null;
}
function scenarios(quote: TradingExactQuoteEvidence): TradingCostScenario[] {
  const initial = quote.acquisitionMinor! + quote.fees.initialMinor! + quote.tax.initialMinor! + quote.mandatoryAddOns.initialMinor!;
  const renewal = quote.renewalMinor! + quote.fees.renewalMinor! + quote.tax.renewalMinor! + quote.mandatoryAddOns.renewalMinor!;
  return ([1, 3, 5] as const).map(years => {
    const renewalCycles = Math.max(0, Math.ceil((years - quote.initialTermYears!) / quote.renewalTermYears!));
    return { years, coveredYears: quote.initialTermYears! + renewalCycles * quote.renewalTermYears!, currency: quote.currency,
      totalMinor: initial + renewalCycles * renewal, renewalCycles, basis: "current_price_scenario" };
  });
}

/**
 * Server-owned reviewed evidence only. A shape validator cannot authenticate an external source.
 * Never pass client claims, name-fit scores, RDAP absence, standard-TLD feeds or crawl samples as
 * exact registrar confirmation, legal/history reviews, or independent comparable valuation.
 * Future renewal totals hold today's stated schedule constant; they are not locked future quotes.
 */
export function evaluateTradingAcquisition(input: TradingAcquisitionInput, now = Date.now()): TradingAcquisition {
  if (!Number.isFinite(now) || !Number.isFinite(new Date(now).getTime())) throw new RangeError("Invalid acquisition evaluation clock.");
  const normalized = typeof input?.domain === "string" ? canonicalDomain(input.domain) : null;
  const gates = Object.fromEntries(TRADING_ACQUISITION_GATES.map(gate => [gate, false])) as Record<TradingAcquisitionGate, boolean>;
  const reasons: TradingAcquisitionReason[] = [];
  const validDomain = normalized !== null;
  const matching = <T extends { domain?: string }>(schema: z.ZodType<T>, value: unknown): Required<T> | null => {
    const result = schema.safeParse(value);
    return validDomain && result.success && result.data.domain === normalized ? result.data as Required<T> : null;
  };
  const registrar = matching(registrabilitySchema, input?.registrability), quote = matching(quoteSchema, input?.quote);
  const history = matching(reviewSchema, input?.history), rights = matching(rightsSchema, input?.rights), valuation = matching(valuationSchema, input?.valuation);
  const recentRegistrar = registrar !== null && fresh(registrar, now, TRADING_ACQUISITION_FRESHNESS_MS.registrability);
  const recentQuote = quote !== null && fresh(quote, now, TRADING_ACQUISITION_FRESHNESS_MS.quote);
  let excluded = input?.excluded === true || !validDomain;
  if (!validDomain) reasons.push("invalid_domain");
  if (input?.excluded === true) reasons.push("technical_exclusion");
  gates.registrability = recentRegistrar && registrar.status === "available";
  if (recentRegistrar && registrar.status === "unavailable") { excluded = true; reasons.push("registrar_unavailable"); }
  if (!gates.registrability) reasons.push("registrability_unverified");
  gates.exact_quote = recentQuote && quote.scope === "exact_domain" && quote.acquisitionMinor !== null && quote.initialTermYears !== null;
  if (gates.exact_quote && recentRegistrar && registrar.providerId !== quote!.providerId) {
    gates.exact_quote = false; reasons.push("provider_identity_mismatch");
  }
  if (recentQuote && quote.scope === "standard_tld") reasons.push("standard_tld_price_only");
  if (!gates.exact_quote) reasons.push("exact_quote_missing_or_stale");
  if (gates.exact_quote) {
    gates.renewal = quote!.renewalMinor !== null && quote!.renewalTermYears !== null;
    gates.fees = costKnown(quote!.fees);
    gates.tax = costKnown(quote!.tax);
    gates.mandatory_addons = costKnown(quote!.mandatoryAddOns);
  }
  if (!gates.renewal) reasons.push("renewal_unknown");
  if (!gates.fees) reasons.push("fees_unknown");
  if (!gates.tax) reasons.push("tax_unknown");
  if (!gates.mandatory_addons) reasons.push("mandatory_addons_unknown");
  for (const [key, review] of [["history", history], ["rights", rights]] as const) {
    gates[key] = review !== null && fresh(review, now, TRADING_ACQUISITION_FRESHNESS_MS[key]) && review.status === "no_material_flags_identified";
    // Expiration cannot erase a previously identified risk. A new reviewed disposition is required.
    if (review?.status === "risk_identified" && Date.parse(review.checkedAt) <= now) {
      excluded = true; reasons.push(key === "history" ? "history_risk_identified" : "rights_risk_identified");
    }
    if (!gates[key]) reasons.push(key === "history" ? "history_review_required" : "rights_review_required");
  }
  if (valuation && fresh(valuation, now, TRADING_ACQUISITION_FRESHNESS_MS.valuation) && valuation.lowerMinor <= valuation.upperMinor) {
    const comps = valuation.comparables;
    // Editorial evidence minimum, not a statistical confidence claim. Human comparability review is mandatory.
    gates.valuation = new Set(comps.map(comp => comp.domain)).size >= 3
      && new Set(comps.map(comp => parse(new URL(comp.sourceUrl).hostname).domain)).size >= 2
      && comps.every(comp => comp.currency === valuation.currency && comp.domain !== normalized
        && Date.parse(comp.soldAt) <= Date.parse(valuation.checkedAt) && now - Date.parse(comp.soldAt) < TRADING_ACQUISITION_FRESHNESS_MS.comparable);
    if (!quote || valuation.currency !== quote.currency) {
      gates.valuation = false;
      if (quote) reasons.push("valuation_currency_mismatch");
    }
  }
  if (!gates.valuation) reasons.push("valuation_review_required");
  const completeCost = gates.exact_quote && gates.renewal && gates.fees && gates.tax && gates.mandatory_addons;
  const totalCostScenarios = completeCost ? scenarios(quote!) : [];
  const threeYears = totalCostScenarios.find(scenario => scenario.years === 3);
  const comparison = gates.valuation && threeYears ? { currency: threeYears.currency, lowerMinor: valuation!.lowerMinor,
    upperMinor: valuation!.upperMinor, threeYearCostMinor: threeYears.totalMinor,
    differenceToLowerMinor: valuation!.lowerMinor - threeYears.totalMinor, basis: "reviewed_range_not_sale_guarantee" as const } : null;
  const missingChecks = TRADING_ACQUISITION_GATES.filter(gate => !gates[gate]);
  const readyForAcquisitionReview = !excluded && missingChecks.length === 0;
  const validUntil = readyForAcquisitionReview ? new Date(Math.min(
    ...([["registrability", registrar!], ["quote", quote!], ["history", history!], ["rights", rights!], ["valuation", valuation!]] as const)
      .flatMap(([key, evidence]) => [Date.parse(evidence.expiresAt), Date.parse(evidence.checkedAt) + TRADING_ACQUISITION_FRESHNESS_MS[key]]),
    ...valuation!.comparables.map(comp => Date.parse(comp.soldAt) + TRADING_ACQUISITION_FRESHNESS_MS.comparable),
  )).toISOString() : null;
  reasons.push("manual_purchase_confirmation_required");
  return { version: 1, methodology: TRADING_ACQUISITION_METHODOLOGY, domain: normalized ?? "", evaluatedAt: new Date(now).toISOString(), validUntil,
    status: excluded ? "excluded" : readyForAcquisitionReview ? "acquisition_review_ready" : gates.exact_quote ? "due_diligence_required" : "research_only",
    readyForAcquisitionReview, priceSignal: readyForAcquisitionReview && comparison
      ? comparison.differenceToLowerMinor > 0 ? "below_reviewed_range" : "not_below_reviewed_range" : "none",
    gates, missingChecks, reasons, totalCostScenarios, comparison, requiresHumanConfirmation: true };
}

const scenarioSchema = z.object({ years: z.union([z.literal(1), z.literal(3), z.literal(5)]), coveredYears: z.number().int().min(1).max(20),
  currency, totalMinor: z.number().int().min(0).max(MAX_MINOR * 20), renewalCycles: z.number().int().min(0).max(4), basis: z.literal("current_price_scenario") }).strict();
const resultSchema = z.object({ version: z.literal(1), methodology: z.literal(TRADING_ACQUISITION_METHODOLOGY), domain: z.string().max(253), evaluatedAt: timestamp, validUntil: timestamp.nullable(),
  status: z.enum(["research_only", "due_diligence_required", "acquisition_review_ready", "excluded"]), readyForAcquisitionReview: z.boolean(),
  priceSignal: z.enum(["none", "below_reviewed_range", "not_below_reviewed_range"]),
  gates: z.object({ registrability: z.boolean(), exact_quote: z.boolean(), renewal: z.boolean(), fees: z.boolean(), tax: z.boolean(),
    mandatory_addons: z.boolean(), history: z.boolean(), rights: z.boolean(), valuation: z.boolean() }).strict(),
  missingChecks: z.array(z.enum(TRADING_ACQUISITION_GATES)).max(TRADING_ACQUISITION_GATES.length),
  reasons: z.array(z.enum(TRADING_ACQUISITION_REASONS)).max(TRADING_ACQUISITION_REASONS.length), totalCostScenarios: z.array(scenarioSchema).max(3),
  comparison: z.object({ currency, lowerMinor: minor.positive(), upperMinor: minor.positive(), threeYearCostMinor: z.number().int().min(0).max(MAX_MINOR * 20),
    differenceToLowerMinor: z.number().int().min(-MAX_MINOR * 20).max(MAX_MINOR), basis: z.literal("reviewed_range_not_sale_guarantee") }).strict().nullable(),
  requiresHumanConfirmation: z.literal(true) }).strict();

/** Strict transport coherence, not evidence authentication. Re-evaluate source evidence on the server. */
export function isTradingAcquisition(value: unknown): value is TradingAcquisition {
  const parsed = resultSchema.safeParse(value);
  if (!parsed.success) return false;
  const row = parsed.data, missing = TRADING_ACQUISITION_GATES.filter(gate => !row.gates[gate]);
  if (JSON.stringify(row.missingChecks) !== JSON.stringify(missing) || new Set(row.reasons).size !== row.reasons.length
    || !row.reasons.includes("manual_purchase_confirmation_required") || row.domain !== "" && canonicalDomain(row.domain) !== row.domain) return false;
  const excluded = row.reasons.some(reason => ["invalid_domain", "technical_exclusion", "registrar_unavailable", "history_risk_identified", "rights_risk_identified"].includes(reason));
  const ready = !excluded && missing.length === 0;
  if (ready ? row.validUntil === null || Date.parse(row.validUntil) <= Date.parse(row.evaluatedAt) : row.validUntil !== null) return false;
  if (row.domain === "" && !row.reasons.includes("invalid_domain") || row.status !== (excluded ? "excluded" : ready ? "acquisition_review_ready" : row.gates.exact_quote ? "due_diligence_required" : "research_only") || row.readyForAcquisitionReview !== ready) return false;
  const completeCost = row.gates.exact_quote && row.gates.renewal && row.gates.fees && row.gates.tax && row.gates.mandatory_addons;
  if (row.totalCostScenarios.length !== (completeCost ? 3 : 0)) return false;
  for (const [index, item] of row.totalCostScenarios.entries()) {
    if (item.years !== [1, 3, 5][index] || item.coveredYears < item.years || item.currency !== row.totalCostScenarios[0].currency
      || index > 0 && item.totalMinor < row.totalCostScenarios[index - 1].totalMinor) return false;
  }
  if ((row.comparison !== null) !== (row.gates.valuation && completeCost)) return false;
  if (row.comparison && (row.comparison.lowerMinor > row.comparison.upperMinor || row.comparison.currency !== row.totalCostScenarios[1].currency
    || row.comparison.threeYearCostMinor !== row.totalCostScenarios[1].totalMinor
    || row.comparison.differenceToLowerMinor !== row.comparison.lowerMinor - row.comparison.threeYearCostMinor)) return false;
  return row.priceSignal === (ready && row.comparison ? row.comparison.differenceToLowerMinor > 0 ? "below_reviewed_range" : "not_below_reviewed_range" : "none");
}
