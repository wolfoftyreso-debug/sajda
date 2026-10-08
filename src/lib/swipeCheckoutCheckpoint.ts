import { z } from "zod/v4";
import type { AnonymousSearchResult } from "./localTestSearch";
import { SWIPE_DECK_SIZE, toVerifiedSwipeDeck } from "./swipeDeck";
import { canUndoSwipe, type SwipeUndoToken } from "./swipeUndo";
import { swipeWishlistCategories } from "./swipeWishlist";

export const SWIPE_CHECKOUT_CHECKPOINT_KEY = "sajda.swipe.checkout.v1";
export const SWIPE_CHECKOUT_CHECKPOINT_TTL_MS = 2 * 60 * 60 * 1000;
export const SWIPE_CHECKOUT_CHECKPOINT_MAX_CHARS = 1024 * 1024;

type CheckpointStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export interface SwipeCheckoutCheckpointState {
  deck: AnonymousSearchResult[];
  deckIndex: number;
  generation: number;
  undo: SwipeUndoToken | null;
  selectedTlds: string[];
}
export interface SwipeCheckoutCheckpointInput {
  ownerId: string | null;
  deck: readonly AnonymousSearchResult[];
  deckIndex: number;
  generation: number;
  undo: SwipeUndoToken | null;
  selectedTlds: readonly string[];
}
interface CheckpointOptions {
  storage?: CheckpointStorage | null;
  now?: number;
}
export type SwipeCheckoutReturn = "auth_offer" | "billing_success" | "billing_cancel";

const owner = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/u).nullable();
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const timestamp = z.iso.datetime({ offset: true });
const amount = z.number().finite().nonnegative().max(1e12);
const httpsUrl = z.string().max(2000).refine(value => {
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password && !url.port; }
  catch { return false; }
});
const offerSchema = z.strictObject({
  providerId: z.string().regex(/^[a-z0-9-]{1,40}$/iu).optional(),
  registrar: z.string().min(1).max(100), purchaseUrl: httpsUrl, priceSourceUrl: httpsUrl,
  currency: z.string().regex(/^[A-Z]{3}$/u),
  registrationPriceInclVat: amount.optional(), registrationPriceExVat: amount.optional(), renewalPriceInclVat: amount.optional(),
  registrationPrice: amount.optional(), renewalPrice: amount.optional(), icannFee: amount.optional(),
  taxTreatment: z.enum(["included", "excluded", "unknown"]).optional(), priceType: z.enum(["campaign", "standard"]).optional(),
  priceScope: z.enum(["standard_tld", "exact_domain_offer"]).optional(),
  priceStatus: z.enum(["verified", "unavailable", "not_connected"]).optional(),
  dataSource: z.enum(["loopia_public_price_list", "official_provider_api", "provider_search_page", "tldes_price_feed"]).optional(),
  connectorState: z.enum(["public_source_active", "official_api_not_configured", "official_api_credentials_configured", "aggregated_price_feed_configured"]).optional(),
  checkedAt: timestamp.nullish(), priceVerified: z.boolean(), note: z.string().max(4000).optional(),
}).refine(value => !value.priceVerified || typeof value.checkedAt === "string"
  && (value.registrationPriceInclVat ?? value.registrationPriceExVat ?? value.registrationPrice) !== undefined);
