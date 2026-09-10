import { useLanguage, type Language } from "@/i18n/LanguageProvider";
import { cn } from "@/lib/utils";

const labels: Record<Language, string> = {
  en: "Loading page", sv: "Laddar sidan", es: "Cargando la página", fr: "Chargement de la page", zh: "正在加载页面",
};

/** Lives inside the shared language provider on both web and native routes. */
export default function RouteLoading({ className }: { className?: string }) {
  const { language } = useLanguage();
  return <div className={cn("flex items-center justify-center", className)} role="status" aria-label={labels[language]}>
    <span aria-hidden="true" className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent motion-reduce:animate-none" />
  </div>;
}
