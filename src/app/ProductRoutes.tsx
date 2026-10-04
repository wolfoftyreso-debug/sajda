import { lazy, type ReactNode } from "react";
import { Navigate, Routes, Route } from "react-router-dom";
import ProtectedRoute from "@/components/ProtectedRoute";
import { nameProjectsEnabled } from "@/lib/nameProjectsFeature";

const Index = lazy(() => import("@/pages/Index"));
const Watchlist = lazy(() => import("@/pages/Watchlist"));
const NameProjects = lazy(() => import("@/pages/NameProjects"));
const NamePackages = lazy(() => import("@/pages/NamePackages"));
const BrandIndex = lazy(() => import("@/pages/BrandIndex"));
const BrandIndexAssessment = lazy(() => import("@/pages/BrandIndexAssessment"));
const Account = lazy(() => import("@/pages/Account"));
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
    <Route path="/brand-index" element={<BrandIndex />} />
    <Route path="/brand-index/assessment" element={<BrandIndexAssessment />} />
    <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
    <Route path="/swipe" element={<ProtectedRoute><Swipe /></ProtectedRoute>} />
    <Route path="/watchlist" element={<ProtectedRoute><Watchlist /></ProtectedRoute>} />
    <Route path="/projects" element={<ProtectedRoute><NameProjects /></ProtectedRoute>} />
    <Route path="/name-packages" element={<ProtectedRoute><NamePackages /></ProtectedRoute>} />
    <Route path="/account" element={<ProtectedRoute><Account /></ProtectedRoute>} />
    <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
    {/* Retired Supabase-era URLs keep working without exposing a dead product
        surface. Their maintained equivalents are Neon-backed and owner-scoped. */}
    <Route path="/my-domains" element={<ProtectedRoute><Navigate replace to="/watchlist" /></ProtectedRoute>} />
    <Route path="/history" element={<ProtectedRoute><Navigate replace to={nameProjectsEnabled ? "/projects" : "/watchlist"} /></ProtectedRoute>} />
    <Route path="/top-10-today" element={<ProtectedRoute><Navigate replace to="/plus" /></ProtectedRoute>} />
    {children}
    <Route path="*" element={<NotFound />} />
  </Routes>;
}