const rawCardSchema = z.strictObject({
  domain: z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.[a-z0-9-]{2,63}$/u),
  tld: z.string().regex(/^[a-z0-9-]{2,63}$/u), status: z.enum(["available", "taken", "unknown"]),
  checkMethod: z.enum(["rdap", "whois", "das", "none"]), source: z.string().max(2000),
  checkedAt: timestamp.nullish(), authoritative: z.boolean(), error: z.string().max(4000).optional(),
  registrarPrice: amount, estimatedValue: amount, confidenceScore: z.number().finite().min(0).max(100),
  namingScore: z.number().finite().min(0).max(100).optional(), rankingPosition: integer.min(1).max(10000).optional(),
  rationale: z.string().max(4000), registrarOffer: offerSchema.optional(), registrarOffers: z.array(offerSchema).max(32).optional(),
}).refine(value => value.domain.split(".")[1] === value.tld);
// The actual API legitimately uses offer.checkedAt:null for an unconnected
// source, although the older UI interface says optional string. Preserve that
// unknown observation exactly; normaliseRegistrarOffer still owns presentation.
const cardSchema = rawCardSchema.transform(value => value as unknown as AnonymousSearchResult);
const entrySchema = z.strictObject({
  domain: rawCardSchema.shape.domain, result: cardSchema, category: z.enum(swipeWishlistCategories),
  tags: z.array(z.string().min(1).max(32)).max(64), savedAt: timestamp, lastCheckedAt: timestamp,
}).refine(value => value.domain === value.result.domain);
const undoSchema = z.strictObject({
  card: cardSchema, deckIndex: integer, generation: integer, direction: z.enum(["keep", "skip"]),
  domain: rawCardSchema.shape.domain, beforeEntry: entrySchema.optional(), afterEntry: entrySchema.optional(),
  afterSnapshot: z.string().max(128 * 1024).optional(), canRestoreWishlist: z.boolean(),
});

function stableSnapshot(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => !item || typeof item !== "object" || Array.isArray(item)
    ? item : Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right))));
}
const stateFields = {
  deck: z.array(cardSchema).min(1).max(SWIPE_DECK_SIZE), deckIndex: integer.max(SWIPE_DECK_SIZE), generation: integer,
  undo: undoSchema.nullable(), selectedTlds: z.array(z.string().regex(/^[a-z0-9-]{2,63}$/u)).min(1).max(32),
};
function coherentState(value: SwipeCheckoutCheckpointState): boolean {
  if (value.deckIndex > value.deck.length || new Set(value.selectedTlds).size !== value.selectedTlds.length
    || toVerifiedSwipeDeck(value.deck, value.selectedTlds).length !== value.deck.length) return false;
  const undo = value.undo;
  if (!undo) return true;
  return canUndoSwipe(undo, value) && undo.domain === undo.card.domain
    && stableSnapshot(undo.card) === stableSnapshot(value.deck[undo.deckIndex])
    && (!undo.beforeEntry || undo.beforeEntry.domain === undo.domain)
    && (!undo.afterEntry || undo.afterEntry.domain === undo.domain)
    && (undo.afterSnapshot === undefined ? undo.afterEntry === undefined : !!undo.afterEntry && undo.afterSnapshot === stableSnapshot(undo.afterEntry))
    && (!undo.canRestoreWishlist || undo.direction === "keep" && !!undo.afterEntry && !!undo.afterSnapshot);
}
const inputSchema = z.strictObject({ ownerId: owner, ...stateFields }).refine(coherentState);
const storedSchema = z.strictObject({
  version: z.literal(1), purpose: z.literal("premium_offer"), createdAt: integer, expiresAt: integer,
  ownerId: owner, ...stateFields,
}).refine(coherentState).refine(value => value.expiresAt === value.createdAt + SWIPE_CHECKOUT_CHECKPOINT_TTL_MS);

function storageFor(options: CheckpointOptions): CheckpointStorage | null {
  if (options.storage !== undefined) return options.storage;
  if (typeof window === "undefined") return null;
  try { return window.sessionStorage; } catch { return null; }
}
function validNow(now: number): boolean { return Number.isSafeInteger(now) && now >= 0 && now <= Number.MAX_SAFE_INTEGER - SWIPE_CHECKOUT_CHECKPOINT_TTL_MS; }
function freeze<T>(value: T): T {
  if (value && typeof value === "object") { for (const item of Object.values(value)) freeze(item); Object.freeze(value); }
  return value;
}

