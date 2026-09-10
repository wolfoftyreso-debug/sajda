import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Compass, Lightbulb, RefreshCw } from "lucide-react";
import type { Language } from "@/i18n/LanguageProvider";
import {
  getContextualSajdaInspiration,
  SAJDA_INSPIRATION_IDS,
  type SajdaInspirationSearchContext,
  type SajdaInspirationDirection,
} from "@/lib/sajdaInspiration";
import { cn } from "@/lib/utils";

const INSPIRATION_STORAGE_KEY = "sajda.inspiration-cycle.v1";

interface StoredInspirationCycle {
  version: 1;
  ids: string[];
  cursor: number;
  lastId?: string;
}

let volatileCycle: StoredInspirationCycle | null = null;

interface InspirationCopy {
  eyebrow: string;
  contextualRouteLabel: string;
  genericRouteLabel: string;
  sourceLabel: string;
  sourceBrief: string;
  sourceSearch: string;
  sourceEmpty: string;
  sourceDescription: string;
  extensionsLabel: string;
  extensionsEmpty: string;
  namingCues: string;
  guardrail: string;
  useDirection: string;
  newDirection: string;
  reframing: string;
  reframingStatus: string;
  directionChanged: string;
}

const copy: Record<Language, InspirationCopy> = {
  en: {
    eyebrow: "Sajda inspiration",
    contextualRouteLabel: "Based on your current search",
    genericRouteLabel: "A handpicked starting idea",
    sourceLabel: "Current input",
    sourceBrief: "Brief",
    sourceSearch: "Search",
    sourceEmpty: "Add a theme or description above to tailor the next idea to your search.",
    sourceDescription: "These words will be included when you use this idea in your search.",
    extensionsLabel: "Selected extensions",
    extensionsEmpty: "Set extensions below",
    namingCues: "Starting words",
    guardrail: "Naming tip",
    useDirection: "Use in search",
    newDirection: "Try another",
    reframing: "Finding another idea",
    reframingStatus: "Finding another naming idea based on your input",
    directionChanged: "A new naming idea is ready",
  },
  sv: {
    eyebrow: "Sajda-inspiration",
    contextualRouteLabel: "Utifrån din aktuella sökning",
    genericRouteLabel: "En utvald idé att börja med",
    sourceLabel: "Ditt underlag",
    sourceBrief: "Beskrivning",
    sourceSearch: "Sökning",
    sourceEmpty: "Lägg till ett tema eller en beskrivning ovan för att anpassa nästa idé till din sökning.",
    sourceDescription: "De här orden följer med när du använder idén i din sökning.",
    extensionsLabel: "Valda ändelser",
    extensionsEmpty: "Välj ändelser nedan",
    namingCues: "Ord att utgå från",
    guardrail: "Tips när du väljer namn",
    useDirection: "Använd i sökning",
    newDirection: "Prova en annan idé",
    reframing: "Tar fram en ny idé",
    reframingStatus: "Tar fram en annan namnidé utifrån ditt underlag",
    directionChanged: "En ny namnidé är redo",
  },
  es: {
    eyebrow: "Inspiración Sajda",
    contextualRouteLabel: "Basada en tu búsqueda actual",
    genericRouteLabel: "Una idea seleccionada para empezar",
    sourceLabel: "Lo que has escrito",
    sourceBrief: "Descripción",
    sourceSearch: "Búsqueda",
    sourceEmpty: "Añade un tema o una descripción arriba para adaptar la siguiente idea a tu búsqueda.",
    sourceDescription: "Estas palabras se incluirán cuando uses la idea en tu búsqueda.",
    extensionsLabel: "Extensiones elegidas",
    extensionsEmpty: "Elige extensiones abajo",
    namingCues: "Palabras para empezar",
    guardrail: "Consejo para elegir un nombre",
    useDirection: "Usar en la búsqueda",
    newDirection: "Probar otra",
    reframing: "Buscando otra idea",
    reframingStatus: "Buscando otra idea de nombre a partir de lo que has escrito",
    directionChanged: "Ya tienes una nueva idea de nombre",
  },
  fr: {
    eyebrow: "Inspiration Sajda",
    contextualRouteLabel: "D’après votre recherche actuelle",
    genericRouteLabel: "Une idée sélectionnée pour commencer",
    sourceLabel: "Ce que vous avez saisi",
    sourceBrief: "Description",
    sourceSearch: "Recherche",
    sourceEmpty: "Ajoutez un thème ou une description ci-dessus pour adapter la prochaine idée à votre recherche.",
    sourceDescription: "Ces mots seront repris lorsque vous utiliserez cette idée dans votre recherche.",
    extensionsLabel: "Extensions sélectionnées",
    extensionsEmpty: "Choisissez des extensions ci-dessous",
    namingCues: "Mots de départ",
    guardrail: "Conseil pour choisir un nom",
    useDirection: "Utiliser dans la recherche",
    newDirection: "Essayer une autre",
    reframing: "Recherche d’une autre idée",
    reframingStatus: "Recherche d’une autre idée de nom à partir de votre saisie",
    directionChanged: "Une nouvelle idée de nom est prête",
  },
  zh: {
    eyebrow: "Sajda 灵感",
    contextualRouteLabel: "根据当前搜索调整",
    genericRouteLabel: "精选灵感，帮你起步",
    sourceLabel: "当前输入",
    sourceBrief: "说明",
    sourceSearch: "搜索",
    sourceEmpty: "在上方添加主题或描述，让下一条建议更贴合你的搜索。",
    sourceDescription: "使用这条灵感时，搜索会包含这些词语。",
    extensionsLabel: "已选后缀",
    extensionsEmpty: "请在下方选择后缀",
    namingCues: "起始词语",
    guardrail: "命名建议",
    useDirection: "用于搜索",
    newDirection: "换一个试试",
    reframing: "正在寻找新灵感",
    reframingStatus: "正在根据你的输入寻找另一条命名思路",
    directionChanged: "新的命名灵感已就绪",
  },
};

