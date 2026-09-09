import assert from "node:assert/strict";
import test from "node:test";
import { toVerifiedSwipeDeck } from "../src/lib/swipeDeck";
import type { AnonymousSearchResult } from "../src/lib/localTestSearch";

const endings = ["com", "ai", "dev", "app", "net", "org", "xyz", "info", "biz"];
const result = (tld: string, patch: Partial<AnonymousSearchResult> = {}): AnonymousSearchResult => ({
  domain: `talora.${tld}`, tld, status: "available", authoritative: true, checkMethod: "rdap",
  source: "Registry", registrarPrice: 0, estimatedValue: 0, confidenceScore: 0, rationale: "", ...patch,
});

test("Swipe accepts every verified supported ending, alone and in a mixed deck", () => {
  const cards = endings.map(tld => result(tld));
  assert.deepEqual(toVerifiedSwipeDeck(cards, endings), cards);
  for (const tld of endings) assert.deepEqual(toVerifiedSwipeDeck(cards, [tld]), [result(tld)]);
});

test("Swipe never substitutes .com or displays a card outside the requested endings", () => {
  assert.deepEqual(toVerifiedSwipeDeck([result("com")], ["dev"]), []);
  assert.deepEqual(toVerifiedSwipeDeck([result("dev", { domain: "talora.com" })], ["dev"]), []);
  assert.deepEqual(toVerifiedSwipeDeck([result("dev")], []), []);
});

test("Swipe rejects unverified, unknown, taken, malformed and duplicate cards", () => {
  const good = result("ai");
  assert.deepEqual(toVerifiedSwipeDeck([
    good, good, result("dev", { status: "unknown" }), result("app", { status: "taken" }),
    result("org", { authoritative: false }), result("biz", { checkMethod: "none" }),
    result("net", { domain: "ab.net" }), result("net", { domain: "abcdefghij.net" }),
    result("net", { domain: "my-name.net" }), result("net", { domain: "talora.foo.net" }),
  ], endings), [good]);
});

test("Swipe preserves authoritative candidate order and caps the deck at 100", () => {
  const cards = Array.from({ length: 120 }, (_, i) => result("dev", {
    domain: `talo${String.fromCharCode(97 + Math.floor(i / 26))}${String.fromCharCode(97 + i % 26)}.dev`,
  }));
  assert.deepEqual(toVerifiedSwipeDeck(cards, ["dev"]), cards.slice(0, 100));
});
