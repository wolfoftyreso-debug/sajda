import { createServer } from "node:http";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { connect } from "node:net";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openApiDocument } from "../../api/_shared/openapi-document.mjs";
import { getFactSignalFeed } from "../../api/_shared/fact-signals.mjs";
import { asciiNameToken, joinNameWords, nameQualitySignals, interpretRdapResponse, readRegistryResponse, registryRetryAt } from "../../api/_shared/search-quality.mjs";

const HOST = process.env.NAME_QUEST_WEB_BIND_ADDRESS ?? "127.0.0.1";
const PORT = Number(process.env.NAME_QUEST_WEB_PORT ?? 8080);
const DIST_DIR = resolve(fileURLToPath(new URL("../../dist/", import.meta.url)));
const INDEX_FILE = resolve(DIST_DIR, "index.html");

// Only routes that exist in the client application may fall back to the SPA
// shell. This keeps a misspelled URL from looking like a valid 200 page to a
// crawler (or to a human) while preserving direct navigation to the product.
// SEO entry pages are emitted as static clean-URL HTML files and are served
// before this allowlist is evaluated.
const SPA_ROUTE_PATHS = new Set([
  "/",
  "/auth",
  "/contact",
  "/story",
  "/how-it-works",
  "/developers",
  "/legal",
  "/security",
  "/status",
  "/marketplace",
  "/swipe",
  "/watchlist",
  "/my-domains",
  "/history",
  "/account",
  "/install",
  "/top-10-today",
  "/admin",
]);

const LOCAL_NOINDEX_SPA_PATHS = new Set([
  "/",
  "/auth",
  "/contact",
  "/story",
  "/how-it-works",
  "/developers",
  "/legal",
  "/security",
  "/status",
  "/marketplace",
  "/swipe",
  "/watchlist",
  "/my-domains",
  "/history",
  "/account",
  "/install",
  "/top-10-today",
  "/admin",
]);

const MAX_VERIFY_BODY_BYTES = 8_192;
const MAX_VERIFY_DOMAINS = 80;
const VERIFY_REQUESTS_PER_MINUTE = 4;
const VERIFY_CACHE_TTL_MS = 60_000;
const WHOIS_TIMEOUT_MS = 5_000;
const WHOIS_RESPONSE_LIMIT_BYTES = 64 * 1024;
// These URLs are taken from IANA's DNS RDAP bootstrap publication dated
// 2026-07-23. Keep the list explicit and HTTPS-only so a local search does
// not discover or follow an unreviewed endpoint at request time.
const RDAP_REGISTRIES = {
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
const VERIFY_TLDS = new Set(["com", "net", "org", "app", "dev", "ai", "xyz", "info", "biz", "se", "io", "nu"]);
const LOCAL_SEARCH_TLDS = new Set(["com", "net", "org", "app", "dev", "ai", "xyz", "info", "biz", "se", "io", "nu"]);
// The published v1 contracts deliberately have a narrower, audited TLD set
// than the local product search. Keep this explicit so a local developer test
// cannot claim support that Vercel's public API does not offer.
const LOCAL_API_TLDS = new Set(["com", "net", "org", "app", "dev", "ai", "xyz", "info", "biz", "se", "nu"]);
// The fixed candidate budget bounds registry work, even when the customer
// wants to compare every supported ending in one search.
const LOCAL_SEARCH_MAX_TLDS = LOCAL_SEARCH_TLDS.size;
const LOCAL_SEARCH_REQUESTS_PER_MINUTE = 4;
// The authenticated local v1 API intentionally shares the same conservative
// throughput as the production bootstrap route. It is keyed by a server
// validated client id, never a user-controlled HTTP header or browser value.
const LOCAL_API_REQUESTS_PER_MINUTE = 4;
const LOCAL_PUBLIC_API_REQUESTS_PER_MINUTE = 6;
const LOCAL_API_MAX_BODY_BYTES = 6_144;
const LOCAL_API_MAX_QUERY_CHARS = 100;
const LOCAL_API_MAX_EXACT_DOMAINS = 10;
const LOCAL_API_MAX_COUNT = 10;
const LOCAL_API_KEY_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{2,63}$/u;
const LOCAL_API_KEY_HASH_PATTERN = /^[a-f0-9]{64}$/u;
const LOCAL_API_KEY_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,256}$/u;
const LOCAL_SELF_SERVICE_KEY_PATTERN = /^sj_test_([A-Za-z0-9_-]{16})_([A-Za-z0-9_-]{43})$/u;
const LOCAL_DEVELOPER_KEY_MAX_ACTIVE = 10;
const LOCAL_DEVELOPER_KEY_CREATE_LIMIT = 5;
const LOCAL_DEVELOPER_KEY_CREATE_WINDOW_MS = 60 * 60_000;
const LOCAL_DEVELOPER_KEY_NAME_MAX_CHARS = 80;
const LOCAL_API_ALLOWED_BODY_KEYS = new Set(["query", "domains", "tlds", "count", "locale", "providers", "creativeMode"]);
// A 100-card Swipe deck may verify substantially more names than an ordinary
// creative search, so it has a distinct but deliberately conservative quota.
// Regular search remains at four requests per minute.
const LOCAL_SWIPE_REQUESTS_PER_MINUTE = 2;
// Deep Review only ranks a result set that was already registry-verified by
// this local service. This legacy server is deterministic-only. AI Gateway
// runs exclusively through the supported Vercel API with its shared limits;
// use npm run serve:qa to exercise that production API locally.
const LOCAL_DEEP_REVIEW_REQUESTS_PER_MINUTE = 3;
const LOCAL_DEEP_REVIEW_MAX_CANDIDATES = 50;
const LOCAL_SEARCH_MAX_CANDIDATES = 80;
const LOCAL_SEARCH_AVAILABILITY_BUFFER = 30;
// Exact checks bypass generation but remain deliberately bounded before they
// reach the registry verifier.
const LOCAL_MAX_EXACT_DOMAINS = 12;
const MAX_ADVANCED_BRIEF_WORDS = 250;
const MAX_ADVANCED_BRIEF_CHARS = 6_000;
const MIN_ADVANCED_NAME_LENGTH = 3;
const MAX_ADVANCED_NAME_LENGTH = 20;
const MAX_ADVANCED_CRITERIA_WORDS = 8;
const NAME_LANGUAGES = new Set(["auto", "en", "sv", "mixed"]);
const NAME_STYLES = new Set(["balanced", "brandable", "descriptive", "invented"]);
const LOCAL_CREATIVE_SEARCH_MODES = new Set(["light", "medium", "heavy", "deep"]);
const LOCAL_DEFAULT_SWIPE_RESULTS = 100;
const LOCAL_MAX_SWIPE_RESULTS = 100;
const LOCAL_SWIPE_VERIFICATION_BUFFER = 80;
const LOCAL_MAX_SWIPE_VERIFICATIONS = LOCAL_MAX_SWIPE_RESULTS + LOCAL_SWIPE_VERIFICATION_BUFFER;
// Swipe is isolated from normal search's lower concurrency. Eight workers
// keep a 100-card deck responsive while the fixed deadline and per-registry
// timeouts prevent a stalled source from turning into an unbounded scan.
const LOCAL_SWIPE_REGISTRY_CONCURRENCY = 8;
const LOCAL_SWIPE_REGISTRY_DEADLINE_MS = 25_000;
const LOCAL_MIN_SWIPE_LABEL_LENGTH = 3;
const LOCAL_MAX_SWIPE_LABEL_LENGTH = 9;
// Registrar prices are fetched from Loopia's public price list. They are
// intentionally kept separate from registry availability: an available name
// has no existing registrar, while Loopia is the purchase provider offered to
// the user. Never substitute a screening value for this live provider price.
const REGISTRAR_PRICE_CACHE_TTL_MS = 60_000;
const LOOPIA_PRICE_FETCH_TIMEOUT_MS = 7_500;
const LOOPIA_PRICE_RESPONSE_LIMIT_BYTES = 1_000_000;
// TLDES refreshes hourly. One server-side snapshot prevents every local
// search from triggering a fresh comparison-feed request or exposing its key.
const TLDES_PRICE_CACHE_TTL_MS = 55 * 60_000;
const TLDES_PRICE_FAILURE_CACHE_TTL_MS = 60_000;
const TLDES_PRICE_FETCH_TIMEOUT_MS = 7_500;
const TLDES_PRICE_RESPONSE_LIMIT_BYTES = 1_000_000;
const TLDES_PRICE_MAX_AGE_MS = 2 * 60 * 60_000;
const LOOPIA_PRICE_LIST_URL = "https://www.loopia.se/domannamn/detaljerad_prislista/";
const LOOPIA_PURCHASE_URL = "https://www.loopia.se/domannamn/";
const TLDES_PRICE_FEED_URL = "https://tldes.com/v1";
const TLDES_PRICE_FEED_DOCS_URL = "https://tldes.com/docs/api-reference.html";
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
];
// Wholesale providers are adapter targets only. They are deliberately absent
// from PROVIDER_IDS so anonymous clients cannot select them as public checkout
// choices without a separate buyer-facing agreement and experience.
const BACKEND_ONLY_PROVIDER_IDS = ["openprovider", "resellerclub"];
const PROVIDER_ID_SET = new Set(PROVIDER_IDS);
const PROVIDER_CATALOG = {
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

// TLDES uses registrar host names rather than the stable IDs used by our UI.
// These entries are from its public registrar catalogue. Keeping the mapping
// explicit prevents a provider page from accidentally becoming a scraper.
const TLDES_REGISTRAR_HOSTS = {
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
const TLDES_PRICED_PROVIDER_IDS = PROVIDER_IDS.filter((providerId) => providerId !== "loopia");
const TLDES_PROVIDER_BY_HOST = new Map(
  TLDES_PRICED_PROVIDER_IDS.map((providerId) => [TLDES_REGISTRAR_HOSTS[providerId], providerId]),
);

// Reserved, server-only official-price connection contracts. Supplying these
// variables never enables a price by itself: a reviewed adapter must validate
// a documented provider API response before marking a price as verified. None
// of these values are exposed to the browser or used as fetch URLs here.
const OFFICIAL_PROVIDER_PRICE_API_ENV = {
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

function assertOfficialProviderPriceApiContracts() {
  const environmentNames = new Set();
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

const SUPPORTED_LOCALES = new Set(["en", "sv", "es", "fr", "zh"]);
const LOCAL_NAMING_PATTERNS = {
  en: {
    exactDomain: "exact domain check",
    signature: "theme-specific name idea",
    keyword: "your keyword",
    swedishCompound: "Swedish compound word",
    englishCompound: "English compound word",
    brandBlend: "short brand-style wordplay",
    themePair: "thematic word pair",
    themeSwedishCompound: "thematic Swedish compound",
    themeEnglishCompound: "thematic English compound",
    reverseWordplay: "reversed wordplay",
    softBlend: "gentle language blend",
    shortVariant: "short creative variant",
    evocativePair: "evocative word pair",
    creativePair: "creative word pair",
    brandWord: "short brand word",
    playfulCompound: "playful compound",
    swipeRandom: "fresh Swipe name",
  },
  sv: {
    exactDomain: "exakt domänkontroll",
    signature: "temaspecifik namnidé",
    keyword: "ditt nyckelord",
    swedishCompound: "svenskt sammansatt ord",
    englishCompound: "engelskt sammansatt ord",
    brandBlend: "kort ordlek med varumärkeskänsla",
    themePair: "tematiskt ordpar",
    themeSwedishCompound: "tematiskt svenskt sammansatt ord",
    themeEnglishCompound: "tematiskt engelskt sammansatt ord",
    reverseWordplay: "omvänd ordlek",
    softBlend: "mjuk språkblandning",
    shortVariant: "kort kreativ variant",
    evocativePair: "nordiskt bildspråk",
    creativePair: "kreativt ordpar",
    brandWord: "kort varumärkesord",
    playfulCompound: "lekfull sammansättning",
    swipeRandom: "nytt Swajpnamn",
  },
  es: {
    exactDomain: "comprobación exacta de dominio",
    signature: "idea de nombre específica del tema",
    keyword: "tu palabra clave",
    swedishCompound: "palabra compuesta sueca",
    englishCompound: "palabra compuesta inglesa",
    brandBlend: "juego de palabras corto de estilo de marca",
    themePair: "par de palabras temático",
    themeSwedishCompound: "compuesto sueco temático",
    themeEnglishCompound: "compuesto inglés temático",
    reverseWordplay: "juego de palabras inverso",
    softBlend: "combinación suave de palabras",
    shortVariant: "variante creativa corta",
    evocativePair: "par de palabras evocador",
    creativePair: "par de palabras creativo",
    brandWord: "palabra de marca corta",
    playfulCompound: "compuesto lúdico",
    swipeRandom: "nombre nuevo de Swipe",
  },
  fr: {
    exactDomain: "vérification exacte du domaine",
    signature: "idée de nom spécifique au thème",
    keyword: "votre mot-clé",
    swedishCompound: "mot composé suédois",
    englishCompound: "mot composé anglais",
    brandBlend: "jeu de mots court de style marque",
    themePair: "paire de mots thématique",
    themeSwedishCompound: "composé suédois thématique",
    themeEnglishCompound: "composé anglais thématique",
    reverseWordplay: "jeu de mots inversé",
    softBlend: "mélange de mots doux",
    shortVariant: "courte variante créative",
    evocativePair: "paire de mots évocatrice",
    creativePair: "paire de mots créative",
    brandWord: "mot de marque court",
    playfulCompound: "composé ludique",
    swipeRandom: "nouveau nom Swipe",
  },
  zh: {
    exactDomain: "精确域名查询",
    signature: "主题专属名称思路",
    keyword: "你的关键词",
    swedishCompound: "瑞典复合词",
    englishCompound: "英语复合词",
    brandBlend: "简短的品牌式文字组合",
    themePair: "主题词对",
    themeSwedishCompound: "主题瑞典复合词",
    themeEnglishCompound: "主题英语复合词",
    reverseWordplay: "反向文字游戏",
    softBlend: "柔和词语组合",
    shortVariant: "简短创意变体",
    evocativePair: "意象词对",
    creativePair: "创意词对",
    brandWord: "简短品牌词",
    playfulCompound: "趣味复合词",
    swipeRandom: "新的 Swipe 名称",
  },
};

function resolveLocale(value) {
  return typeof value === "string" && SUPPORTED_LOCALES.has(value) ? value : "en";
}

function parseLocalCreativeSearchMode(value, locale) {
  // Omitted by older callers preserves the historical balanced generator.
  // The browser client sends its selected card explicitly.
  if (value === undefined) return {};
  if (typeof value === "string" && LOCAL_CREATIVE_SEARCH_MODES.has(value)) return { mode: value };
  return {
    error: localText(
      locale,
      "creativeMode must be light, medium, heavy, or deep.",
      "creativeMode måste vara light, medium, heavy eller deep.",
      "creativeMode debe ser light, medium, heavy o deep.",
      "creativeMode doit être light, medium, heavy ou deep.",
      "creativeMode 必须是 light、medium、heavy 或 deep。",
    ),
  };
}

function localCreativeModeNameStyle(mode) {
  // Direct is literal/theme-led, Playful favours compact brand blends, Broad
  // retains a balanced mix, and Name studio favours coined/pronounceable ideas.
  if (mode === "light") return "descriptive";
  if (mode === "medium") return "brandable";
  if (mode === "deep") return "invented";
  return "balanced";
}

function localText(locale, english, swedish, spanish, french, chinese) {
  if (locale === "sv") return swedish;
  if (locale === "es") return spanish;
  if (locale === "fr") return french;
  if (locale === "zh") return chinese;
  return english;
}

function localPattern(locale, key) {
  return LOCAL_NAMING_PATTERNS[locale][key] ?? LOCAL_NAMING_PATTERNS.en[key] ?? key;
}

function localScreeningRationale(locale, namingPattern, label, tld, score) {
  return localText(
    locale,
    `Name idea: ${namingPattern}. Local screening: ${label.length} characters, .${tld}, ${score}/100 name signal. This is not a market valuation or purchase recommendation.`,
    `Namnidé: ${namingPattern}. Lokal screening: ${label.length} tecken, .${tld}, ${score}/100 namnsignal. Detta är inte ett marknadsvärde eller en köprekommendation.`,
    `Idea de nombre: ${namingPattern}. Evaluación local: ${label.length} caracteres, .${tld}, señal de nombre ${score}/100. Esto no es una valoración de mercado ni una recomendación de compra.`,
    `Idée de nom : ${namingPattern}. Analyse locale : ${label.length} caractères, .${tld}, signal de nom ${score}/100. Il ne s’agit pas d’une valeur de marché ni d’une recommandation d’achat.`,
    `名称思路：${namingPattern}。本地筛选：${label.length} 个字符，.${tld}，名称信号 ${score}/100。这不是市场估值或购买建议。`,
  );
}

function registrarPriceNote(locale, tld, priceType) {
  if (locale === "sv") {
    if (priceType === "campaign") return "Kampanjpris för första året.";
    if (priceType === "standard") return "Standardpris för första året.";
    return `Inget verifierat Loopia-pris för .${tld} finns från den senaste prislistkontrollen.`;
  }
  if (locale === "es") {
    if (priceType === "campaign") return "Precio promocional del primer año.";
    if (priceType === "standard") return "Precio estándar del primer año.";
    return `No hay un precio verificado de Loopia para .${tld} en la última comprobación de la lista de precios.`;
  }
  if (locale === "fr") {
    if (priceType === "campaign") return "Prix promotionnel de la première année.";
    if (priceType === "standard") return "Prix standard de la première année.";
    return `Aucun prix Loopia vérifié pour .${tld} n’est disponible dans le dernier contrôle de la liste de prix.`;
  }
  if (locale === "zh") {
    if (priceType === "campaign") return "首年促销价。";
    if (priceType === "standard") return "首年标准价。";
    return `最新价目表检查中没有 .${tld} 的已验证 Loopia 价格。`;
  }
  if (priceType === "campaign") return "First-year promotional price.";
  if (priceType === "standard") return "Standard first-year price.";
  return `No verified Loopia price is available for .${tld} from the latest price-list check.`;
}

// The local generator deliberately starts with meaningful Swedish and English
// word parts, rather than random syllables. That makes an offline/loopback
// search useful as a real naming session too, while the registry checks below
// remain the only source of availability truth.
const LOCAL_NORDIC_WORDS = [
  "bo", "bro", "form", "fram", "glimt", "grund", "hem", "hojd", "hus", "klok", "kraft", "ljus",
  "lyft", "mark", "nav", "nord", "plan", "rum", "saga", "skog", "sol", "spar", "spira", "steg",
  "stig", "tak", "torg", "trygg", "val", "varde", "verk", "vag", "yta",
];
const LOCAL_GLOBAL_WORDS = [
  "bloom", "bridge", "bright", "canvas", "circle", "craft", "field", "flow", "forge", "glow", "grove",
  "harbor", "kind", "lane", "luma", "nest", "nook", "orbit", "pilot", "ripple", "root", "spark",
  "terra", "thread", "tide", "vista", "weave", "wise", "yard",
];
const LOCAL_BRAND_TAILS = ["ara", "era", "io", "iva", "ly", "ora", "ory", "ova", "sy", "via"];
const LOCAL_REFERENCE_SUFFIXES = [
  "base", "bridge", "care", "cloud", "core", "craft", "desk", "flow", "forge", "frame",
  "guide", "hub", "labs", "lane", "link", "logic", "nest", "nova", "path", "pilot",
  "scope", "spark", "space", "studio", "system", "verse", "vista", "works", "world",
];
const LOCAL_REFERENCE_PREFIXES = ["get", "go", "my", "neo", "next", "nova", "prime", "true", "up", "we"];
const LOCAL_SWEDISH_TAILS = [
  "blick", "bro", "bygg", "form", "glimt", "guiden", "huset", "kollen", "laget", "lyftet", "navet",
  "planen", "rummet", "sparet", "steget", "verket", "vagen", "ytan",
];
const LOCAL_ENGLISH_TAILS = [
  "base", "craft", "flow", "forge", "lane", "link", "nest", "pilot", "scope", "studio", "works", "wise",
];
const LOCAL_SWIPE_CONSONANTS = ["b", "c", "d", "f", "g", "h", "j", "k", "l", "m", "n", "p", "r", "s", "t", "v", "w", "z"];
const LOCAL_SWIPE_CONSONANT_CLUSTERS = ["bl", "br", "cl", "cr", "dr", "fl", "fr", "gl", "gr", "kl", "kr", "pl", "pr", "sk", "sl", "sm", "sn", "sp", "st", "tr", "vr"];
const LOCAL_SWIPE_VOWELS = ["a", "e", "i", "o", "u"];
const LOCAL_SWIPE_VOWEL_PAIRS = ["ae", "ai", "ea", "ei", "ia", "io", "oa", "oi", "ou"];
const LOCAL_THEME_LEXICON = {
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
  tradgard: ["blad", "bloom", "fro", "garden", "grove", "jord", "leaf", "sol", "spira"],
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
const LOCAL_THEME_SIGNATURES = {
  bygglov: [
    "bygglovsguiden", "bygglovskollen", "bygglovsradet", "bygglovsnavet", "bygglovsplanen",
    "lovklar", "lovform", "lovguiden", "lovkollen", "plantydlig", "plantrygg", "ritklart",
    "ritrum", "takhojd", "tomtrygg", "grundspira", "boformen", "hemritning",
  ],
  bygg: [
    "byggformen", "byggsparet", "byggverkstan", "byggnavet", "bygglyftet", "grundspira",
    "ritrummet", "takhojd", "tomtrygg", "planverket", "boformen", "hemritning",
  ],
  fastighet: [
    "bokvarteret", "hemvarden", "tomttrygg", "markformen", "rumsguiden", "hussparet",
    "boplatsen", "hemnavet", "grundlaget", "boverket",
  ],
  hem: ["hemglimt", "hemnavet", "hemro", "borummet", "tryggbo", "husvagen", "rumsguiden", "boformen"],
  ekonomi: ["sparklok", "kapitalet", "vardekollen", "kassaklok", "fondrummet", "sparnavet", "pengaspir", "vardevis"],
  juridik: ["lagklok", "rattsvar", "regelverket", "trygglag", "jurisformen", "lagguiden", "rattsidan", "caseklok"],
  teknik: ["kodglimt", "flowverket", "signalrum", "logiknavet", "teklab", "webformen", "digitaltorg", "kodspira"],
  tradgard: ["jordglimt", "bladverket", "solspira", "grovehem", "tradgardsro", "frorummet", "gronform", "bladnavet"],
};
const LOCAL_ENGLISH_WORDS = new Set([
  ...LOCAL_GLOBAL_WORDS,
  ...LOCAL_ENGLISH_TAILS,
  "build", "cortex", "digital", "eco", "estate", "food", "garden", "green", "home", "law", "leaf", "legal",
  "logic", "neural", "page", "path", "permit", "plot", "prompt", "roof", "route", "skill", "space", "story",
  "study", "table", "teach", "team", "tech", "think", "trip", "web", "wealth", "well", "work", "zen",
  "fund", "ledger", "capital", "value", "read", "word", "tale", "balance", "calm", "career", "talent", "rule", "trust",
  "ocean", "coast", "wave", "blue", "marine", "taste", "plate", "spice", "dine", "kitchen", "coffee", "roast", "bean", "brew", "cup",
  "clean", "shine", "sparkle", "fresh", "clear", "neat", "insight", "focus", "advice", "strategy", "hair", "cut", "style", "curl", "salon",
  "shop", "store", "basket", "cart", "market", "trade", "buy", "dog", "paw", "tail", "bark", "pet", "fetch",
]);
const LOCAL_SWEDISH_WORDS = new Set([
  ...LOCAL_NORDIC_WORDS,
  ...LOCAL_SWEDISH_TAILS,
  "aventyr", "blad", "bord", "bygg", "fro", "flyg", "halsa", "jobb", "jord", "karriar", "klass", "krydda",
  "kunskap", "lag", "las", "lov", "mat", "mode", "ord", "resa", "rit", "ratt", "regel", "sida", "smak",
  "talang", "tomt", "tradgard", "trygg", "varde",
  "hav", "kust", "bris", "vik", "vatten", "kok", "kaffe", "fika", "kopp", "rost", "stad", "rent", "glans", "klar", "puts",
  "rad", "insikt", "riktning", "har", "klipp", "lock", "slinga", "salong", "butik", "handel", "korg", "hund", "tass", "svans", "nos",
].map(asciiToken));

const availabilityCache = new Map();
const registryCooldowns = new Map();
const verificationRateLimits = new Map();
const localSearchRateLimits = new Map();
const localSwipeRateLimits = new Map();
const localDeepReviewRateLimits = new Map();
const localApiRateLimits = new Map();
const localDeveloperApiKeys = new Map();
const localDeveloperApiKeyCreateLimits = new Map();
const localPublicApiRateLimits = new Map();
const localPublicSwipeRateLimits = new Map();
let registrarPriceCache;
let registrarPriceFetch;
let tldesPriceFeedCache;
let tldesPriceFeedFetch;
let tldesPriceFeedFailureUntil = 0;

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".xml": "application/xml; charset=utf-8",
};

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65_535) {
  throw new Error("NAME_QUEST_WEB_PORT must be a valid TCP port.");
}

function withinDist(path) {
  const pathRelative = relative(DIST_DIR, path);
  return pathRelative === "" || (!pathRelative.startsWith("..") && !pathRelative.includes("..\\"));
}

function headersFor(file) {
  const immutableAsset = /[\\/]assets[\\/].+-[A-Za-z0-9_-]{8,}\./.test(file);
  // A browser must always revalidate the worker and its registration script.
  // Otherwise an older PWA can keep serving a cached HTML shell even after a
  // local build has been replaced on disk.
  const serviceWorkerScript = /[\\/](?:sw|registerSW)\.js$/.test(file);
  return {
    "Content-Type": MIME_TYPES[extname(file).toLowerCase()] ?? "application/octet-stream",
    "Cache-Control": serviceWorkerScript
      ? "no-store, max-age=0, must-revalidate"
      : immutableAsset ? "public, max-age=31536000, immutable" : "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
  };
}

async function existingFile(path) {
  try {
    return (await stat(path)).isFile() ? path : null;
  } catch {
    return null;
  }
}

function localPathWithoutTrailingSlash(pathname) {
  if (pathname === "/") return pathname;
  return pathname.replace(/\/+$/u, "");
}

function isKnownSpaPath(pathname) {
  const normalized = localPathWithoutTrailingSlash(pathname);
  return SPA_ROUTE_PATHS.has(normalized) || /^\/marketplace\/[^/]+$/u.test(normalized);
}

function localRobotsHeader(pathname) {
  const normalized = localPathWithoutTrailingSlash(pathname);
  return LOCAL_NOINDEX_SPA_PATHS.has(normalized) || /^\/marketplace\/[^/]+$/u.test(normalized)
    ? "noindex, nofollow"
    : undefined;
}

async function sendFile(response, method, file, additionalHeaders = {}) {
  const contents = method === "HEAD" ? null : await readFile(file);
  response.writeHead(200, { ...headersFor(file), ...additionalHeaders });
  response.end(contents ?? undefined);
}

function localErrorCode(status) {
  if (status === 400) return "invalid_request";
  if (status === 401) return "invalid_api_key";
  if (status === 405) return "method_not_allowed";
  if (status === 413) return "request_too_large";
  if (status === 415) return "unsupported_media_type";
  if (status === 429) return "rate_limited";
  return "internal_error";
}

function withLocalMachineErrorCode(status, payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  if (typeof payload.error !== "string" || typeof payload.code === "string") return payload;
  return { ...payload, code: localErrorCode(status) };
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
  });
  response.end(JSON.stringify(withLocalMachineErrorCode(status, payload)));
}

function normalizeVerificationDomain(value) {
  if (typeof value !== "string") return null;
  const domain = value.trim().toLowerCase();
  if (!domain || domain.length > 253 || /\s/.test(domain)) return null;

  const match = /^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\.(com|net|org|app|dev|ai|xyz|info|biz|se|io|nu)$/.exec(domain);
  if (!match || !VERIFY_TLDS.has(match[2])) return null;
  return domain;
}

async function readJson(request, maxBodyBytes = MAX_VERIFY_BODY_BYTES) {
  const chunks = [];
  let bytes = 0;

  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > maxBodyBytes) throw new Error("Request body is too large");
    chunks.push(chunk);
  }

  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("A JSON object is required");
    }
    return parsed;
  } catch (error) {
    if (error instanceof Error && error.message === "A JSON object is required") throw error;
    throw new Error("Invalid JSON");
  }
}

