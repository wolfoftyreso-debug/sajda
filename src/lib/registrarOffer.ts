import type { Language } from "@/i18n/LanguageProvider";
import { getProviderCatalogEntry, getProviderIdForOffer } from "@/lib/providerCatalog";
import { getReferenceUsdRate, type ReferenceFx } from "../../shared/reference-fx";

/**
 * A purchase offer is deliberately separate from registry availability. A
 * domain that is available has no current registrar; this is the provider the
 * user can buy it from. This mirrors the public API payload exactly so the UI
 * never turns a screening estimate into a registrar price.
 */
/** ISO 4217 currency code supplied by a trusted price source. */
export type RegistrarCurrency = string;

export interface RegistrarOffer {
  /**
   * Stable provider identifier for comparison UI and API requests. Older
   * payloads did not have this field, so the display layer may infer it from
   * the registrar name when needed.
   */
  providerId?: string;
  registrar: string;
  purchaseUrl: string;
  priceSourceUrl: string;
  currency: RegistrarCurrency;
  registrationPriceInclVat?: number;
  registrationPriceExVat?: number;
  renewalPriceInclVat?: number;
  /**
   * Extension-level price feeds often publish a single amount without saying
   * whether tax is included. Keep that amount separate from the legacy
   * incl./excl.-VAT fields so the display layer never invents a tax label.
   */
  registrationPrice?: number;
  renewalPrice?: number;
  /**
   * Separately reported registry fee. It is never folded into the first-year
   * or renewal price because feeds do not guarantee that it is included.
   */
  icannFee?: number;
  taxTreatment?: "included" | "excluded" | "unknown";
  priceType?: "campaign" | "standard";
  /**
   * Distinguishes a published extension-level price from a quote for the
   * exact domain. A standard TLD price must never be presented as an exact
   * availability offer.
   */
  priceScope?: "standard_tld" | "exact_domain_offer";
  /**
   * Source-state fields are additive. They let the comparison UI distinguish
   * a verified price from a checked-but-unavailable price and an integration
   * that has not been connected yet.
   */
  priceStatus?: "verified" | "unavailable" | "not_connected";
  dataSource?: "loopia_public_price_list" | "official_provider_api" | "provider_search_page" | "tldes_price_feed";
  connectorState?: "public_source_active" | "official_api_not_configured" | "official_api_credentials_configured" | "aggregated_price_feed_configured";
  checkedAt?: string;
  priceVerified: boolean;
  note?: string;
}

/**
 * The public interface can add languages independently of the legacy i18n
 * provider. Keep price presentation ready for those local UI translations.
 */
export type RegistrarDisplayLanguage = Language | "es" | "fr" | "zh";

export type RegistrarPriceDisplayState = "verified" | "unavailable" | "stale";

export type RegistrarPriceTaxTreatment = "included" | "excluded" | "unknown";

export interface RegistrarPrice {
  amount: number;
  taxTreatment: RegistrarPriceTaxTreatment;
  /** Kept for existing consumers while unknown stays explicitly unknown. */
  taxIncluded?: boolean;
}

const LOOPIA_DOMAIN_SEARCH_URL = "https://www.loopia.se/domannamn/";
const LOOPIA_PRICE_LIST_URL = "https://www.loopia.se/domannamn/detaljerad_prislista/";
const VERIFIED_PRICE_MAX_AGE_MS = 24 * 60 * 60 * 1_000;
const TLDES_PRICE_FEED_MAX_AGE_MS = 2 * 60 * 60 * 1_000;
function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port;
  } catch {
    return false;
  }
}

function isValidAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function normaliseIsoCurrency(value: unknown): RegistrarCurrency | undefined {
  if (typeof value !== "string") return undefined;
  const currency = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return undefined;
  try {
    // Runtime validation lets a modern browser accept any actual ISO currency,
    // not just a hard-coded Western-currency shortlist.
    new Intl.NumberFormat("en", { style: "currency", currency }).format(0);
    return currency;
  } catch {
    return undefined;
  }
}

