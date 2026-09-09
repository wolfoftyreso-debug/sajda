import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, ClipboardCheck, LoaderCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { type Language } from "@/i18n/LanguageProvider";
import {
  isDeepReviewCandidate,
  runDeepReview,
  type DeepReviewCandidate,
  type DeepReviewEntry,
  type DeepReviewResult,
} from "@/lib/deepReview";

type Copy = {
  title: string;
  intro: string;
  ready: (count: number) => string;
  start: string;
  rerun: string;
  working: string;
  noCandidates: string;
  local: string;
  assisted: string;
  reviewed: (count: number) => string;
  showMethod: string;
  hideMethod: string;
  score: string;
  editorial: string;
  caveat: string;
  method: string;
  errorTitle: string;
  labels: {
    readability: string;
    relevance: string;
    extensionFit: string;
    registryEvidence: string;
    priceClarity: string;
    searchSignal: string;
  };
};

const copyByLanguage: Record<Language, Copy> = {
  en: {
    title: "Deep Review",
    intro: "Turn the registry-verified names in this search into a transparent Top 10, with score logic and verified price evidence kept visible.",
    ready: (count) => `${count} verified available ${count === 1 ? "name is" : "names are"} ready for review.`,
    start: "Build Top 10",
    rerun: "Refresh Top 10",
    working: "Reviewing verified names…",
    noCandidates: "Deep Review needs at least one registry-verified available domain in this result set.",
    local: "Transparent local score",
    assisted: "Detailed editorial notes",
    reviewed: (count) => `Ranked from ${count} registry-verified available ${count === 1 ? "name" : "names"}.`,
    showMethod: "Show score method",
    hideMethod: "Hide score method",
    score: "Shortlist score",
    editorial: "Editorial note",
    caveat: "This is an explainable shortlist heuristic — not a market valuation, trademark check, legal opinion, availability guarantee, or purchase recommendation.",
    method: "Name quality: 60 points (length, pronunciation and spelling). Theme fit: 12. Extension: 8. Registry evidence: 10. Verified price: 5. Original search order: 5. Ranking also favors different ideas: repeated generic variants and the same name under several extensions move down, without changing their individual scores.",
    errorTitle: "Deep Review could not start",
    labels: {
      readability: "Name quality",
      relevance: "Theme fit",
      extensionFit: "Extension fit",
      registryEvidence: "Registry evidence",
      priceClarity: "Price clarity",
      searchSignal: "Search order",
    },
  },
  sv: {
    title: "Djupgranskning",
    intro: "Gör de registry-verifierade namnen i denna sökning till en transparent topp 10 där poänglogik och verifierade prisunderlag visas tydligt.",
    ready: (count) => `${count} verifierade lediga ${count === 1 ? "namn är" : "namn är"} redo för granskning.`,
    start: "Bygg topp 10",
    rerun: "Uppdatera topp 10",
    working: "Granskar verifierade namn…",
    noCandidates: "Djupgranskningen behöver minst en registry-verifierad ledig domän i resultatet.",
    local: "Transparent lokal poäng",
    assisted: "Fördjupade redaktionella noter",
    reviewed: (count) => `Rangordnat bland ${count} registry-verifierade lediga namn.`,
    showMethod: "Visa poängmetod",
    hideMethod: "Dölj poängmetod",
    score: "Urvalspoäng",
    editorial: "Redaktionell not",
    caveat: "Detta är en förklarbar urvalsheuristik — inte en marknadsvärdering, varumärkesgranskning, juridisk bedömning, tillgänglighetsgaranti eller köprekommendation.",
    method: "Namnkvalitet: 60 poäng (längd, uttal och stavning). Tematräff: 12. Ändelse: 8. Registerunderlag: 10. Verifierat pris: 5. Ursprunglig sökordning: 5. Ordningen prioriterar också olika idéer: upprepade standardvarianter och samma namn med flera ändelser flyttas ned, utan att deras enskilda poäng ändras.",
    errorTitle: "Djupgranskningen kunde inte starta",
    labels: {
      readability: "Namnkvalitet",
      relevance: "Tematräff",
      extensionFit: "Ändelsepassning",
      registryEvidence: "Registerunderlag",
      priceClarity: "Pristydlighet",
      searchSignal: "Sökordning",
    },
  },
  es: {
    title: "Revisión profunda",
    intro: "Convierte los nombres verificados por el registro de esta búsqueda en un Top 10 transparente, con la lógica de puntuación y la evidencia de precios verificados a la vista.",
    ready: (count) => `${count} ${count === 1 ? "nombre verificado disponible está" : "nombres verificados disponibles están"} listos para revisar.`,
    start: "Crear Top 10",
    rerun: "Actualizar Top 10",
    working: "Revisando nombres verificados…",
    noCandidates: "La revisión profunda necesita al menos un dominio disponible verificado por el registro en este resultado.",
    local: "Puntuación local transparente",
    assisted: "Notas editoriales detalladas",
    reviewed: (count) => `Clasificado entre ${count} ${count === 1 ? "nombre disponible verificado por el registro" : "nombres disponibles verificados por el registro"}.`,
    showMethod: "Mostrar método",
    hideMethod: "Ocultar método",
    score: "Puntuación de selección",
    editorial: "Nota editorial",
    caveat: "Es una heurística de selección explicable; no es una valoración de mercado, revisión de marca, opinión legal, garantía de disponibilidad ni recomendación de compra.",
    method: "Calidad del nombre: 60 puntos (longitud, pronunciación y ortografía). Tema: 12. Extensión: 8. Registro: 10. Precio verificado: 5. Orden original: 5. Las variantes repetidas y un mismo nombre con distintas extensiones bajan de posición para ofrecer ideas diferentes, sin cambiar sus puntuaciones individuales.",
    errorTitle: "No se pudo iniciar la revisión profunda",
    labels: {
      readability: "Calidad del nombre",
      relevance: "Afinidad temática",
      extensionFit: "Ajuste de extensión",
      registryEvidence: "Evidencia de registro",
      priceClarity: "Claridad de precio",
      searchSignal: "Orden de búsqueda",
    },
  },
  fr: {
    title: "Analyse approfondie",
    intro: "Transformez les noms vérifiés par le registre de cette recherche en un Top 10 transparent, avec une méthode de score et des éléments de prix vérifiés visibles.",
    ready: (count) => `${count} ${count === 1 ? "nom disponible vérifié est" : "noms disponibles vérifiés sont"} prêt${count === 1 ? "" : "s"} à être analysé${count === 1 ? "" : "s"}.`,
    start: "Créer le Top 10",
    rerun: "Actualiser le Top 10",
    working: "Analyse des noms vérifiés…",
    noCandidates: "L’analyse approfondie nécessite au moins un domaine disponible vérifié par le registre dans ces résultats.",
    local: "Score local transparent",
    assisted: "Notes éditoriales détaillées",
    reviewed: (count) => `Classé parmi ${count} ${count === 1 ? "nom disponible vérifié par le registre" : "noms disponibles vérifiés par le registre"}.`,
    showMethod: "Afficher la méthode",
    hideMethod: "Masquer la méthode",
    score: "Score de sélection",
    editorial: "Note éditoriale",
    caveat: "Il s’agit d’une heuristique de sélection explicable, et non d’une estimation de marché, vérification de marque, opinion juridique, garantie de disponibilité ou recommandation d’achat.",
    method: "Qualité du nom : 60 points (longueur, prononciation et orthographe). Thème : 12. Extension : 8. Registre : 10. Prix vérifié : 5. Ordre initial : 5. Les variantes répétées et le même nom sous plusieurs extensions reculent pour diversifier les idées, sans changer leurs scores individuels.",
    errorTitle: "Impossible de lancer l’analyse approfondie",
    labels: {
      readability: "Qualité du nom",
      relevance: "Pertinence du thème",
      extensionFit: "Pertinence de l’extension",
      registryEvidence: "Preuve du registre",
      priceClarity: "Clarté du prix",
      searchSignal: "Ordre de recherche",
    },
  },
  zh: {
    title: "深度审阅",
    intro: "将本次搜索中已由注册局核验的名称整理为透明的前 10 名，并清楚展示评分逻辑与已核验的价格依据。",
    ready: (count) => `${count} 个已由注册局核验且可注册的名称可供审阅。`,
    start: "生成前 10 名",
    rerun: "刷新前 10 名",
    working: "正在审阅已核验名称…",
    noCandidates: "深度审阅至少需要一个已由注册局核验且可注册的域名。",
    local: "透明本地评分",
    assisted: "详细编辑备注",
    reviewed: (count) => `在 ${count} 个已由注册局核验且可注册的名称中排序。`,
    showMethod: "显示评分方法",
    hideMethod: "隐藏评分方法",
    score: "筛选评分",
    editorial: "编辑备注",
    caveat: "这是可解释的筛选启发式方法，不是市场估值、商标审查、法律意见、可用性保证或购买建议。",
    method: "名称质量：60分（长度、发音及拼写）。主题：12分。后缀：8分。注册局证据：10分。已核验价格：5分。原始搜索顺序：5分。为提供不同创意，重复变体及同名不同后缀会排在后面，但不改变其单独评分。",
    errorTitle: "无法开始深度审阅",
    labels: {
      readability: "名称质量",
      relevance: "主题匹配",
      extensionFit: "后缀匹配",
      registryEvidence: "注册局证据",
      priceClarity: "价格清晰度",
      searchSignal: "搜索顺序",
    },
  },
};

