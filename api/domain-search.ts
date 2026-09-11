import { randomBytes } from "node:crypto";
import { generateContextualNames, refineRuleCandidates, type NamingInput } from "./_shared/contextual-naming.js";
import { parseSearchRefinement, type NamingGeneration, type SearchRefinement } from "../shared/search-refinement.js";
import { parseAiConsent, type AiConsent } from "../shared/ai-consent.js";
import { asciiNameToken, joinNameWords, nameQualitySignals, interpretRdapResponse, readRegistryResponse, registryRetryAt } from "./_shared/search-quality.mjs";
import {
  createRequestId,
  setPublicApiHeaders,
  withMachineErrorCode,
} from "./_shared/public-api.js";

/*
 * Public Vercel function for the anonymous Sajda search surface.
 *
 * It deliberately uses HTTPS RDAP only for the audited, IANA-published
 * registry endpoints below. .se and .nu remain unverified until a secure,
 * approved availability connector is configured; their public DAS is HTTP-only.
 * Every other TLD is returned as unknown: the API never guesses that a domain
 * is available.
 */

type AvailabilityStatus = "available" | "taken" | "unknown";
type CheckMethod = "rdap" | "das" | "none";
type Locale = "en" | "sv" | "es" | "fr" | "zh";
type NameLanguage = "auto" | "en" | "sv" | "mixed";
type NameStyle = "balanced" | "brandable" | "descriptive" | "invented";
// These are the API counterparts of the four basic creative-search cards.
// They are not advanced criteria and never override explicit advanced inputs.
type CreativeSearchMode = "light" | "medium" | "heavy" | "deep";
type ProviderId =
  | "loopia"
  | "cloudflare"
  | "godaddy"
  | "namecheap"
  | "porkbun"
  | "dynadot"
  | "route53"
  | "onecom"
  | "ionos"
  | "ovhcloud"
  | "squarespace"
  | "hostinger"
  | "gandi"
  | "hover"
  | "spaceship"
  | "namecom"
  | "namesilo"
  | "alibabacloud"
  | "internetbs"
  | "wix"
  // These providers are intentionally backend-only. Their reseller products
  // are useful adapter targets but must not be surfaced as public checkout
  // choices without a separate buyer-facing agreement and UX.
  | "openprovider"
  | "resellerclub";
type PublicProviderId = Exclude<ProviderId, "openprovider" | "resellerclub">;
type ProviderPriceStatus = "verified" | "unavailable" | "not_connected";
type ProviderPriceDataSource = "loopia_public_price_list" | "official_provider_api" | "provider_search_page" | "tldes_price_feed";
// A published TLD price is useful, but it is not a per-domain checkout quote.
// Keep the distinction in the API contract so the UI never overstates it.
type ProviderPriceScope = "standard_tld" | "exact_domain_offer";
type ProviderPriceConnectorState =
  | "public_source_active"
  | "official_api_not_configured"
  | "official_api_credentials_configured"
  // A server-only TLDES key enables a bounded, hourly standard-TLD price
  // feed. It is intentionally distinct from a registrar's own API.
  | "aggregated_price_feed_configured";
type ProviderPriceTaxTreatment = "included" | "excluded" | "unknown";
type AvailabilityErrorCode =
  | "rdapRateLimited"
  | `rdapHttp:${number}`
  | "rdapFailed"
  | "rdapResponseUnsafe"
  | "registryBudgetExceeded"
  | "insecureTransportDisabled"
  | `dasHttp:${number}`
  | "dasResponseUnsafe"
  | "dasFailed"
  | "unsupportedTld";
type NamingPattern =
  | "exactDomain"
  | "keyword"
  | "swedishCompound"
  | "englishCompound"
  | "brandBlend"
  | "thematicPair"
  | "thematicSwedishCompound"
  | "thematicEnglishCompound"
  | "reverseWordplay"
  | "softBlend"
  | "creativeVariant"
  | "imageLedPair"
  | "creativePair"
  | "brandWord"
  | "playfulCompound"
  | "contextual"
  | "swipeRandom";

interface RegistrarOffer {
  providerId: ProviderId;
  registrar: string;
  purchaseUrl: string;
  priceSourceUrl: string;
  // Stable machine-readable fields for comparison UI. `note` remains the
  // localized explanation for people; these values must never be inferred
  // from a screen value or a provider's marketing page.
  priceStatus: ProviderPriceStatus;
  dataSource: ProviderPriceDataSource;
  connectorState: ProviderPriceConnectorState;
  priceScope?: ProviderPriceScope;
  // The direct Loopia source is SEK; the aggregated source can legitimately
  // use other ISO-style three-letter currencies. Values are schema-validated
  // before leaving the server.
  currency?: string;
  // Aggregated feeds can report a native registration/renewal price without
  // declaring whether VAT or other checkout fees are included. Keep those
  // values separate from the explicit Loopia incl./excl.-VAT fields.
  registrationPrice?: number;
  renewalPrice?: number;
  // Reported separately by TLDES when it displays an ICANN fee. It is never
  // silently folded into the registration or renewal price.
  icannFee?: number;
  taxTreatment?: ProviderPriceTaxTreatment;
  registrationPriceInclVat?: number;
  registrationPriceExVat?: number;
  renewalPriceInclVat?: number;
  priceType?: "campaign" | "standard";
  // Null means no provider price lookup was performed. It is deliberately
  // distinct from `unavailable`, where Loopia was checked but had no usable
  // verified price for this suffix.
  checkedAt: string | null;
  priceVerified: boolean;
  note?: string;
}

interface AvailabilityResult {
  domain: string;
  tld: string;
  status: AvailabilityStatus;
  checkMethod: CheckMethod;
  source: string;
  authoritative: boolean;
  error?: string;
  // Kept internal so registry failures can be cached without pinning the
  // first request's UI language into later responses.
  errorCode?: AvailabilityErrorCode;
}

interface SearchResult extends Omit<AvailabilityResult, "errorCode"> {
  registrarPrice: number;
  estimatedValue: number;
  confidenceScore: number;
  namingScore: number;
  rankingPosition?: number;
  rationale: string;
  // The first selected provider remains available for older clients. New
  // clients render every selected provider from registrarOffers side by side.
  registrarOffer: RegistrarOffer;
  registrarOffers: RegistrarOffer[];
}

interface ProviderCatalogEntry {
  id: ProviderId;
  registrar: string;
  purchaseUrl: (domain: string) => string;
  priceSourceUrl: string;
}

type RdapTld = "com" | "net" | "org" | "app" | "dev" | "ai" | "xyz" | "info" | "biz";

interface RdapRegistry {
  endpoint: string;
  source: string;
}

