import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateTradingScenario, tradingAnalysisModeSchema, tradingScenarioAssumptionsSchema,
  tradingScenarioInputSchema, tradingScenarioSchema, tradingScenarioStanceSchema,
  type TradingScenarioAssumptions, type TradingScenarioInput,
} from "../shared/trading-scenarios";

/** Synthetic user-entered hypotheses only, never market observations or actual domain valuations. */
const assumptions = (changes: Partial<TradingScenarioAssumptions> = {}): TradingScenarioAssumptions => ({
  acquisitionUsd: 100, annualRenewalUsd: 20, otherCostsUsd: 20, holdingMonths: 24,
  sellingFeePercent: 10, saleProbabilityPercent: 50, bearSaleUsd: 80, baseSaleUsd: 300, bullSaleUsd: 600,
  ...changes,
});
const input = (changes: Partial<TradingScenarioInput> = {}): TradingScenarioInput => ({
  id: "7d2b4f90-3c37-44d5-8f11-9440c4389b84", expectedVersion: 0,
  domain: "example.com", title: "A user-authored thesis", thesis: "An illustrative naming hypothesis.",
  catalyst: "A future product category could become relevant.", invalidation: "The proposed demand fails to appear.",
  reviewOn: "2030-02-28", stance: "neutral", analysisMode: "balanced", assumptions: assumptions(),
  ...changes,
});
const saved = () => {
  const { expectedVersion: _expectedVersion, ...fields } = input();
  return { ...fields, version: 1, createdAt: "2030-01-01T10:00:00.000Z", updatedAt: "2030-01-01T10:00:00.000Z" };
};

test("strict input preserves all four analysis modes and three explicit user stances", () => {
  for (const analysisMode of ["balanced", "brand", "acquisition", "risk"] as const) {
    assert.equal(tradingAnalysisModeSchema.parse(analysisMode), analysisMode);
    for (const stance of ["bullish", "neutral", "bearish"] as const) {
      assert.equal(tradingScenarioStanceSchema.parse(stance), stance);
      assert.deepEqual(tradingScenarioInputSchema.parse(input({ analysisMode, stance })), input({ analysisMode, stance }));
    }
  }
  assert.equal(tradingAnalysisModeSchema.safeParse("guaranteed_profit").success, false);
  assert.equal(tradingScenarioStanceSchema.safeParse("buy").success, false);
});

test("domain must be an already canonical registrable ASCII name, not a URL, subdomain or private suffix", () => {
  for (const domain of ["example.com", "example.co.uk", "example.ai", "example.se"]) {
    assert.equal(tradingScenarioInputSchema.safeParse(input({ domain })).success, true, domain);
  }
  for (const domain of ["", "Example.com", " example.com", "example.com.", "www.example.com", "https://example.com",
    "example.com/path", "foo.github.io", "co.uk", "localhost", "192.168.1.1", "foo.invalid", "åland.se", "xn--land-poa.se",
    "-example.com", "example-.com", "foo..com", `${"a".repeat(64)}.com`]) {
    assert.equal(tradingScenarioInputSchema.safeParse(input({ domain })).success, false, domain);
  }
});

test("review dates use real calendar days with leap-year validation and no time or coercion", () => {
  for (const reviewOn of ["2024-02-29", "2000-02-29", "2030-12-31", "2030-01-01"]) {
    assert.equal(tradingScenarioInputSchema.safeParse(input({ reviewOn })).success, true, reviewOn);
  }
  for (const reviewOn of ["2030-02-29", "1900-02-29", "2030-04-31", "2030-00-01", "2030-13-01", "2030-01-00",
    "2030-1-01", "30-01-01", "2030-01-01T00:00:00.000Z", "2030-01-01 ", "0000-01-01", "not a date"]) {
    assert.equal(tradingScenarioInputSchema.safeParse(input({ reviewOn })).success, false, reviewOn);
  }
});

test("money is finite nonnegative dollars at most 100 million, with at most two decimal places", () => {
  for (const amount of [0, 0.01, 0.07, 0.1, 0.29, 1.01, 1234.56, 99_999_999.99, 100_000_000]) {
    assert.equal(tradingScenarioAssumptionsSchema.safeParse(assumptions({ acquisitionUsd: amount })).success, true, String(amount));
  }
  const moneyKeys = ["acquisitionUsd", "annualRenewalUsd", "otherCostsUsd", "bearSaleUsd", "baseSaleUsd", "bullSaleUsd"];
  for (const key of moneyKeys) {
    for (const value of [-1, -0.01, 0.001, 1.005, 1.0000000000000002, 100_000_000.01, Number.NaN, Infinity, -Infinity, null, "10", true]) {
      assert.equal(tradingScenarioAssumptionsSchema.safeParse({ ...assumptions(), [key]: value }).success, false, `${key}: ${String(value)}`);
    }
  }
});

