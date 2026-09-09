import { useState, useEffect } from "react";
import { Trophy, X, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { isAnonymousSearchMode } from "@/lib/anonymousSearchMode";
import { useLanguage } from "@/i18n/LanguageProvider";

const top10Messages = {
  en: {
    announcement: "New Top 10 domains available!",
    bestFind: "Best find:",
    estimatedValue: "estimated value",
    viewList: "View list",
    close: "Close Top 10 banner",
  },
  sv: {
    announcement: "Nya topp 10-domäner tillgängliga!",
    bestFind: "Bästa fynd:",
    estimatedValue: "uppskattat värde",
    viewList: "Visa lista",
    close: "Stäng topp 10-bannern",
  },
  es: {
    announcement: "¡Ya está disponible el nuevo Top 10 de dominios!",
    bestFind: "Mejor hallazgo:",
    estimatedValue: "valor estimado",
    viewList: "Ver lista",
    close: "Cerrar el banner Top 10",
  },
  fr: {
    announcement: "Nouveaux 10 meilleurs domaines disponibles !",
    bestFind: "Meilleure découverte :",
    estimatedValue: "valeur estimée",
    viewList: "Voir la liste",
    close: "Fermer la bannière Top 10",
  },
  zh: {
    announcement: "新的域名 Top 10 已发布！",
    bestFind: "最佳发现：",
    estimatedValue: "预估价值",
    viewList: "查看列表",
    close: "关闭 Top 10 横幅",
  },
} as const;

const Top10Banner = () => {
  const anonymousSearchMode = isAnonymousSearchMode();
  const [isVisible, setIsVisible] = useState(false);
  const [topDomain, setTopDomain] = useState<{ domain: string; estimated_value: number } | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);
  const { language } = useLanguage();
  const copy = top10Messages[language];
  const valueFormatter = new Intl.NumberFormat({
    en: "en-US",
    sv: "sv-SE",
    es: "es-ES",
    fr: "fr-FR",
    zh: "zh-CN",
  }[language], {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

  useEffect(() => {
    if (anonymousSearchMode) return;

    const checkTodaysTop10 = async () => {
      // Check if user has dismissed today's banner
      const dismissedDate = localStorage.getItem("top10_banner_dismissed");
      const today = new Date().toISOString().split("T")[0];
      
      if (dismissedDate === today) {
        setIsDismissed(true);
        return;
      }

      const { data, error } = await supabase
        .from("daily_top_domains")
        .select("domain, estimated_value")
        .eq("scan_date", today)
        .order("rank", { ascending: true })
        .limit(1);

      if (!error && data && data.length > 0) {
        setTopDomain(data[0]);
        setIsVisible(true);
      }
    };

    checkTodaysTop10();
  }, [anonymousSearchMode]);

  const handleDismiss = () => {
    const today = new Date().toISOString().split("T")[0];
    localStorage.setItem("top10_banner_dismissed", today);
    setIsVisible(false);
  };

  if (anonymousSearchMode || !isVisible || isDismissed || !topDomain) return null;

  return (
    <div className="relative overflow-hidden rounded-lg border border-primary/30 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-4">
      <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-primary/10 blur-2xl" />
      
      <div className="relative flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20">
            <Trophy className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              {copy.announcement}
            </p>
            <p className="text-xs text-muted-foreground">
              {copy.bestFind} <span className="font-semibold text-primary">{topDomain.domain}</span> — 
              {copy.estimatedValue} <span className="font-semibold text-success">{valueFormatter.format(topDomain.estimated_value)}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/top-10-today"
            className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {copy.viewList}
            <ChevronRight className="h-3 w-3" aria-hidden="true" />
          </Link>
          <button
            onClick={handleDismiss}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label={copy.close}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default Top10Banner;
