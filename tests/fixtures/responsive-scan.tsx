/* eslint-disable react-refresh/only-export-components -- Serve-only boundary intentionally mirrors the real context's provider, hook and helper exports; HMR is disabled. */
import { createContext, useContext, useState, type ReactNode } from "react";
import { getDefaultRegistrarOffer } from "../../src/lib/registrarOffer";
const noop = () => undefined;
const checkedAt = new Date().toISOString();
const candidates = ["nordform", "alviona", "northfieldstudio"].flatMap(label => ["com", "se"].map(tld => ({
  domain: `${label}.${tld}`, tld, status: "available" as const, availabilityVerified: true,
  checkMethod: "rdap" as const, checkedAt, source: "LOCAL SYNTHETIC RESPONSIVE FIXTURE",
  namingScore: 84, confidenceScore: 40, rationale: "Synthetic candidate for presentation checks only.",
  registrarPrice: 0, estimatedValue: 0, registrarUrl: "", priceVerified: false,
  registrarOffer: getDefaultRegistrarOffer(`${label}.${tld}`),
} )));
export function getModeTargets() { return { collectPerTLD: 50, finalShow: 50, aiCount: 50 }; }
const Context = createContext<ReturnType<typeof useFixtureValue> | null>(null);
function useFixtureValue() {
  const [domains, setDomains] = useState(new URLSearchParams(location.search).get("state") === "results" ? candidates : []);
  const [selectedTLDs, setSelectedTLDs] = useState(["com", "ai", "dev", "app", "net", "org", "xyz", "info", "biz"]);
  const [scanMode, setScanMode] = useState("medium");
  const [searchKeyword, setSearchKeyword] = useState("");
  return { domains, selectedTLDs, setSelectedTLDs, scanMode, setScanMode, searchKeyword, setSearchKeyword,
    restoredResults: false, resultsCheckedAt: checkedAt, isScanning: false, pendingDomains: [],
    domainsScanned: domains.length, timeRemaining: 0, scanPhase: "idle", activeTLDScans: new Map(), briefAnalysis: null,
    generation: null, lastSearchOptions: domains.length ? { theme: "Synthetic founder naming brief", tlds: ["com", "se"] } : null,
    anonymousSearchAccessReady: true, anonymousSearchCanStart: true, freeSearchAvailable: true, freeSearchGateOpen: false,
    closeFreeSearchGate: noop, stopScan: noop, clearResults: () => setDomains([]),
    startScan: async () => { setDomains(candidates); return true; },
    deleteDomain: async (name: string) => setDomains(current => current.filter(item => item.domain !== name)),
    requestAnonymousSearchAccess: () => ({ kind: "free", complete: noop, release: noop }),
  };
}
export function ScanProvider({ children }: { children: ReactNode }) { return <Context.Provider value={useFixtureValue()}>{children}</Context.Provider>; }
export const useScan = () => useContext(Context)!;
