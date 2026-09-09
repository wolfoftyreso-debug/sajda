import { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { 
  Globe, 
  Save, 
  ChevronDown, 
  Clock, 
  Zap, 
  DollarSign,
  Target,
  TrendingUp,
  Gem,
  CheckCircle2,
  XCircle,
  Loader2,
  Settings2
} from "lucide-react";
import { RegistrarSettings } from "@/lib/registrarService";
import { useLanguage } from "@/i18n/LanguageProvider";
import { formatLocalizedNumber, formatLocalizedRelativeTime } from "@/lib/localeFormat";

interface RegistrarCardProps {
  registrar: RegistrarSettings;
  onUpdate: <Key extends keyof RegistrarSettings>(registrar: RegistrarSettings, field: Key, value: RegistrarSettings[Key]) => void;
  onSave: (registrar: RegistrarSettings) => void;
  saving: boolean;
}

export function RegistrarCard({ registrar, onUpdate, onSave, saving }: RegistrarCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { language } = useLanguage();
  const copy = language === "sv"
    ? {
        active: "Aktiv",
        inactive: "Inaktiv",
        domains: "Domäner",
        gems: "Guldkorn",
        successRate: "Träffrate",
        lastCheck: "Senaste kontroll",
        succeeded: "Lyckades",
        failed: "Misslyckades",
        scrapingSettings: "Skrapningsinställningar",
        intervalMinutes: "Intervall (minuter)",
        rateLimitPerMinute: "Rate limit/minut",
        maxConcurrent: "Max parallella",
        priceFilters: "Prisfilter",
        minPrice: "Min pris ($)",
        maxPrice: "Max pris ($)",
        valueThresholds: "Värdetrösklar",
        minEstimatedValue: "Min uppskattat värde ($)",
        valuePriceRatio: "Värde/pris-kvot",
        algorithmTuning: "Algoritmjustering",
        priorityWeight: "Prioritetsvikt",
        confidenceThreshold: "Konfidenströskel (%)",
        tldPreferences: "TLD-preferenser",
        preferredTlds: "Föredragna TLD:er (kommaseparerade)",
        excludedPatterns: "Exkluderade mönster (regex, kommaseparerade)",
        notes: "Anteckningar",
        notesPlaceholder: "Interna anteckningar om denna leverantör...",
        saving: "Sparar...",
        saveChanges: "Spara ändringar",
      }
    : {
        active: "Active",
        inactive: "Inactive",
        domains: "Domains",
        gems: "Gems",
        successRate: "Success rate",
        lastCheck: "Last check",
        succeeded: "Succeeded",
        failed: "Failed",
        scrapingSettings: "Scraping settings",
        intervalMinutes: "Interval (minutes)",
        rateLimitPerMinute: "Rate limit / minute",
        maxConcurrent: "Max concurrent",
        priceFilters: "Price filters",
        minPrice: "Min. price ($)",
        maxPrice: "Max. price ($)",
        valueThresholds: "Value thresholds",
        minEstimatedValue: "Min. estimated value ($)",
        valuePriceRatio: "Value / price ratio",
        algorithmTuning: "Algorithm tuning",
        priorityWeight: "Priority weight",
        confidenceThreshold: "Confidence threshold (%)",
        tldPreferences: "TLD preferences",
        preferredTlds: "Preferred TLDs (comma-separated)",
        excludedPatterns: "Excluded patterns (regex, comma-separated)",
        notes: "Notes",
        notesPlaceholder: "Internal notes about this provider...",
        saving: "Saving...",
        saveChanges: "Save changes",
      };
  
  const successRateColor = registrar.success_rate >= 80 
    ? "text-green-500" 
    : registrar.success_rate >= 50 
      ? "text-yellow-500" 
      : "text-red-500";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <Card className={`transition-all duration-200 ${registrar.is_enabled ? 'border-border' : 'border-muted opacity-60'}`}>
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${registrar.is_enabled ? 'bg-primary/10' : 'bg-muted'}`}>
                  <Globe className={`w-5 h-5 ${registrar.is_enabled ? 'text-primary' : 'text-muted-foreground'}`} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-lg">{registrar.display_name}</h3>
                    <Badge variant={registrar.is_enabled ? "default" : "secondary"} className="text-xs">
                      {registrar.is_enabled ? copy.active : copy.inactive}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground font-mono">{registrar.registrar_name}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-4">
                {/* Quick Stats */}
                <div className="hidden md:flex items-center gap-6 text-sm">
                  <div className="text-center">
                    <div className="font-semibold">{formatLocalizedNumber(registrar.total_domains_found, language)}</div>
                    <div className="text-xs text-muted-foreground">{copy.domains}</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold flex items-center gap-1 justify-center">
                      <Gem className="w-3.5 h-3.5 text-amber-500" />
                      {registrar.total_gems_found}
                    </div>
                    <div className="text-xs text-muted-foreground">{copy.gems}</div>
                  </div>
                  <div className="text-center">
                    <div className={`font-semibold ${successRateColor}`}>
                      {formatLocalizedNumber(registrar.success_rate, language, { maximumFractionDigits: 0 })}%
                    </div>
                    <div className="text-xs text-muted-foreground">{copy.successRate}</div>
                  </div>
                </div>

                <Switch
                  checked={registrar.is_enabled}
                  onCheckedChange={(checked) => onUpdate(registrar, 'is_enabled', checked)}
                />
                
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </Button>
                </CollapsibleTrigger>
              </div>
            </div>

            {/* Last activity */}
            {registrar.last_scrape_at && (
              <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                <Clock className="w-3.5 h-3.5" />
                <span>
                  {copy.lastCheck}: {formatLocalizedRelativeTime(registrar.last_scrape_at, language)}
                </span>
                {registrar.last_success_at && (
                  <>
                    <span className="mx-1">•</span>
                    {new Date(registrar.last_success_at).getTime() === new Date(registrar.last_scrape_at).getTime() ? (
                      <span className="text-green-500 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {copy.succeeded}
                      </span>
                    ) : (
                      <span className="text-red-500 flex items-center gap-1">
                        <XCircle className="w-3.5 h-3.5" />
                        {copy.failed}
                      </span>
                    )}
                  </>
                )}
              </div>
            )}
          </CardHeader>

          <CollapsibleContent>
            <CardContent className="pt-0 space-y-6">
              {/* Mobile Stats */}
              <div className="md:hidden grid grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
                <div className="text-center">
                  <div className="font-semibold">{formatLocalizedNumber(registrar.total_domains_found, language)}</div>
                  <div className="text-xs text-muted-foreground">{copy.domains}</div>
                </div>
                <div className="text-center">
                  <div className="font-semibold flex items-center gap-1 justify-center">
                    <Gem className="w-3.5 h-3.5 text-amber-500" />
                    {registrar.total_gems_found}
                  </div>
                  <div className="text-xs text-muted-foreground">{copy.gems}</div>
                </div>
                <div className="text-center">
                  <div className={`font-semibold ${successRateColor}`}>
                    {formatLocalizedNumber(registrar.success_rate, language, { maximumFractionDigits: 0 })}%
                  </div>
                  <div className="text-xs text-muted-foreground">{copy.successRate}</div>
                </div>
              </div>

              {/* Scraping Settings */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Zap className="w-4 h-4 text-primary" />
                  {copy.scrapingSettings}
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs">{copy.intervalMinutes}</Label>
                    <Input
                      type="number"
                      value={registrar.scrape_interval_minutes}
                      onChange={(e) => onUpdate(registrar, 'scrape_interval_minutes', parseInt(e.target.value) || 60)}
                      min={1}
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">{copy.rateLimitPerMinute}</Label>
                    <Input
                      type="number"
                      value={registrar.rate_limit_per_minute}
                      onChange={(e) => onUpdate(registrar, 'rate_limit_per_minute', parseInt(e.target.value) || 30)}
                      min={1}
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">{copy.maxConcurrent}</Label>
                    <Input
                      type="number"
                      value={registrar.max_concurrent_requests}
                      onChange={(e) => onUpdate(registrar, 'max_concurrent_requests', parseInt(e.target.value) || 5)}
                      min={1}
                      max={20}
                      className="h-9"
                    />
                  </div>
                </div>
              </div>

              {/* Price Filters */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <DollarSign className="w-4 h-4 text-green-500" />
                  {copy.priceFilters}
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <Label className="text-xs">{copy.minPrice}</Label>
                      <span className="text-xs text-muted-foreground">${registrar.min_price}</span>
                    </div>
                    <Slider
                      value={[registrar.min_price]}
                      onValueChange={([value]) => onUpdate(registrar, 'min_price', value)}
                      min={0}
                      max={100}
                      step={1}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <Label className="text-xs">{copy.maxPrice}</Label>
                      <span className="text-xs text-muted-foreground">${registrar.max_price}</span>
                    </div>
                    <Slider
                      value={[registrar.max_price]}
                      onValueChange={([value]) => onUpdate(registrar, 'max_price', value)}
                      min={1}
                      max={500}
                      step={1}
                    />
                  </div>
                </div>
              </div>

              {/* Value Thresholds */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <TrendingUp className="w-4 h-4 text-blue-500" />
                  {copy.valueThresholds}
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <Label className="text-xs">{copy.minEstimatedValue}</Label>
                      <span className="text-xs text-muted-foreground">${registrar.min_estimated_value}</span>
                    </div>
                    <Slider
                      value={[registrar.min_estimated_value]}
                      onValueChange={([value]) => onUpdate(registrar, 'min_estimated_value', value)}
                      min={0}
                      max={10000}
                      step={50}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <Label className="text-xs">{copy.valuePriceRatio}</Label>
                      <span className="text-xs text-muted-foreground">{registrar.value_to_price_ratio}x</span>
                    </div>
                    <Slider
                      value={[registrar.value_to_price_ratio]}
                      onValueChange={([value]) => onUpdate(registrar, 'value_to_price_ratio', value)}
                      min={1}
                      max={50}
                      step={0.5}
                    />
                  </div>
                </div>
              </div>

              {/* Algorithm Tuning */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Target className="w-4 h-4 text-amber-500" />
                  {copy.algorithmTuning}
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <Label className="text-xs">{copy.priorityWeight}</Label>
                      <span className="text-xs text-muted-foreground">{registrar.priority_weight}</span>
                    </div>
                    <Slider
                      value={[registrar.priority_weight]}
                      onValueChange={([value]) => onUpdate(registrar, 'priority_weight', value)}
                      min={0}
                      max={5}
                      step={0.1}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <Label className="text-xs">{copy.confidenceThreshold}</Label>
                      <span className="text-xs text-muted-foreground">{registrar.confidence_threshold}%</span>
                    </div>
                    <Slider
                      value={[registrar.confidence_threshold]}
                      onValueChange={([value]) => onUpdate(registrar, 'confidence_threshold', value)}
                      min={0}
                      max={100}
                      step={5}
                    />
                  </div>
                </div>
              </div>

              {/* TLD Preferences */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Settings2 className="w-4 h-4 text-purple-500" />
                  {copy.tldPreferences}
                </div>
                
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label className="text-xs">{copy.preferredTlds}</Label>
                    <Input
                      value={registrar.preferred_tlds.join(', ')}
                      onChange={(e) => onUpdate(registrar, 'preferred_tlds', 
                        e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                      )}
                      placeholder="com, net, org"
                      className="h-9 font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">{copy.excludedPatterns}</Label>
                    <Input
                      value={registrar.excluded_patterns.join(', ')}
                      onChange={(e) => onUpdate(registrar, 'excluded_patterns', 
                        e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                      )}
                      placeholder="^[0-9]+, -casino-, gambling"
                      className="h-9 font-mono text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label className="text-xs">{copy.notes}</Label>
                <Textarea
                  value={registrar.notes || ''}
                  onChange={(e) => onUpdate(registrar, 'notes', e.target.value)}
                  placeholder={copy.notesPlaceholder}
                  className="min-h-[80px] text-sm"
                />
              </div>

              {/* Save Button */}
              <div className="flex justify-end pt-2">
                <Button onClick={() => onSave(registrar)} disabled={saving}>
                  {saving ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  {saving ? copy.saving : copy.saveChanges}
                </Button>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>
    </motion.div>
  );
}
