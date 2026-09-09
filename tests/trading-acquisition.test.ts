import assert from "node:assert/strict";
import test from "node:test";
import { evaluateTradingAcquisition, isTradingAcquisition, TRADING_ACQUISITION_GATES, TRADING_ACQUISITION_FRESHNESS_MS,
  type TradingAcquisitionInput, type TradingExactQuoteEvidence, type TradingValuationReviewEvidence } from "../shared/trading-acquisition";

const now = Date.UTC(2030, 0, 20, 12);
const iso = (offset = 0) => new Date(now + offset).toISOString();
/** Synthetic test evidence only. These are not real quotes, sales, or rights clearances. */
function complete(): TradingAcquisitionInput {
  const observation = { domain: "cloudtools.com", sourceUrl: "https://porkbun.com/fixture-evidence", checkedAt: iso(-60_000), expiresAt: iso(60_000) };
  const included = { treatment: "included" as const, initialMinor: 0, renewalMinor: 0 };
  const review = { ...observation, method: "documented_review" as const, reviewId: "fixture-review", status: "no_material_flags_identified" as const,
    evidenceUrls: ["https://www.sec.gov/fixture-source"] };
  return { domain: "cloudtools.com", registrability: { ...observation, providerId: "porkbun", method: "official_registrar_api", status: "available" },
    quote: { ...observation, providerId: "porkbun", method: "official_registrar_api", quoteId: "fixture-quote", scope: "exact_domain", currency: "USD",
      acquisitionMinor: 1000, renewalMinor: 1500, initialTermYears: 1, renewalTermYears: 1,
      fees: { treatment: "specified", initialMinor: 20, renewalMinor: 20 }, tax: included, mandatoryAddOns: included },
    history: review, rights: { ...review, intendedUse: "Independent cloud software comparison", jurisdictions: ["US", "SE"] },
    valuation: { ...observation, reviewId: "fixture-comparable-review", method: "documented_comparable_review", currency: "USD", lowerMinor: 20_000, upperMinor: 40_000,
      rationale: "Synthetic reviewed comparable rationale used only for deterministic unit testing.",
      comparables: ["cloudboxes.com", "cloudtasks.com", "cloudlists.com"].map((domain, index) => ({ domain, currency: "USD" as const,
        amountMinor: 25_000 + 1000 * index, soldAt: iso(-86_400_000 * (index + 1)),
        sourceUrl: `https://${index === 0 ? "www.sec.gov" : "sedo.com"}/fixture-sale-${index}`,
        sourceKind: "primary_public_filing" as const, comparability: "reviewed_comparable" as const })) } };
}
const evaluate = (input: TradingAcquisitionInput) => {
  const output = evaluateTradingAcquisition(input, now);
  assert.equal(isTradingAcquisition(output), true, JSON.stringify(output));
  return output;
};

test("absence, lexical quality, and historic crawl data alone never become a buying signal", () => {
  const result = evaluate({ domain: "cloudtools.com" });
  assert.equal(result.status, "research_only");
  assert.equal(result.priceSignal, "none");
  assert.equal(result.readyForAcquisitionReview, false);
  assert.deepEqual(result.missingChecks, TRADING_ACQUISITION_GATES);
  assert.deepEqual(result.totalCostScenarios, []);
  assert.equal(result.comparison, null);
  assert.equal(result.requiresHumanConfirmation, true);
});

test("complete reviewed evidence produces a conditional price signal, not an automatic purchase", () => {
  const result = evaluate(complete());
  assert.equal(result.status, "acquisition_review_ready");
  assert.equal(result.priceSignal, "below_reviewed_range");
  assert.equal(result.readyForAcquisitionReview, true);
  assert.deepEqual(result.missingChecks, []);
  assert.equal(result.comparison?.threeYearCostMinor, 4060);
  assert.equal(result.comparison?.differenceToLowerMinor, 15_940);
  assert.equal(result.comparison?.basis, "reviewed_range_not_sale_guarantee");
  assert.deepEqual(result.totalCostScenarios.map(item => item.totalMinor), [1020, 4060, 7100]);
  assert.deepEqual(result.reasons, ["manual_purchase_confirmation_required"]);
});

