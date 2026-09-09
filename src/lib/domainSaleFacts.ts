import type { Language } from "@/i18n/LanguageProvider";

/**
 * Historical domain-sale records shown in the small Sajda Signal surface.
 *
 * A record is deliberately described as *reported*, rather than verified in
 * the same way as an availability check. Domain transactions are frequently
 * private and a published sale is evidence from its named publisher, not a
 * current ask, a quote, or a valuation for another domain.
 *
 * The browser never fetches third-party sales sources directly. The optional
 * feed normaliser below is the extension point for a server-side importer
 * (for example, a reviewed licensed/open source) to pass through facts that
 * have already been checked, stored and attributed by Sajda.
 */
export interface DomainSaleFact {
  id: string;
  domain: string;
  amountUsd: number;
  /** The transaction date when the source establishes it. */
  saleDate?: string;
  /** The date the publisher reported or confirmed the amount. */
  reportedAt: string;
  /** Only reviewed evidence levels may reach the client signal surface. */
  verificationLevel: "primary_public_filing" | "broker_press_release";
  source: {
    label: string;
    url: string;
  };
}

export interface DomainSaleFactPresentation {
  id: string;
  category: string;
  badge: string;
  title: string;
  body: string;
  sourceLabel: string;
  sourceUrl: string;
}

/**
 * A source-approved TLD-level historic summary. It is intentionally separate
 * from a domain sale: the UI must never turn this aggregate into a listing,
 * valuation, or claimed individual transaction.
 */
export interface TldMarketAggregateFact {
  id: string;
  tld: string;
  period: "1y";
  currency: "USD";
  reportedAt: string;
  lastCheckedAt: string;
  verificationLevel: "approved_source_snapshot";
  metrics: {
    saleCount: number;
    priceSumUsd: number;
    averagePriceUsd: number;
    highestPriceUsd: number;
    priceStddevUsd: number;
  };
  source: {
    label: string;
    url: string;
  };
  caveat: string;
}

export interface TldMarketAggregatePresentation {
  id: string;
  category: string;
  badge: string;
  title: string;
  body: string;
  sourceLabel: string;
  sourceUrl: string;
}

export interface DomainMarketFactFeed {
  sales: readonly DomainSaleFact[];
  aggregates: readonly TldMarketAggregateFact[];
}

type DomainSaleFactInput = Partial<{
  id: unknown;
  type: unknown;
  dataStatus: unknown;
  assetScope: unknown;
  sourceType: unknown;
  domain: unknown;
  amountUsd: unknown;
  amount: unknown;
  price: unknown;
  currency: unknown;
  saleDate: unknown;
  date: unknown;
  reportedAt: unknown;
  verificationLevel: unknown;
  source: unknown;
  sourceLabel: unknown;
  sourceUrl: unknown;
}>;

type TldMarketAggregateInput = Partial<{
  id: unknown;
  type: unknown;
  dataStatus: unknown;
  verificationLevel: unknown;
  assetScope: unknown;
  sourceType: unknown;
  tld: unknown;
  period: unknown;
  currency: unknown;
  reportedAt: unknown;
  lastCheckedAt: unknown;
  metrics: unknown;
  source: unknown;
  caveat: unknown;
}>;

const MAX_SERVER_FACTS = 30;
const DOMAIN_PATTERN = /^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const FACT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,95}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const TLD_PATTERN = /^\.[a-z]{2,12}$/i;
const MAX_SERVER_AGGREGATES = 3;

/**
 * Small, source-linked historical starter set. These mirror the reviewed
 * primary/broker records returned by Sajda's own fact endpoint, so the
 * interface stays useful when offline without quietly changing the evidence
 * bar in the browser.
 */
export const CURATED_DOMAIN_SALE_FACTS: readonly DomainSaleFact[] = [
  {
    id: "reported-sale-voice-com-2019",
    domain: "voice.com",
    amountUsd: 30_000_000,
    saleDate: "2019-05-30",
    reportedAt: "2019-06-18",
    verificationLevel: "primary_public_filing",
    source: {
      label: "U.S. SEC filing — MicroStrategy Voice.com sale",
      url: "https://www.sec.gov/Archives/edgar/data/1050446/000119312519175320/d724928dex991.htm",
    },
  },
  {
    id: "reported-sale-sex-com-2010",
    domain: "sex.com",
    amountUsd: 13_000_000,
    reportedAt: "2010-11-18",
    verificationLevel: "broker_press_release",
    source: {
      label: "Sedo press release — Sex.com sale",
      url: "https://sedo.com/es/sobre-sedo/sala-de-prensa/sala-de-prensa/sedo-confirms-sale-of-sexcom-for-record-13-million/",
    },
  },
];

