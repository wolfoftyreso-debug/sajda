import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Globe, Heart, Loader2, ExternalLink, ShieldCheck, ShieldAlert, X, ChevronDown } from "lucide-react";
import { useState } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  formatRegistrarOfferAmount,
  formatRegistrarPrice,
  formatRegistrarOfferPrice,
  formatRegistrarPriceTimestamp,
  getDefaultRegistrarOffer,
  getRegistrationPrice,
  getRenewalPrice,
  getRegistrarPriceDisplayState,
  getRegistrarFxDisclosure,
  normaliseRegistrarOffer,
  type RegistrarPrice,
  type RegistrarOffer,
} from "@/lib/registrarOffer";
import {
  getComparisonProviderOffers,
  getProviderCatalogEntry,
  getProviderIdForOffer,
} from "@/lib/providerCatalog";
import { useLanguage } from "@/i18n/LanguageProvider";
import ProviderLogo from "@/components/ProviderLogo";
import { useReferenceFx } from "@/hooks/useReferenceFx";
import { getReferenceUsdRate } from "../../shared/reference-fx";

const providerComparisonCopy = {
  en: {
    title: "Compare providers",
    selectedProviders: "{count} selected providers",
    priceCoverage: "Price information",
    priceCoverageSummary: "{published} published · {checked} checked · {links} checkout links",
    allSelectedProviders: "All selected providers",
    allSelectedProvidersDescription: "All selected providers appear below. Prices are shown only when an up-to-date, verified source provides them.",
    valueToPrice: "Value / price",
    valueToPriceDefinition: "A screening signal divided by a comparable, verified acquisition price.",
    notComparable: "Not comparable",
    notComparableDescription: "A screening signal is not a market valuation, so Sajda does not divide it by a provider's published TLD price.",
    liveDomainOffer: "Live domain offer",
    publishedStandardPrice: "Published standard price",
    providerPrice: "Provider price",
    source: "Source",
    availabilityNote: "Availability is checked separately from provider prices.",
    noVerifiedPrice: "No verified price",
    noCurrentQuote: "No current quote",
    noPublishedPrice: "Published price not available",
    sourceChecked: "Source checked",
    sourceCheckedNoQuote: "The source was checked, but it did not return a verified price.",
    directPurchaseLink: "Direct purchase link",
    directLinkDescription: "This is a provider link only. Sajda has not retrieved a price from this seller.",
    credentialsPending: "Price connection not ready",
    credentialsPendingDescription: "The official API is configured, but its price integration has not been activated.",
    priceRefreshNeeded: "Price refresh needed",
    priceRefreshDescription: "The previously retrieved price is no longer current.",
    liveDomainOffers: "Domain offers",
    publishedStandardPrices: "Standard prices",
    checked: "Checked",
    directLinks: "Direct links",
    sellerLinks: "Direct seller links",
    sellerLinksDescription: "These providers remain selected. Until pricing is connected, you can check their prices through the purchase links.",
    showSellerLinks: "Show {count} direct seller links",
    hideSellerLinks: "Hide direct seller links",
    noLivePrices: "No verified provider prices in this comparison.",
    noLivePricesDescription: "The providers below have purchase links, but no verified prices are available.",
    standardPriceDescription: "Published first-year price for this extension, not a quote for this specific domain. Check promotions, tax and renewal pricing at checkout.",
    firstYear: "First year",
    renewal: "Renewal",
    icannFee: "ICANN fee",
    taxesFeesMayApply: "Taxes and fees may apply.",
    tldesPriceFeed: "TLD-ES price feed",
    hourlyFeedUpdated: "Hourly feed updated {time}",
    openProvider: "Visit provider",
    openProviderToCheck: "Check price with provider",
    verifiedAt: "Verified {time}",
  },
  sv: {
    title: "Jämför leverantörer",
    selectedProviders: "{count} valda leverantörer",
    priceCoverage: "Prisöversikt",
    priceCoverageSummary: "{published} publicerade · {checked} kontrollerade · {links} köplänkar",
    allSelectedProviders: "Alla valda leverantörer",
    allSelectedProvidersDescription: "Alla valda leverantörer visas nedan. Priser visas bara när de kommer från en aktuell, verifierad källa.",
    valueToPrice: "Värde/pris-kvot",
    valueToPriceDefinition: "Namnsignal delad med ett jämförbart, verifierat inköpspris.",
    notComparable: "Inte jämförbart",
    notComparableDescription: "Namnsignalen är inte ett marknadsvärde och delas därför inte med leverantörens standardpris för ändelsen.",
    liveDomainOffer: "Aktuell domänoffert",
    publishedStandardPrice: "Publicerat standardpris",
    providerPrice: "Leverantörspris",
    source: "Källa",
    availabilityNote: "Tillgänglighet kontrolleras separat från leverantörernas priser.",
    noVerifiedPrice: "Inget verifierat pris",
    noCurrentQuote: "Ingen aktuell offert",
    noPublishedPrice: "Publicerat pris saknas",
    sourceChecked: "Källa kontrollerad",
    sourceCheckedNoQuote: "Källan har kontrollerats, men gav inget verifierat pris.",
    directPurchaseLink: "Direkt köplänk",
    directLinkDescription: "Detta är endast en leverantörslänk. Sajda har inte hämtat något pris från säljaren.",
    credentialsPending: "Prisuppgifter ännu inte anslutna",
    credentialsPendingDescription: "Det officiella API:et är konfigurerat, men prisanslutningen har inte aktiverats.",
    priceRefreshNeeded: "Priset behöver uppdateras",
    priceRefreshDescription: "Det tidigare hämtade priset är inte längre aktuellt.",
    liveDomainOffers: "Domänerbjudanden",
    publishedStandardPrices: "Standardpriser",
    checked: "Kontrollerad",
    directLinks: "Direktlänkar",
    sellerLinks: "Direkta säljarlänkar",
    sellerLinksDescription: "Leverantörerna är fortfarande valda. Tills priserna är anslutna kan du kontrollera dem via köplänkarna.",
    showSellerLinks: "Visa {count} direkta säljarlänkar",
    hideSellerLinks: "Dölj direkta säljarlänkar",
    noLivePrices: "Inga verifierade leverantörspriser i denna jämförelse.",
    noLivePricesDescription: "Leverantörerna nedan har köplänkar, men verifierade priser saknas.",
    standardPriceDescription: "Publicerat pris för ändelsens första år, inte en offert för just den här domänen. Kontrollera kampanjer, moms och förnyelsepris i kassan.",
    firstYear: "Första året",
    renewal: "Förnyelse",
    icannFee: "ICANN-avgift",
    taxesFeesMayApply: "Skatter och avgifter kan tillkomma.",
    tldesPriceFeed: "TLD-ES prisflöde",
    hourlyFeedUpdated: "Prisflöde med timvis uppdatering. Senast uppdaterat {time}",
    openProvider: "Besök leverantören",
    openProviderToCheck: "Kontrollera pris hos leverantören",
    verifiedAt: "Verifierat {time}",
  },
  es: {
    title: "Comparar proveedores",
    selectedProviders: "{count} proveedores seleccionados",
    priceCoverage: "Información de precios",
    priceCoverageSummary: "{published} publicados · {checked} comprobados · {links} enlaces de compra",
    allSelectedProviders: "Todos los proveedores seleccionados",
    allSelectedProvidersDescription: "Todos los proveedores seleccionados aparecen abajo. Solo se muestran precios procedentes de una fuente actualizada y verificada.",
    valueToPrice: "Valor / precio",
    valueToPriceDefinition: "Una señal de evaluación dividida por un precio de adquisición comparable y verificado.",
    notComparable: "No comparable",
    notComparableDescription: "La señal de evaluación no es una valoración de mercado, por lo que Sajda no la divide por el precio publicado de la extensión.",
    liveDomainOffer: "Oferta actual del dominio",
    publishedStandardPrice: "Precio estándar publicado",
    providerPrice: "Precio del proveedor",
    source: "Fuente",
    availabilityNote: "La disponibilidad se comprueba por separado de los precios de los proveedores.",
    noVerifiedPrice: "Sin precio verificado",
    noCurrentQuote: "Sin oferta actual",
    noPublishedPrice: "Precio publicado no disponible",
    sourceChecked: "Fuente comprobada",
    sourceCheckedNoQuote: "La fuente se comprobó, pero no devolvió un precio verificado.",
    directPurchaseLink: "Enlace de compra directo",
    directLinkDescription: "Es solo un enlace al proveedor. Sajda no ha recuperado un precio de este vendedor.",
    credentialsPending: "Conexión de precios pendiente",
    credentialsPendingDescription: "La API oficial está configurada, pero la integración de precios aún no se ha activado.",
    priceRefreshNeeded: "Hay que actualizar el precio",
    priceRefreshDescription: "El precio obtenido anteriormente ya no está actualizado.",
    liveDomainOffers: "Ofertas de dominio",
    publishedStandardPrices: "Precios estándar",
    checked: "Comprobado",
    directLinks: "Enlaces directos",
    sellerLinks: "Enlaces directos de vendedores",
    sellerLinksDescription: "Estos proveedores siguen seleccionados. Hasta que se conecten los precios, puedes consultarlos mediante los enlaces de compra.",
    showSellerLinks: "Mostrar {count} enlaces directos",
    hideSellerLinks: "Ocultar enlaces directos",
    noLivePrices: "No hay precios de proveedores verificados en esta comparación.",
    noLivePricesDescription: "Los proveedores de abajo tienen enlaces de compra, pero no hay precios verificados disponibles.",
    standardPriceDescription: "Precio publicado del primer año para esta extensión; no es una oferta para el dominio exacto. Comprueba promociones, impuestos y renovación al pagar.",
    firstYear: "Primer año",
    renewal: "Renovación",
    icannFee: "Tasa ICANN",
    taxesFeesMayApply: "Pueden aplicarse impuestos y cargos.",
    tldesPriceFeed: "Fuente de precios TLD-ES",
    hourlyFeedUpdated: "Fuente con actualización cada hora. Última actualización: {time}",
    openProvider: "Visitar proveedor",
    openProviderToCheck: "Comprobar precio con el proveedor",
    verifiedAt: "Verificado a las {time}",
  },
  fr: {
    title: "Comparer les fournisseurs",
    selectedProviders: "{count} fournisseurs sélectionnés",
    priceCoverage: "Informations sur les prix",
    priceCoverageSummary: "{published} publiés · {checked} vérifiés · {links} liens d’achat",
    allSelectedProviders: "Tous les fournisseurs sélectionnés",
    allSelectedProvidersDescription: "Tous les fournisseurs sélectionnés figurent ci-dessous. Les prix ne sont affichés que s’ils proviennent d’une source à jour et vérifiée.",
    valueToPrice: "Valeur / prix",
    valueToPriceDefinition: "Un signal de filtrage divisé par un prix d’acquisition comparable et vérifié.",
    notComparable: "Non comparable",
    notComparableDescription: "Le signal d’évaluation n’est pas une valeur de marché. Sajda ne le divise donc pas par le prix publié pour l’extension.",
    liveDomainOffer: "Offre actuelle pour le domaine",
    publishedStandardPrice: "Prix standard publié",
    providerPrice: "Prix du fournisseur",
    source: "Source",
    availabilityNote: "La disponibilité est vérifiée séparément des prix des fournisseurs.",
    noVerifiedPrice: "Aucun prix vérifié",
    noCurrentQuote: "Aucun devis actuel",
    noPublishedPrice: "Prix publié indisponible",
    sourceChecked: "Source vérifiée",
    sourceCheckedNoQuote: "La source a été vérifiée, mais n’a renvoyé aucun prix validé.",
    directPurchaseLink: "Lien d’achat direct",
    directLinkDescription: "Il s’agit uniquement d’un lien vers le fournisseur. Sajda n’a pas récupéré de prix auprès de ce vendeur.",
    credentialsPending: "Connexion des prix en attente",
    credentialsPendingDescription: "L’API officielle est configurée, mais l’intégration des prix n’a pas encore été activée.",
    priceRefreshNeeded: "Actualisation du prix requise",
    priceRefreshDescription: "Le prix précédemment récupéré n’est plus à jour.",
    liveDomainOffers: "Offres de domaine",
    publishedStandardPrices: "Prix standard",
    checked: "Vérifié",
    directLinks: "Liens directs",
    sellerLinks: "Liens directs des vendeurs",
    sellerLinksDescription: "Ces fournisseurs restent sélectionnés. En attendant la connexion des prix, consultez leurs tarifs via les liens d’achat.",
    showSellerLinks: "Afficher {count} liens directs",
    hideSellerLinks: "Masquer les liens directs",
    noLivePrices: "Aucun prix fournisseur vérifié dans cette comparaison.",
    noLivePricesDescription: "Les fournisseurs ci-dessous proposent des liens d’achat, mais aucun prix vérifié n’est disponible.",
    standardPriceDescription: "Prix publié pour la première année de cette extension, et non pour ce domaine précis. Vérifiez les promotions, les taxes et le tarif de renouvellement lors du paiement.",
    firstYear: "Première année",
    renewal: "Renouvellement",
    icannFee: "Frais ICANN",
    taxesFeesMayApply: "Taxes et frais peuvent s’ajouter.",
    tldesPriceFeed: "Flux de prix TLD-ES",
    hourlyFeedUpdated: "Flux actualisé chaque heure. Dernière mise à jour : {time}",
    openProvider: "Consulter le fournisseur",
    openProviderToCheck: "Vérifier le prix auprès du fournisseur",
    verifiedAt: "Vérifié à {time}",
  },
  zh: {
    title: "比较服务商",
    selectedProviders: "已选 {count} 个服务商",
    priceCoverage: "价格信息",
    priceCoverageSummary: "{published} 个已发布 · {checked} 个已检查 · {links} 个购买链接",
    allSelectedProviders: "所有已选服务商",
    allSelectedProvidersDescription: "下方列出所有已选服务商。只有来源已核验且仍为最新的价格才会显示。",
    valueToPrice: "价值 / 价格",
    valueToPriceDefinition: "筛选信号除以可比较、已核验的购入价格。",
    notComparable: "不可比较",
    notComparableDescription: "筛选信号不是市场估值，因此 Sajda 不会把它除以服务商公布的后缀价格。",
    liveDomainOffer: "实时域名报价",
    publishedStandardPrice: "已发布的标准价格",
    providerPrice: "服务商价格",
    source: "来源",
    availabilityNote: "域名可用性与服务商价格会分别核验。",
    noVerifiedPrice: "暂无已核验价格",
    noCurrentQuote: "暂无当前报价",
    noPublishedPrice: "暂无公开价格",
    sourceChecked: "已检查来源",
    sourceCheckedNoQuote: "已检查该来源，但没有返回已核验价格。",
    directPurchaseLink: "直接购买链接",
    directLinkDescription: "这只是服务商链接。Sajda 尚未从该卖家获取价格。",
    credentialsPending: "价格连接尚未就绪",
    credentialsPendingDescription: "官方 API 已配置，但价格集成尚未启用。",
    priceRefreshNeeded: "需要刷新价格",
    priceRefreshDescription: "此前获取的价格已不再是最新价格。",
    liveDomainOffers: "域名报价",
    publishedStandardPrices: "标准价格",
    checked: "已检查",
    directLinks: "直接链接",
    sellerLinks: "服务商直达链接",
    sellerLinksDescription: "这些服务商仍处于选中状态，但在连接实时价格源之前仅提供购买链接。",
    showSellerLinks: "显示 {count} 个服务商直达链接",
    hideSellerLinks: "隐藏服务商直达链接",
    noLivePrices: "此比较中没有已核验的服务商价格。",
    noLivePricesDescription: "下方服务商提供购买链接，但暂无已核验价格。",
    standardPriceDescription: "这是该后缀公开的首年标准价，并非该具体域名的报价。请在结账时确认促销、税费和续费价格。",
    firstYear: "首年",
    renewal: "续费",
    icannFee: "ICANN 费用",
    taxesFeesMayApply: "可能另有税费。",
    tldesPriceFeed: "TLD-ES 价格源",
    hourlyFeedUpdated: "价格源每小时更新。上次更新：{time}",
    openProvider: "前往服务商网站",
    openProviderToCheck: "到服务商处查看价格",
    verifiedAt: "已于 {time} 核验",
  },
} as const;

