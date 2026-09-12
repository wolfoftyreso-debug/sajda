import { z } from "zod";
import { canonicalTradingRegistrarDomain } from "./trading-registrar.js";

/** User-authored what-if assumptions. These are not observed prices or investment forecasts. */
const usd = z.number().finite().min(0).max(100_000_000).multipleOf(0.01);
const percentage = z.number().finite().min(0).max(100);
// Matches the database's bounded integer optimistic-concurrency version.
const version = z.number().int().min(0).max(2_147_483_646);
const calendarDate = z.string().regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u).refine(value => {
  if (value.startsWith("0000-")) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Use a real calendar date in YYYY-MM-DD format.");
const timestamp = z.string().refine(value => value.length === 24
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value,
"Use an ISO UTC timestamp.");
// PostgreSQL UTF-8/jsonb cannot persist NUL or unpaired UTF-16 surrogates. Reject
// them at the request boundary rather than turning a valid-looking draft into a 503.
function databaseText(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code === 0 || code >= 0xdc00 && code <= 0xdfff) return false;
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++index);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    }
  }
  return true;
}
const textField = (maximum: number, minimum = 0) => z.string().trim().min(minimum).max(maximum)
  .refine(databaseText, "Text contains an unsupported character.");

export const tradingAnalysisModeSchema = z.enum(["balanced", "brand", "acquisition", "risk"]);
export type TradingAnalysisMode = z.infer<typeof tradingAnalysisModeSchema>;
export const tradingScenarioStanceSchema = z.enum(["bullish", "neutral", "bearish"]);
export type TradingScenarioStance = z.infer<typeof tradingScenarioStanceSchema>;

export const tradingScenarioAssumptionsSchema = z.object({
  acquisitionUsd: usd,
  annualRenewalUsd: usd,
  otherCostsUsd: usd,
  holdingMonths: z.number().int().min(1).max(120),
  sellingFeePercent: percentage.max(99),
  saleProbabilityPercent: percentage,
  bearSaleUsd: usd,
  baseSaleUsd: usd,
  bullSaleUsd: usd,
}).strict().superRefine((value, context) => {
  if (value.bearSaleUsd > value.baseSaleUsd) context.addIssue({
    code: z.ZodIssueCode.custom, path: ["baseSaleUsd"], message: "Base sale price must be at least the bear sale price.",
  });
  if (value.baseSaleUsd > value.bullSaleUsd) context.addIssue({
    code: z.ZodIssueCode.custom, path: ["bullSaleUsd"], message: "Bull sale price must be at least the base sale price.",
  });
});

// Required preserves this contract with the application's non-strict-null TypeScript configuration.
export type TradingScenarioAssumptions = Required<z.infer<typeof tradingScenarioAssumptionsSchema>>;

export const tradingScenarioInputSchema = z.object({
  // PostgreSQL uuid::text returns lowercase; normalize before hashing or matching receipts.
  id: z.string().uuid().transform(value => value.toLowerCase()),
  expectedVersion: version,
  domain: z.string().max(253).refine(value => canonicalTradingRegistrarDomain(value) === value,
    "Use a lowercase registrable ASCII domain, without a URL, subdomain or trailing dot."),
  title: textField(100, 1),
  thesis: textField(2000),
  catalyst: textField(1000),
  invalidation: textField(1000),
  reviewOn: calendarDate,
  stance: tradingScenarioStanceSchema,
  analysisMode: tradingAnalysisModeSchema,
  assumptions: tradingScenarioAssumptionsSchema,
}).strict();

export type TradingScenarioInput = Omit<Required<z.infer<typeof tradingScenarioInputSchema>>, "assumptions">
  & { assumptions: TradingScenarioAssumptions };

export const tradingScenarioSchema = tradingScenarioInputSchema.omit({ expectedVersion: true }).extend({
  version: version.min(1),
  createdAt: timestamp,
  updatedAt: timestamp,
}).strict().refine(value => Date.parse(value.updatedAt) >= Date.parse(value.createdAt), {
  path: ["updatedAt"], message: "Updated time cannot precede creation time.",
});

export type TradingScenario = Omit<Required<z.infer<typeof tradingScenarioSchema>>, "assumptions">
  & { assumptions: TradingScenarioAssumptions };

export interface TradingScenarioEvaluation {
  totalCostUsd: number;
  breakEvenSaleUsd: number;
  probabilityAdjustedBreakEvenUsd: number | null;
  noSaleCashflowUsd: number;
  cases: Array<{
    key: "bear" | "base" | "bull";
    saleUsd: number;
    netIfSoldUsd: number;
    probabilityWeightedNetUsd: number;
    roiIfSoldPercent: number | null;
  }>;
  sensitivity: Array<{ holdingMonths: number; totalCostUsd: number; baseNetIfSoldUsd: number }>;
}

