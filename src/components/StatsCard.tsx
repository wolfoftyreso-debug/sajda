import { LucideIcon } from "lucide-react";
import { useLanguage } from "@/i18n/LanguageProvider";

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  subtitle?: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
}

const StatsCard = ({ title, value, icon: Icon, subtitle, trend }: StatsCardProps) => {
  const { language } = useLanguage();

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 [overflow-wrap:anywhere]">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
          {subtitle && (
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          )}
          {trend && (
            <p className={`mt-2 text-sm font-medium ${trend.isPositive ? "text-success" : "text-destructive"}`}>
              {trend.isPositive ? "+" : "-"}{Math.abs(trend.value)}% {language === "sv" ? "från förra sökningen" : "from the previous search"}
            </p>
          )}
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary">
          <Icon className="h-5 w-5 text-foreground" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
};

export default StatsCard;