test("published TLD prices cannot be promoted to an exact-domain quote even with other good evidence", () => {
  const input = complete(); input.quote!.scope = "standard_tld";
  const result = evaluate(input);
  assert.equal(result.gates.exact_quote, false);
  assert.equal(result.readyForAcquisitionReview, false);
  assert.equal(result.priceSignal, "none");
  assert.equal(result.reasons.includes("standard_tld_price_only"), true);
  assert.deepEqual(result.totalCostScenarios, []);
});

test("an exact price without an exact current registrar confirmation remains diligence-only", () => {
  const input = complete(); delete input.registrability;
  const result = evaluate(input);
  assert.equal(result.status, "due_diligence_required");
  assert.equal(result.gates.exact_quote, true);
  assert.equal(result.gates.registrability, false);
  assert.equal(result.priceSignal, "none");
  assert.equal(result.totalCostScenarios.length, 3);
});

test("exact domain and provider identities cannot be mixed between unrelated observations", () => {
  for (const key of ["registrability", "quote", "history", "rights", "valuation"] as const) {
    const input = complete(); input[key]!.domain = "othertools.com";
    const result = evaluate(input);
    assert.equal(result.readyForAcquisitionReview, false, key);
    assert.equal(result.priceSignal, "none", key);
  }
  const input = complete(); input.registrability!.providerId = "different-provider";
  const result = evaluate(input);
  assert.equal(result.gates.exact_quote, false);
  assert.equal(result.reasons.includes("provider_identity_mismatch"), true);
});

test("unknown renewal, taxes, mandatory charges, or addon obligations prohibit total-cost claims", () => {
  for (const field of ["renewalMinor", "fees", "tax", "mandatoryAddOns"] as const) {
    const input = complete();
    if (field === "renewalMinor") input.quote!.renewalMinor = null;
    else input.quote![field] = { treatment: "unknown", initialMinor: null, renewalMinor: null };
    const result = evaluate(input);
    assert.equal(result.readyForAcquisitionReview, false, field);
    assert.deepEqual(result.totalCostScenarios, [], field);
    assert.equal(result.comparison, null, field);
    assert.equal(result.priceSignal, "none", field);
  }
  const input = complete(); input.quote!.fees = { treatment: "included", initialMinor: 25, renewalMinor: 25 };
  assert.equal(evaluate(input).gates.fees, false, "included fees cannot be double counted as separate charges");
});

test("cost scenarios include minimum multi-year commitments and round complete renewal terms", () => {
  const input = complete();
  input.quote!.initialTermYears = 2; input.quote!.renewalTermYears = 2;
  input.quote!.acquisitionMinor = 20_000; input.quote!.renewalMinor = 24_000;
  input.quote!.fees = { treatment: "specified", initialMinor: 50, renewalMinor: 75 };
  input.quote!.tax = { treatment: "specified", initialMinor: 5000, renewalMinor: 6000 };
  input.quote!.mandatoryAddOns = { treatment: "specified", initialMinor: 1000, renewalMinor: 2000 };
  const result = evaluate(input);
  assert.deepEqual(result.totalCostScenarios.map(item => [item.years, item.coveredYears, item.renewalCycles, item.totalMinor]),
    [[1, 2, 0, 26_050], [3, 4, 1, 58_125], [5, 6, 2, 90_200]]);
  assert.equal(result.priceSignal, "not_below_reviewed_range");
  assert.equal(result.comparison?.differenceToLowerMinor, -38_125);
  assert.ok(result.totalCostScenarios.every(item => item.basis === "current_price_scenario"));
});

test("currency mismatch never uses an implicit exchange rate or becomes a bargain", () => {
  const input = complete(); input.quote!.currency = "SEK";
  const result = evaluate(input);
  assert.equal(result.gates.valuation, false);
  assert.equal(result.reasons.includes("valuation_currency_mismatch"), true);
  assert.equal(result.comparison, null);
  assert.ok(result.totalCostScenarios.every(item => item.currency === "SEK"));
});

test("each evidence layer has an independent deadline and future timestamps fail closed", () => {
  for (const field of ["registrability", "quote", "history", "rights", "valuation"] as const) {
    for (const change of ["old", "expired", "future"] as const) {
      const input = complete(), item = input[field]!;
      if (change === "old") item.checkedAt = iso(-TRADING_ACQUISITION_FRESHNESS_MS[field] - 1);
      if (change === "expired") item.expiresAt = iso();
      if (change === "future") item.checkedAt = iso(1);
      const result = evaluate(input);
      assert.equal(result.readyForAcquisitionReview, false, `${field} ${change}`);
      assert.equal(result.priceSignal, "none", `${field} ${change}`);
    }
  }
});