function isFreshPriceTimestamp(checkedAt: string | undefined, dataSource: RegistrarOffer["dataSource"]): boolean {
  if (!checkedAt) return false;
  const timestamp = Date.parse(checkedAt);
  if (!Number.isFinite(timestamp)) return false;
  const age = Date.now() - timestamp;
  if (age < 0) return false;
  const maximumAge = dataSource === "tldes_price_feed"
    ? TLDES_PRICE_FEED_MAX_AGE_MS
    : VERIFIED_PRICE_MAX_AGE_MS;
  return age <= maximumAge;
}

/**
 * All public TLDs currently offered in the anonymous search can be purchased
 * through Loopia. It is a purchase provider fallback, not a claim about the
 * registrar of an already registered domain.
 */
export function getDefaultRegistrarOffer(_domain: string): RegistrarOffer {
  return {
    providerId: "loopia",
    registrar: "Loopia",
    purchaseUrl: LOOPIA_DOMAIN_SEARCH_URL,
    priceSourceUrl: LOOPIA_PRICE_LIST_URL,
    currency: "SEK",
    priceVerified: false,
  };
}

/**
 * Makes API data safe for presentation. Numeric amounts only become visible
 * when the provider marks them as verified and supplies a current, HTTPS-backed
 * price source. Invalid or old payloads become an honest unavailable state.
 */