function isLoopbackRequest(request) {
  const address = request.socket.remoteAddress ?? "";
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function takeVerificationQuota(request) {
  const identity = request.socket.remoteAddress ?? "loopback";
  const now = Date.now();
  const current = verificationRateLimits.get(identity);

  if (!current || now - current.startedAt >= 60_000) {
    verificationRateLimits.set(identity, { startedAt: now, count: 1 });
    return true;
  }
  if (current.count >= VERIFY_REQUESTS_PER_MINUTE) return false;
  current.count += 1;
  return true;
}

function takeLocalSearchQuota(request, identityOverride) {
  const identity = identityOverride ?? request.socket.remoteAddress ?? "loopback";
  const now = Date.now();
  const current = localSearchRateLimits.get(identity);

  if (!current || now - current.startedAt >= 60_000) {
    localSearchRateLimits.set(identity, { startedAt: now, count: 1 });
    return true;
  }
  if (current.count >= LOCAL_SEARCH_REQUESTS_PER_MINUTE) return false;
  current.count += 1;
  return true;
}

function takeLocalSwipeQuota(request, identityOverride) {
  const identity = identityOverride ?? request.socket.remoteAddress ?? "loopback";
  const now = Date.now();
  const current = localSwipeRateLimits.get(identity);

  if (!current || now - current.startedAt >= 60_000) {
    localSwipeRateLimits.set(identity, { startedAt: now, count: 1 });
    return true;
  }
  if (current.count >= LOCAL_SWIPE_REQUESTS_PER_MINUTE) return false;
  current.count += 1;
  return true;
}

function takeLocalDeepReviewQuota(request) {
  const identity = request.socket.remoteAddress ?? "loopback";
  const now = Date.now();
  const current = localDeepReviewRateLimits.get(identity);

  if (!current || now - current.startedAt >= 60_000) {
    localDeepReviewRateLimits.set(identity, { startedAt: now, count: 1 });
    return true;
  }
  if (current.count >= LOCAL_DEEP_REVIEW_REQUESTS_PER_MINUTE) return false;
  current.count += 1;
  return true;
}

function localApiHeader(request, name) {
  const value = request.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function setLocalApiResponseHeaders(response, requestId, quota) {
  response.setHeader("X-Sajda-Api-Version", "v1");
  response.setHeader("X-Request-Id", requestId);
  response.setHeader("Vary", "Authorization");
  if (!quota) return;
  response.setHeader("X-RateLimit-Limit", String(LOCAL_API_REQUESTS_PER_MINUTE));
  response.setHeader("X-RateLimit-Remaining", String(quota.remaining));
  response.setHeader("X-RateLimit-Reset", String(Math.ceil(quota.resetAt / 1_000)));
}

function createLocalPublicRequestId() {
  return `req_${randomBytes(12).toString("base64url")}`;
}

function setLocalPublicApiHeaders(response, {
  requestId,
  allowMethods,
  quota,
  rateLimit = LOCAL_PUBLIC_API_REQUESTS_PER_MINUTE,
}) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", allowMethods);
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader(
    "Access-Control-Expose-Headers",
    "X-Request-Id, X-Sajda-Public-Api-Version, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After",
  );
  response.setHeader("Access-Control-Max-Age", "600");
  response.setHeader("X-Sajda-Public-Api-Version", "2026-08-25");
  response.setHeader("X-Request-Id", requestId);
  if (!quota) return;
  response.setHeader("X-RateLimit-Limit", String(rateLimit));
  response.setHeader("X-RateLimit-Remaining", String(quota.remaining));
  response.setHeader("X-RateLimit-Reset", String(Math.ceil(quota.resetAt / 1_000)));
}

function localConfiguredApiKeys() {
  const configured = process.env.SAJDA_API_KEY_HASHES?.trim();
  if (!configured) return [];
  const records = [];
  const usedIds = new Set();
  for (const entry of configured.split(/[\n,]/u)) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const separator = trimmed.indexOf(":");
    if (separator < 1 || separator !== trimmed.lastIndexOf(":")) return [];
    const id = trimmed.slice(0, separator).trim();
    const hash = trimmed.slice(separator + 1).trim().toLowerCase();
    if (!LOCAL_API_KEY_ID_PATTERN.test(id) || !LOCAL_API_KEY_HASH_PATTERN.test(hash) || usedIds.has(id)) return [];
    usedIds.add(id);
    records.push({ id, hash: Buffer.from(hash, "hex") });
  }
  return records;
}

function localDeveloperApiKeyMetadata(record) {
  return {
    id: record.id,
    name: record.name,
    keyPrefix: record.keyPrefix,
    lastFour: record.lastFour,
    environment: "test",
    scopes: ["names:search"],
    createdAt: record.createdAt,
    lastUsedAt: record.lastUsedAt,
    expiresAt: null,
    revokedAt: record.revokedAt,
  };
}

function localSelfServiceApiClientId(token) {
  const match = LOCAL_SELF_SERVICE_KEY_PATTERN.exec(token);
  if (!match) return undefined;
  const publicKeyId = match[1];
  const record = localDeveloperApiKeys.get(publicKeyId);
  const candidateHash = createHash("sha256").update(token, "utf8").digest();
  // Keep the local-only matcher constant-time even for unknown IDs. This is
  // not a production identity store; it merely mirrors the raw-key handling
  // contract without ever retaining a local raw secret.
  const expectedHash = record?.secretHash
    ? Buffer.from(record.secretHash, "hex")
    : createHash("sha256").update(`missing:${publicKeyId}`, "utf8").digest();
  if (!record || record.revokedAt || !timingSafeEqual(candidateHash, expectedHash)) return undefined;
  record.lastUsedAt = new Date().toISOString();
  return `local_key_${record.id}`;
}

function localAuthenticatedApiClientId(request) {
  const authorization = localApiHeader(request, "authorization");
  if (!authorization.startsWith("Bearer ")) return undefined;
  const token = authorization.slice("Bearer ".length);
  if (!LOCAL_API_KEY_TOKEN_PATTERN.test(token)) return undefined;

  const selfServiceClientId = localSelfServiceApiClientId(token);
  if (selfServiceClientId) return selfServiceClientId;

  const candidateHash = createHash("sha256").update(token, "utf8").digest();
  let authenticatedId;
  for (const configured of localConfiguredApiKeys()) {
    if (timingSafeEqual(candidateHash, configured.hash)) authenticatedId = configured.id;
  }
  return authenticatedId;
}

