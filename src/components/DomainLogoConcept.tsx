import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Download, PenTool, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLanguage } from "@/i18n/LanguageProvider";
import {
  createProceduralLogoConcept,
  downloadProceduralLogoConcept,
  type ProceduralLogoConcept,
} from "@/lib/proceduralLogo";

const DAILY_BETA_LIMIT = 3;
const USAGE_KEY_PREFIX = "sajda-logo-concept-beta";

const logoCopy = {
  en: {
    action: "Create logo concept",
    viewAction: "View logo concept",
    beta: "Beta",
    eyebrow: "Local logo concept · Beta",
    title: "A first visual direction for {domain}",
    description: "A one-off SVG study made in this browser from the domain name. It is a starting point, not a trademark clearance or final identity.",
    localNote: "Made in your browser. No domain data is sent to an external image generator.",
    variation: "New variation",
    download: "Download SVG",
    remaining: "Logo concepts left today: {count}",
    concept: "concept",
    concepts: "concepts",
    limitTitle: "You’ve reached today’s logo concept limit",
    limitDescription: "This browser keeps a small daily preview limit. A saved concept remains available to download.",
    style: "Direction: {style}",
  },
  sv: {
    action: "Skapa logokoncept",
    viewAction: "Visa logokoncept",
    beta: "Beta",
    eyebrow: "Lokalt logokoncept · Beta",
    title: "En första visuell riktning för {domain}",
    description: "Ett första logoförslag i SVG-format, skapat i den här webbläsaren utifrån domännamnet. Det är en utgångspunkt, inte en varumärkesgranskning eller en färdig grafisk identitet.",
    localNote: "Skapas i din webbläsare. Ingen domändata skickas till en extern bildgenerator.",
    variation: "Ny variation",
    download: "Hämta SVG",
    remaining: "Logoförslag kvar i dag: {count}",
    concept: "koncept",
    concepts: "koncept",
    limitTitle: "Du har nått dagens gräns för logoförslag",
    limitDescription: "Du kan skapa ett begränsat antal förslag per dag i den här webbläsaren. Förslag du redan har skapat går fortfarande att hämta.",
    style: "Riktning: {style}",
  },
  es: {
    action: "Crear concepto de logo",
    viewAction: "Ver concepto de logo",
    beta: "Beta",
    eyebrow: "Concepto de logo local · Beta",
    title: "Una primera dirección visual para {domain}",
    description: "Un estudio SVG único creado en este navegador a partir del dominio. Es un punto de partida, no una validación de marca ni una identidad final.",
    localNote: "Se crea en tu navegador. No se envían datos del dominio a un generador de imágenes externo.",
    variation: "Nueva variación",
    download: "Descargar SVG",
    remaining: "Conceptos de logo disponibles hoy: {count}",
    concept: "concepto",
    concepts: "conceptos",
    limitTitle: "Ya usaste los conceptos beta locales de hoy",
    limitDescription: "Puedes crear un número limitado de conceptos al día en este navegador. Los que ya hayas creado siguen disponibles para descargar.",
    style: "Dirección: {style}",
  },
  fr: {
    action: "Créer un concept de logo",
    viewAction: "Voir le concept de logo",
    beta: "Bêta",
    eyebrow: "Concept de logo local · Bêta",
    title: "Une première direction visuelle pour {domain}",
    description: "Une étude SVG unique créée dans ce navigateur à partir du domaine. C’est un point de départ, pas une vérification de marque ni une identité finale.",
    localNote: "Créé dans votre navigateur. Aucune donnée de domaine n’est envoyée vers un générateur d’images externe.",
    variation: "Nouvelle variation",
    download: "Télécharger le SVG",
    remaining: "Concepts de logo restants aujourd’hui : {count}",
    concept: "concept",
    concepts: "concepts",
    limitTitle: "Les concepts bêta locaux du jour ont été utilisés",
    limitDescription: "Le nombre de concepts que vous pouvez créer chaque jour dans ce navigateur est limité. Les concepts déjà créés restent téléchargeables.",
    style: "Direction : {style}",
  },
  zh: {
    action: "创建徽标概念",
    viewAction: "查看徽标概念",
    beta: "测试版",
    eyebrow: "本地徽标概念 · 测试版",
    title: "为 {domain} 提供一个初步视觉方向",
    description: "这是根据域名在当前浏览器中生成的一次性 SVG 研究稿。它是一个起点，不代表商标核验或最终品牌标识。",
    localNote: "在你的浏览器中生成。域名数据不会发送到外部图像生成器。",
    variation: "新变体",
    download: "下载 SVG",
    remaining: "今天还可生成 {count} 个徽标方案",
    concept: "概念",
    concepts: "概念",
    limitTitle: "今天的本地测试版概念已用完",
    limitDescription: "此浏览器保留了少量每日预览次数。已经生成的概念仍可以下载。",
    style: "方向：{style}",
  },
} as const;

type LogoLanguage = keyof typeof logoCopy;

function activeLanguage(value: string): LogoLanguage {
  if (value === "sv" || value === "es" || value === "fr" || value === "zh") return value;
  return "en";
}

