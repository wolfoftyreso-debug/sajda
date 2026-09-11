/* eslint-disable react-refresh/only-export-components -- This context module intentionally exports shared scan types, helpers, provider, and hook. */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { getScanModeConfig, type ScanMode } from "@/lib/scanModes";
import { normaliseRegistrarOffer, type RegistrarOffer } from "@/lib/registrarOffer";
import { runAnonymousSearch, type AnonymousBriefAnalysis, type AnonymousSearchResult } from "@/lib/localTestSearch";
import { getDefaultAnonymousSearchTlds, SEARCH_TLD_IDS } from "@/lib/anonymousSearchMode";
import { isLocalTestMode } from "@/lib/localTestMode";
import {
  hasCompletedFreeSearch,
  isFreeSearchQuotaStorageEvent,
  reserveFreeSearch,
  type FreeSearchReservation,
} from "@/lib/freeSearchQuota";
import type { AdvancedSearchCriteria } from "@/lib/advancedSearchCriteria";
import { useLanguage } from "@/i18n/LanguageProvider";
import { readSearchSession, writeSearchSession } from "@/lib/searchSession";
import { useAuth } from "@/contexts/AuthContext";
import { getSearchCapacityAttemptNote, searchRefinementCopy } from "@/i18n/searchRefinementCopy";
import type { NamingGeneration, SearchRefinement } from "../../shared/search-refinement";

export interface DiscoveredDomain {
  domain: string;
  status: "available" | "checking" | "taken" | "unknown";
  registrarPrice: number;
  estimatedValue: number;
  confidenceScore: number;
  namingScore?: number;
  rankingPosition?: number;
  rationale: string;
  tld: string;
  registrarUrl: string;
  registrarOffer: RegistrarOffer;
  providerOffers?: RegistrarOffer[];
  checkMethod: "rdap" | "whois" | "das" | "dns" | "none" | "error";
  availabilityVerified: boolean;
  priceVerified: boolean;
  modelCount?: number;
  scanMode?: string;
}

export interface ModeTargets {
  collectPerTLD: number;
  finalShow: number;
  aiCount: number;
}

export interface StartScanOptions {
  refinement?: SearchRefinement;
  mode?: ScanMode;
  advanced?: boolean;
  brief?: string;
  criteria?: AdvancedSearchCriteria;
  providers?: string[];
  /** Exact names to verify directly with the registry. */
  domains?: string[];
  /** Allows an exact-domain entry to set its own extension selection. */
  tlds?: string[];
  theme?: string;
}

/** One browser trial search is available before Neon-backed accounts launch. */
export interface AnonymousSearchAccess {
  kind: "free" | "account";
  complete: () => void;
  release: () => void;
}

// Retained as exported product vocabulary while Neon-backed saved searches are
// being built. Public Vercel search intentionally uses the fixed fifty-result
// target below.
export const MODE_TARGETS: Record<string, ModeTargets> = {
  light: { collectPerTLD: 12, finalShow: 12, aiCount: 12 },
  medium: { collectPerTLD: 20, finalShow: 20, aiCount: 20 },
  heavy: { collectPerTLD: 24, finalShow: 24, aiCount: 24 },
  deep: { collectPerTLD: 25, finalShow: 25, aiCount: 25 },
};

export const ANONYMOUS_MODE_TARGETS: Record<string, ModeTargets> = {
  light: { collectPerTLD: 50, finalShow: 50, aiCount: 50 },
  medium: { collectPerTLD: 50, finalShow: 50, aiCount: 50 },
  heavy: { collectPerTLD: 50, finalShow: 50, aiCount: 50 },
  deep: { collectPerTLD: 50, finalShow: 50, aiCount: 50 },
};

export function getModeTargets(mode: string, _anonymousSearchMode = true): ModeTargets {
  return ANONYMOUS_MODE_TARGETS[mode] ?? ANONYMOUS_MODE_TARGETS.medium;
}

interface ScanContextType {
  restoredResults: boolean;
  isScanning: boolean;
  domains: DiscoveredDomain[];
  pendingDomains: DiscoveredDomain[];
  domainsScanned: number;
  timeRemaining: number;
  scanPhase: "idle" | "collecting" | "orchestrating";
  activeTLDScans: Map<string, number>;
  selectedTLDs: string[];
  scanMode: ScanMode;
  searchKeyword: string;
  briefAnalysis: AnonymousBriefAnalysis | null;
  generation: NamingGeneration | null;
  lastSearchOptions: StartScanOptions | null;
  anonymousSearchAccessReady: boolean;
  anonymousSearchCanStart: boolean;
  freeSearchAvailable: boolean;
  freeSearchGateOpen: boolean;
  setSelectedTLDs: (tlds: string[]) => void;
  setScanMode: (mode: ScanMode) => void;
  setSearchKeyword: (keyword: string) => void;
  startScan: (options?: StartScanOptions) => Promise<boolean>;
  stopScan: () => void;
  clearResults: () => void;
  deleteDomain: (domainName: string) => Promise<void>;
  requestAnonymousSearchAccess: () => AnonymousSearchAccess | null;
  closeFreeSearchGate: () => void;
}