function localDeveloperApiKeyName(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("A JSON object is required.");
  if (Object.keys(body).some((key) => key !== "name")) throw new Error("Only name is accepted.");
  if (body.name === undefined) return "Default key";
  if (typeof body.name !== "string") throw new Error("name must be a string.");
  const name = body.name.trim();
  if (!name) throw new Error("name cannot be empty.");
  if (name.length > LOCAL_DEVELOPER_KEY_NAME_MAX_CHARS) {
    throw new Error(`name must be no longer than ${LOCAL_DEVELOPER_KEY_NAME_MAX_CHARS} characters.`);
  }
  if (/[\u0000-\u001F\u007F]/u.test(name)) throw new Error("name contains unsupported characters.");
  return name;
}

function takeLocalDeveloperApiKeyCreateQuota(request) {
  const identity = request.socket.remoteAddress ?? "loopback";
  const now = Date.now();
  const current = localDeveloperApiKeyCreateLimits.get(identity);
  if (!current || now - current.startedAt >= LOCAL_DEVELOPER_KEY_CREATE_WINDOW_MS) {
    localDeveloperApiKeyCreateLimits.set(identity, { startedAt: now, count: 1 });
    return { allowed: true, remaining: LOCAL_DEVELOPER_KEY_CREATE_LIMIT - 1 };
  }
  if (current.count >= LOCAL_DEVELOPER_KEY_CREATE_LIMIT) return { allowed: false, remaining: 0 };
  current.count += 1;
  return { allowed: true, remaining: LOCAL_DEVELOPER_KEY_CREATE_LIMIT - current.count };
}

function localCreateDeveloperApiKey(name) {
  const activeKeys = [...localDeveloperApiKeys.values()].filter((record) => !record.revokedAt);
  if (activeKeys.length >= LOCAL_DEVELOPER_KEY_MAX_ACTIVE) return undefined;

  const publicKeyId = randomBytes(12).toString("base64url");
  const secret = randomBytes(32).toString("base64url");
  const keyPrefix = `sj_test_${publicKeyId}_`;
  const rawKey = `${keyPrefix}${secret}`;
  if (!LOCAL_SELF_SERVICE_KEY_PATTERN.test(rawKey)) throw new Error("Local API key generation failed.");

  const record = {
    id: randomUUID(),
    name,
    publicKeyId,
    keyPrefix,
    lastFour: secret.slice(-4),
    secretHash: createHash("sha256").update(rawKey, "utf8").digest("hex"),
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
    revokedAt: null,
  };
  localDeveloperApiKeys.set(publicKeyId, record);
  return { key: localDeveloperApiKeyMetadata(record), rawKey };
}

function takeLocalApiQuota(clientId) {
  const now = Date.now();
  for (const [key, value] of localApiRateLimits) {
    if (now - value.startedAt >= 60_000) localApiRateLimits.delete(key);
  }
  const current = localApiRateLimits.get(clientId);
  const startedAt = current?.startedAt ?? now;
  const resetAt = startedAt + 60_000;
  const count = current?.count ?? 0;
  if (count >= LOCAL_API_REQUESTS_PER_MINUTE) return { allowed: false, remaining: 0, resetAt };
  const nextCount = count + 1;
  localApiRateLimits.set(clientId, { startedAt, count: nextCount });
  return { allowed: true, remaining: LOCAL_API_REQUESTS_PER_MINUTE - nextCount, resetAt };
}

function takeLocalPublicQuota(request, bucket, limit) {
  const now = Date.now();
  const identity = request.socket.remoteAddress ?? "loopback";
  for (const [key, value] of bucket) {
    if (now - value.startedAt >= 60_000) bucket.delete(key);
  }

  const current = bucket.get(identity);
  const startedAt = current?.startedAt ?? now;
  const resetAt = startedAt + 60_000;
  const count = current?.count ?? 0;
  if (count >= limit) {
    return { allowed: false, remaining: 0, resetAt };
  }
  const nextCount = count + 1;
  bucket.set(identity, { startedAt, count: nextCount });
  return { allowed: true, remaining: limit - nextCount, resetAt };
}

function takeLocalPublicApiQuota(request) {
  return takeLocalPublicQuota(request, localPublicApiRateLimits, LOCAL_PUBLIC_API_REQUESTS_PER_MINUTE);
}

function takeLocalPublicSwipeQuota(request) {
  return takeLocalPublicQuota(request, localPublicSwipeRateLimits, LOCAL_SWIPE_REQUESTS_PER_MINUTE);
}

function localApiString(value, field, maxLength) {
  if (typeof value !== "string") throw new Error(`${field} must be a string.`);
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new Error(`${field} must be no longer than ${maxLength} characters.`);
  return normalized;
}

function localApiEngineBody(body) {
  for (const key of Object.keys(body)) {
    if (!LOCAL_API_ALLOWED_BODY_KEYS.has(key)) throw new Error(`Unsupported field: ${key}.`);
  }
  const theme = body.query === undefined ? "" : localApiString(body.query, "query", LOCAL_API_MAX_QUERY_CHARS);
  if (!Array.isArray(body.tlds) || body.tlds.length < 1 || body.tlds.length > LOCAL_API_TLDS.size) {
    throw new Error(`tlds must contain 1–${LOCAL_API_TLDS.size} supported TLDs.`);
  }
  const tlds = [];
  for (const rawTld of body.tlds) {
    if (typeof rawTld !== "string") throw new Error("Each TLD must be a string.");
    const tld = rawTld.trim().toLowerCase().replace(/^\./u, "");
    if (!LOCAL_API_TLDS.has(tld) || tlds.includes(tld)) throw new Error("Each TLD must be a unique supported TLD.");
    tlds.push(tld);
  }
  let domains;
  if (body.domains !== undefined) {
    if (!Array.isArray(body.domains) || body.domains.length < 1 || body.domains.length > LOCAL_API_MAX_EXACT_DOMAINS) {
      throw new Error(`domains must contain 1–${LOCAL_API_MAX_EXACT_DOMAINS} exact domains.`);
    }
    domains = [];
    for (const rawDomain of body.domains) {
      const domain = localApiString(rawDomain, "Each domain", 253).toLowerCase();
      const domainTld = domain.split(".").at(-1);
      if (!normalizeVerificationDomain(domain) || !domainTld || !LOCAL_API_TLDS.has(domainTld) || domains.includes(domain)) {
        throw new Error("Each domain must be a unique, fully-qualified domain with a supported TLD.");
      }
      domains.push(domain);
    }
  }
  if (domains?.some((domain) => !tlds.includes(domain.split(".").at(-1)))) {
    throw new Error("Each exact domain must use one of the selected TLDs.");
  }
  const count = body.count ?? LOCAL_API_MAX_COUNT;
  if (typeof count !== "number" || !Number.isInteger(count) || count < 1 || count > LOCAL_API_MAX_COUNT) {
    throw new Error(`count must be an integer from 1 to ${LOCAL_API_MAX_COUNT}.`);
  }
  const locale = body.locale ?? "en";
  if (typeof locale !== "string" || !new Set(["en", "sv", "es", "fr", "zh"]).has(locale)) {
    throw new Error("locale must be one of en, sv, es, fr, or zh.");
  }
  const providers = body.providers ?? ["loopia"];
  if (!Array.isArray(providers) || providers.length < 1 || providers.length > PROVIDER_IDS.length) {
    throw new Error(`providers must contain 1–${PROVIDER_IDS.length} supported provider IDs.`);
  }
  const normalizedProviders = [];
  for (const rawProvider of providers) {
    if (typeof rawProvider !== "string") throw new Error("Each provider must be a string.");
    const provider = rawProvider.trim().toLowerCase();
    if (!PROVIDER_ID_SET.has(provider) || normalizedProviders.includes(provider)) {
      throw new Error("Each provider must be a unique supported provider ID.");
    }
    normalizedProviders.push(provider);
  }
  const creativeMode = body.creativeMode;
  if (creativeMode !== undefined && (typeof creativeMode !== "string" || !LOCAL_CREATIVE_SEARCH_MODES.has(creativeMode))) {
    throw new Error("creativeMode must be one of light, medium, heavy, or deep.");
  }
  return {
    theme,
    ...(domains ? { domains } : {}),
    tlds,
    count,
    locale,
    providers: normalizedProviders,
    ...(creativeMode ? { creativeMode } : {}),
  };
}

function isLocalApiJsonRequest(request) {
  return /^application\/json(?:\s*;|$)/iu.test(localApiHeader(request, "content-type").trim());
}

function asciiToken(value) {
  return asciiNameToken(String(value));
}

