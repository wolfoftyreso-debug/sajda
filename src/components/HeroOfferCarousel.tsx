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
      description: "Prefer to browse? Keep the short names you like and skip the rest.",
      detail: "Check each domain’s current status on its card.",
      action: "Browse domains",
    },
    trending: {
      eyebrow: "Domain ideas",
      headerNote: "Multiple naming directions",
      title: "Name what you’re building",
      description: "Describe your product or business to get relevant domain ideas.",
      detail: "Start with a few words. No account needed to try.",
      action: "Describe my idea",
    },
    brief: {
      eyebrow: "Detailed search",
      headerNote: "You set the criteria",
      title: "Set your naming criteria",
      description: "Choose a style, name length and words to include or avoid.",
      detail: "Add your audience and preferred domain endings.",
      action: "Set search criteria",
    },
  },
  sv: {
    label: "Välj hur du vill söka",
    helper: "Sök direkt eller välj hur du vill hitta domänidéer.",
    swipe: {
      eyebrow: "Korta domäner",
      headerNote: "Upp till 100 per omgång",
      title: "Bläddra bland korta domäner",
      description: "Vill du hellre bläddra? Behåll de korta namn du gillar och hoppa över resten.",
      detail: "Varje kort visar domänens aktuella status.",
      action: "Bläddra bland domäner",
    },
    trending: {
      eyebrow: "Domänförslag",
      headerNote: "Flera namnspår",
      title: "Hitta namnet till din idé",
      description: "Beskriv din produkt eller verksamhet och få relevanta domänförslag.",
      detail: "Börja med några ord. Inget konto krävs för att prova.",
      action: "Beskriv min idé",
    },
    brief: {
      eyebrow: "Detaljerad sökning",
      headerNote: "Du sätter kriterierna",
      title: "Välj kriterier för namnet",
      description: "Välj stil, namnlängd och ord att ta med eller undvika.",
      detail: "Lägg till målgrupp och önskade domänändelser.",
      action: "Ange sökkriterier",
    },
  },
  es: {
    label: "Elige cómo buscar",
    helper: "Busca directamente o elige cómo encontrar ideas de dominios.",
    swipe: {
      eyebrow: "Dominios cortos",
      headerNote: "Hasta 100 por ronda",
      title: "Explora dominios cortos",
      description: "¿Prefieres explorar? Conserva los nombres cortos que te gusten y descarta el resto.",
      detail: "Consulta el estado actual de cada dominio en su tarjeta.",
      action: "Explorar dominios",
    },
    trending: {
      eyebrow: "Ideas de dominios",
      headerNote: "Distintas ideas de nombres",
      title: "Pon nombre a tu proyecto",
      description: "Describe tu producto o negocio para obtener ideas de dominios relevantes.",
      detail: "Empieza con unas palabras. No necesitas una cuenta para probar.",
      action: "Describir mi idea",
    },
    brief: {
      eyebrow: "Búsqueda detallada",
      headerNote: "Tú defines los criterios",
      title: "Define los criterios del nombre",
      description: "Elige estilo, longitud y palabras que quieras incluir o evitar.",
      detail: "Añade tu público y las extensiones que prefieres.",
      action: "Definir criterios de búsqueda",
    },
  },
  fr: {
    label: "Choisissez comment chercher",
    helper: "Lancez une recherche directe ou choisissez comment trouver des idées de domaines.",
    swipe: {
      eyebrow: "Domaines courts",
      headerNote: "Jusqu’à 100 par série",
      title: "Parcourez des domaines courts",
      description: "Vous préférez parcourir des idées ? Gardez les noms courts qui vous plaisent et passez les autres.",
      detail: "Consultez le statut actuel de chaque domaine sur sa carte.",
      action: "Parcourir les domaines",
    },
    trending: {
      eyebrow: "Idées de domaines",
      headerNote: "Plusieurs pistes de noms",
      title: "Donnez un nom à votre projet",
      description: "Décrivez votre produit ou activité pour obtenir des idées de domaines adaptées.",
      detail: "Commencez par quelques mots. Aucun compte requis pour essayer.",
      action: "Décrire mon idée",
    },
    brief: {
      eyebrow: "Recherche détaillée",
      headerNote: "Vous fixez les critères",
      title: "Définissez vos critères",
      description: "Choisissez le style, la longueur et les mots à inclure ou à éviter.",
      detail: "Ajoutez votre public et vos extensions préférées.",
      action: "Définir les critères de recherche",
    },
  },
  zh: {
    label: "选择搜索方式",
    helper: "直接搜索，或选择适合你的域名发现方式。",
    swipe: {
      eyebrow: "短域名",
      headerNote: "每轮最多 100 个",
      title: "浏览短域名",
      description: "更喜欢浏览？保留你喜欢的短域名，跳过其他选项。",
      detail: "每张卡片都会显示域名的当前状态。",
      action: "浏览域名",
    },
    trending: {
      eyebrow: "域名灵感",
      headerNote: "多种命名方向",
      title: "为你的项目找到名字",
      description: "描述你的产品或业务，获取相关的域名建议。",
      detail: "从几个词开始，无需账户即可试用。",
      action: "描述我的想法",
    },
    brief: {
      eyebrow: "详细搜索",
      headerNote: "由你设定条件",
      title: "设定命名条件",
      description: "选择风格、名字长度，以及要包含或排除的词语。",
      detail: "补充目标受众和偏好的域名后缀。",
      action: "设置搜索条件",
    },
  },
} as const;

