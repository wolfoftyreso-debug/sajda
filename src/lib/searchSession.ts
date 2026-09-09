import type { DiscoveredDomain } from "@/contexts/ScanContext";

const KEY = "sajda.search-results.v1";
const MAX_AGE_MS = 30 * 60 * 1000;

function validOffer(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const offer = value as Record<string, unknown>;
  if (typeof offer.registrar !== "string" || typeof offer.currency !== "string" || typeof offer.priceVerified !== "boolean") return false;
  for (const key of ["purchaseUrl", "priceSourceUrl"]) {
    try { if (typeof offer[key] !== "string" || new URL(offer[key]).protocol !== "https:") return false; }
    catch { return false; }
  }
  for (const key of ["note", "checkedAt", "providerId", "priceStatus", "dataSource", "connectorState", "taxTreatment", "priceScope", "priceType"]) {
    if (offer[key] !== undefined && typeof offer[key] !== "string") return false;
  }
  for (const key of ["registrationPriceInclVat", "registrationPriceExVat", "renewalPriceInclVat", "registrationPrice", "renewalPrice", "icannFee"]) {
    if (offer[key] !== undefined && (typeof offer[key] !== "number" || !Number.isFinite(offer[key]) || offer[key] < 0)) return false;
  }
  return true;
}

/** A short-lived, tab-local snapshot. Never stores the brief, token or account. */
export function readSearchSession(): DiscoveredDomain[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return [];
    const value = JSON.parse(raw);
    if (value?.version !== 1 || !Number.isFinite(value.savedAt) || value.savedAt > Date.now()
      || Date.now() - value.savedAt > MAX_AGE_MS || !Array.isArray(value.domains)) return [];
    return value.domains.slice(0, 50).filter((item: unknown) => {
      if (!item || typeof item !== "object") return false;
      const domain = item as DiscoveredDomain;
      return typeof domain.domain === "string" && /^[a-z0-9-]+\.[a-z]{2,63}$/.test(domain.domain)
        && ["available", "taken", "unknown"].includes(domain.status)
        && typeof domain.rationale === "string"
        && typeof domain.tld === "string"
        && Number.isFinite(domain.estimatedValue) && Number.isFinite(domain.confidenceScore)
        && validOffer(domain.registrarOffer)
        && (domain.providerOffers === undefined || (Array.isArray(domain.providerOffers) && domain.providerOffers.length <= 20 && domain.providerOffers.every(validOffer)))
        && typeof domain.registrarUrl === "string" && domain.registrarUrl.startsWith("https://");
    });
  } catch { return []; }
}

export function writeSearchSession(domains: DiscoveredDomain[]): void {
  if (typeof window === "undefined") return;
  try {
    if (!domains.length) window.sessionStorage.removeItem(KEY);
    else window.sessionStorage.setItem(KEY, JSON.stringify({ version: 1, savedAt: Date.now(), domains: domains.slice(0, 50) }));
  } catch { /* Storage restrictions must never turn a successful search into failure. */ }
}
