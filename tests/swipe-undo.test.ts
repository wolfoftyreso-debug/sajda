import assert from "node:assert/strict";
import test from "node:test";
import type { AnonymousSearchResult } from "../src/lib/localTestSearch";
import { saveSwipeWishlistResult, updateSwipeWishlistEntry, type SwipeWishlistEntry } from "../src/lib/swipeWishlist";
import { canUndoSwipe, consumeSwipeUndo, createSwipeUndo, type SwipeUndoToken } from "../src/lib/swipeUndo";

const firstTime = "2026-09-08T10:00:00.000Z", nextTime = "2026-09-09T10:00:00.000Z";
const card = (domain = "klarhem.dev"): AnonymousSearchResult => ({ domain, tld: domain.split(".").at(-1)!,
  status: "available", checkMethod: "rdap", source: "registry-fixture", authoritative: true,
  registrarPrice: 0, estimatedValue: 0, confidenceScore: 0, namingScore: 82, rationale: "A readable name." });
const context = { generation: 7, deckIndex: 1 };
function keep(beforeSaved: SwipeWishlistEntry[] = [], result = card(), deckIndex = 0, generation = 7) {
  const afterSaved = saveSwipeWishlistResult(beforeSaved, result, nextTime);
  const token = createSwipeUndo({ card: result, deckIndex, generation, direction: "keep", beforeSaved, afterSaved });
  return { token, afterSaved };
}

test("undoing a new keep restores its card and removes only that newly saved domain", () => {
  const existing = saveSwipeWishlistResult([], card("annat.net"), firstTime);
  const { token, afterSaved } = keep(existing);
  const result = consumeSwipeUndo(token, context, afterSaved);
  assert.equal(result.restored, true); assert.equal(result.deckIndex, 0); assert.deepEqual(result.card, card());
  assert.equal(result.undo, null); assert.equal(result.wishlistChanged, true);
  assert.deepEqual(result.saved, existing); assert.equal(result.saved[0], existing[0]);
  assert.equal(afterSaved.length, 2, "Input list must not be mutated");
});

test("undoing an existing keep restores its old result, timestamps, tags and category", () => {
  const old = { ...card(), status: "taken" as const, rationale: "Previous registry snapshot." };
  const before = updateSwipeWishlistEntry(saveSwipeWishlistResult([], old, firstTime), old.domain,
    { category: "brand", tags: ["Kund A", "Nordiskt"] });
  const previousSnapshot = structuredClone(before);
  const { token, afterSaved } = keep(before);
  assert.equal(afterSaved[0].lastCheckedAt, nextTime);
  const result = consumeSwipeUndo(token, context, afterSaved);
  assert.deepEqual(result.saved, previousSnapshot); assert.deepEqual(before, previousSnapshot);
  assert.equal(result.saved[0].category, "brand"); assert.deepEqual(result.saved[0].tags, ["Kund A", "Nordiskt"]);
  assert.notEqual(result.saved[0], token.beforeEntry, "Mutable UI state must not share the frozen token snapshot");
});

test("undoing skip never alters any saved entry, including an already saved skipped domain", () => {
  const saved = saveSwipeWishlistResult([], card(), firstTime);
  const token = createSwipeUndo({ card: card(), deckIndex: 0, generation: 7, direction: "skip", beforeSaved: saved, afterSaved: saved });
  const result = consumeSwipeUndo(token, context, saved);
  assert.equal(result.restored, true); assert.equal(result.saved, saved); assert.equal(result.wishlistChanged, false);
});

test("one slot consumes exactly one step; undo never exposes an earlier decision", () => {
  const first = keep();
  const secondCard = card("kustverk.app");
  let undo: SwipeUndoToken | null = createSwipeUndo({ card: secondCard, deckIndex: 1, generation: 7, direction: "skip",
    beforeSaved: first.afterSaved, afterSaved: first.afterSaved });
  const restored = consumeSwipeUndo(undo, { generation: 7, deckIndex: 2 }, first.afterSaved);
  undo = restored.undo;
  assert.equal(restored.card?.domain, secondCard.domain); assert.equal(restored.deckIndex, 1);
  assert.equal(canUndoSwipe(undo, { generation: 7, deckIndex: 1 }), false);
  const repeated = consumeSwipeUndo(undo, { generation: 7, deckIndex: 1 }, restored.saved);
  assert.equal(repeated.restored, false); assert.equal(repeated.saved, first.afterSaved);
  assert.equal(repeated.saved[0].domain, card().domain, "An older keep remains saved");

  const newDecision = keep(restored.saved, secondCard, 1);
  undo = newDecision.token;
  assert.equal(canUndoSwipe(undo, { generation: 7, deckIndex: 2 }), true, "A new swipe creates one new undo");
  const newUndo = consumeSwipeUndo(undo, { generation: 7, deckIndex: 2 }, newDecision.afterSaved);
  assert.deepEqual(newUndo.saved, first.afterSaved); assert.equal(newUndo.undo, null);
});

test("manual target edits after keep win over undo, including tags/category/result/timestamps", () => {
  for (const before of [[], saveSwipeWishlistResult([], card(), firstTime)]) {
    const { token, afterSaved } = keep(before);
    for (const patch of [
      { tags: ["Added after keep"] }, { category: "later" as const },
      { result: { ...card(), status: "taken" as const } }, { lastCheckedAt: "2026-09-09T12:00:00.000Z" },
    ]) {
      const edited = updateSwipeWishlistEntry(afterSaved, card().domain, patch);
      const restored = consumeSwipeUndo(token, context, edited);
      assert.equal(restored.restored, true, "The card can still be restored");
      assert.equal(restored.saved, edited, "Later wishlist edits cannot be overwritten or removed");
      assert.equal(restored.wishlistChanged, false);
    }
  }
});

