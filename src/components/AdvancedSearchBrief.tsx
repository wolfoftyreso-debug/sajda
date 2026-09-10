import type { ReactNode } from "react";
import { FileText, Minus, Plus } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/i18n/LanguageProvider";
import AdvancedSearchCriteriaPanel from "@/components/AdvancedSearchCriteria";
import AiPrivacyControl from "@/components/AiPrivacyControl";
import {
  countAdvancedBriefWords,
  limitAdvancedBriefWords,
  MAX_ADVANCED_BRIEF_WORDS,
} from "@/lib/advancedSearchBrief";
import type { AdvancedSearchCriteria } from "@/lib/advancedSearchCriteria";

interface AdvancedSearchBriefProps {
  enabled: boolean;
  value: string;
  disabled?: boolean;
  criteria: AdvancedSearchCriteria;
  children?: ReactNode;
  onEnabledChange: (enabled: boolean) => void;
  onValueChange: (value: string) => void;
  onCriteriaChange: (criteria: AdvancedSearchCriteria) => void;
}

export default function AdvancedSearchBrief({
  enabled,
  value,
  disabled = false,
  criteria,
  children,
  onEnabledChange,
  onValueChange,
  onCriteriaChange,
}: AdvancedSearchBriefProps) {
  const { language } = useLanguage();
  const presentationLanguage = language as string;
  const wordCount = countAdvancedBriefWords(value);
  const copy = presentationLanguage === "sv"
    ? {
        title: "Avancerad sökning",
        open: "Öppna avancerad sökning",
        close: "Stäng avancerad sökning",
        description: "Beskriv din idé och välj ändelser, stil och ord som ska ingå eller undvikas.",
        label: "Din beskrivning",
        placeholder: "Berätta om idén, målgruppen, känslan, ord du gillar eller vill undvika och vilka typer av namn som kan passa.",
        wordCount: `${wordCount} / ${MAX_ADVANCED_BRIEF_WORDS} ord`,
        support: "Ta med det som gör idén särskild. Undvik känsliga uppgifter — beskrivningen skickas till söktjänsten för analys.",
      }
    : presentationLanguage === "es"
      ? {
          title: "Búsqueda avanzada",
          open: "Abrir búsqueda avanzada",
          close: "Cerrar búsqueda avanzada",
          description: "Describe tu idea y elige las extensiones, el estilo y las palabras que quieres incluir o evitar.",
          label: "Tu descripción",
          placeholder: "Describe la idea, el público, la sensación, palabras que te gustan o quieres evitar y los tipos de nombres que podrían encajar.",
          wordCount: `${wordCount} / ${MAX_ADVANCED_BRIEF_WORDS} palabras`,
          support: "Incluye lo que hace especial a tu idea. Evita información confidencial: la descripción se envía al servicio de búsqueda para su análisis.",
        }
      : presentationLanguage === "fr"
        ? {
            title: "Recherche avancée",
            open: "Ouvrir la recherche avancée",
            close: "Fermer la recherche avancée",
            description: "Décrivez votre idée et choisissez les extensions, le style et les mots à inclure ou à éviter.",
            label: "Votre description",
            placeholder: "Décrivez l’idée, le public, l’ambiance, les mots que vous aimez ou voulez éviter, et les types de noms qui conviendraient.",
            wordCount: `${wordCount} / ${MAX_ADVANCED_BRIEF_WORDS} mots`,
            support: "Précisez ce qui distingue votre idée. Évitez les données sensibles : la description est transmise au service de recherche pour analyse.",
          }
        : presentationLanguage === "zh"
          ? {
              title: "高级搜索",
              open: "打开高级搜索",
              close: "关闭高级搜索",
              description: "描述你的想法，选择域名后缀、命名风格，以及想要包含或避开的词。",
              label: "你的说明",
              placeholder: "描述你的想法、受众、希望传达的感觉、喜欢或想避开的词，以及适合的名称类型。",
              wordCount: `${wordCount} / ${MAX_ADVANCED_BRIEF_WORDS} 个词`,
              support: "说明你的想法有何独特之处。请勿填写敏感信息：说明将发送到搜索服务进行分析。",
            }
    : {
        title: "Advanced search",
        open: "Open advanced search",
        close: "Close advanced search",
        description: "Describe your idea and choose extensions, style, and words to include or avoid.",
        label: "Your brief",
        placeholder: "Describe the idea, audience, feeling, words you like or want to avoid, and the kinds of names that could fit.",
        wordCount: `${wordCount} / ${MAX_ADVANCED_BRIEF_WORDS} words`,
        support: "Include what makes your idea distinctive. Avoid sensitive information — your brief is sent to the search service for analysis.",
      };

  return (
    <div className="mx-2 border-t border-border pt-4">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-4 rounded-xl px-2 py-1 text-left transition-colors hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
        aria-expanded={enabled}
        aria-controls="advanced-search-brief"
        disabled={disabled}
        onClick={() => onEnabledChange(!enabled)}
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground">
            <FileText className="h-4 w-4" aria-hidden="true" />
          </span>
          <span>
            <span className="block text-sm font-semibold text-foreground">{copy.title}</span>
            <span className="block text-xs leading-5 text-muted-foreground">{copy.description}</span>
          </span>
        </span>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground" aria-label={enabled ? copy.close : copy.open}>
          {enabled ? <Minus className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
        </span>
      </button>

      {enabled && (
        <div id="advanced-search-brief" className="mt-4 rounded-xl border border-border bg-secondary/35 p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="advanced-search-brief-input" className="text-sm font-medium text-foreground">
              {copy.label}
            </label>
            <span className={`shrink-0 text-xs tabular-nums ${wordCount >= MAX_ADVANCED_BRIEF_WORDS ? "font-medium text-foreground" : "text-muted-foreground"}`} aria-live="polite">
              {copy.wordCount}
            </span>
          </div>
          <Textarea
            id="advanced-search-brief-input"
            value={value}
            onChange={(event) => onValueChange(limitAdvancedBriefWords(event.target.value))}
            placeholder={copy.placeholder}
            disabled={disabled}
            maxLength={6000}
            rows={7}
            className="mt-2 min-h-[150px] resize-y bg-background text-sm leading-6"
          />
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{copy.support}</p>
          <AiPrivacyControl className="mt-4" />
          <AdvancedSearchCriteriaPanel
            value={criteria}
            onChange={onCriteriaChange}
            disabled={disabled}
          />
          {children && (
            <div className="mt-6 border-t border-border pt-6">
              {children}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
