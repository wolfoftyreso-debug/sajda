import type { Language } from "@/i18n/LanguageProvider";
import {
  getDomainSaleFactPresentations,
  getTldMarketAggregatePresentations,
  type DomainMarketFactFeed,
} from "@/lib/domainSaleFacts";

/**
 * Optional, source-aware notes for the live Sajda product. The public pool
 * contains only current product capabilities and attributed market facts.
 * Planned product areas deliberately do not appear here until they are real,
 * usable product surfaces.
 */
export type SajdaSignalKind =
  | "domain"
  | "providers"
  | "review"
  | "inspiration"
  | "sale"
  | "marketPulse";

export type SajdaSignalAction = "search" | "providers" | "swipe" | "inspiration";

export interface SajdaSignal {
  id: string;
  kind: SajdaSignalKind;
  category: string;
  title: string;
  body: string;
  action?: SajdaSignalAction;
  /** A short source-status label for an attributed historical record. */
  badge?: string;
  /** Defaults to the locale's generic source label when omitted. */
  sourceLabel?: string;
  sourceUrl?: string;
}

interface SignalSeed {
  id: string;
  kind: Exclude<SajdaSignalKind, "sale" | "marketPulse">;
  title: Record<Language, string>;
  body: Record<Language, string>;
  action?: SajdaSignalAction;
}

const category: Record<SajdaSignalKind, Record<Language, string>> = {
  domain: {
    en: "Domain search", sv: "Domänsökning", es: "Búsqueda de dominios", fr: "Recherche de domaine", zh: "域名搜索",
  },
  providers: {
    en: "Provider comparison", sv: "Leverantörsjämförelse", es: "Comparación de proveedores", fr: "Comparaison de fournisseurs", zh: "服务商对比",
  },
  review: {
    en: "Deep Review", sv: "Djupgranskning", es: "Revisión profunda", fr: "Analyse approfondie", zh: "深度评估",
  },
  inspiration: {
    en: "Naming inspiration", sv: "Namninspiration", es: "Inspiración para nombres", fr: "Inspiration de nom", zh: "命名灵感",
  },
  sale: {
    en: "Reported domain sale", sv: "Rapporterad domänförsäljning", es: "Venta de dominio reportada", fr: "Vente de domaine rapportée", zh: "已报道的域名交易",
  },
  marketPulse: {
    en: "Market pulse", sv: "Marknadspuls", es: "Pulso del mercado", fr: "Pouls du marché", zh: "市场脉搏",
  },
};

