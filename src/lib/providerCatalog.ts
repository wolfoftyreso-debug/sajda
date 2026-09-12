import type { RegistrarOffer } from "@/lib/registrarOffer";

/**
 * Public providers exposed in the comparison UI. These IDs deliberately match
 * the API contract, while the catalog supplies an honest link-only fallback
 * until a provider has a verified live-price integration.
 */
export const PROVIDER_IDS = [
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
] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

export interface ProviderCatalogEntry {
  id: ProviderId;
  name: string;
  /** Published provider brand asset, rendered as the visible logo when available. */
  logoUrl?: string;
  logoWide?: boolean;
  logoSurface?: "light" | "dark";
  /** Shown only if a provider's published asset cannot be reached. */
  logoMonogram: string;
  logoFallbackColor: string;
  purchaseUrl: (domain: string) => string;
  priceSourceUrl: string;
  livePriceConnected: boolean;
}

/** Compare every supported seller by default; users can narrow this before search. */
export const DEFAULT_PROVIDER_IDS: ProviderId[] = [...PROVIDER_IDS];

export const PROVIDER_CATALOG: readonly ProviderCatalogEntry[] = [
  {
    id: "loopia",
    name: "Loopia",
    logoUrl: "https://www.loopia.se/assets/images/logos/logo-loopia.svg",
    logoWide: true,
    logoMonogram: "L",
    logoFallbackColor: "#1769aa",
    purchaseUrl: () => "https://www.loopia.se/domannamn/",
    priceSourceUrl: "https://www.loopia.se/domannamn/detaljerad_prislista/",
    livePriceConnected: true,
  },
  {
    id: "cloudflare",
    name: "Cloudflare Registrar",
    logoUrl: "https://www.cloudflare.com/logo.svg",
    logoWide: true,
    logoMonogram: "CF",
    logoFallbackColor: "#f48120",
    purchaseUrl: (domain) => `https://domains.cloudflare.com/?domain=${encodeURIComponent(domain)}`,
    priceSourceUrl: "https://domains.cloudflare.com/",
    livePriceConnected: false,
  },
  {
    id: "godaddy",
    name: "GoDaddy",
    logoUrl: "https://img1.wsimg.com/cdnassets/asset/ac0166de-e319-43a2-a506-36cf106e930d/gd-logo-white.svg",
    logoWide: true,
    logoSurface: "dark",
    logoMonogram: "GD",
    logoFallbackColor: "#00a4a6",
    purchaseUrl: () => "https://www.godaddy.com/domains",
    priceSourceUrl: "https://www.godaddy.com/domains",
    livePriceConnected: false,
  },
  {
    id: "namecheap",
    name: "Namecheap",
    logoUrl: "https://files.namecheap.com/cdn/1157/assets/img/logos/namecheap.svg",
    logoWide: true,
    logoMonogram: "NC",
    logoFallbackColor: "#de3723",
    purchaseUrl: () => "https://www.namecheap.com/domains/domain-name-search/",
    priceSourceUrl: "https://www.namecheap.com/domains/domain-name-search/",
    livePriceConnected: false,
  },
  {
    id: "porkbun",
    name: "Porkbun",
    logoUrl: "https://porkbun.com/images/porkbun.comphpPkl2eU.svg",
    logoMonogram: "PB",
    logoFallbackColor: "#ea5b33",
    purchaseUrl: () => "https://porkbun.com/products/domains",
    priceSourceUrl: "https://porkbun.com/products/domains",
    livePriceConnected: false,
  },
  {
    id: "dynadot",
    name: "Dynadot",
    logoUrl: "https://www.dynadot.com/web-static/favicon.svg",
    logoMonogram: "DD",
    logoFallbackColor: "#245ea8",
    purchaseUrl: () => "https://www.dynadot.com/domain/search",
    priceSourceUrl: "https://www.dynadot.com/domain/search",
    livePriceConnected: false,
  },
  {
    id: "route53",
    name: "AWS Route 53",
    logoUrl: "https://aws.amazon.com/favicon.ico",
    logoMonogram: "53",
    logoFallbackColor: "#232f3e",
    purchaseUrl: () => "https://aws.amazon.com/route53/",
    priceSourceUrl: "https://aws.amazon.com/route53/pricing/",
    livePriceConnected: false,
  },
  {
    id: "onecom",
    name: "one.com",
    logoUrl: "https://www.one.com/favicon.ico",
    logoMonogram: "one",
    logoFallbackColor: "#0b4ea2",
    purchaseUrl: () => "https://www.one.com/en/domain",
    priceSourceUrl: "https://www.one.com/en/domain",
    livePriceConnected: false,
  },
  {
    id: "ionos",
    name: "IONOS",
    logoUrl: "https://cdn.simpleicons.org/ionos/003D8F",
    logoMonogram: "IO",
    logoFallbackColor: "#003d8f",
    purchaseUrl: () => "https://www.ionos.com/domains",
    priceSourceUrl: "https://www.ionos.com/domains",
    livePriceConnected: false,
  },
  {
    id: "ovhcloud",
    name: "OVHcloud",
    logoUrl: "https://cdn.simpleicons.org/ovh/123F6D",
    logoMonogram: "OVH",
    logoFallbackColor: "#123f6d",
    purchaseUrl: () => "https://www.ovhcloud.com/en/domains/",
    priceSourceUrl: "https://www.ovhcloud.com/en/domains/",
    livePriceConnected: false,
  },
  {
    id: "squarespace",
    name: "Squarespace",
    logoUrl: "https://cdn.simpleicons.org/squarespace/000000",
    logoMonogram: "SS",
    logoFallbackColor: "#242424",
    purchaseUrl: () => "https://www.squarespace.com/domains",
    priceSourceUrl: "https://www.squarespace.com/domains",
    livePriceConnected: false,
  },
  {
    id: "hostinger",
    name: "Hostinger",
    logoUrl: "https://cdn.simpleicons.org/hostinger/673DE6",
    logoMonogram: "H",
    logoFallbackColor: "#673de6",
    purchaseUrl: () => "https://www.hostinger.com/domain-name-search",
    priceSourceUrl: "https://www.hostinger.com/domain-name-search",
    livePriceConnected: false,
  },
  {
    id: "gandi",
    name: "Gandi",
    logoUrl: "https://cdn.simpleicons.org/gandi/522A86",
    logoMonogram: "G",
    logoFallbackColor: "#522a86",
    purchaseUrl: () => "https://www.gandi.net/en/domain",
    priceSourceUrl: "https://www.gandi.net/en/domain",
    livePriceConnected: false,
  },
  {
    id: "hover",
    name: "Hover",
    logoUrl: "https://www.hover.com/packs/static/src/application/images/common/hv-logo-2020-4a136057f777be722f4f.svg",
    logoWide: true,
    logoSurface: "dark",
    logoMonogram: "HO",
    logoFallbackColor: "#1d5fad",
    purchaseUrl: () => "https://www.hover.com/domains",
    priceSourceUrl: "https://www.hover.com/domains",
    livePriceConnected: false,
  },
  {
    id: "spaceship",
    name: "Spaceship",
    // Spaceship's official mark is white, so render the compact publisher
    // asset on the dark logo surface rather than disappearing on white.
    logoUrl: "https://forsale.spaceship-cdn.com/static/latest/3.latest/assets/fonts/spaceship-logo-small.svg",
    logoSurface: "dark",
    logoMonogram: "S",
    logoFallbackColor: "#1f2b6c",
    purchaseUrl: () => "https://www.spaceship.com/domains/",
    priceSourceUrl: "https://www.spaceship.com/domains/",
    livePriceConnected: false,
  },
  {
    id: "namecom",
    name: "Name.com",
    logoUrl: "https://www.name.com/_nuxt/name_logo.4-FjecQ7.svg",
    logoWide: true,
    logoMonogram: "N",
    logoFallbackColor: "#1d3557",
    purchaseUrl: () => "https://www.name.com/domains",
    priceSourceUrl: "https://www.name.com/domains",
    livePriceConnected: false,
  },
  {
    id: "namesilo",
    name: "NameSilo",
    // Bundle the original vendor mark on web and native; no hotlink dependency.
    logoUrl: new URL("../assets/providers/namesilo.svg", import.meta.url).href,
    logoMonogram: "NS",
    logoFallbackColor: "#1a6b8c",
    purchaseUrl: () => "https://www.namesilo.com/domain/search-domains",
    priceSourceUrl: "https://www.namesilo.com/domain/search-domains",
    livePriceConnected: false,
  },
  {
    id: "alibabacloud",
    name: "Alibaba Cloud",
    logoUrl: "https://img.alicdn.com/imgextra/i3/O1CN01QHyAQf21EWrmcM8vI_!!6000000006953-55-tps-184-22.svg",
    logoWide: true,
    logoMonogram: "AC",
    logoFallbackColor: "#ff6a00",
    purchaseUrl: () => "https://www.alibabacloud.com/domain",
    priceSourceUrl: "https://www.alibabacloud.com/domain",
    livePriceConnected: false,
  },
  {
    id: "internetbs",
    name: "InternetBS",
    // Official wordmark used by InternetBS's public support centre.
    logoUrl: "https://faq.internetbs.net/hc/theming_assets/01HZKQZF4DVTSEGDQT3SKR6K05",
    logoWide: true,
    logoSurface: "dark",
    logoMonogram: "IB",
    logoFallbackColor: "#215b8e",
    purchaseUrl: () => "https://internetbs.net/en/domain-name-registration",
    priceSourceUrl: "https://internetbs.net/en/domain-name-registration",
    livePriceConnected: false,
  },
  {
    id: "wix",
    name: "Wix Domains",
    logoUrl: "https://static.wixstatic.com/media/343a2a_0642f8d08bd141209aeed927ed8cdcc6~mv2.png/v1/fill/w_549,h_536,al_c,q_85,enc_auto/wix-3d-logo.png",
    logoMonogram: "W",
    logoFallbackColor: "#0c0c0c",
    purchaseUrl: () => "https://www.wix.com/domains",
    priceSourceUrl: "https://www.wix.com/domains",
    livePriceConnected: false,
  },
] as const;