test("hold duration, probability and fee boundaries are explicit and not coercing", () => {
  for (const holdingMonths of [1, 12, 120]) assert.equal(tradingScenarioAssumptionsSchema.safeParse(assumptions({ holdingMonths })).success, true);
  for (const holdingMonths of [0, 121, 1.5, -1, NaN, Infinity, "12", null]) {
    assert.equal(tradingScenarioAssumptionsSchema.safeParse({ ...assumptions(), holdingMonths }).success, false);
  }
  for (const sellingFeePercent of [0, 1.5, 99]) assert.equal(tradingScenarioAssumptionsSchema.safeParse(assumptions({ sellingFeePercent })).success, true);
  for (const sellingFeePercent of [-1, 99.01, 100, NaN, Infinity, "10", null]) {
    assert.equal(tradingScenarioAssumptionsSchema.safeParse({ ...assumptions(), sellingFeePercent }).success, false);
  }
  for (const saleProbabilityPercent of [0, 0.5, 100]) assert.equal(tradingScenarioAssumptionsSchema.safeParse(assumptions({ saleProbabilityPercent })).success, true);
  for (const saleProbabilityPercent of [-1, 100.01, NaN, Infinity, "50", null]) {
    assert.equal(tradingScenarioAssumptionsSchema.safeParse({ ...assumptions(), saleProbabilityPercent }).success, false);
  }
});

test("sale outcomes are ordered bear <= base <= bull, allowing equal scenarios", () => {
  for (const values of [{ bearSaleUsd: 0, baseSaleUsd: 0, bullSaleUsd: 0 }, { bearSaleUsd: 100, baseSaleUsd: 100, bullSaleUsd: 100 }]) {
    assert.equal(tradingScenarioAssumptionsSchema.safeParse(assumptions(values)).success, true);
  }
  for (const values of [{ bearSaleUsd: 301 }, { baseSaleUsd: 601 }, { bullSaleUsd: 299 }]) {
    assert.equal(tradingScenarioAssumptionsSchema.safeParse(assumptions(values)).success, false);
  }
});

test("text is bounded, title meaningful, and optimistic concurrency version always required", () => {
  assert.equal(tradingScenarioInputSchema.parse(input({ title: "  Thesis  " })).title, "Thesis");
  assert.equal(tradingScenarioInputSchema.safeParse(input({ thesis: "", catalyst: "", invalidation: "" })).success, true);
  for (const changes of [{ title: " " }, { title: "a".repeat(101) }, { thesis: "a".repeat(2001) },
    { catalyst: "a".repeat(1001) }, { invalidation: "a".repeat(1001) }, { expectedVersion: -1 },
    { expectedVersion: 1.5 }, { expectedVersion: Number.MAX_SAFE_INTEGER + 1 }, { id: "not-an-id" }]) {
    assert.equal(tradingScenarioInputSchema.safeParse({ ...input(), ...changes }).success, false);
  }
  const { expectedVersion: _expectedVersion, ...missingVersion } = input();
  assert.equal(tradingScenarioInputSchema.safeParse(missingVersion).success, false);
  assert.equal(tradingScenarioInputSchema.safeParse(input({ expectedVersion: 2_147_483_646 })).success, true);
  assert.equal(tradingScenarioInputSchema.safeParse(input({ expectedVersion: 2_147_483_647 })).success, false);
});