const signalSeeds: readonly SignalSeed[] = [
  {
    id: "exact-domain-check",
    kind: "domain",
    action: "search",
    title: {
      en: "Check the exact name first", sv: "Kontrollera exakt namn först", es: "Comprueba primero el nombre exacto", fr: "Vérifiez d’abord le nom exact", zh: "先检查确切名称",
    },
    body: {
      en: "Paste saida.com, saida.dev, or saida.ai into Sajda and it checks those exact names through the relevant registry route.",
      sv: "Klistra in saida.com, saida.dev eller saida.ai i Sajda så kontrolleras just de namnen via rätt registry-källa.",
      es: "Pega saida.com, saida.dev o saida.ai en Sajda y se comprobarán esos nombres exactos por la ruta de registro correspondiente.",
      fr: "Collez saida.com, saida.dev ou saida.ai dans Sajda : ces noms précis sont vérifiés auprès de la source de registre concernée.",
      zh: "将 saida.com、saida.dev 或 saida.ai 粘贴到 Sajda 中，即可通过相应注册局渠道核查这些确切名称。",
    },
  },
  {
    id: "selected-endings",
    kind: "domain",
    action: "search",
    title: {
      en: "Search the endings you would actually use", sv: "Sök de ändelser du faktiskt skulle använda", es: "Busca las extensiones que realmente usarías", fr: "Recherchez les extensions que vous utiliseriez vraiment", zh: "搜索你真正会使用的后缀",
    },
    body: {
      en: "Choose supported extensions such as .com, .ai, .dev and .se before searching. Sajda checks only what its registry sources can verify.",
      sv: "Välj stödda ändelser som .com, .ai, .dev och .se innan du söker. Sajda kontrollerar bara det som registry-källorna kan verifiera.",
      es: "Elige extensiones compatibles como .com, .ai, .dev y .se antes de buscar. Sajda solo comprueba lo que sus fuentes de registro pueden verificar.",
      fr: "Choisissez des extensions prises en charge comme .com, .ai, .dev et .se avant la recherche. Sajda ne vérifie que ce que ses sources de registre peuvent confirmer.",
      zh: "搜索前选择 .com、.ai、.dev、.se 等受支持后缀。Sajda 只核查其注册局来源能够验证的内容。",
    },
  },
  {
    id: "creative-shortlist",
    kind: "domain",
    action: "search",
    title: {
      en: "Build a focused creative shortlist", sv: "Bygg en fokuserad kreativ kortlista", es: "Crea una lista creativa enfocada", fr: "Créez une liste créative ciblée", zh: "建立一份聚焦的创意短名单",
    },
    body: {
      en: "Describe an idea and Sajda can generate up to 50 naming directions, then remove names that fail the selected registry checks.",
      sv: "Beskriv en idé så kan Sajda skapa upp till 50 namnspår och sedan sortera bort namn som inte klarar valda registry-kontroller.",
      es: "Describe una idea y Sajda puede generar hasta 50 direcciones de nombres y después quitar los que no superen las comprobaciones de registro elegidas.",
      fr: "Décrivez une idée : Sajda peut générer jusqu’à 50 pistes de noms, puis retirer celles qui échouent aux vérifications de registre sélectionnées.",
      zh: "描述一个想法，Sajda 可生成最多 50 个命名方向，然后剔除未通过所选注册局核查的名称。",
    },
  },
  {
    id: "provider-comparison",
    kind: "providers",
    action: "providers",
    title: {
      en: "Compare providers on one domain card", sv: "Jämför leverantörer på ett domänkort", es: "Compara proveedores en una sola tarjeta de dominio", fr: "Comparez les fournisseurs sur une seule carte de domaine", zh: "在一张域名卡片中对比服务商",
    },
    body: {
      en: "Select the registrars you trust. For an available domain, Sajda presents their purchase pages together for a direct comparison.",
      sv: "Välj de registrarer du litar på. För en ledig domän samlar Sajda deras köpsidor för en direkt jämförelse.",
      es: "Elige los registradores en los que confías. Para un dominio disponible, Sajda reúne sus páginas de compra para una comparación directa.",
      fr: "Choisissez les registrars auxquels vous faites confiance. Pour un domaine disponible, Sajda réunit leurs pages d’achat pour une comparaison directe.",
      zh: "选择你信任的注册商。对于可用域名，Sajda 会集中呈现其购买页面，便于直接对比。",
    },
  },
  {
    id: "price-transparency",
    kind: "providers",
    action: "providers",
    title: {
      en: "See what is verified — and what is only a link", sv: "Se vad som är verifierat — och vad som bara är en länk", es: "Ve qué está verificado y qué es solo un enlace", fr: "Voyez ce qui est vérifié — et ce qui n’est qu’un lien", zh: "区分已验证信息与普通链接",
    },
    body: {
      en: "Sajda labels a connected, verified provider price separately from a provider page you need to check yourself.",
      sv: "Sajda märker ut ett anslutet, verifierat leverantörspris separat från en leverantörssida som du behöver kontrollera själv.",
      es: "Sajda distingue un precio de proveedor conectado y verificado de una página de proveedor que debes consultar tú.",
      fr: "Sajda distingue un prix connecté et vérifié d’une page fournisseur que vous devez vérifier vous-même.",
      zh: "Sajda 会将已连接且已验证的服务商价格，与需要你自行核查的服务商页面分开标注。",
    },
  },
  {
    id: "deep-review-top-ten",
    kind: "review",
    title: {
      en: "Turn verified results into a Top 10", sv: "Gör verifierade resultat till en Top 10", es: "Convierte resultados verificados en un Top 10", fr: "Transformez des résultats vérifiés en Top 10", zh: "将已验证结果整理成 Top 10",
    },
    body: {
      en: "After a search, Deep Review ranks registry-verified available candidates and explains why the strongest ten rose to the top.",
      sv: "Efter en sökning rangordnar Djupgranskning registry-verifierade lediga kandidater och förklarar varför de tio starkaste hamnade överst.",
      es: "Después de una búsqueda, Revisión profunda clasifica candidatos disponibles verificados por registro y explica por qué los diez más fuertes subieron a la cima.",
      fr: "Après une recherche, l’Analyse approfondie classe les candidats disponibles vérifiés par le registre et explique pourquoi les dix meilleurs arrivent en tête.",
      zh: "搜索后，深度评估会对已通过注册局验证的可用候选项进行排序，并解释为何最强的十个排在前列。",
    },
  },
  {
    id: "deep-review-boundary",
    kind: "review",
    title: {
      en: "Deep Review makes the shortlist legible", sv: "Djupgranskning gör kortlistan begriplig", es: "La Revisión profunda hace legible la lista corta", fr: "L’Analyse approfondie rend la liste lisible", zh: "深度评估让短名单更易理解",
    },
    body: {
      en: "The review makes its signals visible so you can judge the ranking. It is decision support, not a market valuation or a substitute for legal checks.",
      sv: "Granskningen visar sina signaler så att du kan bedöma rangordningen. Den är beslutsstöd, inte en marknadsvärdering eller ersättning för juridiska kontroller.",
      es: "La revisión hace visibles sus señales para que puedas juzgar la clasificación. Es apoyo para decidir, no una valoración de mercado ni un sustituto de las comprobaciones legales.",
      fr: "L’analyse rend ses signaux visibles pour que vous puissiez juger le classement. C’est une aide à la décision, pas une estimation de marché ni un substitut aux vérifications juridiques.",
      zh: "评估会显示其依据，供你判断排名。它是决策辅助，不是市场估值，也不能替代法律核查。",
    },
  },
  {
    id: "inspiration-engine",
    kind: "inspiration",
    action: "inspiration",
    title: {
      en: "Start a name direction before you start guessing", sv: "Starta en namnriktning innan du börjar gissa", es: "Empieza una dirección de nombre antes de empezar a adivinar", fr: "Démarrez une direction de nom avant de deviner", zh: "在猜之前，先开启一个命名方向",
    },
    body: {
      en: "The Sajda inspiration engine gives you themed starting directions, terms, and guardrails that you can send directly into a domain search.",
      sv: "Sajdas inspirationsmotor ger dig tematiska startspår, ord och skyddsräcken som du kan skicka direkt till en domänsökning.",
      es: "El motor de inspiración de Sajda ofrece direcciones temáticas, términos y límites que puedes enviar directamente a una búsqueda de dominios.",
      fr: "Le moteur d’inspiration Sajda propose des directions thématiques, des termes et des garde-fous que vous pouvez envoyer directement dans une recherche de domaine.",
      zh: "Sajda 灵感引擎提供主题起点、词汇和边界，可直接带入域名搜索。",
    },
  },
  {
    id: "swipe",
    kind: "inspiration",
    action: "swipe",
    title: {
      en: "Browse short names when the brief is still foggy", sv: "Bläddra bland korta namn när briefen fortfarande är dimmig", es: "Explora nombres cortos cuando el briefing aún está difuso", fr: "Parcourez des noms courts quand le brief reste flou", zh: "当需求仍模糊时，浏览短名称",
    },
    body: {
      en: "Swipe is Sajda’s quick route through short, registry-checked domain ideas. Availability remains a point-in-time result and can change before checkout.",
      sv: "Swipe är Sajdas snabba väg genom korta, registry-kontrollerade domänidéer. Tillgänglighet är en kontroll i stunden och kan ändras före köp.",
      es: "Swipe es la ruta rápida de Sajda por ideas de dominios cortos comprobados por registro. La disponibilidad es un resultado puntual y puede cambiar antes de pagar.",
      fr: "Swipe est le raccourci Sajda à travers des idées de domaines courts vérifiés par registre. La disponibilité est un résultat ponctuel et peut changer avant le paiement.",
      zh: "Swipe 是 Sajda 浏览简短、经注册局核查域名灵感的快捷方式。可用性为即时结果，在结账前可能发生变化。",
    },
  },
] as const;