function localDayKey() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${USAGE_KEY_PREFIX}:${date.getFullYear()}-${month}-${day}`;
}

function readLocalUsage() {
  if (typeof window === "undefined") return 0;
  try {
    const stored = Number.parseInt(window.localStorage.getItem(localDayKey()) ?? "0", 10);
    return Number.isFinite(stored) ? Math.max(0, Math.min(stored, DAILY_BETA_LIMIT)) : 0;
  } catch {
    return 0;
  }
}

function writeLocalUsage(nextValue: number) {
  try {
    window.localStorage.setItem(localDayKey(), String(nextValue));
  } catch {
    // A private browser mode may not expose storage. The current tab still has
    // its state, so the beta preview remains functional without persisting it.
  }
}

function replace(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(count|concept|style|domain|countPlural)\}/g, (_, key: string) => String(values[key] ?? ""));
}

interface DomainLogoConceptProps {
  domain: string;
  className?: string;
}

/**
 * A compact, client-only logo study action for a domain card. It intentionally
 * uses procedural SVG rather than implying an unavailable external model.
 */
const DomainLogoConcept = ({ domain, className }: DomainLogoConceptProps) => {
  const { language } = useLanguage();
  const copy = logoCopy[activeLanguage(language as string)];
  const [concept, setConcept] = useState<ProceduralLogoConcept | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [usedCount, setUsedCount] = useState(readLocalUsage);
  const usedCountRef = useRef(usedCount);
  const remaining = Math.max(0, DAILY_BETA_LIMIT - usedCount);
  const remainingLabel = useMemo(() => replace(copy.remaining, {
    count: remaining,
    concept: remaining === 1 ? copy.concept : copy.concepts,
    countPlural: remaining === 1 ? "" : "s",
  }), [copy, remaining]);

  useEffect(() => {
    setConcept(null);
    setIsOpen(false);
  }, [domain]);

  useEffect(() => {
    usedCountRef.current = usedCount;
  }, [usedCount]);

  const createVariation = useCallback(() => {
    const currentUsage = usedCountRef.current;
    if (currentUsage >= DAILY_BETA_LIMIT) return false;
    const nextUsage = currentUsage + 1;
    usedCountRef.current = nextUsage;
    setConcept(createProceduralLogoConcept(domain));
    setUsedCount(nextUsage);
    writeLocalUsage(nextUsage);
    return true;
  }, [domain]);

  const openConcept = () => {
    setIsOpen(true);
    if (!concept) createVariation();
  };

  const stopSwipePointer = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onPointerDown={stopSwipePointer}
        onClick={openConcept}
        className={className}
        aria-label={`${concept ? copy.viewAction : copy.action}: ${domain}`}
      >
        <PenTool className="h-4 w-4" aria-hidden="true" />
        {concept ? copy.viewAction : copy.action}
        <span className="rounded-full border border-primary/20 bg-primary/5 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-primary">
          {copy.beta}
        </span>
      </Button>

      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-2xl overflow-y-auto rounded-[1.5rem] border-border bg-card p-5 shadow-[0_24px_72px_hsl(0_0%_10%/0.22)] sm:p-7">
        <DialogHeader className="pr-8 text-left">
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">{copy.eyebrow}</p>
          <DialogTitle className="mt-1 text-2xl tracking-[-0.035em] text-foreground sm:text-3xl">
            {replace(copy.title, { domain })}
          </DialogTitle>
          <DialogDescription className="mt-2 max-w-xl leading-6 text-muted-foreground">
            {copy.description}
          </DialogDescription>
        </DialogHeader>

        {concept ? (
          <div className="overflow-hidden rounded-2xl border border-border bg-[linear-gradient(135deg,hsl(var(--secondary))_0%,hsl(var(--background))_100%)] p-2 sm:p-3">
            <img
              src={concept.dataUrl}
              alt={`${domain} ${copy.action.toLowerCase()}`}
              className="aspect-[16/9] w-full rounded-xl border border-border/70 bg-white object-cover"
            />
          </div>
        ) : (
          <div className="flex aspect-[16/9] items-center justify-center rounded-2xl border border-dashed border-border bg-secondary/40 p-6 text-center text-sm text-muted-foreground">
            {copy.limitDescription}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <div>
            {concept && <p className="text-sm font-semibold text-foreground">{replace(copy.style, { style: concept.styleName })}</p>}
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{copy.localNote}</p>
          </div>
          <p className="rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold text-foreground">{remainingLabel}</p>
        </div>

        {remaining === 0 && !concept && (
          <div className="rounded-xl border border-primary/15 bg-primary/5 px-4 py-3">
            <p className="text-sm font-semibold text-foreground">{copy.limitTitle}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{copy.limitDescription}</p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {concept && (
            <Button
              type="button"
              variant="outline"
              onClick={() => downloadProceduralLogoConcept(concept)}
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              {copy.download}
            </Button>
          )}
          <Button type="button" onClick={createVariation} disabled={remaining <= 0}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            {copy.variation}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DomainLogoConcept;
