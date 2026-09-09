import type { AnonymousSearchResult } from "./localTestSearch";
import type { SwipeWishlistEntry } from "./swipeWishlist";

export interface SwipeUndoContext {
  /** Increment only when a new deck is actually committed, not on a failed load. */
  generation: number;
  /** Index after the latest decision's exit animation has completed. */
  deckIndex: number;
}

export interface SwipeUndoToken {
  readonly card: AnonymousSearchResult;
  readonly deckIndex: number;
  readonly generation: number;
  readonly direction: "keep" | "skip";
  readonly domain: string;
  readonly beforeEntry?: SwipeWishlistEntry;
  readonly afterEntry?: SwipeWishlistEntry;
  readonly afterSnapshot?: string;
  readonly canRestoreWishlist: boolean;
}

function validPosition(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

/** JSON data only, with sorted object keys so a storage round-trip is harmless. */
function stableSnapshot(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    return Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right)));
  });
}

function copy<T>(value: T): T {
  return JSON.parse(stableSnapshot(value)) as T;
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value;
}

const domainKey = (domain: string) => domain.trim().toLowerCase();

/**
 * One decision, never a history stack. Replace the previous token on each swipe.
 * Capture before/after in the same wishlist update that applies the keep.
 * Detached snapshots cannot be changed by later mutations of the input objects.
 */
export function createSwipeUndo(input: {
  card: AnonymousSearchResult;
  deckIndex: number;
  generation: number;
  direction: "keep" | "skip";
  beforeSaved: readonly SwipeWishlistEntry[];
  afterSaved: readonly SwipeWishlistEntry[];
}): SwipeUndoToken {
  if (!validPosition(input.deckIndex) || !validPosition(input.generation)) throw new Error("Invalid Swipe position");
  const domain = domainKey(input.card.domain);
  const before = input.beforeSaved.filter(entry => domainKey(entry.domain) === domain);
  const after = input.afterSaved.filter(entry => domainKey(entry.domain) === domain);
  // Ambiguous duplicate records are preserved rather than guessed away.
  const canRestoreWishlist = input.direction === "keep" && before.length <= 1 && after.length === 1;
  return freeze({
    card: copy(input.card), deckIndex: input.deckIndex, generation: input.generation,
    direction: input.direction, domain,
    ...(before.length === 1 ? { beforeEntry: copy(before[0]) } : {}),
    ...(after.length === 1 ? { afterEntry: copy(after[0]), afterSnapshot: stableSnapshot(after[0]) } : {}),
    canRestoreWishlist,
  });
}

/** The last card is undoable at deckIndex === deck.length, before any new deck. */
export function canUndoSwipe(token: SwipeUndoToken | null | undefined, context: SwipeUndoContext): boolean {
  return Boolean(token && validPosition(context.generation) && validPosition(context.deckIndex)
    && token.generation === context.generation && context.deckIndex === token.deckIndex + 1);
}

export interface SwipeUndoResult {
  /** Commit this immediately to the caller's sole ref/state slot. */
  undo: null;
  restored: boolean;
  card?: AnonymousSearchResult;
  deckIndex: number;
  saved: SwipeWishlistEntry[];
  wishlistChanged: boolean;
}

/**
 * Pure one-step transition. No storage, network, counters or hidden old tokens.
 * React may replay this calculation; only committing returned `undo: null`
 * consumes the decision. Never retain/reinstall an earlier token after commit.
 */
export function consumeSwipeUndo(
  token: SwipeUndoToken | null | undefined,
  context: SwipeUndoContext,
  saved: SwipeWishlistEntry[],
): SwipeUndoResult {
  if (!canUndoSwipe(token, context) || !token) return {
    undo: null, restored: false, deckIndex: context.deckIndex, saved, wishlistChanged: false,
  };
  let nextSaved = saved;
  if (token.direction === "keep" && token.canRestoreWishlist && token.afterSnapshot) {
    const current = saved.filter(entry => domainKey(entry.domain) === token.domain);
    // Only this keep's still-unchanged write may be undone. Deletion, tagging,
    // recategorisation, a fresh check, or any later edit wins over undo.
    if (current.length === 1 && stableSnapshot(current[0]) === token.afterSnapshot) {
      if (!token.beforeEntry) nextSaved = saved.filter(entry => entry !== current[0]);
      else if (stableSnapshot(token.beforeEntry) !== token.afterSnapshot) {
        const previous = copy(token.beforeEntry);
        nextSaved = saved.map(entry => entry === current[0] ? previous : entry);
      }
    }
  }
  return { undo: null, restored: true, card: copy(token.card), deckIndex: token.deckIndex,
    saved: nextSaved, wishlistChanged: nextSaved !== saved };
}
