import test from "node:test";
import assert from "node:assert/strict";
import { readSearchSession, writeSearchSession } from "../src/lib/searchSession";
import type { DiscoveredDomain } from "../src/contexts/ScanContext";

const values = new Map<string, string>();
Object.defineProperty(globalThis, "window", { value: { sessionStorage: {
  getItem: (k: string) => values.get(k) ?? null,
  setItem: (k: string, v: string) => values.set(k, v),
  removeItem: (k: string) => values.delete(k),
} }, configurable: true });
const example: DiscoveredDomain = {
  domain: "example.com", tld: "com", status: "taken", registrarPrice: 0, estimatedValue: 0,
  confidenceScore: 0, rationale: "A point-in-time result", checkMethod: "rdap", availabilityVerified: true, priceVerified: false,
  registrarUrl: "https://www.loopia.se/domannamn/", registrarOffer: { registrar: "Loopia", purchaseUrl: "https://www.loopia.se/domannamn/", priceSourceUrl: "https://www.loopia.se/domannamn/", currency: "SEK", priceVerified: false },
};
test("result snapshots survive refresh without storing the query/account", () => {
  writeSearchSession([example]);
  assert.deepEqual(readSearchSession(), [example]);
  const serialized = [...values.values()][0];
  assert.doesNotMatch(serialized, /"(?:brief|access_token|user_id|query)"/);
  writeSearchSession([]);
  assert.deepEqual(readSearchSession(), []);
});
test("corrupt, expired and future snapshots are ignored", () => {
  const key = "sajda.search-results.v1";
  for (const data of ["{", "null", JSON.stringify({ version: 1, domains: [example], savedAt: 0 }),
    JSON.stringify({ version: 1, domains: [example], savedAt: Date.now() + 1_000_000 }),
    JSON.stringify({ version: 1, domains: [{ bad: true }], savedAt: Date.now() })]) {
    values.set(key, data);
    assert.deepEqual(readSearchSession(), []);
  }
});
test("malformed nested offers cannot crash a restored result card", () => {
  for (const changed of [{ providerOffers: {} }, { registrarOffer: {} }, { providerOffers: [null] }, { registrarOffer: { ...example.registrarOffer, note: {} } }]) {
    values.set("sajda.search-results.v1", JSON.stringify({ version: 1, savedAt: Date.now(), domains: [{ ...example, ...changed }] }));
    assert.deepEqual(readSearchSession(), []);
  }
});
