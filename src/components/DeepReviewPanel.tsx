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
    title: "Deep review",
    intro: "Compare the available names verified by the registry and build a Top 10. See how each name is scored and which prices have been verified.",
    ready: (count) => `${count} verified available ${count === 1 ? "name is" : "names are"} ready for review.`,
    start: "Build Top 10",
    rerun: "Refresh Top 10",
    working: "Reviewing verified names…",
    noCandidates: "At least one domain in these results must be confirmed available by the registry before you can start a review.",
    local: "Local scoring with a clear breakdown",
    assisted: "Detailed name assessments",
    reviewed: (count) => `Ranked from ${count} registry-verified available ${count === 1 ? "name" : "names"}.`,
    showMethod: "How scoring works",
    hideMethod: "Hide scoring method",
    score: "Shortlist score",
    editorial: "Name assessment",
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
    intro: "Jämför de namn som domänregistret har bekräftat som lediga och skapa en topp 10. Se hur poängen beräknas och vilka priser som har verifierats.",
    ready: (count) => `${count} ${count === 1 ? "namn har bekräftats ledigt" : "namn har bekräftats lediga"} och kan granskas.`,
    start: "Skapa topp 10",
    rerun: "Uppdatera topp 10",
    working: "Granskar verifierade namn…",
    noCandidates: "Minst en domän i resultatet behöver vara bekräftat ledig av domänregistret för att granskningen ska kunna börja.",
    local: "Lokal poängsättning med tydlig förklaring",
    assisted: "Fördjupade namnbedömningar",
    reviewed: (count) => `Urval från ${count} namn som domänregistret har bekräftat som lediga.`,
    showMethod: "Så fungerar poängen",
    hideMethod: "Dölj poängmetoden",
    score: "Urvalspoäng",
    editorial: "Namnbedömning",
    caveat: "Detta är en förklarbar urvalsheuristik — inte en marknadsvärdering, varumärkesgranskning, juridisk bedömning, tillgänglighetsgaranti eller köprekommendation.",
    method: "Namnkvalitet: 60 poäng (längd, uttal och stavning). Tematräff: 12. Ändelse: 8. Registerunderlag: 10. Verifierat pris: 5. Ursprunglig sökordning: 5. Ordningen prioriterar också olika idéer: upprepade standardvarianter och samma namn med flera ändelser flyttas ned, utan att deras enskilda poäng ändras.",
    errorTitle: "Djupgranskningen kunde inte starta",
    labels: {
      readability: "Namnkvalitet",
      relevance: "Passar temat",
      extensionFit: "Passar ändelsen",
      registryEvidence: "Registerunderlag",
      priceClarity: "Tydligt pris",
      searchSignal: "Sökordning",
    },
  },
  es: {
    title: "Análisis detallado",
    intro: "Compara los nombres que el registro ha confirmado como disponibles y crea un Top 10. Consulta cómo se puntúa cada nombre y qué precios se han verificado.",
    ready: (count) => `${count} ${count === 1 ? "nombre confirmado como disponible está listo" : "nombres confirmados como disponibles están listos"} para analizar.`,
    start: "Crear Top 10",
    rerun: "Actualizar Top 10",
    working: "Revisando nombres verificados…",
    noCandidates: "Para iniciar el análisis, al menos un dominio de estos resultados debe estar confirmado como disponible por el registro.",
    local: "Puntuación local con un desglose claro",
    assisted: "Evaluaciones detalladas de los nombres",
    reviewed: (count) => `Selección de ${count} ${count === 1 ? "nombre confirmado como disponible" : "nombres confirmados como disponibles"} por el registro.`,
    showMethod: "Cómo se calcula la puntuación",
    hideMethod: "Ocultar el método de puntuación",
    score: "Puntuación de selección",
    editorial: "Evaluación del nombre",
    caveat: "Es una heurística de selección explicable; no es una valoración de mercado, revisión de marca, opinión legal, garantía de disponibilidad ni recomendación de compra.",
    method: "Calidad del nombre: 60 puntos (longitud, pronunciación y ortografía). Tema: 12. Extensión: 8. Registro: 10. Precio verificado: 5. Orden original: 5. Las variantes repetidas y un mismo nombre con distintas extensiones bajan de posición para ofrecer ideas diferentes, sin cambiar sus puntuaciones individuales.",
    errorTitle: "No se pudo iniciar el análisis detallado",
    labels: {
      readability: "Calidad del nombre",
      relevance: "Afinidad temática",
      extensionFit: "Idoneidad de la extensión",
      registryEvidence: "Confirmación del registro",
      priceClarity: "Claridad del precio",
      searchSignal: "Orden de búsqueda",
    },
  },
  fr: {
    title: "Analyse approfondie",
    intro: "Comparez les noms confirmés disponibles par le registre et créez un Top 10. Consultez le détail des scores et les prix qui ont été vérifiés.",
    ready: (count) => `${count} ${count === 1 ? "nom disponible vérifié est" : "noms disponibles vérifiés sont"} prêt${count === 1 ? "" : "s"} à être analysé${count === 1 ? "" : "s"}.`,
    start: "Créer le Top 10",
    rerun: "Actualiser le Top 10",
    working: "Analyse des noms vérifiés…",
    noCandidates: "L’analyse approfondie nécessite au moins un domaine disponible vérifié par le registre dans ces résultats.",
    local: "Score local avec un détail clair",
    assisted: "Évaluations détaillées des noms",
    reviewed: (count) => `Sélection parmi ${count} ${count === 1 ? "nom confirmé disponible" : "noms confirmés disponibles"} par le registre.`,
    showMethod: "Comment le score est calculé",
    hideMethod: "Masquer la méthode de calcul",
    score: "Score de sélection",
    editorial: "Évaluation du nom",
    caveat: "Il s’agit d’une heuristique de sélection explicable, et non d’une estimation de marché, vérification de marque, opinion juridique, garantie de disponibilité ou recommandation d’achat.",
    method: "Qualité du nom : 60 points (longueur, prononciation et orthographe). Thème : 12. Extension : 8. Registre : 10. Prix vérifié : 5. Ordre initial : 5. Les variantes répétées et le même nom sous plusieurs extensions reculent pour diversifier les idées, sans changer leurs scores individuels.",
    errorTitle: "Impossible de lancer l’analyse approfondie",
    labels: {
      readability: "Qualité du nom",
      relevance: "Pertinence du thème",
      extensionFit: "Pertinence de l’extension",
      registryEvidence: "Confirmation du registre",
      priceClarity: "Clarté du prix",
      searchSignal: "Ordre de recherche",
    },
  },
  zh: {
    title: "深度分析",
    intro: "比较注册局已确认可注册的名称，生成前 10 名。查看每个名称的评分依据，以及哪些价格已经核验。",
    ready: (count) => `${count} 个已确认可注册的名称可供分析。`,
    start: "生成前 10 名",
    rerun: "刷新前 10 名",
    working: "正在分析已核验的名称…",
    noCandidates: "搜索结果中至少需要一个经注册局确认可注册的域名，才能开始分析。",
    local: "本地评分，明细清晰",
    assisted: "详细名称评估",
    reviewed: (count) => `从 ${count} 个经注册局确认可注册的名称中筛选排序。`,
    showMethod: "查看评分方法",
    hideMethod: "收起评分方法",
    score: "筛选评分",
    editorial: "名称评估",
    caveat: "这是可解释的筛选启发式方法，不是市场估值、商标审查、法律意见、可用性保证或购买建议。",
    method: "名称质量：60分（长度、发音及拼写）。主题：12分。后缀：8分。注册局证据：10分。已核验价格：5分。原始搜索顺序：5分。为提供不同创意，重复变体及同名不同后缀会排在后面，但不改变其单独评分。",
    errorTitle: "无法开始深度分析",
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
