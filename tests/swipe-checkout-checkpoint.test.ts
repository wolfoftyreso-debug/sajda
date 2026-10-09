import assert from "node:assert/strict";
import test from "node:test";
import type { AnonymousSearchResult } from "../src/lib/localTestSearch";
import type { RegistrarOffer } from "../src/lib/registrarOffer";
import { createSwipeUndo, consumeSwipeUndo } from "../src/lib/swipeUndo";
import { saveSwipeWishlistResult, updateSwipeWishlistEntry } from "../src/lib/swipeWishlist";
import {
  SWIPE_CHECKOUT_CHECKPOINT_KEY as KEY, SWIPE_CHECKOUT_CHECKPOINT_TTL_MS as TTL,
  saveSwipeCheckoutCheckpoint as save, consumeSwipeCheckoutCheckpoint as consume,
  clearSwipeCheckoutCheckpoint as clear, swipeCheckoutReturn, type SwipeCheckoutCheckpointInput,
} from "../src/lib/swipeCheckoutCheckpoint";

const now = Date.parse("2026-10-08T12:00:00.000Z"), observed = "2026-10-08T11:00:00.000Z";
const card = (domain = "alpha.dev"): AnonymousSearchResult => ({ domain, tld: domain.split(".")[1], status: "available",
  checkMethod: "rdap", source: "Registry fixture", checkedAt: observed, authoritative: true,
  registrarPrice: 0, estimatedValue: 0, confidenceScore: 42, namingScore: 90, rationale: "Dated name observation." });
function fixture() {
  const values = new Map<string, string>(), operations = { removals: 0 };
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { operations.removals++; values.delete(key); } };
  return { values, storage, operations, options: { storage, now } };
}
function state(ownerId: string | null = "account-a"): SwipeCheckoutCheckpointInput {
  const first = card(), before = saveSwipeWishlistResult([], { ...first, status: "taken" }, "2026-10-07T10:00:00.000Z");
  const after = saveSwipeWishlistResult(before, first, observed);
  return { ownerId, deck: [first, card("bravo.com")], selectedTlds: ["dev", "com"], deckIndex: 1, generation: 7,
    undo: createSwipeUndo({ card: first, deckIndex: 0, generation: 7, direction: "keep", beforeSaved: before, afterSaved: after }) };
}
const context = (ownerId: string | null = "account-a", search = "?billing=success") => ({ ownerId, pathname: "/swipe", search });
const unsafe = (value: unknown) => value as SwipeCheckoutCheckpointInput;

test("owned checkpoint preserves the current deck/index/one undo/endings and dated evidence exactly once", () => {
  const f = fixture(), input = state(); assert.equal(save(input, f.options), true);
  f.values.set("unrelated-key", "retained");
  const stored = JSON.parse(f.values.get(KEY)!);
  assert.equal(stored.version, 1); assert.equal(stored.purpose, "premium_offer"); assert.equal(stored.expiresAt, now + TTL);
  const restored = consume(context(), { ...f.options, now: now + 30_000 });
  assert.deepEqual(restored, { deck: input.deck, selectedTlds: input.selectedTlds, deckIndex: 1, generation: 7, undo: input.undo });
  assert.equal(restored?.deck[0].checkedAt, observed); assert.equal(restored?.undo?.afterEntry?.lastCheckedAt, observed);
  assert.ok(Object.isFrozen(restored?.undo) && Object.isFrozen(restored?.undo?.card));
  assert.equal(f.values.has(KEY), false); assert.equal(f.values.get("unrelated-key"), "retained");
  assert.equal(consume(context(), f.options), null);
  assert.doesNotMatch(JSON.stringify(stored), /"(?:premium|entitlement|session|token|access_token|prefetch|wishlist|nextDeck)"\s*:/u);
});

test("cancel, success and auth-return restore UI only, never paid access or automatic undo", () => {
  for (const search of ["?billing=success", "?billing=cancel", "?premium=offer", "?lang=sv&billing=cancel"]) {
    const f = fixture(), input = state(); assert.equal(save(input, f.options), true);
    const restored = consume(context("account-a", search), f.options);
    assert.equal(restored?.deckIndex, 1); assert.equal(restored?.undo?.deckIndex, 0);
    assert.equal("premium" in (restored ?? {}), false); assert.equal("entitlement" in (restored ?? {}), false);
  }
});

test("an owned checkpoint never restores to another owner or guest, and mismatches retire it", () => {
  for (const nextOwner of ["account-b", null, "invalid owner"]) {
    const f = fixture(); assert.equal(save(state(), f.options), true);
    assert.equal(consume(context(nextOwner), f.options), null); assert.equal(f.values.has(KEY), false);
    assert.equal(consume(context(), f.options), null);
  }
});

test("a guest checkpoint can cross explicit same-tab auth-offer return once, not a billing marker", () => {
  for (const nextOwner of ["account-a", null]) {
    const f = fixture(); assert.equal(save(state(null), f.options), true);
    assert.equal(consume(context(nextOwner, "?premium=offer"), f.options)?.deckIndex, 1);
    assert.equal(consume(context("account-b", "?premium=offer"), f.options), null);
  }
  for (const search of ["?billing=success", "?billing=cancel"]) {
    const f = fixture(); assert.equal(save(state(null), f.options), true);
    assert.equal(consume(context("account-a", search), f.options), null); assert.equal(f.values.has(KEY), false);
  }
});