/** UI return routing only. A success URL is never a payment/entitlement receipt. */
export function swipeCheckoutReturn(pathname: string, search: string): SwipeCheckoutReturn | null {
  if (pathname !== "/swipe" || typeof search !== "string" || search.length > 512) return null;
  const params = new URLSearchParams(search), billing = params.getAll("billing"), premium = params.getAll("premium");
  if (billing.length === 1 && premium.length === 0 && ["success", "cancel"].includes(billing[0])) return `billing_${billing[0]}` as SwipeCheckoutReturn;
  return billing.length === 0 && premium.length === 1 && premium[0] === "offer" ? "auth_offer" : null;
}

/** Delete only this exact tab-local checkpoint, never picks/account storage. */
export function clearSwipeCheckoutCheckpoint(options: CheckpointOptions = {}): boolean {
  const storage = storageFor(options);
  if (!storage) return false;
  try { storage.removeItem(SWIPE_CHECKOUT_CHECKPOINT_KEY); return storage.getItem(SWIPE_CHECKOUT_CHECKPOINT_KEY) === null; }
  catch { return false; }
}

/** Save only after a swipe decision's exit animation has committed its index.
 * A failed save retires an earlier checkpoint rather than restoring stale work.
 * No session credential, paid-access flag, entire wishlist or prefetch is stored. */
export function saveSwipeCheckoutCheckpoint(input: SwipeCheckoutCheckpointInput, options: CheckpointOptions = {}): boolean {
  const storage = storageFor(options), now = options.now ?? Date.now();
  if (!storage) return false;
  try {
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success || !validNow(now)) { clearSwipeCheckoutCheckpoint({ storage }); return false; }
    const raw = JSON.stringify({ version: 1, purpose: "premium_offer", createdAt: now, expiresAt: now + SWIPE_CHECKOUT_CHECKPOINT_TTL_MS, ...parsed.data });
    if (raw.length > SWIPE_CHECKOUT_CHECKPOINT_MAX_CHARS) { clearSwipeCheckoutCheckpoint({ storage }); return false; }
    storage.setItem(SWIPE_CHECKOUT_CHECKPOINT_KEY, raw);
    if (storage.getItem(SWIPE_CHECKOUT_CHECKPOINT_KEY) !== raw) { clearSwipeCheckoutCheckpoint({ storage }); return false; }
    return true;
  } catch { clearSwipeCheckoutCheckpoint({ storage }); return false; }
}

/** Call once after auth settles and before automatic deck loading. Removal is
 * confirmed before returning data: repeated URL/refresh cannot replay the token.
 * An owned snapshot requires its exact current owner. A guest snapshot can cross
 * only the same tab's explicit auth-offer return, then is immediately consumed.
 * Continue using the current local wishlist and fresh authorizeSwipeUndo; this
 * function does not grant Premium or perform any undo/provider request. */
export function consumeSwipeCheckoutCheckpoint(context: {
  ownerId: string | null; pathname: string; search: string;
}, options: CheckpointOptions = {}): SwipeCheckoutCheckpointState | null {
  const returning = swipeCheckoutReturn(context.pathname, context.search), storage = storageFor(options);
  if (!returning || !storage) return null;
  try {
    const raw = storage.getItem(SWIPE_CHECKOUT_CHECKPOINT_KEY);
    if (raw === null) return null;
    if (!clearSwipeCheckoutCheckpoint({ storage }) || raw.length > SWIPE_CHECKOUT_CHECKPOINT_MAX_CHARS) return null;
    const currentOwner = owner.safeParse(context.ownerId), parsed = storedSchema.safeParse(JSON.parse(raw)), now = options.now ?? Date.now();
    if (!parsed.success || !currentOwner.success || !validNow(now)) return null;
    const checkpoint = parsed.data;
    if (checkpoint.createdAt > now || now >= checkpoint.expiresAt
      || checkpoint.ownerId === null && returning !== "auth_offer"
      || checkpoint.ownerId !== null && checkpoint.ownerId !== currentOwner.data) return null;
    return { deck: checkpoint.deck, deckIndex: checkpoint.deckIndex, generation: checkpoint.generation,
      selectedTlds: checkpoint.selectedTlds, undo: checkpoint.undo ? freeze(checkpoint.undo) : null };
  } catch { return null; }
}