export function isProviderId(value: string): value is ProviderId {
  return (PROVIDER_IDS as readonly string[]).includes(value);
}

export function normaliseProviderIds(providerIds: readonly string[]): ProviderId[] {
  const unique = new Set<ProviderId>();
  for (const providerId of providerIds) {
    const normalised = providerId.trim().toLowerCase();
    if (isProviderId(normalised)) unique.add(normalised);
  }
  return PROVIDER_IDS.filter((providerId) => unique.has(providerId));
}

export function getProviderCatalogEntry(providerId: string | undefined): ProviderCatalogEntry | undefined {
  return PROVIDER_CATALOG.find((provider) => provider.id === providerId);
}

export function getProviderIdForOffer(offer: RegistrarOffer): ProviderId | undefined {
  if (offer.providerId && isProviderId(offer.providerId)) return offer.providerId;

  const registrar = offer.registrar.trim().toLowerCase();
  return PROVIDER_CATALOG.find((provider) => provider.name.toLowerCase() === registrar)?.id;
}

/**
 * Link-only offers deliberately have no number and no verified state. This is
 * what lets the UI list every selected sales page without implying we fetched
 * a live price from each provider.
 */
export function createProviderFallbackOffer(domain: string, providerId: ProviderId): RegistrarOffer {
  const provider = getProviderCatalogEntry(providerId);
  if (!provider) throw new Error(`Unknown provider: ${providerId}`);

  return {
    providerId,
    registrar: provider.name,
    purchaseUrl: provider.purchaseUrl(domain),
    priceSourceUrl: provider.priceSourceUrl,
    currency: "SEK",
    priceStatus: "not_connected",
    dataSource: "provider_search_page",
    connectorState: "official_api_not_configured",
    priceVerified: false,
  };
}

/**
 * Gives every provider selected for a search one comparison row. Backend
 * offers win whenever they exist; catalog fallbacks only provide a safe link.
 */
export function getComparisonProviderOffers(
  domain: string,
  selectedProviderIds: readonly string[] | undefined,
  providerOffers: readonly RegistrarOffer[] | undefined,
  primaryOffer: RegistrarOffer,
): RegistrarOffer[] {
  const selected = normaliseProviderIds(selectedProviderIds?.length ? selectedProviderIds : [getProviderIdForOffer(primaryOffer) ?? "loopia"]);
  const offersByProvider = new Map<ProviderId, RegistrarOffer>();

  for (const rawOffer of [...(providerOffers ?? []), primaryOffer]) {
    const providerId = getProviderIdForOffer(rawOffer);
    if (providerId && !offersByProvider.has(providerId)) {
      offersByProvider.set(providerId, { ...rawOffer, providerId });
    }
  }

  return selected.map((providerId) => offersByProvider.get(providerId) ?? createProviderFallbackOffer(domain, providerId));
}