test("malformed values, missing properties and unknown client claims are rejected at every boundary", () => {
  for (const value of [null, undefined, false, 1, "{}", [], {}, new Date()]) {
    assert.equal(tradingScenarioAssumptionsSchema.safeParse(value).success, false);
    assert.equal(tradingScenarioInputSchema.safeParse(value).success, false);
    assert.equal(tradingScenarioSchema.safeParse(value).success, false);
    assert.throws(() => evaluateTradingScenario(value as TradingScenarioAssumptions));
  }
  for (const key of Object.keys(input())) {
    const value: Record<string, unknown> = input(); delete value[key];
    assert.equal(tradingScenarioInputSchema.safeParse(value).success, false, `missing ${key}`);
    assert.equal(tradingScenarioInputSchema.safeParse({ ...input(), [key]: null }).success, false, `null ${key}`);
  }
  for (const key of Object.keys(assumptions())) {
    const value: Record<string, unknown> = assumptions(); delete value[key];
    assert.equal(tradingScenarioAssumptionsSchema.safeParse(value).success, false, `missing ${key}`);
  }
  assert.equal(tradingScenarioAssumptionsSchema.safeParse({ ...assumptions(), isVerified: true }).success, false);
  assert.equal(tradingScenarioInputSchema.safeParse({ ...input(), userId: "another-user" }).success, false);
  assert.equal(tradingScenarioInputSchema.safeParse({ ...input(), assumptions: { ...assumptions(), marketProbability: 99 } }).success, false);
  assert.equal(tradingScenarioSchema.safeParse({ ...saved(), guaranteedProfit: true }).success, false);
});

test("saved scenario metadata is server-owned, positive-versioned, UTC ISO and chronologically coherent", () => {
  assert.deepEqual(tradingScenarioSchema.parse(saved()), saved());
  for (const changes of [{ version: 0 }, { version: -1 }, { version: 1.5 }, { expectedVersion: 1 },
    { createdAt: "2030-01-01" }, { updatedAt: "2030-02-30T10:00:00.000Z" }, { updatedAt: "2029-12-31T10:00:00.000Z" },
    { updatedAt: "2030-01-01T10:00:00+00:00" }, { createdAt: null }]) {
    assert.equal(tradingScenarioSchema.safeParse({ ...saved(), ...changes }).success, false);
  }
});

test("PostgreSQL-safe text rejects NUL and lone surrogates while retaining multilingual text and emoji", () => {
  const unsupported = [String.fromCharCode(0), String.fromCharCode(0xd800), String.fromCharCode(0xdc00),
    String.fromCharCode(0xd800, 0x61), String.fromCharCode(0xd800, 0xd800), String.fromCharCode(0xdc00, 0xd800)];
  for (const field of ["title", "thesis", "catalyst", "invalidation"]) {
    for (const value of unsupported) {
      assert.equal(tradingScenarioInputSchema.safeParse({ ...input(), [field]: `text${value}text` }).success, false, field);
      assert.equal(tradingScenarioSchema.safeParse({ ...saved(), [field]: `text${value}text` }).success, false, field);
    }
    for (const value of ["Svenska åäö", "Français déjà", "中文名称", "عربي", "🎯🌍👩‍💻", "first\nsecond"]) {
      assert.equal(tradingScenarioInputSchema.safeParse({ ...input(), [field]: value }).success, true, value);
    }
  }
});

test("UUID normalization matches PostgreSQL uuid text and gives case-insensitive retries one identity", () => {
  const value = input({ id: input().id.toUpperCase() });
  assert.equal(tradingScenarioInputSchema.parse(value).id, input().id);
  assert.equal(tradingScenarioSchema.parse({ ...saved(), id: saved().id.toUpperCase() }).id, saved().id);
});

test("cash-flow arithmetic includes renewals, all costs, fees and the unsold outcome", () => {
  const result = evaluateTradingScenario(assumptions());
  assert.equal(result.totalCostUsd, 160);
  assert.equal(result.breakEvenSaleUsd, 177.78);
  assert.equal(result.probabilityAdjustedBreakEvenUsd, 355.56);
  assert.equal(result.noSaleCashflowUsd, -160);
  assert.deepEqual(result.cases, [
    { key: "bear", saleUsd: 80, netIfSoldUsd: -88, probabilityWeightedNetUsd: -124, roiIfSoldPercent: -55 },
    { key: "base", saleUsd: 300, netIfSoldUsd: 110, probabilityWeightedNetUsd: -25, roiIfSoldPercent: 68.75 },
    { key: "bull", saleUsd: 600, netIfSoldUsd: 380, probabilityWeightedNetUsd: 110, roiIfSoldPercent: 237.5 },
  ]);
  // A naive p × profit would say +55 for base. Cash spent when no sale occurs makes the result -25.
  assert.equal(result.cases[1].probabilityWeightedNetUsd, 0.5 * result.cases[1].netIfSoldUsd + 0.5 * result.noSaleCashflowUsd);
});

