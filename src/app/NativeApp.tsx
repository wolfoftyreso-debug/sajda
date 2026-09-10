import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route } from "react-router-dom";
import FreeSearchGate from "@/components/FreeSearchGate";
import { LanguageRouteSync } from "@/i18n/LanguageProvider";
import RouteScrollRestoration from "@/components/RouteScrollRestoration";
import RouteLoading from "@/components/RouteLoading";
import AppProviders from "./AppProviders";
import ProductRoutes from "./ProductRoutes";
import NativeShell from "./NativeShell";
import NativeMore from "./NativeMore";
import NativeHelp from "./NativeHelp";
import NativeMembership from "./NativeMembership";
const NativeAuth = lazy(() => import("./NativeAuth"));

/** Separate dependency graph: no public landing pages or website footer. */
export default function NativeApp() {
  return <AppProviders><BrowserRouter><NativeShell>
    <LanguageRouteSync />
    <RouteScrollRestoration />
    <Suspense fallback={<RouteLoading className="min-h-48" />}>
      <ProductRoutes authElement={<NativeAuth />}>
        <Route path="/pricing" element={<NativeMembership />} />
        <Route path="/more" element={<NativeMore />} />
        <Route path="/help" element={<NativeHelp />} />
        <Route path="/how-it-works" element={<Navigate to="/help" replace />} />
        <Route path="/native.html" element={<Navigate to="/" replace />} />
        <Route path="/app" element={<Navigate to="/" replace />} />
      </ProductRoutes>
    </Suspense>
    <FreeSearchGate />
  </NativeShell></BrowserRouter></AppProviders>;
}
