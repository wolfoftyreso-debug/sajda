import { useState, useMemo, useEffect, useRef } from "react";
import { Search, CheckCircle, AlertCircle, Square, RotateCcw } from "lucide-react";
import { Input } from "@/components/ui/input";
import DomainCard from "@/components/DomainCard";
import StatsCard from "@/components/StatsCard";
import ScanningIndicator from "@/components/ScanningIndicator";
import DomainFilters, { SortOption, FilterOptions } from "@/components/DomainFilters";
import TLDSelector from "@/components/TLDSelector";
import ProviderSelector from "@/components/ProviderSelector";
import ScanModeSelector from "@/components/ScanModeSelector";
import AdvancedSearchBrief from "@/components/AdvancedSearchBrief";
import HeroOfferCarousel, { HeroOfferHeading } from "@/components/HeroOfferCarousel";
import DeepReviewPanel from "@/components/DeepReviewPanel";
import SearchResultHelp from "@/components/SearchResultHelp";
import { countAdvancedBriefWords } from "@/lib/advancedSearchBrief";
import FooterNav from "@/components/FooterNav";
import Top10Banner from "@/components/Top10Banner";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useScan, getModeTargets, type DiscoveredDomain } from "@/contexts/ScanContext";
import { isAnonymousSearchMode } from "@/lib/anonymousSearchMode";
import { addToWatchlist, removeFromWatchlist, getWatchlist } from "@/lib/watchlistService";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/i18n/LanguageProvider";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { DEFAULT_PROVIDER_IDS } from "@/lib/providerCatalog";
import { DEFAULT_ADVANCED_SEARCH_CRITERIA, type AdvancedSearchCriteria } from "@/lib/advancedSearchCriteria";
import { parseDirectDomainSearch } from "@/lib/directDomainSearch";
import { consumeSearchEntryPreset } from "@/lib/searchEntryPreset";