interface VercelRequestLike {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

interface VercelResponseLike {
  setHeader(name: string, value: string | number): void;
  status(code: number): VercelResponseLike;
  json(payload: unknown): void;
  end(payload?: string): void;
}

// A Symbol is deliberately used instead of an HTTP header. Only another
// server-side module in this deployment can attach it, so an anonymous caller
// cannot opt into the authenticated API quota by sending a forged header.
const TRUSTED_API_ID = Symbol("sajda.trusted-api-id");
const TRUSTED_REQUEST_ID = Symbol("sajda.trusted-request-id");
type TrustedApiEngineRequest = VercelRequestLike & {
  [TRUSTED_API_ID]?: string;
  [TRUSTED_REQUEST_ID]?: string;
};

/**
 * Creates an internal, authenticated invocation of the exact same search
 * engine used by the public endpoint. This is intentionally not a client
 * authentication mechanism: the v1 API route has already validated a
 * server-held API-key hash before it calls this helper.
 */
export function createTrustedApiEngineRequest(
  request: VercelRequestLike,
  body: Record<string, unknown>,
  clientId: string,
  requestId?: string,
): VercelRequestLike {
  if (!/^[a-z0-9][a-z0-9_-]{2,63}$/u.test(clientId)) {
    throw new Error("Invalid trusted API client identity.");
  }
  if (requestId !== undefined && !/^req_[A-Za-z0-9_-]{12,64}$/u.test(requestId)) {
    throw new Error("Invalid trusted API request identity.");
  }

  return {
    method: "POST",
    headers: request.headers,
    body,
    [TRUSTED_API_ID]: clientId,
    ...(requestId ? { [TRUSTED_REQUEST_ID]: requestId } : {}),
  } as TrustedApiEngineRequest;
}

/**
 * Creates an internal request for the no-key public v1 wrapper.
 *
 * The Symbol preserves one server-generated correlation ID while deliberately
 * omitting the trusted API identity. That means the delegated call keeps the
 * anonymous CORS and per-IP rate policy; a caller cannot forge either value
 * through an HTTP header.
 */
export function createPublicApiEngineRequest(
  request: VercelRequestLike,
  body: Record<string, unknown>,
  requestId: string,
): VercelRequestLike {
  if (!/^req_[A-Za-z0-9_-]{12,64}$/u.test(requestId)) {
    throw new Error("Invalid public API request identity.");
  }
  return {
    method: "POST",
    headers: request.headers,
    body,
    [TRUSTED_REQUEST_ID]: requestId,
  } as TrustedApiEngineRequest;
}

interface RateLimitEntry {
  startedAt: number;
  count: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

interface CacheEntry {
  createdAt: number;
  result: AvailabilityResult;
}

interface RegistrarPriceCacheEntry {
  createdAt: number;
  checkedAt: string;
  offers: Map<string, RegistrarOffer>;
}

interface RegistrarPriceLookup {
  checkedAt: string | null;
  offers: Map<string, RegistrarOffer>;
}

interface TldesPriceFeedCacheEntry {
  createdAt: number;
  checkedAt: string | null;
  offers: Map<string, RegistrarOffer>;
}

interface TldesPriceFeedLookup {
  configured: boolean;
  checkedAt: string | null;
  offers: Map<string, RegistrarOffer>;
}

interface OfficialProviderPriceApiEnvironment {
  endpointEnv: string;
  tokenEnv: string;
}

interface GeneratedLabel {
  label: string;
  family: string;
  namingPattern: NamingPattern;
  score: number;
  isReferenceRelevant: boolean;
  isPriorityReferenceRelevant: boolean;
}

interface GeneratedCandidate {
  domain: string;
  namingPattern: NamingPattern;
}

interface BriefAnalysis {
  // "local" means the deterministic on-server analyser was used. "ai" is
  // only returned after a configured OpenAI request has produced and passed
  // the schema validation below.
  mode: "ai" | "local";
  themes: string[];
  creativeDirections: string[];
  summary: string;
}

/**
 * An advanced-search-only, normalized request shape. The values are returned
 * unchanged to the caller so a result set is explainable and repeatable.
 */
interface AdvancedSearchCriteria {
  minLength: number;
  maxLength: number;
  nameLanguage: NameLanguage;
  nameStyle: NameStyle;
  includeWords: string[];
  excludeWords: string[];
}

interface SwipeLengthRange {
  minLength: number;
  maxLength: number;
}

interface SwipeVerificationRun {
  checked: number;
  unknown: number;
  available: Array<{
    candidate: GeneratedCandidate;
    availability: AvailabilityResult;
  }>;
}

const MAX_BODY_BYTES = 12_288;
// The public surface is intentionally sized for a useful creative session,
// rather than a one-word availability check. A request for 50 gets a reserve
// of extra names so the client can still show fifty after taken
// names are hidden. The hard cap keeps worst-case registry work inside the
// Vercel function budget.
const DEFAULT_CANDIDATES = 50;
const MAX_CANDIDATES = 80;
const AVAILABILITY_BUFFER = 30;
// Exact checks intentionally have their own smaller cap. They bypass the
// creative generator, but must remain a bounded registry request.
const MAX_EXACT_DOMAINS = 12;
const REQUESTS_PER_MINUTE = 6;
const CACHE_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 1_000;
const REGISTRY_TIMEOUT_MS = 3_500;
const REGISTRY_CONCURRENCY = 10;
const REGISTRAR_PRICE_CACHE_TTL_MS = 60_000;
const LOOPIA_PRICE_FETCH_TIMEOUT_MS = 7_500;
const LOOPIA_PRICE_RESPONSE_LIMIT_BYTES = 1_000_000;
const PORKBUN_PRICE_CACHE_TTL_MS = 15 * 60_000;
const PORKBUN_PRICE_FAILURE_CACHE_TTL_MS = 60_000;
const PORKBUN_PRICE_FETCH_TIMEOUT_MS = 7_500;
const PORKBUN_PRICE_RESPONSE_LIMIT_BYTES = 1_000_000;
// TLDES refreshes the source hourly. Cache a complete, filtered public
// provider snapshot just under an hour so repeated domain checks do not turn
// into provider-site scraping or expose the server-only API key.
const TLDES_PRICE_CACHE_TTL_MS = 55 * 60_000;
const TLDES_PRICE_FAILURE_CACHE_TTL_MS = 60_000;
const TLDES_PRICE_FETCH_TIMEOUT_MS = 7_500;
const TLDES_PRICE_RESPONSE_LIMIT_BYTES = 1_000_000;
const TLDES_PRICE_MAX_AGE_MS = 2 * 60 * 60_000;
type RegistrarPriceFailureReason = "http_error" | "unexpected_content_type" | "invalid_response" | "no_usable_prices" | "timeout" | "request_failed";
class RegistrarPriceSourceError extends Error {
  constructor(readonly reason: RegistrarPriceFailureReason, readonly status?: number) {
    super("Registrar price source unavailable.");
  }
}

/** One fixed-schema diagnostic per failed upstream snapshot, never per name.
 * Existing source caches bound repeats. Provider payloads, URLs, credentials,
 * search terms and domain names must never enter these records. */
function logRegistrarPriceFailure(provider: "loopia" | "porkbun", error: unknown): void {
  const reason = error instanceof RegistrarPriceSourceError ? error.reason
    : error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name) ? "timeout" : "request_failed";
  const status = error instanceof RegistrarPriceSourceError ? error.status : undefined;
  console.warn(JSON.stringify({ event: "registrar_price_unavailable", provider, reason,
    ...(Number.isInteger(status) && status! >= 100 && status! <= 599 ? { status } : {}) }));
}
const MAX_ADVANCED_BRIEF_WORDS = 250;
const MAX_ADVANCED_BRIEF_CHARS = 6_000;
const MIN_ADVANCED_NAME_LENGTH = 3;
const MAX_ADVANCED_NAME_LENGTH = 20;
const MAX_ADVANCED_CRITERIA_WORDS = 8;
const NAME_LANGUAGES = new Set<NameLanguage>(["auto", "en", "sv", "mixed"]);
const NAME_STYLES = new Set<NameStyle>(["balanced", "brandable", "descriptive", "invented"]);
const CREATIVE_SEARCH_MODES = new Set<CreativeSearchMode>(["light", "medium", "heavy", "deep"]);
// A Swipe deck is intentionally larger than a regular creative search. The
// client can ask for up to one hundred *usable* cards, while the server keeps
// the registry work bounded and stops as soon as that target is met.
const DEFAULT_SWIPE_RESULTS = 100;
const MAX_SWIPE_RESULTS = 100;
const SWIPE_VERIFICATION_BUFFER = 80;
const MAX_SWIPE_VERIFICATIONS = MAX_SWIPE_RESULTS + SWIPE_VERIFICATION_BUFFER;
// Keep Swipe in a separate, conservative bucket: a 100-card deck can use far
// more registry checks than a regular search. Normal search remains at six
// requests/minute below.
const SWIPE_REQUESTS_PER_MINUTE = 2;
// The public function has a 30-second ceiling. We stop starting new registry
// requests after this budget; each individual registry call is still capped
// by REGISTRY_TIMEOUT_MS, leaving time for those final in-flight checks.
const SWIPE_REGISTRY_DEADLINE_MS = 22_000;
const SWIPE_REGISTRY_CONCURRENCY = 10;
const MIN_SWIPE_LABEL_LENGTH = 3;
const MAX_SWIPE_LABEL_LENGTH = 9;
const LOOPIA_PRICE_LIST_URL = "https://www.loopia.se/domannamn/detaljerad_prislista/";
const LOOPIA_PURCHASE_URL = "https://www.loopia.se/domannamn/";
// Official public GET: no account, domain query, credentials, or purchase.
// Contract: https://porkbun.com/api/json/v3/spec#/paths/~1pricing~1get
const PORKBUN_PRICE_API_URL = "https://api.porkbun.com/api/json/v3/pricing/get";
const TLDES_PRICE_FEED_URL = "https://tldes.com/v1";
const TLDES_PRICE_FEED_DOCS_URL = "https://tldes.com/docs/api-reference.html";
// These URLs are taken from IANA's DNS RDAP bootstrap publication dated
// 2026-07-23. They are deliberately static and HTTPS-only: the public search
// function does not follow unreviewed bootstrap redirects at request time.
const RDAP_REGISTRIES: Readonly<Record<RdapTld, RdapRegistry>> = {
  com: { endpoint: "https://rdap.verisign.com/com/v1/", source: "verisign-rdap" },
  net: { endpoint: "https://rdap.verisign.com/net/v1/", source: "verisign-rdap" },
  org: { endpoint: "https://rdap.publicinterestregistry.org/rdap/", source: "public-interest-registry-rdap" },
  app: { endpoint: "https://pubapi.registry.google/rdap/", source: "google-registry-rdap" },
  dev: { endpoint: "https://pubapi.registry.google/rdap/", source: "google-registry-rdap" },
  ai: { endpoint: "https://rdap.identitydigital.services/rdap/", source: "identity-digital-rdap" },
  xyz: { endpoint: "https://rdap.centralnic.com/xyz/", source: "centralnic-rdap" },
  info: { endpoint: "https://rdap.identitydigital.services/rdap/", source: "identity-digital-rdap" },
  biz: { endpoint: "https://rdap.nic.biz/", source: "nic-biz-rdap" },
};
// Keep this selection list aligned with the verifier. `.co` intentionally is
// not exposed until its official registry endpoint has been separately
// audited; the service must never imply support from a generic fallback.
// `.io` is verified through NIC.IO WHOIS by the local service, but Vercel can
// only use audited HTTPS registry sources. IANA does not currently publish a
// `.io` RDAP service, so the public endpoint must reject it instead of
// returning a misleading unknown result as if it were supported.
const ALLOWED_TLDS = new Set(["com", "net", "org", "app", "dev", "ai", "xyz", "info", "biz", "se", "nu"]);
// A regular search still has a fixed candidate budget, so selecting all
// supported endings spreads that budget across more choices rather than
// increasing registry load without bounds.
const MAX_SEARCH_TLDS = ALLOWED_TLDS.size;
const PROVIDER_IDS = [
  "loopia",
  "cloudflare",
  "godaddy",
  "namecheap",
  "porkbun",
  "dynadot",
  "route53",
  "onecom",
  "ionos",
  "ovhcloud",
  "squarespace",
  "hostinger",
  "gandi",
  "hover",
  "spaceship",
  "namecom",
  "namesilo",
  "alibabacloud",
  "internetbs",
  "wix",
] as const satisfies readonly PublicProviderId[];
// Keep reseller/wholesale connectors available to the server-side adapter
// registry, but never accept them from the anonymous public provider picker.
const BACKEND_ONLY_PROVIDER_IDS = ["openprovider", "resellerclub"] as const satisfies readonly ProviderId[];
const PROVIDER_ID_SET = new Set<string>(PROVIDER_IDS);
const PROVIDER_CATALOG: Record<ProviderId, ProviderCatalogEntry> = {
  loopia: {
    id: "loopia",
    registrar: "Loopia",
    purchaseUrl: () => LOOPIA_PURCHASE_URL,
    priceSourceUrl: LOOPIA_PRICE_LIST_URL,
  },
  cloudflare: {
    id: "cloudflare",
    registrar: "Cloudflare Registrar",
    purchaseUrl: (domain) => domain
      ? `https://domains.cloudflare.com/?domain=${encodeURIComponent(domain)}`
      : "https://domains.cloudflare.com/",
    priceSourceUrl: "https://domains.cloudflare.com/",
  },
  godaddy: {
    id: "godaddy",
    registrar: "GoDaddy",
    purchaseUrl: () => "https://www.godaddy.com/domains",
    priceSourceUrl: "https://www.godaddy.com/domains",
  },
  namecheap: {
    id: "namecheap",
    registrar: "Namecheap",
    purchaseUrl: () => "https://www.namecheap.com/domains/domain-name-search/",
    priceSourceUrl: "https://www.namecheap.com/domains/domain-name-search/",
  },
  porkbun: {
    id: "porkbun",
    registrar: "Porkbun",
    purchaseUrl: () => "https://porkbun.com/products/domains",
    priceSourceUrl: "https://porkbun.com/products/domains",
  },
  dynadot: {
    id: "dynadot",
    registrar: "Dynadot",
    purchaseUrl: () => "https://www.dynadot.com/domain/search",
    priceSourceUrl: "https://www.dynadot.com/domain/search",
  },
  route53: {
    id: "route53",
    registrar: "Amazon Route 53",
    purchaseUrl: () => "https://aws.amazon.com/route53/",
    priceSourceUrl: "https://aws.amazon.com/route53/",
  },
  onecom: {
    id: "onecom",
    registrar: "one.com",
    purchaseUrl: () => "https://www.one.com/en-gb/domain/",
    priceSourceUrl: "https://www.one.com/en-gb/domain/",
  },
  ionos: {
    id: "ionos",
    registrar: "IONOS",
    purchaseUrl: () => "https://www.ionos.com/domains/domain-names",
    priceSourceUrl: "https://www.ionos.com/domains/domain-names",
  },
  ovhcloud: {
    id: "ovhcloud",
    registrar: "OVHcloud",
    purchaseUrl: () => "https://www.ovhcloud.com/en/domains/",
    priceSourceUrl: "https://www.ovhcloud.com/en/domains/",
  },
  squarespace: {
    id: "squarespace",
    registrar: "Squarespace Domains",
    purchaseUrl: () => "https://domains.squarespace.com/",
    priceSourceUrl: "https://domains.squarespace.com/",
  },
  hostinger: {
    id: "hostinger",
    registrar: "Hostinger",
    purchaseUrl: () => "https://www.hostinger.com/domain-name-search",
    priceSourceUrl: "https://www.hostinger.com/domain-name-search",
  },
  gandi: {
    id: "gandi",
    registrar: "Gandi",
    purchaseUrl: () => "https://www.gandi.net/en/domain",
    priceSourceUrl: "https://www.gandi.net/en/domain",
  },
  hover: {
    id: "hover",
    registrar: "Hover",
    purchaseUrl: () => "https://www.hover.com/domains",
    priceSourceUrl: "https://www.hover.com/domains",
  },
  spaceship: {
    id: "spaceship",
    registrar: "Spaceship",
    purchaseUrl: () => "https://www.spaceship.com/domains/",
    priceSourceUrl: "https://www.spaceship.com/domains/",
  },
  namecom: {
    id: "namecom",
    registrar: "Name.com",
    purchaseUrl: () => "https://www.name.com/domains",
    priceSourceUrl: "https://www.name.com/domains",
  },
  namesilo: {
    id: "namesilo",
    registrar: "NameSilo",
    purchaseUrl: () => "https://www.namesilo.com/domain/search-domains",
    priceSourceUrl: "https://www.namesilo.com/domain/search-domains",
  },
  alibabacloud: {
    id: "alibabacloud",
    registrar: "Alibaba Cloud",
    purchaseUrl: () => "https://www.alibabacloud.com/domain",
    priceSourceUrl: "https://www.alibabacloud.com/domain",
  },
  internetbs: {
    id: "internetbs",
    registrar: "InternetBS",
    purchaseUrl: () => "https://internetbs.net/en/domain-name-registration",
    priceSourceUrl: "https://internetbs.net/en/domain-name-registration",
  },
  wix: {
    id: "wix",
    registrar: "Wix Domains",
    purchaseUrl: () => "https://www.wix.com/domains",
    priceSourceUrl: "https://www.wix.com/domains",
  },
  openprovider: {
    id: "openprovider",
    registrar: "Openprovider",
    purchaseUrl: () => "https://www.openprovider.com/",
    priceSourceUrl: "https://www.openprovider.com/",
  },
  resellerclub: {
    id: "resellerclub",
    registrar: "ResellerClub",
    purchaseUrl: () => "https://www.resellerclub.com/",
    priceSourceUrl: "https://www.resellerclub.com/",
  },
};

// TLDES uses registrar host names rather than our stable UI IDs. Keep this
// mapping explicit and limited to providers exposed by the public picker.
// The names are taken from TLDES's free `data=registrars` catalogue; unknown
// names are ignored by that API, so an explicit map prevents silent mismatches.
const TLDES_REGISTRAR_HOSTS: Readonly<Record<PublicProviderId, string>> = {
  loopia: "loopia.com",
  cloudflare: "cloudflare.com",
  godaddy: "godaddy.com",
  namecheap: "namecheap.com",
  porkbun: "porkbun.com",
  dynadot: "dynadot.com",
  route53: "aws.amazon.com",
  onecom: "one.com",
  ionos: "ionos.com",
  ovhcloud: "ovhcloud.com",
  squarespace: "squarespace.com",
  hostinger: "hostinger.com",
  gandi: "gandi.net",
  hover: "hover.com",
  spaceship: "spaceship.com",
  namecom: "name.com",
  namesilo: "namesilo.com",
  alibabacloud: "alibabacloud.com",
  internetbs: "internetbs.net",
  wix: "wix.com",
};
type TldesPricedProviderId = Exclude<PublicProviderId, "loopia">;
const TLDES_PRICED_PROVIDER_IDS = PROVIDER_IDS.filter(
  (providerId): providerId is TldesPricedProviderId => providerId !== "loopia",
);
const TLDES_PROVIDER_BY_HOST: ReadonlyMap<string, TldesPricedProviderId> = new Map(
  TLDES_PRICED_PROVIDER_IDS.map((providerId) => [TLDES_REGISTRAR_HOSTS[providerId], providerId]),
);

/**
 * Reserved, server-only official-price connection contracts. Supplying these
 * environment variables does not enable an integration by itself: a reviewed
 * adapter must still validate the provider's documented API response before a
 * price can be marked verified. Nothing here is sent to the browser.
 */
const OFFICIAL_PROVIDER_PRICE_API_ENV: Record<Exclude<ProviderId, "loopia">, OfficialProviderPriceApiEnvironment> = {
  cloudflare: { endpointEnv: "NAME_QUEST_PROVIDER_CLOUDFLARE_PRICE_API_URL", tokenEnv: "NAME_QUEST_PROVIDER_CLOUDFLARE_PRICE_API_TOKEN" },
  godaddy: { endpointEnv: "NAME_QUEST_PROVIDER_GODADDY_PRICE_API_URL", tokenEnv: "NAME_QUEST_PROVIDER_GODADDY_PRICE_API_TOKEN" },
  namecheap: { endpointEnv: "NAME_QUEST_PROVIDER_NAMECHEAP_PRICE_API_URL", tokenEnv: "NAME_QUEST_PROVIDER_NAMECHEAP_PRICE_API_TOKEN" },
  porkbun: { endpointEnv: "NAME_QUEST_PROVIDER_PORKBUN_PRICE_API_URL", tokenEnv: "NAME_QUEST_PROVIDER_PORKBUN_PRICE_API_TOKEN" },
  dynadot: { endpointEnv: "NAME_QUEST_PROVIDER_DYNADOT_PRICE_API_URL", tokenEnv: "NAME_QUEST_PROVIDER_DYNADOT_PRICE_API_TOKEN" },
  route53: { endpointEnv: "NAME_QUEST_PROVIDER_ROUTE53_PRICE_API_URL", tokenEnv: "NAME_QUEST_PROVIDER_ROUTE53_PRICE_API_TOKEN" },
  onecom: { endpointEnv: "NAME_QUEST_PROVIDER_ONECOM_PRICE_API_URL", tokenEnv: "NAME_QUEST_PROVIDER_ONECOM_PRICE_API_TOKEN" },
  ionos: { endpointEnv: "NAME_QUEST_PROVIDER_IONOS_PRICE_API_URL", tokenEnv: "NAME_QUEST_PROVIDER_IONOS_PRICE_API_TOKEN" },
  ovhcloud: { endpointEnv: "NAME_QUEST_PROVIDER_OVHCLOUD_PRICE_API_URL", tokenEnv: "NAME_QUEST_PROVIDER_OVHCLOUD_PRICE_API_TOKEN" },
  squarespace: { endpointEnv: "NAME_QUEST_PROVIDER_SQUARESPACE_PRICE_API_URL", tokenEnv: "NAME_QUEST_PROVIDER_SQUARESPACE_PRICE_API_TOKEN" },
  hostinger: { endpointEnv: "NAME_QUEST_PROVIDER_HOSTINGER_PRICE_API_URL", tokenEnv: "NAME_QUEST_PROVIDER_HOSTINGER_PRICE_API_TOKEN" },
  gandi: { endpointEnv: "NAME_QUEST_PROVIDER_GANDI_PRICE_API_URL", tokenEnv: "NAME_QUEST_PROVIDER_GANDI_PRICE_API_TOKEN" },
  hover: { endpointEnv: "NAME_QUEST_PROVIDER_HOVER_PRICE_API_URL", tokenEnv: "NAME_QUEST_PROVIDER_HOVER_PRICE_API_TOKEN" },
  spaceship: { endpointEnv: "NAME_QUEST_PROVIDER_SPACESHIP_PRICE_API_URL", tokenEnv: "NAME_QUEST_PROVIDER_SPACESHIP_PRICE_API_TOKEN" },
  namecom: { endpointEnv: "NAME_QUEST_PROVIDER_NAMECOM_PRICE_API_URL", tokenEnv: "NAME_QUEST_PROVIDER_NAMECOM_PRICE_API_TOKEN" },
  namesilo: { endpointEnv: "NAME_QUEST_PROVIDER_NAMESILO_PRICE_API_URL", tokenEnv: "NAME_QUEST_PROVIDER_NAMESILO_PRICE_API_TOKEN" },
  alibabacloud: { endpointEnv: "NAME_QUEST_PROVIDER_ALIBABACLOUD_PRICE_API_URL", tokenEnv: "NAME_QUEST_PROVIDER_ALIBABACLOUD_PRICE_API_TOKEN" },
  internetbs: { endpointEnv: "NAME_QUEST_PROVIDER_INTERNETBS_PRICE_API_URL", tokenEnv: "NAME_QUEST_PROVIDER_INTERNETBS_PRICE_API_TOKEN" },
  wix: { endpointEnv: "NAME_QUEST_PROVIDER_WIX_PRICE_API_URL", tokenEnv: "NAME_QUEST_PROVIDER_WIX_PRICE_API_TOKEN" },
  openprovider: { endpointEnv: "NAME_QUEST_PROVIDER_OPENPROVIDER_PRICE_API_URL", tokenEnv: "NAME_QUEST_PROVIDER_OPENPROVIDER_PRICE_API_TOKEN" },
  resellerclub: { endpointEnv: "NAME_QUEST_PROVIDER_RESELLERCLUB_PRICE_API_URL", tokenEnv: "NAME_QUEST_PROVIDER_RESELLERCLUB_PRICE_API_TOKEN" },
};

function assertOfficialProviderPriceApiContracts(): void {
  const environmentNames = new Set<string>();
  for (const providerId of [...PROVIDER_IDS, ...BACKEND_ONLY_PROVIDER_IDS]) {
    if (providerId === "loopia") continue;
    const config = OFFICIAL_PROVIDER_PRICE_API_ENV[providerId];
    if (!config
      || !config.endpointEnv.startsWith("NAME_QUEST_PROVIDER_")
      || !config.tokenEnv.startsWith("NAME_QUEST_PROVIDER_")
      || config.endpointEnv === config.tokenEnv
      || environmentNames.has(config.endpointEnv)
      || environmentNames.has(config.tokenEnv)) {
      throw new Error(`Invalid official provider price API contract for ${providerId}.`);
    }
    environmentNames.add(config.endpointEnv);
    environmentNames.add(config.tokenEnv);
  }
}

assertOfficialProviderPriceApiContracts();
const rateLimits = new Map<string, RateLimitEntry>();
const swipeRateLimits = new Map<string, RateLimitEntry>();
const availabilityCache = new Map<string, CacheEntry>();
const registryCooldowns = new Map<string, number>();
let registrarPriceCache: RegistrarPriceCacheEntry | undefined;
let porkbunPriceCache: (RegistrarPriceCacheEntry & { ttlMs: number }) | undefined;
let porkbunPriceFetch: Promise<RegistrarPriceLookup> | undefined;
let tldesPriceFeedCache: TldesPriceFeedCacheEntry | undefined;
let tldesPriceFeedFetch: Promise<TldesPriceFeedLookup> | undefined;
let tldesPriceFeedFailureUntil = 0;

// Swipe names are formed from alternating consonant and vowel sounds instead
// of arbitrary characters. That keeps each fresh, short label reasonably
// pronounceable while the registry pipeline remains the source of truth.
const SWIPE_CONSONANTS = ["b", "c", "d", "f", "g", "h", "j", "k", "l", "m", "n", "p", "r", "s", "t", "v", "w", "z"];
const SWIPE_CONSONANT_CLUSTERS = ["bl", "br", "cl", "cr", "dr", "fl", "fr", "gl", "gr", "kl", "kr", "pl", "pr", "sk", "sl", "sm", "sn", "sp", "st", "tr", "vr"];
const SWIPE_VOWELS = ["a", "e", "i", "o", "u"];
const SWIPE_VOWEL_PAIRS = ["ae", "ai", "ea", "ei", "ia", "io", "oa", "oi", "ou"];

const NORDIC_WORDS = [
  "bo", "bro", "form", "fram", "glimt", "grund", "hem", "hojd", "hus", "klok", "kraft", "ljus",
  "lyft", "mark", "nav", "nord", "plan", "rum", "saga", "skog", "sol", "spar", "spira", "steg",
  "stig", "tak", "torg", "trygg", "val", "varde", "verk", "vag", "yta",
];

const GLOBAL_WORDS = [
  "bloom", "bridge", "bright", "canvas", "circle", "craft", "field", "flow", "forge", "glow", "grove",
  "harbor", "kind", "lane", "luma", "nest", "nook", "orbit", "pilot", "ripple", "root", "spark",
  "terra", "thread", "tide", "vista", "weave", "wise", "yard",
];

const BRAND_TAILS = [
  "ara", "era", "io", "iva", "ly", "ora", "ory", "ova", "sy", "via",
];

// These preserve a user's actual reference word in enough variations to make
// a niche or invented term useful. They are deliberately ordinary naming
// words, rather than random syllables, so a themed result stays explainable.
const REFERENCE_SUFFIXES = [
  "base", "bridge", "care", "cloud", "core", "craft", "desk", "flow", "forge", "frame",
  "guide", "hub", "labs", "lane", "link", "logic", "nest", "nova", "path", "pilot",
  "scope", "spark", "space", "studio", "system", "verse", "vista", "works", "world",
];

const REFERENCE_PREFIXES = ["get", "go", "my", "neo", "next", "nova", "prime", "true", "up", "we"];

const SWEDISH_TAILS = [
  "blick", "bro", "bygg", "form", "glimt", "guiden", "huset", "kollen", "laget", "lyftet", "navet",
  "planen", "rummet", "sparet", "steget", "verket", "vagen", "ytan",
];

const ENGLISH_TAILS = [
  "base", "craft", "flow", "forge", "lane", "link", "nest", "pilot", "scope", "studio", "works", "wise",
];

const THEME_LEXICON: Record<string, string[]> = {
  ai: ["ai", "smart", "signal", "prompt", "neural", "think", "cortex", "logic", "spark"],
  bok: ["bok", "blad", "las", "ord", "sida", "tale", "story", "page", "leaf"],
  book: ["book", "leaf", "page", "story", "tale", "word", "read"],
  bygg: ["bygg", "bo", "hem", "hus", "form", "grund", "plan", "rit", "tak", "tomt", "build", "home", "plot", "roof"],
  bygglov: ["bygg", "lov", "bo", "hem", "hus", "form", "grund", "plan", "rit", "tak", "tomt", "permit", "build", "home", "plot"],
  building: ["build", "home", "form", "plan", "plot", "roof", "craft", "works"],
  construction: ["build", "home", "form", "plan", "plot", "roof", "craft", "works"],
  permit: ["permit", "plan", "build", "form", "plot", "guide", "scope"],
  planning: ["plan", "permit", "build", "form", "plot", "guide", "scope"],
  eco: ["eco", "green", "leaf", "loop", "root", "sol", "skog", "terra", "varde"],
  ekonomi: ["ekonomi", "kapital", "kassa", "spar", "varde", "wealth", "fund", "ledger", "wise"],
  finance: ["finance", "wealth", "fund", "ledger", "wise", "capital", "value"],
  fastighet: ["bo", "hem", "hus", "mark", "rum", "tomt", "estate", "home", "plot", "space"],
  property: ["estate", "home", "plot", "space", "nest", "place", "yard"],
  realestate: ["estate", "home", "plot", "space", "nest", "place", "yard"],
  food: ["food", "bite", "bloom", "bord", "krydda", "mat", "smak", "taste", "table"],
  hals: ["balans", "glow", "halsa", "lugn", "pulse", "ro", "vital", "well", "zen"],
  halsa: ["balans", "glow", "halsa", "lugn", "pulse", "ro", "vital", "well", "zen"],
  health: ["health", "well", "vital", "pulse", "balance", "glow", "zen"],
  wellness: ["well", "vital", "pulse", "balance", "glow", "zen", "calm"],
  hem: ["bo", "hem", "hus", "rum", "trygg", "nest", "nook", "root", "space"],
  home: ["home", "nest", "nook", "root", "space", "place", "yard"],
  jobb: ["jobb", "karriar", "lag", "steg", "talang", "work", "path", "skill", "team"],
  work: ["work", "career", "path", "skill", "team", "talent", "pilot"],
  career: ["career", "work", "path", "skill", "team", "talent", "pilot"],
  juridik: ["lag", "ratt", "regel", "trygg", "case", "legal", "law", "rule", "wise"],
  legal: ["legal", "law", "rule", "case", "guide", "wise", "trust"],
  law: ["law", "legal", "rule", "case", "guide", "wise", "trust"],
  mat: ["bite", "bord", "food", "krydda", "mat", "smak", "taste", "table"],
  mode: ["atelier", "form", "glimt", "look", "mode", "silk", "style", "trend", "wear"],
  resor: ["aventyr", "bro", "flyg", "resa", "stig", "trip", "route", "roam", "vista"],
  resa: ["aventyr", "bro", "flyg", "resa", "stig", "trip", "route", "roam", "vista"],
  travel: ["travel", "trip", "route", "roam", "vista", "harbor", "tide"],
  skola: ["bild", "klass", "kunskap", "lar", "steg", "study", "teach", "think", "wise"],
  teknik: ["code", "digital", "flow", "logic", "signal", "tech", "vector", "web", "wise"],
  technology: ["code", "digital", "flow", "logic", "signal", "tech", "vector", "web", "wise"],
  tech: ["code", "digital", "flow", "logic", "signal", "tech", "vector", "web", "wise"],
  tradgard: ["blad", "bloom", "frö", "garden", "grove", "jord", "leaf", "sol", "spira"],
  garden: ["garden", "bloom", "grove", "leaf", "root", "yard", "terra"],
  utbildning: ["bild", "klass", "kunskap", "lar", "steg", "study", "teach", "think", "wise"],
  education: ["study", "teach", "think", "wise", "learn", "class", "path"],
  hav: ["hav", "kust", "bris", "vik", "vatten", "ocean", "coast", "tide", "wave"],
  ocean: ["ocean", "coast", "tide", "wave", "harbor", "blue", "marine"],
  restaurang: ["mat", "bord", "smak", "krydda", "kok", "bistro", "table", "taste"],
  restaurant: ["table", "taste", "bistro", "plate", "spice", "dine", "kitchen"],
  cafe: ["cafe", "coffee", "roast", "bean", "brew", "cup", "kaffe", "fika"],
  coffee: ["coffee", "roast", "bean", "brew", "cup", "blend", "aroma"],
  kaffe: ["kaffe", "fika", "kopp", "rost", "coffee", "bean", "brew"],
  stadfirma: ["stad", "rent", "glans", "klar", "puts", "clean", "shine", "sparkle"],
  cleaning: ["clean", "shine", "sparkle", "fresh", "clear", "neat"],
  konsult: ["rad", "kunskap", "insikt", "klok", "riktning", "lyft", "guide", "wise"],
  consulting: ["insight", "guide", "wise", "path", "focus", "advice", "strategy"],
  frisor: ["har", "klipp", "lock", "slinga", "salong", "hair", "cut", "style"],
  frisorsalong: ["har", "klipp", "lock", "slinga", "salong", "hair", "cut", "style"],
  hair: ["hair", "cut", "style", "curl", "salon", "strand"],
  webbutik: ["butik", "handel", "torg", "korg", "shop", "store", "basket", "cart"],
  ecommerce: ["shop", "store", "basket", "cart", "market", "trade", "buy"],
  hund: ["hund", "tass", "svans", "nos", "dog", "paw", "tail"],
  dog: ["dog", "paw", "tail", "bark", "pet", "fetch"],
};

const SWEDISH_THEME_TRIGGERS = [
  "bok", "bygg", "bygglov", "ekonomi", "fastighet", "halsa", "hem", "jobb", "juridik", "mat", "mode",
  "resa", "resor", "skola", "teknik", "tradgard", "utbildning",
];

const ENGLISH_WORDS = new Set([
  ...GLOBAL_WORDS,
  ...ENGLISH_TAILS,
  "build", "cortex", "digital", "eco", "estate", "food", "garden", "green", "home", "law", "leaf", "legal",
  "logic", "neural", "page", "path", "permit", "plot", "prompt", "roof", "route", "skill", "space", "story",
  "study", "table", "teach", "team", "tech", "think", "trip", "web", "wealth", "well", "work", "zen",
  "fund", "ledger", "capital", "value", "read", "word", "tale", "balance", "calm", "career", "talent", "rule", "trust",
  "ocean", "coast", "wave", "blue", "marine", "taste", "plate", "spice", "dine", "kitchen", "coffee", "roast", "bean", "brew", "cup",
  "clean", "shine", "sparkle", "fresh", "clear", "neat", "insight", "focus", "advice", "strategy", "hair", "cut", "style", "curl", "salon",
  "shop", "store", "basket", "cart", "market", "trade", "buy", "dog", "paw", "tail", "bark", "pet", "fetch",
]);

const SWEDISH_WORDS = new Set([
  ...NORDIC_WORDS,
  ...SWEDISH_TAILS,
  "aventyr", "blad", "bord", "bygg", "frö", "flyg", "halsa", "jobb", "jord", "karriar", "klass", "krydda",
  "kunskap", "lag", "las", "lov", "mat", "mode", "ord", "resa", "rit", "ratt", "regel", "sida", "smak",
  "talang", "tomt", "tradgard", "trygg", "värde",
  "hav", "kust", "bris", "vik", "vatten", "kok", "kaffe", "fika", "kopp", "rost", "stad", "rent", "glans", "klar", "puts",
  "rad", "insikt", "riktning", "har", "klipp", "lock", "slinga", "salong", "butik", "handel", "korg", "hund", "tass", "svans", "nos",
].map(asciiToken));

export const config = { maxDuration: 30 };

function sendJson(response: VercelResponseLike, status: number, payload: unknown): void {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "same-origin");
  response.status(status).json(withMachineErrorCode(status, payload));
}