function randomInteger(upperBound: number) {
  return Math.floor(Math.random() * upperBound);
}

function shuffle(ids: readonly string[], lastId?: string) {
  const shuffled = [...ids];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInteger(index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  if (lastId && shuffled.length > 1 && shuffled[0] === lastId) {
    const swapIndex = 1 + randomInteger(shuffled.length - 1);
    [shuffled[0], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[0]];
  }

  return shuffled;
}

function isValidCycle(value: unknown): value is StoredInspirationCycle {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StoredInspirationCycle>;
  if (candidate.version !== 1 || !Array.isArray(candidate.ids) || typeof candidate.cursor !== "number") return false;
  if (candidate.ids.length !== SAJDA_INSPIRATION_IDS.length || candidate.cursor < 0 || candidate.cursor > candidate.ids.length) return false;

  const expected = new Set(SAJDA_INSPIRATION_IDS);
  const stored = new Set(candidate.ids);
  return stored.size === expected.size && [...stored].every((id) => expected.has(id));
}

function readCycle(): StoredInspirationCycle | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(INSPIRATION_STORAGE_KEY);
    if (!raw) return volatileCycle;
    const parsed: unknown = JSON.parse(raw);
    return isValidCycle(parsed) ? parsed : volatileCycle;
  } catch {
    return volatileCycle;
  }
}

function writeCycle(cycle: StoredInspirationCycle) {
  volatileCycle = cycle;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(INSPIRATION_STORAGE_KEY, JSON.stringify(cycle));
  } catch {
    // The component remains usable in private or storage-restricted sessions.
  }
}

function createCycle(lastId?: string): StoredInspirationCycle {
  return {
    version: 1,
    ids: shuffle(SAJDA_INSPIRATION_IDS, lastId),
    cursor: 0,
    lastId,
  };
}

