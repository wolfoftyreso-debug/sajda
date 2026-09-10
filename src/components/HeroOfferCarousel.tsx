import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

type HeroOfferLanguage = "en" | "sv" | "es" | "fr" | "zh";
type OfferId = "swipe" | "trending" | "brief";

interface HeroOfferCarouselProps {
  language: HeroOfferLanguage;
  onExploreTrending: () => void;
  onOpenAdvancedSearch: () => void;
  showHeading?: boolean;
}

const copy = {
  en: {
    label: "Choose how to search",
    helper: "Search directly, or choose how to find domain ideas.",
    swipe: {
      eyebrow: "Short domains",
      headerNote: "Up to 100 per round",
      title: "Browse short domains",
      description: "See one short domain at a time. Keep the ones you like and skip the rest.",
      detail: "Check each domain’s current status on its card.",
      action: "Browse domains",
    },
    trending: {
      eyebrow: "Domain ideas",
      headerNote: "Multiple naming directions",
      title: "Start with a word or idea",
      description: "Describe what you are building and explore domain suggestions around it.",
      detail: "Choose your theme in the search field above.",
      action: "Find domain ideas",
    },
    brief: {
      eyebrow: "Detailed search",
      headerNote: "You set the criteria",
      title: "Describe what you need",
      description: "Add your audience, preferred style and words to prioritize or avoid.",
      detail: "Set the extensions and criteria that matter to you.",
      action: "Open advanced search",
    },
  },
  sv: {
    label: "Välj hur du vill söka",
    helper: "Sök direkt eller välj hur du vill hitta domänidéer.",
    swipe: {
      eyebrow: "Korta domäner",
      headerNote: "Upp till 100 per omgång",
      title: "Bläddra bland korta domäner",
      description: "Se en kort domän i taget. Behåll dem du gillar och hoppa över resten.",
      detail: "Varje kort visar domänens aktuella status.",
      action: "Bläddra bland domäner",
    },
    trending: {
      eyebrow: "Domänförslag",
      headerNote: "Flera namnspår",
      title: "Börja med ett ord eller en idé",
      description: "Beskriv vad du bygger och få förslag på domäner som passar idén.",
      detail: "Ange ditt tema i sökfältet ovan.",
      action: "Hitta domänförslag",
    },
    brief: {
      eyebrow: "Detaljerad sökning",
      headerNote: "Du sätter kriterierna",
      title: "Beskriv vad du behöver",
      description: "Lägg till målgrupp, önskad stil och ord att prioritera eller undvika.",
      detail: "Välj de ändelser och kriterier som är viktiga för dig.",
      action: "Öppna avancerad sökning",
    },
  },
  es: {
    label: "Elige cómo buscar",
    helper: "Busca directamente o elige cómo encontrar ideas de dominios.",
    swipe: {
      eyebrow: "Dominios cortos",
      headerNote: "Hasta 100 por ronda",
      title: "Explora dominios cortos",
      description: "Revisa un dominio corto a la vez. Conserva los que te gusten y descarta el resto.",
      detail: "Consulta el estado actual de cada dominio en su tarjeta.",
      action: "Explorar dominios",
    },
    trending: {
      eyebrow: "Ideas de dominios",
      headerNote: "Distintas ideas de nombres",
      title: "Empieza con una palabra o idea",
      description: "Describe lo que estás creando y explora sugerencias de dominios relacionados.",
      detail: "Escribe tu tema en el campo de búsqueda de arriba.",
      action: "Encontrar ideas de dominios",
    },
    brief: {
      eyebrow: "Búsqueda detallada",
      headerNote: "Tú defines los criterios",
      title: "Describe lo que necesitas",
      description: "Añade tu público, el estilo que prefieres y las palabras que quieras priorizar o evitar.",
      detail: "Elige las extensiones y los criterios que te importan.",
      action: "Abrir búsqueda avanzada",
    },
  },
  fr: {
    label: "Choisissez comment chercher",
    helper: "Lancez une recherche directe ou choisissez comment trouver des idées de domaines.",
    swipe: {
      eyebrow: "Domaines courts",
      headerNote: "Jusqu’à 100 par série",
      title: "Parcourez des domaines courts",
      description: "Découvrez un domaine court à la fois. Gardez ceux qui vous plaisent et passez les autres.",
      detail: "Consultez le statut actuel de chaque domaine sur sa carte.",
      action: "Parcourir les domaines",
    },
    trending: {
      eyebrow: "Idées de domaines",
      headerNote: "Plusieurs pistes de noms",
      title: "Partez d’un mot ou d’une idée",
      description: "Décrivez votre projet et explorez des suggestions de domaines en lien avec votre idée.",
      detail: "Indiquez votre thème dans le champ de recherche ci-dessus.",
      action: "Trouver des idées de domaines",
    },
    brief: {
      eyebrow: "Recherche détaillée",
      headerNote: "Vous fixez les critères",
      title: "Décrivez ce qu’il vous faut",
      description: "Précisez votre public, le style souhaité et les mots à privilégier ou à éviter.",
      detail: "Choisissez les extensions et les critères qui comptent pour vous.",
      action: "Ouvrir la recherche avancée",
    },
  },
  zh: {
    label: "选择搜索方式",
    helper: "直接搜索，或选择适合你的域名发现方式。",
    swipe: {
      eyebrow: "短域名",
      headerNote: "每轮最多 100 个",
      title: "浏览短域名",
      description: "一次查看一个短域名，保留喜欢的，跳过其他的。",
      detail: "每张卡片都会显示域名的当前状态。",
      action: "浏览域名",
    },
    trending: {
      eyebrow: "域名灵感",
      headerNote: "多种命名方向",
      title: "从一个词或想法开始",
      description: "描述你正在创建的项目，探索相关域名建议。",
      detail: "在上方搜索框中输入你的主题。",
      action: "查找域名灵感",
    },
    brief: {
      eyebrow: "详细搜索",
      headerNote: "由你设定条件",
      title: "描述你的需求",
      description: "补充目标受众、偏好风格，以及优先考虑或排除的词语。",
      detail: "选择你需要的域名后缀和筛选条件。",
      action: "打开高级搜索",
    },
  },
} as const;