function headerValue(request: VercelRequestLike, name: string): string {
  const value = request.headers[name] ?? request.headers[name.toLowerCase()];
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function requestIdentity(request: VercelRequestLike): string {
  const trustedApiId = (request as TrustedApiEngineRequest)[TRUSTED_API_ID];
  if (typeof trustedApiId === "string" && /^[a-z0-9][a-z0-9_-]{2,63}$/u.test(trustedApiId)) {
    return `api:${trustedApiId}`;
  }

  // Vercel sets x-forwarded-for. This is an abuse control, not an identity or
  // authorization mechanism, and is intentionally only a best-effort guard.
  const forwardedFor = headerValue(request, "x-forwarded-for").split(",")[0]?.trim();
  return (forwardedFor || "unknown").slice(0, 128);
}

function isTrustedApiRequest(request: VercelRequestLike): boolean {
  return typeof (request as TrustedApiEngineRequest)[TRUSTED_API_ID] === "string";
}

function requestIdFor(request: VercelRequestLike): string {
  const trustedRequestId = (request as TrustedApiEngineRequest)[TRUSTED_REQUEST_ID];
  if (typeof trustedRequestId === "string" && /^req_[A-Za-z0-9_-]{12,64}$/u.test(trustedRequestId)) {
    return trustedRequestId;
  }
  return createRequestId();
}

function takeRateLimit(
  request: VercelRequestLike,
  bucket: Map<string, RateLimitEntry>,
  limit: number,
): RateLimitResult {
  const now = Date.now();
  const identity = requestIdentity(request);

  for (const [key, value] of bucket) {
    if (now - value.startedAt >= 60_000) bucket.delete(key);
  }

  const current = bucket.get(identity);
  if (!current) {
    bucket.set(identity, { startedAt: now, count: 1 });
    return { allowed: true, remaining: limit - 1, resetAt: now + 60_000 };
  }
  const resetAt = current.startedAt + 60_000;
  if (current.count >= limit) return { allowed: false, remaining: 0, resetAt };
  current.count += 1;
  return { allowed: true, remaining: limit - current.count, resetAt };
}

function takeQuota(request: VercelRequestLike): RateLimitResult {
  return takeRateLimit(request, rateLimits, REQUESTS_PER_MINUTE);
}

function takeSwipeQuota(request: VercelRequestLike): RateLimitResult {
  return takeRateLimit(request, swipeRateLimits, SWIPE_REQUESTS_PER_MINUTE);
}

function isJsonRequest(request: VercelRequestLike): boolean {
  return /^application\/json(?:\s*;|$)/iu.test(headerValue(request, "content-type").trim());
}

function jsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("A JSON object is required.");
  }
  return value as Record<string, unknown>;
}

function parseJson(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Buffer.isBuffer(value)) return jsonObject(value);
  const text = Buffer.isBuffer(value) ? value.toString("utf8") : String(value ?? "");
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) throw new Error("The request body is too large.");
  try {
    return jsonObject(JSON.parse(text || "{}"));
  } catch (error) {
    if (error instanceof Error && error.message === "A JSON object is required.") throw error;
    throw new Error("Invalid JSON.");
  }
}

async function readJson(request: VercelRequestLike): Promise<Record<string, unknown>> {
  // Vercel's Node runtime normally gives us a parsed body. The stream fallback
  // keeps the handler correct when body parsing is disabled or locally mocked.
  if (request.body !== undefined) return parseJson(request.body);

  const chunks: Buffer[] = [];
  let bytes = 0;
  const stream = request as unknown as AsyncIterable<Uint8Array | string>;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > MAX_BODY_BYTES) throw new Error("The request body is too large.");
    chunks.push(buffer);
  }
  return parseJson(Buffer.concat(chunks));
}

function asciiToken(value: string): string {
  return asciiNameToken(value);
}

function makeSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function normalizeTlds(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const result: string[] = [];
  for (const value of input) {
    if (typeof value !== "string") continue;
    const tld = value.trim().toLowerCase().replace(/^\./, "");
    if (ALLOWED_TLDS.has(tld) && !result.includes(tld)) result.push(tld);
  }
  return result.slice(0, MAX_SEARCH_TLDS);
}

/**
 * Extract intentionally written fully-qualified domain names from the short
 * search field. A following bare extension reuses the last explicit label, so
 * `saida.com .dev .ai` means exactly `saida.com`, `saida.dev`, and `saida.ai`.
 *
 * This parser is deliberately stricter than the creative generator: only
 * ASCII labels and explicitly audited TLDs are eligible for a registry check.
 * A malformed or unsupported item never reaches the availability verifier.
 */
function parseExactDomains(input: unknown, locale: Locale): { domains?: string[]; error?: string } {
  if (typeof input !== "string" || !input.trim()) return {};

  const domains: string[] = [];
  let lastLabel: string | undefined;
  const add = (domain: string): void => {
    if (!domains.includes(domain)) domains.push(domain);
  };

  for (const rawToken of input.split(/[\s,;|]+/u)) {
    const token = rawToken
      .trim()
      .toLowerCase()
      .replace(/^[([{"'`]+/u, "")
      .replace(/[)\]}"'`,;:!?]+$/u, "")
      .replace(/\.+$/u, "");
    if (!token) continue;

    const fullyQualified = /^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\.([a-z]{2,63})$/u.exec(token);
    if (fullyQualified) {
      const [, label, tld] = fullyQualified;
      if (!ALLOWED_TLDS.has(tld)) {
        return {
          error: localizedText(
            locale,
            `.${tld} is not supported for direct registry checks.`,
            `.${tld} stöds inte för direkta registry-kontroller.`,
            `.${tld} no es compatible con comprobaciones directas del registro.`,
            `.${tld} n’est pas pris en charge pour les vérifications directes du registre.`,
            `.${tld} 不支持直接注册局查询。`,
          ),
        };
      }
      lastLabel = label;
      add(`${label}.${tld}`);
    } else {
      const bareExtension = /^\.([a-z]{2,63})$/u.exec(token);
      if (!bareExtension || !lastLabel) {
        // The reference chain only stays active across explicit extension
        // tokens. Ordinary creative-search words cannot accidentally inherit
        // an earlier domain label.
        lastLabel = undefined;
        continue;
      }
      const tld = bareExtension[1]!;
      if (!ALLOWED_TLDS.has(tld)) {
        return {
          error: localizedText(
            locale,
            `.${tld} is not supported for direct registry checks.`,
            `.${tld} stöds inte för direkta registry-kontroller.`,
            `.${tld} no es compatible con comprobaciones directas del registro.`,
            `.${tld} n’est pas pris en charge pour les vérifications directes du registre.`,
            `.${tld} 不支持直接注册局查询。`,
          ),
        };
      }
      add(`${lastLabel}.${tld}`);
    }

    if (domains.length > MAX_EXACT_DOMAINS) {
      return {
        error: localizedText(
          locale,
          `Check no more than ${MAX_EXACT_DOMAINS} exact domains at once.`,
          `Kontrollera högst ${MAX_EXACT_DOMAINS} exakta domäner åt gången.`,
          `Comprueba como máximo ${MAX_EXACT_DOMAINS} dominios exactos a la vez.`,
          `Vérifiez au maximum ${MAX_EXACT_DOMAINS} domaines exacts à la fois.`,
          `一次最多检查 ${MAX_EXACT_DOMAINS} 个精确域名。`,
        ),
      };
    }
  }

  return domains.length > 0 ? { domains } : {};
}

// API consumers may send an explicit `domains` list, while the application
// itself uses the short search field. Both surfaces share the same strict
// parser and the same compact `.dev .ai` extension shorthand. Once a caller
// supplies `domains`, that list is authoritative: a query/theme may describe
// the request, but must never silently add another exact registry check.
function parseExactDomainRequest(
  theme: string,
  requestedDomains: unknown,
  locale: Locale,
): { domains?: string[]; error?: string } {
  if (requestedDomains === undefined) return parseExactDomains(theme, locale);
  if (!Array.isArray(requestedDomains) || requestedDomains.length === 0 || requestedDomains.length > MAX_EXACT_DOMAINS
    || requestedDomains.some((domain) => typeof domain !== "string"
      || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)?\.[a-z]{2,63}\.?$/iu.test(domain.trim()))) {
    return {
      error: localizedText(
        locale,
        "Enter 1–12 complete domain names, without URL paths. No unrelated suggestions will replace an invalid domain.",
        "Ange 1–12 fullständiga domännamn utan URL-sökvägar. En ogiltig domän ersätts inte med andra förslag.",
        "Escribe entre 1 y 12 dominios completos, sin rutas URL. Un dominio inválido no se sustituye por otras ideas.",
        "Saisissez 1 à 12 domaines complets, sans chemin URL. Un domaine invalide n’est pas remplacé par d’autres idées.",
        "请输入 1–12 个完整域名，不包含 URL 路径。无效域名不会被替换为其他建议。",
      ),
    };
  }
  const parsed = parseExactDomains(requestedDomains.join("\n"), locale);
  return parsed.domains?.length || parsed.error ? parsed : {
    error: localizedText(locale, "Start with a complete domain name, such as example.com.", "Börja med ett fullständigt domännamn, till exempel exempel.com.", "Empieza con un dominio completo, como example.com.", "Commencez par un domaine complet, comme example.com.", "请以完整域名开头，例如 example.com。"),
  };
}

function normalizeProviderIds(
  input: unknown,
  locale: Locale,
): { providerIds?: PublicProviderId[]; error?: string } {
  // Existing clients did not send provider choices. Keep their established
  // Loopia offer while new clients can opt into a transparent comparison.
  if (input === undefined) return { providerIds: ["loopia"] };
  if (!Array.isArray(input)) {
    return {
      error: localizedText(
        locale,
        "Providers must be a list of supported provider IDs.",
        "Leverantörer måste vara en lista med stödda leverantörs-id:n.",
        "Los proveedores deben ser una lista de identificadores de proveedor compatibles.",
        "Les fournisseurs doivent être une liste d’identifiants de fournisseurs pris en charge.",
        "服务商必须是受支持服务商 ID 的列表。",
      ),
    };
  }
  if (input.length === 0 || input.length > PROVIDER_IDS.length) {
    return {
      error: localizedText(
        locale,
        `Select at least one and no more than ${PROVIDER_IDS.length} providers.`,
        `Välj minst en och högst ${PROVIDER_IDS.length} leverantörer.`,
        `Selecciona al menos un proveedor y no más de ${PROVIDER_IDS.length}.`,
        `Sélectionnez au moins un fournisseur et au plus ${PROVIDER_IDS.length}.`,
        `请选择至少一个且不超过 ${PROVIDER_IDS.length} 个服务商。`,
      ),
    };
  }

  const providerIds: PublicProviderId[] = [];
  for (const value of input) {
    const providerId = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (!PROVIDER_ID_SET.has(providerId) || providerIds.includes(providerId as PublicProviderId)) {
      return {
        error: localizedText(
          locale,
          "Each provider must be selected once from the supported provider list.",
          "Varje leverantör måste väljas en gång från listan över stödda leverantörer.",
          "Cada proveedor debe seleccionarse una sola vez de la lista de proveedores compatibles.",
          "Chaque fournisseur doit être sélectionné une seule fois dans la liste des fournisseurs pris en charge.",
          "每个服务商只能从受支持服务商列表中选择一次。",
        ),
      };
    }
    providerIds.push(providerId as PublicProviderId);
  }

  return { providerIds };
}

function normalizeCount(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_CANDIDATES;
  return Math.min(MAX_CANDIDATES, Math.max(1, Math.trunc(numeric)));
}

function normalizeSwipeCount(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_SWIPE_RESULTS;
  return Math.min(MAX_SWIPE_RESULTS, Math.max(1, Math.trunc(numeric)));
}

function normalizeLocale(value: unknown): Locale {
  return value === "sv" || value === "es" || value === "fr" || value === "zh" ? value : "en";
}

function parseCreativeSearchMode(
  value: unknown,
  locale: Locale,
): { mode?: CreativeSearchMode; error?: string } {
  // Omitted by older API callers preserves the historical balanced
  // generator. The browser client always sends its selected card.
  if (value === undefined) return {};
  if (typeof value === "string" && CREATIVE_SEARCH_MODES.has(value as CreativeSearchMode)) {
    return { mode: value as CreativeSearchMode };
  }
  return {
    error: localizedText(
      locale,
      "creativeMode must be light, medium, heavy, or deep.",
      "creativeMode måste vara light, medium, heavy eller deep.",
      "creativeMode debe ser light, medium, heavy o deep.",
      "creativeMode doit être light, medium, heavy ou deep.",
      "creativeMode 必须是 light、medium、heavy 或 deep。",
    ),
  };
}

function creativeModeNameStyle(mode: CreativeSearchMode): NameStyle {
  // Direct is literal/theme-led, Playful favours compact brand blends, Broad
  // retains a balanced mix, and Name studio favours coined/pronounceable ideas.
  if (mode === "light") return "descriptive";
  if (mode === "medium") return "brandable";
  if (mode === "deep") return "invented";
  return "balanced";
}

function localizedText(locale: Locale, english: string, swedish: string, spanish: string, french: string, chinese: string): string {
  if (locale === "sv") return swedish;
  if (locale === "es") return spanish;
  if (locale === "fr") return french;
  if (locale === "zh") return chinese;
  return english;
}

function isAdvancedSearch(value: unknown): boolean {
  return value === true;
}

function isSwipeSearch(value: unknown): boolean {
  return value === true;
}

function parseSwipeLengthRange(body: Record<string, unknown>, locale: Locale): { range?: SwipeLengthRange; error?: string } {
  const hasMinLength = Object.hasOwn(body, "minLength");
  const hasMaxLength = Object.hasOwn(body, "maxLength");
  const minLength = hasMinLength ? body.minLength : MIN_SWIPE_LABEL_LENGTH;
  const maxLength = hasMaxLength ? body.maxLength : MAX_SWIPE_LABEL_LENGTH;

  if (
    typeof minLength !== "number"
    || typeof maxLength !== "number"
    || !Number.isInteger(minLength)
    || !Number.isInteger(maxLength)
    || minLength < MIN_SWIPE_LABEL_LENGTH
    || maxLength > MAX_SWIPE_LABEL_LENGTH
    || minLength > maxLength
  ) {
    return {
      error: localizedText(
        locale,
        `Swipe names must use a minimum and maximum between ${MIN_SWIPE_LABEL_LENGTH} and ${MAX_SWIPE_LABEL_LENGTH} letters.`,
        `Swajpnamn måste ha en min- och maxlängd mellan ${MIN_SWIPE_LABEL_LENGTH} och ${MAX_SWIPE_LABEL_LENGTH} bokstäver.`,
        `Los nombres de Swipe deben tener una longitud mínima y máxima entre ${MIN_SWIPE_LABEL_LENGTH} y ${MAX_SWIPE_LABEL_LENGTH} letras.`,
        `Les noms Swipe doivent avoir une longueur minimale et maximale entre ${MIN_SWIPE_LABEL_LENGTH} et ${MAX_SWIPE_LABEL_LENGTH} lettres.`,
        `Swipe 名称的最小和最大长度必须在 ${MIN_SWIPE_LABEL_LENGTH} 到 ${MAX_SWIPE_LABEL_LENGTH} 个字母之间。`,
      ),
    };
  }

  return { range: { minLength, maxLength } };
}

function secureSwipeSeed(): number {
  return randomBytes(4).readUInt32LE(0);
}

function randomItem<T>(items: readonly T[], random: () => number): T {
  return items[Math.floor(random() * items.length)]!;
}

function weightedSwipeLength(range: SwipeLengthRange, random: () => number): number {
  const span = range.maxLength - range.minLength + 1;
  // Short .com labels are overwhelmingly registered. Biasing toward the
  // longer end still keeps every name inside the requested range (and keeps
  // short names in the mix), but lets a bounded verification batch much more
  // reliably fill a 100-card deck.
  let selection = random() * ((span * (span + 1)) / 2);
  for (let offset = 1; offset <= span; offset += 1) {
    selection -= offset;
    if (selection < 0) return range.minLength + offset - 1;
  }
  return range.maxLength;
}

function randomSwipeLabel(range: SwipeLengthRange, random: () => number): string {
  const targetLength = weightedSwipeLength(range, random);
  let label = "";
  let nextIsConsonant = true;

  while (label.length < targetLength) {
    const remaining = targetLength - label.length;
    if (nextIsConsonant) {
      const canUseCluster = remaining >= 3 && random() < 0.32;
      const options = canUseCluster ? SWIPE_CONSONANT_CLUSTERS : SWIPE_CONSONANTS;
      const usable = options.filter((part) => part.length < remaining);
      label += randomItem(usable.length > 0 ? usable : SWIPE_CONSONANTS, random);
      nextIsConsonant = false;
      continue;
    }

    const canUseVowelPair = remaining >= 2 && random() < 0.28;
    const options = canUseVowelPair ? SWIPE_VOWEL_PAIRS : SWIPE_VOWELS;
    const usable = options.filter((part) => part.length <= remaining);
    label += randomItem(usable.length > 0 ? usable : SWIPE_VOWELS, random);
    nextIsConsonant = true;
  }

  return label;
}

function generateSwipeCandidates(tlds: string[], count: number, range: SwipeLengthRange): GeneratedCandidate[] {
  const random = seededRandom(secureSwipeSeed());
  const tldOrder = shuffle(tlds, random);
  const labels = new Set<string>();
  const candidates: GeneratedCandidate[] = [];

  for (let attempt = 0; candidates.length < count && attempt < count * 80; attempt += 1) {
    const label = randomSwipeLabel(range, random);
    if (!/^[a-z]{3,9}$/.test(label) || labels.has(label)) continue;
    labels.add(label);
    candidates.push({
      domain: `${label}.${tldOrder[candidates.length % tldOrder.length]!}`,
      namingPattern: "swipeRandom",
    });
  }

  return candidates;
}

function countWords(value: string): number {
  return value.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
}

function advancedBrief(body: Record<string, unknown>, locale: Locale): { brief?: string; error?: string } {
  // `brief` is the explicit advanced-search field. Keeping `theme` as a
  // fallback lets the existing public request shape become advanced without
  // a parallel endpoint or a breaking change for older clients.
  const source = typeof body.brief === "string"
    ? body.brief
    : typeof body.theme === "string"
      ? body.theme
      : "";
  const brief = source.replace(/\s+/gu, " ").trim();
  const wordCount = countWords(brief);

  if (brief.length > MAX_ADVANCED_BRIEF_CHARS || wordCount > MAX_ADVANCED_BRIEF_WORDS) {
    return {
      error: localizedText(
        locale,
        `Advanced search accepts up to ${MAX_ADVANCED_BRIEF_WORDS} words and ${MAX_ADVANCED_BRIEF_CHARS.toLocaleString("en-US")} characters.`,
        `Avancerad sökning accepterar upp till ${MAX_ADVANCED_BRIEF_WORDS} ord och ${MAX_ADVANCED_BRIEF_CHARS.toLocaleString("sv-SE")} tecken.`,
        `La búsqueda avanzada admite hasta ${MAX_ADVANCED_BRIEF_WORDS} palabras y ${MAX_ADVANCED_BRIEF_CHARS.toLocaleString("es-ES")} caracteres.`,
        `La recherche avancée accepte jusqu’à ${MAX_ADVANCED_BRIEF_WORDS} mots et ${MAX_ADVANCED_BRIEF_CHARS.toLocaleString("fr-FR")} caractères.`,
        `高级搜索最多支持 ${MAX_ADVANCED_BRIEF_WORDS} 个词和 ${MAX_ADVANCED_BRIEF_CHARS.toLocaleString("zh-CN")} 个字符。`,
      ),
    };
  }

  return { brief };
}

function criteriaWordList(
  value: unknown,
  field: "includeWords" | "excludeWords",
  locale: Locale,
): { words?: string[]; error?: string } {
  if (value === undefined) return { words: [] };
  if (!Array.isArray(value)) {
    return {
      error: localizedText(
        locale,
        `${field} must be an array of up to ${MAX_ADVANCED_CRITERIA_WORDS} short words.`,
        `${field} måste vara en lista med högst ${MAX_ADVANCED_CRITERIA_WORDS} korta ord.`,
        `${field} debe ser una lista de hasta ${MAX_ADVANCED_CRITERIA_WORDS} palabras cortas.`,
        `${field} doit être une liste d’au plus ${MAX_ADVANCED_CRITERIA_WORDS} mots courts.`,
        `${field} 必须是最多包含 ${MAX_ADVANCED_CRITERIA_WORDS} 个短词的数组。`,
      ),
    };
  }

  const words: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") {
      return {
        error: localizedText(
          locale,
          `${field} can contain only text words.`,
          `${field} får bara innehålla textord.`,
          `${field} solo puede contener palabras de texto.`,
          `${field} ne peut contenir que des mots textuels.`,
          `${field} 只能包含文本词。`,
        ),
      };
    }
    // Tags from the UI arrive as an array, but accepting comma-separated
    // text within a tag keeps pasted criteria predictable too.
    const rawWords = item.split(/[\s,;:/|+]+/u).filter(Boolean);
    if (rawWords.length === 0) {
      return {
        error: localizedText(
          locale,
          `${field} can contain only non-empty text words.`,
          `${field} får bara innehålla icke-tomma textord.`,
          `${field} solo puede contener palabras de texto no vacías.`,
          `${field} ne peut contenir que des mots textuels non vides.`,
          `${field} 只能包含非空文本词。`,
        ),
      };
    }
    for (const rawWord of rawWords) {
      const word = asciiToken(rawWord);
      if (!/^[a-z0-9]{2,18}$/.test(word)) {
        return {
          error: localizedText(
            locale,
            `${field} words must normalize to 2–18 letters or numbers.`,
            `${field}-ord måste normaliseras till 2–18 bokstäver eller siffror.`,
            `Las palabras de ${field} deben normalizarse a 2–18 letras o números.`,
            `Les mots de ${field} doivent être normalisés en 2 à 18 lettres ou chiffres.`,
            `${field} 中的词必须规范化为 2–18 个字母或数字。`,
          ),
        };
      }
      if (!words.includes(word)) words.push(word);
      if (words.length > MAX_ADVANCED_CRITERIA_WORDS) {
        return {
          error: localizedText(
            locale,
            `${field} accepts at most ${MAX_ADVANCED_CRITERIA_WORDS} words.`,
            `${field} accepterar högst ${MAX_ADVANCED_CRITERIA_WORDS} ord.`,
            `${field} admite como máximo ${MAX_ADVANCED_CRITERIA_WORDS} palabras.`,
            `${field} accepte au maximum ${MAX_ADVANCED_CRITERIA_WORDS} mots.`,
            `${field} 最多接受 ${MAX_ADVANCED_CRITERIA_WORDS} 个词。`,
          ),
        };
      }
    }
  }
  return { words };
}

function parseAdvancedCriteria(
  value: unknown,
  locale: Locale,
): { criteria?: AdvancedSearchCriteria; error?: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      error: localizedText(locale, "criteria must be an object.", "criteria måste vara ett objekt.", "criteria debe ser un objeto.", "criteria doit être un objet.", "criteria 必须是对象。"),
    };
  }

  const record = value as Record<string, unknown>;
  const allowedKeys = new Set([
    "minLength",
    "maxLength",
    "nameLanguage",
    "nameStyle",
    "includeWords",
    "excludeWords",
  ]);
  if (Object.keys(record).some((key) => !allowedKeys.has(key))) {
    return {
      error: localizedText(locale, "criteria contains an unsupported field.", "criteria innehåller ett fält som inte stöds.", "criteria contiene un campo no compatible.", "criteria contient un champ non pris en charge.", "criteria 包含不受支持的字段。"),
    };
  }

  const minLength = record.minLength === undefined ? MIN_ADVANCED_NAME_LENGTH : record.minLength;
  const maxLength = record.maxLength === undefined ? MAX_ADVANCED_NAME_LENGTH : record.maxLength;
  if (
    typeof minLength !== "number"
    || typeof maxLength !== "number"
    || !Number.isInteger(minLength)
    || !Number.isInteger(maxLength)
    || minLength < MIN_ADVANCED_NAME_LENGTH
    || maxLength > MAX_ADVANCED_NAME_LENGTH
    || minLength > maxLength
  ) {
    return {
      error: localizedText(
        locale,
        `criteria minLength and maxLength must be whole numbers between ${MIN_ADVANCED_NAME_LENGTH} and ${MAX_ADVANCED_NAME_LENGTH}.`,
        `criteria minLength och maxLength måste vara heltal mellan ${MIN_ADVANCED_NAME_LENGTH} och ${MAX_ADVANCED_NAME_LENGTH}.`,
        `criteria minLength y maxLength deben ser números enteros entre ${MIN_ADVANCED_NAME_LENGTH} y ${MAX_ADVANCED_NAME_LENGTH}.`,
        `criteria minLength et maxLength doivent être des nombres entiers entre ${MIN_ADVANCED_NAME_LENGTH} et ${MAX_ADVANCED_NAME_LENGTH}.`,
        `criteria 的 minLength 和 maxLength 必须是介于 ${MIN_ADVANCED_NAME_LENGTH} 和 ${MAX_ADVANCED_NAME_LENGTH} 之间的整数。`,
      ),
    };
  }

  const nameLanguage = record.nameLanguage === undefined ? "auto" : record.nameLanguage;
  if (typeof nameLanguage !== "string" || !NAME_LANGUAGES.has(nameLanguage as NameLanguage)) {
    return {
      error: localizedText(locale, "criteria nameLanguage must be auto, en, sv, or mixed.", "criteria nameLanguage måste vara auto, en, sv eller mixed.", "criteria nameLanguage debe ser auto, en, sv o mixed.", "criteria nameLanguage doit être auto, en, sv ou mixed.", "criteria 的 nameLanguage 必须是 auto、en、sv 或 mixed。"),
    };
  }
  const nameStyle = record.nameStyle === undefined ? "balanced" : record.nameStyle;
  if (typeof nameStyle !== "string" || !NAME_STYLES.has(nameStyle as NameStyle)) {
    return {
      error: localizedText(locale, "criteria nameStyle must be balanced, brandable, descriptive, or invented.", "criteria nameStyle måste vara balanced, brandable, descriptive eller invented.", "criteria nameStyle debe ser balanced, brandable, descriptive o invented.", "criteria nameStyle doit être balanced, brandable, descriptive ou invented.", "criteria 的 nameStyle 必须是 balanced、brandable、descriptive 或 invented。"),
    };
  }

  const parsedIncludes = criteriaWordList(record.includeWords, "includeWords", locale);
  if (parsedIncludes.error) return { error: parsedIncludes.error };
  const parsedExcludes = criteriaWordList(record.excludeWords, "excludeWords", locale);
  if (parsedExcludes.error) return { error: parsedExcludes.error };
  const includeWords = parsedIncludes.words ?? [];
  const excludeWords = parsedExcludes.words ?? [];
  if (includeWords.some((word) => excludeWords.includes(word))) {
    return {
      error: localizedText(
        locale,
        "criteria cannot include and exclude the same word.",
        "criteria kan inte inkludera och exkludera samma ord.",
        "criteria no puede incluir y excluir la misma palabra.",
        "criteria ne peut pas inclure et exclure le même mot.",
        "criteria 不能同时包含和排除同一个词。",
      ),
    };
  }

  return {
    criteria: {
      minLength,
      maxLength,
      nameLanguage: nameLanguage as NameLanguage,
      nameStyle: nameStyle as NameStyle,
      includeWords,
      excludeWords,
    },
  };
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex]!, shuffled[index]!];
  }
  return shuffled;
}

