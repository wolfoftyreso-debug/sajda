import { lazy, StrictMode, Suspense, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider, useLocation } from "react-router-dom";
import { LanguageProvider, useLanguage } from "../../src/i18n/LanguageProvider";
import { isLanguage } from "../../src/i18n/languagePreference";
import { ScanProvider } from "../../src/contexts/ScanContext";
import DraftNavigationProvider from "../../src/app/DraftNavigationProvider";
import { TooltipProvider } from "../../src/components/ui/tooltip";
import SajdaFooter from "../../src/components/SajdaFooter";
import NativeShell from "../../src/app/NativeShell";
import { isNativeApp } from "../../src/lib/appSurface";
import "../../src/index.css";

const pages = {
  "/": lazy(() => import("../../src/pages/Index")),
  "/auth": lazy(() => import("../../src/pages/Auth")),
  "/pricing": lazy(() => import("../../src/pages/Pricing")),
  "/brand-index": lazy(() => import("../../src/pages/BrandIndex")),
  "/name-packages": lazy(() => import("../../src/pages/NamePackages")),
  "/developers": lazy(() => import("../../src/pages/Developers")),
  "/swipe": lazy(() => import("../../src/pages/Swipe")),
  "/trading": lazy(() => import("./responsive-trading")),
  "/security": lazy(() => import("../../src/pages/Security")),
  "/legal": lazy(() => import("../../src/pages/Legal")),
  "/story": lazy(() => import("../../src/pages/SajdaStory")),
  "/how-it-works": lazy(() => import("../../src/pages/HowItWorks")),
  "/marketplace": lazy(() => import("../../src/pages/Marketplace")),
  "/primitives": lazy(() => import("./responsive-primitives")),
  "/more": lazy(() => import("../../src/app/NativeMore")),
  "/help": lazy(() => import("../../src/app/NativeHelp")),
};
const nativePages = {
  ...pages,
  "/auth": lazy(() => import("../../src/app/NativeAuth")),
  "/pricing": lazy(() => import("../../src/app/NativeMembership")),
};
export default function Fixture() {
  const { setLanguage, language } = useLanguage();
  const route = useLocation();
  const requested = new URLSearchParams(route.search).get("lang");
  useEffect(() => { setLanguage(isLanguage(requested) ? requested : "en"); }, [requested, setLanguage]);
  const Page = (isNativeApp ? nativePages : pages)[route.pathname as keyof typeof pages];
  const content = <Suspense fallback={<p role="status">Loading isolated responsive fixture…</p>}>
    {Page ? <Page /> : <main><h1>Local fixture destination</h1><p>No live service is connected.</p></main>}
  </Suspense>;
  return <div data-responsive-fixture-language={language} data-responsive-fixture-surface={isNativeApp ? "native" : "web"}>
    {isNativeApp ? <NativeShell>{content}</NativeShell> : <>{content}{!["/auth", "/swipe", "/primitives"].includes(route.pathname) && <SajdaFooter />}</>}
  </div>;
}
const router = createBrowserRouter([{ path: "*", element: <LanguageProvider><ScanProvider><TooltipProvider><DraftNavigationProvider><Fixture /></DraftNavigationProvider></TooltipProvider></ScanProvider></LanguageProvider> }]);
createRoot(document.getElementById("root")!).render(<StrictMode><RouterProvider router={router} /></StrictMode>);
