import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LucideIcon, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DecisionSetting, DecisionSettingValue } from "@/lib/adminService";
import { useLanguage } from "@/i18n/LanguageProvider";

interface SettingsSectionProps {
  title: string;
  description: string;
  icon: LucideIcon;
  settings: DecisionSetting[];
  onUpdate: (setting: DecisionSetting, value: DecisionSettingValue) => void;
  saving: string | null;
}

export function SettingsSection({ title, description, icon: Icon, settings, onUpdate, saving }: SettingsSectionProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Icon className="w-5 h-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {settings.map((setting) => (
          <SettingRow 
            key={setting.id} 
            setting={setting} 
            onUpdate={onUpdate}
            saving={saving === setting.id}
          />
        ))}
      </CardContent>
    </Card>
  );
}

interface SettingRowProps {
  setting: DecisionSetting;
  onUpdate: (setting: DecisionSetting, value: DecisionSettingValue) => void;
  saving: boolean;
}

function SettingRow({ setting, onUpdate, saving }: SettingRowProps) {
  const value = setting.setting_value?.value;
  const isBoolean = typeof value === 'boolean';
  const isNumber = typeof value === 'number';
  const isSelect = setting.setting_key.includes('method') || setting.setting_key.includes('strategy');
  const { language } = useLanguage();
  const copy = language === "sv"
    ? {
        enabled: "Aktiverad",
        disabled: "Inaktiverad",
        weightedAverage: "Viktat genomsnitt",
        median: "Median",
        consensus: "Konsensus",
        highestConfidence: "Högsta konfidens",
        labels: {
          min_confidence_threshold: "Lägsta konfidensgräns",
          drift_detection_enabled: "Aktivera driftidentifiering",
          max_models_per_scan: "Maximalt antal modeller per sökning",
          anomaly_sensitivity: "Avvikelsekänslighet",
          value_aggregation_method: "Metod för värdeaggregering",
        },
        descriptions: {
          min_confidence_threshold: "Lägsta konfidenspoäng för att betrakta en värdering som tillförlitlig",
          drift_detection_enabled: "Aktivera automatisk driftidentifiering för modelladaptrar",
          max_models_per_scan: "Maximalt antal modeller att använda per värderingssökning",
          anomaly_sensitivity: "Känslighetsgräns för avvikelseidentifiering (0–1)",
          value_aggregation_method: "Metod för att sammanväga värderingar från flera modeller",
        },
      }
    : {
        enabled: "Enabled",
        disabled: "Disabled",
        weightedAverage: "Weighted average",
        median: "Median",
        consensus: "Consensus",
        highestConfidence: "Highest confidence",
        labels: {
          min_confidence_threshold: "Minimum confidence threshold",
          drift_detection_enabled: "Enable drift detection",
          max_models_per_scan: "Maximum models per scan",
          anomaly_sensitivity: "Anomaly sensitivity",
          value_aggregation_method: "Value aggregation method",
        },
        descriptions: {
          min_confidence_threshold: "Minimum confidence score to consider a valuation reliable",
          drift_detection_enabled: "Enable automatic drift detection for model adapters",
          max_models_per_scan: "Maximum number of models to use per valuation scan",
          anomaly_sensitivity: "Sensitivity threshold for anomaly detection (0–1)",
          value_aggregation_method: "Method for aggregating multi-model valuations",
        },
      };

  const formatLabel = (key: string) => {
    return key
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
  };
  const label = copy.labels[setting.setting_key as keyof typeof copy.labels] ?? formatLabel(setting.setting_key);
  const description = copy.descriptions[setting.setting_key as keyof typeof copy.descriptions] ?? setting.description;

  return (
    <div className={`flex items-center justify-between p-4 rounded-lg border border-border bg-muted/20 hover:bg-muted/40 transition-colors ${saving ? 'opacity-50' : ''}`}>
      <div className="flex-1 pr-4">
        <div className="flex items-center gap-2">
          <p className="font-medium text-sm">{label}</p>
          {description && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="w-3.5 h-3.5 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="text-sm">{description}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{description}</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        {isBoolean && (
          <div className="flex items-center gap-2">
            <Badge variant={value ? "default" : "secondary"} className="text-xs">
              {value ? copy.enabled : copy.disabled}
            </Badge>
            <Switch
              checked={value}
              onCheckedChange={(checked) => onUpdate(setting, checked)}
              disabled={saving}
            />
          </div>
        )}
        
        {isNumber && !isSelect && (
          <div className="flex items-center gap-2 w-40">
            <Slider
              value={[value]}
              min={0}
              max={value > 1 ? 10 : 1}
              step={value > 1 ? 1 : 0.05}
              onValueChange={([v]) => onUpdate(setting, v)}
              disabled={saving}
              className="flex-1"
            />
            <Input
              type="number"
              value={value}
              onChange={(e) => onUpdate(setting, parseFloat(e.target.value) || 0)}
              className="w-20 h-8 text-center"
              disabled={saving}
            />
          </div>
        )}
        
        {isSelect && (
          <Select value={String(value)} onValueChange={(v) => onUpdate(setting, v)} disabled={saving}>
            <SelectTrigger className="w-40 h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="weighted_average">{copy.weightedAverage}</SelectItem>
              <SelectItem value="median">{copy.median}</SelectItem>
              <SelectItem value="consensus">{copy.consensus}</SelectItem>
              <SelectItem value="highest_confidence">{copy.highestConfidence}</SelectItem>
            </SelectContent>
          </Select>
        )}
        
        {!isBoolean && !isNumber && !isSelect && (
          <Input
            value={value || ''}
            onChange={(e) => onUpdate(setting, e.target.value)}
            className="w-48 h-8"
            disabled={saving}
          />
        )}
      </div>
    </div>
  );
}