const ScanContext = createContext<ScanContextType | undefined>(undefined);

export const useScan = () => {
  const context = useContext(ScanContext);
  if (!context) throw new Error("useScan must be used within a ScanProvider");
  return context;
};

function convertAnonymousSearchResultToDomain(
  result: AnonymousSearchResult,
  scanMode: string,
): DiscoveredDomain {
  const registrarOffer = normaliseRegistrarOffer(result.domain, result.registrarOffer);
  const providerOffers = Array.isArray(result.registrarOffers) && result.registrarOffers.length > 0
    ? result.registrarOffers.map((offer) => normaliseRegistrarOffer(result.domain, offer))
    : [registrarOffer];

  return {
    domain: result.domain,
    status: result.status,
    registrarPrice: 0,
    estimatedValue: result.estimatedValue,
    confidenceScore: Math.min(Math.max(result.confidenceScore, 0), 45),
    namingScore: result.namingScore,
    rankingPosition: result.rankingPosition,
    rationale: result.rationale,
    tld: result.tld,
    registrarUrl: registrarOffer.purchaseUrl,
    registrarOffer,
    providerOffers,
    checkMethod: result.checkMethod,
    availabilityVerified: result.authoritative,
    priceVerified: registrarOffer.priceVerified,
    modelCount: 0,
    scanMode,
  };
}

function compareScreeningValue(a: DiscoveredDomain, b: DiscoveredDomain): number {
  const statusOrder = { available: 0, unknown: 1, checking: 2, taken: 3 };
  return statusOrder[a.status] - statusOrder[b.status]
    || (a.rankingPosition ?? Number.MAX_SAFE_INTEGER) - (b.rankingPosition ?? Number.MAX_SAFE_INTEGER);
}