const copy: Record<Language, {
  category: string;
  badge: (verificationLevel: DomainSaleFact["verificationLevel"]) => string;
  reported: (date: string, source: string) => string;
  sold: (date: string) => string;
  note: readonly string[];
  source: (source: string) => string;
}> = {
  en: {
    category: "Reported domain sale",
    badge: (level) => level === "primary_public_filing" ? "PRIMARY SOURCE" : "BROKER SOURCE",
    reported: (date, source) => `Reported ${date} by ${source}.`,
    sold: (date) => `The source dates the transaction to ${date}.`,
    note: [
      "A historical record, not a current asking price or a valuation for another domain.",
      "Useful context, not a shortcut to pricing a different name.",
    ],
    source: (source) => `Read ${source}`,
  },
  sv: {
    category: "Rapporterad domänförsäljning",
    badge: (level) => level === "primary_public_filing" ? "PRIMÄRKÄLLA" : "MÄKLARKÄLLA",
    reported: (date, source) => `Rapporterad ${date} av ${source}.`,
    sold: (date) => `Källan daterar transaktionen till ${date}.`,
    note: [
      "Ett historiskt rekord, inte ett aktuellt utropspris eller en värdering av en annan domän.",
      "Bra kontext, men ingen genväg till att prissätta ett annat namn.",
    ],
    source: (source) => `Läs ${source}`,
  },
  es: {
    category: "Venta de dominio reportada",
    badge: (level) => level === "primary_public_filing" ? "FUENTE PRIMARIA" : "FUENTE DEL BRÓKER",
    reported: (date, source) => `Reportada el ${date} por ${source}.`,
    sold: (date) => `La fuente fecha la transacción el ${date}.`,
    note: [
      "Un registro histórico, no un precio de venta actual ni una valoración de otro dominio.",
      "Contexto útil, no un atajo para poner precio a otro nombre.",
    ],
    source: (source) => `Leer ${source}`,
  },
  fr: {
    category: "Vente de domaine rapportée",
    badge: (level) => level === "primary_public_filing" ? "SOURCE PRIMAIRE" : "SOURCE DU COURTIER",
    reported: (date, source) => `Rapportée le ${date} par ${source}.`,
    sold: (date) => `La source date la transaction du ${date}.`,
    note: [
      "Un historique, pas un prix demandé actuel ni une estimation d’un autre domaine.",
      "Du contexte utile, pas un raccourci pour fixer le prix d’un autre nom.",
    ],
    source: (source) => `Lire ${source}`,
  },
  zh: {
    category: "已报道的域名交易",
    badge: (level) => level === "primary_public_filing" ? "原始来源" : "经纪来源",
    reported: (date, source) => `${source} 于 ${date} 报道。`,
    sold: (date) => `来源将交易日期记为 ${date}。`,
    note: [
      "这是一条历史记录，不是当前要价，也不是其他域名的估值。",
      "可作参考，但不能直接用来给另一个名称定价。",
    ],
    source: (source) => `查看 ${source}`,
  },
};

