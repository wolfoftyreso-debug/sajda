/**
 * Browser-only marketplace drafts.
 *
 * This intentionally has no network, payment, transfer, credential or
 * registrar integration. Domain listings are local drafting aids until a
 * real marketplace service, seller verification and legal transfer flow
 * exist.
 */

import { normalizeMarketplaceApexDomain } from "./marketplaceDomain";

export type MarketplaceCurrency = "USD" | "SEK" | "EUR";

export interface MarketplaceListing {
  id: string;
  domain: string;
  askingPrice: number;
  currency: MarketplaceCurrency;
  category: "domain";
  description: string;
  contactName?: string;
  status: "local-draft";
  createdAt: string;
}

export interface MarketplaceListingInput {
  domain: string;
  askingPrice: number;
  currency: MarketplaceCurrency;
  description: string;
  contactName?: string;
}

const STORAGE_KEY = "sajda.marketplace.local-drafts.v1";
const MAX_LISTINGS = 100;
let volatileListings: MarketplaceListing[] = [];

function storageAvailable(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isCurrency(value: unknown): value is MarketplaceCurrency {
  return value === "USD" || value === "SEK" || value === "EUR";
}

function isListing(value: unknown): value is MarketplaceListing {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<MarketplaceListing>;
  return (
    typeof candidate.id === "string"
    && typeof candidate.domain === "string"
    && typeof candidate.askingPrice === "number"
    && Number.isFinite(candidate.askingPrice)
    && isCurrency(candidate.currency)
    && candidate.category === "domain"
    && typeof candidate.description === "string"
    && (typeof candidate.contactName === "undefined" || typeof candidate.contactName === "string")
    && candidate.status === "local-draft"
    && typeof candidate.createdAt === "string"
  );
}

function nextId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function writeListings(listings: MarketplaceListing[]): void {
  volatileListings = listings.slice(0, MAX_LISTINGS);
  const storage = storageAvailable();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(volatileListings));
  } catch {
    // Private mode or quota restrictions should not make the screen unusable.
  }
}

export function getMarketplaceListings(): MarketplaceListing[] {
  const storage = storageAvailable();
  if (!storage) return [...volatileListings];

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [...volatileListings];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...volatileListings];
    const listings = parsed
      .filter(isListing)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    volatileListings = listings;
    return listings;
  } catch {
    return [...volatileListings];
  }
}

export function getMarketplaceListing(listingId: string | undefined): MarketplaceListing | null {
  if (!listingId) return null;
  return getMarketplaceListings().find((listing) => listing.id === listingId) ?? null;
}

export function createMarketplaceListing(input: MarketplaceListingInput): MarketplaceListing {
  const domain = normalizeMarketplaceApexDomain(input.domain);
  if (!domain) throw new Error("invalid-domain");

  const askingPrice = Number(input.askingPrice);
  if (!Number.isFinite(askingPrice) || askingPrice <= 0 || askingPrice > 1_000_000_000) {
    throw new Error("invalid-price");
  }

  const description = input.description.trim().slice(0, 1_400);
  if (!description) throw new Error("missing-description");

  const contactName = input.contactName?.trim().slice(0, 80) || undefined;
  const listing: MarketplaceListing = {
    id: nextId(),
    domain,
    askingPrice,
    currency: isCurrency(input.currency) ? input.currency : "USD",
    category: "domain",
    description,
    ...(contactName ? { contactName } : {}),
    status: "local-draft",
    createdAt: new Date().toISOString(),
  };

  writeListings([listing, ...getMarketplaceListings()]);
  return listing;
}

export function removeMarketplaceListing(listingId: string): void {
  writeListings(getMarketplaceListings().filter((listing) => listing.id !== listingId));
}

export function marketplaceListingUrl(listingId: string): string {
  const path = `/marketplace/${encodeURIComponent(listingId)}`;
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
}