function uniqueWords(words: string[]): string[] {
  return [...new Set(words.map(asciiToken).filter((word) => word.length >= 2 && word.length <= 18))];
}

function themeWords(theme: unknown): string[] {
  if (typeof theme !== "string") return [];
  return uniqueWords(theme.match(/[\p{L}\p{N}]+/gu) ?? []).filter((word) => !BRIEF_STOP_WORDS.has(word) && (word.length >= 3 || isKnownTheme(word))).slice(0, 6);
}

function isLexiconMatch(token: string, trigger: string): boolean {
  return token === trigger
    || (trigger.length >= 4 && token.includes(trigger))
    || (token.length >= 5 && trigger.includes(token));
}

const BRIEF_STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in", "into", "is", "it", "of", "on", "or", "our", "that", "the", "to", "we", "with", "you", "your",
  "about", "also", "brand", "business", "can", "company", "create", "customers", "help", "make", "need", "people", "platform", "service", "should", "this", "use", "want", "will",
  "att", "av", "bara", "den", "det", "en", "ett", "finnas", "for", "fran", "har", "inte", "jag", "med", "min", "och", "pa", "sa", "ska", "som", "till", "vi", "vill", "vara", "vart", "ar",
  "bolag", "foretag", "for", "hjalpa", "kunder", "namn", "plattform", "tjanst", "vill", "vara", "webbplats", "viktig", "anvanda", "bygga", "gora", "kunna", "langa", "olika",
]);

function isKnownTheme(token: string): boolean {
  return Object.keys(THEME_LEXICON).some((trigger) => isLexiconMatch(token, trigger));
}

function normalizedReferenceWords(words: readonly string[]): string[] {
  return uniqueWords([...words]).filter((word) => (
    !BRIEF_STOP_WORDS.has(word)
    && (word.length >= 3 || isKnownTheme(word))
  ));
}

function extractBriefThemes(brief: string, locale: Locale): string[] {
  const counts = new Map<string, number>();
  for (const rawWord of brief.match(/[\p{L}\p{N}]+/gu) ?? []) {
    const word = asciiToken(rawWord);
    if (word.length < 3 || word.length > 18 || BRIEF_STOP_WORDS.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }

  const rankedWords = [...counts.entries()]
    .sort(([left, leftCount], [right, rightCount]) => {
      const leftScore = leftCount * 20 + (isKnownTheme(left) ? 35 : 0) + (left.length >= 5 && left.length <= 12 ? 4 : 0);
      const rightScore = rightCount * 20 + (isKnownTheme(right) ? 35 : 0) + (right.length >= 5 && right.length <= 12 ? 4 : 0);
      return rightScore - leftScore || left.localeCompare(right, locale);
    })
    .map(([word]) => word)
    .slice(0, 8);
  const useSwedishCorpus = locale === "sv" || isSwedishTheme(rankedWords);
  const directThemes = rankedWords.filter(isKnownTheme);
  const relatedThemes = expandTheme(directThemes, useSwedishCorpus);
  return uniqueWords([...directThemes, ...rankedWords, ...relatedThemes]).slice(0, 8);
}

function joinBriefThemes(themes: readonly string[], locale: Locale): string {
  if (themes.length === 0) return localizedText(locale, "the idea", "idén", "la idea", "l’idée", "这个想法");
  if (themes.length === 1) return themes[0]!;
  if (themes.length === 2) {
    return localizedText(locale, `${themes[0]} and ${themes[1]}`, `${themes[0]} och ${themes[1]}`, `${themes[0]} y ${themes[1]}`, `${themes[0]} et ${themes[1]}`, `${themes[0]} 和 ${themes[1]}`);
  }
  const last = themes.at(-1)!;
  const separator = localizedText(locale, ", and ", " och ", " y ", " et ", " 和 ");
  return `${themes.slice(0, -1).join(", ")}${separator}${last}`;
}

function localBriefAnalysis(brief: string, locale: Locale): BriefAnalysis {
  const themes = extractBriefThemes(brief, locale);
  const focus = joinBriefThemes(themes.slice(0, 3), locale);
  const hasThemes = themes.length > 0;

  return {
    mode: "local",
    themes: hasThemes
      ? themes
      : locale === "sv"
        ? ["tydlighet", "nytta", "form"]
        : locale === "es"
          ? ["claridad", "valor", "forma"]
          : locale === "fr"
            ? ["clarté", "valeur", "forme"]
            : locale === "zh"
              ? ["清晰", "价值", "形式"]
              : ["clarity", "value", "form"],
    creativeDirections: locale === "sv"
      ? [
        `Låt ${focus} styra de tydligaste namnen.`,
        "Prova korta sammansättningar med en varm och trovärdig känsla.",
        "Reservera mjuka ordlekar för mer varumärkeslika alternativ.",
      ]
      : locale === "es"
        ? [
          `Deja que ${focus} guíe las ideas de nombre más claras.`,
          "Prueba compuestos cortos con un tono cálido y fiable.",
          "Reserva las combinaciones suaves de palabras para alternativas más propias de marca.",
        ]
        : locale === "fr"
          ? [
            `Laissez ${focus} guider les idées de nom les plus claires.`,
            "Essayez des composés courts avec un ton chaleureux et fiable.",
            "Réservez les mélanges de mots doux aux alternatives plus adaptées à une marque.",
          ]
          : locale === "zh"
            ? [
              `让 ${focus} 引导最清晰的命名思路。`,
              "尝试简短的组合词，营造温暖、可靠的感觉。",
              "将柔和的词语组合留给更具品牌感的备选方案。",
            ]
            : [
              `Let ${focus} guide the clearest name ideas.`,
              "Try short compounds with a warm, trustworthy feel.",
              "Reserve gentle word blends for more brandable alternatives.",
            ],
    summary: locale === "sv"
      ? hasThemes
        ? `En lokal briefanalys hittade teman kring ${joinBriefThemes(themes.slice(0, 5), locale)}. Generatorn använder dem som semantiska ankare, relaterade begrepp och återhållsamma varumärkesordlekar.`
        : "En lokal briefanalys använder breda teman för att skapa tydliga, kreativa och uttalbara namnförslag."
      : locale === "es"
        ? hasThemes
          ? `Un análisis local del briefing encontró temas relacionados con ${joinBriefThemes(themes.slice(0, 5), locale)}. El generador los utiliza como anclajes semánticos, conceptos relacionados y combinaciones de marca contenidas.`
          : "Un análisis local del briefing utiliza temas amplios para crear propuestas de nombre claras, creativas y fáciles de pronunciar."
        : locale === "fr"
          ? hasThemes
            ? `Une analyse locale du brief a identifié des thèmes autour de ${joinBriefThemes(themes.slice(0, 5), locale)}. Le générateur les utilise comme repères sémantiques, concepts associés et mélanges de marque mesurés.`
            : "Une analyse locale du brief utilise de grands thèmes pour créer des idées de noms claires, créatives et faciles à prononcer."
          : locale === "zh"
            ? hasThemes
              ? `本地简介分析发现了与 ${joinBriefThemes(themes.slice(0, 5), locale)} 相关的主题。生成器将其用作语义锚点、相关概念和克制的品牌式组合。`
              : "本地简介分析使用广泛主题来生成清晰、有创意且易于发音的名称建议。"
            : hasThemes
              ? `A local brief analysis found themes around ${joinBriefThemes(themes.slice(0, 5), locale)}. The generator uses them as semantic anchors, related concepts, and restrained brand-style blends.`
              : "A local brief analysis uses broad themes to create clear, creative, pronounceable name ideas.",
  };
}

function safeAnalysisText(value: unknown, maximumLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const withoutControls = Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || codePoint === 127 ? " " : character;
  }).join("");
  const text = withoutControls.replace(/\s+/gu, " ").trim();
  return text.length > 0 && text.length <= maximumLength ? text : undefined;
}

function normalizeAiThemes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const words = value.flatMap((item) => {
    const text = safeAnalysisText(item, 64);
    return text?.match(/[\p{L}\p{N}]+/gu) ?? [];
  });
  return uniqueWords(words).slice(0, 8);
}

export function parseAiBriefAnalysis(value: unknown): BriefAnalysis | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !["themes", "creativeDirections", "summary"].includes(key))) return undefined;
  // Some Gateway providers enforce JSON shape but not array maxItems. Safely
  // trim a small surplus; never accept unbounded arrays or invalid field types.
  if (!Array.isArray(record.themes) || record.themes.length < 1 || record.themes.length > 16
    || record.themes.some((item) => (safeAnalysisText(item, 32)?.length ?? 0) < 2)) return undefined;
  if (!Array.isArray(record.creativeDirections) || record.creativeDirections.length < 1 || record.creativeDirections.length > 8
    || record.creativeDirections.some((item) => (safeAnalysisText(item, 120)?.length ?? 0) < 8)) return undefined;
  const themes = normalizeAiThemes(record.themes);
  const creativeDirections = Array.isArray(record.creativeDirections)
    ? record.creativeDirections.map((item) => safeAnalysisText(item, 120)).filter((item): item is string => Boolean(item)).slice(0, 3)
    : [];
  const summary = safeAnalysisText(record.summary, 320);
  if (themes.length === 0 || creativeDirections.length === 0 || !summary || summary.length < 12) return undefined;
  return { mode: "ai", themes, creativeDirections, summary };
}

