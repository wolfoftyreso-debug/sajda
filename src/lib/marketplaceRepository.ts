/**
 * Persistent domain-marketplace data contract.
 *
 * This module is intentionally separate from the legacy browser-draft helper
 * in marketplaceListings.ts. The latter keeps the current preview UI working;
 * this repository is historical input for the Neon/Vercel replacement. It
 * never handles a payment, registrar login, transfer code, or account
 * credential.
 */

import { hasSupabaseBrowserConfig, supabase } from "@/integrations/supabase/client";
import type { Database, Tables } from "@/integrations/supabase/types";
import { normalizeMarketplaceApexDomain } from "@/lib/marketplaceDomain";

export type MarketplaceCurrency = "USD" | "SEK" | "EUR";
export type MarketplaceListingStatus = Database["public"]["Enums"]["marketplace_listing_status"];
export type MarketplaceOwnershipVerificationStatus = Database["public"]["Enums"]["marketplace_ownership_verification_status"];
export type MarketplaceDomainControlProofStatus = Database["public"]["Enums"]["marketplace_domain_control_proof_status"];
export type MarketplaceOfferStatus = Database["public"]["Enums"]["marketplace_offer_status"];
export type MarketplaceRepositoryMode = "supabase" | "local-development";

type ListingRow = Tables<"marketplace_domain_listings">;
type PublicListingRow = Database["public"]["Views"]["marketplace_active_domain_listings"]["Row"];
type SellerProfileRow = Tables<"marketplace_seller_profiles">;
type DomainControlProofRow = Tables<"marketplace_domain_control_proofs">;
type DomainOfferRow = Tables<"marketplace_domain_offers">;
type AuditEventRow = Tables<"marketplace_audit_events">;

const LOCAL_STATE_KEY = "sajda.marketplace.persistence-development.v1";
const LOCAL_SELLER_ID = "local-development-seller";
const MAX_LOCAL_RECORDS = 200;
const DOMAIN_RESERVING_STATUSES = new Set<MarketplaceListingStatus>(["active", "paused"]);

export class MarketplaceRepositoryUnavailableError extends Error {
  constructor() {
    super(
      "Marketplace accounts are being moved to Neon. Persistent listings are not available in this deployment yet.",
    );
    this.name = "MarketplaceRepositoryUnavailableError";
  }
}

export interface MarketplaceSellerProfile {
  id: string;
  displayName: string;
  defaultCurrency: MarketplaceCurrency;
  createdAt: string;
  updatedAt: string;
}