export const ScanProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isScanning, setIsScanning] = useState(false);
  const [domains, setDomains] = useState<DiscoveredDomain[]>(readSearchSession);
  const [restoredResults, setRestoredResults] = useState(() => readSearchSession().length > 0);
  const [pendingDomains, setPendingDomains] = useState<DiscoveredDomain[]>([]);
  const [domainsScanned, setDomainsScanned] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [scanPhase, setScanPhase] = useState<"idle" | "collecting" | "orchestrating">("idle");
  const [activeTLDScans, setActiveTLDScans] = useState<Map<string, number>>(new Map());
  const [selectedTLDs, setSelectedTLDs] = useState<string[]>(() => {
    const defaultTlds = getDefaultAnonymousSearchTlds();
    return defaultTlds.length > 0 ? [...defaultTlds] : [...SEARCH_TLD_IDS];
  });
  const [scanMode, setScanMode] = useState<ScanMode>("medium");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [briefAnalysis, setBriefAnalysis] = useState<AnonymousBriefAnalysis | null>(null);
  const [generation, setGeneration] = useState<NamingGeneration | null>(null);
  // Memory only: a reload must not resurrect a private brief or attribute an
  // old result snapshot to newly typed inputs. Refinement needs this context.
  const [lastSearchOptions, setLastSearchOptions] = useState<StartScanOptions | null>(null);
  const [freeSearchConsumed, setFreeSearchConsumed] = useState(() => hasCompletedFreeSearch());
  const [freeSearchGateOpen, setFreeSearchGateOpen] = useState(false);

  const activeRequestRef = useRef(0);
  const requestControllerRef = useRef<AbortController | null>(null);
  const activeAccessRef = useRef<AnonymousSearchAccess | null>(null);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { toast } = useToast();
  const { language, t } = useLanguage();
  const { user, loading: authLoading } = useAuth();
  const verifiedAccount = !authLoading && user?.email_verified === true;

  const anonymousSearchAccessReady = !authLoading;
  const freeSearchAvailable = !freeSearchConsumed;
  const anonymousSearchCanStart = !authLoading && (verifiedAccount || freeSearchAvailable);

  const clearTimer = useCallback(() => {
    if (!timerIntervalRef.current) return;
    clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = null;
  }, []);

  const startTimer = useCallback(() => {
    clearTimer();
    timerIntervalRef.current = setInterval(() => {
      setTimeRemaining((previous) => Math.max(0, previous - 1));
    }, 1000);
  }, [clearTimer]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (!isFreeSearchQuotaStorageEvent(event)) return;
      setFreeSearchConsumed(hasCompletedFreeSearch());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => () => {
    activeRequestRef.current += 1;
    requestControllerRef.current?.abort();
    activeAccessRef.current?.release();
    activeAccessRef.current = null;
    clearTimer();
  }, [clearTimer]);

  const closeFreeSearchGate = useCallback(() => setFreeSearchGateOpen(false), []);

  const requestAnonymousSearchAccess = useCallback((): AnonymousSearchAccess | null => {
    if (authLoading) return null;
    // A verified free account may iterate under the existing public API rate
    // limit. This removes a browser onboarding gate, never grants paid access
    // or bypasses the separate durable AI allowance.
    if (verifiedAccount) return { kind: "account", complete: () => {}, release: () => {} };
    const reservation: FreeSearchReservation | null = reserveFreeSearch();
    if (!reservation) {
      setFreeSearchConsumed(hasCompletedFreeSearch());
      setFreeSearchGateOpen(true);
      return null;
    }

    return {
      kind: "free",
      complete: () => {
        reservation.complete();
        setFreeSearchConsumed(true);
      },
      release: () => reservation.release(),
    };
  }, [authLoading, verifiedAccount]);

  const clearResults = useCallback(() => {
    setDomains([]);
    writeSearchSession([]);
    setRestoredResults(false);
    setBriefAnalysis(null);
    setGeneration(null);
    setLastSearchOptions(null);
  }, []);

  const deleteDomain = useCallback(async (domainName: string) => {
    setDomains((previous) => {
      const remaining = previous.filter((domain) => domain.domain !== domainName);
      writeSearchSession(remaining);
      return remaining;
    });
    toast({
      title: t("toast.removed"),
      description: t("toast.removedList", { domain: domainName }),
    });
  }, [t, toast]);

  const stopScan = useCallback(() => {
    activeRequestRef.current += 1;
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
    activeAccessRef.current?.release();
    activeAccessRef.current = null;
    clearTimer();
    setIsScanning(false);
    setScanPhase("idle");
    setPendingDomains([]);
    setActiveTLDScans(new Map());
    setTimeRemaining(0);
  }, [clearTimer]);

  const startScan = useCallback(async (options: StartScanOptions = {}) => {
    // React state updates are asynchronous; the ref closes the double-submit
    // window before the next render.
    if (isScanning || activeAccessRef.current) return false;
    const access = requestAnonymousSearchAccess();
    if (!access) return false;

    const requestId = activeRequestRef.current + 1;
    activeRequestRef.current = requestId;
    activeAccessRef.current = access;
    const controller = new AbortController();
    requestControllerRef.current = controller;

    const operationMode = options.mode ?? scanMode;
    const modeConfig = getScanModeConfig(operationMode, true);
    const requestedTLDs = Array.from(new Set(
      (options.tlds ?? [])
        .filter((tld): tld is string => typeof tld === "string")
        .map((tld) => tld.trim().toLowerCase().replace(/^\./, ""))
        .filter(Boolean),
    )).slice(0, SEARCH_TLD_IDS.length);
    const currentTLDs = requestedTLDs.length > 0 ? requestedTLDs : [...selectedTLDs];
    const exactDomains = Array.from(new Set(
      (options.domains ?? [])
        .filter((domain): domain is string => typeof domain === "string")
        .map((domain) => domain.trim().toLowerCase())
        .filter(Boolean),
    )).slice(0, 12);
    const exactDomainSet = new Set(exactDomains);
    const currentKeyword = options.theme ?? searchKeyword;
    const advancedBrief = options.brief?.trim() || "";

    setIsScanning(true);
    setScanPhase("collecting");
    setPendingDomains([]);
    setDomainsScanned(0);
    setTimeRemaining(modeConfig.durationSeconds);
    setActiveTLDScans(new Map(currentTLDs.map((tld) => [tld, 0])));
    startTimer();

    try {
      const targets = getModeTargets(operationMode);
      const resultLimit = exactDomains.length || targets.finalShow;
      const response = await runAnonymousSearch(
        currentTLDs,
        resultLimit,
        currentKeyword,
        language,
        {
          advanced: options.advanced === true && exactDomains.length === 0,
          brief: advancedBrief,
          criteria: options.criteria,
          providers: options.providers,
          domains: exactDomains,
          creativeMode: operationMode,
          refinement: options.refinement,
          signal: controller.signal,
        },
      );

      if (activeRequestRef.current !== requestId) return false;

      const seenDomains = new Set<string>();
      const localDomains = response.results
        .map((result) => convertAnonymousSearchResultToDomain(result, operationMode))
        .filter((domain) => domain.status !== "taken" || exactDomainSet.has(domain.domain.toLowerCase()))
        .filter((domain) => {
          const normalized = domain.domain.toLowerCase();
          if (seenDomains.has(normalized)) return false;
          seenDomains.add(normalized);
          return true;
        })
        .sort((a, b) => {
          const aIsExact = exactDomainSet.has(a.domain.toLowerCase());
          const bIsExact = exactDomainSet.has(b.domain.toLowerCase());
          if (aIsExact !== bIsExact) return aIsExact ? -1 : 1;
          return compareScreeningValue(a, b);
        })
        .slice(0, resultLimit);

      clearTimer();
      activeAccessRef.current = null;
      requestControllerRef.current = null;
      // Transport/provider failures must not consume the only trial. An empty
      // generated batch also delivers no first value and remains retryable.
      const hasVerifiedResult = localDomains.some((result) => result.availabilityVerified && result.status !== "unknown");
      if (hasVerifiedResult) access.complete();
      else access.release();
      // Keep a useful previous shortlist if a new direction yields no usable
      // names. A failed/empty iteration should not destroy the user's work.
      const preserveVerifiedResults = !hasVerifiedResult && domains.some(domain => domain.availabilityVerified && domain.status !== "unknown");
      if (localDomains.length === 0 || preserveVerifiedResults) {
        setIsScanning(false); setScanPhase("idle"); setPendingDomains([]);
        setActiveTLDScans(new Map()); setTimeRemaining(0);
        // This describes the failed attempt, not the source of the retained
        // cards. Never relabel an earlier AI shortlist as a rules fallback.
        const capacityAttemptNote = domains.length > 0 ? getSearchCapacityAttemptNote(language, response.generation) : undefined;
        toast({ title: t(capacityAttemptNote || (preserveVerifiedResults && localDomains.length) ? "toast.searchFailed" : "search.noMatches"),
          description: capacityAttemptNote ?? (preserveVerifiedResults && localDomains.length ? searchRefinementCopy[language].checksUnavailable : t("search.noMatchesDescription")) });
        return false;
      }
      setDomains(localDomains);
      writeSearchSession(localDomains);
      setRestoredResults(false);
      setBriefAnalysis(response.briefAnalysis ?? null);
      setGeneration(response.generation ?? null);
      setLastSearchOptions({ ...options, mode: operationMode, theme: currentKeyword, tlds: currentTLDs, brief: advancedBrief,
        domains: exactDomains, providers: options.providers ? [...options.providers] : undefined });
      setDomainsScanned(response.results.length);
      setIsScanning(false);
      setScanPhase("idle");
      setPendingDomains([]);
      setActiveTLDScans(new Map());
      setTimeRemaining(0);
      toast({
        title: t(isLocalTestMode() ? "toast.localComplete" : "toast.publicComplete"),
        description: exactDomains.length > 0
          ? t("toast.exactComplete", { count: exactDomains.length })
          : localDomains.length >= targets.finalShow
            ? t("toast.resultsShown", { count: localDomains.length })
            : t("toast.resultsLimited", { checked: response.results.length, count: localDomains.length }),
      });
      return true;
    } catch (error) {
      if (activeRequestRef.current !== requestId) return false;
      clearTimer();
      activeAccessRef.current = null;
      requestControllerRef.current = null;
      access.release();
      setIsScanning(false);
      setScanPhase("idle");
      setActiveTLDScans(new Map());
      setTimeRemaining(0);
      toast({
        title: t("toast.startFailed"),
        description: error instanceof Error ? error.message : t("toast.unexpected"),
        variant: "destructive",
      });
      return false;
    }
  }, [clearTimer, domains, isScanning, language, requestAnonymousSearchAccess, scanMode, searchKeyword, selectedTLDs, startTimer, t, toast]);

  return (
    <ScanContext.Provider value={{
      restoredResults,
      isScanning,
      domains,
      pendingDomains,
      domainsScanned,
      timeRemaining,
      scanPhase,
      activeTLDScans,
      selectedTLDs,
      scanMode,
      searchKeyword,
      briefAnalysis,
      generation,
      lastSearchOptions,
      anonymousSearchAccessReady,
      anonymousSearchCanStart,
      freeSearchAvailable,
      freeSearchGateOpen,
      setSelectedTLDs,
      setScanMode,
      setSearchKeyword,
      startScan,
      stopScan,
      clearResults,
      deleteDomain,
      requestAnonymousSearchAccess,
      closeFreeSearchGate,
    }}>
      {children}
    </ScanContext.Provider>
  );
};
