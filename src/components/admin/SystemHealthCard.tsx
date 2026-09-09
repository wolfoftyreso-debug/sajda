import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Activity,
  Cpu,
  Database,
  Zap
} from "lucide-react";
import { ModelAdapter } from "@/lib/adminService";
import { useLanguage } from "@/i18n/LanguageProvider";
import { formatLocalizedNumber } from "@/lib/localeFormat";

interface SystemHealthCardProps {
  adapters: ModelAdapter[];
}

export function SystemHealthCard({ adapters }: SystemHealthCardProps) {
  const { language } = useLanguage();
  const copy = language === "sv"
    ? {
        excellent: "Utmärkt",
        good: "Bra",
        warning: "Varning",
        critical: "Kritisk",
        systemHealth: "Systemhälsa",
        healthScore: "Hälsopoäng",
        activeModels: "Aktiva modeller",
        totalEvaluations: "Totalt utvärderingar",
        averageAccuracy: "Snitt träffsäkerhet",
        modelStatus: "Modellstatus",
      }
    : {
        excellent: "Excellent",
        good: "Good",
        warning: "Warning",
        critical: "Critical",
        systemHealth: "System health",
        healthScore: "Health score",
        activeModels: "Active models",
        totalEvaluations: "Total evaluations",
        averageAccuracy: "Average accuracy",
        modelStatus: "Model status",
      };
  const enabledAdapters = adapters.filter(a => a.is_enabled);
  const totalEvaluations = adapters.reduce((sum, a) => sum + a.total_evaluations, 0);
  const avgAccuracy = adapters
    .filter(a => a.historical_accuracy !== null)
    .reduce((sum, a, _, arr) => sum + (a.historical_accuracy! / arr.length), 0) * 100;
  
  const healthScore = Math.round(
    (enabledAdapters.length / Math.max(adapters.length, 1)) * 40 +
    (avgAccuracy / 100) * 60
  );

  const getHealthStatus = () => {
    if (healthScore >= 80) return { label: copy.excellent, color: "text-success", bg: "bg-success/10", icon: CheckCircle2 };
    if (healthScore >= 60) return { label: copy.good, color: "text-primary", bg: "bg-primary/10", icon: Activity };
    if (healthScore >= 40) return { label: copy.warning, color: "text-warning", bg: "bg-warning/10", icon: AlertTriangle };
    return { label: copy.critical, color: "text-destructive", bg: "bg-destructive/10", icon: XCircle };
  };

  const status = getHealthStatus();
  const StatusIcon = status.icon;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            {copy.systemHealth}
          </CardTitle>
          <Badge variant="outline" className={`${status.color} border-current`}>
            <StatusIcon className="w-3 h-3 mr-1" />
            {status.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Health Score Circle */}
        <div className="flex items-center justify-center py-4">
          <div className={`relative w-32 h-32 rounded-full ${status.bg} flex items-center justify-center`}>
            <div className="absolute inset-2 rounded-full bg-card flex items-center justify-center flex-col">
              <span className={`text-4xl font-bold ${status.color}`}>{healthScore}</span>
              <span className="text-xs text-muted-foreground">{copy.healthScore}</span>
            </div>
            <svg className="absolute inset-0 w-full h-full -rotate-90">
              <circle
                cx="64"
                cy="64"
                r="58"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                className="text-border"
              />
              <circle
                cx="64"
                cy="64"
                r="58"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                strokeDasharray={`${healthScore * 3.64} 364`}
                strokeLinecap="round"
                className={status.color}
              />
            </svg>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 rounded-lg bg-muted/30">
            <Cpu className="w-5 h-5 mx-auto mb-1 text-primary" />
            <p className="text-xl font-bold">{enabledAdapters.length}/{adapters.length}</p>
            <p className="text-xs text-muted-foreground">{copy.activeModels}</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted/30">
            <Database className="w-5 h-5 mx-auto mb-1 text-primary" />
            <p className="text-xl font-bold">{formatLocalizedNumber(totalEvaluations, language)}</p>
            <p className="text-xs text-muted-foreground">{copy.totalEvaluations}</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted/30">
            <Zap className="w-5 h-5 mx-auto mb-1 text-primary" />
            <p className="text-xl font-bold">{formatLocalizedNumber(avgAccuracy, language, { maximumFractionDigits: 0 })}%</p>
            <p className="text-xs text-muted-foreground">{copy.averageAccuracy}</p>
          </div>
        </div>

        {/* Individual Model Health */}
        <div className="space-y-2 pt-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{copy.modelStatus}</p>
          {adapters.map((adapter) => {
            const acc = adapter.historical_accuracy !== null ? adapter.historical_accuracy * 100 : 0;
            return (
              <div key={adapter.id} className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${adapter.is_enabled ? (acc >= 70 ? 'bg-success' : acc >= 50 ? 'bg-warning' : 'bg-destructive') : 'bg-muted'}`} />
                <span className="text-sm flex-1 truncate">{adapter.display_name}</span>
                <span className="text-xs text-muted-foreground">{formatLocalizedNumber(acc, language, { maximumFractionDigits: 0 })}%</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
