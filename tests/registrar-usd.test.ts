import assert from "node:assert/strict";
import test from "node:test";
import { REFERENCE_FX_SOURCE, REFERENCE_FX_SOURCE_URL, type ReferenceFx } from "../shared/reference-fx";
import { formatRegistrarOfferPrice, formatRegistrarPrice, getRegistrarFxDisclosure, getRegistrationPrice, getRegistrarOfferTerms, normaliseRegistrarOffer, type RegistrarDisplayLanguage } from "../src/lib/registrarOffer";

function referenceFx(): ReferenceFx {
  const now = new Date();
  return { source: REFERENCE_FX_SOURCE, sourceUrl: REFERENCE_FX_SOURCE_URL, fetchedAt: now.toISOString(),
    rates: { SEK: { usdPerUnit: 0.1, date: now.toISOString().slice(0, 10) }, EUR: { usdPerUnit: 1.25, date: now.toISOString().slice(0, 10) } } };
}
function offer(overrides = {}) {
  return { providerId: "porkbun", registrar: "Porkbun", purchaseUrl: "https://porkbun.com/products/domains",
    priceSourceUrl: "https://porkbun.com/products/domains", currency: "USD", registrationPrice: 11.06,
    renewalPrice: 11.06, taxTreatment: "unknown", priceScope: "standard_tld", priceVerified: true,
    dataSource: "official_provider_api", checkedAt: new Date().toISOString(), ...overrides };
}

test("every supported language compares SEK/EUR in actual USD while preserving native and dated disclosure", () => {
  const fx = referenceFx();
  for (const language of ["en", "sv", "es", "fr", "zh"] as RegistrarDisplayLanguage[]) {
    assert.match(formatRegistrarOfferPrice(100, "SEK", language, fx), /^≈ \$10[.,]00 USD\//);
    assert.match(formatRegistrarOfferPrice(10, "EUR", language, fx), /^≈ \$12[.,]50 USD\//);
    assert.match(formatRegistrarOfferPrice(11.06, "USD", language, fx), /^\$11[.,]06 USD\//);
    const disclosure = getRegistrarFxDisclosure(100, "SEK", language, fx)!;
    assert.ok(disclosure.includes(formatRegistrarPrice(100, "SEK", language)));
    assert.ok(disclosure.includes(fx.rates.SEK.date));
    assert.ok(disclosure.includes("ECB via Frankfurter"));
    assert.equal(getRegistrarFxDisclosure(11.06, "USD", language, fx), null);
  }
});

test("unsupported, missing and stale FX retains native amounts and explicitly says conversion is unavailable", () => {
  const expired = { ...referenceFx(), fetchedAt: "2020-01-01T00:00:00Z" };
  for (const fx of [undefined, null, expired]) {
    for (const language of ["en", "sv", "es", "fr", "zh"] as RegistrarDisplayLanguage[]) {
      assert.equal(formatRegistrarOfferPrice(100, "SEK", language, fx), formatRegistrarPrice(100, "SEK", language));
      assert.ok(getRegistrarFxDisclosure(100, "SEK", language, fx)?.includes("USD") || language === "zh");
    }
  }
  assert.equal(formatRegistrarOfferPrice(100, "BRL", "en", referenceFx()), formatRegistrarPrice(100, "BRL", "en"));
  assert.match(getRegistrarFxDisclosure(100, "BRL", "en", referenceFx())!, /unavailable/);
});

test("published USD prices retain exact-versus-extension scope and unknown taxes", () => {
  const normalized = normaliseRegistrarOffer("example.com", offer());
  assert.equal(normalized.currency, "USD");
  assert.equal(normalized.registrationPrice, 11.06);
  assert.equal(normalized.priceScope, "standard_tld");
  assert.deepEqual(getRegistrationPrice(normalized), { amount: 11.06, taxTreatment: "unknown" });
  assert.match(getRegistrarOfferTerms(normalized), /Published extension price/);
  assert.match(getRegistrarOfferTerms(normalized), /Tax treatment unspecified/);
  assert.doesNotMatch(getRegistrarOfferTerms(normaliseRegistrarOffer("example.com", offer({ priceScope: "exact_domain_offer" }))), /Published extension/);
});

test("invalid seller links repair to the named seller, never Loopia; unknown seller has no invented link", () => {
  for (const purchaseUrl of ["javascript:alert(1)", "http://porkbun.com", "https://www.loopia.se/domannamn/", "https://evil.test", "https://user:password@porkbun.com/"]) {
    const normalized = normaliseRegistrarOffer("example.com", offer({ purchaseUrl }));
    assert.equal(normalized.registrar, "Porkbun");
    assert.equal(normalized.purchaseUrl, "https://porkbun.com/products/domains");
    assert.equal(normalized.priceVerified, false);
  }
  const known = normaliseRegistrarOffer("example.com", offer({ purchaseUrl: "", priceSourceUrl: "" }));
  assert.equal(known.priceSourceUrl, "https://porkbun.com/products/domains");
  const unknown = normaliseRegistrarOffer("example.com", { registrar: "Another provider", purchaseUrl: "invalid" });
  assert.equal(unknown.purchaseUrl, "");
  assert.equal(unknown.priceSourceUrl, "");
  assert.equal(unknown.registrar, "Another provider");
  assert.equal(normaliseRegistrarOffer("example.com", offer({ currency: undefined })).priceVerified, false);
});