type DeepReviewPanelProps = {
  candidates: DeepReviewCandidate[];
  theme: string;
  language: Language;
  className?: string;
};

const scoreKeys = ["readability", "relevance", "extensionFit", "registryEvidence", "priceClarity", "searchSignal"] as const;

function ReviewEntry({ entry, copy }: { entry: DeepReviewEntry; copy: Copy }) {
  return (
    <article className="rounded-2xl border border-border/80 bg-background p-4 shadow-[0_10px_24px_hsl(215_40%_20%/0.04)]">
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
          {entry.rank}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="truncate text-base font-semibold tracking-[-0.02em] text-foreground">{entry.domain}</h3>
            <Badge variant="secondary" className="shrink-0 font-semibold text-foreground">
              {entry.score}/100
            </Badge>
          </div>
          {entry.editorialNote && (
            <p className="mt-2 text-sm leading-5 text-muted-foreground">
              <span className="font-medium text-foreground">{copy.editorial}: </span>{entry.editorialNote}
            </p>
          )}
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-border/70 pt-3 text-xs sm:grid-cols-3">
            {scoreKeys.map((key) => (
              <div key={key} className="flex items-center justify-between gap-2 text-muted-foreground">
                <dt>{copy.labels[key]}</dt>
                <dd className="font-semibold tabular-nums text-foreground">{entry.scoreBreakdown[key]}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </article>
  );
}

export default function DeepReviewPanel({ candidates, theme, language, className = "" }: DeepReviewPanelProps) {
  const copy = copyByLanguage[language];
  const { toast } = useToast();
  const reviewable = useMemo(() => candidates.filter(isDeepReviewCandidate), [candidates]);
  const [result, setResult] = useState<DeepReviewResult | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);
  const [showMethod, setShowMethod] = useState(false);

  const handleReview = async () => {
    setIsReviewing(true);
    try {
      setResult(await runDeepReview(reviewable, theme, language));
    } catch (error) {
      toast({
        title: copy.errorTitle,
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setIsReviewing(false);
    }
  };

  return (
    <section className={`overflow-hidden rounded-[1.5rem] border border-primary/20 bg-card shadow-[0_16px_42px_hsl(215_50%_20%/0.07)] ${className}`} aria-labelledby="deep-review-heading">
      <div className="border-b border-border/80 bg-gradient-to-r from-primary/[0.09] via-primary/[0.035] to-transparent p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <ClipboardCheck className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="deep-review-heading" className="text-lg font-semibold tracking-[-0.025em] text-foreground">{copy.title}</h2>
                {result && (
                  <Badge variant="outline" className="border-primary/25 bg-background/70 text-primary">
                    {result.analysisSource === "ai" ? copy.assisted : copy.local}
                  </Badge>
                )}
              </div>
              <p className="mt-1 max-w-2xl text-sm leading-5 text-muted-foreground">{copy.intro}</p>
            </div>
          </div>
          <Button onClick={handleReview} disabled={isReviewing || reviewable.length === 0} className="shrink-0 sm:min-w-40">
            {isReviewing ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="h-4 w-4" aria-hidden="true" />}
            {isReviewing ? copy.working : result ? copy.rerun : copy.start}
          </Button>
        </div>
        <p className="mt-4 text-xs leading-5 text-muted-foreground">
          {reviewable.length > 0 ? copy.ready(reviewable.length) : copy.noCandidates}
        </p>
      </div>

      {result && (
        <div className="p-4 sm:p-5">
          <p className="text-sm text-muted-foreground">{copy.reviewed(result.reviewedCount)}</p>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {result.top10.map((entry) => <ReviewEntry key={entry.domain} entry={entry} copy={copy} />)}
          </div>
          <button
            type="button"
            onClick={() => setShowMethod((value) => !value)}
            className="mt-4 inline-flex items-center gap-2 rounded-lg px-1 py-1 text-sm font-medium text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-expanded={showMethod}
          >
            {showMethod ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
            {showMethod ? copy.hideMethod : copy.showMethod}
          </button>
          {showMethod && (
            <div className="mt-2 rounded-xl border border-border bg-secondary/45 p-3 text-xs leading-5 text-muted-foreground">
              <p><strong className="font-semibold text-foreground">{copy.score}:</strong> {scoreKeys.map((key) => copy.labels[key]).join(" · ")}.</p>
              <p className="mt-2">{copy.method}</p>
              <p className="mt-2">{copy.caveat}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