function generationThemeFromBriefAnalysis(
  analysis: BriefAnalysis,
  brief: string,
  locale: Locale,
  priorityReferences: readonly string[] = [],
): string {
  // The optional short reference stays local and leads the generation theme;
  // it is not appended to the external advanced-brief analysis request.
  const input = `${analysis.themes.join(" ")} ${extractBriefThemes(brief, locale).join(" ")}`;
  const mergedThemes = uniqueWords([
    ...normalizedReferenceWords(priorityReferences),
    ...themeWords(input),
  ]).slice(0, 12);
  return mergedThemes.join(" ") || brief;
}

function isSwedishTheme(words: readonly string[]): boolean {
  return words.some((word) => (
    /[åäö]/i.test(word)
    || wordLanguage(word) === "swedish"
    || SWEDISH_THEME_TRIGGERS.some((trigger) => isLexiconMatch(word, trigger))
  ));
}

function expandTheme(words: string[], includeSwedishCorpus: boolean): string[] {
  const expanded: string[] = [];
  for (const word of words) {
    for (const [trigger, related] of Object.entries(THEME_LEXICON)) {
      if (isLexiconMatch(word, trigger)) {
        expanded.push(...related.filter((relatedWord) => (
          includeSwedishCorpus || wordLanguage(asciiToken(relatedWord)) !== "swedish"
        )));
      }
    }
  }
  return uniqueWords(expanded);
}

function wordLanguage(word: string): "swedish" | "english" | "neutral" {
  if (SWEDISH_WORDS.has(word) && !ENGLISH_WORDS.has(word)) return "swedish";
  if (ENGLISH_WORDS.has(word) && !SWEDISH_WORDS.has(word)) return "english";
  return "neutral";
}

function allowsCriteriaLanguage(word: string, language: NameLanguage): boolean {
  if (language === "auto" || language === "mixed") return true;
  const detected = wordLanguage(word);
  return language === "sv" ? detected !== "english" : detected !== "swedish";
}

function criteriaStyleWeight(namingPattern: NamingPattern, style: NameStyle): number {
  if (style === "balanced") return 0;
  const brandable = new Set<NamingPattern>([
    "brandBlend", "softBlend", "creativeVariant", "brandWord", "playfulCompound", "creativePair", "imageLedPair",
  ]);
  const descriptive = new Set<NamingPattern>([
    "keyword", "swedishCompound", "englishCompound", "thematicPair", "thematicSwedishCompound", "thematicEnglishCompound",
  ]);
  if (style === "brandable") return brandable.has(namingPattern) ? 16 : descriptive.has(namingPattern) ? -7 : 0;
  if (style === "descriptive") return descriptive.has(namingPattern) ? 16 : brandable.has(namingPattern) ? -7 : 0;
  // "invented" stays pronounceable and word-led, but moves compact blends
  // ahead of literal compounds rather than claiming a random string is a
  // meaningful name.
  return brandable.has(namingPattern) ? 20 : descriptive.has(namingPattern) ? -10 : 0;
}

function criteriaIncludeWeight(label: string, includeWords: readonly string[]): number {
  return includeWords.reduce((weight, word) => weight + (label.includes(word) ? 28 : 0), 0);
}

function clipForBlend(word: string): string {
  if (word.length <= 6) return word;
  const maximum = Math.min(7, word.length - 2);
  for (let index = maximum; index >= 4; index -= 1) {
    if (/[aeiouy]/.test(word[index - 1]!)) return word.slice(0, index);
  }
  return word.slice(0, maximum);
}

function joinWords(left: string, right: string): string {
  return joinNameWords(left, right);
}

function labelQuality(label: string): number {
  const lengthScore = label.length >= 5 && label.length <= 12 ? 20 : label.length <= 16 ? 13 : 5;
  const vowelRatio = (label.match(/[aeiouy]/g) ?? []).length / Math.max(label.length, 1);
  const vowelScore = vowelRatio >= 0.25 && vowelRatio <= 0.62 ? 12 : vowelRatio >= 0.18 && vowelRatio <= 0.7 ? 6 : 0;
  const hardToReadPenalty = /(.)\1\1|[^aeiouy]{5}/.test(label) ? 12 : 0;
  return lengthScore + vowelScore - hardToReadPenalty;
}

function familyKey(label: string, primaryWords: readonly string[]): string {
  // Prefixes do not create a new idea: getcoffee, mycoffee and coffeeworks
  // belong to the same family, including references shorter than four letters.
  const anchor = primaryWords.find((word) => hasDirectReference(label, [word]));
  return anchor ?? label.slice(0, Math.min(4, label.length));
}

function referenceStem(word: string): string {
  const normalized = asciiToken(word);
  if (normalized.length <= 5) return normalized;
  return normalized.slice(0, Math.max(5, Math.ceil(normalized.length * 0.6)));
}

function hasRepeatedToken(label: string): boolean {
  for (let tokenLength = 2; tokenLength <= Math.floor(label.length / 2); tokenLength += 1) {
    if (label.length % tokenLength !== 0) continue;
    const token = label.slice(0, tokenLength);
    if (token.repeat(label.length / tokenLength) === label) return true;
  }
  return false;
}

type ReferenceMatch = "direct" | "semantic" | "none";

function referenceMatch(
  label: string,
  primaryWords: readonly string[],
  semanticWords: readonly string[],
): ReferenceMatch {
  if (hasDirectReference(label, primaryWords)) {
    return "direct";
  }

  if (semanticWords.some((word) => {
    // Short concept words such as "lov" and "rit" are useful Swedish
    // anchors, but only as a visible prefix/suffix so they cannot match an
    // unrelated word by accident.
    return word.length < 4
      ? label.startsWith(word) || label.endsWith(word)
      : label.includes(word);
  })) {
    return "semantic";
  }

  return "none";
}

function hasDirectReference(label: string, referenceWords: readonly string[]): boolean {
  return referenceWords.some((word) => {
    const stem = referenceStem(word);
    return label.includes(word) || (stem.length >= 4 && label.includes(stem));
  });
}

function pickDiverseLabels(
  candidates: GeneratedLabel[],
  count: number,
  requireReferenceRelevance = false,
): GeneratedLabel[] {
  const ranked = [...candidates].sort((a, b) => {
    if (requireReferenceRelevance && a.isReferenceRelevant !== b.isReferenceRelevant) {
      return a.isReferenceRelevant ? -1 : 1;
    }
    return b.score - a.score || a.label.localeCompare(b.label);
  });
  const eligibleCandidates = requireReferenceRelevance
    ? ranked.filter((candidate) => candidate.isReferenceRelevant)
    : [];
  const orderedCandidates = requireReferenceRelevance ? eligibleCandidates : ranked;
  const selected: GeneratedLabel[] = [];
  const selectedLabels = new Set<string>();

  // A themed search gets more room per family because a rare made-up word is
  // still better represented by several intentional variations than by an
  // unrelated filler. Blank searches keep the broader diversity limit.
  const familyLimits = requireReferenceRelevance
    ? [3, 6, Number.POSITIVE_INFINITY]
    : [2, 4, Number.POSITIVE_INFINITY];
  for (const familyLimit of familyLimits) {
    const familyCounts = new Map<string, number>();
    for (const candidate of selected) {
      const family = candidate.family;
      familyCounts.set(family, (familyCounts.get(family) ?? 0) + 1);
    }
    for (const candidate of orderedCandidates) {
      if (selected.length >= count) return selected;
      if (selectedLabels.has(candidate.label)) continue;
      const family = candidate.family;
      if ((familyCounts.get(family) ?? 0) >= familyLimit) continue;
      selected.push(candidate);
      selectedLabels.add(candidate.label);
      familyCounts.set(family, (familyCounts.get(family) ?? 0) + 1);
    }
  }
  return selected;
}

/**
 * Creates a varied, deterministic naming session rather than merely applying
 * prefixes and suffixes. It starts with the user's words, expands familiar
 * Swedish/English topics, then mixes semantic compounds, gentle blends and
 * invented but pronounceable brand tails. Availability is deliberately not a
 * generation signal: only the registry check below can establish that.
 */
export function generateCandidates(
  tlds: string[],
  count: number,
  theme: unknown,
  locale: Locale,
  criteria?: AdvancedSearchCriteria,
  priorityReference?: unknown,
  creativeMode?: CreativeSearchMode,
  refinement?: SearchRefinement,
): GeneratedCandidate[] {
  const themedWords = themeWords(theme);
  const priorityReferenceWords = themeWords(priorityReference);
  // Inclusion words become direct anchors as well as a ranking signal. This
  // makes the advanced control useful for a niche brief without forcing every
  // result to repeat the same literal word.
  const primaryWords = criteria
    ? uniqueWords([...criteria.includeWords, ...themedWords])
    : themedWords;
  // Preserve the existing automatic language inference for old requests. A
  // supplied language criterion explicitly changes the corpus and seed.
  const inferredSwedishCorpus = isSwedishTheme(primaryWords)
    || (locale === "sv" && !primaryWords.some((word) => wordLanguage(word) === "english"));
  const language = criteria?.nameLanguage ?? "auto";
  // Explicit advanced `nameStyle` remains the authority. A basic card only
  // changes ranking; it never adds implicit length, language or word filters.
  const effectiveNameStyle = criteria?.nameStyle ?? (creativeMode
    ? creativeModeNameStyle(creativeMode)
    : "balanced");
  const useSwedishCorpus = language === "sv"
    || language === "mixed"
    || (language === "auto" && inferredSwedishCorpus);
  const useEnglishCorpus = language !== "sv";
  const expandedThemeWords = expandTheme(primaryWords, useSwedishCorpus);
  const semanticWords = criteria
    ? expandedThemeWords.filter((word) => allowsCriteriaLanguage(word, language))
    : expandedThemeWords;
  const fallbackWords = primaryWords.length > 0
    ? []
    : criteria && language === "mixed"
      ? ["nord", "spira", "glimt", "luma", "vista", "bloom", "bridge", "canvas", "flow", "orbit", "spark"]
      : useSwedishCorpus
        ? ["nord", "spira", "glimt", "luma", "vista"]
        : ["bloom", "bridge", "canvas", "flow", "luma", "orbit", "spark", "vista"];
  const anchors = uniqueWords([...primaryWords, ...semanticWords, ...fallbackWords]);
  const seed = criteria
    ? `${tlds.join(",")}|${primaryWords.join(",")}|creative-v4|${locale}|${language}|${criteria.nameStyle}|${criteria.minLength}-${criteria.maxLength}|${criteria.includeWords.join(",")}|${criteria.excludeWords.join(",")}`
    : `${tlds.join(",")}|${primaryWords.join(",")}|creative-v3|${locale}|${useSwedishCorpus ? "sv" : "global"}${creativeMode ? `|${creativeMode}` : ""}`;
  const random = seededRandom(makeSeed(seed));
  const swedishTails = !useSwedishCorpus ? [] : shuffle(SWEDISH_TAILS, random);
  const englishTails = !useEnglishCorpus ? [] : shuffle(ENGLISH_TAILS, random);
  const brandTails = shuffle(BRAND_TAILS, random);
  const nordicWords = criteria && !useSwedishCorpus ? [] : shuffle(NORDIC_WORDS, random);
  const globalWords = criteria && !useEnglishCorpus ? [] : shuffle(GLOBAL_WORDS, random);
  const referenceSuffixes = language === "sv" ? [...SWEDISH_TAILS, ...NORDIC_WORDS] : REFERENCE_SUFFIXES;
  const referencePrefixes = language === "sv" ? ["min", "ny", "nord", "sam", "trygg"] : REFERENCE_PREFIXES;
  const companions = uniqueWords([
    ...semanticWords,
    ...(useSwedishCorpus ? nordicWords : []),
    ...globalWords,
  ]);
  const constructionContext = primaryWords.some((word) => /bygg|construction|building|fastighet/.test(word));
  // A construction-specific tail is useful for builders, not a default
  // completion for every cafe, hair salon, or consultancy.
  const suitableSwedishTails = swedishTails.filter((word) => word !== "bygg" || constructionContext);
  const swedishCompanions = companions.filter((word) => wordLanguage(word) !== "english");
  const englishCompanions = companions.filter((word) => wordLanguage(word) !== "swedish");
  const hasSemanticContext = primaryWords.length > 0 && semanticWords.length > 0;
  const labels = new Map<string, GeneratedLabel>();
  const previousLabels = new Set(refinement?.previousNames.map(name => name.split(".")[0]));

  const add = (value: string, namingPattern: NamingPattern, relevance: number) => {
    const label = asciiToken(value);
    if (previousLabels.has(label)) return;
    // Deliberately avoid one- and two-character labels, long awkward labels,
    // numbers, and hyphens. This is a brand-name generator, not a brute-force
    // registrar probe.
    if (!/^[a-z][a-z0-9]{2,21}$/.test(label)) return;
    if (criteria && (label.length < criteria.minLength || label.length > criteria.maxLength)) return;
    if (criteria?.excludeWords.some((word) => label.includes(word))) return;
    if (hasRepeatedToken(label)) return;
    const match = primaryWords.length > 0
      ? referenceMatch(label, primaryWords, semanticWords)
      : "semantic";
    const isPriorityReferenceRelevant = priorityReferenceWords.length === 0
      || hasDirectReference(label, priorityReferenceWords);
    // A reference word is a hard relevance requirement, not a weak scoring
    // preference. If we cannot create a relevant suggestion, we return fewer
    // results instead of padding the list with random-looking names.
    if (primaryWords.length > 0 && match === "none") return;
    // In Advanced search, a short reference is explicitly entered by the
    // person using the tool. The analysed brief can add context, but should
    // never displace that reference with an unrelated naming direction.
    if (!isPriorityReferenceRelevant) return;
    const candidate: GeneratedLabel = {
      label,
      family: familyKey(label, primaryWords),
      namingPattern,
      score: relevance
        + (priorityReferenceWords.length > 0 ? 42 : 0)
        + (match === "direct"
          ? hasSemanticContext ? 54 : 92
          : match === "semantic" ? hasSemanticContext ? 62 : 36 : 0)
        + labelQuality(label)
        + (useSwedishCorpus && namingPattern.includes("Swedish") ? 12 : 0)
        + (useSwedishCorpus && namingPattern === "swedishCompound" ? 12 : 0)
        + criteriaStyleWeight(namingPattern, effectiveNameStyle)
        + (criteria ? criteriaIncludeWeight(label, criteria.includeWords) : 0)
        + random() * 0.75,
      isReferenceRelevant: primaryWords.length === 0 || match !== "none",
      isPriorityReferenceRelevant,
    };
    const current = labels.get(label);
    if (!current || candidate.score > current.score) labels.set(label, candidate);
  };

  const focusedAnchors = anchors.slice(0, 24);
  const primaryForIdeas = primaryWords.length > 0 ? primaryWords : fallbackWords;

  // Keep a multiword idea intact before exploring its individual concepts.
  for (let index = 0; index < primaryWords.length - 1; index += 1) {
    add(joinWords(primaryWords[index]!, primaryWords[index + 1]!), "thematicPair", 58);
  }

  // Directly relevant ideas: the supplied term paired with language-appropriate
  // meaning words, plus short brandable variants.
  for (const primary of primaryForIdeas) {
    add(primary, "keyword", 64);
    if (useSwedishCorpus) {
      for (const tail of suitableSwedishTails.slice(0, 9)) {
        add(joinWords(primary, tail), "swedishCompound", 42);
      }
    }
    for (const tail of englishTails.slice(0, 8)) {
      add(joinWords(primary, tail), "englishCompound", 40);
    }
    // Keep the full reference word in enough direct variants for niche or
    // invented input. A clipped blend is attractive only when it still has
    // clear evidence of the original term, so it is added separately below.
    for (const tail of referenceSuffixes.filter((word) => word !== "bygg" || constructionContext)) {
      add(joinWords(primary, tail), "creativeVariant", 46);
    }
    for (const prefix of referencePrefixes) {
      add(joinWords(prefix, primary), "creativeVariant", 43);
    }
    for (const tail of brandTails) {
      add(joinWords(primary, tail), "brandBlend", 39);
    }
  }

  // Topic expansion provides names that are genuinely related to the idea,
  // even when they do not literally repeat the typed word in every result.
  for (let index = 0; index < focusedAnchors.length; index += 1) {
    const anchor = focusedAnchors[index]!;
    const language = wordLanguage(anchor);
    const languageCompanions = language === "swedish"
      ? swedishCompanions
      : language === "english"
        ? englishCompanions
        : companions;
    const naturalCompanions = languageCompanions.length > 0
      ? languageCompanions
      : companions.length > 0
        ? companions
        : referenceSuffixes;
    const partner = naturalCompanions[(index * 5 + 3) % naturalCompanions.length]!;
    const alternate = naturalCompanions[(index * 7 + 11) % naturalCompanions.length]!;
    const relevance = primaryWords.includes(anchor) ? 34 : semanticWords.includes(anchor) ? 29 : 17;
    add(joinWords(anchor, partner), "thematicPair", relevance);
    // Give topic words a couple of natural compounds before the looser blends.
    // That produces e.g. husglimt, planverket and homewise rather than a page
    // dominated by arbitrary prefix/suffix permutations.
    if (useSwedishCorpus && language !== "english") {
      for (const tail of suitableSwedishTails.slice(index % 4, (index % 4) + 2)) {
        add(joinWords(anchor, tail), "thematicSwedishCompound", relevance - 1);
      }
    }
    if (language !== "swedish") {
      for (const tail of englishTails.slice(index % 5, (index % 5) + 2)) {
        add(joinWords(anchor, tail), "thematicEnglishCompound", relevance - 2);
      }
    }
    if (anchor !== partner && index % 2 === 0) {
      add(joinWords(partner, anchor), "reverseWordplay", relevance - 10);
    }
    add(joinWords(clipForBlend(anchor), alternate), "softBlend", relevance - 4);
    add(joinWords(anchor, brandTails[index % brandTails.length]!), "creativeVariant", relevance - 7);
  }

  // Blank searches may explore broadly. The exact same fallback is excluded
  // for a themed search so it cannot dilute the user's reference word.
  if (primaryWords.length === 0) {
    const evocativeWords = uniqueWords([...(useSwedishCorpus ? nordicWords : []), ...globalWords]);
    for (let index = 0; index < evocativeWords.length; index += 1) {
      const left = evocativeWords[index]!;
      const right = evocativeWords[(index * 9 + 5) % evocativeWords.length]!;
      if (left !== right) add(joinWords(left, right), "imageLedPair", 15);
    }

    for (let attempt = 0; labels.size < count * 3 && attempt < count * 16; attempt += 1) {
      const left = companions[Math.floor(random() * companions.length)]!;
      const right = evocativeWords[Math.floor(random() * evocativeWords.length)]!;
      const tail = brandTails[Math.floor(random() * brandTails.length)]!;
      if (attempt % 3 === 0) add(joinWords(left, right), "creativePair", 11);
      else if (attempt % 3 === 1) add(joinWords(clipForBlend(left), tail), "brandWord", 10);
      else add(joinWords(left, clipForBlend(right)), "playfulCompound", 9);
    }
  }

  const selected = pickDiverseLabels([...labels.values()], count, primaryWords.length > 0);
  return selected.map((candidate, index) => ({
    domain: `${candidate.label}.${tlds[index % tlds.length]!}`,
    namingPattern: candidate.namingPattern,
  }));
}

