import { lazy, Suspense } from "react";
import { BrowserRouter, Route, useLocation } from "react-router-dom";
import AppProviders from "@/app/AppProviders";
import ProductRoutes from "@/app/ProductRoutes";
import ProtectedRoute from "@/components/ProtectedRoute";
import SajdaFooter from "@/components/SajdaFooter";
import RouteScrollRestoration from "@/components/RouteScrollRestoration";
import FreeSearchGate from "@/components/FreeSearchGate";
import { LanguageRouteSync } from "@/i18n/LanguageProvider";
const Install = lazy(() => import("./pages/Install"));
const Auth = lazy(() => import("./pages/Auth"));
const NativeConnect = lazy(() => import("./pages/NativeConnect"));
const SajdaStory = lazy(() => import("./pages/SajdaStory"));
const HowItWorks = lazy(() => import("./pages/HowItWorks"));
const Pricing = lazy(() => import("./pages/Pricing"));
const SeoProductPage = lazy(() => import("./pages/SeoProductPage"));
const SajdaMethodology = lazy(() => import("./pages/SajdaMethodology"));

const AppRoutes = () => {
  const { pathname } = useLocation();

  return (
    <>
      <LanguageRouteSync />
      <RouteScrollRestoration />
      <Suspense fallback={<div className="min-h-screen bg-background" aria-label="Loading page" />}>
        <ProductRoutes authElement={<Auth />}>
          <Route path="/connect/native" element={<NativeConnect />} />
          <Route path="/story" element={<SajdaStory />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/se" element={<SeoProductPage pageId="market" />} />
          <Route path="/se/sok-doman" element={<SeoProductPage pageId="domain-search" />} />
          <Route path="/se/domannamn-generator" element={<SeoProductPage pageId="domain-generator" />} />
          <Route path="/se/foretagsnamn-generator" element={<SeoProductPage pageId="company-generator" />} />
          <Route path="/se/hitta-domannamn" element={<SeoProductPage pageId="find-domain-name" />} />
          <Route path="/se/toppdomaner" element={<SeoProductPage pageId="top-domains" />} />
          <Route path="/se/toppdomaner/se" element={<SeoProductPage pageId="tld-se" />} />
          <Route path="/se/toppdomaner/com" element={<SeoProductPage pageId="tld-com" />} />
          <Route path="/se/toppdomaner/ai" element={<SeoProductPage pageId="tld-ai" />} />
          <Route path="/se/toppdomaner/app" element={<SeoProductPage pageId="tld-app" />} />
          <Route path="/se/toppdomaner/dev" element={<SeoProductPage pageId="tld-dev" />} />
          <Route path="/se/toppdomaner/org" element={<SeoProductPage pageId="tld-org" />} />
          <Route path="/se/toppdomaner/net" element={<SeoProductPage pageId="tld-net" />} />
          <Route path="/se/sa-fungerar-sajda" element={<SajdaMethodology />} />
          <Route path="/se/guide" element={<SeoProductPage pageId="guide-hub" />} />
          <Route path="/se/guide/se-eller-com" element={<SeoProductPage pageId="se-or-com" />} />
          <Route path="/se/guide/vad-kostar-en-doman" element={<SeoProductPage pageId="domain-cost" />} />
          <Route path="/se/guide/domanfornyelse" element={<SeoProductPage pageId="domain-renewal" />} />
          <Route path="/se/guide/valja-domannamn" element={<SeoProductPage pageId="choose-domain-name" />} />
          <Route path="/se/guide/flytta-doman" element={<SeoProductPage pageId="move-domain" />} />
          <Route path="/se/guide/doman-och-varumarke" element={<SeoProductPage pageId="domain-and-trademark" />} />
          <Route path="/se/guide/korta-domannamn" element={<SeoProductPage pageId="short-domain-names" />} />
          <Route path="/install" element={<ProtectedRoute><Install /></ProtectedRoute>} />
        </ProductRoutes>
      </Suspense>
      {pathname !== "/swipe" && <SajdaFooter />}
      <FreeSearchGate />
    </>
  );
};

const App = () => (
  <AppProviders>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
  </AppProviders>
);

export default App;
