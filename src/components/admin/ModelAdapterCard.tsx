import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  Save, 
  ChevronDown, 
  Activity, 
  TrendingUp, 
  TrendingDown,
  Zap,
  AlertTriangle,
  CheckCircle2,
  XCircle
} from "lucide-react";
import { ModelAdapter } from "@/lib/adminService";
import { useLanguage } from "@/i18n/LanguageProvider";
import { formatLocalizedDateTime, formatLocalizedNumber } from "@/lib/localeFormat";

interface ModelAdapterCardProps {
  adapter: ModelAdapter;
  onUpdate: <Key extends keyof ModelAdapter>(adapter: ModelAdapter, field: Key, value: ModelAdapter[Key]) => void;
  onSave: (adapter: ModelAdapter) => void;
  saving: boolean;
}

export function ModelAdapterCard({ adapter, onUpdate, onSave, saving }: ModelAdapterCardProps) {
  const [isOpen, setIsOpen] = useState(adapter.is_enabled);
  const { language } = useLanguage();
  const copy = language === "sv"
    ? {
        active: "Aktiv",
        inactive: "Inaktiv",
        weight: "Vikt",
        accuracy: "Träffsäkerhet",
        evaluations: "Utvärderingar",
        enableModel: "Aktivera modell",
        includeInValuations: "Inkludera i värderingsberäkningar",
        modelWeight: "Modellvikt",
        lowImpact: "Låg påverkan",
        highImpact: "Hög påverkan",
        calibrationOffset: "Kalibrerings-offset",
        valuationAdjustment: "Justering av värdeestimering",
        confidenceMultiplier: "Konfidensmultiplikator",
        confidenceScaling: "Skalning av konfidenspoäng",
        driftThreshold: "Drift-tröskel",
        driftWarning: "Varningsgräns för modell-drift",
        notes: "Anteckningar",
        notesPlaceholder: "Lägg till anteckningar om denna modell...",
        lastDriftCheck: "Senaste drift-kontroll",
        updated: "Uppdaterad",
        never: "Aldrig",
        saving: "Sparar...",
        saveChanges: "Spara ändringar",
      }
    : {
        active: "Active",
        inactive: "Inactive",
        weight: "Weight",
        accuracy: "Accuracy",
        evaluations: "Evaluations",
        enableModel: "Enable model",
        includeInValuations: "Include in valuation calculations",
        modelWeight: "Model weight",
        lowImpact: "Low impact",
        highImpact: "High impact",
        calibrationOffset: "Calibration offset",
        valuationAdjustment: "Valuation estimate adjustment",
        confidenceMultiplier: "Confidence multiplier",
        confidenceScaling: "Confidence score scaling",
        driftThreshold: "Drift threshold",
        driftWarning: "Warning threshold for model drift",
        notes: "Notes",
        notesPlaceholder: "Add internal notes about this model...",
        lastDriftCheck: "Last drift check",
        updated: "Updated",
        never: "Never",
        saving: "Saving...",
        saveChanges: "Save changes",
      };
  
  const accuracy = adapter.historical_accuracy !== null ? adapter.historical_accuracy * 100 : null;
  const hasGoodAccuracy = accuracy !== null && accuracy >= 70;
  const hasDriftIssue = adapter.drift_threshold && accuracy !== null && accuracy < 50;
  
  const getStatusColor = () => {
    if (!adapter.is_enabled) return "bg-muted";
    if (hasDriftIssue) return "bg-destructive/20 border-destructive/50";
    if (hasGoodAccuracy) return "bg-success/10 border-success/30";
    return "bg-primary/10 border-primary/30";
  };

  const getStatusIcon = () => {
    if (!adapter.is_enabled) return <XCircle className="w-4 h-4 text-muted-foreground" />;
    if (hasDriftIssue) return <AlertTriangle className="w-4 h-4 text-destructive" />;
    if (hasGoodAccuracy) return <CheckCircle2 className="w-4 h-4 text-success" />;
    return <Activity className="w-4 h-4 text-primary" />;
  };

  return (
    <Card className={`transition-all duration-300 ${getStatusColor()} ${adapter.is_enabled ? 'border' : 'border border-dashed opacity-60'}`}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardContent className="p-4 cursor-pointer hover:bg-muted/30 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-card border border-border">
                  {getStatusIcon()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{adapter.display_name}</h3>
                    <Badge variant={adapter.is_enabled ? "default" : "secondary"} className="text-xs">
                      {adapter.is_enabled ? copy.active : copy.inactive}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground font-mono">{adapter.model_name}</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                {/* Quick Stats */}
                <div className="hidden md:flex items-center gap-6 mr-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-foreground">{formatLocalizedNumber(adapter.weight, language, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}×</p>
                    <p className="text-xs text-muted-foreground">{copy.weight}</p>
                  </div>
                  
                  {accuracy !== null && (
                    <div className="text-center">
                      <div className="flex items-center gap-1 justify-center">
                        {accuracy >= 70 ? (
                          <TrendingUp className="w-4 h-4 text-success" />
                        ) : (
                          <TrendingDown className="w-4 h-4 text-destructive" />
                        )}
                        <p className={`text-2xl font-bold ${accuracy >= 70 ? 'text-success' : accuracy >= 50 ? 'text-warning' : 'text-destructive'}`}>
                          {formatLocalizedNumber(accuracy, language, { maximumFractionDigits: 0 })}%
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground">{copy.accuracy}</p>
                    </div>
                  )}
                  
                  <div className="text-center">
                    <p className="text-2xl font-bold text-muted-foreground">{formatLocalizedNumber(adapter.total_evaluations, language)}</p>
                    <p className="text-xs text-muted-foreground">{copy.evaluations}</p>
                  </div>
                </div>

                <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </div>
            </div>

            {/* Progress bar for accuracy */}
            {accuracy !== null && (
              <div className="mt-4">
                <Progress 
                  value={accuracy} 
                  className={`h-1.5 ${accuracy >= 70 ? '[&>div]:bg-success' : accuracy >= 50 ? '[&>div]:bg-warning' : '[&>div]:bg-destructive'}`}
                />
              </div>
            )}
          </CardContent>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-4 pb-4 pt-2 border-t border-border/50 space-y-6">
            {/* Enable/Disable Toggle */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
              <div>
                <Label className="font-medium">{copy.enableModel}</Label>
                <p className="text-xs text-muted-foreground">{copy.includeInValuations}</p>
              </div>
              <Switch
                checked={adapter.is_enabled}
                onCheckedChange={(checked) => onUpdate(adapter, 'is_enabled', checked)}
              />
            </div>

            {/* Weight Slider */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-primary" />
                  {copy.modelWeight}
                </Label>
                <span className="text-lg font-bold text-primary">{formatLocalizedNumber(adapter.weight, language, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}×</span>
              </div>
              <Slider
                value={[adapter.weight]}
                min={0.1}
                max={3}
                step={0.1}
                onValueChange={([value]) => onUpdate(adapter, 'weight', value)}
                className="py-2"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{copy.lowImpact}</span>
                <span>{copy.highImpact}</span>
              </div>
            </div>

            {/* Advanced Settings Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">{copy.calibrationOffset}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={adapter.calibration_offset}
                  onChange={(e) => onUpdate(adapter, 'calibration_offset', parseFloat(e.target.value) || 0)}
                  className="h-10 bg-muted/30"
                />
                <p className="text-xs text-muted-foreground">{copy.valuationAdjustment}</p>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">{copy.confidenceMultiplier}</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={adapter.confidence_multiplier}
                  onChange={(e) => onUpdate(adapter, 'confidence_multiplier', parseFloat(e.target.value) || 1)}
                  className="h-10 bg-muted/30"
                />
                <p className="text-xs text-muted-foreground">{copy.confidenceScaling}</p>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">{copy.driftThreshold}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={adapter.drift_threshold}
                  onChange={(e) => onUpdate(adapter, 'drift_threshold', parseFloat(e.target.value) || 0.15)}
                  className="h-10 bg-muted/30"
                />
                <p className="text-xs text-muted-foreground">{copy.driftWarning}</p>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">{copy.notes}</Label>
              <Input
                value={adapter.notes || ''}
                onChange={(e) => onUpdate(adapter, 'notes', e.target.value)}
                placeholder={copy.notesPlaceholder}
                className="bg-muted/30"
              />
            </div>

            {/* Footer with metadata and save button */}
            <div className="flex items-center justify-between pt-4 border-t border-border/50">
              <div className="text-xs text-muted-foreground space-y-1">
                <p>{copy.lastDriftCheck}: {adapter.last_drift_check ? formatLocalizedDateTime(adapter.last_drift_check, language) : copy.never}</p>
                <p>{copy.updated}: {formatLocalizedDateTime(adapter.updated_at, language)}</p>
              </div>
              <Button onClick={() => onSave(adapter)} disabled={saving} className="glow-primary">
                <Save className="w-4 h-4 mr-2" />
                {saving ? copy.saving : copy.saveChanges}
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
