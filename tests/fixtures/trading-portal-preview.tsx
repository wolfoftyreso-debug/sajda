import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Link, Route, RouterProvider, Routes, useLocation, useNavigate } from "react-router-dom";
import TradingPortal from "../../src/components/TradingPortal";
import DraftNavigationProvider from "../../src/app/DraftNavigationProvider";
import { LanguageProvider, LanguageRouteSync, useLanguage } from "../../src/i18n/LanguageProvider";
import type { LostDomainAssessment, LostDomainEvidence } from "../../src/lib/lostDomains";
import { analyzeTradingMarketFit } from "../../shared/trading-market-fit";
import "../../src/index.css";

// Isolated visual QA entry. No live account, provider call, valuation or purchase opportunity.
// The fixture-only Vite config replaces the scenario transport with in-memory storage.
const now = Date.now();
const observedAt = new Date(now - 60_000).toISOString();
const expiresAt = new Date(now + 14 * 60_000).toISOString();
const earlier = new Date(now - 48 * 60 * 60_000).toISOString();
const fixtureAccountId = "local-trading-fixture";

function evidence(kind: LostDomainEvidence["kind"], outcome: string, stale = false): LostDomainEvidence {
  return {
    kind,
    source: "LOCAL UI FIXTURE — synthetic observation; no external request was made",
    method: "local_fixture",
    observedAt: stale ? earlier : observedAt,
    expiresAt: stale ? new Date(now - 60 * 60_000).toISOString() : expiresAt,
    outcome,
  };
}

const candidates: LostDomainAssessment[] = [
  {
    domain: "example.com",
    sourceUrl: "https://example.com/fixture-source",
    targetUrl: "https://example.com/",
    anchor: "LOCAL UI FIXTURE — registered domain example",
    sensitive: false,
    registryStatus: "registered",
    registrability: "unverified",
    confirmedRegistrable: false,
    reviewStatus: "registered",
    evidence: [evidence("registry", "registered"), evidence("dns", "resolves"), evidence("target_http", "responding"), evidence("mail", "mx_present")],
    risk: { level: "review", reasons: ["local_fixture_not_for_purchase"] },
    potentialScore: 20,
    confidenceScore: 75,
    marketFit: analyzeTradingMarketFit("example.com"),
    observationHistory: {
      firstObservedAt: earlier,
      lastObservedAt: observedAt,
      observations: 3,
      independentSources: 1,
      previousRegistryStatus: "registered",
      previousObservedAt: earlier,
      registryChanged: false,
      windowDays: 180,
    },
  },
  {
    domain: "example.net",
    sourceUrl: "https://example.net/fixture-source",
    targetUrl: "https://example.net/",
    anchor: "LOCAL UI FIXTURE — inconclusive domain example",
    sensitive: false,
    registryStatus: "unknown",
    registrability: "unverified",
    confirmedRegistrable: false,
    reviewStatus: "inconclusive",
    evidence: [evidence("registry", "unknown"), evidence("dns", "resolves"), evidence("target_http", "responding"), evidence("mail", "unknown")],
    risk: { level: "review", reasons: ["local_fixture_not_for_purchase", "registry_not_confirmed", "mail_not_confirmed"] },
    potentialScore: 10,
    confidenceScore: 35,
    marketFit: analyzeTradingMarketFit("example.net"),
  },
  {
    domain: "example.org",
    sourceUrl: "https://example.org/fixture-source",
    targetUrl: "https://example.org/",
    anchor: "LOCAL UI FIXTURE — excluded domain with expired observations",
    sensitive: false,
    registryStatus: "registered",
    registrability: "unverified",
    confirmedRegistrable: false,
    reviewStatus: "excluded",
    evidence: [evidence("registry", "registered", true), evidence("dns", "resolves", true), evidence("target_http", "responding", true), evidence("mail", "mx_present", true)],
    risk: { level: "excluded", reasons: ["local_fixture_not_for_purchase", "expired_fixture_evidence"] },
    potentialScore: 0,
    confidenceScore: 0,
    marketFit: analyzeTradingMarketFit("example.org"),
    observationHistory: {
      firstObservedAt: new Date(now - 72 * 60 * 60_000).toISOString(),
      lastObservedAt: earlier,
      observations: 2,
      independentSources: 1,
      previousRegistryStatus: "registry_not_found",
      previousObservedAt: new Date(now - 72 * 60 * 60_000).toISOString(),
      registryChanged: true,
      windowDays: 180,
    },
  },
];