type ProviderComparisonLanguage = keyof typeof providerComparisonCopy;

function getProviderComparisonCopy(language: string) {
  return providerComparisonCopy[language as ProviderComparisonLanguage] ?? providerComparisonCopy.en;
}

function withValue(template: string, value: string) {
  return template.replace("{time}", value);
}

function withCount(template: string, count: number) {
  return template.replace("{count}", String(count));
}

type ProviderOfferState = "verified" | "checked" | "adapterPending" | "stale" | "linkOnly";

function isPublishedStandardPrice(offer: RegistrarOffer): boolean {
  return offer.priceScope === "standard_tld"
    || (offer.priceScope !== "exact_domain_offer" && offer.dataSource === "loopia_public_price_list");
}

function getProviderOfferState(
  offer: RegistrarOffer,
  hasPublishedPriceSource = false,
): ProviderOfferState {
  const displayState = getRegistrarPriceDisplayState(offer);
  if (displayState === "verified") return "verified";
  if (displayState === "stale") return "stale";
  if (offer.connectorState === "official_api_credentials_configured") return "adapterPending";
  if (
    offer.priceStatus === "unavailable"
    || offer.connectorState === "public_source_active"
    || offer.connectorState === "aggregated_price_feed_configured"
    || hasPublishedPriceSource
  ) {
    return "checked";
  }
  return "linkOnly";
}

