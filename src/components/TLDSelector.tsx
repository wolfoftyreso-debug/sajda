import { Check, ChevronDown } from "lucide-react";
import { useState } from "react";
import { getAnonymousSearchTlds, isAnonymousSearchMode, isPublicSearchMode } from "@/lib/anonymousSearchMode";
import { useLanguage, type TranslationKey } from "@/i18n/LanguageProvider";
import { cn } from "@/lib/utils";

interface TLD {
  id: string;
  label: string;
  description: string;
}

const AVAILABLE_TLDS: TLD[] = [
  { id: "com", label: ".com", description: "Global standard" },
  { id: "ai", label: ".ai", description: "Anguilla" },
  { id: "dev", label: ".dev", description: "Developers" },
  { id: "io", label: ".io", description: "Tech/Startups" },
  { id: "app", label: ".app", description: "Applications" },
  { id: "se", label: ".se", description: "Sweden" },
  { id: "nu", label: ".nu", description: "Nordic" },
  { id: "net", label: ".net", description: "Network" },
  { id: "org", label: ".org", description: "Organisations" },
  { id: "xyz", label: ".xyz", description: "Short & flexible" },
  { id: "info", label: ".info", description: "Information" },
  { id: "biz", label: ".biz", description: "Business" },
];

interface TLDSelectorProps {
  selectedTLDs: string[];
  onToggleTLD: (tld: string) => void;
  disabled?: boolean;
}

const TLDSelector = ({ selectedTLDs, onToggleTLD, disabled = false }: TLDSelectorProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const anonymousSearchMode = isAnonymousSearchMode();
  const anonymousTlds = getAnonymousSearchTlds();
  const { t } = useLanguage();
  const visibleTlds = anonymousSearchMode
    ? AVAILABLE_TLDS.filter((tld) => anonymousTlds.includes(tld.id))
    : AVAILABLE_TLDS;
  const selectedVisibleCount = visibleTlds.filter((tld) => selectedTLDs.includes(tld.id)).length;

  return (
    <section className="rounded-xl border border-border bg-card" aria-label={t("search.extensions")}>
      <button
        type="button"
        onClick={() => setIsExpanded((expanded) => !expanded)}
        disabled={disabled}
        aria-expanded={isExpanded}
        aria-label={`${t("search.extensions")}: ${t("search.extensionsCount", {
          count: selectedVisibleCount,
          max: visibleTlds.length,
        })}`}
        className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left transition-colors hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:pointer-events-none disabled:opacity-50 sm:px-4"
      >
        <span className="min-w-0">
          <span className="block text-sm font-medium text-foreground">{t("search.extensions")}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {t("search.extensionsCount", { count: selectedVisibleCount, max: visibleTlds.length })}
          </span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
            isExpanded && "rotate-180",
          )}
        />
      </button>

      {isExpanded && (
        <div className="space-y-3 border-t border-border px-3 py-3 sm:px-4 sm:py-4">
          <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 md:grid-cols-3" role="group" aria-label={t("search.extensions")}>
            {visibleTlds.map((tld) => {
              const isSelected = selectedTLDs.includes(tld.id);
              return (
                <button
                  key={tld.id}
                  type="button"
                  onClick={() => onToggleTLD(tld.id)}
                  disabled={disabled || (selectedTLDs.length === 1 && isSelected)}
                  aria-pressed={isSelected}
                  className={cn(
                    "group flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-[background-color,border-color,color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    isSelected
                      ? "border-foreground bg-card text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.08)]"
                      : "border-border bg-card text-muted-foreground hover:border-foreground/40 hover:bg-secondary/65 hover:text-foreground",
                    disabled && "cursor-not-allowed opacity-50",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 font-medium">{tld.label}</span>
                    <span className="hidden min-w-0 truncate text-xs opacity-70 md:inline">{t(`tld.${tld.id}` as TranslationKey)}</span>
                  </span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-[background-color,border-color,color]",
                      isSelected
                        ? "border-foreground bg-foreground text-background"
                        : "border-border bg-background text-transparent",
                    )}
                  >
                    <Check className="h-3 w-3" />
                  </span>
                </button>
              );
            })}
          </div>
          {anonymousSearchMode && (
            <p className="text-xs text-muted-foreground">
              {isPublicSearchMode()
                ? t("search.registryNotice")
                : t("search.localRegistryNotice")}
            </p>
          )}
        </div>
      )}
    </section>
  );
};

export default TLDSelector;