test("unrelated routes, malformed/duplicate/conflicting markers never consume a checkpoint", () => {
  const f = fixture(); assert.equal(save(state(), f.options), true);
  for (const [pathname, search] of [["/pricing", "?billing=success"], ["/swipe/", "?billing=success"], ["/swipe", ""],
    ["/swipe", "?billing=no"], ["/swipe", "?billing=success&billing=cancel"], ["/swipe", "?premium=offer&premium=offer"],
    ["/swipe", "?billing=success&premium=offer"], ["/swipe", "?premium=paid"], ["/swipe", `?billing=success&padding=${"x".repeat(512)}`]]) {
    assert.equal(swipeCheckoutReturn(pathname, search), null);
    assert.equal(consume({ ownerId: "account-a", pathname, search }, f.options), null); assert.equal(f.values.has(KEY), true);
  }
  assert.equal(consume(context(), f.options)?.deckIndex, 1);
});

test("expired, future, corrupt, legacy, missing-owner and artificially extended envelopes are purged", () => {
  const f = fixture(); assert.equal(save(state(), f.options), true); const original = JSON.parse(f.values.get(KEY)!);
  const missingOwner = { ...original }; delete missingOwner.ownerId;
  for (const raw of ["{", "null", "[]", JSON.stringify({ ...original, version: 0 }), JSON.stringify(missingOwner),
    JSON.stringify({ ...original, createdAt: now + 1, expiresAt: now + 1 + TTL }), JSON.stringify({ ...original, expiresAt: now + TTL + 1 }),
    JSON.stringify({ ...original, createdAt: now - TTL, expiresAt: now }), JSON.stringify({ ...original, entitlement: true })]) {
    f.values.set(KEY, raw); assert.equal(consume(context(), f.options), null); assert.equal(f.values.has(KEY), false);
  }
});

test("TTL boundary is strict and serialization detaches later source mutation", () => {
  const f = fixture(), input = state(); assert.equal(save(input, f.options), true);
  input.deck[0].rationale = "Changed after navigation";
  assert.equal(consume(context(), { ...f.options, now: now + TTL - 1 })?.deck[0].rationale, "Dated name observation.");
  assert.equal(save(state(), f.options), true); assert.equal(consume(context(), { ...f.options, now: now + TTL }), null);
  assert.equal(f.values.has(KEY), false);
});

test("invalid positions, animation-in-flight, foreign token card/generation and cross-domain entry fail closed", () => {
  const f = fixture(), good = state(), token = good.undo!;
  for (const changed of [
    { ...good, deckIndex: -1 }, { ...good, deckIndex: 3 }, { ...good, generation: Infinity }, { ...good, deckIndex: 0 },
    { ...good, undo: { ...token, generation: 8 } }, { ...good, undo: { ...token, card: card("other.dev") } },
    { ...good, undo: { ...token, domain: "other.dev" } }, { ...good, undo: { ...token, afterSnapshot: "{}" } },
    { ...good, undo: { ...token, beforeEntry: { ...token.beforeEntry, domain: "other.dev" } } },
    { ...good, undo: { ...token, direction: "skip", canRestoreWishlist: true } },
  ]) {
    assert.equal(save(good, f.options), true); assert.equal(save(unsafe(changed), f.options), false); assert.equal(f.values.has(KEY), false);
  }
});

test("deck cards must all be unique verified selected 3–9-letter names; none are silently dropped", () => {
  const f = fixture(), good = { ...state(), undo: null };
  for (const changed of [
    { ...good, deck: [] }, { ...good, selectedTlds: [] }, { ...good, selectedTlds: ["dev", "dev"] },
    { ...good, selectedTlds: ["dev"] }, { ...good, deck: [card(), card()] }, { ...good, deck: [card("ab.dev")] },
    { ...good, deck: [card("abcdefghij.dev")] }, { ...good, deck: [card("ab-c.dev")] },
    ...[{ status: "taken" }, { status: "unknown" }, { authoritative: false }, { checkMethod: "none" },
      { confidenceScore: NaN }, { registrarPrice: -1 }, { namingScore: 101 }, { tld: "com" }, { rationale: "x".repeat(4001) },
      { source: {} }, { paid: true }].map(patch => ({ ...good, deck: [{ ...card(), ...patch }] })),
  ]) assert.equal(save(unsafe(changed), f.options), false);
});

test("last-card undo survives without prefetch or a new registry call, and current wishlist edits win", () => {
  const f = fixture(), first = card(), original = saveSwipeWishlistResult([], first, observed);
  const input = { ownerId: "account-a", deck: [first], selectedTlds: ["dev"], deckIndex: 1, generation: 7,
    undo: createSwipeUndo({ card: first, deckIndex: 0, generation: 7, direction: "keep", beforeSaved: [], afterSaved: original }) };
  assert.equal(save(input, f.options), true); const restored = consume(context(), f.options)!;
  const edited = updateSwipeWishlistEntry(original, first.domain, { tags: ["Edited while away"], category: "brand" });
  const transition = consumeSwipeUndo(restored.undo, restored, edited);
  assert.equal(transition.restored, true); assert.equal(transition.deckIndex, 0);
  assert.equal(transition.saved, edited); assert.equal(transition.wishlistChanged, false);
  assert.equal(transition.undo, null);
});