function localizedNamingPattern(namingPattern: NamingPattern, locale: Locale): string {
  const patterns: Record<NamingPattern, [english: string, swedish: string, spanish: string, french: string, chinese: string]> = {
    exactDomain: ["exact domain check", "exakt domänkontroll", "comprobación exacta de dominio", "vérification exacte du domaine", "精确域名查询"],
    keyword: ["your keyword", "ditt nyckelord", "tu palabra clave", "votre mot-clé", "你的关键词"],
    swedishCompound: ["Swedish compound", "svenskt sammansatt ord", "compuesto sueco", "composé suédois", "瑞典复合词"],
    englishCompound: ["English compound", "engelskt sammansatt ord", "compuesto inglés", "composé anglais", "英语复合词"],
    brandBlend: ["short brand-style blend", "kort ordlek med varumärkeskänsla", "combinación corta de estilo de marca", "mélange court de style marque", "简短的品牌式组合"],
    thematicPair: ["thematic word pair", "tematiskt ordpar", "par de palabras temático", "paire de mots thématique", "主题词对"],
    thematicSwedishCompound: ["thematic Swedish compound", "tematiskt svenskt sammansatt ord", "compuesto sueco temático", "composé suédois thématique", "主题瑞典复合词"],
    thematicEnglishCompound: ["thematic English compound", "tematiskt engelskt sammansatt ord", "compuesto inglés temático", "composé anglais thématique", "主题英语复合词"],
    reverseWordplay: ["reverse wordplay", "omvänd ordlek", "juego de palabras inverso", "jeu de mots inversé", "反向文字游戏"],
    softBlend: ["soft word blend", "mjuk språkblandning", "combinación suave de palabras", "mélange de mots doux", "柔和词语组合"],
    creativeVariant: ["short creative variation", "kort kreativ variant", "variación creativa corta", "courte variation créative", "简短创意变体"],
    imageLedPair: ["image-led word pair", "bilddrivet ordpar", "par de palabras evocador", "paire de mots évocatrice", "意象词对"],
    creativePair: ["creative word pair", "kreativt ordpar", "par de palabras creativo", "paire de mots créative", "创意词对"],
    brandWord: ["short brand word", "kort varumärkesord", "palabra de marca corta", "mot de marque court", "简短品牌词"],
    playfulCompound: ["playful compound", "lekfull sammansättning", "compuesto lúdico", "composé ludique", "趣味复合词"],
    contextual: ["AI-generated naming direction", "AI-genererat namnspår", "idea de nombre generada con IA", "piste de nom générée par IA", "AI 生成的命名方向"],
    swipeRandom: ["fresh Swipe name", "nytt Swajpnamn", "nombre nuevo de Swipe", "nouveau nom Swipe", "新的 Swipe 名称"],
  };
  return patterns[namingPattern][locale === "sv" ? 1 : locale === "es" ? 2 : locale === "fr" ? 3 : locale === "zh" ? 4 : 0];
}

export function screening(
  domain: string,
  namingPattern: NamingPattern,
  locale: Locale,
): Pick<SearchResult, "registrarPrice" | "estimatedValue" | "confidenceScore" | "namingScore" | "rationale"> {
  const [label, tld] = domain.split(".");
  const { score } = nameQualitySignals(label);
  return {
    registrarPrice: 0,
    // Legacy numeric field: zero means no valuation was performed. Never
    // manufacture a monetary estimate from length or the chosen extension.
    estimatedValue: 0,
    confidenceScore: Math.min(45, Math.round(15 + score * 0.3)),
    namingScore: score,
    rationale: localizedText(
      locale,
      `Name idea: ${localizedNamingPattern(namingPattern, locale)}. Transparent screening: ${label.length} characters, .${tld}, ${score}/100 naming signal. This is not a market value, price, or purchase recommendation.`,
      `Namnidé: ${localizedNamingPattern(namingPattern, locale)}. Transparent screening: ${label.length} tecken, .${tld}, ${score}/100 namnsignal. Detta är inte ett marknadsvärde, pris eller en köprekommendation.`,
      `Idea de nombre: ${localizedNamingPattern(namingPattern, locale)}. Evaluación transparente: ${label.length} caracteres, .${tld}, señal de nombre ${score}/100. Esto no es un valor de mercado, precio ni recomendación de compra.`,
      `Idée de nom : ${localizedNamingPattern(namingPattern, locale)}. Analyse transparente : ${label.length} caractères, .${tld}, signal de nom ${score}/100. Il ne s’agit pas d’une valeur de marché, d’un prix ni d’une recommandation d’achat.`,
      `名称思路：${localizedNamingPattern(namingPattern, locale)}。透明筛选：${label.length} 个字符，.${tld}，名称信号 ${score}/100。这不是市场估值、价格或购买建议。`,
    ),
  };
}

function defaultRegistrarOffer(tld: string, locale: Locale): RegistrarOffer {
  return {
    providerId: "loopia",
    registrar: "Loopia",
    purchaseUrl: LOOPIA_PURCHASE_URL,
    priceSourceUrl: LOOPIA_PRICE_LIST_URL,
    priceStatus: "unavailable",
    dataSource: "loopia_public_price_list",
    connectorState: "public_source_active",
    priceScope: "standard_tld",
    currency: "SEK",
    checkedAt: null,
    priceVerified: false,
    note: localizedText(
      locale,
      `No verified Loopia price is available for .${tld} from the latest price-list check.`,
      `Inget verifierat Loopia-pris för .${tld} finns från den senaste prislistkontrollen.`,
      `No hay un precio verificado de Loopia para .${tld} en la última comprobación de la lista de precios.`,
      `Aucun prix Loopia vérifié pour .${tld} n’est disponible dans le dernier contrôle de la liste de prix.`,
      `最新价目表检查中没有 .${tld} 的已验证 Loopia 价格。`,
    ),
  };
}

function tldesPriceFeedConfigured(): boolean {
  // This is the only environment variable used by the aggregated price feed.
  // It is read exclusively on the server and is never put in a response,
  // source URL, error message, or log line.
  return Boolean(process.env.TLDES_API_KEY?.trim());
}

function officialProviderApiCredentialsConfigured(providerId: Exclude<ProviderId, "loopia">): boolean {
  const config = OFFICIAL_PROVIDER_PRICE_API_ENV[providerId];
  // This only detects server-side deployment configuration. It never exposes
  // a value, calls a configured URL, or treats credentials as a price source.
  return Boolean(process.env[config.endpointEnv]?.trim() && process.env[config.tokenEnv]?.trim());
}

function providerPriceConnector(providerId: ProviderId): Pick<RegistrarOffer, "dataSource" | "connectorState"> {
  if (providerId === "loopia") {
    return { dataSource: "loopia_public_price_list", connectorState: "public_source_active" };
  }
  if (providerId === "porkbun") {
    return { dataSource: "official_provider_api", connectorState: "public_source_active" };
  }
  if (tldesPriceFeedConfigured()) {
    return { dataSource: "tldes_price_feed", connectorState: "aggregated_price_feed_configured" };
  }
  return officialProviderApiCredentialsConfigured(providerId)
    ? { dataSource: "official_provider_api", connectorState: "official_api_credentials_configured" }
    : { dataSource: "provider_search_page", connectorState: "official_api_not_configured" };
}

function providerPriceConnectionNote(
  provider: ProviderCatalogEntry,
  connectorState: ProviderPriceConnectorState,
  locale: Locale,
): string {
  if (provider.id === "porkbun" && connectorState === "public_source_active") {
    return localizedPorkbunPriceNote(locale);
  }
  if (connectorState === "aggregated_price_feed_configured") {
    return localizedText(
      locale,
      `Published standard TLD prices for ${provider.registrar} are read from the hourly TLDES price feed. Taxes and fees may not be included; confirm the checkout total with the provider.`,
      `Publicerade standardpriser för TLD:er hos ${provider.registrar} hämtas från TLDES prisflöde varje timme. Skatter och avgifter kan saknas; bekräfta slutpriset hos leverantören.`,
      `Los precios estándar publicados de TLD para ${provider.registrar} se obtienen del feed horario de precios de TLDES. Es posible que no incluyan impuestos ni tasas; confirma el total en el proveedor.`,
      `Les prix standard publiés des TLD chez ${provider.registrar} proviennent du flux horaire de TLDES. Les taxes et frais peuvent ne pas être inclus ; confirmez le total chez le fournisseur.`,
      `${provider.registrar} 的已发布标准 TLD 价格来自 TLDES 每小时价格源。价格可能不含税费；请在服务商处确认结算总额。`,
    );
  }
  if (connectorState === "official_api_credentials_configured") {
    return localizedText(
      locale,
      `Official API credentials are configured for ${provider.registrar}, but no reviewed price adapter is enabled yet. Open the provider to check the current price and availability.`,
      `Officiella API-uppgifter är konfigurerade för ${provider.registrar}, men ingen granskad prisadapter är aktiverad ännu. Öppna leverantören för att kontrollera aktuellt pris och tillgänglighet.`,
      `Las credenciales de la API oficial están configuradas para ${provider.registrar}, pero aún no hay un adaptador de precios revisado activo. Abre el proveedor para comprobar el precio y la disponibilidad actuales.`,
      `Les identifiants de l’API officielle sont configurés pour ${provider.registrar}, mais aucun adaptateur de prix validé n’est encore activé. Ouvrez le fournisseur pour vérifier le prix et la disponibilité actuels.`,
      `${provider.registrar} 的官方 API 凭据已配置，但尚未启用经过审核的价格适配器。请打开服务商以查看当前价格和可用性。`,
    );
  }
  return localizedText(
    locale,
    `Live pricing is not connected for ${provider.registrar}. Open the provider to check the current price and availability.`,
    `Livepris är inte anslutet för ${provider.registrar}. Öppna leverantören för att kontrollera aktuellt pris och tillgänglighet.`,
    `El precio en tiempo real no está conectado para ${provider.registrar}. Abre el proveedor para comprobar el precio y la disponibilidad actuales.`,
    `La tarification en direct n’est pas connectée pour ${provider.registrar}. Ouvrez le fournisseur pour vérifier le prix et la disponibilité actuels.`,
    `${provider.registrar} 未连接实时价格。请打开服务商以查看当前价格和可用性。`,
  );
}

function providerComparisonOffer(
  providerId: Exclude<ProviderId, "loopia">,
  domain: string,
  tld: string,
  tldesPriceFeedLookup: TldesPriceFeedLookup,
  porkbunPriceLookup: RegistrarPriceLookup,
  locale: Locale,
): RegistrarOffer {
  const provider = PROVIDER_CATALOG[providerId];
  const connector = providerPriceConnector(providerId);
  const directOffer = providerId === "porkbun" ? porkbunPriceLookup.offers.get(tld) : undefined;
  if (directOffer) {
    return { ...directOffer, purchaseUrl: provider.purchaseUrl(domain), note: localizedPorkbunPriceNote(locale) };
  }
  const tldesOffer = tldesPriceFeedLookup.offers.get(tldesOfferKey(providerId, tld));
  if (tldesOffer) {
    return {
      ...tldesOffer,
      purchaseUrl: provider.purchaseUrl(domain),
      note: localizedTldesPriceFeedNote(tld, locale),
    };
  }
  if (providerId === "porkbun") {
    return {
      providerId, registrar: provider.registrar, purchaseUrl: provider.purchaseUrl(domain),
      priceSourceUrl: PORKBUN_PRICE_API_URL, priceStatus: "unavailable", ...connector,
      checkedAt: porkbunPriceLookup.checkedAt, priceVerified: false,
      note: localizedText(locale,
        `No current published .${tld} price was returned by Porkbun. Open the provider to check availability and the checkout total.`,
        `Inget aktuellt publicerat pris för .${tld} kunde hämtas från Porkbun. Öppna leverantören för att kontrollera tillgänglighet och slutpris.`,
        `No se obtuvo un precio publicado actual de .${tld} en Porkbun. Abre el proveedor para comprobar disponibilidad y total.`,
        `Aucun prix publié actuel du .${tld} n’a été obtenu de Porkbun. Vérifiez la disponibilité et le total chez le fournisseur.`,
        `未能从 Porkbun 获取 .${tld} 当前公开价格。请在服务商处确认可用性和结算总额。`),
    };
  }
  const priceFeedConfigured = connector.connectorState === "aggregated_price_feed_configured";
  return {
    providerId,
    registrar: provider.registrar,
    purchaseUrl: provider.purchaseUrl(domain),
    priceSourceUrl: priceFeedConfigured ? TLDES_PRICE_FEED_DOCS_URL : provider.priceSourceUrl,
    priceStatus: priceFeedConfigured ? "unavailable" : "not_connected",
    ...connector,
    // There is intentionally no numeric price here. A comparison card must
    // never turn a static page, promotion, or screening value into a quote.
    checkedAt: priceFeedConfigured ? tldesPriceFeedLookup.checkedAt : null,
    priceVerified: false,
    note: priceFeedConfigured
      ? localizedTldesPriceFeedUnavailableNote(provider, tld, tldesPriceFeedLookup.checkedAt, locale)
      : providerPriceConnectionNote(provider, connector.connectorState, locale),
  };
}

function registrarOffersForDomain(
  domain: string,
  tld: string,
  providerIds: readonly ProviderId[],
  loopiaPriceLookup: RegistrarPriceLookup,
  tldesPriceFeedLookup: TldesPriceFeedLookup,
  porkbunPriceLookup: RegistrarPriceLookup,
  locale: Locale,
): RegistrarOffer[] {
  return providerIds.map((providerId) => providerId === "loopia"
    ? loopiaPriceLookup.offers.get(tld) ?? { ...defaultRegistrarOffer(tld, locale), checkedAt: loopiaPriceLookup.checkedAt }
    : providerComparisonOffer(providerId, domain, tld, tldesPriceFeedLookup, porkbunPriceLookup, locale));
}