const marketPulseCopy: Record<Language, {
  category: string;
  badge: string;
  title: (tld: string, average: string) => string;
  body: (source: string, period: string, count: string, highest: string, checkedAt: string) => string;
  source: (source: string) => string;
}> = {
  en: {
    category: "Market pulse",
    badge: "AGGREGATE DATA",
    title: (tld, average) => `${tld} · ${average} average reported sale`,
    body: (source, period, count, highest, checkedAt) => `${source} ${period} aggregate: ${count} reported sales; highest reported sale ${highest}. Snapshot ${checkedAt}. Historical aggregate only—not an appraisal, offer, availability result, or individual sale.`,
    source: (source) => `Read ${source}`,
  },
  sv: {
    category: "Marknadspuls",
    badge: "AGGREGERAD DATA",
    title: (tld, average) => `${tld} · ${average} i genomsnittlig rapporterad försäljning`,
    body: (source, period, count, highest, checkedAt) => `Aggregat från ${source} för ${period}: ${count} rapporterade försäljningar; högsta rapporterade försäljning ${highest}. Ögonblicksbild ${checkedAt}. Historiskt aggregat, inte en värdering, offert, tillgänglighetskontroll eller individuell försäljning.`,
    source: (source) => `Läs ${source}`,
  },
  es: {
    category: "Pulso del mercado",
    badge: "DATOS AGREGADOS",
    title: (tld, average) => `${tld} · ${average} de venta reportada media`,
    body: (source, period, count, highest, checkedAt) => `Agregado de ${source} para ${period}: ${count} ventas reportadas; mayor venta reportada ${highest}. Instantánea ${checkedAt}. Solo datos históricos agregados: no es una valoración, oferta, resultado de disponibilidad ni venta individual.`,
    source: (source) => `Leer ${source}`,
  },
  fr: {
    category: "Pouls du marché",
    badge: "DONNÉES AGRÉGÉES",
    title: (tld, average) => `${tld} · ${average} de vente rapportée moyenne`,
    body: (source, period, count, highest, checkedAt) => `Agrégat ${source} sur ${period} : ${count} ventes rapportées ; plus haute vente rapportée ${highest}. Instantané ${checkedAt}. Données historiques agrégées uniquement : pas une estimation, une offre, un résultat de disponibilité ou une vente individuelle.`,
    source: (source) => `Lire ${source}`,
  },
  zh: {
    category: "市场脉搏",
    badge: "汇总数据",
    title: (tld, average) => `${tld} · 平均已报道交易 ${average}`,
    body: (source, period, count, highest, checkedAt) => `${source} 的 ${period} 汇总：${count} 笔已报道交易；最高已报道交易 ${highest}。快照时间 ${checkedAt}。仅为历史汇总数据，不是估值、报价、可用性结果或单笔交易。`,
    source: (source) => `查看 ${source}`,
  },
};

const localeForLanguage: Record<Language, string> = {
  en: "en-US",
  sv: "sv-SE",
  es: "es-ES",
  fr: "fr-FR",
  zh: "zh-CN",
};

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isFactDate(value: string | null): value is string {
  if (!value || (!ISO_DATE_PATTERN.test(value) && !ISO_DATETIME_PATTERN.test(value))) return false;
  const date = new Date(ISO_DATE_PATTERN.test(value) ? `${value}T12:00:00.000Z` : value);
  return !Number.isNaN(date.getTime());
}

function isSafeSourceUrl(value: string | null): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function readAmountUsd(input: DomainSaleFactInput): number | null {
  const nestedPrice = input.price && typeof input.price === "object" ? input.price as Record<string, unknown> : null;
  const amount = input.amountUsd ?? input.amount ?? nestedPrice?.amount;
  const currency = input.currency ?? nestedPrice?.currency ?? "USD";
  if (currency !== "USD" || typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0 || amount > 100_000_000) {
    return null;
  }
  return Math.round(amount);
}

function readVerificationLevel(value: unknown): DomainSaleFact["verificationLevel"] | null {
  return value === "primary_public_filing" || value === "broker_press_release" ? value : null;
}

function factItemsFromPayload(payload: unknown): readonly unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const candidate = payload as { facts?: unknown; sales?: unknown };
  const facts = candidate.facts ?? candidate.sales;
  return Array.isArray(facts) ? facts : [];
}

function toFiniteNonNegativeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function readAggregateMetrics(value: unknown): TldMarketAggregateFact["metrics"] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const metrics = value as Record<string, unknown>;
  const saleCount = toFiniteNonNegativeNumber(metrics.saleCount);
  const priceSumUsd = toFiniteNonNegativeNumber(metrics.priceSumUsd);
  const averagePriceUsd = toFiniteNonNegativeNumber(metrics.averagePriceUsd);
  const highestPriceUsd = toFiniteNonNegativeNumber(metrics.highestPriceUsd);
  const priceStddevUsd = toFiniteNonNegativeNumber(metrics.priceStddevUsd);

  if (
    saleCount === null || !Number.isInteger(saleCount) || saleCount > 10_000_000
    || priceSumUsd === null || priceSumUsd > 100_000_000_000
    || averagePriceUsd === null || averagePriceUsd > 100_000_000
    || highestPriceUsd === null || highestPriceUsd > 100_000_000
    || priceStddevUsd === null || priceStddevUsd > 100_000_000
    || saleCount < 1 || priceSumUsd <= 0 || averagePriceUsd <= 0 || highestPriceUsd <= 0
    || priceSumUsd < highestPriceUsd || averagePriceUsd > highestPriceUsd
  ) {
    return null;
  }

  return { saleCount, priceSumUsd, averagePriceUsd, highestPriceUsd, priceStddevUsd };
}

