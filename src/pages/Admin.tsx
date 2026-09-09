import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { 
  Settings, 
  Brain, 
  Users, 
  ArrowLeft, 
  Target,
  Gauge,
  TrendingUp,
  Shield,
  Globe,
  Gem
} from "lucide-react";
import {
  checkIsAdmin,
  getModelAdapters,
  updateModelAdapter,
  getDecisionSettings,
  updateDecisionSetting,
  ModelAdapter,
  DecisionSetting,
  DecisionSettingValue,
} from "@/lib/adminService";
import {
  getRegistrarSettings,
  updateRegistrarSettings,
  RegistrarSettings
} from "@/lib/registrarService";
import { ModelAdapterCard } from "@/components/admin/ModelAdapterCard";
import { SystemHealthCard } from "@/components/admin/SystemHealthCard";
import { QuickStatsRow } from "@/components/admin/QuickStatsRow";
import { SettingsSection } from "@/components/admin/SettingsSection";
import { RecentActivityFeed } from "@/components/admin/RecentActivityFeed";
import { RegistrarCard } from "@/components/admin/RegistrarCard";
import { useLanguage } from "@/i18n/LanguageProvider";
import { formatLocalizedNumber } from "@/lib/localeFormat";

export default function Admin() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const copy = language === "sv"
    ? {
        updated: "uppdaterad",
        unableToSaveChanges: "Kunde inte spara ändringar",
        settingSaved: "Inställning sparad",
        unableToSaveSetting: "Kunde inte spara inställning",
        accessDenied: "Åtkomst nekad",
        accessDeniedDescription: "Du har inte administratörsbehörighet för att visa denna sida.",
        backToHome: "Tillbaka till startsidan",
        activeEngines: "Aktiva motorer",
        valuationEngines: "Värderingsmotorer i drift",
        registrars: "Registrarer",
        domainProviders: "Domänleverantörer",
        gemsFound: "Guldkorn hittade",
        valuableDomains: "Värdefulla domäner",
        averageAccuracy: "Snitt träffsäkerhet",
        historicalPrecision: "Historisk signalprecision",
        dashboard: "Kontrollpanel",
        dashboardDescription: "Hantera lokal värderingslogik, registraranslutningar och systeminställningar",
        overview: "Översikt",
        algorithmEngines: "Algoritmmotorer",
        settings: "Inställningar",
        users: "Användare",
        providerDescription: "Konfigurera godkända registraranslutningar och prisfilter. HTML-skrapning är avstängd i produktion.",
        noRegistrars: "Inga registrarer konfigurerade",
        addProviders: "Lägg till domänleverantörer i databasen för att komma igång.",
        modelAdapters: "Modelladaptrar",
        modelAdaptersDescription: "Konfigurera vikter, kalibrering och drifttrösklar för varje konfigurerad modell.",
        valuationSettings: "Värderingsinställningar",
        valuationSettingsDescription: "Kontrollera hur domänvärderingar beräknas",
        systemSettings: "Systeminställningar",
        systemSettingsDescription: "Driftidentifiering och avvikelsehantering",
        userRoles: "Användarroller",
        userRolesDescription: "Hantera administratörer och moderatorer",
        roleManagementSoon: "Rollhantering kommer snart",
        roleManagementHelp: "För att lägga till en administratör, använd den skyddade Neon-baserade kontotjänsten enligt driftsguiden.",
        back: "Tillbaka",
      }
    : {
        updated: "updated",
        unableToSaveChanges: "Unable to save changes",
        settingSaved: "Setting saved",
        unableToSaveSetting: "Unable to save setting",
        accessDenied: "Access denied",
        accessDeniedDescription: "You do not have administrator permission to view this page.",
        backToHome: "Back to home",
        activeEngines: "Active engines",
        valuationEngines: "Valuation engines in service",
        registrars: "Registrars",
        domainProviders: "Domain providers",
        gemsFound: "Gems found",
        valuableDomains: "High-value domains",
        averageAccuracy: "Average accuracy",
        historicalPrecision: "Historical signal accuracy",
        dashboard: "Control panel",
        dashboardDescription: "Manage local valuation logic, registrar connections, and system settings",
        overview: "Overview",
        algorithmEngines: "Algorithm engines",
        settings: "Settings",
        users: "Users",
        providerDescription: "Configure approved registrar connections and price filters. HTML scraping is disabled in production.",
        noRegistrars: "No registrars configured",
        addProviders: "Add domain providers to the database to get started.",
        modelAdapters: "Model adapters",
        modelAdaptersDescription: "Configure weights, calibration, and operating thresholds for each configured model.",
        valuationSettings: "Valuation settings",
        valuationSettingsDescription: "Control how domain valuations are calculated",
        systemSettings: "System settings",
        systemSettingsDescription: "Drift detection and anomaly handling",
        userRoles: "User roles",
        userRolesDescription: "Manage administrators and moderators",
        roleManagementSoon: "Role management is coming soon",
        roleManagementHelp: "To add an administrator, use the protected Neon-backed account service described in the deployment guide.",
        back: "Back",
      };
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [modelAdapters, setModelAdapters] = useState<ModelAdapter[]>([]);
  const [decisionSettings, setDecisionSettings] = useState<DecisionSetting[]>([]);
  const [registrars, setRegistrars] = useState<RegistrarSettings[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }

    async function loadData() {
      const adminStatus = await checkIsAdmin();
      setIsAdmin(adminStatus);

      if (adminStatus) {
        const [adapters, settings, registrarData] = await Promise.all([
          getModelAdapters(),
          getDecisionSettings(),
          getRegistrarSettings()
        ]);
        setModelAdapters(adapters);
        setDecisionSettings(settings);
        setRegistrars(registrarData);
      }
      setLoading(false);
    }

    loadData();
  }, [user, navigate]);

  const handleAdapterUpdate = <Key extends keyof ModelAdapter>(adapter: ModelAdapter, field: Key, value: ModelAdapter[Key]) => {
    setModelAdapters((current) => current.map((item) =>
      item.id === adapter.id ? { ...item, [field]: value } as ModelAdapter : item,
    ));
  };

  const saveAdapter = async (adapter: ModelAdapter) => {
    setSaving(adapter.id);
    try {
      await updateModelAdapter(adapter.id, {
        weight: adapter.weight,
        is_enabled: adapter.is_enabled,
        calibration_offset: adapter.calibration_offset,
        confidence_multiplier: adapter.confidence_multiplier,
        drift_threshold: adapter.drift_threshold,
        notes: adapter.notes
      });
      toast.success(`${adapter.display_name} ${copy.updated}`);
    } catch (error) {
      toast.error(copy.unableToSaveChanges);
    }
    setSaving(null);
  };

  const handleSettingUpdate = async (setting: DecisionSetting, newValue: DecisionSettingValue) => {
    setSaving(setting.id);
    try {
      await updateDecisionSetting(setting.id, newValue);
      setDecisionSettings(prev =>
        prev.map(s => s.id === setting.id ? { ...s, setting_value: { value: newValue } } : s)
      );
      toast.success(copy.settingSaved);
    } catch (error) {
      toast.error(copy.unableToSaveSetting);
    }
    setSaving(null);
  };

  const handleRegistrarUpdate = <Key extends keyof RegistrarSettings>(registrar: RegistrarSettings, field: Key, value: RegistrarSettings[Key]) => {
    setRegistrars((current) => current.map((item) =>
      item.id === registrar.id ? { ...item, [field]: value } as RegistrarSettings : item,
    ));
  };

  const saveRegistrar = async (registrar: RegistrarSettings) => {
    setSaving(registrar.id);
    try {
      await updateRegistrarSettings(registrar.id, {
        is_enabled: registrar.is_enabled,
        scrape_interval_minutes: registrar.scrape_interval_minutes,
        rate_limit_per_minute: registrar.rate_limit_per_minute,
        max_concurrent_requests: registrar.max_concurrent_requests,
        min_price: registrar.min_price,
        max_price: registrar.max_price,
        min_estimated_value: registrar.min_estimated_value,
        value_to_price_ratio: registrar.value_to_price_ratio,
        priority_weight: registrar.priority_weight,
        confidence_threshold: registrar.confidence_threshold,
        preferred_tlds: registrar.preferred_tlds,
        excluded_patterns: registrar.excluded_patterns,
        notes: registrar.notes
      });
      toast.success(`${registrar.display_name} ${copy.updated}`);
    } catch (error) {
      toast.error(copy.unableToSaveChanges);
    }
    setSaving(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-12 w-64" />
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
              <Shield className="w-6 h-6 text-destructive" />
            </div>
            <CardTitle className="text-destructive">{copy.accessDenied}</CardTitle>
            <CardDescription>
              {copy.accessDeniedDescription}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate('/')} variant="outline" className="w-full" aria-label={copy.backToHome}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              {copy.backToHome}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const enabledAdapters = modelAdapters.filter(a => a.is_enabled);
  const enabledRegistrars = registrars.filter(r => r.is_enabled);
  const totalGems = registrars.reduce((sum, r) => sum + r.total_gems_found, 0);
  const avgAccuracy = modelAdapters
    .filter(a => a.historical_accuracy !== null)
    .reduce((sum, a, _, arr) => sum + (a.historical_accuracy! / arr.length), 0) * 100;

  const valuationSettings = decisionSettings.filter(s => s.category === 'valuation');
  const systemSettings = decisionSettings.filter(s => s.category === 'system');

  const quickStats = [
    {
      label: copy.activeEngines,
      value: `${enabledAdapters.length}/${modelAdapters.length}`,
      icon: Brain,
      color: "primary" as const,
      subtext: copy.valuationEngines
    },
    {
      label: copy.registrars,
      value: `${enabledRegistrars.length}/${registrars.length}`,
      icon: Globe,
      color: "primary" as const,
      subtext: copy.domainProviders
    },
    {
      label: copy.gemsFound,
      value: formatLocalizedNumber(totalGems, language),
      icon: Gem,
      color: "success" as const,
      subtext: copy.valuableDomains
    },
    {
      label: copy.averageAccuracy,
      value: `${formatLocalizedNumber(avgAccuracy, language, { maximumFractionDigits: 0 })}%`,
      icon: Target,
      color: avgAccuracy >= 70 ? "success" as const : avgAccuracy >= 50 ? "warning" as const : "destructive" as const,
      subtext: copy.historicalPrecision
    }
  ];

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="shrink-0" aria-label={copy.back}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold">{copy.dashboard}</h1>
                  <Badge variant="secondary" className="gap-1">
                    <Shield className="w-3 h-3" />
                    Admin
                  </Badge>
                </div>
                <p className="text-muted-foreground text-sm">{copy.dashboardDescription}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
        {/* Quick Stats */}
        <QuickStatsRow stats={quickStats} />

        {/* Main Content */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5 bg-card border border-border">
            <TabsTrigger value="overview" className="gap-2 data-[state=active]:bg-primary/10">
              <TrendingUp className="w-4 h-4" />
              <span className="hidden md:inline">{copy.overview}</span>
            </TabsTrigger>
            <TabsTrigger value="registrars" className="gap-2 data-[state=active]:bg-primary/10">
              <Globe className="w-4 h-4" />
              <span className="hidden md:inline">{copy.registrars}</span>
            </TabsTrigger>
            <TabsTrigger value="adapters" className="gap-2 data-[state=active]:bg-primary/10">
              <Brain className="w-4 h-4" />
              <span className="hidden md:inline">{copy.algorithmEngines}</span>
            </TabsTrigger>
            <TabsTrigger value="decision" className="gap-2 data-[state=active]:bg-primary/10">
              <Settings className="w-4 h-4" />
              <span className="hidden md:inline">{copy.settings}</span>
            </TabsTrigger>
            <TabsTrigger value="users" className="gap-2 data-[state=active]:bg-primary/10">
              <Users className="w-4 h-4" />
              <span className="hidden md:inline">{copy.users}</span>
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <RecentActivityFeed />
              </div>
              <div>
                <SystemHealthCard adapters={modelAdapters} />
              </div>
            </div>
          </TabsContent>

          {/* Registrars Tab */}
          <TabsContent value="registrars" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Gem className="w-5 h-5 text-amber-500" />
                  {copy.domainProviders}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {copy.providerDescription}
                </p>
              </div>
            </div>
            
            <div className="space-y-4">
              {registrars.map((registrar) => (
                <RegistrarCard
                  key={registrar.id}
                  registrar={registrar}
                  onUpdate={handleRegistrarUpdate}
                  onSave={saveRegistrar}
                  saving={saving === registrar.id}
                />
              ))}
              {registrars.length === 0 && (
                <Card>
                  <CardContent className="text-center py-12 text-muted-foreground">
                    <Globe className="w-12 h-12 mx-auto mb-4 opacity-30" />
                    <p className="font-medium">{copy.noRegistrars}</p>
                    <p className="text-sm mt-1">
                      {copy.addProviders}
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Adapters Tab */}
          <TabsContent value="adapters" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">{copy.modelAdapters}</h2>
                <p className="text-sm text-muted-foreground">
                  {copy.modelAdaptersDescription}
                </p>
              </div>
            </div>
            
            <div className="space-y-4">
              {modelAdapters.map((adapter) => (
                <ModelAdapterCard
                  key={adapter.id}
                  adapter={adapter}
                  onUpdate={handleAdapterUpdate}
                  onSave={saveAdapter}
                  saving={saving === adapter.id}
                />
              ))}
            </div>
          </TabsContent>

          {/* Decision Settings Tab */}
          <TabsContent value="decision" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <SettingsSection
                title={copy.valuationSettings}
                description={copy.valuationSettingsDescription}
                icon={Target}
                settings={valuationSettings}
                onUpdate={handleSettingUpdate}
                saving={saving}
              />
              
              <SettingsSection
                title={copy.systemSettings}
                description={copy.systemSettingsDescription}
                icon={Gauge}
                settings={systemSettings}
                onUpdate={handleSettingUpdate}
                saving={saving}
              />
            </div>
          </TabsContent>

          {/* Users Tab */}
          <TabsContent value="users" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Users className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{copy.userRoles}</CardTitle>
                    <CardDescription>
                      {copy.userRolesDescription}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12 text-muted-foreground">
                  <Users className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p className="font-medium">{copy.roleManagementSoon}</p>
                  <p className="text-sm mt-1">
                    {copy.roleManagementHelp}
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