const visuals: Record<OfferId, { tokens: readonly string[] }> = {
  swipe: { tokens: [] },
  trending: { tokens: [".com", ".dev", ".ai"] },
  brief: { tokens: [] },
};

export function HeroOfferHeading({ language }: { language: HeroOfferLanguage }) {
  const strings = copy[language];

  return (
    <div className="mb-3 flex w-full items-end justify-between gap-4 px-1">
      <h2 id="search-paths-title" className="text-[1.7rem] font-semibold tracking-[-0.035em] text-foreground">
        {strings.label}
      </h2>
      <p className="hidden max-w-sm pb-1 text-right text-sm leading-5 text-muted-foreground md:block">{strings.helper}</p>
    </div>
  );
}

function SearchPathGraphic({ offerId }: { offerId: OfferId }) {
  const frame = "h-full w-full";
  if (offerId === "trending") {
    return (
      <svg viewBox="0 0 360 160" className={frame} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <rect width="360" height="160" fill="#e7eef8" />
        <path d="M-20 128C70 128 86 36 168 36C250 36 262 104 390 104" fill="none" stroke="#b9d4f5" strokeWidth="14" strokeLinecap="round" />
        <path d="M-20 108C78 108 98 58 176 58C254 58 270 92 390 86" fill="none" stroke="#1673E8" strokeWidth="8" strokeLinecap="round" />
        <circle cx="176" cy="58" r="7" fill="#1673E8" />
        <circle cx="250" cy="74" r="5" fill="#8eb6ea" />
      </svg>
    );
  }
  if (offerId === "brief") {
    return (
      <svg viewBox="0 0 360 160" className={frame} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <rect width="360" height="160" fill="#eef1f6" />
        <rect x="78" y="28" width="204" height="30" rx="15" fill="white" />
        <rect x="94" y="40" width="92" height="6" rx="3" fill="#d5d5dc" />
        <rect x="78" y="66" width="168" height="30" rx="15" fill="white" />
        <rect x="94" y="78" width="70" height="6" rx="3" fill="#d5d5dc" />
        <rect x="78" y="104" width="124" height="30" rx="15" fill="#1673E8" />
        <rect x="94" y="116" width="52" height="6" rx="3" fill="white" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 360 160" className={frame} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="360" height="160" fill="#e7f0ea" />
      <g transform="rotate(-8 145 82)">
        <rect x="86" y="28" width="116" height="112" rx="24" fill="white" />
        <rect x="104" y="54" width="74" height="8" rx="4" fill="#d7d7de" />
        <rect x="104" y="72" width="50" height="8" rx="4" fill="#ececf1" />
      </g>
      <g transform="rotate(7 226 80)">
        <rect x="168" y="24" width="116" height="112" rx="24" fill="#1673E8" />
        <rect x="186" y="50" width="74" height="8" rx="4" fill="white" opacity="0.92" />
        <rect x="186" y="68" width="48" height="8" rx="4" fill="white" opacity="0.45" />
      </g>
    </svg>
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
    { id: "trending" as const, ...strings.trending },
    { id: "brief" as const, ...strings.brief },
    { id: "swipe" as const, ...strings.swipe },
  ];

  const renderAction = (offerId: OfferId, action: string) => {
    const className = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

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
    <section className="mx-auto mt-8 w-full max-w-5xl text-left" aria-labelledby="search-paths-title">
      {showHeading ? <HeroOfferHeading language={language} /> : null}

      <div className="grid gap-4 md:grid-cols-3">
        {offers.map((offer) => {
          const visual = visuals[offer.id];

          return (
            <article
              key={offer.id}
              data-search-path={offer.id}
              className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
            >
              <div className="relative h-40 overflow-hidden bg-[#eef1f6]" aria-hidden="true">
                <SearchPathGraphic offerId={offer.id} />
              </div>
              <div className="flex flex-1 flex-col px-5 pb-5 pt-4">
                <p className="text-[13px] font-semibold text-primary">{offer.eyebrow}</p>
                <p className="mt-1 text-sm leading-5 text-muted-foreground">{offer.headerNote}</p>
                <h3 className="mt-1 text-[1.3rem] font-semibold leading-6 tracking-[-0.03em] text-foreground">
                  {offer.title}
                </h3>
                <p className="mt-2 text-[15px] leading-6 text-muted-foreground">{offer.description}</p>
                {visual.tokens.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {visual.tokens.map((token) => (
                      <span key={token} className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-foreground">
                        {token}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-auto pt-4">
                  {renderAction(offer.id, offer.action)}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <p className="mt-3 px-1 text-sm leading-6 text-muted-foreground md:hidden">{strings.helper}</p>
    </section>
  );
}
