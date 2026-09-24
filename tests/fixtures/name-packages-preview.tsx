import { lazy, StrictMode, Suspense, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider, Link, useLocation } from "react-router-dom";
import { LanguageProvider, useLanguage } from "../../src/i18n/LanguageProvider";
import { isLanguage } from "../../src/i18n/languagePreference";
import { ScanProvider } from "../../src/contexts/ScanContext";
import "../../src/index.css";
const NamePackages = lazy(() => import("../../src/pages/NamePackages"));
const BrandIndex = lazy(() => import("../../src/pages/BrandIndex"));
const BrandIndexAssessment = lazy(() => import("../../src/pages/BrandIndexAssessment"));

export default function Fixture() {
  const { setLanguage } = useLanguage();
  const location = useLocation();
  useEffect(() => { const lang = new URLSearchParams(location.search).get("lang"); setLanguage(isLanguage(lang) ? lang : "en"); }, [location.search, setLanguage]);
  const isWorkspace = location.pathname.endsWith("name-packages-preview.html") || location.pathname === "/name-packages";
  return <><aside style={{ padding: "10px 16px", background: "#fff1bf", fontSize: 12, lineHeight: 1.6 }}><strong>LOCAL UI FIXTURE — synthetic search, account and GitHub evidence</strong><p>No real company, domain or social availability is asserted. No external calls, credentials, account writes or database access. Reload resets all fixture data.</p></aside>
    <Suspense fallback={<p role="status" className="p-6">Loading local test page…</p>}>{location.pathname === "/brand-index/assessment" ? <BrandIndexAssessment /> : location.pathname === "/brand-index" ? <BrandIndex /> : isWorkspace ? <NamePackages /> : <main className="p-6"><h1 className="text-2xl font-semibold">Fixture destination</h1><p className="my-4">Navigation only. No sign-in, purchase or provider action takes place here.</p><Link to="/name-packages">Back to package fixture</Link></main>}</Suspense>
  </>;
}
const router = createBrowserRouter([{ path: "*", element: <LanguageProvider><ScanProvider><Fixture /></ScanProvider></LanguageProvider> }]);
createRoot(document.getElementById("root")!).render(<StrictMode><RouterProvider router={router} /></StrictMode>);