function makeSeed(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed) {
  let state = seed || 1;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function normalizeLocalSearchTlds(input) {
  if (!Array.isArray(input)) return [];
  const tlds = [];
  for (const value of input) {
    if (typeof value !== "string") continue;
    const tld = value.trim().toLowerCase().replace(/^\./, "");
    if (LOCAL_SEARCH_TLDS.has(tld) && !tlds.includes(tld)) tlds.push(tld);
  }
  return tlds.slice(0, LOCAL_SEARCH_MAX_TLDS);
}

// `saida.com .dev .ai` is a compact exact-check list: the bare extensions
// inherit the last explicit label. Only an audited local-verifier suffix is
// accepted, and ordinary creative-search text never becomes a direct check.
function parseLocalExactDomains(input, locale) {
  if (typeof input !== "string" || !input.trim()) return {};

  const domains = [];
  let lastLabel;
  const add = (domain) => {
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
      if (!LOCAL_SEARCH_TLDS.has(tld)) {
        return {
          error: localText(
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
        lastLabel = undefined;
        continue;
      }
      const tld = bareExtension[1];
      if (!LOCAL_SEARCH_TLDS.has(tld)) {
        return {
          error: localText(
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

    if (domains.length > LOCAL_MAX_EXACT_DOMAINS) {
      return {
        error: localText(
          locale,
          `Check no more than ${LOCAL_MAX_EXACT_DOMAINS} exact domains at once.`,
          `Kontrollera högst ${LOCAL_MAX_EXACT_DOMAINS} exakta domäner åt gången.`,
          `Comprueba como máximo ${LOCAL_MAX_EXACT_DOMAINS} dominios exactos a la vez.`,
          `Vérifiez au maximum ${LOCAL_MAX_EXACT_DOMAINS} domaines exacts à la fois.`,
          `一次最多检查 ${LOCAL_MAX_EXACT_DOMAINS} 个精确域名。`,
        ),
      };
    }
  }

  return domains.length > 0 ? { domains } : {};
}

// The browser search field and API clients supplying `domains` deliberately
// share the same strict parser. A list can still use the compact trailing
// extension shorthand after an explicit fully-qualified domain. When a list
// is present it is the complete exact-check request: an optional query/theme
// must not be interpreted as an additional domain behind the caller's back.
function parseLocalExactDomainRequest(theme, requestedDomains, locale) {
  if (requestedDomains === undefined) return parseLocalExactDomains(theme, locale);
  if (!Array.isArray(requestedDomains) || requestedDomains.length === 0 || requestedDomains.length > LOCAL_MAX_EXACT_DOMAINS
    || requestedDomains.some((domain) => typeof domain !== "string"
      || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)?\.[a-z]{2,63}\.?$/iu.test(domain.trim()))) {
    return {
      error: localText(
        locale,
        "Exact domains must be a list of domain names.",
        "Exakta domäner måste vara en lista med domännamn.",
        "Los dominios exactos deben ser una lista de nombres de dominio.",
        "Les domaines exacts doivent être une liste de noms de domaine.",
        "精确域名必须是域名列表。",
      ),
    };
  }
  const parsed = parseLocalExactDomains(requestedDomains.join("\n"), locale);
  return parsed.domains?.length || parsed.error ? parsed : { error: "Start with a complete domain name, such as example.com." };
}

function normalizeLocalProviderIds(input, locale) {
  // Existing local clients did not send a provider selection. Preserve their
  // established Loopia card while allowing the comparison UI to opt in.
  if (input === undefined) return { providerIds: ["loopia"] };
  if (!Array.isArray(input)) {
    return {
      error: localText(
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
      error: localText(
        locale,
        `Select at least one and no more than ${PROVIDER_IDS.length} providers.`,
        `Välj minst en och högst ${PROVIDER_IDS.length} leverantörer.`,
        `Selecciona al menos un proveedor y no más de ${PROVIDER_IDS.length}.`,
        `Sélectionnez au moins un fournisseur et au plus ${PROVIDER_IDS.length}.`,
        `请选择至少一个且不超过 ${PROVIDER_IDS.length} 个服务商。`,
      ),
    };
  }

  const providerIds = [];
  for (const value of input) {
    const providerId = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (!PROVIDER_ID_SET.has(providerId) || providerIds.includes(providerId)) {
      return {
        error: localText(
          locale,
          "Each provider must be selected once from the supported provider list.",
          "Varje leverantör måste väljas en gång från listan över stödda leverantörer.",
          "Cada proveedor debe seleccionarse una sola vez de la lista de proveedores compatibles.",
          "Chaque fournisseur doit être sélectionné une seule fois dans la liste des fournisseurs pris en charge.",
          "每个服务商只能从受支持服务商列表中选择一次。",
        ),
      };
    }
    providerIds.push(providerId);
  }

  return { providerIds };
}

function shuffle(items, random) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function uniqueLocalWords(words) {
  return [...new Set(words.map(asciiToken).filter((word) => word.length >= 2 && word.length <= 18))];
}

function localThemeWords(theme) {
  if (typeof theme !== "string") return [];
  return uniqueLocalWords(theme.match(/[\p{L}\p{N}]+/gu) ?? []).filter((word) => !LOCAL_BRIEF_STOP_WORDS.has(word) && (word.length >= 3 || isLocalKnownTheme(word))).slice(0, 6);
}

function isLocalLexiconMatch(token, trigger) {
  return token === trigger
    || (trigger.length >= 4 && token.includes(trigger))
    || (token.length >= 5 && trigger.includes(token));
}

const LOCAL_BRIEF_STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in", "into", "is", "it", "of", "on", "or", "our", "that", "the", "to", "we", "with", "you", "your",
  "about", "also", "brand", "business", "can", "company", "create", "customers", "help", "make", "need", "people", "platform", "service", "should", "this", "use", "want", "will",
  "att", "av", "bara", "den", "det", "en", "ett", "finnas", "for", "fran", "har", "inte", "jag", "med", "min", "och", "pa", "sa", "ska", "som", "till", "vi", "vill", "vara", "vart", "ar",
  "bolag", "foretag", "hjalpa", "kunder", "namn", "tjanst", "webbplats", "viktig", "anvanda", "bygga", "gora", "kunna", "langa", "olika",
]);

function isAdvancedLocalSearch(value) {
  return value === true;
}

function isLocalSwipeSearch(value) {
  return value === true;
}

function parseLocalSwipeLengthRange(body, locale) {
  const hasMinLength = Object.hasOwn(body, "minLength");
  const hasMaxLength = Object.hasOwn(body, "maxLength");
  const minLength = hasMinLength ? body.minLength : LOCAL_MIN_SWIPE_LABEL_LENGTH;
  const maxLength = hasMaxLength ? body.maxLength : LOCAL_MAX_SWIPE_LABEL_LENGTH;

  if (
    typeof minLength !== "number"
    || typeof maxLength !== "number"
    || !Number.isInteger(minLength)
    || !Number.isInteger(maxLength)
    || minLength < LOCAL_MIN_SWIPE_LABEL_LENGTH
    || maxLength > LOCAL_MAX_SWIPE_LABEL_LENGTH
    || minLength > maxLength
  ) {
    return {
      error: localText(
        locale,
        `Swipe names must use a minimum and maximum between ${LOCAL_MIN_SWIPE_LABEL_LENGTH} and ${LOCAL_MAX_SWIPE_LABEL_LENGTH} letters.`,
        `Swajpnamn måste ha en min- och maxlängd mellan ${LOCAL_MIN_SWIPE_LABEL_LENGTH} och ${LOCAL_MAX_SWIPE_LABEL_LENGTH} bokstäver.`,
        `Los nombres de Swipe deben tener una longitud mínima y máxima entre ${LOCAL_MIN_SWIPE_LABEL_LENGTH} y ${LOCAL_MAX_SWIPE_LABEL_LENGTH} letras.`,
        `Les noms Swipe doivent avoir une longueur minimale et maximale entre ${LOCAL_MIN_SWIPE_LABEL_LENGTH} et ${LOCAL_MAX_SWIPE_LABEL_LENGTH} lettres.`,
        `Swipe 名称的最小和最大长度必须在 ${LOCAL_MIN_SWIPE_LABEL_LENGTH} 到 ${LOCAL_MAX_SWIPE_LABEL_LENGTH} 个字母之间。`,
      ),
    };
  }

  return { range: { minLength, maxLength } };
}

function normalizeLocalSwipeCount(value) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return LOCAL_DEFAULT_SWIPE_RESULTS;
  return Math.min(LOCAL_MAX_SWIPE_RESULTS, Math.max(1, Math.trunc(numeric)));
}

function localSecureSwipeSeed() {
  return randomBytes(4).readUInt32LE(0);
}

function localRandomItem(items, random) {
  return items[Math.floor(random() * items.length)];
}

function weightedLocalSwipeLength(range, random) {
  const span = range.maxLength - range.minLength + 1;
  // Very short .com labels are usually registered. Favouring longer labels
  // keeps the promised 3–9-letter range intact while allowing a bounded
  // registry batch to fill a 100-card deck without brute-force probing.
  let selection = random() * ((span * (span + 1)) / 2);
  for (let offset = 1; offset <= span; offset += 1) {
    selection -= offset;
    if (selection < 0) return range.minLength + offset - 1;
  }
  return range.maxLength;
}

function randomLocalSwipeLabel(range, random) {
  const targetLength = weightedLocalSwipeLength(range, random);
  let label = "";
  let nextIsConsonant = true;

  while (label.length < targetLength) {
    const remaining = targetLength - label.length;
    if (nextIsConsonant) {
      const canUseCluster = remaining >= 3 && random() < 0.32;
      const options = canUseCluster ? LOCAL_SWIPE_CONSONANT_CLUSTERS : LOCAL_SWIPE_CONSONANTS;
      const usable = options.filter((part) => part.length < remaining);
      label += localRandomItem(usable.length > 0 ? usable : LOCAL_SWIPE_CONSONANTS, random);
      nextIsConsonant = false;
      continue;
    }

    const canUseVowelPair = remaining >= 2 && random() < 0.28;
    const options = canUseVowelPair ? LOCAL_SWIPE_VOWEL_PAIRS : LOCAL_SWIPE_VOWELS;
    const usable = options.filter((part) => part.length <= remaining);
    label += localRandomItem(usable.length > 0 ? usable : LOCAL_SWIPE_VOWELS, random);
    nextIsConsonant = true;
  }

  return label;
}

function localBriefWordCount(value) {
  return value.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
}

function readAdvancedLocalBrief(body, locale) {
  // `brief` is explicit for the advanced composer. The existing `theme`
  // field remains a compatible fallback so an older client can opt in.
  const source = typeof body.brief === "string"
    ? body.brief
    : typeof body.theme === "string"
      ? body.theme
      : "";
  const brief = source.replace(/\s+/gu, " ").trim();
  if (brief.length > MAX_ADVANCED_BRIEF_CHARS || localBriefWordCount(brief) > MAX_ADVANCED_BRIEF_WORDS) {
    return {
      error: localText(
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

function localCriteriaWordList(value, field, locale) {
  if (value === undefined) return { words: [] };
  if (!Array.isArray(value)) {
    return {
      error: localText(
        locale,
        `${field} must be an array of up to ${MAX_ADVANCED_CRITERIA_WORDS} short words.`,
        `${field} måste vara en lista med högst ${MAX_ADVANCED_CRITERIA_WORDS} korta ord.`,
        `${field} debe ser una lista de hasta ${MAX_ADVANCED_CRITERIA_WORDS} palabras cortas.`,
        `${field} doit être une liste d’au plus ${MAX_ADVANCED_CRITERIA_WORDS} mots courts.`,
        `${field} 必须是最多包含 ${MAX_ADVANCED_CRITERIA_WORDS} 个短词的数组。`,
      ),
    };
  }

  const words = [];
  for (const item of value) {
    if (typeof item !== "string") {
      return {
        error: localText(locale, `${field} can contain only text words.`, `${field} får bara innehålla textord.`, `${field} solo puede contener palabras de texto.`, `${field} ne peut contenir que des mots textuels.`, `${field} 只能包含文本词。`),
      };
    }
    // Arrays are the API contract, and a comma-separated pasted tag is
    // normalized in the same safe way as individually entered tags.
    const rawWords = item.split(/[\s,;:/|+]+/u).filter(Boolean);
    if (rawWords.length === 0) {
      return {
        error: localText(locale, `${field} can contain only non-empty text words.`, `${field} får bara innehålla icke-tomma textord.`, `${field} solo puede contener palabras de texto no vacías.`, `${field} ne peut contenir que des mots textuels non vides.`, `${field} 只能包含非空文本词。`),
      };
    }
    for (const rawWord of rawWords) {
      const word = asciiToken(rawWord);
      if (!/^[a-z0-9]{2,18}$/.test(word)) {
        return {
          error: localText(locale, `${field} words must normalize to 2–18 letters or numbers.`, `${field}-ord måste normaliseras till 2–18 bokstäver eller siffror.`, `Las palabras de ${field} deben normalizarse a 2–18 letras o números.`, `Les mots de ${field} doivent être normalisés en 2 à 18 lettres ou chiffres.`, `${field} 中的词必须规范化为 2–18 个字母或数字。`),
        };
      }
      if (!words.includes(word)) words.push(word);
      if (words.length > MAX_ADVANCED_CRITERIA_WORDS) {
        return {
          error: localText(locale, `${field} accepts at most ${MAX_ADVANCED_CRITERIA_WORDS} words.`, `${field} accepterar högst ${MAX_ADVANCED_CRITERIA_WORDS} ord.`, `${field} admite como máximo ${MAX_ADVANCED_CRITERIA_WORDS} palabras.`, `${field} accepte au maximum ${MAX_ADVANCED_CRITERIA_WORDS} mots.`, `${field} 最多接受 ${MAX_ADVANCED_CRITERIA_WORDS} 个词。`),
        };
      }
    }
  }
  return { words };
}

function parseLocalAdvancedCriteria(value, locale) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { error: localText(locale, "criteria must be an object.", "criteria måste vara ett objekt.", "criteria debe ser un objeto.", "criteria doit être un objet.", "criteria 必须是对象。") };
  }

  const allowedKeys = new Set([
    "minLength",
    "maxLength",
    "nameLanguage",
    "nameStyle",
    "includeWords",
    "excludeWords",
  ]);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    return { error: localText(locale, "criteria contains an unsupported field.", "criteria innehåller ett fält som inte stöds.", "criteria contiene un campo no compatible.", "criteria contient un champ non pris en charge.", "criteria 包含不受支持的字段。") };
  }

  const minLength = value.minLength === undefined ? MIN_ADVANCED_NAME_LENGTH : value.minLength;
  const maxLength = value.maxLength === undefined ? MAX_ADVANCED_NAME_LENGTH : value.maxLength;
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
      error: localText(
        locale,
        `criteria minLength and maxLength must be whole numbers between ${MIN_ADVANCED_NAME_LENGTH} and ${MAX_ADVANCED_NAME_LENGTH}.`,
        `criteria minLength och maxLength måste vara heltal mellan ${MIN_ADVANCED_NAME_LENGTH} och ${MAX_ADVANCED_NAME_LENGTH}.`,
        `criteria minLength y maxLength deben ser números enteros entre ${MIN_ADVANCED_NAME_LENGTH} y ${MAX_ADVANCED_NAME_LENGTH}.`,
        `criteria minLength et maxLength doivent être des nombres entiers entre ${MIN_ADVANCED_NAME_LENGTH} et ${MAX_ADVANCED_NAME_LENGTH}.`,
        `criteria 的 minLength 和 maxLength 必须是介于 ${MIN_ADVANCED_NAME_LENGTH} 和 ${MAX_ADVANCED_NAME_LENGTH} 之间的整数。`,
      ),
    };
  }

  const nameLanguage = value.nameLanguage === undefined ? "auto" : value.nameLanguage;
  if (typeof nameLanguage !== "string" || !NAME_LANGUAGES.has(nameLanguage)) {
    return { error: localText(locale, "criteria nameLanguage must be auto, en, sv, or mixed.", "criteria nameLanguage måste vara auto, en, sv eller mixed.", "criteria nameLanguage debe ser auto, en, sv o mixed.", "criteria nameLanguage doit être auto, en, sv ou mixed.", "criteria 的 nameLanguage 必须是 auto、en、sv 或 mixed。") };
  }
  const nameStyle = value.nameStyle === undefined ? "balanced" : value.nameStyle;
  if (typeof nameStyle !== "string" || !NAME_STYLES.has(nameStyle)) {
    return { error: localText(locale, "criteria nameStyle must be balanced, brandable, descriptive, or invented.", "criteria nameStyle måste vara balanced, brandable, descriptive eller invented.", "criteria nameStyle debe ser balanced, brandable, descriptive o invented.", "criteria nameStyle doit être balanced, brandable, descriptive ou invented.", "criteria 的 nameStyle 必须是 balanced、brandable、descriptive 或 invented。") };
  }

  const parsedIncludes = localCriteriaWordList(value.includeWords, "includeWords", locale);
  if (parsedIncludes.error) return { error: parsedIncludes.error };
  const parsedExcludes = localCriteriaWordList(value.excludeWords, "excludeWords", locale);
  if (parsedExcludes.error) return { error: parsedExcludes.error };
  const includeWords = parsedIncludes.words ?? [];
  const excludeWords = parsedExcludes.words ?? [];
  if (includeWords.some((word) => excludeWords.includes(word))) {
    return {
      error: localText(locale, "criteria cannot include and exclude the same word.", "criteria kan inte inkludera och exkludera samma ord.", "criteria no puede incluir y excluir la misma palabra.", "criteria ne peut pas inclure et exclure le même mot.", "criteria 不能同时包含和排除同一个词。"),
    };
  }

  return {
    criteria: { minLength, maxLength, nameLanguage, nameStyle, includeWords, excludeWords },
  };
}

function isLocalKnownTheme(token) {
  return Object.keys(LOCAL_THEME_LEXICON).some((trigger) => isLocalLexiconMatch(token, trigger));
}

function extractLocalBriefThemes(brief, locale) {
  const counts = new Map();
  for (const rawWord of brief.match(/[\p{L}\p{N}]+/gu) ?? []) {
    const word = asciiToken(rawWord);
    if (word.length < 3 || word.length > 18 || LOCAL_BRIEF_STOP_WORDS.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }

  const rankedWords = [...counts.entries()]
    .sort(([left, leftCount], [right, rightCount]) => {
      const leftScore = leftCount * 20 + (isLocalKnownTheme(left) ? 35 : 0) + (left.length >= 5 && left.length <= 12 ? 4 : 0);
      const rightScore = rightCount * 20 + (isLocalKnownTheme(right) ? 35 : 0) + (right.length >= 5 && right.length <= 12 ? 4 : 0);
      return rightScore - leftScore || left.localeCompare(right, locale);
    })
    .map(([word]) => word)
    .slice(0, 8);
  const directThemes = rankedWords.filter(isLocalKnownTheme);
  return uniqueLocalWords([...directThemes, ...rankedWords, ...expandLocalTheme(directThemes)]).slice(0, 8);
}

function joinLocalBriefThemes(themes, locale) {
  if (themes.length === 0) return localText(locale, "the idea", "idén", "la idea", "l’idée", "这个想法");
  if (themes.length === 1) return themes[0];
  if (themes.length === 2) return localText(locale, `${themes[0]} and ${themes[1]}`, `${themes[0]} och ${themes[1]}`, `${themes[0]} y ${themes[1]}`, `${themes[0]} et ${themes[1]}`, `${themes[0]} 和 ${themes[1]}`);
  const last = themes.at(-1);
  return localText(
    locale,
    `${themes.slice(0, -1).join(", ")}, and ${last}`,
    `${themes.slice(0, -1).join(", ")} och ${last}`,
    `${themes.slice(0, -1).join(", ")} y ${last}`,
    `${themes.slice(0, -1).join(", ")} et ${last}`,
    `${themes.slice(0, -1).join("、")} 和 ${last}`,
  );
}

function localBriefAnalysis(brief, locale) {
  const themes = extractLocalBriefThemes(brief, locale);
  const hasThemes = themes.length > 0;
  const focus = joinLocalBriefThemes(themes.slice(0, 3), locale);
  return {
    // This is deliberately named "local": it never implies that an AI model
    // was used when the deterministic analyser supplied the result.
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
        ? `En lokal briefanalys hittade teman kring ${joinLocalBriefThemes(themes.slice(0, 5), locale)}. Generatorn använder dem som semantiska ankare, relaterade begrepp och återhållsamma varumärkesordlekar.`
        : "En lokal briefanalys använder breda teman för att skapa tydliga, kreativa och uttalbara namnförslag."
      : locale === "es"
        ? hasThemes
          ? `Un análisis local del briefing encontró temas relacionados con ${joinLocalBriefThemes(themes.slice(0, 5), locale)}. El generador los utiliza como anclajes semánticos, conceptos relacionados y combinaciones de marca contenidas.`
          : "Un análisis local del briefing utiliza temas amplios para crear propuestas de nombre claras, creativas y fáciles de pronunciar."
        : locale === "fr"
          ? hasThemes
            ? `Une analyse locale du brief a identifié des thèmes autour de ${joinLocalBriefThemes(themes.slice(0, 5), locale)}. Le générateur les utilise comme repères sémantiques, concepts associés et mélanges de marque mesurés.`
            : "Une analyse locale du brief utilise de grands thèmes pour créer des idées de noms claires, créatives et faciles à prononcer."
          : locale === "zh"
            ? hasThemes
              ? `本地简介分析发现了与 ${joinLocalBriefThemes(themes.slice(0, 5), locale)} 相关的主题。生成器将其用作语义锚点、相关概念和克制的品牌式组合。`
              : "本地简介分析使用广泛主题来生成清晰、有创意且易于发音的名称建议。"
            : hasThemes
              ? `A local brief analysis found themes around ${joinLocalBriefThemes(themes.slice(0, 5), locale)}. The generator uses them as semantic anchors, related concepts, and restrained brand-style blends.`
              : "A local brief analysis uses broad themes to create clear, creative, pronounceable name ideas.",
  };
}

// Deep Review is a separate, bounded shortlist pass. It only accepts names
// already marked registry-verified and available by this process. Its score is
// intentionally deterministic and exposed field by field to the browser.
function clampLocalDeepReview(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function parseLocalDeepReviewCandidates(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > LOCAL_DEEP_REVIEW_MAX_CANDIDATES) {
    throw new Error(`Provide 1–${LOCAL_DEEP_REVIEW_MAX_CANDIDATES} registry-verified available domains.`);
  }
  const unique = new Map();
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid Deep Review candidate.");
    const domain = normalizeVerificationDomain(raw.domain);
    const authoritativeMethod = raw.checkMethod === "rdap" || raw.checkMethod === "whois" || raw.checkMethod === "das";
    if (raw.status !== "available" || raw.availabilityVerified !== true || !authoritativeMethod || !domain) {
      throw new Error("Deep Review accepts only registry-verified available domains from the current search.");
    }
    if (!unique.has(domain)) {
      unique.set(domain, {
        domain,
        confidenceScore: clampLocalDeepReview(Number.isFinite(raw.confidenceScore) ? raw.confidenceScore : 0, 0, 45),
        priceVerified: raw.priceVerified === true,
      });
    }
  }
  return [...unique.values()];
}

function localDeepReviewLabel(domain) {
  return domain.split(".")[0] ?? "";
}

function localDeepReviewTld(domain) {
  return domain.split(".").at(-1) ?? "";
}

function localDeepReviewThemeTokens(theme) {
  return [...new Set((String(theme).toLowerCase().match(/[a-z0-9]{3,}/g) ?? []))].slice(0, 8);
}

function localDeepReviewReadability(label) {
  const length = label.length;
  const lengthScore = length >= 4 && length <= 10 ? 18 : length === 3 || (length >= 11 && length <= 13) ? 13 : length <= 16 ? 8 : 3;
  const vowelRatio = (label.match(/[aeiouy]/g) ?? []).length / Math.max(length, 1);
  const vowelScore = vowelRatio >= 0.25 && vowelRatio <= 0.62 ? 8 : vowelRatio >= 0.18 && vowelRatio <= 0.7 ? 4 : 0;
  const cleanScore = /--|[^aeiouy]{5}|(.)\1\1/.test(label) ? 0 : 4;
  return clampLocalDeepReview(lengthScore + vowelScore + cleanScore, 0, 30);
}

function localDeepReviewRelevance(label, theme) {
  const tokens = localDeepReviewThemeTokens(theme);
  if (tokens.length === 0) return 10;
  if (tokens.some((token) => label.includes(token) || token.includes(label))) return 20;
  return tokens.some((token) => token.length >= 4 && label.includes(token.slice(0, 4))) ? 13 : 5;
}

function localDeepReviewExtensionFit(tld) {
  if (tld === "com") return 15;
  if (["dev", "ai", "app", "io"].includes(tld)) return 12;
  if (["net", "org"].includes(tld)) return 11;
  if (["se", "nu"].includes(tld)) return 10;
  return 8;
}

function rankLocalDeepReview(candidates, theme) {
  return candidates
    .map((candidate) => {
      const label = localDeepReviewLabel(candidate.domain);
      const scoreBreakdown = {
        readability: localDeepReviewReadability(label),
        relevance: localDeepReviewRelevance(label, theme),
        extensionFit: localDeepReviewExtensionFit(localDeepReviewTld(candidate.domain)),
        registryEvidence: 25,
        priceClarity: candidate.priceVerified ? 5 : 0,
        searchSignal: Math.round(candidate.confidenceScore / 45 * 10),
      };
      return {
        candidate,
        scoreBreakdown,
        score: Object.values(scoreBreakdown).reduce((total, value) => total + value, 0),
      };
    })
    .sort((left, right) => right.score - left.score
      || right.scoreBreakdown.searchSignal - left.scoreBreakdown.searchSignal
      || localDeepReviewLabel(left.candidate.domain).length - localDeepReviewLabel(right.candidate.domain).length
      || left.candidate.domain.localeCompare(right.candidate.domain))
    .slice(0, 10)
    .map(({ candidate, score, scoreBreakdown }, index) => ({ rank: index + 1, domain: candidate.domain, score, scoreBreakdown }));
}

function localGenerationThemeFromBriefAnalysis(analysis, brief, locale) {
  const input = `${analysis.themes.join(" ")} ${extractLocalBriefThemes(brief, locale).join(" ")}`;
  return localThemeWords(input).join(" ") || brief;
}

function expandLocalTheme(themeTokens) {
  const words = [];
  for (const token of themeTokens) {
    for (const [trigger, related] of Object.entries(LOCAL_THEME_LEXICON)) {
      if (isLocalLexiconMatch(token, trigger)) words.push(...related);
    }
  }
  return uniqueLocalWords(words);
}

function localThemeSignatures(themeTokens) {
  const ideas = [];
  for (const token of themeTokens) {
    for (const [trigger, related] of Object.entries(LOCAL_THEME_SIGNATURES)) {
      if (isLocalLexiconMatch(token, trigger)) ideas.push(...related);
    }
  }
  return uniqueLocalWords(ideas);
}

function localWordLanguage(word) {
  if (LOCAL_SWEDISH_WORDS.has(word) && !LOCAL_ENGLISH_WORDS.has(word)) return "swedish";
  if (LOCAL_ENGLISH_WORDS.has(word) && !LOCAL_SWEDISH_WORDS.has(word)) return "english";
  return "neutral";
}

function allowsLocalCriteriaLanguage(word, language) {
  if (language === "auto" || language === "mixed") return true;
  const detected = localWordLanguage(word);
  return language === "sv" ? detected !== "english" : detected !== "swedish";
}

function localCriteriaStyleWeight(namingKind, style) {
  if (style === "balanced") return 0;
  const brandable = new Set(["brandBlend", "softBlend", "shortVariant", "brandWord", "playfulCompound", "creativePair", "evocativePair"]);
  const descriptive = new Set(["signature", "keyword", "swedishCompound", "englishCompound", "themePair", "themeSwedishCompound", "themeEnglishCompound"]);
  if (style === "brandable") return brandable.has(namingKind) ? 16 : descriptive.has(namingKind) ? -7 : 0;
  if (style === "descriptive") return descriptive.has(namingKind) ? 16 : brandable.has(namingKind) ? -7 : 0;
  return brandable.has(namingKind) ? 20 : descriptive.has(namingKind) ? -10 : 0;
}

function localCriteriaIncludeWeight(label, includeWords) {
  return includeWords.reduce((weight, word) => weight + (label.includes(word) ? 28 : 0), 0);
}

function clipForLocalBlend(word) {
  if (word.length <= 6) return word;
  const maximum = Math.min(7, word.length - 2);
  for (let index = maximum; index >= 4; index -= 1) {
    if (/[aeiouy]/.test(word[index - 1])) return word.slice(0, index);
  }
  return word.slice(0, maximum);
}

function joinLocalWords(left, right) {
  return joinNameWords(left, right);
}

function localLabelQuality(label) {
  const lengthScore = label.length >= 5 && label.length <= 12 ? 20 : label.length <= 16 ? 13 : 5;
  const vowelRatio = (label.match(/[aeiouy]/g) ?? []).length / Math.max(label.length, 1);
  const vowelScore = vowelRatio >= 0.25 && vowelRatio <= 0.62 ? 12 : vowelRatio >= 0.18 && vowelRatio <= 0.7 ? 6 : 0;
  const hardToReadPenalty = /(.)\1\1|[^aeiouy]{5}/.test(label) ? 12 : 0;
  return lengthScore + vowelScore - hardToReadPenalty;
}

function localFamilyKey(label, primaryWords) {
  const anchor = primaryWords.find((word) => hasDirectLocalReference(label, [word]));
  return anchor ?? label.slice(0, Math.min(4, label.length));
}

function localReferenceStem(word) {
  const normalized = asciiToken(word);
  if (normalized.length <= 5) return normalized;
  return normalized.slice(0, Math.max(5, Math.ceil(normalized.length * 0.6)));
}

function hasRepeatedLocalToken(label) {
  for (let tokenLength = 2; tokenLength <= Math.floor(label.length / 2); tokenLength += 1) {
    if (label.length % tokenLength !== 0) continue;
    const token = label.slice(0, tokenLength);
    if (token.repeat(label.length / tokenLength) === label) return true;
  }
  return false;
}

function localReferenceMatch(label, primaryWords, semanticWords) {
  if (hasDirectLocalReference(label, primaryWords)) {
    return "direct";
  }

  if (semanticWords.some((word) => (
    word.length < 4
      ? label.startsWith(word) || label.endsWith(word)
      : label.includes(word)
  ))) {
    return "semantic";
  }

  return "none";
}

function hasDirectLocalReference(label, referenceWords) {
  return referenceWords.some((word) => {
    const stem = localReferenceStem(word);
    return label.includes(word) || (stem.length >= 4 && label.includes(stem));
  });
}

function pickDiverseLocalLabels(candidates, count, locale, requireReferenceRelevance = false) {
  const ranked = [...candidates].sort((left, right) => {
    if (requireReferenceRelevance && left.isReferenceRelevant !== right.isReferenceRelevant) {
      return left.isReferenceRelevant ? -1 : 1;
    }
    return right.score - left.score || left.label.localeCompare(right.label, locale === "sv" ? "sv" : "en");
  });
  const eligible = requireReferenceRelevance
    ? ranked.filter((candidate) => candidate.isReferenceRelevant)
    : ranked;
  const selected = [];
  const selectedLabels = new Set();

  const familyLimits = requireReferenceRelevance
    ? [3, 6, Number.POSITIVE_INFINITY]
    : [2, 4, Number.POSITIVE_INFINITY];
  for (const familyLimit of familyLimits) {
    const familyCounts = new Map();
    for (const candidate of selected) {
      const family = candidate.family;
      familyCounts.set(family, (familyCounts.get(family) ?? 0) + 1);
    }
    for (const candidate of eligible) {
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
 * Creates a deterministic local naming session from real words and semantic
 * theme expansion. Direct theme phrases lead the list, then related Swedish /
 * English compounds and gentle blends supply breadth. The algorithm never
 * treats a generated word as available; the registry pass below decides that.
 */
function generateLocalCandidates(tlds, count, theme, locale = "en", criteria, priorityReference, creativeMode) {
  const themedWords = localThemeWords(theme);
  const priorityReferenceWords = localThemeWords(priorityReference);
  const primaryWords = criteria
    ? uniqueLocalWords([...criteria.includeWords, ...themedWords])
    : themedWords;
  const inferredSwedishCorpus = primaryWords.some((word) => localWordLanguage(word) === "swedish")
    || (locale === "sv" && !primaryWords.some((word) => localWordLanguage(word) === "english"));
  const language = criteria?.nameLanguage ?? "auto";
  // Basic cards use the existing style weighting only. They never turn into
  // implicit Advanced criteria such as a length or language restriction.
  const effectiveNameStyle = criteria?.nameStyle ?? (creativeMode
    ? localCreativeModeNameStyle(creativeMode)
    : "balanced");
  const useSwedishCorpus = language === "sv"
    || language === "mixed"
    || (language === "auto" && inferredSwedishCorpus);
  const useEnglishCorpus = language !== "sv";
  const expandedThemeWords = expandLocalTheme(primaryWords);
  const semanticWords = criteria
    ? expandedThemeWords.filter((word) => allowsLocalCriteriaLanguage(word, language))
    : expandedThemeWords;
  const signatureWords = localThemeSignatures(primaryWords);
  const fallbackWords = primaryWords.length > 0
    ? []
    : criteria && language === "mixed"
      ? ["nord", "spira", "glimt", "luma", "vista", "forge", "bloom", "harbor"]
      : useSwedishCorpus
        ? ["nord", "spira", "glimt", "luma", "vista"]
        : ["luma", "vista", "forge", "bloom", "harbor"];
  const anchors = uniqueLocalWords([...primaryWords, ...semanticWords, ...fallbackWords]);
  const seed = criteria
    ? `${tlds.join(",")}|${primaryWords.join(",")}|${locale}|creative-local-v5|${language}|${criteria.nameStyle}|${criteria.minLength}-${criteria.maxLength}|${criteria.includeWords.join(",")}|${criteria.excludeWords.join(",")}`
    : `${tlds.join(",")}|${primaryWords.join(",")}|${locale}|creative-local-v4${creativeMode ? `|${creativeMode}` : ""}`;
  const random = seededRandom(makeSeed(seed));
  const constructionContext = primaryWords.some((word) => /bygg|construction|building|fastighet/.test(word));
  const swedishTails = useSwedishCorpus
    ? shuffle(LOCAL_SWEDISH_TAILS, random).filter((word) => word !== "bygg" || constructionContext) : [];
  const englishTails = criteria && !useEnglishCorpus ? [] : shuffle(LOCAL_ENGLISH_TAILS, random);
  const brandTails = shuffle(LOCAL_BRAND_TAILS, random);
  const nordicWords = useSwedishCorpus ? shuffle(LOCAL_NORDIC_WORDS, random) : [];
  const globalWords = criteria && !useEnglishCorpus ? [] : shuffle(LOCAL_GLOBAL_WORDS, random);
  const referenceSuffixes = language === "sv" ? [...swedishTails, ...LOCAL_NORDIC_WORDS] : LOCAL_REFERENCE_SUFFIXES;
  const referencePrefixes = language === "sv" ? ["min", "ny", "nord", "sam", "trygg"] : LOCAL_REFERENCE_PREFIXES;
  const companions = uniqueLocalWords([...semanticWords, ...nordicWords, ...globalWords]);
  const swedishCompanions = companions.filter((word) => localWordLanguage(word) !== "english");
  const englishCompanions = companions.filter((word) => localWordLanguage(word) !== "swedish");
  const hasSemanticContext = primaryWords.length > 0 && semanticWords.length > 0;
  const labels = new Map();

  const add = (value, namingPattern, relevance, namingKind = "thematic") => {
    const label = asciiToken(value);
    // A brand name is short, readable and avoids hyphens / number stuffing.
    if (!/^[a-z][a-z0-9]{2,21}$/.test(label)) return;
    if (criteria && (label.length < criteria.minLength || label.length > criteria.maxLength)) return;
    if (criteria?.excludeWords.some((word) => label.includes(word))) return;
    if (hasRepeatedLocalToken(label)) return;
    const match = primaryWords.length > 0
      ? localReferenceMatch(label, primaryWords, semanticWords)
      : "semantic";
    const isPriorityReferenceRelevant = priorityReferenceWords.length === 0
      || hasDirectLocalReference(label, priorityReferenceWords);
    // A supplied reference is a hard acceptance rule. Returning fewer results
    // is more honest and useful than filling a themed search with unrelated
    // generic domain ideas.
    if (primaryWords.length > 0 && match === "none") return;
    if (!isPriorityReferenceRelevant) return;
    const candidate = {
      label,
      family: localFamilyKey(label, primaryWords),
      namingPattern,
      score: relevance
        + (priorityReferenceWords.length > 0 ? 42 : 0)
        + (match === "direct"
          ? hasSemanticContext ? 54 : 92
          : match === "semantic" ? hasSemanticContext ? 62 : 36 : 0)
        + localLabelQuality(label)
        + (useSwedishCorpus && (namingKind === "swedishCompound" || namingKind === "themeSwedishCompound") ? 12 : 0)
        + localCriteriaStyleWeight(namingKind, effectiveNameStyle)
        + (criteria ? localCriteriaIncludeWeight(label, criteria.includeWords) : 0)
        + random() * 0.75,
      isReferenceRelevant: primaryWords.length === 0 || match !== "none",
      isPriorityReferenceRelevant,
    };
    const current = labels.get(label);
    if (!current || candidate.score > current.score) labels.set(label, candidate);
  };

  // Curated phrases provide especially natural starting points for common
  // Swedish themes such as bygglov, without constraining a user to a preset.
  for (const idea of signatureWords) add(idea, localPattern(locale, "signature"), 54, "signature");

  const primaryForIdeas = primaryWords.length > 0 ? primaryWords : fallbackWords;
  for (let index = 0; index < primaryWords.length - 1; index += 1) {
    add(joinLocalWords(primaryWords[index], primaryWords[index + 1]), localPattern(locale, "themePair"), 58, "themePair");
  }
  for (const primary of primaryForIdeas) {
    add(primary, localPattern(locale, "keyword"), 64, "keyword");
    for (const tail of swedishTails.slice(0, 9)) {
      add(joinLocalWords(primary, tail), localPattern(locale, "swedishCompound"), 42, "swedishCompound");
    }
    for (const tail of englishTails.slice(0, 8)) {
      add(joinLocalWords(primary, tail), localPattern(locale, "englishCompound"), 40, "englishCompound");
    }
    for (const tail of referenceSuffixes) {
      add(joinLocalWords(primary, tail), localPattern(locale, "shortVariant"), 46, "shortVariant");
    }
    for (const prefix of referencePrefixes) {
      add(joinLocalWords(prefix, primary), localPattern(locale, "shortVariant"), 43, "shortVariant");
    }
    for (const tail of brandTails) {
      add(joinLocalWords(primary, tail), localPattern(locale, "brandBlend"), 39, "brandBlend");
    }
  }

  // Topic expansion gives a theme several distinct semantic angles. This is
  // deliberately word-led: e.g. planverket, ritrummet and tomtrygg are more
  // useful than arbitrary pseudo-words.
  const focusedAnchors = anchors.slice(0, 24);
  for (let index = 0; index < focusedAnchors.length; index += 1) {
    const anchor = focusedAnchors[index];
    const language = localWordLanguage(anchor);
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
    const partner = naturalCompanions[(index * 5 + 3) % naturalCompanions.length];
    const alternate = naturalCompanions[(index * 7 + 11) % naturalCompanions.length];
    const relevance = primaryWords.includes(anchor) ? 34 : semanticWords.includes(anchor) ? 29 : 17;
    add(joinLocalWords(anchor, partner), localPattern(locale, "themePair"), relevance, "themePair");
    if (language !== "english") {
      for (const tail of swedishTails.slice(index % 4, (index % 4) + 2)) {
        add(joinLocalWords(anchor, tail), localPattern(locale, "themeSwedishCompound"), relevance - 1, "themeSwedishCompound");
      }
    }
    if (language !== "swedish") {
      for (const tail of englishTails.slice(index % 5, (index % 5) + 2)) {
        add(joinLocalWords(anchor, tail), localPattern(locale, "themeEnglishCompound"), relevance - 2, "themeEnglishCompound");
      }
    }
    if (anchor !== partner && index % 2 === 0) {
      add(joinLocalWords(partner, anchor), localPattern(locale, "reverseWordplay"), relevance - 10, "reverseWordplay");
    }
    add(joinLocalWords(clipForLocalBlend(anchor), alternate), localPattern(locale, "softBlend"), relevance - 4, "softBlend");
    add(joinLocalWords(anchor, brandTails[index % brandTails.length]), localPattern(locale, "shortVariant"), relevance - 7, "shortVariant");
  }

  if (primaryWords.length === 0) {
    // Image-led pairs are appropriate exploration only when no reference word
    // was supplied. The themed path above deliberately remains anchored.
    const evocativeWords = uniqueLocalWords([...nordicWords, ...globalWords]);
    for (let index = 0; index < evocativeWords.length; index += 1) {
      const left = evocativeWords[index];
      const right = evocativeWords[(index * 9 + 5) % evocativeWords.length];
      if (left !== right) add(joinLocalWords(left, right), localPattern(locale, "evocativePair"), 15, "evocativePair");
    }

    for (let attempt = 0; labels.size < count * 3 && attempt < count * 16; attempt += 1) {
      const left = companions[Math.floor(random() * companions.length)];
      const right = evocativeWords[Math.floor(random() * evocativeWords.length)];
      const tail = brandTails[Math.floor(random() * brandTails.length)];
      if (attempt % 3 === 0) add(joinLocalWords(left, right), localPattern(locale, "creativePair"), 11, "creativePair");
      else if (attempt % 3 === 1) add(joinLocalWords(clipForLocalBlend(left), tail), localPattern(locale, "brandWord"), 10, "brandWord");
      else add(joinLocalWords(left, clipForLocalBlend(right)), localPattern(locale, "playfulCompound"), 9, "playfulCompound");
    }
  }

  const selected = pickDiverseLocalLabels([...labels.values()], count, locale, primaryWords.length > 0);
  return selected.map((candidate, index) => ({
    domain: `${candidate.label}.${tlds[index % tlds.length]}`,
    namingPattern: candidate.namingPattern,
  }));
}

function generateLocalSwipeCandidates(tlds, count, range) {
  const random = seededRandom(localSecureSwipeSeed());
  const tldOrder = shuffle(tlds, random);
  const labels = new Set();
  const candidates = [];

  for (let attempt = 0; candidates.length < count && attempt < count * 80; attempt += 1) {
    const label = randomLocalSwipeLabel(range, random);
    if (!/^[a-z]{3,9}$/.test(label) || labels.has(label)) continue;
    labels.add(label);
    candidates.push({
      domain: `${label}.${tldOrder[candidates.length % tldOrder.length]}`,
      namingPattern: "swipeRandom",
    });
  }

  return candidates;
}

function localScreening(domain, namingPattern, locale = "en") {
  const [label, tld] = domain.split(".");
  const { score } = nameQualitySignals(label);
  return {
    estimatedValue: 0,
    namingScore: score,
    confidenceScore: Math.min(45, Math.round(15 + score * 0.3)),
    rationale: localScreeningRationale(locale, localPattern(locale, namingPattern ?? "creativePair"), label, tld, score),
  };
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await mapper(items[index]);
    }
  }));
  return results;
}

// Swipe has a separate collector because its response contains only cards
// that are authoritatively available. It checks a fixed candidate buffer and
// stops starting work after either the requested deck is full or the local
// time budget is reached. Taken and unknown names never become cards.
async function verifyLocalSwipeCandidates(candidates, targetCount) {
  const available = [];
  let checked = 0;
  let unknownCount = 0;
  let next = 0;
  const deadline = Date.now() + LOCAL_SWIPE_REGISTRY_DEADLINE_MS;

  await Promise.all(Array.from({ length: Math.min(LOCAL_SWIPE_REGISTRY_CONCURRENCY, candidates.length) }, async () => {
    while (Date.now() < deadline && available.length < targetCount) {
      const candidate = candidates[next];
      next += 1;
      if (!candidate) return;

      const availability = await verifyAvailability(candidate.domain);
      checked += 1;
      if (availability.status === "unknown") unknownCount += 1;

      if (availability.status === "available" && availability.authoritative && available.length < targetCount) {
        available.push({ candidate, availability });
      }
    }
  }));

  return { checked, unknown: unknownCount, available };
}

function unknown(domain, tld, source, error) {
  return { domain, tld, status: "unknown", checkMethod: "none", source, authoritative: false, error };
}

function localizeRegistryError(error, locale) {
  // Preserve the established English/Swedish local-verifier response exactly.
  // Localized variants are added only at the presentation boundary, so cache
  // contents and registry parsing remain language-neutral.
  if (!["es", "fr", "zh"].includes(locale) || typeof error !== "string") return error;
  const status = error.startsWith("RDAP HTTP ")
    ? error.slice("RDAP HTTP ".length)
    : error.startsWith("DAS HTTP ")
      ? error.slice("DAS HTTP ".length)
      : undefined;
  if (locale === "fr") {
    if (error === "RDAP rate limit reached") return "La limite de requêtes RDAP a été atteinte.";
    if (error === "RDAP check failed") return "La vérification RDAP a échoué.";
    if (error.startsWith("RDAP HTTP ")) return `RDAP a renvoyé HTTP ${status}.`;
    if (error === "WHOIS response could not be interpreted safely") return "La réponse WHOIS n’a pas pu être interprétée en toute sécurité.";
    if (error === "WHOIS check failed") return "La vérification WHOIS a échoué.";
    if (error === "DAS response could not be interpreted safely") return "La réponse DAS n’a pas pu être interprétée en toute sécurité.";
    if (error === "DAS check failed") return "La vérification DAS a échoué.";
    if (error.startsWith("DAS HTTP ")) return `DAS a renvoyé HTTP ${status}.`;
    if (error === "This TLD is not supported by local verification") return "Ce TLD n’est pas pris en charge par la vérification locale.";
    return error;
  }
  if (locale === "zh") {
    if (error === "RDAP rate limit reached") return "已达到 RDAP 请求限制。";
    if (error === "RDAP check failed") return "RDAP 检查失败。";
    if (error.startsWith("RDAP HTTP ")) return `RDAP 返回了 HTTP ${status}。`;
    if (error === "WHOIS response could not be interpreted safely") return "无法安全解析 WHOIS 响应。";
    if (error === "WHOIS check failed") return "WHOIS 检查失败。";
    if (error === "DAS response could not be interpreted safely") return "无法安全解析 DAS 响应。";
    if (error === "DAS check failed") return "DAS 检查失败。";
    if (error.startsWith("DAS HTTP ")) return `DAS 返回了 HTTP ${status}。`;
    if (error === "This TLD is not supported by local verification") return "本地验证不支持此 TLD。";
    return error;
  }
  if (error === "RDAP rate limit reached") return "Se alcanzó el límite de solicitudes de RDAP.";
  if (error === "RDAP check failed") return "La comprobación RDAP falló.";
  if (error.startsWith("RDAP HTTP ")) return `RDAP devolvió HTTP ${status}.`;
  if (error === "WHOIS response could not be interpreted safely") return "La respuesta WHOIS no se pudo interpretar de forma segura.";
  if (error === "WHOIS check failed") return "La comprobación WHOIS falló.";
  if (error === "DAS response could not be interpreted safely") return "La respuesta DAS no se pudo interpretar de forma segura.";
  if (error === "DAS check failed") return "La comprobación DAS falló.";
  if (error.startsWith("DAS HTTP ")) return `DAS devolvió HTTP ${status}.`;
  if (error === "This TLD is not supported by local verification") return "Este TLD no es compatible con la verificación local.";
  return error;
}

function localizeAvailabilityResult(result, locale) {
  if (!["es", "fr", "zh"].includes(locale) || !result?.error) return result;
  return { ...result, error: localizeRegistryError(result.error, locale) };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function defaultRegistrarOffer(tld, locale = "en", checkedAt = null) {
  return {
    providerId: "loopia",
    registrar: "Loopia",
    purchaseUrl: LOOPIA_PURCHASE_URL,
    priceSourceUrl: LOOPIA_PRICE_LIST_URL,
    priceStatus: "unavailable",
    dataSource: "loopia_public_price_list",
    connectorState: "public_source_active",
    // This is Loopia's published TLD list, not a checkout quote for this
    // specific domain. Keep the source scope machine-readable for the UI.
    priceScope: "standard_tld",
    currency: "SEK",
    checkedAt,
    priceVerified: false,
    note: registrarPriceNote(locale, tld),
  };
}

function tldesPriceFeedConfigured() {
  // The key is only read by this server process. It is never sent to the
  // browser, returned in a source URL, or appended to a log message.
  return Boolean(process.env.TLDES_API_KEY?.trim());
}

function officialProviderApiCredentialsConfigured(providerId) {
  const config = OFFICIAL_PROVIDER_PRICE_API_ENV[providerId];
  // This detects server-side deployment configuration only. It never exposes
  // a credential, calls a configured endpoint, or turns configuration into a
  // customer-facing provider price.
  return Boolean(process.env[config.endpointEnv]?.trim() && process.env[config.tokenEnv]?.trim());
}

function providerPriceConnector(providerId) {
  if (providerId === "loopia") {
    return { dataSource: "loopia_public_price_list", connectorState: "public_source_active" };
  }
  if (tldesPriceFeedConfigured()) {
    return { dataSource: "tldes_price_feed", connectorState: "aggregated_price_feed_configured" };
  }
  return officialProviderApiCredentialsConfigured(providerId)
    ? { dataSource: "official_provider_api", connectorState: "official_api_credentials_configured" }
    : { dataSource: "provider_search_page", connectorState: "official_api_not_configured" };
}

function providerPriceConnectionNote(provider, connectorState, locale) {
  if (connectorState === "aggregated_price_feed_configured") {
    return localText(
      locale,
      `Published standard TLD prices for ${provider.registrar} are read from the hourly TLDES price feed. Taxes and fees may not be included; confirm the checkout total with the provider.`,
      `Publicerade standardpriser för TLD:er hos ${provider.registrar} hämtas från TLDES prisflöde varje timme. Skatter och avgifter kan saknas; bekräfta slutpriset hos leverantören.`,
      `Los precios estándar publicados de TLD para ${provider.registrar} se obtienen del feed horario de precios de TLDES. Es posible que no incluyan impuestos ni tasas; confirma el total en el proveedor.`,
      `Les prix standard publiés des TLD chez ${provider.registrar} proviennent du flux horaire de TLDES. Les taxes et frais peuvent ne pas être inclus ; confirmez le total chez le fournisseur.`,
      `${provider.registrar} 的已发布标准 TLD 价格来自 TLDES 每小时价格源。价格可能不含税费；请在服务商处确认结算总额。`,
    );
  }
  if (connectorState === "official_api_credentials_configured") {
    return localText(
      locale,
      `Official API credentials are configured for ${provider.registrar}, but no reviewed price adapter is enabled yet. Open the provider to check the current price and availability.`,
      `Officiella API-uppgifter är konfigurerade för ${provider.registrar}, men ingen granskad prisadapter är aktiverad ännu. Öppna leverantören för att kontrollera aktuellt pris och tillgänglighet.`,
      `Las credenciales de la API oficial están configuradas para ${provider.registrar}, pero aún no hay un adaptador de precios revisado activo. Abre el proveedor para comprobar el precio y la disponibilidad actuales.`,
      `Les identifiants de l’API officielle sont configurés pour ${provider.registrar}, mais aucun adaptateur de prix validé n’est encore activé. Ouvrez le fournisseur pour vérifier le prix et la disponibilité actuels.`,
      `${provider.registrar} 的官方 API 凭据已配置，但尚未启用经过审核的价格适配器。请打开服务商以查看当前价格和可用性。`,
    );
  }
  return localText(
    locale,
    `Live pricing is not connected for ${provider.registrar}. Open the provider to check the current price and availability.`,
    `Livepris är inte anslutet för ${provider.registrar}. Öppna leverantören för att kontrollera aktuellt pris och tillgänglighet.`,
    `El precio en tiempo real no está conectado para ${provider.registrar}. Abre el proveedor para comprobar el precio y la disponibilidad actuales.`,
    `La tarification en direct n’est pas connectée pour ${provider.registrar}. Ouvrez le fournisseur pour vérifier le prix et la disponibilité actuels.`,
    `${provider.registrar} 未连接实时价格。请打开服务商以查看当前价格和可用性。`,
  );
}

function providerComparisonOffer(providerId, domain, tld, tldesPriceFeedLookup, locale) {
  const provider = PROVIDER_CATALOG[providerId];
  const connector = providerPriceConnector(providerId);
  const tldesOffer = tldesPriceFeedLookup.offers.get(tldesOfferKey(providerId, tld));
  if (tldesOffer) {
    return {
      ...tldesOffer,
      purchaseUrl: provider.purchaseUrl(domain),
      note: localisedTldesPriceFeedNote(tld, locale),
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
    // There is intentionally no numeric price here. A static comparison link
    // must never be presented as a provider quote.
    checkedAt: priceFeedConfigured ? tldesPriceFeedLookup.checkedAt : null,
    priceVerified: false,
    note: priceFeedConfigured
      ? localisedTldesPriceFeedUnavailableNote(provider, tld, tldesPriceFeedLookup.checkedAt, locale)
      : providerPriceConnectionNote(provider, connector.connectorState, locale),
  };
}

function registrarOffersForDomain(domain, tld, providerIds, loopiaPriceLookup, tldesPriceFeedLookup, locale) {
  return providerIds.map((providerId) => providerId === "loopia"
    ? loopiaPriceLookup.offers.get(tld) ?? defaultRegistrarOffer(tld, locale, loopiaPriceLookup.checkedAt)
    : providerComparisonOffer(providerId, domain, tld, tldesPriceFeedLookup, locale));
}

function selectedProviderMetadata(providerIds, locale) {
  return providerIds.map((providerId) => {
    const provider = PROVIDER_CATALOG[providerId];
    const connector = providerPriceConnector(providerId);
    const livePriceConnection = providerId === "loopia"
      || connector.connectorState === "aggregated_price_feed_configured";
    return {
      id: providerId,
      registrar: provider.registrar,
      searchUrl: provider.purchaseUrl(""),
      priceSourceUrl: connector.dataSource === "tldes_price_feed"
        ? TLDES_PRICE_FEED_DOCS_URL
        : provider.priceSourceUrl,
      livePriceConnection,
      ...connector,
      note: providerId === "loopia"
        ? localText(
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

function parseSwedishPrice(value) {
  if (typeof value !== "string" || !value) return undefined;
  const normalized = value
    .replace(/&nbsp;|\u00a0/g, " ")
    .replace(/\s/g, "")
    .replace(",", ".")
    .replace(/[^0-9.]/g, "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return undefined;

  const price = Number.parseFloat(normalized);
  return Number.isFinite(price) && price >= 0 ? price : undefined;
}

function priceFromCell(cell, cssClass) {
  const match = cell.match(new RegExp(
    `<span\\b[^>]*class\\s*=\\s*["'][^"']*${cssClass}[^"']*["'][^>]*>\\s*([^<]+?)\\s*<\\/span>`,
    "i",
  ));
  return parseSwedishPrice(match?.[1]);
}

function parseLoopiaOffer(html, tld, checkedAt) {
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

function localiseRegistrarOffer(offer, tld, locale) {
  if (!offer) return defaultRegistrarOffer(tld, locale);
  return { ...offer, note: registrarPriceNote(locale, tld, offer.priceType) };
}

function tldesOfferKey(providerId, tld) {
  return `${providerId}:${String(tld).toLowerCase()}`;
}

function tldesRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : undefined;
}

function tldesTimestamp(value) {
  if (typeof value !== "string" || value.length > 64 || !value.trim()) return undefined;
  return Number.isFinite(Date.parse(value)) ? value : undefined;
}

function isFreshTldesTimestamp(value, now = Date.now()) {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    && timestamp >= now - TLDES_PRICE_MAX_AGE_MS
    && timestamp <= now;
}

function tldesPrice(value) {
  // Price tuples are strings in TLDES. Avoid coercing malformed values from
  // an upstream JSON payload into a customer-visible price.
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/.test(normalized)) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1_000_000 ? parsed : undefined;
}

function tldesCurrency(value) {
  if (typeof value !== "string") return undefined;
  const currency = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : undefined;
}

function latestTldesTimestamp(current, candidate) {
  if (!candidate) return current;
  if (!current || Date.parse(candidate) > Date.parse(current)) return candidate;
  return current;
}

function localisedTldesPriceFeedNote(tld, locale) {
  return localText(
    locale,
    `Published standard .${tld} registration and renewal prices from the TLDES hourly price feed. Taxes and fees may not be included; this is not an exact-domain checkout quote.`,
    `Publicerade standardpriser för registrering och förnyelse av .${tld} från TLDES timvisa prisflöde. Skatter och avgifter kan saknas; detta är inte en offert för den exakta domänen.`,
    `Precios estándar publicados de registro y renovación de .${tld} procedentes del feed horario de TLDES. Es posible que no incluyan impuestos ni tasas; no es una oferta de compra para el dominio exacto.`,
    `Prix standard publiés d’enregistrement et de renouvellement du .${tld} provenant du flux horaire TLDES. Les taxes et frais peuvent ne pas être inclus ; ce n’est pas une offre pour le domaine exact.`,
    `来自 TLDES 每小时价格源的 .${tld} 标准注册和续费价格。价格可能不含税费；这不是该精确域名的结算报价。`,
  );
}

function localisedTldesPriceFeedUnavailableNote(provider, tld, checkedAt, locale) {
  const state = checkedAt
    ? localText(locale, "was checked", "kontrollerades", "se comprobó", "a été vérifié", "已检查")
    : localText(locale, "is configured but unavailable", "är konfigurerat men otillgängligt", "está configurado pero no está disponible", "est configuré mais indisponible", "已配置但当前不可用");
  return localText(
    locale,
    `The TLDES price feed ${state} but did not return a published standard .${tld} price for ${provider.registrar}. Open the provider to confirm the checkout price.`,
    `TLDES prisflöde ${state} men returnerade inget publicerat standardpris för .${tld} hos ${provider.registrar}. Öppna leverantören för att bekräfta slutpriset.`,
    `El feed de precios de TLDES ${state}, pero no devolvió un precio estándar publicado de .${tld} para ${provider.registrar}. Abre el proveedor para confirmar el precio final.`,
    `Le flux de prix TLDES ${state}, mais n’a pas renvoyé de prix standard publié pour le .${tld} chez ${provider.registrar}. Ouvrez le fournisseur pour confirmer le prix final.`,
    `TLDES 价格源${state}，但没有返回 ${provider.registrar} 的 .${tld} 已发布标准价格。请打开服务商确认结算价。`,
  );
}

function parseTldesPriceFeedPayload(payload) {
  const root = tldesRecord(payload);
  if (!root || !Array.isArray(root.registrars)) {
    throw new Error("Invalid aggregated price-feed schema.");
  }

  const responseUpdated = tldesTimestamp(root.updated);
  if (!isFreshTldesTimestamp(responseUpdated)) {
    throw new Error("Aggregated price feed timestamp is not fresh.");
  }
  const offers = new Map();
  let newestRegistrarTimestamp;

  for (const entry of root.registrars) {
    const registrarEntry = tldesRecord(entry);
    if (!registrarEntry || typeof registrarEntry.name !== "string") continue;

    const providerId = TLDES_PROVIDER_BY_HOST.get(registrarEntry.name.trim().toLowerCase());
    const currency = tldesCurrency(registrarEntry.currency);
    const registrarTimestamp = tldesTimestamp(registrarEntry.ts);
    if (registrarEntry.ts !== undefined && !isFreshTldesTimestamp(registrarTimestamp)) continue;
    const checkedAt = registrarTimestamp ?? responseUpdated;
    const icannFee = tldesPrice(registrarEntry.ICANNfee);
    if (!providerId || !currency || !isFreshTldesTimestamp(checkedAt) || !Array.isArray(registrarEntry.prices)) continue;

    newestRegistrarTimestamp = latestTldesTimestamp(newestRegistrarTimestamp, checkedAt);
    const provider = PROVIDER_CATALOG[providerId];
    for (const tuple of registrarEntry.prices) {
      if (!Array.isArray(tuple) || tuple.length < 3) continue;
      const tld = typeof tuple[0] === "string" ? tuple[0].trim().toLowerCase() : "";
      const registrationPrice = tldesPrice(tuple[1]);
      const renewalPrice = tldesPrice(tuple[2]);
      if (!LOCAL_SEARCH_TLDS.has(tld) || registrationPrice === undefined || renewalPrice === undefined) continue;

      offers.set(tldesOfferKey(providerId, tld), {
        providerId,
        registrar: provider.registrar,
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

async function fetchTldesPriceFeed(apiKey) {
  const url = new URL(TLDES_PRICE_FEED_URL);
  url.searchParams.set("data", "prices");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("registrars", TLDES_PRICED_PROVIDER_IDS.map((providerId) => TLDES_REGISTRAR_HOSTS[providerId]).join(","));
  url.searchParams.set("tlds", [...LOCAL_SEARCH_TLDS].join(","));

  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "Sajda-Price-Feed/1.0" },
    redirect: "error",
    signal: AbortSignal.timeout(TLDES_PRICE_FETCH_TIMEOUT_MS),
  });
  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok || !contentType.toLowerCase().includes("application/json")) {
    throw new Error("Aggregated price feed did not return JSON.");
  }

  const text = await readResponseTextLimited(response, TLDES_PRICE_RESPONSE_LIMIT_BYTES);
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("Aggregated price feed returned invalid JSON.");
  }
  return parseTldesPriceFeedPayload(payload);
}

async function getTldesPriceFeed() {
  const apiKey = process.env.TLDES_API_KEY?.trim();
  if (!apiKey) return { configured: false, checkedAt: null, offers: new Map() };

  const cached = tldesPriceFeedCache;
  const now = Date.now();
  const cachedIsFresh = Boolean(cached && isFreshTldesTimestamp(cached.checkedAt, now));
  if (cached && cachedIsFresh && now - cached.createdAt < TLDES_PRICE_CACHE_TTL_MS) {
    return { configured: true, checkedAt: cached.checkedAt, offers: cached.offers };
  }
  if (now < tldesPriceFeedFailureUntil) {
    return cached && cachedIsFresh
      ? { configured: true, checkedAt: cached.checkedAt, offers: cached.offers }
      : { configured: true, checkedAt: null, offers: new Map() };
  }

  if (!tldesPriceFeedFetch) {
    tldesPriceFeedFetch = fetchTldesPriceFeed(apiKey)
      .then((lookup) => {
        tldesPriceFeedCache = { createdAt: Date.now(), ...lookup };
        tldesPriceFeedFailureUntil = 0;
        return { configured: true, ...lookup };
      })
      // Do not print the upstream error: a fetch error can include the URL,
      // which contains the API key. The caller gets an explicit no-price
      // state instead and can still use the provider's checkout link.
      .catch(() => {
        tldesPriceFeedFailureUntil = Date.now() + TLDES_PRICE_FAILURE_CACHE_TTL_MS;
        return cached && cachedIsFresh
          ? { configured: true, checkedAt: cached.checkedAt, offers: cached.offers }
          : { configured: true, checkedAt: null, offers: new Map() };
      })
      .finally(() => {
        tldesPriceFeedFetch = undefined;
      });
  }
  return tldesPriceFeedFetch;
}

async function readResponseTextLimited(response, maximumBytes) {
  const contentLength = response.headers.get("content-length");
  if (contentLength && Number(contentLength) > maximumBytes) {
    throw new Error("Loopias prislista är större än den tillåtna svarsstorleken");
  }

  const reader = response.body?.getReader();
  if (!reader) return "";

  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      const chunk = Buffer.from(value);
      totalBytes += chunk.byteLength;
      if (totalBytes > maximumBytes) {
        try {
          await reader.cancel();
        } catch {
          // The size limit is still enforced if the underlying stream cannot
          // be cancelled cleanly.
        }
        throw new Error("Loopias prislista är större än den tillåtna svarsstorleken");
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function fetchLoopiaRegistrarOffers() {
  const offers = new Map();
  // Preserve a timestamp even on a failed attempt. That lets the API return
  // priceStatus=unavailable for Loopia instead of implying it was never
  // checked, while non-connected providers retain checkedAt=null.
  const checkedAt = new Date().toISOString();
  try {
    const response = await fetch(LOOPIA_PRICE_LIST_URL, {
      headers: { Accept: "text/html", "User-Agent": "Sajda-Price-Check/1.0" },
      redirect: "error",
      signal: AbortSignal.timeout(LOOPIA_PRICE_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`prislista HTTP ${response.status}`);

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("text/html")) {
      throw new Error("prislistan returnerade inte HTML");
    }

    const html = await readResponseTextLimited(response, LOOPIA_PRICE_RESPONSE_LIMIT_BYTES);
    for (const tld of LOCAL_SEARCH_TLDS) {
      const offer = parseLoopiaOffer(html, tld, checkedAt);
      if (offer) offers.set(tld, offer);
    }
  } catch (error) {
    // A failure must never become a stale or invented price. Availability
    // verification stays independent and callers receive the no-price offer.
    console.warn("[full-app-server] Loopia price lookup failed", error instanceof Error ? error.message : error);
  }
  return { checkedAt, offers };
}

async function getRegistrarOffers() {
  const cached = registrarPriceCache;
  if (cached && Date.now() - cached.createdAt < REGISTRAR_PRICE_CACHE_TTL_MS) {
    return { checkedAt: cached.checkedAt, offers: cached.offers };
  }

  if (!registrarPriceFetch) {
    registrarPriceFetch = fetchLoopiaRegistrarOffers()
      .then((lookup) => {
        registrarPriceCache = { createdAt: Date.now(), ...lookup };
        return lookup;
      })
      .finally(() => {
        registrarPriceFetch = undefined;
      });
  }
  return registrarPriceFetch;
}

function isRdapTld(tld) {
  return typeof tld === "string" && Object.hasOwn(RDAP_REGISTRIES, tld);
}

async function checkRdap(domain, tld) {
  const registry = RDAP_REGISTRIES[tld];
  if ((registryCooldowns.get(registry.endpoint) ?? 0) > Date.now()) return unknown(domain, tld, registry.source, "RDAP rate limit reached");
  try {
    const response = await fetch(`${registry.endpoint}domain/${encodeURIComponent(domain)}`, {
      headers: { Accept: "application/rdap+json, application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(WHOIS_TIMEOUT_MS),
    });
    if (response.status === 429) {
      registryCooldowns.set(registry.endpoint, registryRetryAt(response.headers.get("retry-after")));
      await response.body?.cancel();
      return unknown(domain, tld, registry.source, "RDAP rate limit reached");
    }
    if (response.status === 404 || response.status === 200) {
      const status = interpretRdapResponse(response.status, response.headers.get("content-type"), await readRegistryResponse(response), domain);
      return status === "unknown"
        ? unknown(domain, tld, registry.source, "The registry did not provide a usable answer. Recheck this domain before deciding.")
        : { domain, tld, status, checkMethod: "rdap", source: registry.source, authoritative: true };
    }
    return unknown(domain, tld, registry.source, response.status === 429 ? "RDAP rate limit reached" : `RDAP HTTP ${response.status}`);
  } catch (error) {
    console.warn(`[full-app-server] ${tld} RDAP failed`, error instanceof Error ? error.message : error);
    return unknown(domain, tld, registry.source, "RDAP check failed");
  }
}

function queryWhois(host, domain) {
  return new Promise((resolve, reject) => {
    const socket = connect({ host, port: 43 });
    const chunks = [];
    let bytes = 0;
    let settled = false;

    const complete = (error, result = "") => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      socket.destroy();
      if (error) reject(error);
      else resolve(result);
    };

    const timeout = setTimeout(() => complete(new Error("WHOIS-timeout")), WHOIS_TIMEOUT_MS);
    socket.setEncoding("utf8");
    socket.once("connect", () => socket.write(`${domain}\r\n`));
    socket.on("data", (chunk) => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > WHOIS_RESPONSE_LIMIT_BYTES) {
        complete(new Error("WHOIS-svar för stort"));
        return;
      }
      chunks.push(chunk);
    });
    socket.once("end", () => complete(null, chunks.join("")));
    socket.once("error", (error) => complete(error));
  });
}

async function checkIoWithWhois(domain) {
  try {
    const reply = await queryWhois("whois.nic.io", domain);
    if (/\b(?:not found|no match for)\b/i.test(reply)) {
      return { domain, tld: "io", status: "available", checkMethod: "whois", source: "nic-io-whois", authoritative: true };
    }
    const hasDomain = new RegExp(`^domain name:\\s*${escapeRegExp(domain)}\\s*$`, "mi").test(reply);
    if (hasDomain && /^registry domain id:/mi.test(reply)) {
      return { domain, tld: "io", status: "taken", checkMethod: "whois", source: "nic-io-whois", authoritative: true };
    }
    return unknown(domain, "io", "nic-io-whois", "WHOIS response could not be interpreted safely");
  } catch (error) {
    console.warn("[full-app-server] NIC.IO WHOIS failed", error instanceof Error ? error.message : error);
    return unknown(domain, "io", "nic-io-whois", "WHOIS check failed");
  }
}

async function verifyAvailability(domain) {
  const cached = availabilityCache.get(domain);
  if (cached && Date.now() - cached.createdAt < VERIFY_CACHE_TTL_MS) return cached.result;

  const tld = domain.split(".").at(-1);
  let result;
  if (isRdapTld(tld)) result = await checkRdap(domain, tld);
  else if (tld === "se" || tld === "nu") result = unknown(domain, tld, "iis-free-das", "A secure approved availability connector is not configured for this extension.");
  else if (tld === "io") result = await checkIoWithWhois(domain);
  else result = unknown(domain, tld ?? "", "none", "This TLD is not supported by local verification");

  availabilityCache.set(domain, { createdAt: Date.now(), result });
  return result;
}

async function handleVerification(request, response) {
  if (!isLoopbackRequest(request)) {
    sendJson(response, 403, { error: "Verification is available only on this computer" });
    return;
  }
  if (!takeVerificationQuota(request)) {
    sendJson(response, 429, { error: "Too many verification requests. Please wait one minute." });
    return;
  }

  try {
    const body = await readJson(request);
    if (!Array.isArray(body.domains) || body.domains.length < 1 || body.domains.length > MAX_VERIFY_DOMAINS) {
      sendJson(response, 400, { error: `Provide 1–${MAX_VERIFY_DOMAINS} domains` });
      return;
    }

    const domains = [...new Set(body.domains.map(normalizeVerificationDomain))];
    if (domains.includes(null) || domains.length !== body.domains.length) {
      sendJson(response, 400, { error: "Only valid, unique domains with a supported TLD can be verified" });
      return;
    }

    const results = await mapWithConcurrency(domains, 3, verifyAvailability);
    sendJson(response, 200, { checkedAt: new Date().toISOString(), results });
  } catch (error) {
    console.error("[full-app-server] availability verification failed", error instanceof Error ? error.message : error);
    sendJson(response, 400, { error: error instanceof Error ? error.message : "Verification failed" });
  }
}

async function handleLocalDeepReview(request, response) {
  if (!isLoopbackRequest(request)) {
    sendJson(response, 403, { error: "Deep Review is available only on this computer" });
    return;
  }
  if (!takeLocalDeepReviewQuota(request)) {
    sendJson(response, 429, { error: "Too many Deep Review requests. Please wait one minute." });
    return;
  }
  try {
    const body = await readJson(request);
    const theme = typeof body.theme === "string" ? body.theme.trim().slice(0, 100) : "";
    const candidates = parseLocalDeepReviewCandidates(body.candidates);
    const top10 = rankLocalDeepReview(candidates, theme);
    sendJson(response, 200, {
      reviewedAt: new Date().toISOString(),
      reviewedCount: candidates.length,
      analysisSource: "local",
      top10,
    });
  } catch (error) {
    console.error("[full-app-server] Deep Review failed", error instanceof Error ? error.message : error);
    sendJson(response, 400, { error: error instanceof Error ? error.message : "Deep Review could not be completed." });
  }
}

async function handleLocalSearch(request, response, options = {}) {
  const { allowExternal = false, body: suppliedBody, quotaIdentity, skipQuota = false } = options;
  if (!allowExternal && !isLoopbackRequest(request)) {
    sendJson(response, 403, { error: "Local test search is available only on this computer" });
    return;
  }

  let locale = "en";
  try {
    const body = suppliedBody ?? await readJson(request);
    locale = resolveLocale(body.locale);
    const swipe = isLocalSwipeSearch(body.swipe);
    const explicitTheme = typeof body.theme === "string" ? body.theme.slice(0, 100) : "";
    const parsedExactDomains = swipe ? {} : parseLocalExactDomainRequest(explicitTheme, body.domains, locale);
    if (parsedExactDomains.error) {
      sendJson(response, 400, { error: parsedExactDomains.error });
      return;
    }
    const exactDomains = parsedExactDomains.domains ?? [];
    const isExactDomainSearch = exactDomains.length > 0;
    const tlds = normalizeLocalSearchTlds(body.tlds);
    if (tlds.length === 0 && !isExactDomainSearch) {
      sendJson(response, 400, { error: localText(locale, "Select at least one supported TLD.", "Välj minst en stödd domänändelse.", "Selecciona al menos un TLD compatible.", "Sélectionnez au moins un TLD pris en charge.", "请选择至少一个受支持的 TLD。") });
      return;
    }
    const parsedProviders = normalizeLocalProviderIds(body.providers, locale);
    if (parsedProviders.error || !parsedProviders.providerIds) {
      sendJson(response, 400, {
        error: parsedProviders.error ?? localText(locale, "Select at least one provider.", "Välj minst en leverantör.", "Selecciona al menos un proveedor.", "Sélectionnez au moins un fournisseur.", "请选择至少一个服务商。"),
      });
      return;
    }
    const providerIds = parsedProviders.providerIds;

    const requestedCount = isExactDomainSearch
      ? exactDomains.length
      : swipe
      ? normalizeLocalSwipeCount(body.count)
      : Math.min(
        LOCAL_SEARCH_MAX_CANDIDATES,
        Math.max(1, Math.trunc(Number(body.count) || 12)),
      );
    const parsedSwipeRange = swipe ? parseLocalSwipeLengthRange(body, locale) : undefined;
    if (parsedSwipeRange?.error) {
      sendJson(response, 400, { error: parsedSwipeRange.error });
      return;
    }

    // Classify only after the body and Swipe-specific inputs have been
    // validated. This prevents a malformed body from gaining the Swipe
    // allowance, while leaving ordinary search at four valid requests/minute.
    if (!skipQuota && (swipe ? !takeLocalSwipeQuota(request, quotaIdentity) : !takeLocalSearchQuota(request, quotaIdentity))) {
      sendJson(response, 429, {
        error: localText(
          locale,
          swipe ? "Too many Swipe decks. Please wait one minute." : "Too many searches. Please wait one minute.",
          swipe ? "För många Swajp-kortlekar. Vänta en minut." : "För många sökningar. Vänta en minut.",
          swipe ? "Demasiados mazos de Swipe. Espera un minuto." : "Demasiadas búsquedas. Espera un minuto.",
          swipe ? "Trop de jeux Swipe. Veuillez attendre une minute." : "Trop de recherches. Veuillez attendre une minute.",
          swipe ? "Swipe 卡组过多。请等待一分钟。" : "搜索次数过多。请等待一分钟。",
        ),
      });
      return;
    }

    // Swipe intentionally skips the optional advanced analyser. It is a
    // fresh random deck and never sends a brief to an external AI service.
    const advanced = !swipe && isAdvancedLocalSearch(body.advanced);
    const parsedCreativeMode = parseLocalCreativeSearchMode(body.creativeMode, locale);
    if (parsedCreativeMode.error) {
      sendJson(response, 400, { error: parsedCreativeMode.error });
      return;
    }
    // Basic cards only alter basic creative generation. Exact checks, Swipe,
    // and Advanced retain their more explicit behaviour.
    const creativeMode = !swipe && !isExactDomainSearch && !advanced
      ? parsedCreativeMode.mode
      : undefined;
    let criteria;
    if (Object.hasOwn(body, "criteria")) {
      if (!advanced) {
        sendJson(response, 400, {
          error: localText(locale, "criteria can only be used with advanced search.", "criteria kan bara användas med avancerad sökning.", "criteria solo se puede usar con la búsqueda avanzada.", "criteria ne peut être utilisé qu’avec la recherche avancée.", "criteria 只能用于高级搜索。"),
        });
        return;
      }
      const parsedCriteria = parseLocalAdvancedCriteria(body.criteria, locale);
      if (parsedCriteria.error || !parsedCriteria.criteria) {
        sendJson(response, 400, { error: parsedCriteria.error ?? localText(locale, "Invalid criteria.", "Ogiltiga kriterier.", "Criterios no válidos.", "Critères non valides.", "条件无效。") });
        return;
      }
      criteria = parsedCriteria.criteria;
    }
    let briefAnalysis;
    let theme = explicitTheme;
    if (advanced) {
      const parsedBrief = readAdvancedLocalBrief(body, locale);
      if (parsedBrief.error) {
        sendJson(response, 400, { error: parsedBrief.error });
        return;
      }
      const brief = parsedBrief.brief ?? "";
      briefAnalysis = localBriefAnalysis(brief, locale);
      const briefTheme = localGenerationThemeFromBriefAnalysis(briefAnalysis, brief, locale);
      // A short reference is an intentional user choice. The longer brief can
      // enrich it, but it must not replace it during advanced generation.
      theme = uniqueLocalWords([
        ...localThemeWords(explicitTheme),
        ...localThemeWords(briefTheme),
      ]).join(" ") || briefTheme;
    }
    // Creative search keeps its existing reserve. Swipe has a larger but
    // fixed buffer so a 100-card deck can replace registered names without
    // ever becoming an unbounded registry scan.
    const verificationCount = swipe
      ? Math.min(LOCAL_MAX_SWIPE_VERIFICATIONS, requestedCount + LOCAL_SWIPE_VERIFICATION_BUFFER)
      : requestedCount >= 40
      ? Math.min(LOCAL_SEARCH_MAX_CANDIDATES, requestedCount + LOCAL_SEARCH_AVAILABILITY_BUFFER)
      : requestedCount;
    const candidates = swipe
      ? generateLocalSwipeCandidates(tlds, verificationCount, parsedSwipeRange.range)
      : isExactDomainSearch
        ? exactDomains.map((domain) => ({ domain, namingPattern: "exactDomain" }))
        : generateLocalCandidates(
          tlds,
          verificationCount,
          theme,
          locale,
          criteria,
          advanced ? explicitTheme : undefined,
          creativeMode,
        );
    // Loopia remains the direct Swedish public-price source. Non-Loopia
    // providers can receive standard TLD prices from the bounded TLDES feed
    // only when its server-side key is configured; no provider page is
    // scraped by this local service.
    const registrarOffersPromise = providerIds.includes("loopia")
      ? getRegistrarOffers()
      : Promise.resolve({ checkedAt: null, offers: new Map() });
    const tldesPriceFeedPromise = providerIds.some((providerId) => providerId !== "loopia")
      ? getTldesPriceFeed()
      : Promise.resolve({ configured: false, checkedAt: null, offers: new Map() });

    if (swipe) {
      const swipeRun = await verifyLocalSwipeCandidates(candidates, requestedCount);
      const [loopiaPriceLookup, tldesPriceFeedLookup] = await Promise.all([registrarOffersPromise, tldesPriceFeedPromise]);
      const results = swipeRun.available.map(({ candidate, availability }, index) => {
        const registrarOffers = registrarOffersForDomain(
          candidate.domain,
          availability.tld,
          providerIds,
          loopiaPriceLookup,
          tldesPriceFeedLookup,
          locale,
        ).map((offer) => offer.providerId === "loopia"
          ? localiseRegistrarOffer(offer, availability.tld, locale)
          : offer);
        return {
          ...localizeAvailabilityResult(availability, locale),
          ...localScreening(candidate.domain, candidate.namingPattern, locale),
          rankingPosition: index + 1,
          registrarPrice: 0,
          registrarOffer: registrarOffers[0],
          registrarOffers,
        };
      });

      sendJson(response, 200, {
        engine: "local-test-search",
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

    const availabilityResults = await mapWithConcurrency(candidates, 3, async (candidate) => {
      return verifyAvailability(candidate.domain);
    });
    const [loopiaPriceLookup, tldesPriceFeedLookup] = await Promise.all([registrarOffersPromise, tldesPriceFeedPromise]);
    const results = availabilityResults.map((availability, index) => {
      const candidate = candidates[index];
      const registrarOffers = registrarOffersForDomain(
        candidate.domain,
        availability.tld,
        providerIds,
        loopiaPriceLookup,
        tldesPriceFeedLookup,
        locale,
      ).map((offer) => offer.providerId === "loopia"
        ? localiseRegistrarOffer(offer, availability.tld, locale)
        : offer);
      return {
        ...localizeAvailabilityResult(availability, locale),
        ...localScreening(candidate.domain, candidate.namingPattern, locale),
        rankingPosition: index + 1,
        registrarPrice: 0,
        registrarOffer: registrarOffers[0],
        registrarOffers,
      };
    });

    sendJson(response, 200, {
      engine: "local-test-search",
      locale,
      checkedAt: new Date().toISOString(),
      providers: selectedProviderMetadata(providerIds, locale),
      requested: requestedCount,
      checked: results.length,
      available: results.filter((result) => result.status === "available").length,
      unknown: results.filter((result) => result.status === "unknown").length,
      ...(briefAnalysis ? { briefAnalysis } : {}),
      ...(criteria ? { criteria } : {}),
      ...(creativeMode ? { creativeMode } : {}),
      results,
    });
  } catch (error) {
    console.error("[full-app-server] local test search failed", error instanceof Error ? error.message : error);
    sendJson(response, 400, {
      error: error instanceof Error
        ? error.message
        : localText(locale, "The search failed", "Sökningen misslyckades", "La búsqueda falló.", "La recherche a échoué.", "搜索失败。"),
    });
  }
}

async function handleLocalApiV1Names(request, response) {
  const requestId = createLocalPublicRequestId();
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    setLocalApiResponseHeaders(response, requestId);
    sendJson(response, 405, { error: "Only POST requests are supported." });
    return;
  }
  if (!isLocalApiJsonRequest(request)) {
    setLocalApiResponseHeaders(response, requestId);
    sendJson(response, 415, { error: "Content-Type must be application/json." });
    return;
  }
  const clientId = localAuthenticatedApiClientId(request);
  if (!clientId) {
    setLocalApiResponseHeaders(response, requestId);
    sendJson(response, 401, { error: "Invalid API key." });
    return;
  }
  const quota = takeLocalApiQuota(clientId);
  setLocalApiResponseHeaders(response, requestId, quota);
  if (!quota.allowed) {
    response.setHeader("Retry-After", String(Math.max(1, Math.ceil((quota.resetAt - Date.now()) / 1_000))));
    sendJson(response, 429, { error: "API rate limit exceeded. Please retry after the reset time." });
    return;
  }
  try {
    const body = localApiEngineBody(await readJson(request, LOCAL_API_MAX_BODY_BYTES));
    // The raw bearer secret is never passed to the search engine. A private
    // server-side quota identity lets each provisioned key use its own bounded
    // engine budget while the anonymous local endpoint remains unchanged.
    await handleLocalSearch(request, response, {
      allowExternal: true,
      body,
      quotaIdentity: `api:${clientId}`,
    });
  } catch (error) {
    sendJson(response, 400, { error: error instanceof Error ? error.message : "The API request could not be completed." });
  }
}

async function handleLocalPublicApiV1Names(request, response) {
  const requestId = createLocalPublicRequestId();
  setLocalPublicApiHeaders(response, { requestId, allowMethods: "POST, OPTIONS" });

  if (request.method === "OPTIONS") {
    response.setHeader("Allow", "POST, OPTIONS");
    response.writeHead(204);
    response.end();
    return;
  }
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST, OPTIONS");
    sendJson(response, 405, { error: "Only POST requests are supported." });
    return;
  }
  if (!isLocalApiJsonRequest(request)) {
    sendJson(response, 415, { error: "Content-Type must be application/json." });
    return;
  }
  if (localApiHeader(request, "authorization")) {
    sendJson(response, 400, {
      error: "This public endpoint does not accept Authorization. Use /api/v1/domains with a server-side Sajda API key.",
      code: "authorization_not_supported",
    });
    return;
  }

  try {
    const body = localApiEngineBody(await readJson(request, LOCAL_API_MAX_BODY_BYTES));
    const quota = takeLocalPublicApiQuota(request);
    setLocalPublicApiHeaders(response, { requestId, allowMethods: "POST, OPTIONS", quota });
    if (!quota.allowed) {
      response.setHeader("Retry-After", String(Math.max(1, Math.ceil((quota.resetAt - Date.now()) / 1_000))));
      sendJson(response, 429, { error: "Too many searches. Please wait one minute." });
      return;
    }
    // The local server is a loopback development mirror. Reuse the same
    // verifier without its product quota, because the public quota above is
    // the contract visible to the developer explorer.
    await handleLocalSearch(request, response, {
      allowExternal: true,
      body,
      skipQuota: true,
    });
  } catch (error) {
    const status = error instanceof Error && /body is too large/iu.test(error.message) ? 413 : 400;
    sendJson(response, status, {
      error: error instanceof Error ? error.message : "The public API request could not be completed.",
    });
  }
}

async function handleLocalPublicDomainSearch(request, response) {
  const requestId = createLocalPublicRequestId();
  setLocalPublicApiHeaders(response, { requestId, allowMethods: "POST, OPTIONS" });

  if (request.method === "OPTIONS") {
    response.setHeader("Allow", "POST, OPTIONS");
    response.writeHead(204);
    response.end();
    return;
  }
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST, OPTIONS");
    sendJson(response, 405, { error: "Only POST requests are supported." });
    return;
  }
  if (!isLocalApiJsonRequest(request)) {
    sendJson(response, 415, { error: "Content-Type must be application/json." });
    return;
  }
  if (localApiHeader(request, "authorization")) {
    sendJson(response, 400, {
      error: "This public endpoint does not accept Authorization. Use /api/v1/domains with a server-side Sajda API key.",
      code: "authorization_not_supported",
    });
    return;
  }

  try {
    const body = await readJson(request, MAX_VERIFY_BODY_BYTES);
    const swipe = isLocalSwipeSearch(body.swipe);
    const quota = swipe ? takeLocalPublicSwipeQuota(request) : takeLocalPublicApiQuota(request);
    setLocalPublicApiHeaders(response, {
      requestId,
      allowMethods: "POST, OPTIONS",
      quota,
      rateLimit: swipe ? LOCAL_SWIPE_REQUESTS_PER_MINUTE : LOCAL_PUBLIC_API_REQUESTS_PER_MINUTE,
    });
    if (!quota.allowed) {
      response.setHeader("Retry-After", String(Math.max(1, Math.ceil((quota.resetAt - Date.now()) / 1_000))));
      sendJson(response, 429, {
        error: swipe ? "Too many Swipe decks. Please wait one minute." : "Too many searches. Please wait one minute.",
      });
      return;
    }
    // Local parity route for the documented consumer endpoint. The strict
    // `/api/v1/public/domains` wrapper remains the recommended integration
    // contract; this route intentionally preserves richer product inputs.
    await handleLocalSearch(request, response, {
      allowExternal: true,
      body,
      skipQuota: true,
    });
  } catch (error) {
    const status = error instanceof Error && /body is too large/iu.test(error.message) ? 413 : 400;
    sendJson(response, status, {
      error: error instanceof Error ? error.message : "The search could not be completed.",
    });
  }
}

function handleLocalOpenApi(request, response) {
  const requestId = createLocalPublicRequestId();
  setLocalPublicApiHeaders(response, { requestId, allowMethods: "GET, OPTIONS" });
  if (request.method === "OPTIONS") {
    response.setHeader("Allow", "GET, OPTIONS");
    response.writeHead(204);
    response.end();
    return;
  }
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET, OPTIONS");
    sendJson(response, 405, { error: "Only GET requests are supported." });
    return;
  }
  sendJson(response, 200, openApiDocument);
}

function localFactSignalLimit(value) {
  if (value === null || value === "") return 6;
  if (!/^(?:[1-9]|10)$/u.test(value)) throw new Error("limit must be an integer from 1 to 10.");
  return Number(value);
}

function localFactSignalTld(value) {
  if (value === null || value === "") return "com";
  if (!/^\.?[a-z]{2,12}$/iu.test(value)) throw new Error("tld must be a supported extension.");
  return value;
}

async function handleLocalFactSignals(request, response, url) {
  const requestId = createLocalPublicRequestId();
  setLocalPublicApiHeaders(response, { requestId, allowMethods: "GET, OPTIONS" });
  if (request.method === "OPTIONS") {
    response.setHeader("Allow", "GET, OPTIONS");
    response.writeHead(204);
    response.end();
    return;
  }
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET, OPTIONS");
    sendJson(response, 405, { error: "Only GET requests are supported." });
    return;
  }

  try {
    const payload = await getFactSignalFeed({
      tld: localFactSignalTld(url.searchParams.get("tld")),
      limit: localFactSignalLimit(url.searchParams.get("limit")),
      environment: process.env,
    });
    sendJson(response, 200, payload);
  } catch (error) {
    sendJson(response, 400, { error: error instanceof Error ? error.message : "The fact signal request could not be completed." });
  }
}

// Loopback-only local key harness. It uses process-memory metadata and stores
// only SHA-256 digests, so it behaves like production from a caller's point
// of view without pretending to be a user account, billing system, or durable
// credential store. Restarting the local server revokes every local test key.
function sendLocalDeveloperApiKeyJson(response, status, requestId, payload) {
  response.setHeader("X-Request-Id", requestId);
  response.setHeader("Vary", "Authorization");
  sendJson(response, status, { ...payload, requestId });
}

async function handleLocalDeveloperApiKeys(request, response, url) {
  const requestId = createLocalPublicRequestId();
  if (!isLoopbackRequest(request)) {
    sendLocalDeveloperApiKeyJson(response, 403, requestId, {
      error: "Local developer keys are available only from the loopback interface.",
      code: "local_access_only",
    });
    return;
  }

  response.setHeader("X-Sajda-Local-Development", "true");
  if (request.method === "GET") {
    const keys = [...localDeveloperApiKeys.values()]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(localDeveloperApiKeyMetadata);
    sendLocalDeveloperApiKeyJson(response, 200, requestId, { keys });
    return;
  }

  if (request.method === "DELETE") {
    const id = url.searchParams.get("id")?.trim().toLowerCase();
    if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(id)) {
      sendLocalDeveloperApiKeyJson(response, 400, requestId, { error: "id must be a valid API key ID.", code: "invalid_request" });
      return;
    }
    const record = [...localDeveloperApiKeys.values()].find((candidate) => candidate.id === id && !candidate.revokedAt);
    if (!record) {
      sendLocalDeveloperApiKeyJson(response, 404, requestId, { error: "Active API key not found.", code: "key_not_found" });
      return;
    }
    record.revokedAt = new Date().toISOString();
    sendLocalDeveloperApiKeyJson(response, 200, requestId, { key: localDeveloperApiKeyMetadata(record) });
    return;
  }

  if (request.method !== "POST") {
    response.setHeader("Allow", "GET, POST, DELETE");
    sendLocalDeveloperApiKeyJson(response, 405, requestId, { error: "Only GET, POST, and DELETE requests are supported.", code: "method_not_allowed" });
    return;
  }
  if (!isLocalApiJsonRequest(request)) {
    sendLocalDeveloperApiKeyJson(response, 415, requestId, { error: "Content-Type must be application/json.", code: "unsupported_media_type" });
    return;
  }

  let name;
  try {
    name = localDeveloperApiKeyName(await readJson(request, 1_024));
  } catch (error) {
    const status = error instanceof Error && /too large/iu.test(error.message) ? 413 : 400;
    sendLocalDeveloperApiKeyJson(response, status, requestId, { error: error instanceof Error ? error.message : "The API key request is invalid." });
    return;
  }

  const quota = takeLocalDeveloperApiKeyCreateQuota(request);
  if (!quota.allowed) {
    response.setHeader("Retry-After", String(Math.ceil(LOCAL_DEVELOPER_KEY_CREATE_WINDOW_MS / 1_000)));
    sendLocalDeveloperApiKeyJson(response, 429, requestId, { error: `You can create up to ${LOCAL_DEVELOPER_KEY_CREATE_LIMIT} local test keys per hour.`, code: "rate_limited" });
    return;
  }
  const created = localCreateDeveloperApiKey(name);
  if (!created) {
    sendLocalDeveloperApiKeyJson(response, 409, requestId, { error: "Revoke an existing local API key before creating another.", code: "key_limit_reached" });
    return;
  }
  sendLocalDeveloperApiKeyJson(response, 201, requestId, { key: created.key, apiKey: created.rawKey });
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${HOST}:${PORT}`);

    if (request.method === "GET" && url.pathname === "/api/health") {
      sendJson(response, 200, { ok: true, engine: "full-app-local-verifier", verifierTlds: [...VERIFY_TLDS] });
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/verify-availability") {
      await handleVerification(request, response);
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/deep-review") {
      await handleLocalDeepReview(request, response);
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/local-search") {
      await handleLocalSearch(request, response);
      return;
    }
    if (url.pathname === "/api/openapi") {
      handleLocalOpenApi(request, response);
      return;
    }
    if (url.pathname === "/api/fact-signals") {
      await handleLocalFactSignals(request, response, url);
      return;
    }
    if (url.pathname === "/api/reference-fx") {
      // This legacy development server has no provider-backed FX handler.
      // Vercel and serve:qa use api/reference-fx.ts. Never invent an FX rate.
      response.writeHead(request.method === "GET" ? 503 : 405, {
        "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Allow": "GET",
      });
      response.end(JSON.stringify({ status: "unavailable", referenceFx: null }));
      return;
    }
    if (url.pathname === "/api/domain-search") {
      await handleLocalPublicDomainSearch(request, response);
      return;
    }
    if (url.pathname === "/api/v1/public/domains" || url.pathname === "/api/v1/public/names") {
      await handleLocalPublicApiV1Names(request, response);
      return;
    }
    if (url.pathname === "/api/v1/domains" || url.pathname === "/api/v1/names") {
      await handleLocalApiV1Names(request, response);
      return;
    }
    if (url.pathname === "/api/developer/api-keys") {
      await handleLocalDeveloperApiKeys(request, response, url);
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD, POST", "Content-Type": "text/plain; charset=utf-8" });
      response.end("Method not allowed");
      return;
    }

    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Invalid path");
      return;
    }

    // Keep the local preview aligned with Vercel's trailingSlash:false
    // behavior. SEO pages declare slashless canonicals, so serving both
    // variants would hide a duplicate-URL problem during QA.
    if (pathname !== "/" && /\/+$/u.test(pathname)) {
      const destination = `${localPathWithoutTrailingSlash(pathname)}${url.search}`;
      response.writeHead(308, { Location: destination });
      response.end();
      return;
    }

    const candidate = resolve(DIST_DIR, `.${pathname}`);
    const requestedFile = withinDist(candidate) ? await existingFile(candidate) : null;
    if (requestedFile) {
      await sendFile(response, request.method, requestedFile);
      return;
    }

    // Vercel's cleanUrls serves `se/sok-doman.html` at `/se/sok-doman`.
    // Mirror that behavior locally so generated SEO pages can be inspected
    // before a preview deployment. Do not guess a file for asset requests.
    const cleanPathname = localPathWithoutTrailingSlash(pathname);
    const cleanHtmlCandidate = extname(cleanPathname)
      ? null
      : resolve(DIST_DIR, `.${cleanPathname}.html`);
    const cleanHtmlFile = cleanHtmlCandidate && withinDist(cleanHtmlCandidate)
      ? await existingFile(cleanHtmlCandidate)
      : null;
    if (cleanHtmlFile) {
      await sendFile(response, request.method, cleanHtmlFile);
      return;
    }

    // Asset requests and unknown paths must not silently receive a valid app
    // document. BrowserRouter's known product paths do receive index.html.
    if (extname(pathname)) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    if (!isKnownSpaPath(pathname)) {
      response.writeHead(404, {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Robots-Tag": "noindex, nofollow",
      });
      response.end("Not found");
      return;
    }

    const index = await existingFile(INDEX_FILE);
    if (!index) {
      response.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Build missing. Run npm run build before starting Sajda.");
      return;
    }
    const robotsHeader = localRobotsHeader(pathname);
    await sendFile(response, request.method, index, robotsHeader ? { "X-Robots-Tag": robotsHeader } : undefined);
  } catch (error) {
    console.error("[full-app-server]", error instanceof Error ? error.message : error);
    if (!response.headersSent) response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Internal server error");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Sajda full app is listening on http://${HOST}:${PORT}`);
});