test("manual deletion stays deleted; unrelated edits/additions/removals stay intact", () => {
  const other = card("annat.net"), added = card("senare.org");
  const before = saveSwipeWishlistResult(saveSwipeWishlistResult([], card(), firstTime), other, firstTime);
  const { token, afterSaved } = keep(before);
  const removed = afterSaved.filter(entry => entry.domain !== card().domain);
  assert.equal(consumeSwipeUndo(token, context, removed).saved, removed, "Do not resurrect a manually deleted entry");

  const edited = updateSwipeWishlistEntry(saveSwipeWishlistResult(afterSaved, added, nextTime), other.domain, { tags: ["New note"] });
  const result = consumeSwipeUndo(token, context, edited);
  assert.deepEqual(result.saved.find(entry => entry.domain === card().domain), before.find(entry => entry.domain === card().domain));
  for (const domain of [other.domain, added.domain]) assert.equal(result.saved.find(entry => entry.domain === domain), edited.find(entry => entry.domain === domain));
  const otherRemoved = afterSaved.filter(entry => entry.domain !== other.domain);
  assert.equal(consumeSwipeUndo(token, context, otherRemoved).saved.length, 1, "Do not restore unrelated deleted records");
});

test("stable snapshots survive storage cloning and object key order without treating later edits as unchanged", () => {
  const { token, afterSaved } = keep();
  const reloaded = JSON.parse(JSON.stringify(afterSaved)) as SwipeWishlistEntry[];
  reloaded[0] = Object.fromEntries(Object.entries(reloaded[0]).reverse()) as unknown as SwipeWishlistEntry;
  const result = consumeSwipeUndo(token, context, reloaded);
  assert.equal(result.saved.length, 0); assert.equal(result.wishlistChanged, true);
  const mutated = structuredClone(afterSaved); mutated[0].result.rationale = "A later manual change";
  assert.equal(consumeSwipeUndo(token, context, mutated).saved, mutated);
});

test("snapshots are detached from later in-place changes and do not freeze source objects", () => {
  const resultCard = card(), before = saveSwipeWishlistResult([], card(), firstTime);
  before[0].tags = ["Original"];
  const { token, afterSaved } = keep(before, resultCard);
  const unmodifiedCurrent = structuredClone(afterSaved);
  before[0].tags.push("Changed later"); before[0].result.rationale = "Changed earlier reference";
  resultCard.rationale = "Changed card reference";
  afterSaved[0].lastCheckedAt = "2026-09-09T13:00:00.000Z";
  const restored = consumeSwipeUndo(token, context, unmodifiedCurrent);
  assert.deepEqual(restored.saved[0].tags, ["Original"]);
  assert.equal(restored.saved[0].result.rationale, "A readable name.");
  assert.equal(restored.card?.rationale, "A readable name.");
  assert.ok(Object.isFrozen(token) && Object.isFrozen(token.card) && Object.isFrozen(token.beforeEntry?.tags));
  assert.equal(Object.isFrozen(resultCard), false);
});

test("deck generation and exact next-index guards prevent stale/multiple-step/animation undo", () => {
  const { token, afterSaved } = keep();
  for (const wrong of [
    { generation: 8, deckIndex: 1 }, { generation: 7, deckIndex: 0 }, { generation: 7, deckIndex: 2 },
    { generation: -1, deckIndex: 1 }, { generation: 7, deckIndex: NaN }, { generation: 7, deckIndex: 1.5 },
  ]) {
    assert.equal(canUndoSwipe(token, wrong), false);
    const result = consumeSwipeUndo(token, wrong, afterSaved);
    assert.equal(result.undo, null); assert.equal(result.restored, false); assert.equal(result.saved, afterSaved);
  }
  assert.equal(canUndoSwipe(null, context), false);
  assert.throws(() => keep([], card(), -1));
  assert.throws(() => keep([], card(), 0, Infinity));
});

test("last card can be restored without requiring a next card or fetching another deck", () => {
  const { token, afterSaved } = keep([], card(), 99);
  const result = consumeSwipeUndo(token, { generation: 7, deckIndex: 100 }, afterSaved);
  assert.equal(result.restored, true); assert.equal(result.deckIndex, 99); assert.equal(result.card?.domain, card().domain);
  assert.equal(result.saved.length, 0);
});

test("ambiguous duplicate target entries are preserved and no-op keeps avoid unnecessary wishlist writes", () => {
  const saved = saveSwipeWishlistResult([], card(), firstTime);
  const duplicate = [saved[0], structuredClone(saved[0])];
  const { token, afterSaved } = keep(duplicate);
  assert.equal(consumeSwipeUndo(token, context, afterSaved).saved, afterSaved);
  const unchanged = createSwipeUndo({ card: card(), deckIndex: 0, generation: 7, direction: "keep", beforeSaved: saved, afterSaved: saved });
  const result = consumeSwipeUndo(unchanged, context, saved);
  assert.equal(result.restored, true); assert.equal(result.wishlistChanged, false); assert.equal(result.saved, saved);
});