function selectedProviderMetadata(providerIds: readonly ProviderId[], locale: Locale): Array<{
  id: ProviderId;
  registrar: string;
  searchUrl: string;
  priceSourceUrl: string;
  livePriceConnection: boolean;
  dataSource: ProviderPriceDataSource;
  connectorState: ProviderPriceConnectorState;
  note: string;
}> {
  return providerIds.map((providerId) => {
    const provider = PROVIDER_CATALOG[providerId];
    const connector = providerPriceConnector(providerId);
    const livePriceConnection = connector.connectorState === "public_source_active"
      || connector.connectorState === "aggregated_price_feed_configured";
    return {
      id: providerId,
      registrar: provider.registrar,
      searchUrl: provider.purchaseUrl(""),
      priceSourceUrl: connector.dataSource === "tldes_price_feed"
        ? TLDES_PRICE_FEED_DOCS_URL
        : providerId === "porkbun" ? PORKBUN_PRICE_API_URL : provider.priceSourceUrl,
      livePriceConnection,
      ...connector,
      note: providerId === "loopia"
        ? localizedText(
          locale,
          "Current pricing is fetched from Loopia's public price list when available.",
          "Aktuellt pris hämtas från Loopias publika prislista när det är tillgängligt.",
          "El precio actual se obtiene de la lista pública de precios de Loopia cuando está disponible.",
          "Le prix actuel est obtenu depuis la liste de prix publique de Loopia lorsqu’il est disponible.",
          "当前价格会在可用时从 Loopia 的公开价目表获取。",
        )
        : providerPriceConnectionNote(provider, connector.connectorState, locale),
    };
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseSwedishPrice(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const normalized = value
    .replace(/&nbsp;|\u00a0/g, " ")
    .replace(/\s/g, "")
    .replace(",", ".")
    .replace(/[^0-9.]/g, "");
  const price = Number.parseFloat(normalized);
  return Number.isFinite(price) && price >= 0 ? price : undefined;
}

function priceFromCell(cell: string, cssClass: "without_tax" | "with_tax"): number | undefined {
  const match = cell.match(new RegExp(
    `<span\\b[^>]*class\\s*=\\s*["'][^"']*${cssClass}[^"']*["'][^>]*>\\s*([^<]+?)\\s*<\\/span>`,
    "i",
  ));
  return parseSwedishPrice(match?.[1]);
}

function localizedRegistrarOffer(offer: RegistrarOffer, locale: Locale): RegistrarOffer {
  const note = offer.priceType === "campaign"
    ? localizedText(
      locale,
      "First-year promotional price.",
      "Kampanjpris för första året.",
      "Precio promocional del primer año.",
      "Prix promotionnel de la première année.",
      "首年促销价。",
    )
    : localizedText(
      locale,
      "Standard first-year price.",
      "Standardpris för första året.",
      "Precio estándar del primer año.",
      "Prix standard de la première année.",
      "首年标准价。",
    );
  return { ...offer, note };
}

function parseLoopiaOffer(html: string, tld: string, checkedAt: string): RegistrarOffer | undefined {
  // Loopia sometimes appends a footnote to the TLD cell, e.g.
  // `<td>.dev <sup>…</sup></td>`. Match the first cell by its visible TLD,
  // while still requiring a delimiter immediately after it so `.dev` never
  // accidentally matches a longer suffix such as `.device`.
  const row = html.match(new RegExp(
    `<tr\\b[^>]*>\\s*<td\\b[^>]*>\\s*\\.${escapeRegExp(tld)}(?=\\s|<|&)(?:[\\s\\S]*?)<\\/td>([\\s\\S]*?)<\\/tr>`,
    "i",
  ));
  if (!row?.[1]) return undefined;

  const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => match[1] ?? "");
  const registrationCell = cells[0];
  if (!registrationCell) return undefined;
  const registrationPriceInclVat = priceFromCell(registrationCell, "with_tax");
  const registrationPriceExVat = priceFromCell(registrationCell, "without_tax");
  if (registrationPriceInclVat === undefined || registrationPriceExVat === undefined) return undefined;

  const renewalPriceInclVat = cells[1] ? priceFromCell(cells[1], "with_tax") : undefined;
  const priceType = /campaign-price/i.test(registrationCell) ? "campaign" : "standard";
  return {
    providerId: "loopia",
    registrar: "Loopia",
    purchaseUrl: LOOPIA_PURCHASE_URL,
    priceSourceUrl: LOOPIA_PRICE_LIST_URL,
    priceStatus: "verified",
    dataSource: "loopia_public_price_list",
    connectorState: "public_source_active",
    priceScope: "standard_tld",
    currency: "SEK",
    registrationPriceInclVat,
    registrationPriceExVat,
    renewalPriceInclVat,
    priceType,
    checkedAt,
    priceVerified: true,
  };
}

function localizedRegistrarOffers(offers: ReadonlyMap<string, RegistrarOffer>, locale: Locale): Map<string, RegistrarOffer> {
  return new Map([...offers].map(([tld, offer]) => [tld, localizedRegistrarOffer(offer, locale)]));
}

function tldesOfferKey(providerId: ProviderId, tld: string): string {
  return `${providerId}:${tld.toLowerCase()}`;
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function localizedPorkbunPriceNote(locale: Locale): string {
  return localizedText(
    locale,
    "Published standard TLD registration and renewal prices in USD from Porkbun's public API. Premium domains, taxes, and checkout conditions may change the total; confirm the exact domain with the provider.",
    "Publicerade standardpriser för TLD-registrering och förnyelse i USD från Porkbuns publika API. Premiumdomäner, skatter och köpvillkor kan ändra totalpriset; bekräfta den exakta domänen hos leverantören.",
    "Precios estándar publicados de registro y renovación de TLD en USD desde la API pública de Porkbun. Los dominios premium, impuestos y condiciones pueden cambiar el total; confirma el dominio exacto con el proveedor.",
    "Prix standard publiés d’enregistrement et de renouvellement des TLD en USD depuis l’API publique de Porkbun. Les domaines premium, taxes et conditions peuvent modifier le total ; confirmez le domaine exact chez le fournisseur.",
    "来自 Porkbun 公开 API 的 TLD 标准注册和续费美元价格。溢价域名、税费和结算条件可能改变总额；请在服务商处确认精确域名。",
  );
}

function parsePorkbunPricePayload(payload: unknown, checkedAt: string): RegistrarPriceLookup {
  const root = recordValue(payload);
  const pricing = recordValue(root?.pricing);
  if (root?.status !== "SUCCESS" || !pricing) {
    throw new RegistrarPriceSourceError("invalid_response");
  }

  const offers = new Map<string, RegistrarOffer>();
  // Read only our audited suffixes. Ignore upstream links, coupons, alternate
  // naming systems (e.g. Handshake), and all domain-specific assertions.
  for (const tld of ALLOWED_TLDS) {
    const entry = recordValue(pricing[tld]);
    if (!entry || (entry.specialType !== undefined && entry.specialType !== "")) continue;
    const registrationPrice = publishedPriceAmount(entry.registration);
    const renewalPrice = publishedPriceAmount(entry.renewal);
    if (registrationPrice === undefined || renewalPrice === undefined) continue;
    offers.set(tld, {
      providerId: "porkbun",
      registrar: "Porkbun",
      purchaseUrl: PROVIDER_CATALOG.porkbun.purchaseUrl(""),
      priceSourceUrl: PORKBUN_PRICE_API_URL,
      priceStatus: "verified",
      dataSource: "official_provider_api",
      connectorState: "public_source_active",
      priceScope: "standard_tld",
      currency: "USD",
      registrationPrice,
      renewalPrice,
      taxTreatment: "unknown",
      priceType: "standard",
      checkedAt,
      priceVerified: true,
    });
  }
  return { checkedAt, offers };
}

async function fetchPorkbunPrices(checkedAt: string): Promise<RegistrarPriceLookup> {
  const controller = new AbortController();
  // Keep the timeout alive through body consumption, including a provider
  // that sends headers promptly but never finishes its JSON response.
  const timeout = setTimeout(() => controller.abort(), PORKBUN_PRICE_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(PORKBUN_PRICE_API_URL, {
      method: "GET",
      headers: { Accept: "application/json", "User-Agent": "Sajda-Price-Check/1.0" },
      redirect: "error",
      signal: controller.signal,
    });
    const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (!response.ok) throw new RegistrarPriceSourceError("http_error", response.status);
    if (contentType !== "application/json") throw new RegistrarPriceSourceError("unexpected_content_type");
    const body = await readResponseTextLimited(response, PORKBUN_PRICE_RESPONSE_LIMIT_BYTES);
    let payload: unknown;
    try { payload = JSON.parse(body); } catch { throw new RegistrarPriceSourceError("invalid_response"); }
    return parsePorkbunPricePayload(payload, checkedAt);
  } catch (error) {
    if (controller.signal.aborted) throw new RegistrarPriceSourceError("timeout");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function getPorkbunPrices(): Promise<RegistrarPriceLookup> {
  const now = Date.now();
  const cached = porkbunPriceCache;
  if (cached && now >= cached.createdAt && now - cached.createdAt < cached.ttlMs) {
    return { checkedAt: cached.checkedAt, offers: cached.offers };
  }
  // A single all-TLD snapshot serves concurrent domains and requests. Never
  // reuse an expired price when the source is unavailable.
  if (!porkbunPriceFetch) {
    const checkedAt = new Date(now).toISOString();
    porkbunPriceFetch = fetchPorkbunPrices(checkedAt)
      .then((lookup) => {
        if (!lookup.offers.size) logRegistrarPriceFailure("porkbun", new RegistrarPriceSourceError("no_usable_prices"));
        porkbunPriceCache = { ...lookup, checkedAt, createdAt: now, ttlMs: PORKBUN_PRICE_CACHE_TTL_MS };
        return lookup;
      })
      .catch((error: unknown) => {
        logRegistrarPriceFailure("porkbun", error);
        const lookup = { checkedAt, offers: new Map<string, RegistrarOffer>() };
        porkbunPriceCache = { ...lookup, createdAt: Date.now(), ttlMs: PORKBUN_PRICE_FAILURE_CACHE_TTL_MS };
        return lookup;
      })
      .finally(() => { porkbunPriceFetch = undefined; });
  }
  return porkbunPriceFetch;
}

function tldesTimestamp(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 64 || !value.trim()) return undefined;
  return Number.isFinite(Date.parse(value)) ? value : undefined;
}

function isFreshTldesTimestamp(value: string | null | undefined, now = Date.now()): value is string {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    && timestamp >= now - TLDES_PRICE_MAX_AGE_MS
    && timestamp <= now;
}

function publishedPriceAmount(value: unknown): number | undefined {
  // TLDES and Porkbun prices are strings. Reject malformed, exponential, and
  // unbounded values instead of coercing data from an upstream response.
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/.test(normalized)) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1_000_000 ? parsed : undefined;
}

function tldesCurrency(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const currency = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : undefined;
}

function latestTimestamp(current: string | undefined, candidate: string | undefined): string | undefined {
  if (!candidate) return current;
  if (!current || Date.parse(candidate) > Date.parse(current)) return candidate;
  return current;
}

function localizedTldesPriceFeedNote(tld: string, locale: Locale): string {
  return localizedText(
    locale,
    `Published standard .${tld} registration and renewal prices from the TLDES hourly price feed. Taxes and fees may not be included; this is not an exact-domain checkout quote.`,
    `Publicerade standardpriser för registrering och förnyelse av .${tld} från TLDES timvisa prisflöde. Skatter och avgifter kan saknas; detta är inte en offert för den exakta domänen.`,
    `Precios estándar publicados de registro y renovación de .${tld} procedentes del feed horario de TLDES. Es posible que no incluyan impuestos ni tasas; no es una oferta de compra para el dominio exacto.`,
    `Prix standard publiés d’enregistrement et de renouvellement du .${tld} provenant du flux horaire TLDES. Les taxes et frais peuvent ne pas être inclus ; ce n’est pas une offre pour le domaine exact.`,
    `来自 TLDES 每小时价格源的 .${tld} 标准注册和续费价格。价格可能不含税费；这不是该精确域名的结算报价。`,
  );
}

function localizedTldesPriceFeedUnavailableNote(
  provider: ProviderCatalogEntry,
  tld: string,
  checkedAt: string | null,
  locale: Locale,
): string {
  const state = checkedAt
    ? localizedText(locale, "was checked", "kontrollerades", "se comprobó", "a été vérifié", "已检查")
    : localizedText(locale, "is configured but unavailable", "är konfigurerat men otillgängligt", "está configurado pero no está disponible", "est configuré mais indisponible", "已配置但当前不可用");
  return localizedText(
    locale,
    `The TLDES price feed ${state} but did not return a published standard .${tld} price for ${provider.registrar}. Open the provider to confirm the checkout price.`,
    `TLDES prisflöde ${state} men returnerade inget publicerat standardpris för .${tld} hos ${provider.registrar}. Öppna leverantören för att bekräfta slutpriset.`,
    `El feed de precios de TLDES ${state}, pero no devolvió un precio estándar publicado de .${tld} para ${provider.registrar}. Abre el proveedor para confirmar el precio final.`,
    `Le flux de prix TLDES ${state}, mais n’a pas renvoyé de prix standard publié pour le .${tld} chez ${provider.registrar}. Ouvrez le fournisseur pour confirmer le prix final.`,
    `TLDES 价格源${state}，但没有返回 ${provider.registrar} 的 .${tld} 已发布标准价格。请打开服务商确认结算价。`,
  );
}

function parseTldesPriceFeedPayload(payload: unknown): Omit<TldesPriceFeedLookup, "configured"> {
  const root = recordValue(payload);
  if (!root || !Array.isArray(root.registrars)) {
    throw new Error("Invalid aggregated price-feed schema.");
  }

  const responseUpdated = tldesTimestamp(root.updated);
  if (!isFreshTldesTimestamp(responseUpdated)) {
    // TLDES normally updates hourly. A stale or far-future payload must not
    // remain marked as a current verified price indefinitely.
    throw new Error("Aggregated price feed timestamp is not fresh.");
  }
  const offers = new Map<string, RegistrarOffer>();
  let newestRegistrarTimestamp: string | undefined;

  for (const entry of root.registrars) {
    const registrarEntry = recordValue(entry);
    if (!registrarEntry || typeof registrarEntry.name !== "string") continue;

    const providerId = TLDES_PROVIDER_BY_HOST.get(registrarEntry.name.trim().toLowerCase());
    const currency = tldesCurrency(registrarEntry.currency);
    const registrarTimestamp = tldesTimestamp(registrarEntry.ts);
    // When a registrar-specific timestamp is supplied it must be valid and
    // fresh itself; falling back to a newer response timestamp would falsely
    // make an older registrar quote look current.
    if (registrarEntry.ts !== undefined && !isFreshTldesTimestamp(registrarTimestamp)) continue;
    const checkedAt = registrarTimestamp ?? responseUpdated;
    const icannFee = publishedPriceAmount(registrarEntry.ICANNfee);
    if (!providerId || !currency || !isFreshTldesTimestamp(checkedAt) || !Array.isArray(registrarEntry.prices)) continue;

    newestRegistrarTimestamp = latestTimestamp(newestRegistrarTimestamp, checkedAt);
    const provider = PROVIDER_CATALOG[providerId];
    for (const tuple of registrarEntry.prices) {
      if (!Array.isArray(tuple) || tuple.length < 3) continue;
      const tld = typeof tuple[0] === "string" ? tuple[0].trim().toLowerCase() : "";
      const registrationPrice = publishedPriceAmount(tuple[1]);
      const renewalPrice = publishedPriceAmount(tuple[2]);
      if (!ALLOWED_TLDS.has(tld) || registrationPrice === undefined || renewalPrice === undefined) continue;

      offers.set(tldesOfferKey(providerId, tld), {
        providerId,
        registrar: provider.registrar,
        // The exact-name purchase URL is restored when the offer is attached
        // to a search result. The feed itself only has TLD-level prices.
        purchaseUrl: provider.purchaseUrl(""),
        priceSourceUrl: TLDES_PRICE_FEED_DOCS_URL,
        priceStatus: "verified",
        dataSource: "tldes_price_feed",
        connectorState: "aggregated_price_feed_configured",
        priceScope: "standard_tld",
        currency,
        registrationPrice,
        renewalPrice,
        ...(icannFee !== undefined ? { icannFee } : {}),
        taxTreatment: "unknown",
        priceType: "standard",
        checkedAt,
        priceVerified: true,
      });
    }
  }

  return { checkedAt: responseUpdated ?? newestRegistrarTimestamp ?? null, offers };
}

async function fetchTldesPriceFeed(apiKey: string): Promise<Omit<TldesPriceFeedLookup, "configured">> {
  const url = new URL(TLDES_PRICE_FEED_URL);
  url.searchParams.set("data", "prices");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("registrars", TLDES_PRICED_PROVIDER_IDS.map((providerId) => TLDES_REGISTRAR_HOSTS[providerId]).join(","));
  url.searchParams.set("tlds", [...ALLOWED_TLDS].join(","));

  const response = await fetchWithTimeout(url.toString(), {
    headers: { Accept: "application/json", "User-Agent": "Sajda-Price-Feed/1.0" },
    redirect: "error",
  }, TLDES_PRICE_FETCH_TIMEOUT_MS);
  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok || !contentType.toLowerCase().includes("application/json")) {
    throw new Error("Aggregated price feed did not return JSON.");
  }

  const text = await readResponseTextLimited(response, TLDES_PRICE_RESPONSE_LIMIT_BYTES);
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("Aggregated price feed returned invalid JSON.");
  }
  return parseTldesPriceFeedPayload(payload);
}

async function getTldesPriceFeed(): Promise<TldesPriceFeedLookup> {
  const apiKey = process.env.TLDES_API_KEY?.trim();
  if (!apiKey) return { configured: false, checkedAt: null, offers: new Map<string, RegistrarOffer>() };

  const cached = tldesPriceFeedCache;
  const now = Date.now();
  const cachedIsFresh = Boolean(cached && isFreshTldesTimestamp(cached.checkedAt, now));
  if (cached && cachedIsFresh && now - cached.createdAt < TLDES_PRICE_CACHE_TTL_MS) {
    return { configured: true, checkedAt: cached.checkedAt, offers: cached.offers };
  }
  if (now < tldesPriceFeedFailureUntil) {
    return cached && cachedIsFresh
      ? { configured: true, checkedAt: cached.checkedAt, offers: cached.offers }
      : { configured: true, checkedAt: null, offers: new Map<string, RegistrarOffer>() };
  }

  if (!tldesPriceFeedFetch) {
    tldesPriceFeedFetch = fetchTldesPriceFeed(apiKey)
      .then((lookup) => {
        tldesPriceFeedCache = { createdAt: Date.now(), ...lookup };
        tldesPriceFeedFailureUntil = 0;
        return { configured: true, ...lookup };
      })
      .catch(() => {
        tldesPriceFeedFailureUntil = Date.now() + TLDES_PRICE_FAILURE_CACHE_TTL_MS;
        return cached && cachedIsFresh
          ? { configured: true, checkedAt: cached.checkedAt, offers: cached.offers }
          : { configured: true, checkedAt: null, offers: new Map<string, RegistrarOffer>() };
      })
      .finally(() => {
        tldesPriceFeedFetch = undefined;
      });
  }
  return tldesPriceFeedFetch;
}

async function readResponseTextLimited(response: Response, maximumBytes: number): Promise<string> {
  const contentLength = response.headers.get("content-length");
  if (contentLength && Number(contentLength) > maximumBytes) {
    throw new Error("The provider price list exceeded the response-size limit.");
  }

  const reader = response.body?.getReader();
  if (!reader) return "";

  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        try {
          await reader.cancel();
        } catch {
          // The hard limit remains enforced even when the underlying stream
          // cannot be cancelled cleanly.
        }
        throw new Error("The provider price list exceeded the response-size limit.");
      }
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
  return text + decoder.decode();
}

async function getRegistrarOffers(tlds: readonly string[], locale: Locale): Promise<RegistrarPriceLookup> {
  const cached = registrarPriceCache;
  if (cached && Date.now() - cached.createdAt < REGISTRAR_PRICE_CACHE_TTL_MS) {
    return { checkedAt: cached.checkedAt, offers: localizedRegistrarOffers(cached.offers, locale) };
  }

  const offers = new Map<string, RegistrarOffer>();
  // Even a failed price-list request is a real check attempt. Returning this
  // timestamp lets the UI distinguish an unavailable Loopia quote from a
  // provider that was never queried at all.
  const checkedAt = new Date().toISOString();
  try {
    const response = await fetchWithTimeout(LOOPIA_PRICE_LIST_URL, {
      headers: { Accept: "text/html", "User-Agent": "Sajda-Price-Check/1.0" },
      redirect: "error",
    }, LOOPIA_PRICE_FETCH_TIMEOUT_MS);
    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok) throw new RegistrarPriceSourceError("http_error", response.status);
    if (!contentType.toLowerCase().includes("text/html")) throw new RegistrarPriceSourceError("unexpected_content_type");
    {
      const html = await readResponseTextLimited(response, LOOPIA_PRICE_RESPONSE_LIMIT_BYTES);
      // Populate every supported suffix at once. The serverless cache is
      // shared by requests, so caching only the first request's TLDs would
      // make a following .com/.nu query incorrectly look like its price was
      // unavailable for up to a minute.
      for (const tld of new Set([...ALLOWED_TLDS, ...tlds.map((value) => value.toLowerCase())])) {
        const offer = parseLoopiaOffer(html, tld, checkedAt);
        if (offer) offers.set(tld, offer);
      }
      if (!offers.size) logRegistrarPriceFailure("loopia", new RegistrarPriceSourceError("no_usable_prices"));
    }
  } catch (error) {
    logRegistrarPriceFailure("loopia", error);
    // Price failures are explicitly rendered as unavailable rather than a
    // stale/static quote. Availability verification remains independent.
  }

  registrarPriceCache = { createdAt: Date.now(), checkedAt, offers };
  return { checkedAt, offers: localizedRegistrarOffers(offers, locale) };
}

function unknown(domain: string, tld: string, source: string, errorCode: AvailabilityErrorCode): AvailabilityResult {
  return { domain, tld, status: "unknown", checkMethod: "none", source, authoritative: false, errorCode };
}

function localizedAvailabilityError(errorCode: AvailabilityErrorCode, locale: Locale): string {
  if (errorCode === "rdapRateLimited") {
    return localizedText(locale, "The RDAP service rate limit was reached.", "RDAP-kvot uppnådd", "Se alcanzó el límite de solicitudes del servicio RDAP.", "La limite de requêtes du service RDAP a été atteinte.", "已达到 RDAP 服务的请求限制。" );
  }
  if (errorCode.startsWith("rdapHttp:")) {
    const status = errorCode.slice("rdapHttp:".length);
    return localizedText(locale, `RDAP returned HTTP ${status}.`, `RDAP HTTP ${status}`, `RDAP devolvió HTTP ${status}.`, `RDAP a renvoyé HTTP ${status}.`, `RDAP 返回了 HTTP ${status}。`);
  }
  if (errorCode === "rdapFailed") {
    return localizedText(locale, "The RDAP check failed.", "RDAP-kontroll misslyckades", "La comprobación RDAP falló.", "La vérification RDAP a échoué.", "RDAP 检查失败。" );
  }
  if (errorCode === "rdapResponseUnsafe" || errorCode === "registryBudgetExceeded") {
    return localizedText(locale,
      "The registry did not provide a usable answer in time. Recheck this domain before deciding.",
      "Registret gav inget säkert svar i tid. Kontrollera domänen igen innan du bestämmer dig.",
      "El registro no dio una respuesta válida a tiempo. Vuelve a comprobar el dominio antes de decidir.",
      "Le registre n’a pas fourni de réponse exploitable à temps. Vérifiez à nouveau ce domaine avant de décider.",
      "注册局未及时提供可用的答复。请在决定前重新查询该域名。");
  }
  if (errorCode === "insecureTransportDisabled") {
    return localizedText(
      locale,
      "This registry's public lookup is not available over a secure connection, so Sajda cannot verify this result here.",
      "Registrets publika uppslag är inte tillgängligt över en säker anslutning, så Sajda kan inte verifiera resultatet här.",
      "La consulta pública de este registro no está disponible mediante una conexión segura, por lo que Sajda no puede verificar este resultado aquí.",
      "La recherche publique de ce registre n’est pas disponible via une connexion sécurisée ; Sajda ne peut donc pas vérifier ce résultat ici.",
      "该注册局的公开查询未通过安全连接提供，因此 Sajda 无法在此验证该结果。",
    );
  }
  if (errorCode.startsWith("dasHttp:")) {
    const status = errorCode.slice("dasHttp:".length);
    return localizedText(locale, `DAS returned HTTP ${status}.`, `DAS HTTP ${status}`, `DAS devolvió HTTP ${status}.`, `DAS a renvoyé HTTP ${status}.`, `DAS 返回了 HTTP ${status}。`);
  }
  if (errorCode === "dasResponseUnsafe") {
    return localizedText(locale, "The DAS response could not be safely interpreted.", "DAS-svaret kunde inte tolkas säkert", "La respuesta DAS no se pudo interpretar de forma segura.", "La réponse DAS n’a pas pu être interprétée en toute sécurité.", "无法安全解析 DAS 响应。" );
  }
  if (errorCode === "dasFailed") {
    return localizedText(locale, "The DAS check failed.", "DAS-kontroll misslyckades", "La comprobación DAS falló.", "La vérification DAS a échoué.", "DAS 检查失败。" );
  }
  return localizedText(
    locale,
    "This TLD is not supported by the public registry verifier.",
    "TLD stöds inte av den publika registry-verifieringen",
    "Este TLD no es compatible con el verificador público del registro.",
    "Ce TLD n’est pas pris en charge par le vérificateur de registre public.",
    "公共注册局验证器不支持此 TLD。",
  );
}