test("re-reading near quote expiry cannot extend acquisition validity", () => {
  const input = complete();
  input.quote!.checkedAt = iso(-4 * 60_000); input.quote!.expiresAt = iso(10 * 60_000);
  const first = evaluateTradingAcquisition(input, now), later = evaluateTradingAcquisition(input, now + 30_000);
  assert.equal(first.validUntil, iso(60_000));
  assert.equal(later.validUntil, first.validUntil);
  assert.equal(isTradingAcquisition(first), true); assert.equal(isTradingAcquisition(later), true);
  assert.equal(evaluateTradingAcquisition(input, now + 60_000).readyForAcquisitionReview, false);
  assert.equal(evaluateTradingAcquisition(input, now + 60_000).validUntil, null);
  assert.equal(isTradingAcquisition({ ...first, validUntil: iso(-1) }), false);
  assert.equal(isTradingAcquisition({ ...first, validUntil: null }), false);
});

test("exact policy-age deadlines fail closed even when provider expirations remain later", () => {
  for (const field of ["registrability", "quote", "history", "rights", "valuation"] as const) {
    const input = complete();
    input[field]!.checkedAt = iso(-TRADING_ACQUISITION_FRESHNESS_MS[field]);
    input[field]!.expiresAt = iso(60_000);
    if (field === "valuation") input.valuation!.comparables.forEach((comp, index) => {
      comp.soldAt = iso(-TRADING_ACQUISITION_FRESHNESS_MS.valuation - (index + 1) * 86_400_000);
    });
    const before = evaluateTradingAcquisition(input, now - 1);
    assert.equal(before.readyForAcquisitionReview, true, `${field} before deadline`);
    assert.equal(before.validUntil, iso(), field);
    assert.equal(isTradingAcquisition(before), true, field);
    const boundary = evaluate(input);
    assert.equal(boundary.readyForAcquisitionReview, false, `${field} exact deadline`);
    assert.equal(boundary.validUntil, null, field);
    assert.equal(boundary.priceSignal, "none", field);
  }
  const input = complete();
  input.valuation!.comparables[0].soldAt = iso(-TRADING_ACQUISITION_FRESHNESS_MS.comparable);
  const before = evaluateTradingAcquisition(input, now - 1);
  assert.equal(before.readyForAcquisitionReview, true);
  assert.equal(before.validUntil, iso());
  assert.equal(isTradingAcquisition(before), true);
  const boundary = evaluate(input);
  assert.equal(boundary.gates.valuation, false);
  assert.equal(boundary.validUntil, null);
  assert.equal(boundary.priceSignal, "none");
});

test("known exclusion, unavailable registrar, or documented historical rights risks cannot be rescued by price", () => {
  const technical = evaluate({ ...complete(), excluded: true });
  assert.equal(technical.status, "excluded");
  for (const field of ["registrability", "history", "rights"] as const) {
    const input = complete();
    if (field === "registrability") input.registrability!.status = "unavailable";
    else { input[field]!.status = "risk_identified"; input[field]!.expiresAt = iso(-1); }
    const result = evaluate(input);
    assert.equal(result.status, "excluded", field);
    assert.equal(result.priceSignal, "none", field);
  }
});

test("old reported sales, duplicated comparables, single publishers and unsourced appraisals fail the valuation gate", () => {
  const changes: Array<(valuation: TradingValuationReviewEvidence) => void> = [
    valuation => { valuation.lowerMinor = valuation.upperMinor + 1; },
    valuation => { valuation.comparables[0].soldAt = iso(1); },
    valuation => { valuation.comparables[0].soldAt = iso(-TRADING_ACQUISITION_FRESHNESS_MS.comparable - 1); },
    valuation => { valuation.comparables[0].domain = valuation.comparables[1].domain; },
    valuation => { valuation.comparables[0].domain = valuation.domain; },
    valuation => { valuation.comparables.forEach(comp => { comp.sourceUrl = "https://news.sedo.com/one-owner"; }); },
    valuation => { valuation.comparables[0].currency = "SEK"; },
    valuation => { valuation.comparables = []; },
    valuation => { valuation.rationale = "AI says good"; },
  ];
  for (const change of changes) {
    const input = complete(); change(input.valuation!);
    const result = evaluate(input);
    assert.equal(result.gates.valuation, false);
    assert.equal(result.priceSignal, "none");
  }
});

