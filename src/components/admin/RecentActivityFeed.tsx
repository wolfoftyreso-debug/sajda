import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Activity, 
  Brain, 
  TrendingUp, 
  Clock
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/i18n/LanguageProvider";
import { formatLocalizedCurrency, formatLocalizedNumber, formatLocalizedRelativeTime } from "@/lib/localeFormat";

interface EvaluationHistory {
  id: string;
  domain: string;
  model_name: string;
  predicted_value: number;
  confidence_score: number;
  evaluation_date: string;
}

export function RecentActivityFeed() {
  const [activities, setActivities] = useState<EvaluationHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const { language } = useLanguage();
  const copy = language === "sv"
    ? {
        title: "Senaste aktivitet",
        empty: "Ingen aktivitet ännu",
        confidence: "konfidens",
      }
    : {
        title: "Recent activity",
        empty: "No activity yet",
        confidence: "confidence",
      };

  useEffect(() => {
    async function fetchActivity() {
      const { data, error } = await supabase
        .from('model_evaluation_history')
        .select('*')
        .order('evaluation_date', { ascending: false })
        .limit(20);

      if (!error && data) {
        setActivities(data);
      }
      setLoading(false);
    }

    fetchActivity();
  }, []);

  const getModelIcon = (modelName: string) => {
    if (modelName.includes('gpt')) return <Brain className="w-4 h-4 text-primary" />;
    if (modelName.includes('gemini')) return <Activity className="w-4 h-4 text-success" />;
    return <TrendingUp className="w-4 h-4 text-warning" />;
  };

  const getConfidenceColor = (score: number) => {
    if (score >= 0.8) return "text-success";
    if (score >= 0.6) return "text-primary";
    if (score >= 0.4) return "text-warning";
    return "text-destructive";
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Clock className="w-5 h-5 text-primary" />
          {copy.title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] pr-4">
          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="animate-pulse flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                  <div className="w-8 h-8 rounded-full bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-muted rounded w-3/4" />
                    <div className="h-3 bg-muted rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : activities.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>{copy.empty}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {activities.map((activity) => (
                <div 
                  key={activity.id} 
                  className="flex items-start gap-3 p-3 rounded-lg bg-muted/20 hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-card border border-border mt-0.5">
                    {getModelIcon(activity.model_name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{activity.domain}</span>
                      <Badge variant="outline" className="text-xs shrink-0">
                        {activity.model_name.split('/').pop()}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-sm text-foreground font-medium">
                        {formatLocalizedCurrency(activity.predicted_value, "SEK", language)}
                      </span>
                      <span className={`text-xs ${getConfidenceColor(activity.confidence_score)}`}>
                        {formatLocalizedNumber(activity.confidence_score * 100, language, { maximumFractionDigits: 0 })}% {copy.confidence}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatLocalizedRelativeTime(activity.evaluation_date, language)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