export function normaliseRegistrarOffer(domain: string, value: unknown): RegistrarOffer {
  const fallback = getDefaultRegistrarOffer(domain);
  if (!value || typeof value !== "object") return fallback;

  const candidate = value as Partial<RegistrarOffer>;
  const providerId = typeof candidate.providerId === "string" && /^[a-z0-9-]{1,40}$/i.test(candidate.providerId)
    ? candidate.providerId.trim().toLowerCase()
    : undefined;
  const candidateRegistrar = typeof candidate.registrar === "string" && candidate.registrar.trim()
    ? candidate.registrar.trim().slice(0, 100)
    : "Unknown provider";
  const provider = getProviderCatalogEntry(getProviderIdForOffer({ ...fallback, providerId, registrar: candidateRegistrar }));
  const registrar = provider?.name ?? candidateRegistrar;
  // A broken seller URL must never silently send that seller's customer to Loopia.
  const providerPurchaseUrl = provider?.purchaseUrl(domain) ?? "";
  const expectedHost = providerPurchaseUrl ? new URL(providerPurchaseUrl).hostname.replace(/^www\./, "") : "";
  const hasValidPurchaseUrl = isHttpsUrl(candidate.purchaseUrl)
    && (!provider || new URL(candidate.purchaseUrl).hostname.replace(/^www\./, "") === expectedHost);
  const hasValidPriceSourceUrl = isHttpsUrl(candidate.priceSourceUrl);
  const purchaseUrl = hasValidPurchaseUrl ? candidate.purchaseUrl : providerPurchaseUrl;
  const priceSourceUrl = hasValidPriceSourceUrl ? candidate.priceSourceUrl : provider?.priceSourceUrl ?? "";
  const currency = normaliseIsoCurrency(candidate.currency)
    ?? fallback.currency;
  const note = typeof candidate.note === "string" && candidate.note.trim()
    ? candidate.note.trim().slice(0, 280)
    : undefined;
  const priceType = candidate.priceType === "campaign" || candidate.priceType === "standard"
    ? candidate.priceType
    : undefined;
  const priceScope = candidate.priceScope === "standard_tld" || candidate.priceScope === "exact_domain_offer"
    ? candidate.priceScope
    : undefined;
  const priceStatus = candidate.priceStatus === "verified"
    || candidate.priceStatus === "unavailable"
    || candidate.priceStatus === "not_connected"
    ? candidate.priceStatus
    : undefined;
  const dataSource = candidate.dataSource === "loopia_public_price_list"
    || candidate.dataSource === "official_provider_api"
    || candidate.dataSource === "provider_search_page"
    || candidate.dataSource === "tldes_price_feed"
    ? candidate.dataSource
    : undefined;
  const connectorState = candidate.connectorState === "public_source_active"
    || candidate.connectorState === "official_api_not_configured"
    || candidate.connectorState === "official_api_credentials_configured"
    || candidate.connectorState === "aggregated_price_feed_configured"
    ? candidate.connectorState
    : undefined;
  const taxTreatment = candidate.taxTreatment === "included"
    || candidate.taxTreatment === "excluded"
    || candidate.taxTreatment === "unknown"
    ? candidate.taxTreatment
    : undefined;
  const checkedAt = typeof candidate.checkedAt === "string" && Number.isFinite(Date.parse(candidate.checkedAt))
    ? candidate.checkedAt
    : undefined;

  const priceMarkedVerified = candidate.priceVerified === true;
  const hasCurrentTimestamp = isFreshPriceTimestamp(checkedAt, dataSource);
  const registrationPrice = candidate.registrationPriceInclVat
    ?? candidate.registrationPriceExVat
    ?? candidate.registrationPrice;
  const priceVerified = priceMarkedVerified
    && Boolean(normaliseIsoCurrency(candidate.currency))
    && hasValidPurchaseUrl
    && hasValidPriceSourceUrl
    && hasCurrentTimestamp
    && isValidAmount(registrationPrice);

  return {
    ...(providerId ? { providerId } : {}),
    registrar,
    purchaseUrl,
    priceSourceUrl,
    currency,
    ...(priceVerified && isValidAmount(candidate.registrationPriceInclVat)
      ? { registrationPriceInclVat: candidate.registrationPriceInclVat }
      : {}),
    ...(priceVerified && isValidAmount(candidate.registrationPriceExVat)
      ? { registrationPriceExVat: candidate.registrationPriceExVat }
      : {}),
    ...(priceVerified && isValidAmount(candidate.renewalPriceInclVat)
      ? { renewalPriceInclVat: candidate.renewalPriceInclVat }
      : {}),
    ...(priceVerified && isValidAmount(candidate.registrationPrice)
      ? { registrationPrice: candidate.registrationPrice }
      : {}),
    ...(priceVerified && isValidAmount(candidate.renewalPrice)
      ? { renewalPrice: candidate.renewalPrice }
      : {}),
    ...(priceVerified && isValidAmount(candidate.icannFee) && candidate.icannFee > 0
      ? { icannFee: candidate.icannFee }
      : {}),
    ...(priceVerified && taxTreatment ? { taxTreatment } : {}),
    ...(priceVerified && priceType ? { priceType } : {}),
    ...(priceVerified && priceScope ? { priceScope } : {}),
    ...(priceVerified ? { priceStatus: "verified" as const } : priceStatus ? { priceStatus } : {}),
    ...(dataSource ? { dataSource } : {}),
    ...(connectorState ? { connectorState } : {}),
    // `checkedAt` also records an unsuccessful trusted lookup, so users can
    // see the difference between "not connected" and "checked but no quote".
    ...(checkedAt ? { checkedAt } : {}),
    priceVerified,
    ...(note ? { note } : {}),
  };
}

export function getRegistrarPriceDisplayState(offer?: RegistrarOffer): RegistrarPriceDisplayState {
  if (!offer) return "unavailable";
  // A timestamp is retained even when the normaliser rejects an old or future
  // feed result, so the UI can explain that a refresh is required rather than
  // silently treating the seller as disconnected.
  if (offer.checkedAt && !isFreshPriceTimestamp(offer.checkedAt, offer.dataSource)) return "stale";
  if (!offer.priceVerified) return "unavailable";
  if (!isFreshPriceTimestamp(offer.checkedAt, offer.dataSource)) return "stale";
  if (!isValidAmount(offer.registrationPriceInclVat ?? offer.registrationPriceExVat ?? offer.registrationPrice)) return "unavailable";
  return "verified";
}

export function hasFreshRegistrarPrice(offer?: RegistrarOffer): offer is RegistrarOffer & {
  checkedAt: string;
  registrationPriceInclVat?: number;
  registrationPriceExVat?: number;
  registrationPrice?: number;
} {
  return getRegistrarPriceDisplayState(offer) === "verified";
}

