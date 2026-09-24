import { lazy, StrictMode, Suspense, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider, useLocation } from "react-router-dom";
import { LanguageProvider, useLanguage } from "../../src/i18n/LanguageProvider";
import { isLanguage } from "../../src/i18n/languagePreference";
import "../../src/index.css";

const params = new URLSearchParams(location.search);
const language = params.get("lang");
Object.assign(window, { __sajdaAuthFixture: { calls: [], toasts: [], user: params.get("fixture") === "signed-in" ? { id: "local-auth-fixture" } : null,
  configured: params.get("fixture") !== "unavailable", loading: false, delay: 20, errorCode: null } });
const Auth = lazy(() => import("../../src/pages/Auth"));

export default function Fixture() {
  const { setLanguage, language: selectedLanguage } = useLanguage();
  const route = useLocation();
  useEffect(() => { setLanguage(isLanguage(language) ? language : "en"); }, [setLanguage]);
  return <div data-auth-fixture-language={selectedLanguage}>
    <Suspense fallback={<p role="status">Loading local auth fixture…</p>}>
      {route.pathname === "/auth" ? <Auth /> : <main data-auth-fixture-destination className="p-8"><h1>Local fixture destination</h1><p>{route.pathname}{route.search}{route.hash}</p></main>}
    </Suspense>
  </div>;
}
const router = createBrowserRouter([{ path: "*", element: <LanguageProvider><Fixture /></LanguageProvider> }]);
createRoot(document.getElementById("root")!).render(<StrictMode><RouterProvider router={router} /></StrictMode>);