interface DomainCardProps {
  domain: string;
  status: "available" | "checking" | "taken" | "unknown";
  registrarPrice: number;
  estimatedValue: number;
  confidenceScore: number;
  namingScore?: number;
  rationale: string;
  registrarUrl?: string;
  registrarOffer?: RegistrarOffer;
  providerOffers?: RegistrarOffer[];
  selectedProviderIds?: string[];
  checkMethod?: "rdap" | "whois" | "das" | "dns" | "none" | "error";
  availabilityVerified?: boolean;
  isInWatchlist?: boolean;
  onSaveToWatchlist?: () => void;
  onRemoveFromWatchlist?: () => void;
  isSaving?: boolean;
  showWatchlistActions?: boolean;
  isPending?: boolean;
  onDelete?: () => void;
  isDeleting?: boolean;
  showDeleteAction?: boolean;
}


const DomainCard = ({
  domain,
  status,
  confidenceScore,
  namingScore,
  rationale,
  registrarUrl,
  registrarOffer,
  providerOffers,
  selectedProviderIds,
  checkMethod = "rdap",
  availabilityVerified = false,
  isInWatchlist = false,
  onSaveToWatchlist,
  onRemoveFromWatchlist,
  isSaving = false,
  showWatchlistActions = true,
  isPending = false,
  onDelete,
  isDeleting = false,
  showDeleteAction = false,
}: DomainCardProps) => {
  const { language, t } = useLanguage();
  const [isProviderComparisonExpanded, setIsProviderComparisonExpanded] = useState(false);
  const comparisonCopy = getProviderComparisonCopy(language as string);
  const domainQuality = typeof namingScore === "number" && Number.isFinite(namingScore)
    ? Math.min(100, Math.max(0, namingScore))
    : null;
  const offer = normaliseRegistrarOffer(domain, registrarOffer ?? {
    ...getDefaultRegistrarOffer(domain),
    ...(registrarUrl ? { purchaseUrl: registrarUrl } : {}),
  });
  const priceDisplayState = getRegistrarPriceDisplayState(offer);
  const registrationPrice = getRegistrationPrice(offer);
  const hasVerifiedRegistrarPrice = priceDisplayState === "verified" && registrationPrice !== null;
  const renewalPrice = getRenewalPrice(offer);
  const icannFee = hasVerifiedRegistrarPrice
    && typeof offer.icannFee === "number"
    && Number.isFinite(offer.icannFee)
    && offer.icannFee > 0
    ? offer.icannFee
    : null;
  // Screening estimates and provider quotes are deliberately separate. A
  // trustworthy ratio would require an exact, verified offer in the same
  // currency as the estimate, which the public search does not provide.
  // Do not manufacture a "multiple" from unrelated values.
  const hasAuthoritativeAvailability = status === "available"
    && availabilityVerified
    && (checkMethod === "rdap" || checkMethod === "whois" || checkMethod === "das");
  const comparisonOffers = selectedProviderIds?.length
    ? getComparisonProviderOffers(domain, selectedProviderIds, providerOffers, offer)
    : [];
  const primaryProvider = getProviderCatalogEntry(getProviderIdForOffer(offer));
  const primaryOfferState = getProviderOfferState(offer, primaryProvider?.livePriceConnected);
  const comparisonOfferEntries = comparisonOffers.map((rawOffer) => {
    const comparisonOffer = normaliseRegistrarOffer(domain, rawOffer);
    const providerId = getProviderIdForOffer(comparisonOffer);
    const provider = getProviderCatalogEntry(providerId);
    return {
      offer: comparisonOffer,
      providerId,
      provider,
      registrationPrice: getRegistrationPrice(comparisonOffer),
      renewalPrice: getRenewalPrice(comparisonOffer),
      state: getProviderOfferState(comparisonOffer, provider?.livePriceConnected),
    };
  });
  const verifiedProviderCount = comparisonOfferEntries.filter((entry) => entry.state === "verified").length;
  const publishedStandardPriceCount = comparisonOfferEntries.filter(
    (entry) => entry.state === "verified" && isPublishedStandardPrice(entry.offer),
  ).length;
  const liveDomainOfferCount = verifiedProviderCount - publishedStandardPriceCount;
  const checkedProviderCount = comparisonOfferEntries.filter((entry) => entry.state === "checked").length;
  const checkoutProviderCount = comparisonOfferEntries.filter(
    (entry) => entry.state !== "verified" && entry.state !== "checked",
  ).length;
  const providerPriceCoverageSummary = comparisonCopy.priceCoverageSummary
    .replace("{published}", String(publishedStandardPriceCount + liveDomainOfferCount))
    .replace("{checked}", String(checkedProviderCount))
    .replace("{links}", String(checkoutProviderCount));
  const referenceFx = useReferenceFx(
    (hasVerifiedRegistrarPrice && offer.currency !== "USD")
    || comparisonOfferEntries.some((entry) => entry.registrationPrice && entry.offer.currency !== "USD"),
  );
  const formatOfferPrice = (comparisonOffer: RegistrarOffer, price: RegistrarPrice) => (
    <span className="inline-flex min-w-0 flex-col">
      <span>{formatRegistrarOfferPrice(price.amount, comparisonOffer.currency, language, referenceFx)}</span>
      {getReferenceUsdRate(referenceFx, comparisonOffer.currency) && (
        <span className="mt-0.5 text-[11px] font-normal tracking-normal text-muted-foreground">{formatRegistrarPrice(price.amount, comparisonOffer.currency, language)}</span>
      )}
    </span>
  );
  const getTaxTreatmentLabel = (price: RegistrarPrice | null) => {
    if (!price) return "";
    if (price.taxTreatment === "included") return t("domain.inclTax");
    if (price.taxTreatment === "excluded") return t("domain.exclTax");
    return comparisonCopy.taxesFeesMayApply;
  };
  const getPriceFeedMetadata = (comparisonOffer: RegistrarOffer) => {
    if (comparisonOffer.dataSource === "tldes_price_feed") {
      const timestamp = comparisonOffer.checkedAt
        ? withValue(comparisonCopy.hourlyFeedUpdated, formatRegistrarPriceTimestamp(comparisonOffer.checkedAt, language))
        : comparisonCopy.tldesPriceFeed;
      return `${comparisonCopy.source}: ${comparisonCopy.tldesPriceFeed} · ${timestamp}`;
    }

    return comparisonOffer.checkedAt
      ? `${comparisonCopy.source}: ${comparisonOffer.registrar} · ${withValue(comparisonCopy.verifiedAt, formatRegistrarPriceTimestamp(comparisonOffer.checkedAt, language))}`
      : `${comparisonCopy.source}: ${comparisonOffer.registrar}`;
  };
  const getOfferStateLabel = (comparisonOffer: RegistrarOffer, offerState: ProviderOfferState) => {
    switch (offerState) {
      case "verified":
        return isPublishedStandardPrice(comparisonOffer)
          ? comparisonCopy.publishedStandardPrice
          : comparisonCopy.liveDomainOffer;
      case "checked":
        return comparisonCopy.sourceChecked;
      case "adapterPending":
        return comparisonCopy.credentialsPending;
      case "stale":
        return comparisonCopy.priceRefreshNeeded;
      case "linkOnly":
        return comparisonCopy.noPublishedPrice;
    }
  };
  const getOfferStateDescription = (comparisonOffer: RegistrarOffer, offerState: ProviderOfferState) => {
    switch (offerState) {
      case "checked":
        return comparisonOffer.note || comparisonCopy.sourceCheckedNoQuote;
      case "adapterPending":
        return comparisonCopy.credentialsPendingDescription;
      case "stale":
        return comparisonCopy.priceRefreshDescription;
      case "linkOnly":
        return comparisonCopy.directLinkDescription;
      case "verified":
        if (isPublishedStandardPrice(comparisonOffer)) return comparisonCopy.standardPriceDescription;
        return comparisonOffer.checkedAt
          ? withValue(comparisonCopy.verifiedAt, formatRegistrarPriceTimestamp(comparisonOffer.checkedAt, language))
          : comparisonCopy.liveDomainOffer;
    }
  };
  const getOfferStateClassName = (offerState: ProviderOfferState) => {
    switch (offerState) {
      case "verified":
        return "border-success/20 bg-success/10 text-success";
      case "checked":
        return "border-primary/15 bg-primary/10 text-primary";
      case "adapterPending":
      case "stale":
        return "border-warning/20 bg-warning/10 text-warning";
      case "linkOnly":
        return "border-border bg-secondary text-muted-foreground";
    }
  };
  const primaryPriceValue = hasVerifiedRegistrarPrice && registrationPrice
    ? formatOfferPrice(offer, registrationPrice)
    : primaryOfferState === "stale"
      ? comparisonCopy.priceRefreshNeeded
      : comparisonCopy.noCurrentQuote;
  const primaryPriceDescription = hasVerifiedRegistrarPrice && registrationPrice
    ? isPublishedStandardPrice(offer)
      ? `${comparisonCopy.standardPriceDescription} ${getTaxTreatmentLabel(registrationPrice)}`
      : `${getTaxTreatmentLabel(registrationPrice)}${offer.priceType === "campaign" ? ` · ${t("domain.campaign")}` : ""}`
    : getOfferStateDescription(offer, primaryOfferState);
  const hasMultipleProviderOffers = status === "available" && comparisonOffers.length > 1;

  return (
    <article
      className={`group relative overflow-hidden rounded-[1.35rem] border bg-card p-4 shadow-[0_14px_42px_-30px_rgba(15,34,53,0.42)] transition-[border-color,box-shadow,transform] duration-200 sm:p-5 ${
        isPending
          ? "border-dashed border-primary/35 animate-pulse"
          : "border-border/90 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_22px_50px_-30px_rgba(15,34,53,0.38)]"
      }`}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-primary/45 to-transparent opacity-70"
      />
      <div className="relative">
        <header className="mb-4 flex items-start gap-3 sm:gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary/10 bg-primary/[0.06] shadow-sm">
            <Globe className="h-[1.1rem] w-[1.1rem] text-primary" />
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[1.3rem] font-semibold tracking-[-0.045em] text-foreground sm:text-[1.45rem]">{domain}</h3>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge
                variant={hasAuthoritativeAvailability ? "default" : "secondary"}
                className={
                  hasAuthoritativeAvailability
                    ? "border-success/20 bg-success/10 text-success hover:bg-success/15"
                    : status === "available" || status === "unknown"
                      ? "border-warning/20 bg-warning/10 text-warning hover:bg-warning/15"
                      : status === "taken"
                        ? "border-destructive/15 bg-destructive/10 text-destructive hover:bg-destructive/15"
                        : "border-primary/15 bg-primary/[0.07] text-primary hover:bg-primary/10"
                }
              >
                {hasAuthoritativeAvailability
                  ? t("domain.available")
                  : status === "available" || status === "unknown"
                    ? t("domain.availabilityUnverified")
                    : status === "checking"
                      ? t("domain.checking")
                      : t("domain.taken")}
              </Badge>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-[0.08em] ${
                        hasAuthoritativeAvailability
                          ? "border-success/20 bg-success/[0.06] text-success"
                          : checkMethod === "none" || checkMethod === "dns"
                            ? "border-warning/20 bg-warning/[0.06] text-warning"
                            : "border-destructive/20 bg-destructive/[0.06] text-destructive"
                      }`}
                    >
                      {hasAuthoritativeAvailability ? (
                        <ShieldCheck className="h-3 w-3" />
                      ) : (
                        <ShieldAlert className="h-3 w-3" />
                      )}
                      <span className="uppercase">{hasAuthoritativeAvailability ? checkMethod : t("domain.verify")}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs text-xs">
                      {hasAuthoritativeAvailability
                        ? checkMethod === "rdap"
                          ? t("domain.registryRdap")
                          : checkMethod === "whois"
                            ? t("domain.registryWhois")
                            : t("domain.registryDas")
                        : t("domain.needsVerification")}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {showWatchlistActions && (
              <Button
                variant="ghost"
                size="icon"
                className={`h-8 w-8 rounded-full border border-transparent transition-all ${isInWatchlist ? "border-destructive/15 bg-destructive/[0.06] text-destructive hover:bg-destructive/10 hover:text-destructive" : "text-muted-foreground hover:border-primary/15 hover:bg-primary/[0.06] hover:text-primary"}`}
                onClick={isInWatchlist ? onRemoveFromWatchlist : onSaveToWatchlist}
                disabled={isSaving}
                aria-label={isInWatchlist ? t("domain.removeWatchlist", { domain }) : t("domain.save", { domain })}
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Heart className={`h-4 w-4 transition-all ${isInWatchlist ? "fill-current" : ""}`} />
                )}
              </Button>
            )}

            {showDeleteAction && onDelete && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      onClick={onDelete}
                      disabled={isDeleting}
                      aria-label={t("domain.remove", { domain })}
                    >
                      {isDeleting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <X className="h-4 w-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{t("domain.removeTitle")}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </header>

        <section className="mb-3">
          <div className="min-w-0 rounded-2xl border border-primary/12 bg-[linear-gradient(120deg,hsl(var(--primary)/0.07),hsl(var(--card))_62%)] p-3.5">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.11em] text-muted-foreground">
                  <Globe className="h-3 w-3 text-primary" />
                  {hasVerifiedRegistrarPrice ? t("domain.registrationPrice") : getOfferStateLabel(offer, primaryOfferState)}
                </div>
                <div className="mt-1.5 text-[1.3rem] font-semibold tracking-[-0.045em] text-foreground">
                  {primaryPriceValue}
                </div>
              </div>
              <div className="flex min-w-0 items-center gap-2 text-right">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{offer.registrar}</p>
                  <p className="mt-0.5 text-[11px] font-medium text-primary">{getOfferStateLabel(offer, primaryOfferState)}</p>
                </div>
                {primaryProvider && <ProviderLogo provider={primaryProvider} size="sm" />}
              </div>
            </div>

            <p className="mt-2.5 text-xs leading-5 text-muted-foreground">{primaryPriceDescription}</p>
            {registrationPrice && offer.currency !== "USD" && (
              <p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">{getRegistrarFxDisclosure(registrationPrice.amount, offer.currency, language, referenceFx)}</p>
            )}
            {hasVerifiedRegistrarPrice && isPublishedStandardPrice(offer) && (
              <p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">{getPriceFeedMetadata(offer)}</p>
            )}
            {(renewalPrice !== null || icannFee !== null) && (
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 border-t border-primary/10 pt-2 text-[11px] text-muted-foreground">
                {renewalPrice !== null && <span>{comparisonCopy.renewal}: {formatOfferPrice(offer, renewalPrice)}</span>}
                {icannFee !== null && <span>{comparisonCopy.icannFee}: {formatRegistrarOfferAmount(icannFee, offer.currency, language, referenceFx)}{getReferenceUsdRate(referenceFx, offer.currency) && ` (${icannFee} ${offer.currency})`}</span>}
              </div>
            )}
            {hasMultipleProviderOffers && (
              <div className="mt-2.5 border-t border-primary/10 pt-2 text-[11px] leading-4 text-muted-foreground">
                <span className="font-semibold text-foreground">{comparisonCopy.priceCoverage}</span>
                <span className="mx-1.5 text-border">·</span>
                <span>{providerPriceCoverageSummary}</span>
              </div>
            )}
          </div>

        </section>

        <section className="mb-3 rounded-xl border border-border/70 bg-secondary/[0.3] px-3.5 py-3" aria-label={t(domainQuality !== null ? "domain.quality" : "domain.signalConfidence")}>
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-xs font-medium text-muted-foreground">{t(domainQuality !== null ? "domain.quality" : "domain.signalConfidence")}</span>
            <span className="text-xs font-semibold text-foreground">
              {isPending ? "—" : `${domainQuality ?? confidenceScore}/100`}
            </span>
          </div>
          <Progress aria-label={t(domainQuality !== null ? "domain.quality" : "domain.signalConfidence")} value={isPending ? 0 : domainQuality ?? confidenceScore} className={`h-1.5 bg-background ${isPending ? "opacity-50" : ""}`} />
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{t("domain.qualityNote")}</p>
        </section>

        {isPending && (
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-primary/10 bg-primary/[0.05] px-3 py-2.5">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="text-xs text-muted-foreground">{t("domain.waitingForValuation")}</span>
          </div>
        )}

        <p className="mb-4 rounded-xl border border-border/65 bg-muted/[0.42] px-3.5 py-2.5 text-sm leading-relaxed text-muted-foreground">{rationale}</p>

        {hasMultipleProviderOffers && (
          <section className="border-t border-border/70 pt-3.5" aria-label={comparisonCopy.title}>
            <button
              type="button"
              onClick={() => setIsProviderComparisonExpanded((expanded) => !expanded)}
              aria-expanded={isProviderComparisonExpanded}
              className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border/80 bg-secondary/[0.34] px-3.5 py-3 text-left transition-[background-color,border-color,box-shadow] hover:border-primary/25 hover:bg-primary/[0.05] hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground">
                  {withCount(comparisonCopy.selectedProviders, comparisonOffers.length)}
                </span>
                <span className="mt-1 flex flex-wrap gap-x-1.5 gap-y-1 text-[11px] text-muted-foreground">
                  <span className="font-medium text-foreground">{comparisonCopy.priceCoverage}</span>
                  <span className="text-border">·</span>
                  <span>{providerPriceCoverageSummary}</span>
                </span>
              </span>
              <ChevronDown
                aria-hidden="true"
                className={`h-4 w-4 shrink-0 text-primary transition-transform duration-200 ${isProviderComparisonExpanded ? "rotate-180" : ""}`}
              />
            </button>

            {isProviderComparisonExpanded && (
              <div className="mt-2.5 space-y-2.5">
                <div className="rounded-xl border border-primary/12 bg-primary/[0.035] px-3 py-2.5">
                  <p className="text-xs leading-5 text-muted-foreground">{comparisonCopy.allSelectedProvidersDescription}</p>
                  <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{comparisonCopy.availabilityNote}</p>
                </div>

                {verifiedProviderCount === 0 && (
                  <div className="flex items-start gap-2.5 rounded-xl border border-warning/20 bg-warning/[0.06] px-3 py-2.5">
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{comparisonCopy.noLivePrices}</p>
                      <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{comparisonCopy.noLivePricesDescription}</p>
                    </div>
                  </div>
                )}

                <div className="grid gap-2 sm:grid-cols-2">
                  {comparisonOfferEntries.map((entry) => (
                    <article
                      key={entry.providerId ?? entry.offer.registrar}
                      className={`flex min-w-0 flex-col justify-between gap-3 rounded-2xl border p-3 shadow-[0_8px_18px_-18px_rgba(15,34,53,0.48)] transition-[border-color,box-shadow] hover:border-primary/25 hover:shadow-sm ${entry.state === "linkOnly" ? "border-border/70 bg-secondary/[0.22]" : "border-border/80 bg-card"}`}
                    >
                      <div className="flex min-w-0 items-start gap-2.5">
                        {entry.provider && <ProviderLogo provider={entry.provider} size="sm" />}
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="font-semibold text-foreground">{entry.offer.registrar}</p>
                            <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${getOfferStateClassName(entry.state)}`}>
                              {getOfferStateLabel(entry.offer, entry.state)}
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                            {getOfferStateDescription(entry.offer, entry.state)}
                          </p>
                          {entry.state === "verified" && entry.registrationPrice && isPublishedStandardPrice(entry.offer) && (
                            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                              {getPriceFeedMetadata(entry.offer)}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-end justify-between gap-3 border-t border-border/65 pt-2.5">
                        {entry.state === "verified" && entry.registrationPrice ? (
                          <dl className="grid min-w-0 grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                            <div>
                              <dt className="text-muted-foreground">{comparisonCopy.firstYear}</dt>
                              <dd className="mt-0.5 font-semibold text-foreground">
                                {formatOfferPrice(entry.offer, entry.registrationPrice)}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">{comparisonCopy.renewal}</dt>
                              <dd className="mt-0.5 font-semibold text-foreground">
                                {entry.renewalPrice ? formatOfferPrice(entry.offer, entry.renewalPrice) : "—"}
                              </dd>
                            </div>
                            <div className="col-span-2 text-muted-foreground">
                              {getTaxTreatmentLabel(entry.registrationPrice)}
                            </div>
                            {entry.offer.currency !== "USD" && (
                              <div className="col-span-2 text-muted-foreground">{getRegistrarFxDisclosure(entry.registrationPrice.amount, entry.offer.currency, language, referenceFx)}</div>
                            )}
                            {typeof entry.offer.icannFee === "number" && Number.isFinite(entry.offer.icannFee) && entry.offer.icannFee > 0 && (
                              <div className="col-span-2 text-muted-foreground">
                                {comparisonCopy.icannFee}: {formatRegistrarOfferAmount(entry.offer.icannFee, entry.offer.currency, language, referenceFx)}{getReferenceUsdRate(referenceFx, entry.offer.currency) && ` (${entry.offer.icannFee} ${entry.offer.currency})`}
                              </div>
                            )}
                          </dl>
                        ) : (
                          <p className="text-sm font-semibold text-foreground">
                            {entry.state === "linkOnly"
                              ? comparisonCopy.noPublishedPrice
                              : entry.state === "stale"
                                ? comparisonCopy.priceRefreshNeeded
                                : comparisonCopy.noCurrentQuote}
                          </p>
                        )}
                        <a
                          href={entry.offer.purchaseUrl || undefined}
                          aria-disabled={!entry.offer.purchaseUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-1 py-1 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/[0.07] hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                          {entry.state === "verified" ? comparisonCopy.openProvider : comparisonCopy.openProviderToCheck}
                        </a>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </article>
  );
};

export default DomainCard;