export const SAJDA_SIGNAL_IDS: readonly string[] = [
  ...signalSeeds.map((seed) => `sajda-product:${seed.id}`),
  ...getDomainSaleFactPresentations("en").map((fact) => fact.id),
];

export const SAJDA_SIGNAL_POOL_SIZE = SAJDA_SIGNAL_IDS.length;

const poolCache = new Map<Language, readonly SajdaSignal[]>();

export function getSajdaSignalPool(language: Language, serverFactFeed?: DomainMarketFactFeed): readonly SajdaSignal[] {
  // The normal offline queue is cached. Passing a server payload is an
  // explicit opt-in extension point, so it is rebuilt and validated per
  // payload rather than caching untrusted or stale network data.
  if (serverFactFeed === undefined) {
    const cached = poolCache.get(language);
    if (cached) return cached;
  }

  const productPool: SajdaSignal[] = signalSeeds.map((seed) => ({
    id: `sajda-product:${seed.id}`,
    kind: seed.kind,
    category: category[seed.kind][language],
    title: seed.title[language],
    body: seed.body[language],
    action: seed.action,
  }));
  const factPool: SajdaSignal[] = getDomainSaleFactPresentations(language, serverFactFeed?.sales).map((fact) => ({
    ...fact,
    kind: "sale",
  }));
  const marketPulsePool: SajdaSignal[] = getTldMarketAggregatePresentations(language, serverFactFeed?.aggregates).map((fact) => ({
    ...fact,
    kind: "marketPulse",
  }));
  const pool = [...productPool, ...factPool, ...marketPulsePool];

  if (serverFactFeed === undefined) poolCache.set(language, pool);
  return pool;
}