function localizeAvailability(result: AvailabilityResult, locale: Locale): Omit<AvailabilityResult, "errorCode"> {
  const { errorCode, ...publicResult } = result;
  return {
    ...publicResult,
    ...(errorCode ? { error: localizedAvailabilityError(errorCode, locale) } : {}),
  };
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = REGISTRY_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function isRdapTld(tld: string): tld is RdapTld {
  return Object.hasOwn(RDAP_REGISTRIES, tld);
}

async function checkRdap(domain: string, tld: RdapTld): Promise<AvailabilityResult> {
  const registry = RDAP_REGISTRIES[tld];
  if ((registryCooldowns.get(registry.endpoint) ?? 0) > Date.now()) return unknown(domain, tld, registry.source, "rdapRateLimited");
  try {
    const response = await fetch(
      `${registry.endpoint}domain/${encodeURIComponent(domain)}`,
      { headers: { Accept: "application/rdap+json, application/json" }, redirect: "error", signal: AbortSignal.timeout(REGISTRY_TIMEOUT_MS) },
    );
    if (response.status === 429) {
      registryCooldowns.set(registry.endpoint, registryRetryAt(response.headers.get("retry-after")));
      await response.body?.cancel();
      return unknown(domain, tld, registry.source, "rdapRateLimited");
    }
    if (response.status === 404 || response.status === 200) {
      const status = interpretRdapResponse(response.status, response.headers.get("content-type"), await readRegistryResponse(response), domain);
      return status === "unknown"
        ? unknown(domain, tld, registry.source, "rdapResponseUnsafe")
        : { domain, tld, status, checkMethod: "rdap", source: registry.source, authoritative: true };
    }
    return unknown(domain, tld, registry.source, response.status === 429 ? "rdapRateLimited" : `rdapHttp:${response.status}`);
  } catch {
    return unknown(domain, tld, registry.source, "rdapFailed");
  }
}

async function checkIisDas(domain: string, tld: "se" | "nu"): Promise<AvailabilityResult> {
  // Internetstiftelsen's public DAS endpoint is HTTP-only. Availability is a
  // purchase-critical claim, so the Vercel API deliberately fails closed
  // rather than marking a response from an unauthenticated transport as
  // registry-verified. Use an approved HTTPS registry/registrar connector to
  // enable .se/.nu verification in production.
  return unknown(domain, tld, "iis-free-das", "insecureTransportDisabled");
}

async function verifyAvailability(domain: string): Promise<AvailabilityResult> {
  const cached = availabilityCache.get(domain);
  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) return cached.result;

  const tld = domain.split(".").at(-1) ?? "";
  let result: AvailabilityResult;
  if (isRdapTld(tld)) result = await checkRdap(domain, tld);
  else if (tld === "se" || tld === "nu") result = await checkIisDas(domain, tld);
  else result = unknown(domain, tld, "vercel-unsupported-tld", "unsupportedTld");

  // Serverless instances may live longer than a single request. Keep this
  // convenience cache bounded even under a burst of creative searches.
  if (availabilityCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = availabilityCache.keys().next().value;
    if (oldest) availabilityCache.delete(oldest);
  }
  availabilityCache.set(domain, { createdAt: Date.now(), result });
  return result;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await mapper(items[index]!);
    }
  }));
  return results;
}

/**
 * Swipe returns cards only after an authoritative registry says they are
 * available. It works through a fixed candidate buffer and stops launching
 * new checks once the requested deck is full or the function's time budget is
 * reached. Taken and unknown candidates are intentionally not converted into
 * cards or fallback suggestions.
 */
async function verifySwipeCandidates(
  candidates: GeneratedCandidate[],
  targetCount: number,
  deadline: number,
): Promise<SwipeVerificationRun> {
  const available: SwipeVerificationRun["available"] = [];
  let checked = 0;
  let unknown = 0;
  let next = 0;

  await Promise.all(Array.from({ length: Math.min(SWIPE_REGISTRY_CONCURRENCY, candidates.length) }, async () => {
    while (Date.now() < deadline && available.length < targetCount) {
      const candidate = candidates[next];
      next += 1;
      if (!candidate) return;

      const availability = await verifyAvailability(candidate.domain);
      checked += 1;
      if (availability.status === "unknown") unknown += 1;

      if (availability.status === "available" && availability.authoritative) {
        // Do not discard already-in-flight answers just because a faster
        // registry filled the target first. No new checks start once it is
        // full, so this retains at most concurrency - 1 additional results.
        available.push({ candidate, availability });
      }
    }
  }));

  // Registry response speed is not a user preference. Restore generated
  // candidate order within each suffix, then deal round-robin across suffixes
  // that actually have verified available names. Never invent filler cards.
  const verified = new Map(available.map(entry => [entry.candidate.domain, entry]));
  const byTld = new Map<string, SwipeVerificationRun["available"]>();
  for (const candidate of candidates) {
    const entry = verified.get(candidate.domain);
    if (!entry) continue;
    const group = byTld.get(entry.availability.tld) ?? [];
    group.push(entry);
    byTld.set(entry.availability.tld, group);
  }
  const balanced: SwipeVerificationRun["available"] = [];
  while (balanced.length < targetCount && balanced.length < available.length) {
    for (const group of byTld.values()) {
      const entry = group.shift();
      if (entry) balanced.push(entry);
      if (balanced.length >= targetCount) break;
    }
  }
  return { checked, unknown, available: balanced };
}

/** Injection is module-local testing, never an HTTP-selectable provider. */
export function createDomainSearchHandler(generateNames = generateContextualNames) {
return async function handler(request: VercelRequestLike, response: VercelResponseLike): Promise<void> {
  const registryDeadline = Date.now() + SWIPE_REGISTRY_DEADLINE_MS;
  const trustedApiRequest = isTrustedApiRequest(request);
  const requestId = requestIdFor(request);

  // `/api/domain-search` is intentionally the anonymous product API. The
  // versioned public wrapper delegates here as well, so both routes share
  // one registry budget and one evidence model. Protected v1 requests do not
  // receive CORS headers and never become browser-callable by delegation.
  if (!trustedApiRequest) {
    setPublicApiHeaders(response, { requestId, allowMethods: "POST, OPTIONS" });
  } else {
    response.setHeader("X-Request-Id", requestId);
  }

  if (request.method === "OPTIONS" && !trustedApiRequest) {
    response.setHeader("Allow", "POST, OPTIONS");
    response.status(204).end();
    return;
  }

  if (request.method !== "POST") {
    response.setHeader("Allow", trustedApiRequest ? "POST" : "POST, OPTIONS");
    sendJson(response, 405, { error: "Only POST requests are supported." });
    return;
  }

  // The browser product already sends JSON. Refusing an ambiguous content
  // type makes the published API contract deterministic and avoids treating
  // a form or arbitrary text body as a JSON search request.
  if (!trustedApiRequest && !isJsonRequest(request)) {
    sendJson(response, 415, { error: "Content-Type must be application/json." });
    return;
  }
  if (!trustedApiRequest && headerValue(request, "authorization")) {
    // This anonymous route neither needs nor verifies credentials. Rejecting
    // them avoids silently accepting a bearer secret on a browser-safe API.
    sendJson(response, 400, {
      error: "This public endpoint does not accept Authorization. Use /api/v1/domains with a server-side Sajda API key.",
      code: "authorization_not_supported",
    });
    return;
  }

  let locale: Locale = "en";
  try {
    const body = await readJson(request);
    let aiConsent: AiConsent | undefined;
    try { aiConsent = parseAiConsent(body.aiConsent); } catch (error) {
      sendJson(response, 400, { code: "ai_consent_invalid", error: error instanceof Error ? error.message : "Invalid AI permission." });
      return;
    }
    locale = normalizeLocale(body.locale);
    const swipe = isSwipeSearch(body.swipe);
    const explicitTheme = typeof body.theme === "string" ? body.theme : "";
    if (explicitTheme.length > 6_000) {
      sendJson(response, 400, { code: "theme_too_long", error: localizedText(locale,
        "Keep your search description within 6,000 characters.",
        "Håll sökbeskrivningen inom 6 000 tecken.",
        "Limita la descripción de búsqueda a 6.000 caracteres.",
        "Limitez la description de recherche à 6 000 caractères.",
        "搜索描述请勿超过 6,000 个字符。") });
      return;
    }
    const parsedExactDomains = swipe ? {} : parseExactDomainRequest(explicitTheme, body.domains, locale);
    if (parsedExactDomains.error) {
      sendJson(response, 400, { error: parsedExactDomains.error });
      return;
    }
    const exactDomains = parsedExactDomains.domains ?? [];
    const isExactDomainSearch = exactDomains.length > 0;
    const refinement = parseSearchRefinement(body.refinement);
    if (refinement && (swipe || isExactDomainSearch)) {
      sendJson(response, 400, { code: "refinement_not_supported", error: "Refinement is only available for creative name searches." });
      return;
    }
    if (!swipe && !isExactDomainSearch && explicitTheme.trim() && themeWords(explicitTheme).length === 0) {
      sendJson(response, 400, { code: "unsupported_reference", error: localizedText(locale,
        "Enter a descriptive reference word using Latin letters, for example ocean or coffee.",
        "Skriv ett beskrivande referensord med latinska bokstäver, till exempel hav eller kaffe.",
        "Escribe una palabra descriptiva con letras latinas, por ejemplo ocean o cafe.",
        "Saisissez un mot descriptif en lettres latines, par exemple ocean ou cafe.",
        "请输入使用拉丁字母的描述词，例如 ocean 或 coffee。") });
      return;
    }
    const quota = swipe ? takeSwipeQuota(request) : takeQuota(request);
    if (!trustedApiRequest) {
      setPublicApiHeaders(response, {
        requestId,
        allowMethods: "POST, OPTIONS",
        rateLimit: {
          limit: swipe ? SWIPE_REQUESTS_PER_MINUTE : REQUESTS_PER_MINUTE,
          remaining: quota.remaining,
          resetAt: quota.resetAt,
        },
      });
    }
    if (!quota.allowed) {
      response.setHeader("Retry-After", String(Math.max(1, Math.ceil((quota.resetAt - Date.now()) / 1_000))));
      sendJson(response, 429, {
        error: swipe
          ? localizedText(locale, "Too many Swipe decks. Please wait one minute.", "För många Swajp-kortlekar. Vänta en minut.", "Demasiados mazos de Swipe. Espera un minuto.", "Trop de jeux Swipe. Veuillez attendre une minute.", "Swipe 卡组过多。请等待一分钟。")
          : localizedText(locale, "Too many searches. Please wait one minute.", "För många sökningar. Vänta en minut.", "Demasiadas búsquedas. Espera un minuto.", "Trop de recherches. Veuillez attendre une minute.", "搜索次数过多。请等待一分钟。"),
      });
      return;
    }

    const tlds = normalizeTlds(body.tlds);
    if (tlds.length === 0 && !isExactDomainSearch) {
      sendJson(response, 400, {
        error: localizedText(locale, "Select at least one supported TLD.", "Välj minst en stödd TLD", "Selecciona al menos un TLD compatible.", "Sélectionnez au moins un TLD pris en charge.", "请选择至少一个受支持的 TLD。"),
      });
      return;
    }
    const parsedProviders = normalizeProviderIds(body.providers, locale);
    if (parsedProviders.error || !parsedProviders.providerIds) {
      sendJson(response, 400, {
        error: parsedProviders.error ?? localizedText(locale, "Select at least one provider.", "Välj minst en leverantör.", "Selecciona al menos un proveedor.", "Sélectionnez au moins un fournisseur.", "请选择至少一个服务商。"),
      });
      return;
    }
    const providerIds = parsedProviders.providerIds;

    const requestedCount = isExactDomainSearch
      ? exactDomains.length
      : swipe
      ? normalizeSwipeCount(body.count)
      : normalizeCount(body.count);
    const parsedSwipeRange = swipe ? parseSwipeLengthRange(body, locale) : undefined;
    if (parsedSwipeRange?.error) {
      sendJson(response, 400, { error: parsedSwipeRange.error });
      return;
    }

    // Swipe deliberately bypasses advanced brief analysis. It is a fresh,
    // random name deck and must not invoke an optional external AI analyser.
    const advanced = !swipe && isAdvancedSearch(body.advanced);
    const parsedCreativeMode = parseCreativeSearchMode(body.creativeMode, locale);
    if (parsedCreativeMode.error) {
      sendJson(response, 400, { error: parsedCreativeMode.error });
      return;
    }
    // A basic style is intentionally limited to basic creative generation.
    // Exact checks, Swipe, and Advanced keep their more explicit semantics.
    const creativeMode = !swipe && !isExactDomainSearch && !advanced
      ? parsedCreativeMode.mode
      : undefined;
    let criteria: AdvancedSearchCriteria | undefined;
    if (Object.hasOwn(body, "criteria")) {
      if (!advanced) {
        sendJson(response, 400, {
          error: localizedText(
            locale,
            "criteria can only be used with advanced search.",
            "criteria kan bara användas med avancerad sökning.",
            "criteria solo se puede usar con la búsqueda avanzada.",
            "criteria ne peut être utilisé qu’avec la recherche avancée.",
            "criteria 只能用于高级搜索。",
          ),
        });
        return;
      }
      const parsedCriteria = parseAdvancedCriteria(body.criteria, locale);
      if (parsedCriteria.error || !parsedCriteria.criteria) {
        sendJson(response, 400, { error: parsedCriteria.error ?? localizedText(locale, "Invalid criteria.", "Ogiltiga kriterier.", "Criterios no válidos.", "Critères non valides.", "条件无效。") });
        return;
      }
      criteria = parsedCriteria.criteria;
    }
    let briefAnalysis: BriefAnalysis | undefined;
    let brief = "";
    let candidateTheme: unknown = explicitTheme;
    if (advanced) {
      const parsedBrief = advancedBrief(body, locale);
      if (parsedBrief.error) {
        sendJson(response, 400, { error: parsedBrief.error });
        return;
      }
      brief = parsedBrief.brief ?? "";
      // Extract fallback anchors locally. Candidate generation below is the
      // only optional AI call; never spend a second allowance to analyze a brief.
      briefAnalysis = localBriefAnalysis(brief, locale);
      // The short reference entered beside an advanced brief is the user's
      // primary naming anchor. AI/local brief analysis can add semantic
      // directions, but never replaces that explicit reference.
      candidateTheme = generationThemeFromBriefAnalysis(
        briefAnalysis,
        brief,
        locale,
        themeWords(explicitTheme),
      );
    }
    // A transparent reserve makes a 50-name creative request useful in the UI
    // after already-registered domains are removed. Swipe uses its own fixed,
    // bounded buffer so it can aim for one hundred verified cards without an
    // unbounded registry scan.
    const verificationCount = swipe
      ? Math.min(MAX_SWIPE_VERIFICATIONS, requestedCount + SWIPE_VERIFICATION_BUFFER)
      : requestedCount >= 40
      ? Math.min(MAX_CANDIDATES, requestedCount + AVAILABILITY_BUFFER)
      : requestedCount;
    const namingInput: NamingInput = { theme: explicitTheme, brief, locale, refinement,
      constraints: criteria ?? { minLength: 3, maxLength: 22, nameLanguage: "auto",
        nameStyle: creativeMode ? creativeModeNameStyle(creativeMode) : "balanced", includeWords: [], excludeWords: [] },
      requiredReferences: advanced ? themeWords(explicitTheme) : undefined };
    const hasNamingContext = Boolean(explicitTheme.trim() || brief.trim());
    let capacityFallback: "ai_daily_limit" | "ai_busy" | undefined;
    const contextualNames = !swipe && !isExactDomainSearch && aiConsent && hasNamingContext
      ? await generateNames(namingInput, request, aiConsent, reason => {
        if (reason === "daily_limit") capacityFallback = "ai_daily_limit";
        else if (reason === "concurrency_limit") capacityFallback = "ai_busy";
      }) : undefined;
    const generation: NamingGeneration | undefined = !swipe && !isExactDomainSearch ? {
      source: contextualNames ? "ai" : "rules", refinementApplied: Boolean(refinement),
      ...(!contextualNames ? { fallbackReason: !hasNamingContext ? "no_context" as const : !aiConsent ? "ai_off" as const : capacityFallback ?? "ai_unavailable" as const } : {}),
    } : undefined;
    const candidates = swipe
      ? generateSwipeCandidates(tlds, verificationCount, parsedSwipeRange!.range!)
      : isExactDomainSearch
        ? exactDomains.map((domain) => ({ domain, namingPattern: "exactDomain" as const }))
        : contextualNames
          ? contextualNames.slice(0, verificationCount).map((name, index) => ({
            domain: `${name.label}.${tlds[index % tlds.length]}`, namingPattern: "contextual" as const,
          }))
        : refineRuleCandidates(generateCandidates(
          tlds,
          verificationCount,
          candidateTheme,
          locale,
          criteria,
          advanced ? explicitTheme : undefined,
          creativeMode,
          refinement,
        ), namingInput).slice(0, verificationCount);
    const candidateTlds = isExactDomainSearch
      ? [...new Set(exactDomains.map((domain) => domain.split(".").at(-1)!))]
      : tlds;
    // Selected public sources run alongside registry checks. Porkbun provides
    // published USD TLD prices without credentials; TLDES remains an optional
    // configured fallback for other providers or missing Porkbun suffixes.
    const registrarOffersPromise = providerIds.includes("loopia")
      ? getRegistrarOffers(candidateTlds, locale)
      : Promise.resolve<RegistrarPriceLookup>({ checkedAt: null, offers: new Map<string, RegistrarOffer>() });
    const tldesPriceFeedPromise = providerIds.some((providerId) => providerId !== "loopia")
      ? getTldesPriceFeed()
      : Promise.resolve<TldesPriceFeedLookup>({ configured: false, checkedAt: null, offers: new Map<string, RegistrarOffer>() });
    const porkbunPricesPromise = providerIds.includes("porkbun")
      ? getPorkbunPrices()
      : Promise.resolve<RegistrarPriceLookup>({ checkedAt: null, offers: new Map<string, RegistrarOffer>() });

    if (swipe) {
      const swipeRun = await verifySwipeCandidates(candidates, requestedCount, registryDeadline);
      const [loopiaPriceLookup, tldesPriceFeedLookup, porkbunPriceLookup] = await Promise.all([registrarOffersPromise, tldesPriceFeedPromise, porkbunPricesPromise]);
      const results: SearchResult[] = swipeRun.available.map(({ candidate, availability }, index) => {
        const registrarOffers = registrarOffersForDomain(
          candidate.domain,
          availability.tld,
          providerIds,
          loopiaPriceLookup,
          tldesPriceFeedLookup,
          porkbunPriceLookup,
          locale,
        );
        return {
          ...localizeAvailability(availability, locale),
          ...screening(candidate.domain, candidate.namingPattern, locale),
          rankingPosition: index + 1,
          registrarOffer: registrarOffers[0]!,
          registrarOffers,
        };
      });

      sendJson(response, 200, {
        engine: "vercel-public-registry-search",
        locale,
        checkedAt: new Date().toISOString(),
        providers: selectedProviderMetadata(providerIds, locale),
        requested: requestedCount,
        checked: swipeRun.checked,
        available: results.length,
        unknown: swipeRun.unknown,
        swipe: true,
        ...(criteria ? { criteria } : {}),
        results,
      });
      return;
    }

    let attemptedChecks = 0;
    const screenedResults = await mapWithConcurrency(candidates, REGISTRY_CONCURRENCY, async (candidate) => {
      const withinBudget = Date.now() < registryDeadline;
      if (withinBudget) attemptedChecks += 1;
      const availability = withinBudget
        ? await verifyAvailability(candidate.domain)
        : unknown(candidate.domain, candidate.domain.split(".").at(-1) ?? "", "registry-budget", "registryBudgetExceeded");
      return {
        ...localizeAvailability(availability, locale),
        ...screening(candidate.domain, candidate.namingPattern, locale),
      };
    });
    const [loopiaPriceLookup, tldesPriceFeedLookup, porkbunPriceLookup] = await Promise.all([registrarOffersPromise, tldesPriceFeedPromise, porkbunPricesPromise]);
    const results: SearchResult[] = screenedResults.map((result, index) => {
      const registrarOffers = registrarOffersForDomain(
        result.domain,
        result.tld,
        providerIds,
        loopiaPriceLookup,
        tldesPriceFeedLookup,
        porkbunPriceLookup,
        locale,
      );
      return {
        ...result,
        rankingPosition: index + 1,
        registrarOffer: registrarOffers[0]!,
        registrarOffers,
      };
    });

    sendJson(response, 200, {
      engine: "vercel-public-registry-search",
      locale,
      checkedAt: new Date().toISOString(),
      providers: selectedProviderMetadata(providerIds, locale),
      requested: requestedCount,
      checked: attemptedChecks,
      available: results.filter((result) => result.status === "available").length,
      unknown: results.filter((result) => result.status === "unknown").length,
      ...(briefAnalysis ? { briefAnalysis } : {}),
      ...(criteria ? { criteria } : {}),
      ...(creativeMode ? { creativeMode } : {}),
      ...(generation ? { generation } : {}),
      results,
    });
  } catch (error) {
    const status = error instanceof Error && /body is too large/iu.test(error.message) ? 413 : 400;
    sendJson(response, status, {
        error: error instanceof Error
        ? error.message
        : localizedText(locale, "The search could not be completed.", "Sökningen misslyckades", "No se pudo completar la búsqueda.", "La recherche n’a pas pu être terminée.", "无法完成搜索。"),
    });
  }
}
}

export default createDomainSearchHandler();