function getTaxTreatment(
  offer: RegistrarOffer,
  fallback: RegistrarPriceTaxTreatment,
): RegistrarPriceTaxTreatment {
  return offer.taxTreatment ?? fallback;
}

function toRegistrarPrice(
  amount: number,
  taxTreatment: RegistrarPriceTaxTreatment,
): RegistrarPrice {
  return {
    amount,
    taxTreatment,
    ...(taxTreatment === "included" ? { taxIncluded: true } : {}),
    ...(taxTreatment === "excluded" ? { taxIncluded: false } : {}),
  };
}

export function getRegistrationPrice(offer: RegistrarOffer): RegistrarPrice | null {
  if (!hasFreshRegistrarPrice(offer)) return null;
  if (isValidAmount(offer.registrationPriceInclVat)) {
    return toRegistrarPrice(offer.registrationPriceInclVat, getTaxTreatment(offer, "included"));
  }
  if (isValidAmount(offer.registrationPriceExVat)) {
    return toRegistrarPrice(offer.registrationPriceExVat, getTaxTreatment(offer, "excluded"));
  }
  if (isValidAmount(offer.registrationPrice)) {
    return toRegistrarPrice(offer.registrationPrice, getTaxTreatment(offer, "unknown"));
  }
  return null;
}

export function getRenewalPrice(offer: RegistrarOffer): RegistrarPrice | null {
  if (!hasFreshRegistrarPrice(offer)) return null;
  if (isValidAmount(offer.renewalPriceInclVat)) {
    return toRegistrarPrice(offer.renewalPriceInclVat, getTaxTreatment(offer, "included"));
  }
  if (isValidAmount(offer.renewalPrice)) {
    return toRegistrarPrice(offer.renewalPrice, getTaxTreatment(offer, "unknown"));
  }
  return null;
}

function getPriceLocale(language: RegistrarDisplayLanguage): string {
  if (language === "sv") return "sv-SE";
  if (language === "es") return "es-ES";
  if (language === "fr") return "fr-FR";
  if (language === "zh") return "zh-CN";
  return "en-US";
}

function getYearSuffix(language: RegistrarDisplayLanguage): string {
  if (language === "sv") return "år";
  if (language === "es") return "año";
  if (language === "fr") return "an";
  if (language === "zh") return "年";
  return "yr";
}

export function formatRegistrarCurrencyAmount(
  value: number,
  currency: RegistrarOffer["currency"],
  language: RegistrarDisplayLanguage = "en",
): string {
  const locale = getPriceLocale(language);
  let formatted: string;
  try {
    formatted = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    // The offer normaliser accepts ISO-shaped values from trusted feeds. Keep
    // a readable native-currency fallback if a browser lacks that currency.
    formatted = `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)} ${currency}`;
  }
  return formatted;
}

export function formatRegistrarPrice(
  value: number,
  currency: RegistrarOffer["currency"],
  language: RegistrarDisplayLanguage = "en",
): string {
  return `${formatRegistrarCurrencyAmount(value, currency, language)}/${getYearSuffix(language)}`;
}

/** USD comparisons use a dated reference rate in every language. Without a
 * current supported rate, keep the real native price; never relabel it USD. */
export function formatRegistrarOfferPrice(
  value: number,
  currency: RegistrarOffer["currency"],
  language: RegistrarDisplayLanguage = "en",
  referenceFx?: ReferenceFx | null,
): string {
  return `${formatRegistrarOfferAmount(value, currency, language, referenceFx)}/${getYearSuffix(language)}`;
}