export interface MarketplaceDomainListing {
  id: string;
  sellerId: string;
  sellerDisplayName: string;
  sourceUserDomainId: string | null;
  domain: string;
  description: string;
  askingPrice: number;
  currency: MarketplaceCurrency;
  status: MarketplaceListingStatus;
  ownershipVerificationStatus: MarketplaceOwnershipVerificationStatus;
  ownershipVerifiedAt: string | null;
  reviewedAt: string | null;
  publishedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MarketplacePublicDomainListing {
  id: string;
  domain: string;
  description: string;
  askingPrice: number;
  currency: MarketplaceCurrency;
  sellerDisplayName: string;
  publishedAt: string;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MarketplaceDomainControlProof {
  id: string;
  listingId: string;
  sellerId: string;
  challengeRecord: string;
  challengeToken: string;
  status: MarketplaceDomainControlProofStatus;
  expiresAt: string;
  submittedAt: string | null;
  checkedAt: string | null;
  verifiedAt: string | null;
  rejectedAt: string | null;
  verifierNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MarketplaceDomainOffer {
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  amount: number;
  currency: MarketplaceCurrency;
  message: string | null;
  status: MarketplaceOfferStatus;
  createdAt: string;
  updatedAt: string;
}

export interface MarketplaceAuditEvent {
  id: string;
  listingId: string | null;
  offerId: string | null;
  actorId: string | null;
  eventType: string;
  metadata: Database["public"]["Tables"]["marketplace_audit_events"]["Row"]["metadata"];
  createdAt: string;
}

export interface CreateMarketplaceListingInput {
  domain: string;
  description: string;
  askingPrice: number;
  currency: MarketplaceCurrency;
  sellerDisplayName: string;
  sourceUserDomainId?: string | null;
  expiresAt?: string | null;
}

export interface UpdateMarketplaceListingInput {
  domain?: string;
  description?: string;
  askingPrice?: number;
  currency?: MarketplaceCurrency;
  sellerDisplayName?: string;
  sourceUserDomainId?: string | null;
  expiresAt?: string | null;
  /**
   * The browser may only remove a listing from circulation. Publication,
   * review, and sold states are server-managed.
   */
  status?: "seller_declared" | "paused" | "withdrawn";
}

export interface CreateMarketplaceOfferInput {
  listingId: string;
  amount: number;
  message?: string;
}

export interface MarketplaceRepository {
  readonly mode: MarketplaceRepositoryMode;
  ensureSellerProfile(input: {
    displayName: string;
    defaultCurrency?: MarketplaceCurrency;
  }): Promise<MarketplaceSellerProfile>;
  getMySellerProfile(): Promise<MarketplaceSellerProfile | null>;
  createListing(input: CreateMarketplaceListingInput): Promise<MarketplaceDomainListing>;
  updateListing(id: string, input: UpdateMarketplaceListingInput): Promise<MarketplaceDomainListing>;
  getMyListing(id: string): Promise<MarketplaceDomainListing | null>;
  listMyListings(): Promise<MarketplaceDomainListing[]>;
  getPublicActiveListing(id: string): Promise<MarketplacePublicDomainListing | null>;
  listPublicActiveListings(): Promise<MarketplacePublicDomainListing[]>;
  beginDomainControlProof(listingId: string): Promise<Pick<
    MarketplaceDomainControlProof,
    "id" | "listingId" | "challengeRecord" | "challengeToken" | "status" | "expiresAt" | "createdAt"
  >>;
  submitDomainControlProof(proofId: string): Promise<MarketplaceDomainControlProofStatus>;
  listMyDomainControlProofs(listingId?: string): Promise<MarketplaceDomainControlProof[]>;
  createOffer(input: CreateMarketplaceOfferInput): Promise<MarketplaceDomainOffer>;
  updateOfferStatus(
    offerId: string,
    status: "withdrawn" | "accepted" | "declined",
  ): Promise<MarketplaceDomainOffer>;
  listMyOffers(listingId?: string): Promise<MarketplaceDomainOffer[]>;
  listMyListingAuditEvents(listingId: string): Promise<MarketplaceAuditEvent[]>;
}

interface LocalMarketplaceState {
  profiles: MarketplaceSellerProfile[];
  listings: MarketplaceDomainListing[];
  proofs: MarketplaceDomainControlProof[];
  offers: MarketplaceDomainOffer[];
  auditEvents: MarketplaceAuditEvent[];
}

function isSupabaseConfigured(): boolean {
  return hasSupabaseBrowserConfig;
}

function isDevelopmentFallbackAvailable(): boolean {
  return import.meta.env.DEV && !isSupabaseConfigured();
}

export function getMarketplaceRepositoryMode(): MarketplaceRepositoryMode {
  if (isSupabaseConfigured()) return "supabase";
  if (isDevelopmentFallbackAvailable()) return "local-development";
  throw new MarketplaceRepositoryUnavailableError();
}

function storageAvailable(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return [prefix, Date.now(), Math.random().toString(36).slice(2, 12)].join("-");
}

function now(): string {
  return new Date().toISOString();
}

function isCurrency(value: unknown): value is MarketplaceCurrency {
  return value === "USD" || value === "SEK" || value === "EUR";
}

function validateListingInput(input: CreateMarketplaceListingInput): CreateMarketplaceListingInput {
  const domain = normalizeMarketplaceApexDomain(input.domain);
  if (!domain) throw new Error("invalid-marketplace-domain");

  const description = input.description.trim().slice(0, 1400);
  if (!description) throw new Error("missing-marketplace-description");

  const sellerDisplayName = input.sellerDisplayName.trim().slice(0, 80);
  if (sellerDisplayName.length < 2) throw new Error("invalid-marketplace-seller-name");

  const askingPrice = Number(input.askingPrice);
  if (!Number.isFinite(askingPrice) || askingPrice <= 0 || askingPrice > 1_000_000_000) {
    throw new Error("invalid-marketplace-price");
  }
  if (!isCurrency(input.currency)) throw new Error("invalid-marketplace-currency");

  return {
    ...input,
    domain,
    description,
    sellerDisplayName,
    askingPrice,
    sourceUserDomainId: input.sourceUserDomainId || null,
    expiresAt: input.expiresAt || null,
  };
}

function mapSellerProfile(row: SellerProfileRow): MarketplaceSellerProfile {
  return {
    id: row.id,
    displayName: row.display_name,
    defaultCurrency: row.default_currency as MarketplaceCurrency,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapListing(row: ListingRow): MarketplaceDomainListing {
  return {
    id: row.id,
    sellerId: row.seller_id,
    sellerDisplayName: row.seller_display_name,
    sourceUserDomainId: row.source_user_domain_id,
    domain: row.domain,
    description: row.description,
    askingPrice: row.asking_price,
    currency: row.currency as MarketplaceCurrency,
    status: row.status,
    ownershipVerificationStatus: row.ownership_verification_status,
    ownershipVerifiedAt: row.ownership_verified_at,
    reviewedAt: row.reviewed_at,
    publishedAt: row.published_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPublicListing(row: PublicListingRow): MarketplacePublicDomainListing {
  if (
    !row.id
    || !row.domain
    || !row.description
    || typeof row.asking_price !== "number"
    || !row.currency
    || !row.seller_display_name
    || !row.published_at
    || !row.created_at
    || !row.updated_at
  ) {
    throw new Error("invalid-public-marketplace-listing");
  }

  return {
    id: row.id,
    domain: row.domain,
    description: row.description,
    askingPrice: row.asking_price,
    currency: row.currency as MarketplaceCurrency,
    sellerDisplayName: row.seller_display_name,
    publishedAt: row.published_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapProof(row: DomainControlProofRow): MarketplaceDomainControlProof {
  return {
    id: row.id,
    listingId: row.listing_id,
    sellerId: row.seller_id,
    challengeRecord: row.challenge_record,
    challengeToken: row.challenge_token,
    status: row.status,
    expiresAt: row.expires_at,
    submittedAt: row.submitted_at,
    checkedAt: row.checked_at,
    verifiedAt: row.verified_at,
    rejectedAt: row.rejected_at,
    verifierNote: row.verifier_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapOffer(row: DomainOfferRow): MarketplaceDomainOffer {
  return {
    id: row.id,
    listingId: row.listing_id,
    buyerId: row.buyer_id,
    sellerId: row.seller_id,
    amount: row.amount,
    currency: row.currency as MarketplaceCurrency,
    message: row.message,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAuditEvent(row: AuditEventRow): MarketplaceAuditEvent {
  return {
    id: row.id,
    listingId: row.listing_id,
    offerId: row.offer_id,
    actorId: row.actor_id,
    eventType: row.event_type,
    metadata: row.metadata,
    createdAt: row.created_at,
  };
}

async function currentSupabaseUserId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) throw new Error(error.message);
  if (!user) throw new Error("marketplace-authentication-required");
  return user.id;
}

function loadLocalState(): LocalMarketplaceState {
  const fallback: LocalMarketplaceState = {
    profiles: [],
    listings: [],
    proofs: [],
    offers: [],
    auditEvents: [],
  };
  const storage = storageAvailable();
  if (!storage) return fallback;

  try {
    const raw = storage.getItem(LOCAL_STATE_KEY);
    if (!raw) return fallback;
    const candidate = JSON.parse(raw) as Partial<LocalMarketplaceState>;
    return {
      profiles: Array.isArray(candidate.profiles) ? candidate.profiles.slice(0, MAX_LOCAL_RECORDS) : [],
      listings: Array.isArray(candidate.listings) ? candidate.listings.slice(0, MAX_LOCAL_RECORDS) : [],
      proofs: Array.isArray(candidate.proofs) ? candidate.proofs.slice(0, MAX_LOCAL_RECORDS) : [],
      offers: Array.isArray(candidate.offers) ? candidate.offers.slice(0, MAX_LOCAL_RECORDS) : [],
      auditEvents: Array.isArray(candidate.auditEvents) ? candidate.auditEvents.slice(0, MAX_LOCAL_RECORDS) : [],
    };
  } catch {
    return fallback;
  }
}

function saveLocalState(state: LocalMarketplaceState): void {
  const storage = storageAvailable();
  if (!storage) return;
  try {
    storage.setItem(
      LOCAL_STATE_KEY,
      JSON.stringify({
        profiles: state.profiles.slice(0, MAX_LOCAL_RECORDS),
        listings: state.listings.slice(0, MAX_LOCAL_RECORDS),
        proofs: state.proofs.slice(0, MAX_LOCAL_RECORDS),
        offers: state.offers.slice(0, MAX_LOCAL_RECORDS),
        auditEvents: state.auditEvents.slice(0, MAX_LOCAL_RECORDS),
      }),
    );
  } catch {
    // Development fallback stays usable in storage-restricted browsers.
  }
}

function appendLocalAudit(
  state: LocalMarketplaceState,
  event: Omit<MarketplaceAuditEvent, "id" | "createdAt">,
): void {
  state.auditEvents.unshift({
    ...event,
    id: createId("marketplace-audit"),
    createdAt: now(),
  });
}

function localSellerProfile(
  state: LocalMarketplaceState,
  displayName = "Local developer",
  defaultCurrency: MarketplaceCurrency = "USD",
): MarketplaceSellerProfile {
  const existing = state.profiles.find((profile) => profile.id === LOCAL_SELLER_ID);
  if (existing) return existing;
  const timestamp = now();
  const profile: MarketplaceSellerProfile = {
    id: LOCAL_SELLER_ID,
    displayName,
    defaultCurrency,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  state.profiles.unshift(profile);
  return profile;
}

function reservesMarketplaceDomain(listing: MarketplaceDomainListing): boolean {
  return DOMAIN_RESERVING_STATUSES.has(listing.status)
    && listing.ownershipVerificationStatus === "verified";
}

function hasLocalDomainReservation(
  listings: readonly MarketplaceDomainListing[],
  domain: string,
  exceptListingId?: string,
): boolean {
  return listings.some(
    (listing) => listing.id !== exceptListingId && listing.domain === domain && reservesMarketplaceDomain(listing),
  );
}

function assertLocalMode(): void {
  if (!isDevelopmentFallbackAvailable()) throw new MarketplaceRepositoryUnavailableError();
}

const localRepository: MarketplaceRepository = {
  mode: "local-development",

  async ensureSellerProfile(input) {
    assertLocalMode();
    const state = loadLocalState();
    const displayName = input.displayName.trim().slice(0, 80);
    if (displayName.length < 2) throw new Error("invalid-marketplace-seller-name");

    const profile = localSellerProfile(state, displayName, input.defaultCurrency || "USD");
    profile.displayName = displayName;
    profile.defaultCurrency = input.defaultCurrency || profile.defaultCurrency;
    profile.updatedAt = now();
    saveLocalState(state);
    return profile;
  },

  async getMySellerProfile() {
    assertLocalMode();
    return loadLocalState().profiles.find((profile) => profile.id === LOCAL_SELLER_ID) || null;
  },

  async createListing(input) {
    assertLocalMode();
    const validated = validateListingInput(input);
    const state = loadLocalState();
    localSellerProfile(state, validated.sellerDisplayName, validated.currency);
    if (hasLocalDomainReservation(state.listings, validated.domain)) {
      throw new Error("marketplace-domain-already-listed");
    }

    const timestamp = now();
    const listing: MarketplaceDomainListing = {
      id: createId("marketplace-listing"),
      sellerId: LOCAL_SELLER_ID,
      sellerDisplayName: validated.sellerDisplayName,
      sourceUserDomainId: validated.sourceUserDomainId || null,
      domain: validated.domain,
      description: validated.description,
      askingPrice: validated.askingPrice,
      currency: validated.currency,
      status: "seller_declared",
      ownershipVerificationStatus: "not_requested",
      ownershipVerifiedAt: null,
      reviewedAt: null,
      publishedAt: null,
      expiresAt: validated.expiresAt || null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    state.listings.unshift(listing);
    appendLocalAudit(state, {
      listingId: listing.id,
      offerId: null,
      actorId: LOCAL_SELLER_ID,
      eventType: "listing.created",
      metadata: { domain: listing.domain, status: listing.status },
    });
    saveLocalState(state);
    return listing;
  },

  async updateListing(id, input) {
    assertLocalMode();
    const state = loadLocalState();
    const listing = state.listings.find((candidate) => candidate.id === id && candidate.sellerId === LOCAL_SELLER_ID);
    if (!listing) throw new Error("marketplace-listing-not-found");

    const domain = input.domain === undefined ? listing.domain : normalizeMarketplaceApexDomain(input.domain);
    if (!domain) throw new Error("invalid-marketplace-domain");
    if (hasLocalDomainReservation(state.listings, domain, listing.id)) {
      throw new Error("marketplace-domain-already-listed");
    }
    if (input.description !== undefined && !input.description.trim()) throw new Error("missing-marketplace-description");
    if (input.askingPrice !== undefined && (!Number.isFinite(input.askingPrice) || input.askingPrice <= 0)) {
      throw new Error("invalid-marketplace-price");
    }
    if (input.currency !== undefined && !isCurrency(input.currency)) throw new Error("invalid-marketplace-currency");
    if (input.status && !["seller_declared", "paused", "withdrawn"].includes(input.status)) {
      throw new Error("marketplace-status-is-server-managed");
    }

    const domainChanged = domain !== listing.domain;
    listing.domain = domain;
    listing.description = input.description?.trim().slice(0, 1400) || listing.description;
    listing.askingPrice = input.askingPrice ?? listing.askingPrice;
    listing.currency = input.currency ?? listing.currency;
    listing.sellerDisplayName = input.sellerDisplayName?.trim().slice(0, 80) || listing.sellerDisplayName;
    listing.sourceUserDomainId = input.sourceUserDomainId === undefined ? listing.sourceUserDomainId : input.sourceUserDomainId;
    listing.expiresAt = input.expiresAt === undefined ? listing.expiresAt : input.expiresAt;
    listing.status = input.status ?? (domainChanged ? "seller_declared" : listing.status);
    if (domainChanged) {
      listing.ownershipVerificationStatus = "not_requested";
      listing.ownershipVerifiedAt = null;
      listing.reviewedAt = null;
      listing.publishedAt = null;
      state.proofs.forEach((proof) => {
        if (proof.listingId === listing.id && ["challenge_issued", "submitted"].includes(proof.status)) {
          proof.status = "expired";
          proof.updatedAt = now();
        }
      });
    }
    listing.updatedAt = now();
    appendLocalAudit(state, {
      listingId: listing.id,
      offerId: null,
      actorId: LOCAL_SELLER_ID,
      eventType: "listing.updated",
      metadata: { domain: listing.domain, status: listing.status },
    });
    saveLocalState(state);
    return listing;
  },

  async getMyListing(id) {
    assertLocalMode();
    return loadLocalState().listings.find((listing) => listing.id === id && listing.sellerId === LOCAL_SELLER_ID) || null;
  },

  async listMyListings() {
    assertLocalMode();
    return loadLocalState()
      .listings
      .filter((listing) => listing.sellerId === LOCAL_SELLER_ID)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  },

  async getPublicActiveListing(id) {
    assertLocalMode();
    return (await localRepository.listPublicActiveListings()).find((listing) => listing.id === id) || null;
  },

  async listPublicActiveListings() {
    assertLocalMode();
    const referenceTime = Date.now();
    return loadLocalState()
      .listings
      .filter(
        (listing) =>
          listing.status === "active"
          && listing.ownershipVerificationStatus === "verified"
          && (!listing.expiresAt || new Date(listing.expiresAt).getTime() > referenceTime),
      )
      .sort((left, right) => (right.publishedAt || "").localeCompare(left.publishedAt || ""))
      .map((listing) => ({
        id: listing.id,
        domain: listing.domain,
        description: listing.description,
        askingPrice: listing.askingPrice,
        currency: listing.currency,
        sellerDisplayName: listing.sellerDisplayName,
        publishedAt: listing.publishedAt || listing.createdAt,
        expiresAt: listing.expiresAt,
        createdAt: listing.createdAt,
        updatedAt: listing.updatedAt,
      }));
  },

  async beginDomainControlProof(listingId) {
    assertLocalMode();
    const state = loadLocalState();
    const listing = state.listings.find((candidate) => candidate.id === listingId && candidate.sellerId === LOCAL_SELLER_ID);
    if (!listing) throw new Error("marketplace-listing-not-found");
    if (["withdrawn", "sold", "rejected"].includes(listing.status)) throw new Error("marketplace-listing-not-eligible-for-proof");

    state.proofs.forEach((proof) => {
      if (proof.listingId === listingId && ["challenge_issued", "submitted"].includes(proof.status)) {
        proof.status = "expired";
        proof.updatedAt = now();
      }
    });

    const timestamp = now();
    const challengeToken = createId("proof").replace(/[^a-f0-9]/gi, "").slice(0, 32).padEnd(32, "0").toLowerCase();
    const proof: MarketplaceDomainControlProof = {
      id: createId("marketplace-proof"),
      listingId,
      sellerId: LOCAL_SELLER_ID,
      challengeRecord: "_sajda." + listing.domain,
      challengeToken,
      status: "challenge_issued",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      submittedAt: null,
      checkedAt: null,
      verifiedAt: null,
      rejectedAt: null,
      verifierNote: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    listing.status = "proof_pending";
    listing.ownershipVerificationStatus = "challenge_issued";
    listing.ownershipVerifiedAt = null;
    listing.reviewedAt = null;
    listing.publishedAt = null;
    listing.updatedAt = timestamp;
    state.proofs.unshift(proof);
    appendLocalAudit(state, {
      listingId,
      offerId: null,
      actorId: LOCAL_SELLER_ID,
      eventType: "proof.issued",
      metadata: { proofId: proof.id, status: proof.status },
    });
    saveLocalState(state);
    return {
      id: proof.id,
      listingId: proof.listingId,
      challengeRecord: proof.challengeRecord,
      challengeToken: proof.challengeToken,
      status: proof.status,
      expiresAt: proof.expiresAt,
      createdAt: proof.createdAt,
    };
  },

  async submitDomainControlProof(proofId) {
    assertLocalMode();
    const state = loadLocalState();
    const proof = state.proofs.find((candidate) => candidate.id === proofId && candidate.sellerId === LOCAL_SELLER_ID);
    if (!proof) throw new Error("marketplace-proof-not-found");
    if (proof.status !== "challenge_issued") throw new Error("marketplace-proof-not-submittable");
    if (new Date(proof.expiresAt).getTime() <= Date.now()) {
      proof.status = "expired";
      proof.updatedAt = now();
      saveLocalState(state);
      return "expired";
    }

    proof.status = "submitted";
    proof.submittedAt = now();
    proof.updatedAt = proof.submittedAt;
    const listing = state.listings.find((candidate) => candidate.id === proof.listingId);
    if (listing) {
      listing.status = "under_review";
      listing.ownershipVerificationStatus = "pending_review";
      listing.updatedAt = proof.updatedAt;
    }
    appendLocalAudit(state, {
      listingId: proof.listingId,
      offerId: null,
      actorId: LOCAL_SELLER_ID,
      eventType: "proof.submitted",
      metadata: { proofId: proof.id, status: proof.status },
    });
    saveLocalState(state);
    return "submitted";
  },

  async listMyDomainControlProofs(listingId) {
    assertLocalMode();
    return loadLocalState()
      .proofs
      .filter((proof) => proof.sellerId === LOCAL_SELLER_ID && (!listingId || proof.listingId === listingId))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  },

  async createOffer(input) {
    assertLocalMode();
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) throw new Error("invalid-marketplace-offer");
    const listing = await localRepository.getPublicActiveListing(input.listingId);
    if (!listing) throw new Error("marketplace-listing-not-open-for-offers");

    const state = loadLocalState();
    const timestamp = now();
    const offer: MarketplaceDomainOffer = {
      id: createId("marketplace-offer"),
      listingId: listing.id,
      buyerId: LOCAL_SELLER_ID,
      sellerId: "public-seller",
      amount,
      currency: listing.currency,
      message: input.message?.trim().slice(0, 1000) || null,
      status: "submitted",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    state.offers.unshift(offer);
    appendLocalAudit(state, {
      listingId: listing.id,
      offerId: offer.id,
      actorId: LOCAL_SELLER_ID,
      eventType: "offer.submitted",
      metadata: { amount: offer.amount, currency: offer.currency, status: offer.status },
    });
    saveLocalState(state);
    return offer;
  },

  async updateOfferStatus(offerId, status) {
    assertLocalMode();
    const state = loadLocalState();
    const offer = state.offers.find((candidate) => candidate.id === offerId);
    if (!offer) throw new Error("marketplace-offer-not-found");
    if (offer.status !== "submitted") throw new Error("marketplace-offer-not-actionable");
    if (offer.buyerId === LOCAL_SELLER_ID && status !== "withdrawn") {
      throw new Error("marketplace-offer-status-not-permitted");
    }
    if (offer.sellerId === LOCAL_SELLER_ID && !["accepted", "declined"].includes(status)) {
      throw new Error("marketplace-offer-status-not-permitted");
    }
    if (offer.buyerId !== LOCAL_SELLER_ID && offer.sellerId !== LOCAL_SELLER_ID) {
      throw new Error("marketplace-offer-status-not-permitted");
    }
    offer.status = status;
    offer.updatedAt = now();
    appendLocalAudit(state, {
      listingId: offer.listingId,
      offerId: offer.id,
      actorId: LOCAL_SELLER_ID,
      eventType: "offer.status_changed",
      metadata: { status: offer.status },
    });
    saveLocalState(state);
    return offer;
  },

  async listMyOffers(listingId) {
    assertLocalMode();
    return loadLocalState()
      .offers
      .filter(
        (offer) =>
          (offer.buyerId === LOCAL_SELLER_ID || offer.sellerId === LOCAL_SELLER_ID)
          && (!listingId || offer.listingId === listingId),
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  },

  async listMyListingAuditEvents(listingId) {
    assertLocalMode();
    const listing = await localRepository.getMyListing(listingId);
    if (!listing) return [];
    return loadLocalState()
      .auditEvents
      .filter((event) => event.listingId === listingId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  },
};

const supabaseRepository: MarketplaceRepository = {
  mode: "supabase",

  async ensureSellerProfile(input) {
    const userId = await currentSupabaseUserId();
    const displayName = input.displayName.trim().slice(0, 80);
    if (displayName.length < 2) throw new Error("invalid-marketplace-seller-name");
    if (input.defaultCurrency && !isCurrency(input.defaultCurrency)) throw new Error("invalid-marketplace-currency");

    const { data, error } = await supabase
      .from("marketplace_seller_profiles")
      .upsert(
        {
          id: userId,
          display_name: displayName,
          default_currency: input.defaultCurrency || "USD",
        },
        { onConflict: "id" },
      )
      .select()
      .single();
    if (error) throw new Error(error.message);
    return mapSellerProfile(data);
  },

  async getMySellerProfile() {
    await currentSupabaseUserId();
    const { data, error } = await supabase
      .from("marketplace_seller_profiles")
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? mapSellerProfile(data) : null;
  },

  async createListing(input) {
    const userId = await currentSupabaseUserId();
    const validated = validateListingInput(input);
    const { data, error } = await supabase
      .from("marketplace_domain_listings")
      .insert({
        seller_id: userId,
        seller_display_name: validated.sellerDisplayName,
        source_user_domain_id: validated.sourceUserDomainId || null,
        domain: validated.domain,
        description: validated.description,
        asking_price: validated.askingPrice,
        currency: validated.currency,
        expires_at: validated.expiresAt || null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return mapListing(data);
  },

  async updateListing(id, input) {
    await currentSupabaseUserId();
    const normalizedDomain = input.domain === undefined ? undefined : normalizeMarketplaceApexDomain(input.domain);
    if (input.domain !== undefined && !normalizedDomain) throw new Error("invalid-marketplace-domain");
    if (input.description !== undefined && !input.description.trim()) throw new Error("missing-marketplace-description");
    if (input.askingPrice !== undefined && (!Number.isFinite(input.askingPrice) || input.askingPrice <= 0)) {
      throw new Error("invalid-marketplace-price");
    }
    if (input.currency !== undefined && !isCurrency(input.currency)) throw new Error("invalid-marketplace-currency");

    const updates: Database["public"]["Tables"]["marketplace_domain_listings"]["Update"] = {};
    if (normalizedDomain !== undefined) updates.domain = normalizedDomain;
    if (input.description !== undefined) updates.description = input.description.trim().slice(0, 1400);
    if (input.askingPrice !== undefined) updates.asking_price = input.askingPrice;
    if (input.currency !== undefined) updates.currency = input.currency;
    if (input.sellerDisplayName !== undefined) updates.seller_display_name = input.sellerDisplayName.trim().slice(0, 80);
    if (input.sourceUserDomainId !== undefined) updates.source_user_domain_id = input.sourceUserDomainId;
    if (input.expiresAt !== undefined) updates.expires_at = input.expiresAt;
    if (input.status !== undefined) updates.status = input.status;

    const { data, error } = await supabase
      .from("marketplace_domain_listings")
      .update(updates)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return mapListing(data);
  },

  async getMyListing(id) {
    await currentSupabaseUserId();
    const { data, error } = await supabase
      .from("marketplace_domain_listings")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? mapListing(data) : null;
  },

  async listMyListings() {
    await currentSupabaseUserId();
    const { data, error } = await supabase
      .from("marketplace_domain_listings")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data || []).map(mapListing);
  },

  async getPublicActiveListing(id) {
    const { data, error } = await supabase
      .from("marketplace_active_domain_listings")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? mapPublicListing(data) : null;
  },

  async listPublicActiveListings() {
    const { data, error } = await supabase
      .from("marketplace_active_domain_listings")
      .select("*")
      .order("published_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data || []).map(mapPublicListing);
  },

  async beginDomainControlProof(listingId) {
    await currentSupabaseUserId();
    const { data, error } = await supabase.rpc("begin_marketplace_domain_control_proof", {
      p_listing_id: listingId,
    });
    if (error) throw new Error(error.message);
    const proof = data?.[0];
    if (!proof) throw new Error("marketplace-proof-not-created");
    return {
      id: proof.id,
      listingId: proof.listing_id,
      challengeRecord: proof.challenge_record,
      challengeToken: proof.challenge_token,
      status: proof.status,
      expiresAt: proof.expires_at,
      createdAt: proof.created_at,
    };
  },

  async submitDomainControlProof(proofId) {
    await currentSupabaseUserId();
    const { data, error } = await supabase.rpc("submit_marketplace_domain_control_proof", {
      p_proof_id: proofId,
    });
    if (error) throw new Error(error.message);
    return data;
  },

  async listMyDomainControlProofs(listingId) {
    await currentSupabaseUserId();
    let query = supabase
      .from("marketplace_domain_control_proofs")
      .select("*")
      .order("created_at", { ascending: false });
    if (listingId) query = query.eq("listing_id", listingId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data || []).map(mapProof);
  },

  async createOffer(input) {
    const buyerId = await currentSupabaseUserId();
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) {
      throw new Error("invalid-marketplace-offer");
    }
    const { data, error } = await supabase
      .from("marketplace_domain_offers")
      .insert({
        listing_id: input.listingId,
        buyer_id: buyerId,
        amount,
        message: input.message?.trim().slice(0, 1000) || null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return mapOffer(data);
  },

  async updateOfferStatus(offerId, status) {
    await currentSupabaseUserId();
    const { data, error } = await supabase
      .from("marketplace_domain_offers")
      .update({ status })
      .eq("id", offerId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return mapOffer(data);
  },

  async listMyOffers(listingId) {
    await currentSupabaseUserId();
    let query = supabase
      .from("marketplace_domain_offers")
      .select("*")
      .order("created_at", { ascending: false });
    if (listingId) query = query.eq("listing_id", listingId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data || []).map(mapOffer);
  },

  async listMyListingAuditEvents(listingId) {
    await currentSupabaseUserId();
    const { data, error } = await supabase
      .from("marketplace_audit_events")
      .select("*")
      .eq("listing_id", listingId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data || []).map(mapAuditEvent);
  },
};

/**
 * One explicit repository selector keeps browser-local records out of
 * production. In a configured deployment all writes go through Supabase/RLS;
 * in an unconfigured Vite development session only, a separate local sandbox
 * is available for UI work.
 */
export function getMarketplaceRepository(): MarketplaceRepository {
  return getMarketplaceRepositoryMode() === "supabase" ? supabaseRepository : localRepository;
}