function takeNextDirectionId() {
  const restored = readCycle();
  const current = restored && restored.cursor < restored.ids.length
    ? restored
    : createCycle(restored?.lastId);
  const id = current.ids[current.cursor];
  writeCycle({ ...current, cursor: current.cursor + 1, lastId: id });
  return id;
}

export interface SajdaInspirationProps {
  /** Current interface language; directions are translated while preserving the route ID. */
  language: Language;
  /** Visible draft data used to tailor the current curated route. */
  searchContext?: SajdaInspirationSearchContext;
  /** Receives a prompt-ready strategic direction for the existing domain search. */
  onUseDirection: (direction: SajdaInspirationDirection) => void;
  /** Optional layout hook for the landing state. */
  className?: string;
}

/**
 * A small, deliberate naming route for the landing state. It saves a shuffled
 * sequence in browser storage so "New direction" will not repeat a route until
 * the full curated set has been explored.
 */
export default function SajdaInspiration({
  language,
  searchContext,
  onUseDirection,
  className,
}: SajdaInspirationProps) {
  const [directionId, setDirectionId] = useState(() => takeNextDirectionId());
  const [statusMessage, setStatusMessage] = useState("");
  const [isReframing, setIsReframing] = useState(false);
  const reframingTimer = useRef<number | null>(null);
  const strings = copy[language];
  const contextKeyword = searchContext?.keyword ?? "";
  const contextBrief = searchContext?.brief ?? "";
  const contextIsAdvanced = Boolean(searchContext?.isAdvanced);
  const contextTlds = (searchContext?.selectedTlds ?? []).join("|");
  const normalizedSearchContext = useMemo<SajdaInspirationSearchContext>(
    () => ({
      keyword: contextKeyword,
      brief: contextBrief,
      isAdvanced: contextIsAdvanced,
      selectedTlds: contextTlds ? contextTlds.split("|") : [],
    }),
    [contextBrief, contextIsAdvanced, contextKeyword, contextTlds],
  );
  const contextualInspiration = useMemo(
    () => getContextualSajdaInspiration(language, directionId, normalizedSearchContext),
    [directionId, language, normalizedSearchContext],
  );
  const { direction, hasContext, inputTerms, selectedTlds, source } = contextualInspiration;
  const visibleTlds = selectedTlds.slice(0, 3);
  const remainingTldCount = Math.max(selectedTlds.length - visibleTlds.length, 0);
  const sourceType = source === "brief" ? strings.sourceBrief : strings.sourceSearch;
  const contentKey = `${direction.id}:${inputTerms.join("|")}`;

  useEffect(() => () => {
    if (reframingTimer.current !== null) {
      window.clearTimeout(reframingTimer.current);
    }
  }, []);

  const showNextDirection = useCallback(() => {
    if (isReframing) return;
    setIsReframing(true);
    setStatusMessage(strings.reframingStatus);
    reframingTimer.current = window.setTimeout(() => {
      setDirectionId(takeNextDirectionId());
      setIsReframing(false);
      setStatusMessage(strings.directionChanged);
      reframingTimer.current = null;
    }, 420);
  }, [isReframing, strings.directionChanged, strings.reframingStatus]);

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-card via-card to-primary/[0.055] p-4 shadow-[0_16px_36px_hsl(210_30%_18%/0.065)] sm:p-5",
        className,
      )}
      aria-labelledby="sajda-inspiration-title"
      aria-busy={isReframing}
    >
      <div aria-hidden="true" className="pointer-events-none absolute right-[-3rem] top-[-4rem] h-36 w-36 rounded-full border border-primary/[0.12] bg-primary/[0.035]" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent" />

      <div className="relative grid gap-4 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center md:gap-5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/[0.09] text-primary shadow-[0_5px_14px_hsl(213_82%_50%/0.10)]" aria-hidden="true">
          <Compass className="h-[1.1rem] w-[1.1rem]" strokeWidth={2.05} />
        </span>

        <div key={contentKey} className="min-w-0 animate-in fade-in slide-in-from-bottom-1 duration-300 motion-reduce:animate-none">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-primary">{strings.eyebrow}</p>
            <span aria-hidden="true" className="relative flex h-1.5 w-1.5">
              {hasContext && <span className="absolute inline-flex h-full w-full rounded-full bg-primary/45 motion-safe:animate-ping" />}
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
            </span>
            <p className="text-xs font-medium text-muted-foreground">
              {hasContext ? strings.contextualRouteLabel : strings.genericRouteLabel}
            </p>
          </div>
          <h2 id="sajda-inspiration-title" className="mt-1 text-lg font-semibold tracking-[-0.025em] text-foreground sm:text-xl">
            {direction.title}
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{direction.rationale}</p>
        </div>

        <div className="flex shrink-0 gap-2 md:justify-self-end">
          <button
            type="button"
            onClick={showNextDirection}
            disabled={isReframing}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-background/90 px-3 text-sm font-semibold text-foreground transition-colors hover:border-primary/35 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-75 motion-reduce:transition-none"
          >
            <RefreshCw className={cn("h-3.5 w-3.5 text-primary", isReframing && "animate-spin")} aria-hidden="true" />
            {isReframing ? strings.reframing : strings.newDirection}
          </button>
          <button
            type="button"
            onClick={() => onUseDirection(direction)}
            disabled={isReframing}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-semibold text-primary-foreground shadow-[0_7px_16px_hsl(213_82%_50%/0.20)] transition-colors hover:bg-primary/90 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-75 motion-reduce:transition-none"
          >
            {strings.useDirection}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="relative mt-4 grid gap-3 rounded-xl border border-primary/[0.13] bg-background/70 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{strings.sourceLabel}</p>
            {hasContext && (
              <span className="rounded-full border border-primary/15 bg-primary/[0.06] px-2 py-0.5 text-[0.65rem] font-semibold text-primary">
                {sourceType}
              </span>
            )}
          </div>
          {hasContext ? (
            <>
              <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label={strings.sourceLabel}>
                {inputTerms.map((term) => (
                  <li key={term} className="max-w-full truncate rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground shadow-[0_2px_7px_hsl(213_82%_50%/0.15)]">
                    {term}
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{strings.sourceDescription}</p>
            </>
          ) : (
            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{strings.sourceEmpty}</p>
          )}
        </div>

        <div className="min-w-0 sm:border-l sm:border-border/75 sm:pl-5">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{strings.extensionsLabel}</p>
          {visibleTlds.length ? (
            <div className="mt-1.5 flex flex-wrap gap-1.5" aria-label={strings.extensionsLabel}>
              {visibleTlds.map((tld) => (
                <span key={tld} className="rounded-md border border-border bg-card px-2 py-1 font-mono text-xs font-semibold text-foreground">.{tld}</span>
              ))}
              {remainingTldCount > 0 && (
                <span className="rounded-md border border-border bg-card px-2 py-1 text-xs font-semibold text-muted-foreground">+{remainingTldCount}</span>
              )}
            </div>
          ) : (
            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{strings.extensionsEmpty}</p>
          )}
        </div>
      </div>

      <div className="relative mt-3 grid gap-3 border-t border-border/75 pt-3.5 sm:grid-cols-[minmax(0,1fr)_minmax(13rem,0.8fr)] sm:items-center sm:gap-5">
        <div className="flex min-w-0 gap-2.5 text-xs leading-5 text-muted-foreground">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-secondary text-primary" aria-hidden="true">
            <Lightbulb className="h-3 w-3" strokeWidth={2.1} />
          </span>
          <p><span className="font-semibold text-foreground">{strings.guardrail}:</span> {direction.guardrail}</p>
        </div>

        <div className="min-w-0 sm:border-l sm:border-border/75 sm:pl-5">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{strings.namingCues}</p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label={strings.namingCues}>
            {direction.starterTerms.map((term) => (
              <li key={term} className="rounded-full border border-primary/15 bg-primary/[0.055] px-2.5 py-1 text-xs font-medium text-primary">
                {term}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{statusMessage}</p>
    </section>
  );
}