test("renewals occur on month 12, 24 etc., not continuously or before anniversaries", () => {
  for (let holdingMonths = 1; holdingMonths <= 120; holdingMonths++) {
    const result = evaluateTradingScenario(assumptions({ holdingMonths }));
    assert.equal(result.totalCostUsd, 120 + Math.floor(holdingMonths / 12) * 20, String(holdingMonths));
  }
  const result = evaluateTradingScenario(assumptions({ holdingMonths: 18 }));
  assert.deepEqual(result.sensitivity, [
    { holdingMonths: 6, totalCostUsd: 120, baseNetIfSoldUsd: 150 },
    { holdingMonths: 12, totalCostUsd: 140, baseNetIfSoldUsd: 130 },
    { holdingMonths: 18, totalCostUsd: 140, baseNetIfSoldUsd: 130 },
    { holdingMonths: 24, totalCostUsd: 160, baseNetIfSoldUsd: 110 },
    { holdingMonths: 36, totalCostUsd: 180, baseNetIfSoldUsd: 90 },
  ]);
  assert.deepEqual(evaluateTradingScenario(assumptions()).sensitivity.map(row => row.holdingMonths), [6, 12, 24, 36]);
});

test("zero sale probability retains every cost instead of inventing zero risk or residual asset value", () => {
  const result = evaluateTradingScenario(assumptions({ saleProbabilityPercent: 0 }));
  assert.equal(result.probabilityAdjustedBreakEvenUsd, null);
  for (const row of result.cases) assert.equal(row.probabilityWeightedNetUsd, -160);
  const certain = evaluateTradingScenario(assumptions({ saleProbabilityPercent: 100 }));
  assert.equal(certain.probabilityAdjustedBreakEvenUsd, certain.breakEvenSaleUsd);
  for (const row of certain.cases) assert.equal(row.probabilityWeightedNetUsd, row.netIfSoldUsd);
});

test("zero cost yields no fabricated ROI or negative zero and zero fees retain the sale proceeds", () => {
  const free = evaluateTradingScenario(assumptions({ acquisitionUsd: 0, annualRenewalUsd: 0, otherCostsUsd: 0, sellingFeePercent: 0 }));
  assert.equal(free.totalCostUsd, 0);
  assert.equal(free.noSaleCashflowUsd, 0);
  assert.equal(free.breakEvenSaleUsd, 0);
  assert.equal(free.probabilityAdjustedBreakEvenUsd, 0);
  for (const row of free.cases) {
    assert.equal(row.roiIfSoldPercent, null);
    assert.equal(row.netIfSoldUsd, row.saleUsd);
    assert.equal(row.probabilityWeightedNetUsd, row.saleUsd * 0.5);
  }
  const ninetyNine = evaluateTradingScenario(assumptions({ sellingFeePercent: 99 }));
  assert.equal(ninetyNine.breakEvenSaleUsd, 16_000);
  assert.equal(ninetyNine.cases[1].netIfSoldUsd, -157);
});

test("cents are accumulated exactly before the final fee, cash-flow and ROI rounding", () => {
  const result = evaluateTradingScenario(assumptions({ acquisitionUsd: 0.1, annualRenewalUsd: 0.29, otherCostsUsd: 0.07,
    holdingMonths: 12, bearSaleUsd: 0.59, baseSaleUsd: 0.59, bullSaleUsd: 0.59 }));
  assert.equal(result.totalCostUsd, 0.46);
  assert.equal(result.breakEvenSaleUsd, 0.51);
  assert.equal(result.probabilityAdjustedBreakEvenUsd, 1.02);
  for (const row of result.cases) {
    assert.equal(row.netIfSoldUsd, 0.07);
    assert.equal(row.probabilityWeightedNetUsd, -0.19);
    assert.equal(row.roiIfSoldPercent, 15.43);
  }
});

test("maximum admitted costs and infinitesimal probabilities never produce NaN or Infinity", () => {
  const max = assumptions({ acquisitionUsd: 100_000_000, annualRenewalUsd: 100_000_000, otherCostsUsd: 100_000_000,
    holdingMonths: 120, sellingFeePercent: 99, bearSaleUsd: 100_000_000, baseSaleUsd: 100_000_000, bullSaleUsd: 100_000_000 });
  const output = evaluateTradingScenario(max);
  assert.equal(output.totalCostUsd, 1_200_000_000);
  assert.equal(output.breakEvenSaleUsd, 120_000_000_000);
  assert.equal(output.cases[0].netIfSoldUsd, -1_199_000_000);
  for (const saleProbabilityPercent of [Number.MIN_VALUE, 1e-300, 1e-100, 0, 100]) {
    const result = evaluateTradingScenario({ ...max, saleProbabilityPercent });
    const visit = (value: unknown): void => {
      if (typeof value === "number") assert.equal(Number.isFinite(value), true);
      else if (value && typeof value === "object") Object.values(value).forEach(visit);
    };
    visit(result);
  }
});

