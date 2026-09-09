import { Check, ChevronDown, ExternalLink } from "lucide-react";
import { useState } from "react";
import { useLanguage } from "@/i18n/LanguageProvider";
import ProviderLogo from "@/components/ProviderLogo";
import {
  PROVIDER_CATALOG,
  PROVIDER_IDS,
  normaliseProviderIds,
  type ProviderId,
} from "@/lib/providerCatalog";
import { cn } from "@/lib/utils";

interface ProviderSelectorProps {
  selectedProviderIds: string[];
  onProviderIdsChange: (providerIds: ProviderId[]) => void;
  disabled?: boolean;
}

/**
 * Search-time comparison preference. It controls which provider rows are
 * returned and shown for each domain; it never changes registry availability.
 */
const ProviderSelector = ({
  selectedProviderIds,
  onProviderIdsChange,
  disabled = false,
}: ProviderSelectorProps) => {
  const { t } = useLanguage();
  const [isExpanded, setIsExpanded] = useState(false);
  const selected = normaliseProviderIds(selectedProviderIds);
  const allProvidersSelected = selected.length === PROVIDER_CATALOG.length;

  const toggleProvider = (providerId: ProviderId) => {
    const next = selected.includes(providerId)
      ? selected.filter((id) => id !== providerId)
      : [...selected, providerId];
    onProviderIdsChange(normaliseProviderIds(next));
  };

  const toggleAllProviders = () => {
    onProviderIdsChange(allProvidersSelected ? [] : [...PROVIDER_IDS]);
  };

  return (
    <section id="provider-comparison" className="rounded-xl border border-border bg-card" aria-label={t("providers.title")}>
      <button
        type="button"
        onClick={() => setIsExpanded((expanded) => !expanded)}
        disabled={disabled}
        aria-expanded={isExpanded}
        className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left transition-colors hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:pointer-events-none disabled:opacity-50 sm:px-4"
      >
        <span className="min-w-0">
          <span className="block text-sm font-medium text-foreground">{t("providers.title")}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {t("providers.selected", { count: selected.length })}
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
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <p className="max-w-2xl text-xs leading-5 text-muted-foreground">{t("providers.description")}</p>
            <button
              type="button"
              onClick={toggleAllProviders}
              disabled={disabled}
              className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-secondary/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
            >
              {allProvidersSelected ? t("providers.clear") : t("providers.selectAll")}
            </button>
          </div>

          <div className="grid auto-rows-fr grid-cols-1 gap-2 min-[440px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4" role="group" aria-label={t("providers.title")}>
            {PROVIDER_CATALOG.map((provider) => {
              const isSelected = selected.includes(provider.id);
              return (
                <button
                  key={provider.id}
                  type="button"
                  onClick={() => toggleProvider(provider.id)}
                  disabled={disabled}
                  aria-pressed={isSelected}
                  aria-label={`${provider.name} — ${provider.livePriceConnected ? t("providers.livePrice") : t("providers.checkPrice")}`}
                  title={`${provider.name} — ${provider.livePriceConnected ? t("providers.livePrice") : t("providers.checkPrice")}`}
                  className={cn(
                    "relative flex min-h-14 items-center rounded-xl border px-3 py-2 pr-9 text-left text-sm transition-[background-color,border-color,color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    isSelected
                      ? "border-foreground bg-card text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.08)]"
                      : "border-border bg-card text-muted-foreground hover:border-foreground/40 hover:bg-secondary/65 hover:text-foreground",
                    disabled && "cursor-not-allowed opacity-50",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2.5 pr-1">
                    <ProviderLogo provider={provider} size="sm" />
                    <span className="min-w-0 truncate font-medium leading-5">{provider.name}</span>
                  </span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full border transition-colors",
                      isSelected ? "border-foreground bg-foreground text-background" : "border-border bg-background text-transparent",
                    )}
                  >
                    <Check className="h-3 w-3" />
                  </span>
                </button>
              );
            })}
          </div>

          <p className="flex items-start gap-1.5 text-xs leading-5 text-muted-foreground">
            <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {selected.length > 0 ? t("providers.transparency") : t("providers.required")}
          </p>
        </div>
      )}
    </section>
  );
};

export default ProviderSelector;