/** Exact base-10 ratio from a validated finite number, including exponent notation. */
function decimalRatio(value: number): { numerator: bigint; denominator: bigint } {
  const [mantissa, exponent = "0"] = String(value).split("e");
  const [integer, fraction = ""] = mantissa.split(".");
  const digits = BigInt(integer + fraction), power = Number(exponent) - fraction.length;
  return power >= 0 ? { numerator: digits * 10n ** BigInt(power), denominator: 1n }
    : { numerator: digits, denominator: 10n ** BigInt(-power) };
}
/** Half away from zero, without a binary float shifting an exact half-cent tie. */
function roundedRatio(numerator: bigint, denominator: bigint): number {
  const magnitude = numerator < 0n ? -numerator : numerator;
  const result = magnitude / denominator + (magnitude % denominator * 2n >= denominator ? 1n : 0n);
  return Number(numerator < 0n ? -result : result);
}
const dollarsFromCents = (numerator: bigint, denominator = 1n): number => roundedRatio(numerator, denominator) / 100;

/**
 * Cash-flow scenario, not an appraisal, market forecast, purchase signal or execution instruction.
 * All prices and the probability of a sale are supplied by the user and remain assumptions.
 * Renewal convention: floor(holdingMonths / 12); month 12 includes the first annual renewal.
 * Acquisition and other costs are incurred once; renewal charges occur at each anniversary.
 * A sale is modelled at the end of the selected horizon, after all these costs are incurred.
 * If no sale occurs, cash flow is minus all costs: no value is assigned to the unsold asset.
 * Probability-weighted cash flow = P(sale) × sale proceeds after fees − all costs. It is
 * not P(sale) × profit, which would incorrectly erase costs when no sale happens.
 * Break-even values are rounded dollar estimates, not executable minimum asking prices.
 * A probability-adjusted break-even is null when no sale is possible or the result exceeds
 * finite number arithmetic; an infinitesimal probability must never emit Infinity/NaN.
 */
export function evaluateTradingScenario(assumptions: TradingScenarioAssumptions): TradingScenarioEvaluation {
  const value = tradingScenarioAssumptionsSchema.parse(assumptions) as TradingScenarioAssumptions;
  // USD inputs are bounded to two decimals and at most 10 billion cents, safely
  // convertible to integers. Percentage ratios remain exact through final rounding.
  const acquisitionCents = BigInt(Math.round(value.acquisitionUsd * 100));
  const renewalCents = BigInt(Math.round(value.annualRenewalUsd * 100));
  const otherCents = BigInt(Math.round(value.otherCostsUsd * 100));
  const costAt = (months: number): bigint => acquisitionCents + otherCents + renewalCents * BigInt(Math.floor(months / 12));
  const totalCents = costAt(value.holdingMonths);
  const fee = decimalRatio(value.sellingFeePercent), probability = decimalRatio(value.saleProbabilityPercent);
  const retainedDenominator = fee.denominator * 100n;
  const retainedNumerator = retainedDenominator - fee.numerator;
  const probabilityDenominator = probability.denominator * 100n;
  const expectedDenominator = retainedDenominator * probabilityDenominator;
  const probabilityBreakEven = probability.numerator === 0n ? null
    : dollarsFromCents(totalCents * expectedDenominator, retainedNumerator * probability.numerator);
  const proceedsNumerator = (saleUsd: number): bigint => BigInt(Math.round(saleUsd * 100)) * retainedNumerator;
  const cases: TradingScenarioEvaluation["cases"] = ([
    ["bear", value.bearSaleUsd], ["base", value.baseSaleUsd], ["bull", value.bullSaleUsd],
  ] as const).map(([key, saleUsd]) => {
    const proceeds = proceedsNumerator(saleUsd), net = proceeds - totalCents * retainedDenominator;
    return {
      key, saleUsd, netIfSoldUsd: dollarsFromCents(net, retainedDenominator),
      probabilityWeightedNetUsd: dollarsFromCents(proceeds * probability.numerator - totalCents * expectedDenominator, expectedDenominator),
      roiIfSoldPercent: totalCents === 0n ? null : roundedRatio(net * 10_000n, retainedDenominator * totalCents) / 100,
    };
  });
  return {
    totalCostUsd: dollarsFromCents(totalCents),
    breakEvenSaleUsd: dollarsFromCents(totalCents * retainedDenominator, retainedNumerator),
    probabilityAdjustedBreakEvenUsd: probabilityBreakEven === null || !Number.isFinite(probabilityBreakEven)
      ? null : probabilityBreakEven,
    noSaleCashflowUsd: dollarsFromCents(-totalCents),
    cases,
    sensitivity: [...new Set([6, 12, 24, 36, value.holdingMonths])].sort((a, b) => a - b).map(holdingMonths => ({
      holdingMonths,
      totalCostUsd: dollarsFromCents(costAt(holdingMonths)),
      baseNetIfSoldUsd: dollarsFromCents(proceedsNumerator(value.baseSaleUsd) - costAt(holdingMonths) * retainedDenominator, retainedDenominator),
    })),
  };
}