const Index = () => {
  const {
    isScanning,
    domains,
    restoredResults,
    pendingDomains,
    domainsScanned,
    timeRemaining,
    scanPhase,
    activeTLDScans,
    selectedTLDs,
    scanMode,
    searchKeyword,
    briefAnalysis,
    setSelectedTLDs,
    setScanMode,
    setSearchKeyword,
    startScan,
    stopScan,
    deleteDomain,
  } = useScan();

  const [sortBy, setSortBy] = useState<SortOption>("recommended");
  const [filters, setFilters] = useState<FilterOptions>({
    minConfidence: 0,
    maxPrice: 5000,
  });
  const [watchlistDomains, setWatchlistDomains] = useState<Set<string>>(new Set());
  const [savingDomain, setSavingDomain] = useState<string | null>(null);
  const [deletingDomain, setDeletingDomain] = useState<string | null>(null);
  const [advancedSearch, setAdvancedSearch] = useState(false);
  const [isEditingSearch, setIsEditingSearch] = useState(false);
  const [advancedBrief, setAdvancedBrief] = useState("");
  const [advancedCriteria, setAdvancedCriteria] = useState<AdvancedSearchCriteria>(DEFAULT_ADVANCED_SEARCH_CRITERIA);
  const [selectedProviderIds, setSelectedProviderIds] = useState<string[]>(DEFAULT_PROVIDER_IDS);
  const [lastExactDomains, setLastExactDomains] = useState<string[]>([]);
  const searchControlsRef = useRef<HTMLDivElement>(null);
  const advancedSearchRef = useRef<HTMLDivElement>(null);

  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();
  const accountId = user?.id ?? null;
  const currentAccountId = useRef(accountId);
  currentAccountId.current = accountId;
  const watchlistLifetime = useRef<AbortController | null>(null);
  const [watchlistAccountId, setWatchlistAccountId] = useState<string | null>(null);
  const { language, t } = useLanguage();
  const anonymousSearchMode = isAnonymousSearchMode();
  const modeTargets = getModeTargets(scanMode, anonymousSearchMode);
  const presentationLanguage = language as string;

  // Retire the short-lived brand-study links cleanly after the selected Sajda
  // identity became permanent. Other query parameters are left untouched.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const removedStudy = url.searchParams.has("brand-study");
    const removedVariant = url.searchParams.has("brand");
    url.searchParams.delete("brand-study");
    url.searchParams.delete("brand");
    if (removedStudy || removedVariant) {
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }, []);

  // Public product-entry pages prepare this one-time handoff in sessionStorage
  // instead of putting a visitor's idea or exact domain in the URL. The search
  // is never run here; the visitor still makes the final search action.
  useEffect(() => {
    const preset = consumeSearchEntryPreset();
    if (!preset) return;

    setIsEditingSearch(true);
    setSearchKeyword(preset.keyword ?? "");
    if (preset.tlds?.length) setSelectedTLDs(preset.tlds);
    if (preset.mode) setScanMode(preset.mode);
    setAdvancedSearch(Boolean(preset.advanced));
    setAdvancedBrief(preset.advanced ? preset.brief ?? preset.keyword ?? "" : "");
    setAdvancedCriteria(DEFAULT_ADVANCED_SEARCH_CRITERIA);

    window.requestAnimationFrame(() => {
      searchControlsRef.current?.scrollIntoView({ behavior: "auto", block: "center" });
      window.requestAnimationFrame(() => {
        const focusTarget = preset.focus === "advanced"
          ? document.getElementById("advanced-search-brief-input")
          : document.getElementById("domain-theme");
        if (focusTarget instanceof HTMLElement) focusTarget.focus();
      });
    });
  }, [setScanMode, setSearchKeyword, setSelectedTLDs]);

  const advancedWordCount = countAdvancedBriefWords(advancedBrief);
  const directDomainSearch = useMemo(() => parseDirectDomainSearch(searchKeyword), [searchKeyword]);
  const isExactDomainSearch = directDomainSearch.domains.length > 0;
  const blockedExactTlds = directDomainSearch.blockedTlds;
  const hasBlockedExactTld = blockedExactTlds.length > 0;
  const blockedExactTldLabel = blockedExactTlds.map((tld) => `.${tld}`).join(", ");
  const advancedCopy = presentationLanguage === "sv"
    ? {
        shortThemeLabel: "Kort tema (valfritt)",
        shortThemePlaceholder: "Kort tema för sökningen (valfritt)",
        briefReady: "Din långa beskrivning används för att extrahera namnspår innan registry-kontrollerna körs.",
        briefRequired: "Lägg till minst ett ord i din beskrivning för att starta den avancerade sökningen.",
        analysisHeading: "Analys av din beskrivning",
        analysisAssisted: "Strukturerad briefgranskning",
        analysisLocal: "Privat lokal analys",
        analysisKeywords: "Utvalda ord",
        analysisConcepts: "Namnspår",
      }
    : presentationLanguage === "es"
      ? {
          shortThemeLabel: "Tema breve (opcional)",
          shortThemePlaceholder: "Un tema breve para la búsqueda (opcional)",
          briefReady: "Tu descripción extensa se usa para extraer direcciones de nombres antes de las comprobaciones en el registro.",
          briefRequired: "Añade al menos una palabra a tu descripción para iniciar la búsqueda avanzada.",
          analysisHeading: "Análisis de la descripción",
          analysisAssisted: "Revisión estructurada de la descripción",
          analysisLocal: "Análisis local privado",
          analysisKeywords: "Palabras seleccionadas",
          analysisConcepts: "Direcciones de nombres",
        }
      : presentationLanguage === "fr"
        ? {
            shortThemeLabel: "Thème court (facultatif)",
            shortThemePlaceholder: "Un thème court pour la recherche (facultatif)",
            briefReady: "Votre description détaillée sert à extraire des pistes de noms avant les vérifications auprès du registre.",
            briefRequired: "Ajoutez au moins un mot à votre description pour lancer la recherche avancée.",
            analysisHeading: "Analyse de la description",
            analysisAssisted: "Analyse structurée du brief",
            analysisLocal: "Analyse locale privée",
            analysisKeywords: "Mots sélectionnés",
            analysisConcepts: "Pistes de noms",
          }
        : presentationLanguage === "zh"
          ? {
              shortThemeLabel: "简短主题（可选）",
              shortThemePlaceholder: "搜索的简短主题（可选）",
              briefReady: "系统会先从你的详细说明中提取命名方向，再进行注册局核验。",
              briefRequired: "请在说明中至少添加一个词，以开始高级搜索。",
              analysisHeading: "说明分析",
              analysisAssisted: "结构化说明分析",
              analysisLocal: "本地私密分析",
              analysisKeywords: "选定的词",
              analysisConcepts: "命名方向",
            }
    : {
        shortThemeLabel: "Short theme (optional)",
        shortThemePlaceholder: "A short search theme (optional)",
        briefReady: "Your longer brief is used to extract naming directions before registry checks run.",
        briefRequired: "Add at least one word to your brief to start an advanced search.",
        analysisHeading: "Brief analysis",
        analysisAssisted: "Structured brief review",
        analysisLocal: "Private local analysis",
        analysisKeywords: "Selected words",
        analysisConcepts: "Naming directions",
      };
  const canStartSearch = selectedTLDs.length > 0
    && selectedProviderIds.length > 0
    && !hasBlockedExactTld
    // On a configured public deployment, wait for a restored account session
    // before deciding whether this is the browser's free search or an account
    // search. That prevents debiting a signed-in visitor during hydration.
    && !(anonymousSearchMode && authLoading)
    && (!advancedSearch || isExactDomainSearch || advancedWordCount > 0);

  const blockedExactTldNotice = presentationLanguage === "sv"
    ? `${blockedExactTldLabel} kan inte kontrolleras i Sajdas publika registry-sökning ännu. Vi visar inte en gissning som tillgänglighet — välj en av de publikt verifierade ändelserna eller kör den lokala verifieraren.`
    : presentationLanguage === "es"
      ? `${blockedExactTldLabel} aún no se puede comprobar en la búsqueda pública de registros de Sajda. No mostraremos una conjetura como disponibilidad: elige una extensión verificable públicamente o usa el verificador local.`
      : presentationLanguage === "fr"
        ? `${blockedExactTldLabel} ne peut pas encore être vérifié dans la recherche publique auprès du registre de Sajda. Nous n’affichons pas une supposition comme disponibilité: choisissez une extension vérifiable publiquement ou utilisez le vérificateur local.`
        : presentationLanguage === "zh"
          ? `${blockedExactTldLabel} 暂时无法通过 Sajda 的公开注册局搜索核验。我们不会把猜测显示为可注册状态；请选择可公开核验的后缀，或使用本地核验器。`
          : `${blockedExactTldLabel} cannot yet be checked by Sajda’s public registry search. We will not present a guess as availability — choose a publicly verifiable extension or use the local verifier.`;

  const scrollToElement = (element: HTMLElement | null) => {
    if (!element) return;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    element.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
  };

  const handleExploreTrending = () => {
    setScanMode("deep");
    setAdvancedSearch(false);
    window.requestAnimationFrame(() => {
      scrollToElement(searchControlsRef.current);
      document.getElementById("domain-theme")?.focus({ preventScroll: true });
    });
  };

  const handleOpenAdvancedSearch = () => {
    setAdvancedSearch(true);
    window.requestAnimationFrame(() => scrollToElement(advancedSearchRef.current));
  };

  const handleEditSearch = () => {
    // Keep the completed (and cached) result until a replacement succeeds.
    // Editing or encountering the free-search gate must never erase it.
    setIsEditingSearch(true);
    window.requestAnimationFrame(() => scrollToElement(searchControlsRef.current));
  };

  const handleStartSearch = () => {
    if (!canStartSearch || isScanning) return;
    if (isExactDomainSearch) {
      // Reflect the exact domains in the visible extension selector while the
      // request itself uses the override immediately (state updates are async).
      setSelectedTLDs(directDomainSearch.tlds);
      setLastExactDomains(directDomainSearch.domains);
    } else {
      setLastExactDomains([]);
    }

    void startScan({
      advanced: anonymousSearchMode && advancedSearch && !isExactDomainSearch,
      brief: advancedBrief,
      criteria: advancedCriteria,
      providers: selectedProviderIds,
      domains: isExactDomainSearch ? directDomainSearch.domains : undefined,
      tlds: isExactDomainSearch ? directDomainSearch.tlds : undefined,
      theme: isExactDomainSearch ? directDomainSearch.fallbackTheme : undefined,
    }).then(() => setIsEditingSearch(false));
  };

  // Responses and mutations are scoped to the account that initiated them.
  useEffect(() => {
    const controller = new AbortController();
    watchlistLifetime.current = controller;
    setWatchlistDomains(new Set());
    setWatchlistAccountId(accountId);
    setSavingDomain(null);
    if (accountId) {
      getWatchlist({ accountId, signal: controller.signal })
        .then((items) => {
          if (controller.signal.aborted || currentAccountId.current !== accountId) return;
          setWatchlistDomains(new Set(items.map((item) => item.domain)));
        })
        .catch((err) => {
          if (controller.signal.aborted || currentAccountId.current !== accountId) return;
          console.error("Failed to load watchlist:", err);
        });
    }
    return () => controller.abort();
  }, [accountId]);

  const handleToggleTLD = (tld: string) => {
    setSelectedTLDs(
      selectedTLDs.includes(tld)
        ? selectedTLDs.filter((t) => t !== tld)
        : [...selectedTLDs, tld]
    );
  };

  const handleSaveToWatchlist = async (domain: DiscoveredDomain) => {
    if (!accountId || !watchlistLifetime.current) {
      toast({
        title: t("toast.loginRequired"),
        description: t("toast.loginToSave"),
        variant: "destructive",
      });
      return;
    }

    const signal = watchlistLifetime.current.signal;
    const isCurrent = () => !signal.aborted && currentAccountId.current === accountId;
    setSavingDomain(domain.domain);
    try {
      await addToWatchlist({
        domain: domain.domain,
        registrarPrice: domain.registrarPrice,
        estimatedValue: domain.estimatedValue,
        confidenceScore: domain.confidenceScore,
        rationale: domain.rationale,
      }, { accountId, signal });
      if (!isCurrent()) return;
      setWatchlistDomains((prev) => new Set([...prev, domain.domain]));
      toast({
        title: t("toast.addedWatchlist"),
        description: t("toast.savedDomain", { domain: domain.domain }),
      });
    } catch (err) {
      if (!isCurrent()) return;
      toast({
        title: t("toast.saveFailed"),
        description: err instanceof Error ? err.message : t("toast.tryAgain"),
        variant: "destructive",
      });
    } finally {
      if (isCurrent()) setSavingDomain(null);
    }
  };

  const handleRemoveFromWatchlist = async (domainName: string) => {
    if (!accountId || !watchlistLifetime.current) return;
    const signal = watchlistLifetime.current.signal;
    const isCurrent = () => !signal.aborted && currentAccountId.current === accountId;
    setSavingDomain(domainName);
    try {
      await removeFromWatchlist(domainName, { accountId, signal });
      if (!isCurrent()) return;
      setWatchlistDomains((prev) => {
        const next = new Set(prev);
        next.delete(domainName);
        return next;
      });
      toast({
        title: t("toast.removedWatchlist"),
        description: t("toast.removedDomain", { domain: domainName }),
      });
    } catch (err) {
      if (!isCurrent()) return;
      toast({
        title: t("toast.removeFailed"),
        description: err instanceof Error ? err.message : t("toast.tryAgain"),
        variant: "destructive",
      });
    } finally {
      if (isCurrent()) setSavingDomain(null);
    }
  };

  const handleDeleteDomain = async (domainName: string) => {
    setDeletingDomain(domainName);
    try {
      await deleteDomain(domainName);
    } finally {
      setDeletingDomain(null);
    }
  };

  // Filter and sort domains
  const filteredAndSortedDomains = useMemo(() => {
    let result = [...domains];

    // Apply filters
    result = result.filter((d) => {
      const hasLivePrice = d.priceVerified && d.registrarPrice > 0;
      if ((d.namingScore ?? d.confidenceScore) < filters.minConfidence) return false;
      if (!anonymousSearchMode && filters.maxPrice < 5000 && hasLivePrice && d.registrarPrice > filters.maxPrice) return false;
      return true;
    });

    // Apply sorting
    result.sort((a, b) => {
      const compareVerifiedPrice = (ascending: boolean) => {
        if (!a.priceVerified && !b.priceVerified) return 0;
        if (!a.priceVerified) return 1;
        if (!b.priceVerified) return -1;
        return ascending ? a.registrarPrice - b.registrarPrice : b.registrarPrice - a.registrarPrice;
      };
      const effectiveSortBy = anonymousSearchMode && sortBy.startsWith("price-")
        ? "recommended"
        : sortBy;
      switch (effectiveSortBy) {
        case "confidence-desc":
          return (b.namingScore ?? b.confidenceScore) - (a.namingScore ?? a.confidenceScore);
        case "confidence-asc":
          return (a.namingScore ?? a.confidenceScore) - (b.namingScore ?? b.confidenceScore);
        case "price-asc":
          return compareVerifiedPrice(true);
        case "price-desc":
          return compareVerifiedPrice(false);
        case "value-desc":
          return b.estimatedValue - a.estimatedValue;
        case "value-asc":
          return a.estimatedValue - b.estimatedValue;
        default:
          return 0;
      }
    });

    return result;
  }, [anonymousSearchMode, domains, sortBy, filters]);

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.minConfidence > 0) count++;
    if (!anonymousSearchMode && filters.maxPrice < 5000) count++;
    return count;
  }, [anonymousSearchMode, filters]);

  const availableCount = domains.filter((domain) => domain.status === "available" && domain.availabilityVerified).length;
  const unconfirmedCount = domains.filter((domain) => !domain.availabilityVerified).length;

  return (
    <div className="sajda-canvas min-h-screen pb-1">
      <main className={`mx-auto w-full px-4 sm:px-6 ${domains.length === 0 && !isScanning ? "max-w-5xl py-5 sm:py-6" : "max-w-[1280px] py-5 sm:py-6"}`}>
        <header className="grid min-h-10 grid-cols-[1fr_auto] items-center gap-3 border-b border-border/80 pb-4 sm:grid-cols-[1fr_auto_auto]" aria-label="Sajda">
          <a
            href="/"
            className="inline-flex items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="Sajda"
          >
            <img
              src="/sajda-logo.svg"
              alt="Sajda"
              className="h-7 w-auto sm:h-10"
            />
          </a>
          <a href="/pricing" className="inline-flex min-h-11 items-center rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{language === "sv" ? "Priser & nivåer" : language === "es" ? "Precios y planes" : language === "fr" ? "Tarifs et offres" : language === "zh" ? "价格与方案" : "Pricing & plans"}</a>
          <div className="col-span-2 justify-self-end sm:col-span-1">
            <LanguageSwitcher />
          </div>
        </header>
        {!anonymousSearchMode && (
          <div className="mb-6">
            <Top10Banner />
          </div>
        )}

        {/* Setup Section */}
        {!isScanning && (domains.length === 0 || isEditingSearch) && (
          <section className="mx-auto max-w-5xl pb-4 pt-8 sm:pb-6 sm:pt-10" aria-labelledby="search-heading">
            <div className="mx-auto max-w-[44rem] text-center">
              <h1 id="search-heading" className="text-balance text-3xl font-semibold leading-[1.08] tracking-[-0.04em] text-foreground sm:text-5xl">
                {t("search.heading")}
              </h1>
              <p className="mx-auto mt-4 max-w-2xl text-pretty text-sm leading-6 text-muted-foreground sm:text-base">
                {anonymousSearchMode
                  ? t("search.intro")
                  : t("search.introLegacy")}
              </p>
            </div>

            <div ref={searchControlsRef} className="sajda-search-shell mt-6 overflow-hidden rounded-[1.5rem] border p-2.5 sm:p-3 md:p-4">
              {anonymousSearchMode && <HeroOfferHeading language={language} />}

              <form onSubmit={(event) => { event.preventDefault(); handleStartSearch(); }} className="sajda-main-search-row relative z-10 grid gap-2 rounded-[1.125rem] border p-1.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-stretch sm:p-2" role="search">
                <label htmlFor="domain-theme" className="sr-only">
                  {isExactDomainSearch ? t("search.exactCheck") : advancedSearch ? advancedCopy.shortThemeLabel : t("search.label")}
                </label>
                <div className="flex min-h-12 min-w-0 items-center gap-3 px-3">
                  <Search className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <Input
                    id="domain-theme"
                    type="text"
                    enterKeyHint="search"
                    maxLength={6000}
                    placeholder={advancedSearch && !isExactDomainSearch ? advancedCopy.shortThemePlaceholder : t("search.placeholder")}
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    disabled={isScanning}
                    className="h-12 border-0 bg-transparent px-0 text-base shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={!canStartSearch}
                  size="lg"
                  className="w-full shrink-0 sm:min-w-[13.5rem]"
                >
                  <Search className="h-4 w-4" />
                  {anonymousSearchMode
                    ? isExactDomainSearch
                      ? t("search.exactButton")
                      : t("search.button", { count: modeTargets.finalShow })
                    : t("search.start")}
                </Button>
              </form>

              {anonymousSearchMode && (
                <div className="sajda-search-paths relative z-10">
                  <HeroOfferCarousel
                    language={language}
                    onExploreTrending={handleExploreTrending}
                    onOpenAdvancedSearch={handleOpenAdvancedSearch}
                    showHeading={false}
                  />
                </div>
              )}

              {isExactDomainSearch && (
                <div className="mx-2 mt-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3" aria-live="polite">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="font-medium text-foreground">{t("search.exactCheck")}</Badge>
                    {directDomainSearch.domains.map((domain) => (
                      <span key={domain} className="rounded-md border border-border bg-background px-2 py-1 font-mono text-xs text-foreground">
                        {domain}
                      </span>
                    ))}
                  </div>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">{t("search.exactInfo")}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("search.exactSyntax")}</p>
                </div>
              )}

              {anonymousSearchMode && hasBlockedExactTld && (
                <div className="mx-2 mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs leading-5 text-foreground" role="alert">
                  {blockedExactTldNotice}
                </div>
              )}

              {anonymousSearchMode && !isExactDomainSearch && (
                <div ref={advancedSearchRef}>
                  <AdvancedSearchBrief
                    enabled={advancedSearch}
                    value={advancedBrief}
                    disabled={isScanning}
                    onEnabledChange={setAdvancedSearch}
                    onValueChange={setAdvancedBrief}
                    criteria={advancedCriteria}
                    onCriteriaChange={setAdvancedCriteria}
                  >
                    <div className="space-y-8">
                      <TLDSelector
                        selectedTLDs={selectedTLDs}
                        onToggleTLD={handleToggleTLD}
                        disabled={isScanning}
                      />
                      <ScanModeSelector
                        selectedMode={scanMode}
                        onModeChange={setScanMode}
                        disabled={isScanning}
                      />
                      <ProviderSelector
                        selectedProviderIds={selectedProviderIds}
                        onProviderIdsChange={setSelectedProviderIds}
                        disabled={isScanning}
                      />
                      <div className="rounded-xl border border-border bg-background/80 px-4 py-3" aria-live="polite">
                        <p className="text-xs leading-5 text-muted-foreground">
                          <strong className="font-semibold text-foreground">{t("search.target", { count: modeTargets.finalShow })}</strong> {t("search.targetInfo")}
                        </p>
                      </div>
                      <p className="text-xs leading-5 text-muted-foreground">
                        {advancedWordCount > 0
                          ? advancedCopy.briefReady
                          : advancedCopy.briefRequired}
                      </p>
                    </div>
                  </AdvancedSearchBrief>
                </div>
              )}

              {!anonymousSearchMode && !isExactDomainSearch && (
                <div className="space-y-8 px-2 pb-2 pt-6 sm:px-3 sm:pb-3">
                  <TLDSelector
                    selectedTLDs={selectedTLDs}
                    onToggleTLD={handleToggleTLD}
                    disabled={isScanning}
                  />
                  {!isExactDomainSearch && (
                    <ScanModeSelector
                      selectedMode={scanMode}
                      onModeChange={setScanMode}
                      disabled={isScanning}
                    />
                  )}
                  <div className="rounded-xl bg-secondary px-4 py-3" aria-live="polite">
                    <p className="text-xs leading-5 text-muted-foreground">
                      {isExactDomainSearch ? (
                        <>{t("search.exactInfo")}</>
                      ) : (
                        <>{t("search.legacyTarget", {
                          count: selectedTLDs.length,
                          perTld: modeTargets.collectPerTLD,
                          show: modeTargets.finalShow,
                          leverage: !searchKeyword.trim() ? t("search.leverage") : "",
                        })}</>
                      )}
                    </p>
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground">
                    {isExactDomainSearch
                      ? t("search.exactSyntax")
                      : searchKeyword.trim()
                        ? t("search.legacyThemeInfo", { theme: searchKeyword.trim() })
                        : t("search.legacyEmptyThemeInfo")}
                  </p>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Active scan progress per TLD */}
        {isScanning && !anonymousSearchMode && activeTLDScans.size > 0 && (
          <section className="mb-6" aria-live="polite">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {scanPhase === "collecting" ? t("search.phaseCollect") : t("search.phaseOrchestrate")}
                </Badge>
              </div>
              <Button 
                variant="destructive" 
                size="sm" 
                onClick={stopScan}
              >
                <Square className="mr-2 h-4 w-4" />
                {t("search.stop")}
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {Array.from(activeTLDScans.entries()).map(([tld, count]) => (
                <Badge 
                  key={tld} 
                  variant="secondary" 
                  className="flex items-center gap-2 px-3 py-1"
                >
                  <span className="font-mono">.{tld}</span>
                  <span className="text-xs text-muted-foreground">
                    {count}/{modeTargets.collectPerTLD}
                  </span>
                </Badge>
              ))}
            </div>
          </section>
        )}

        {/* Pending Domains Preview during collection */}
        {isScanning && pendingDomains.length > 0 && (
          <section className="mb-6" aria-live="polite">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-medium text-foreground">
                {t("search.found", { count: pendingDomains.length })}
              </h3>
              <div className="flex items-center gap-3">
                {scanPhase === "orchestrating" && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-success font-medium">
                      {pendingDomains.filter(d => d.estimatedValue > 0).length} {t("search.scored")}
                    </span>
                    <span className="text-muted-foreground">/</span>
                    <span className="text-muted-foreground">
                      {pendingDomains.filter(d => d.estimatedValue === 0).length} {t("search.waiting")}
                    </span>
                  </div>
                )}
                <Badge variant="outline" className="text-xs">
                  {scanPhase === "collecting" ? t("search.collecting") : t("search.valuing")}
                </Badge>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {pendingDomains.slice(0, 12).map((domain, index) => (
                <div
                  key={domain.domain}
                  className="animate-in fade-in slide-in-from-bottom-2"
                  style={{ animationDelay: `${index * 30}ms`, animationFillMode: "both" }}
                >
                  <DomainCard
                    {...domain}
                    selectedProviderIds={anonymousSearchMode ? selectedProviderIds : undefined}
                    isPending={domain.estimatedValue === 0}
                    showWatchlistActions={false}
                  />
                </div>
              ))}
            </div>
            {pendingDomains.length > 12 && (
              <p className="mt-3 text-center text-xs text-muted-foreground">
                {t("search.moreWaiting", { count: pendingDomains.length - 12 })}
              </p>
            )}
          </section>
        )}

        {/* Stats Row */}
        {restoredResults && domains.length > 0 && (
          <p className="mb-4 rounded-xl border border-border bg-card px-4 py-3 text-sm leading-6 text-muted-foreground" role="status">
            {t("search.restoredResults")}
          </p>
        )}
        {domains.length > 0 && (
        <section className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label={t("stats.summary")}>
          <StatsCard
            title={t("stats.domains")}
            value={domains.length}
            icon={Search}
          />
          <StatsCard
            title={t("stats.available")}
            value={availableCount}
            icon={CheckCircle}
          />
          <StatsCard
            title={t("stats.unconfirmed")}
            value={unconfirmedCount}
            icon={AlertCircle}
          />
        </section>
        )}

        {/* Scanning Indicator */}
        <div className="mb-8">
          <ScanningIndicator
            isScanning={isScanning}
            domainsScanned={domainsScanned}
            domainsFound={pendingDomains.length}
            timeRemaining={timeRemaining}
            targetDomains={modeTargets.finalShow}
            scanPhase={scanPhase}
            activeTLDScans={activeTLDScans}
            collectPerTLD={modeTargets.collectPerTLD}
            recentHits={[...pendingDomains].reverse().slice(0, 4)}
            onStop={stopScan}
          />
        </div>

        {briefAnalysis && (
          <section className="mb-8 rounded-2xl border border-border bg-card p-4 sm:p-5" aria-labelledby="brief-analysis-heading">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="brief-analysis-heading" className="text-base font-semibold text-foreground">
                {advancedCopy.analysisHeading}
              </h2>
              {briefAnalysis.mode && (
                <Badge variant="secondary" className="text-xs font-medium">
                  {briefAnalysis.mode === "ai" ? advancedCopy.analysisAssisted : advancedCopy.analysisLocal}
                </Badge>
              )}
            </div>
            {briefAnalysis.summary && (
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{briefAnalysis.summary}</p>
            )}
            {(briefAnalysis.keywords.length > 0 || briefAnalysis.concepts.length > 0) && (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {briefAnalysis.keywords.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {advancedCopy.analysisKeywords}
                    </h3>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {briefAnalysis.keywords.map((keyword) => (
                        <Badge key={keyword} variant="secondary">{keyword}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {briefAnalysis.concepts.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {advancedCopy.analysisConcepts}
                    </h3>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {briefAnalysis.concepts.map((concept) => (
                        <Badge key={concept} variant="outline">{concept}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {domains.length > 0 && (
          <DeepReviewPanel
            candidates={domains}
            theme={searchKeyword}
            language={language}
            className="mb-8"
          />
        )}

        {/* Section Header + Filters */}
        {domains.length > 0 && (
          <div className="mb-6">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-foreground">{t("search.results")}</h2>
                <p className="text-sm text-muted-foreground">
                  {filteredAndSortedDomains.length === domains.length
                    ? lastExactDomains.length > 0
                      ? t("search.exactResultsSubtitle", { count: lastExactDomains.length })
                      : anonymousSearchMode
                      ? t("search.resultsSubtitle", { count: domains.length })
                      : t("search.resultsLegacySubtitle", { count: domains.length })
                    : t("search.resultsFiltered", { shown: filteredAndSortedDomains.length, count: domains.length })}
                </p>
              </div>
              <Button 
                variant="outline" 
                onClick={handleEditSearch}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                {t("search.edit")}
              </Button>
            </div>

            <DomainFilters
              sortBy={sortBy}
              onSortChange={setSortBy}
              filters={filters}
              onFiltersChange={setFilters}
              activeFilterCount={activeFilterCount}
              supportsPricing={!anonymousSearchMode}
              supportsValuation={domains.some((domain) => domain.estimatedValue > 0)}
            />
          </div>
        )}

        <SearchResultHelp language={language} enabled={!isScanning && domains.length > 0} />

        {/* Domain Grid */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2" aria-label={t("search.results")}>
          {filteredAndSortedDomains.map((domain, index) => (
            <div
              key={domain.domain}
              className="animate-in fade-in slide-in-from-bottom-4"
              style={{ animationDelay: `${index * 50}ms`, animationFillMode: "both" }}
            >
              <DomainCard
                {...domain}
                registrarUrl={domain.registrarUrl}
                selectedProviderIds={anonymousSearchMode ? selectedProviderIds : undefined}
                checkMethod={domain.checkMethod}
                isInWatchlist={watchlistAccountId === accountId && watchlistDomains.has(domain.domain)}
                onSaveToWatchlist={() => handleSaveToWatchlist(domain)}
                onRemoveFromWatchlist={() => handleRemoveFromWatchlist(domain.domain)}
                isSaving={savingDomain === domain.domain}
                showWatchlistActions={Boolean(user)}
                showDeleteAction={!!user}
                onDelete={() => handleDeleteDomain(domain.domain)}
                isDeleting={deletingDomain === domain.domain}
              />
            </div>
          ))}
        </section>

        {/* Empty filtered state */}
        {domains.length > 0 && filteredAndSortedDomains.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <AlertCircle className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-foreground">{t("search.noMatches")}</h3>
            <p className="max-w-md text-sm text-muted-foreground">
              {t("search.noMatchesDescription")}
            </p>
          </div>
        )}
      </main>

      <FooterNav />
    </div>
  );
};

export default Index;