const visuals: Record<OfferId, {
  cardClassName: string;
  eyebrowClassName: string;
  detailClassName: string;
  tokenClassName: string;
  tokens: readonly string[];
}> = {
  swipe: {
    cardClassName: "border-[#9ccff5] bg-[#eaf6ff]",
    eyebrowClassName: "border-[#9acbf0] bg-white/85 text-[#075e9e]",
    detailClassName: "border-[#42a7e9]/55",
    tokens: [],
    tokenClassName: "border-[#9acbf0] bg-white/80 text-[#075e9e]",
  },
  trending: {
    cardClassName: "border-[#a8ccef] bg-[#e8f3ff]",
    eyebrowClassName: "border-[#a4c7ea] bg-white/85 text-[#195f9d]",
    detailClassName: "border-[#4186d3]/55",
    tokens: [".com", ".dev", ".ai"],
    tokenClassName: "border-[#a4c7ea] bg-white/80 text-[#195f9d]",
  },
  brief: {
    cardClassName: "border-[#a7cbed] bg-[#edf7ff]",
    eyebrowClassName: "border-[#a5cbed] bg-white/85 text-[#145b98]",
    detailClassName: "border-[#347cc4]/55",
    tokens: [],
    tokenClassName: "border-[#a5cbed] bg-white/80 text-[#145b98]",
  },
};

export function HeroOfferHeading({ language }: { language: HeroOfferLanguage }) {
  const strings = copy[language];

  return (
    <div className="mx-auto mb-2.5 flex w-full max-w-4xl items-end justify-between gap-4 px-1">
      <h2 id="search-paths-title" className="shrink-0 text-base font-semibold tracking-[-0.01em] text-foreground">
        {strings.label}
      </h2>
      <p className="hidden max-w-sm text-right text-xs leading-5 text-muted-foreground md:block">{strings.helper}</p>
    </div>
  );
}

