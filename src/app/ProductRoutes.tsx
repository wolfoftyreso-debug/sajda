import { lazy, type ReactNode } from "react";
import { Routes, Route } from "react-router-dom";
import ProtectedRoute from "@/components/ProtectedRoute";
import { hasSupabaseBrowserConfig } from "@/integrations/supabase/client";
import AccountFeatureUnavailable from "@/pages/AccountFeatureUnavailable";

const Index = lazy(() => import("@/pages/Index"));
const Watchlist = lazy(() => import("@/pages/Watchlist"));
const MyDomains = lazy(() => import("@/pages/MyDomains"));
const SearchHistory = lazy(() => import("@/pages/SearchHistory"));
const Account = lazy(() => import("@/pages/Account"));
const Top10Today = lazy(() => import("@/pages/Top10Today"));
const Admin = lazy(() => import("@/pages/Admin"));
const Swipe = lazy(() => import("@/pages/Swipe"));
const Developers = lazy(() => import("@/pages/Developers"));
const Marketplace = lazy(() => import("@/pages/Marketplace"));
const MarketplaceListing = lazy(() => import("@/pages/MarketplaceListing"));
const Legal = lazy(() => import("@/pages/Legal"));
const Security = lazy(() => import("@/pages/Security"));
const Status = lazy(() => import("@/pages/Status"));
const Contact = lazy(() => import("@/pages/Contact"));
const LostDomains = lazy(() => import("@/pages/LostDomains"));
const NotFound = lazy(() => import("@/pages/NotFound"));

/** Product routes share behavior. Each shell supplies its own additional pages. */
export default function ProductRoutes({ children, authElement }: { children?: ReactNode; authElement: ReactNode }) {
  return <Routes>
    <Route path="/auth" element={authElement} />
    <Route path="/developers" element={<Developers />} />
    <Route path="/marketplace" element={<Marketplace />} />
    <Route path="/marketplace/:listingId" element={<MarketplaceListing />} />
    <Route path="/legal" element={<Legal />} />
    <Route path="/security" element={<Security />} />
    <Route path="/status" element={<Status />} />
    <Route path="/contact" element={<Contact />} />
    <Route path="/plus" element={<LostDomains />} />
    <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
    <Route path="/swipe" element={<ProtectedRoute><Swipe /></ProtectedRoute>} />
    <Route path="/watchlist" element={<ProtectedRoute><Watchlist /></ProtectedRoute>} />
    <Route path="/account" element={<ProtectedRoute><Account /></ProtectedRoute>} />
    <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
    <Route path="/my-domains" element={<ProtectedRoute>{hasSupabaseBrowserConfig ? <MyDomains /> : <AccountFeatureUnavailable />}</ProtectedRoute>} />
    <Route path="/history" element={<ProtectedRoute>{hasSupabaseBrowserConfig ? <SearchHistory /> : <AccountFeatureUnavailable />}</ProtectedRoute>} />
    <Route path="/top-10-today" element={<ProtectedRoute>{hasSupabaseBrowserConfig ? <Top10Today /> : <AccountFeatureUnavailable />}</ProtectedRoute>} />
    {children}
    <Route path="*" element={<NotFound />} />
  </Routes>;
}
