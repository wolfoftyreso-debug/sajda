import { Check, Clock, FileSearch, Flame, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { isAnonymousSearchMode } from "@/lib/anonymousSearchMode";
import { useLanguage, type TranslationKey } from "@/i18n/LanguageProvider";
import { getScanModeConfig, getScanModes, type ScanMode } from "@/lib/scanModes";

const modeIcons = {
  light: Zap,
  medium: Clock,
  heavy: Flame,
  deep: FileSearch,
} as const;

interface ScanModeSelectorProps {
  selectedMode: ScanMode;
  onModeChange: (mode: ScanMode) => void;
  disabled?: boolean;
}

const ScanModeSelector = ({ selectedMode, onModeChange, disabled = false }: ScanModeSelectorProps) => {
  const anonymousSearchMode = isAnonymousSearchMode();
  const modes = getScanModes(anonymousSearchMode);
  const selectedConfig = getScanModeConfig(selectedMode, anonymousSearchMode);
  const { t } = useLanguage();
  const messagePrefix = anonymousSearchMode ? "mode" : "mode.legacy";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <label className="text-sm font-medium text-foreground">
          {anonymousSearchMode ? t("search.creativeStyle") : t("search.scanIntensity")}
        </label>
        <span className="shrink-0 text-xs text-muted-foreground">
          {t(`${messagePrefix}.${selectedConfig.id}.scope` as TranslationKey)}
        </span>
      </div>
      <div
        className={cn(
          "grid auto-rows-fr gap-2",
          anonymousSearchMode ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-4" : "grid-cols-2 md:grid-cols-4",
        )}
        role="radiogroup"
        aria-label={anonymousSearchMode ? t("search.creativeStyle") : t("search.scanIntensity")}
      >
        {modes.map((mode) => {
          const isSelected = selectedMode === mode.id;
          const Icon = modeIcons[mode.id];
          return (
            <button
              key={mode.id}
              type="button"
              onClick={() => onModeChange(mode.id)}
              disabled={disabled}
              role="radio"
              aria-checked={isSelected}
              className={cn(
                "group relative flex flex-col items-start justify-between rounded-xl border px-3.5 py-3 text-left text-sm transition-[background-color,border-color,color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                anonymousSearchMode ? "min-h-[13.75rem]" : "min-h-[7.25rem]",
                isSelected
                  ? "border-foreground bg-foreground/[0.025] text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.08)]"
                  : "border-border bg-card text-muted-foreground hover:border-foreground/40 hover:bg-secondary/65 hover:text-foreground",
                disabled && "cursor-not-allowed opacity-50"
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full border transition-[background-color,border-color,color]",
                  isSelected
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-background text-transparent",
                )}
              >
                <Check className="h-3 w-3" />
              </span>
              <span className="flex items-center gap-2 pr-6">
                <Icon className="h-4 w-4 shrink-0" />
                <span className="font-medium text-foreground">{t(`${messagePrefix}.${mode.id}.label` as TranslationKey)}</span>
              </span>
              {anonymousSearchMode ? (
                <span className="grid gap-2.5 pr-3">
                  <span className="grid gap-0.5">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {t("mode.outcomeLabel")}
                    </span>
                    <span className="text-xs font-medium leading-5 text-foreground">
                      {t(`${messagePrefix}.${mode.id}.outcome` as TranslationKey)}
                    </span>
                  </span>
                  <span className="grid gap-0.5">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {t("mode.generationLabel")}
                    </span>
                    <span className="text-xs leading-5 text-muted-foreground">
                      {t(`${messagePrefix}.${mode.id}.description` as TranslationKey)}
                    </span>
                  </span>
                </span>
              ) : (
                <span className="block pr-4 text-xs leading-4 text-muted-foreground">
                  {t(`${messagePrefix}.${mode.id}.scope` as TranslationKey)}
                </span>
              )}
              {anonymousSearchMode && (
                <span className="grid gap-1 border-t border-border/80 pt-2 text-[11px] leading-4">
                  <span>
                    <span className="font-semibold text-foreground">{t("mode.bestForLabel")}: </span>
                    <span className="text-muted-foreground">{t(`${messagePrefix}.${mode.id}.bestFor` as TranslationKey)}</span>
                  </span>
                  <span>
                    <span className="font-semibold text-foreground">{t("mode.tradeoffLabel")}: </span>
                    <span className="text-muted-foreground">{t(`${messagePrefix}.${mode.id}.tradeoff` as TranslationKey)}</span>
                  </span>
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        {anonymousSearchMode
          ? t(`${messagePrefix}.${selectedConfig.id}.scope` as TranslationKey)
          : t(`${messagePrefix}.${selectedConfig.id}.description` as TranslationKey)}
      </p>
    </div>
  );
};

export default ScanModeSelector;