function SearchPathGraphic({ offerId }: { offerId: OfferId }) {
  if (offerId === "swipe") {
    return (
      <>
        <div className="absolute -right-14 top-[-4.5rem] h-52 w-52 rounded-full bg-[#8bcdfb]/45 blur-2xl" />
        <div className="absolute -left-12 bottom-[-7rem] h-52 w-52 rounded-full border-[20px] border-[#c7e7ff]/85" />
        <svg viewBox="0 0 360 340" className="absolute -right-4 bottom-[-1.4rem] h-[18rem] w-[19rem] text-[#0c78c9] opacity-80 sm:h-[19.5rem]" fill="none" aria-hidden="true">
          <path d="M72 280C108 209 148 234 179 175C202 132 246 116 302 43" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="3 11" />
          <g transform="rotate(-8 175 177)">
            <rect x="104" y="113" width="132" height="156" rx="21" fill="#FFFFFF" stroke="currentColor" strokeWidth="2.5" />
            <path d="M129 157H211" stroke="currentColor" strokeWidth="6" strokeLinecap="round" opacity=".9" />
            <path d="M129 181H190" stroke="currentColor" strokeWidth="4" strokeLinecap="round" opacity=".34" />
            <path d="M129 202H201" stroke="currentColor" strokeWidth="4" strokeLinecap="round" opacity=".34" />
            <circle cx="169" cy="235" r="17" fill="#D3ECFF" stroke="currentColor" strokeWidth="2" />
            <path d="M162 235L167 240L177 229" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </g>
          <g transform="rotate(12 264 117)" opacity=".6">
            <rect x="226" y="61" width="87" height="118" rx="16" fill="#FFFFFF" stroke="currentColor" strokeWidth="2" />
            <path d="M244 99H294M244 116H282" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" opacity=".45" />
          </g>
          <circle cx="72" cy="279" r="8" fill="#1673E8" />
          <circle cx="301" cy="43" r="8" fill="#1673E8" />
        </svg>
      </>
    );
  }

  if (offerId === "trending") {
    return (
      <>
        <div className="absolute -right-20 top-[-7rem] h-64 w-64 rounded-full border-[34px] border-[#bcdfff]/75" />
        <div className="absolute left-[-7rem] top-[45%] h-32 w-48 -rotate-[18deg] rounded-[100%] bg-[#c8e6ff]/80 blur-xl" />
        <svg viewBox="0 0 360 340" className="absolute -right-2 bottom-[-1.6rem] h-[18.5rem] w-[19rem] text-[#166dbc] opacity-80 sm:h-[20rem]" fill="none" aria-hidden="true">
          <path d="M62 242C115 236 136 194 182 182C230 170 261 135 319 72" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="2 11" />
          <path d="M47 267C112 260 161 252 214 219C270 184 286 156 337 131" stroke="#5AA9E7" strokeWidth="13" strokeLinecap="round" opacity=".2" />
          <path d="M75 196C137 202 180 168 213 124C243 84 278 68 321 58" stroke="#1673E8" strokeWidth="5" strokeLinecap="round" opacity=".32" />
          <g fill="#FFFFFF" stroke="currentColor" strokeWidth="2">
            <rect x="116" y="203" width="93" height="45" rx="22.5" transform="rotate(-11 116 203)" />
            <rect x="222" y="128" width="82" height="41" rx="20.5" transform="rotate(-39 222 128)" />
          </g>
          <g fill="#1673E8">
            <circle cx="69" cy="242" r="8" />
            <circle cx="166" cy="184" r="8" />
            <circle cx="246" cy="151" r="8" />
            <circle cx="320" cy="72" r="8" />
          </g>
          <g fill="#8ecbfa">
            <circle cx="93" cy="82" r="4" /><circle cx="118" cy="67" r="4" /><circle cx="145" cy="90" r="4" />
            <circle cx="174" cy="55" r="4" /><circle cx="201" cy="77" r="4" /><circle cx="229" cy="41" r="4" />
          </g>
        </svg>
      </>
    );
  }

  return (
    <>
      <div className="absolute -right-12 top-[-5rem] h-48 w-48 rounded-full bg-[#cdeaff]/80 blur-2xl" />
      <div className="absolute -left-20 bottom-[-5rem] h-48 w-48 rounded-[42%] border-[22px] border-[#c3e4ff]/70 rotate-12" />
      <svg viewBox="0 0 360 340" className="absolute -right-3 bottom-[-1.8rem] h-[19rem] w-[19rem] text-[#126ab2] opacity-80 sm:h-[20.5rem]" fill="none" aria-hidden="true">
        <path d="M76 252H176C214 252 215 156 262 156H323" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="4 10" />
        <g fill="#FFFFFF" stroke="currentColor" strokeWidth="2.5">
          <rect x="68" y="203" width="115" height="82" rx="18" />
          <rect x="205" y="108" width="102" height="98" rx="18" />
        </g>
        <path d="M93 231H157M93 250H139M228 137H282M228 158H269M228 179H253" stroke="currentColor" strokeWidth="4" strokeLinecap="round" opacity=".55" />
        <circle cx="183" cy="252" r="13" fill="#D5EEFF" stroke="currentColor" strokeWidth="2.5" />
        <circle cx="262" cy="156" r="13" fill="#1673E8" />
        <path d="M257 156L261 160L268 152" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="323" cy="156" r="7" fill="#1673E8" />
      </svg>
    </>
  );
}

/**
 * Three stable ways into Sajda's search system. The form language is rendered
 * in code and is decorative; titles, descriptions and actions remain HTML.
 */