/**
 * Validates a payload that arrived from Sajda's own future server endpoint.
 * Invalid or un-attributed records are deliberately dropped rather than
 * allowed to become a confident-looking message in the interface.
 */
export function normalizeDomainSaleFacts(payload: unknown): readonly DomainSaleFact[] {
  const facts: DomainSaleFact[] = [];
  const ids = new Set<string>();

  for (const item of factItemsFromPayload(payload).slice(0, MAX_SERVER_FACTS)) {
    if (!item || typeof item !== "object") continue;
    const input = item as DomainSaleFactInput;
    const id = asNonEmptyString(input.id)?.toLowerCase();
    const domain = asNonEmptyString(input.domain);
    const amountUsd = readAmountUsd(input);
    const reportedAt = asNonEmptyString(input.reportedAt) ?? asNonEmptyString(input.date);
    const saleDate = asNonEmptyString(input.saleDate);
    const verificationLevel = readVerificationLevel(input.verificationLevel);
    const sourceObject = input.source && typeof input.source === "object" ? input.source as Record<string, unknown> : null;
    const sourceLabel = asNonEmptyString(sourceObject?.label ?? input.sourceLabel);
    const sourceUrl = asNonEmptyString(sourceObject?.url ?? input.sourceUrl);

    if (
      (input.type !== undefined && input.type !== "reported_domain_sale")
      || (input.dataStatus !== undefined && input.dataStatus !== "curated_primary_source")
      || (input.assetScope !== undefined && input.assetScope !== "domain_only" && input.assetScope !== "reported_domain_transaction")
      || (input.sourceType !== undefined && input.sourceType !== "regulatory_filing" && input.sourceType !== "broker_press_release")
      || !id || !FACT_ID_PATTERN.test(id) || ids.has(id) || !domain || !DOMAIN_PATTERN.test(domain)
      || amountUsd === null || !isFactDate(reportedAt) || (saleDate !== null && !isFactDate(saleDate)) || !verificationLevel
      || !sourceLabel || !isSafeSourceUrl(sourceUrl)
    ) {
      continue;
    }

    ids.add(id);
    facts.push({
      id,
      domain,
      amountUsd,
      ...(saleDate ? { saleDate } : {}),
      reportedAt,
      verificationLevel,
      source: { label: sourceLabel, url: sourceUrl },
    });
  }

  return facts;
}

/**
 * Reads only the approved aggregate shape exposed by Sajda's server. The
 * `type`, source, currency, period, dates, and every metric are checked so a
 * generic object cannot masquerade as a live market signal.
 */
export function normalizeTldMarketAggregateFacts(payload: unknown): readonly TldMarketAggregateFact[] {
  const facts: TldMarketAggregateFact[] = [];
  const ids = new Set<string>();

  for (const item of factItemsFromPayload(payload).slice(0, MAX_SERVER_AGGREGATES)) {
    if (!item || typeof item !== "object") continue;
    const input = item as TldMarketAggregateInput;
    const id = asNonEmptyString(input.id)?.toLowerCase();
    const tld = asNonEmptyString(input.tld)?.toLowerCase();
    const reportedAt = asNonEmptyString(input.reportedAt);
    const lastCheckedAt = asNonEmptyString(input.lastCheckedAt);
    const metrics = readAggregateMetrics(input.metrics);
    const sourceObject = input.source && typeof input.source === "object" ? input.source as Record<string, unknown> : null;
    const sourceLabel = asNonEmptyString(sourceObject?.label);
    const sourceUrl = asNonEmptyString(sourceObject?.url);
    const caveat = asNonEmptyString(input.caveat);

    if (
      input.type !== "tld_market_aggregate" || input.dataStatus !== "approved_api_snapshot"
      || input.verificationLevel !== "approved_source_snapshot" || input.assetScope !== "tld_aggregate"
      || input.sourceType !== "approved_public_api" || !id || !FACT_ID_PATTERN.test(id) || ids.has(id)
      || !tld || !TLD_PATTERN.test(tld) || input.period !== "1y" || input.currency !== "USD"
      || !isFactDate(reportedAt) || !isFactDate(lastCheckedAt) || !metrics || !sourceLabel || !isSafeSourceUrl(sourceUrl) || !caveat
    ) {
      continue;
    }

    ids.add(id);
    facts.push({
      id,
      tld,
      period: "1y",
      currency: "USD",
      reportedAt,
      lastCheckedAt,
      verificationLevel: "approved_source_snapshot",
      metrics,
      source: { label: sourceLabel, url: sourceUrl },
      caveat,
    });
  }

  return facts;
}

