import { ChevronDown } from "lucide-react";
import { useLanguage } from "@/i18n/LanguageProvider";

const languages = [
  { code: "en", short: "EN", name: "language.english" },
  { code: "sv", short: "SV", name: "language.swedish" },
  { code: "es", short: "ES", name: "language.spanish" },
  { code: "fr", short: "FR", name: "language.french" },
  { code: "zh", short: "中文", name: "language.chinese" },
] as const;

/** Compact native header control; the system picker retains full language names. */
export default function NativeLanguageSwitcher() {
  const { selectedLanguage, setLanguage, t } = useLanguage();
  return <div className="relative inline-flex h-11 w-16 shrink-0 items-center justify-center gap-1 rounded-xl bg-background ring-1 ring-inset ring-border focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1">
    <span aria-hidden="true" className="whitespace-nowrap text-xs font-semibold">{languages.find(option => option.code === selectedLanguage)?.short}</span>
    <ChevronDown className="h-3 w-3 shrink-0" aria-hidden="true" />
    {/* A transparent native select keeps its full accessible name/value and OS
        picker, while the decorative short label cannot wrap or resize the bar. */}
    <select aria-label={t("language.label")} value={selectedLanguage}
      onChange={event => {
        const next = languages.find(option => option.code === event.target.value);
        if (next) setLanguage(next.code);
      }}
      className="absolute inset-0 h-full min-h-11 w-full min-w-11 cursor-pointer rounded-xl text-base opacity-0">
      {languages.map(option => <option key={option.code} value={option.code}>{t(option.name)}</option>)}
    </select>
  </div>;
}