test("history observations and registry data are not substitutes for rights and history reviews", () => {
  for (const field of ["history", "rights"] as const) {
    const input = complete(); delete input[field];
    assert.equal(evaluate(input).gates[field], false);
  }
  const input = complete(); input.history = { source: "common_crawl", priorExistence: true } as never;
  input.registrability = { status: "registry_not_found", confirmedRegistrable: false } as never;
  const result = evaluate(input);
  assert.equal(result.gates.history, false);
  assert.equal(result.gates.registrability, false);
});

test("malformed values, arbitrary URLs, unknown currency and naked provider flags fail closed", () => {
  const changes: Array<(quote: TradingExactQuoteEvidence) => void> = [
    quote => { quote.acquisitionMinor = -1; },
    quote => { quote.acquisitionMinor = 1.5; },
    quote => { quote.acquisitionMinor = Number.POSITIVE_INFINITY; },
    quote => { quote.acquisitionMinor = 100_000_000_001; },
    quote => { quote.currency = "XYZ" as never; },
    quote => { quote.currency = "JPY" as never; },
    quote => { quote.sourceUrl = "http://porkbun.com/price"; },
    quote => { quote.sourceUrl = "https://127.0.0.1/price"; },
    quote => { quote.sourceUrl = "https://user:password@porkbun.com/price"; },
    quote => { quote.sourceUrl = "https://porkbun.com:444/price"; },
    quote => { quote.sourceUrl = "javascript:alert(1)"; },
    quote => { quote.checkedAt = "yesterday"; },
    quote => { quote.initialTermYears = 0; },
    quote => { quote.renewalTermYears = 0; },
  ];
  for (const change of changes) {
    const input = complete(); change(input.quote!);
    const result = evaluate(input);
    assert.equal(result.gates.exact_quote, false);
    assert.equal(result.priceSignal, "none");
  }
  const input = complete(); input.quote = { priceVerified: true, priceScope: "exact_domain_offer", registrationPrice: 9 } as never;
  assert.equal(evaluate(input).gates.exact_quote, false);
});

test("canonical domains normalize benign formatting and exclude unsupported identities", () => {
  assert.deepEqual(evaluateTradingAcquisition({ domain: " CLOUDTOOLS.COM. " }, now), evaluateTradingAcquisition({ domain: "cloudtools.com" }, now));
  for (const domain of ["", "https://cloudtools.com/", "www.cloudtools.com", "cloudtools.blogspot.com", "cloudtools.invalid", "localhost", "127.0.0.1", "xn--hlsa-loa.se", "hälsa.se", "-cloudtools.com", "cloudtools-.com", "a".repeat(64) + ".com"]) {
    const result = evaluate({ domain });
    assert.equal(result.status, "excluded", domain);
    assert.equal(result.domain, "", domain);
    assert.equal(result.priceSignal, "none", domain);
  }
  assert.throws(() => evaluateTradingAcquisition({ domain: "cloudtools.com" }, Number.NaN), RangeError);
});

test("the result transport rejects forged signal state, inconsistent sums, unknown fields and incomplete gates", () => {
  const result = evaluate(complete());
  const invalid = [null, {}, { ...result, version: 2 }, { ...result, requiresHumanConfirmation: false },
    { ...result, readyForAcquisitionReview: false }, { ...result, predictedRoi: 1000 }, { ...result, priceSignal: "guaranteed_profit" },
    { ...result, missingChecks: ["valuation"] }, { ...result, reasons: [] },
    { ...result, gates: { ...result.gates, rights: false } }, { ...result, comparison: { ...result.comparison!, differenceToLowerMinor: 1 } },
    { ...result, comparison: null }, { ...result, totalCostScenarios: [] },
    { ...result, totalCostScenarios: result.totalCostScenarios.map(item => ({ ...item, currency: item.years === 3 ? "SEK" : "USD" })) }];
  for (const value of invalid) assert.equal(isTradingAcquisition(value), false, JSON.stringify(value));
  const research = evaluate({ domain: "cloudtools.com" });
  assert.equal(isTradingAcquisition({ ...research, priceSignal: "below_reviewed_range" }), false);
});