test("half-cent cash-flow ties round symmetrically and do not erase a loss", () => {
  const value = assumptions({ acquisitionUsd: 0.01, annualRenewalUsd: 0, otherCostsUsd: 0,
    holdingMonths: 1, sellingFeePercent: 0, saleProbabilityPercent: 50,
    bearSaleUsd: 0.01, baseSaleUsd: 0.01, bullSaleUsd: 0.03 });
  const result = evaluateTradingScenario(value);
  assert.equal(result.cases[0].probabilityWeightedNetUsd, -0.01);
  assert.equal(result.cases[2].probabilityWeightedNetUsd, 0.01);
});

test("base-10 fee and probability ties do not round down because of binary floating point", () => {
  for (const [saleUsd, sellingFeePercent, expected] of [[0.75, 18, 0.62], [0.45, 30, 0.32], [0.25, 42, 0.15], [10.75, 6, 10.11]]) {
    const result = evaluateTradingScenario(assumptions({ acquisitionUsd: 0, annualRenewalUsd: 0, otherCostsUsd: 0,
      sellingFeePercent, saleProbabilityPercent: 100, bearSaleUsd: saleUsd, baseSaleUsd: saleUsd, bullSaleUsd: saleUsd }));
    assert.equal(result.cases[0].netIfSoldUsd, expected);
    assert.equal(result.cases[0].probabilityWeightedNetUsd, expected);
  }
  const chance = evaluateTradingScenario(assumptions({ acquisitionUsd: 0, annualRenewalUsd: 0, otherCostsUsd: 0,
    sellingFeePercent: 0, saleProbabilityPercent: 82, bearSaleUsd: 0.75, baseSaleUsd: 0.75, bullSaleUsd: 0.75 }));
  assert.equal(chance.cases[0].probabilityWeightedNetUsd, 0.62);
});

test("500 deterministic fee/probability/cost combinations match exact integer reference cash flows", () => {
  let seed = 0x53414a44;
  const next = () => { seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0; return seed; };
  const rounded = (numerator: bigint, denominator: bigint) => {
    const absolute = numerator < 0n ? -numerator : numerator;
    const units = (absolute * 2n + denominator) / (denominator * 2n);
    return Number(numerator < 0n ? -units : units) / 100;
  };
  for (let index = 0; index < 500; index++) {
    const acquisition = next() % 1_000_000_000, renewal = next() % 100_000, other = next() % 100_000;
    const sale = next() % 1_000_000_000, feeBps = next() % 9901, probabilityBps = next() % 10001, holdingMonths = next() % 120 + 1;
    const total = BigInt(acquisition + other + renewal * Math.floor(holdingMonths / 12));
    const proceeds = BigInt(sale) * BigInt(10_000 - feeBps);
    const result = evaluateTradingScenario(assumptions({ acquisitionUsd: acquisition / 100, annualRenewalUsd: renewal / 100,
      otherCostsUsd: other / 100, holdingMonths, sellingFeePercent: feeBps / 100, saleProbabilityPercent: probabilityBps / 100,
      bearSaleUsd: sale / 100, baseSaleUsd: sale / 100, bullSaleUsd: sale / 100 }));
    assert.equal(result.totalCostUsd, Number(total) / 100);
    assert.equal(result.cases[0].netIfSoldUsd, rounded(proceeds - total * 10_000n, 10_000n), `net case ${index}`);
    assert.equal(result.cases[0].probabilityWeightedNetUsd, rounded(proceeds * BigInt(probabilityBps) - total * 100_000_000n, 100_000_000n), `weighted case ${index}`);
  }
});

test("evaluation is deterministic, does not mutate hypotheses, and performs no inferred market analysis", () => {
  const value = Object.freeze(assumptions());
  const before = JSON.stringify(value);
  assert.deepEqual(evaluateTradingScenario(value), evaluateTradingScenario(value));
  assert.equal(JSON.stringify(value), before);
  assert.deepEqual(Object.keys(evaluateTradingScenario(value)).sort(), ["breakEvenSaleUsd", "cases", "noSaleCashflowUsd",
    "probabilityAdjustedBreakEvenUsd", "sensitivity", "totalCostUsd"]);
});