function FixtureEditor() {
  const { language } = useLanguage();
  const [accessLost, setAccessLost] = useState(false);
  return <main style={{ width: "100%", maxWidth: 1280, margin: "0 auto", padding: "24px 16px", boxSizing: "border-box" }}>
    <h1 id="plus-workspace-title" style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Trading portal — local UI validation</h1>
    {accessLost && <p role="alert">The simulated account guard was triggered.</p>}
    <TradingPortal accountId={fixtureAccountId} language={language} candidates={candidates} now={now} onAccessLost={() => setAccessLost(true)} />
    <section id="trading-results" style={{ fontSize: 12, lineHeight: 1.6, color: "#475569" }}>
      <h2 style={{ fontWeight: 700 }}>Synthetic research fixture</h2>
      <p>example.com: registered, four current checks. example.net: unknown registry result, two current checks. example.org: excluded, expired checks and a simulated historical status change.</p>
      <p>No credentials, network lookup, payment, real storage or purchase action is connected.</p>
    </section>
  </main>;
}

export default function TradingPortalFixture() {
  const { language, setLanguage } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const requestedLanguage = new URLSearchParams(location.search).get("lang") === "sv" ? "sv" : "en";
  useEffect(() => { setLanguage(requestedLanguage); }, [requestedLanguage, setLanguage]);

  function changeLanguage(value: "en" | "sv") {
    const query = new URLSearchParams(location.search);
    query.set("lang", value);
    navigate({ pathname: location.pathname, search: query.toString(), hash: location.hash }, { replace: true });
  }

  return <>
    <LanguageRouteSync />
    <aside role="note" aria-label="Local fixture notice" style={{ position: "sticky", top: 0, zIndex: 30, background: "#fff1bf", color: "#3d2c00", borderBottom: "2px solid #b87a00", padding: "12px 16px", fontSize: "12px", lineHeight: 1.5 }}>
      <strong style={{ display: "block" }}>LOCAL UI FIXTURE — simulated account/storage, not live market data</strong>
      <span style={{ display: "block" }}>All observations are synthetic. Saved scenarios exist only in this page’s memory and reset on reload.</span>
      <label style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 6 }}>Fixture language
        <select value={language} onChange={event => changeLanguage(event.target.value as "en" | "sv")} style={{ minHeight: 36, background: "#fff", border: "1px solid #866600", borderRadius: 6, padding: "4px 8px" }}>
          <option value="en">EN — English</option><option value="sv">SV — Svenska</option>
        </select>
      </label>
      <nav aria-label="Local fixture navigation" className="mt-2 flex flex-wrap gap-3">
        <Link className="inline-flex min-h-11 items-center underline" to={`/fixture-away?lang=${language}`}>Fixture: leave editor</Link>
        <Link className="inline-flex min-h-11 items-center underline" to={`/trading-portal-preview.html?lang=${language}`}>Fixture: open editor</Link>
        <button type="button" className="min-h-11 underline" onClick={() => navigate(-1)}>Fixture: Back</button>
        <button type="button" className="min-h-11 underline" onClick={() => navigate(1)}>Fixture: Forward</button>
      </nav>
    </aside>
    <Routes>
      <Route path="/fixture-away" element={<main className="p-6"><h1 className="text-xl font-semibold">LOCAL UI FIXTURE — away from the editor</h1><p className="mt-3">This route tests navigation only. Use the fixture links or browser history to return.</p></main>} />
      <Route path="*" element={<FixtureEditor />} />
    </Routes>
  </>;
}

const router = createBrowserRouter([{ path: "*", element: <DraftNavigationProvider><TradingPortalFixture /></DraftNavigationProvider> }]);
createRoot(document.getElementById("root")!).render(<StrictMode><LanguageProvider><RouterProvider router={router} /></LanguageProvider></StrictMode>);
