import { useLanguage } from "@/i18n/LanguageProvider";
import { cn } from "@/lib/utils";

interface LanguageSwitcherProps {
  className?: string;
}

const languageOptions = [
  { code: "en", shortLabel: "EN", nameKey: "language.english" },
  { code: "sv", shortLabel: "SV", nameKey: "language.swedish" },
  { code: "es", shortLabel: "ES", nameKey: "language.spanish" },
  { code: "fr", shortLabel: "FR", nameKey: "language.french" },
  { code: "zh", shortLabel: "中文", nameKey: "language.chinese" },
] as const;

const LanguageSwitcher = ({ className }: LanguageSwitcherProps) => {
  const { selectedLanguage, setLanguage, t } = useLanguage();

  return (
    <div
      className={cn("inline-grid max-w-full grid-cols-5 items-center rounded-lg bg-[#e3e3e8] p-0.5", className)}
      role="group"
      aria-label={t("language.label")}
    >
      {languageOptions.map((option) => (
        <button
          key={option.code}
          type="button"
          onClick={() => setLanguage(option.code)}
          aria-pressed={selectedLanguage === option.code}
          aria-label={t(option.nameKey)}
          className={cn(
            "min-h-8 rounded-md border border-transparent px-2 text-xs font-semibold transition-[background-color,color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
            selectedLanguage === option.code
              ? "bg-card text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.12)]"
              : "text-muted-foreground",
          )}
        >
          {option.shortLabel}
        </button>
      ))}
    </div>
  );
};

export default LanguageSwitcher;