export default function HeroOfferCarousel({
  language,
  onExploreTrending,
  onOpenAdvancedSearch,
  showHeading = true,
}: HeroOfferCarouselProps) {
  const strings = copy[language];
  const offers = [
    { id: "swipe" as const, ...strings.swipe },
    { id: "trending" as const, ...strings.trending },
    { id: "brief" as const, ...strings.brief },
  ];

  const renderAction = (offerId: OfferId, action: string) => {
    const className = "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-center text-sm font-semibold text-primary-foreground shadow-[0_8px_18px_hsl(213_82%_50%/0.18)] transition-[transform,background-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-[0_12px_24px_hsl(213_82%_50%/0.24)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transform-none";

    if (offerId === "swipe") {
      return (
        <Link to="/swipe" className={className}>
          {action}
          <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
        </Link>
      );
    }

    return (
      <button
        type="button"
        onClick={offerId === "trending" ? onExploreTrending : onOpenAdvancedSearch}
        className={className}
      >
        {action}
        <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
      </button>
    );
  };

  return (
    <section className="mx-auto mt-5 w-full max-w-4xl text-left sm:mt-6" aria-labelledby="search-paths-title">
      {showHeading ? <HeroOfferHeading language={language} /> : null}

      <div className="grid gap-3 md:grid-cols-3">
        {offers.map((offer) => {
          const visual = visuals[offer.id];

          return (
            <article
              key={offer.id}
              className={`group relative isolate flex min-h-[20.75rem] overflow-hidden rounded-[1.45rem] border shadow-[0_13px_30px_hsl(210_50%_30%/0.10)] transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-1 hover:border-primary/55 hover:shadow-[0_20px_40px_hsl(210_50%_30%/0.16)] motion-reduce:transform-none sm:min-h-[22rem] ${visual.cardClassName}`}
            >
              <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
                <div className="absolute inset-0 bg-[linear-gradient(115deg,hsl(0_0%_100%/0.92)_0%,hsl(0_0%_100%/0.82)_45%,transparent_77%)]" />
                <div className="absolute inset-0 opacity-[0.22] [background-image:linear-gradient(hsl(207_81%_63%/0.11)_1px,transparent_1px),linear-gradient(90deg,hsl(207_81%_63%/0.11)_1px,transparent_1px)] [background-size:1.3rem_1.3rem]" />
                <div className="absolute inset-0 opacity-[0.22]">
                  <SearchPathGraphic offerId={offer.id} />
                </div>
                <div className="absolute inset-0 bg-[linear-gradient(120deg,transparent_16%,hsl(0_0%_100%/0.17)_50%,transparent_72%)] opacity-0 transition-opacity duration-500 group-hover:opacity-100 motion-reduce:hidden" />
              </div>

              <div className="relative z-10 flex min-w-0 flex-1 flex-col">
                <div className="flex min-h-[5.25rem] flex-col items-start justify-center gap-1 border-b border-[#8fc7f0]/55 bg-white/70 px-4 py-3 backdrop-blur-sm">
                  <span className="max-w-full text-sm font-semibold leading-5 text-[#075e9e] [overflow-wrap:anywhere]">
                    {offer.eyebrow}
                  </span>
                  <span className="max-w-full text-xs font-medium leading-5 text-[#425a78] [overflow-wrap:anywhere]">
                    {offer.headerNote}
                  </span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col px-4 pb-4 pt-3.5">
                  <div className="min-w-0">
                    <h3 className="max-w-full text-lg font-semibold leading-6 tracking-[-0.02em] text-foreground [overflow-wrap:anywhere] md:min-h-12">
                      {offer.title}
                    </h3>
                    <p className="mt-2 max-w-full text-sm leading-5 text-[#425a78] md:min-h-[5rem]">{offer.description}</p>
                    <p className="mt-3 max-w-full text-xs leading-5 text-[#4e6684] md:min-h-10">
                      {offer.detail}
                    </p>
                  </div>
                  <div className="flex min-h-8 flex-wrap content-start gap-1.5">
                    {visual.tokens.map((token) => (
                      <span key={token} className={`h-7 rounded-full border px-2 py-1 text-[0.59rem] font-bold leading-4 tracking-[0.08em] backdrop-blur-sm ${visual.tokenClassName}`}>
                        {token}
                      </span>
                    ))}
                  </div>
                  <div className="mt-auto pt-4">
                    {renderAction(offer.id, offer.action)}
                  </div>
                </div>
              </div>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-px bg-primary/35" aria-hidden="true" />
            </article>
          );
        })}
      </div>
      <p className="mt-2.5 px-1 text-xs leading-5 text-muted-foreground md:hidden">{strings.helper}</p>
    </section>
  );
}
