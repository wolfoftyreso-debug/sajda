import assert from "node:assert/strict";
import test from "node:test";
import { analyzeTradingMarketFit, isTradingMarketFit, TRADING_MARKET_FIT_WEIGHTS } from "../shared/trading-market-fit";

test("clear commercial words and coherent English/Swedish compounds outrank invented syllables", () => {
  const clear = ["insurance.com", "cloudbilling.com", "solarpanel.com", "solenergi.se", "bostad.se", "gronenergi.se", "matguiden.se"];
  const coined = ["zovalu.com", "qevori.com", "xuvexa.com", "qzxvbn.com", "xxxyyy.com", "fexicloud.com"];
  for (const domain of clear) {
    const result = analyzeTradingMarketFit(domain);
    assert.equal(result.tier, "strong", `${domain}: ${JSON.stringify(result)}`);
    assert.ok(result.buyerUseCases.length > 0);
    for (const random of coined) assert.ok(result.score >= analyzeTradingMarketFit(random).score + 45, `${domain} vs ${random}`);
  }
  for (const domain of coined) {
    const result = analyzeTradingMarketFit(domain);
    assert.equal(result.tier, "weak");
    assert.ok(result.score < 30);
    assert.deepEqual(result.buyerUseCases, []);
    assert.ok(result.reasons.includes("no_curated_meaning"));
  }
});

test("semantic compatibility matters more than gluing dictionary words together", () => {
  const coherent = analyzeTradingMarketFit("cloudbilling.com");
  assert.deepEqual(coherent.tokens, ["cloud", "billing"]);
  assert.deepEqual(coherent.sectors, ["software"]);
  assert.deepEqual(coherent.buyerUseCases, ["software_product"]);
  for (const domain of ["coffeemortgage.com", "foodloan.com", "bankbank.com", "loanloans.com", "booksbook.com", "solsolar.com", "cloudgreen.com"]) {
    const result = analyzeTradingMarketFit(domain);
    assert.equal(result.pattern, "compound");
    assert.equal(result.tier, "weak");
    assert.deepEqual(result.sectors, []);
    assert.ok(result.reasons.includes("unrelated_word_pair"));
  }
  assert.ok(analyzeTradingMarketFit("solsolar.com").reasons.includes("mixed_language_pair"));
  assert.ok(analyzeTradingMarketFit("bankbank.com").reasons.includes("repeated_word"));
  assert.equal(analyzeTradingMarketFit("green.com").tier, "plausible");
  assert.deepEqual(analyzeTradingMarketFit("green.com").buyerUseCases, []);
});

test("extension fit is explicit and relative to a supported language or sector", () => {
  const cloud = analyzeTradingMarketFit("cloud.dev"), food = analyzeTradingMarketFit("coffee.dev");
  assert.equal(cloud.breakdown.tldFit, 13);
  assert.equal(food.breakdown.tldFit, 4);
  assert.ok(cloud.reasons.includes("sector_extension_fit"));
  assert.ok(food.reasons.includes("extension_fit_unestablished"));
  assert.equal(analyzeTradingMarketFit("bostad.se").breakdown.tldFit, 15);
  assert.equal(analyzeTradingMarketFit("property.se").breakdown.tldFit, 4);
  assert.equal(analyzeTradingMarketFit("coffee.co.uk").tokens[0], "coffee");
  assert.equal(analyzeTradingMarketFit("cloud.net").breakdown.tldFit, 10);
});

test("typos, digits, excessive length and hyphens reduce research priority transparently", () => {
  const clean = analyzeTradingMarketFit("cloudbilling.com"), hyphen = analyzeTradingMarketFit("cloud-billing.com");
  assert.ok(hyphen.score < clean.score);
  assert.ok(hyphen.reasons.includes("hyphen_present"));
  for (const domain of ["insuracne.com", "insurannce.com", "insuranc.com", "insurence.com"]) {
    const result = analyzeTradingMarketFit(domain);
    assert.equal(result.tier, "weak");
    assert.ok(result.reasons.includes("possible_dictionary_typo"), domain);
  }
  assert.ok(analyzeTradingMarketFit("cloud123.com").reasons.includes("digits_present"));
  assert.ok(analyzeTradingMarketFit("cloudcloudcloudcloud.com").reasons.includes("long_label"));
  assert.ok(analyzeTradingMarketFit("zooooooo.com").reasons.includes("repeated_characters"));
  assert.equal(analyzeTradingMarketFit("zovalu.com").breakdown.meaning, 0);
  assert.equal(analyzeTradingMarketFit("fexicloud.com").breakdown.commercial, 0);
  assert.ok(analyzeTradingMarketFit("fexicloud.com").reasons.includes("partial_word_only"));
});