test("provider links and nested price data are strictly validated while original unknown/dated quotes are retained", () => {
  const f = fixture(), good = { ...state(), undo: null };
  const offer: RegistrarOffer = { registrar: "Fixture", providerId: "fixture", purchaseUrl: "https://registrar.example.test/search",
    priceSourceUrl: "https://registrar.example.test/prices", currency: "USD", checkedAt: observed, priceVerified: true, registrationPrice: 9 };
  assert.equal(save({ ...good, deck: [{ ...card(), registrarOffer: offer }] }, f.options), true);
  assert.deepEqual(consume(context(), { ...f.options, now: now + 60_000 })?.deck[0].registrarOffer, offer);
  const unknownOffer = { ...offer, priceVerified: false, checkedAt: null } as unknown as RegistrarOffer;
  assert.equal(save({ ...good, deck: [{ ...card(), registrarOffer: unknownOffer }] }, f.options), true);
  assert.deepEqual(consume(context(), f.options)?.deck[0].registrarOffer, unknownOffer);
  for (const patch of [{ purchaseUrl: "javascript:alert(1)" }, { purchaseUrl: "https://user:private@registrar.example.test" },
    { priceSourceUrl: "http://registrar.example.test" }, { checkedAt: "bad" }, { checkedAt: null }, { currency: "SE" },
    { registrationPrice: -1 }, { priceScope: "valuation" }, { token: "secret-not-stored" }]) {
    assert.equal(save(unsafe({ ...good, deck: [{ ...card(), registrarOffer: { ...offer, ...patch } }] }), f.options), false);
  }
  assert.equal(save(unsafe({ ...good, deck: [{ ...card(), registrarOffers: {} }] }), f.options), false);
});

test("invalid nested stored fields cannot bypass save validation, and malformed price shapes are discarded", () => {
  const f = fixture(); assert.equal(save(state(), f.options), true); const original = JSON.parse(f.values.get(KEY)!);
  for (const patch of [{ deck: [{ ...card(), registrarOffers: [null] }] }, { undo: { ...original.undo, beforeEntry: null } },
    { undo: { ...original.undo, canRestoreWishlist: "yes" } }, { selectedTlds: ["dev", "COM"] }, { ownerId: "other owner" }]) {
    f.values.set(KEY, JSON.stringify({ ...original, ...patch })); assert.equal(consume(context(), f.options), null); assert.equal(f.values.has(KEY), false);
  }
});

test("unavailable/restricted/quota/no-op storage never promises persistence or allows a repeated consume", () => {
  assert.equal(save(state(), { storage: null, now }), false); assert.equal(consume(context(), { storage: null, now }), null);
  const f = fixture(); assert.equal(save(state(), f.options), true);
  const refusingRemoval = { ...f.storage, removeItem() {} };
  assert.equal(consume(context(), { storage: refusingRemoval, now }), null); assert.equal(f.values.has(KEY), true);
  const unavailable = { getItem() { throw new Error("Private storage"); }, setItem() { throw new Error("Private storage"); }, removeItem() { throw new Error("Private storage"); } };
  assert.equal(save(state(), { storage: unavailable, now }), false); assert.equal(consume(context(), { storage: unavailable, now }), null);
  const quota = { ...f.storage, setItem() { throw new Error("Quota reached"); } };
  assert.equal(save(state(), { storage: quota, now }), false); assert.equal(f.values.has(KEY), false);
  const noOpWrite = { ...f.storage, setItem() {} };
  assert.equal(save(state(), { storage: noOpWrite, now }), false);
});

test("bounds reject oversized storage and invalid clock values, clearing only this checkpoint", () => {
  const f = fixture(); f.values.set(KEY, "x".repeat(1024 * 1024 + 1));
  assert.equal(consume(context(), f.options), null); assert.equal(f.values.has(KEY), false);
  for (const clock of [NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER]) assert.equal(save(state(), { ...f.options, now: clock }), false);
  const offers = Array.from({ length: 32 }, () => ({ registrar: "Fixture", purchaseUrl: "https://registrar.example.test",
    priceSourceUrl: "https://registrar.example.test/prices", currency: "USD", priceVerified: false, note: "x".repeat(4000) }));
  const deck = Array.from({ length: 100 }, (_, index) => ({ ...card(`n${String.fromCharCode(97 + Math.floor(index / 26))}${String.fromCharCode(97 + index % 26)}.dev`), registrarOffers: offers }));
  assert.equal(save({ ...state(), deck, undo: null, selectedTlds: ["dev"] }, f.options), false);
  assert.equal(f.values.has(KEY), false);
  f.values.set("other", "kept"); assert.equal(clear(f.options), true); assert.equal(f.values.get("other"), "kept");
});