/**
 * Single, validated boundary for the client fetch hook. Individual historical
 * sales and aggregate market pulses are intentionally kept in different
 * arrays, making it impossible for the latter to be rendered as a sale.
 */
export function normalizeDomainMarketFactFeed(payload: unknown): DomainMarketFactFeed {
  return {
    sales: normalizeDomainSaleFacts(payload),
    aggregates: normalizeTldMarketAggregateFacts(payload),
  };
}

/**
 * Curated records are always available offline. Server facts may supplement
 * them when `/api/fact-signals` is configured; they do not overwrite a
 * curated record with the same ID.
 */
export function mergeDomainSaleFacts(serverPayload?: unknown): readonly DomainSaleFact[] {
  const existingIds = new Set(CURATED_DOMAIN_SALE_FACTS.map((fact) => fact.id));
  const existingDomains = new Set(CURATED_DOMAIN_SALE_FACTS.map((fact) => fact.domain.toLowerCase()));
  const additions = normalizeDomainSaleFacts(serverPayload).filter(
    (fact) => !existingIds.has(fact.id) && !existingDomains.has(fact.domain.toLowerCase()),
  );
  return [...CURATED_DOMAIN_SALE_FACTS, ...additions];
}

function formatDate(language: Language, value: string): string {
  const date = new Date(ISO_DATE_PATTERN.test(value) ? `${value}T12:00:00.000Z` : value);
  return new Intl.DateTimeFormat(localeForLanguage[language], {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatUsd(language: Language, amount: number): string {
  return new Intl.NumberFormat(localeForLanguage[language], {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Creates two differently-worded slots per fact. The signal-cycle queue keeps
 * either wording from repeating until the available pool has been consumed.
 */
export function getDomainSaleFactPresentations(
  language: Language,
  serverPayload?: unknown,
): readonly DomainSaleFactPresentation[] {
  const strings = copy[language];
  return mergeDomainSaleFacts(serverPayload).flatMap((fact) => {
    const reportedDate = formatDate(language, fact.reportedAt);
    const saleDate = fact.saleDate ? formatDate(language, fact.saleDate) : null;
    const title = `${fact.domain} · ${formatUsd(language, fact.amountUsd)}`;
    const context = `${strings.reported(reportedDate, fact.source.label)}${saleDate ? ` ${strings.sold(saleDate)}` : ""}`;

    return strings.note.map((note, index) => ({
      id: `sajda-sale:${fact.id}:${index + 1}`,
      category: strings.category,
      badge: strings.badge(fact.verificationLevel),
      title,
      body: `${context} ${note}`,
      sourceLabel: strings.source(fact.source.label),
      sourceUrl: fact.source.url,
    }));
  });
}

/**
 * Converts an approved TLD aggregate to a distinct Market pulse card. This is
 * purposefully not shared with the reported-sale formatter above.
 */
export function getTldMarketAggregatePresentations(
  language: Language,
  facts: readonly TldMarketAggregateFact[] = [],
): readonly TldMarketAggregatePresentation[] {
  const strings = marketPulseCopy[language];
  const number = new Intl.NumberFormat(localeForLanguage[language]);

  return facts.map((fact) => ({
    id: `sajda-market-pulse:${fact.id}`,
    category: strings.category,
    badge: strings.badge,
    title: strings.title(fact.tld, formatUsd(language, fact.metrics.averagePriceUsd)),
    body: strings.body(
      fact.source.label,
      fact.period,
      number.format(fact.metrics.saleCount),
      formatUsd(language, fact.metrics.highestPriceUsd),
      formatDate(language, fact.lastCheckedAt),
    ),
    sourceLabel: strings.source(fact.source.label),
    sourceUrl: fact.source.url,
  }));
}