test("domain parsing normalizes case and root dots but does not score URLs, subdomains or private suffixes", () => {
  assert.deepEqual(analyzeTradingMarketFit(" CLOUD.COM. "), analyzeTradingMarketFit("cloud.com"));
  for (const domain of ["", "localhost", "127.0.0.1", "https://cloud.com/", "www.cloud.com", "coffee.blogspot.com", "coffee.invalid", "-cloud.com", "cloud-.com", "cloud..com", "a".repeat(64) + ".com", "<script>.com", "hälsa.se"]) {
    const result = analyzeTradingMarketFit(domain);
    assert.equal(result.score, 0, domain);
    assert.equal(result.tier, "unrated", domain);
    assert.equal(result.pattern, "unsupported", domain);
    assert.equal(isTradingMarketFit(result), true, domain);
  }
  const idn = analyzeTradingMarketFit("xn--hlsa-loa.se");
  assert.equal(idn.tier, "unrated");
  assert.ok(idn.reasons.includes("internationalized_label_requires_review"));
  assert.equal(isTradingMarketFit(idn), true);
});

test("all points are reproducible and independent of availability, invented demand or price", () => {
  const domains = ["insurance.com", "cloudbilling.com", "green.com", "bostad.se", "qzxvbn.com", "coffeemortgage.com", "cloud-billing.com", "127.0.0.1"];
  for (const domain of domains) {
    const result = analyzeTradingMarketFit(domain);
    assert.equal(isTradingMarketFit(result), true);
    assert.deepEqual(result, analyzeTradingMarketFit(domain));
    for (const [dimension, max] of Object.entries(TRADING_MARKET_FIT_WEIGHTS)) {
      const points = result.breakdown[dimension as keyof typeof TRADING_MARKET_FIT_WEIGHTS];
      assert.ok(Number.isInteger(points) && points >= 0 && points <= max);
    }
    assert.equal(result.score, Math.max(0, result.breakdown.meaning + result.breakdown.commercial + result.breakdown.readability + result.breakdown.tldFit - result.breakdown.penalties));
    assert.ok(result.reasons.includes("heuristic_not_market_demand"));
    assert.doesNotMatch(JSON.stringify(result), /valuation|market_value|expected_roi|confirmed_available|verified_buyers/u);
  }
});

test("strict boundary rejects forged scores, copy, sectors, arrays, extensions and unknown fields", () => {
  const valid = analyzeTradingMarketFit("cloudbilling.com");
  for (const changed of [null, [], {}, { ...valid, version: 2 }, { ...valid, methodology: "ai-appraisal" },
    { ...valid, score: 100 }, { ...valid, score: NaN }, { ...valid, score: "93" }, { ...valid, domain: "zovalu.com" },
    { ...valid, tier: "weak" }, { ...valid, tokens: ["cloudbilling"] }, { ...valid, language: "sv" },
    { ...valid, pattern: "dictionary" }, { ...valid, sectors: ["finance"] }, { ...valid, buyerUseCases: ["verified_buyer"] },
    { ...valid, reasons: [...valid.reasons, "high_roi"] }, { ...valid, reasons: ["<script>"] },
    { ...valid, estimatedPrice: 5000 }, { ...valid, breakdown: { ...valid.breakdown, price: 3 } },
    { ...valid, breakdown: { ...valid.breakdown, penalties: -1 } },
    { ...valid, breakdown: { ...valid.breakdown, meaning: 40 }, score: valid.score + 4 },
  ]) assert.equal(isTradingMarketFit(changed), false, JSON.stringify(changed));
  assert.equal(isTradingMarketFit({ ...valid, reasons: [...valid.reasons, valid.reasons[0]] }), false);
  assert.equal(isTradingMarketFit({ ...valid, breakdown: { tldFit: valid.breakdown.tldFit, readability: valid.breakdown.readability,
    penalties: valid.breakdown.penalties, commercial: valid.breakdown.commercial, meaning: valid.breakdown.meaning } }), true);
});
