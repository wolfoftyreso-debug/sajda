import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { MembershipProvider } from "@/contexts/MembershipContext";
import { ScanProvider } from "@/contexts/ScanContext";
import { LanguageProvider } from "@/i18n/LanguageProvider";
import ProtectedRoute from "@/components/ProtectedRoute";
import SajdaFooter from "@/components/SajdaFooter";
import RouteScrollRestoration from "@/components/RouteScrollRestoration";
import FreeSearchGate from "@/components/FreeSearchGate";
import { hasSupabaseBrowserConfig } from "@/integrations/supabase/client";
import AccountFeatureUnavailable from "@/pages/AccountFeatureUnavailable";
const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const Watchlist = lazy(() => import("./pages/Watchlist"));
const MyDomains = lazy(() => import("./pages/MyDomains"));
const SearchHistory = lazy(() => import("./pages/SearchHistory"));
const Account = lazy(() => import("./pages/Account"));
const Install = lazy(() => import("./pages/Install"));
const Top10Today = lazy(() => import("./pages/Top10Today"));
const Admin = lazy(() => import("./pages/Admin"));
const Swipe = lazy(() => import("./pages/Swipe"));
const SajdaStory = lazy(() => import("./pages/SajdaStory"));
const HowItWorks = lazy(() => import("./pages/HowItWorks"));
const Developers = lazy(() => import("./pages/Developers"));
const Marketplace = lazy(() => import("./pages/Marketplace"));
const MarketplaceListing = lazy(() => import("./pages/MarketplaceListing"));
const Legal = lazy(() => import("./pages/Legal"));
const Security = lazy(() => import("./pages/Security"));
const Status = lazy(() => import("./pages/Status"));
const Contact = lazy(() => import("./pages/Contact"));
const LostDomains = lazy(() => import("./pages/LostDomains"));
const Pricing = lazy(() => import("./pages/Pricing"));
const NotFound = lazy(() => import("./pages/NotFound"));
const SeoProductPage = lazy(() => import("./pages/SeoProductPage"));
const SajdaMethodology = lazy(() => import("./pages/SajdaMethodology"));

const AppRoutes = () => {
  const { pathname } = useLocation();

  return (
    <>
      <RouteScrollRestoration />
      <Suspense fallback={<div className="min-h-screen bg-background" aria-label="Loading page" />}>
        <Routes>
          <Route path="/auth" element={<Auth />} />
          <Route path="/story" element={<SajdaStory />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="/developers" element={<Developers />} />
          <Route path="/legal" element={<Legal />} />
          <Route path="/security" element={<Security />} />
          <Route path="/status" element={<Status />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/plus" element={<LostDomains />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/marketplace" element={<Marketplace />} />
          <Route path="/marketplace/:listingId" element={<MarketplaceListing />} />
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
          <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
          <Route path="/swipe" element={<ProtectedRoute><Swipe /></ProtectedRoute>} />
          <Route path="/watchlist" element={<ProtectedRoute><Watchlist /></ProtectedRoute>} />
          <Route path="/my-domains" element={<ProtectedRoute>{hasSupabaseBrowserConfig ? <MyDomains /> : <AccountFeatureUnavailable />}</ProtectedRoute>} />
          <Route path="/history" element={<ProtectedRoute>{hasSupabaseBrowserConfig ? <SearchHistory /> : <AccountFeatureUnavailable />}</ProtectedRoute>} />
          <Route path="/account" element={<ProtectedRoute><Account /></ProtectedRoute>} />
          <Route path="/install" element={<ProtectedRoute><Install /></ProtectedRoute>} />
          <Route path="/top-10-today" element={<ProtectedRoute>{hasSupabaseBrowserConfig ? <Top10Today /> : <AccountFeatureUnavailable />}</ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      {pathname !== "/swipe" && <SajdaFooter />}
      <FreeSearchGate />
    </>
  );
};

const App = () => (
  <LanguageProvider>
    <AuthProvider>
      <MembershipProvider>
      <ScanProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </TooltipProvider>
      </ScanProvider>
      </MembershipProvider>
    </AuthProvider>
  </LanguageProvider>
);

export default App;
