import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider, Link, useLocation } from "react-router-dom";
import { LanguageProvider, useLanguage } from "../../src/i18n/LanguageProvider";
import { isLanguage } from "../../src/i18n/languagePreference";
import DraftNavigationProvider from "../../src/app/DraftNavigationProvider";
import NameProjects from "../../src/pages/NameProjects";
import "../../src/index.css";

export default function Fixture() {
  const { setLanguage } = useLanguage();
  const location = useLocation();
  useEffect(() => { const lang = new URLSearchParams(location.search).get("lang"); setLanguage(isLanguage(lang) ? lang : "en"); }, [location.search, setLanguage]);
  const isEditor = location.pathname.endsWith("name-projects-preview.html");
  return <DraftNavigationProvider><aside style={{ padding: "10px 16px", background: "#fff1bf", fontSize: 12, lineHeight: 1.6 }}><strong>LOCAL UI FIXTURE — simulated account and storage</strong><p>No credentials, live availability, pricing, provider calls or database writes. Reload resets the fixture.</p></aside>
    {isEditor ? <NameProjects /> : <main className="p-6"><h1 className="text-2xl font-semibold">Fixture destination</h1><p className="my-4">Navigation completed. Any search state remains local; nothing is submitted.</p><Link to="/name-projects-preview.html">Back to project fixture</Link></main>}
  </DraftNavigationProvider>;
}
const router = createBrowserRouter([{ path: "*", element: <LanguageProvider><Fixture /></LanguageProvider> }]);
createRoot(document.getElementById("root")!).render(<StrictMode><RouterProvider router={router} /></StrictMode>);