export function formatRegistrarOfferAmount(
  value: number,
  currency: RegistrarOffer["currency"],
  language: RegistrarDisplayLanguage = "en",
  referenceFx?: ReferenceFx | null,
): string {
  const rate = currency !== "USD" ? getReferenceUsdRate(referenceFx, currency) : null;
  if (currency === "USD" || rate) {
    const amount = new Intl.NumberFormat(getPriceLocale(language), { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      .format(rate ? value * rate.usdPerUnit : value);
    return `${rate ? "≈ " : ""}$${amount} USD`;
  }
  return formatRegistrarCurrencyAmount(value, currency, language);
}

const fxCopy = {
  en: { native: "Provider price", daily: "Daily reference rate", fallback: "USD conversion unavailable; showing provider currency.", checkout: "Checkout uses the provider's currency and exchange rate." },
  sv: { native: "Leverantörspris", daily: "Daglig referenskurs", fallback: "USD-omräkning saknas; leverantörens valuta visas.", checkout: "I kassan gäller leverantörens valuta och växelkurs." },
  es: { native: "Precio del proveedor", daily: "Tipo de referencia diario", fallback: "Conversión a USD no disponible; se muestra la moneda del proveedor.", checkout: "Al pagar se aplica la moneda y el tipo de cambio del proveedor." },
  fr: { native: "Prix du fournisseur", daily: "Taux de référence quotidien", fallback: "Conversion USD indisponible ; devise du fournisseur affichée.", checkout: "Le paiement utilise la devise et le taux du fournisseur." },
  zh: { native: "服务商原币价格", daily: "每日参考汇率", fallback: "美元换算暂不可用，显示服务商原币价格。", checkout: "结账采用服务商的币种和汇率。" },
};

/** Always show the original amount alongside an approximate conversion. */
export function getRegistrarFxDisclosure(
  value: number,
  currency: RegistrarOffer["currency"],
  language: RegistrarDisplayLanguage = "en",
  referenceFx?: ReferenceFx | null,
): string | null {
  if (currency === "USD") return null;
  const copy = fxCopy[language] ?? fxCopy.en;
  const rate = getReferenceUsdRate(referenceFx, currency);
  if (!rate) return copy.fallback;
  return `${copy.native}: ${formatRegistrarPrice(value, currency, language)} · ${copy.daily}: ${rate.date} (ECB via Frankfurter). ${copy.checkout}`;
}

export function getRegistrarOfferTerms(offer: RegistrarOffer, language: RegistrarDisplayLanguage = "en"): string {
  const copy = {
    en: { standard: "Published extension price; confirm the exact domain price at checkout.", included: "Tax included.", excluded: "Tax excluded.", unknown: "Tax treatment unspecified; taxes and fees may apply." },
    sv: { standard: "Publicerat pris för ändelsen; bekräfta priset för den exakta domänen i kassan.", included: "Inklusive skatt.", excluded: "Exklusive skatt.", unknown: "Skattehantering ej angiven; skatt och avgifter kan tillkomma." },
    es: { standard: "Precio publicado de la extensión; confirma el precio del dominio exacto al pagar.", included: "Impuestos incluidos.", excluded: "Impuestos excluidos.", unknown: "Tratamiento fiscal no especificado; pueden aplicarse impuestos y cargos." },
    fr: { standard: "Prix publié de l’extension ; confirmez le prix du domaine exact au paiement.", included: "Taxes incluses.", excluded: "Taxes exclues.", unknown: "Traitement fiscal non précisé ; taxes et frais possibles." },
    zh: { standard: "后缀公开价格；具体域名价格请在结账时确认。", included: "含税。", excluded: "未含税。", unknown: "税费处理未说明，可能另有税费。" },
  }[language];
  const standard = offer.priceScope === "standard_tld" || (offer.priceScope !== "exact_domain_offer" && offer.dataSource === "loopia_public_price_list");
  const tax = getRegistrationPrice(offer)?.taxTreatment ?? "unknown";
  return `${standard ? `${copy.standard} ` : ""}${copy[tax]}`;
}

export function formatRegistrarPriceTimestamp(checkedAt: string, language: RegistrarDisplayLanguage = "en"): string {
  const date = new Date(checkedAt);
  if (Number.isNaN(date.getTime())) {
    if (language === "sv") return "okänd tid";
    if (language === "es") return "hora desconocida";
    if (language === "fr") return "heure inconnue";
    if (language === "zh") return "时间未知";
    return "unknown time";
  }
  return new Intl.DateTimeFormat(getPriceLocale(language), {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
