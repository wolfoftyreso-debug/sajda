import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { MembershipProvider } from "@/contexts/MembershipContext";
import { ScanProvider } from "@/contexts/ScanContext";
import { LanguageProvider } from "@/i18n/LanguageProvider";

/** One account, entitlement source and search engine across both entry points. */
export default function AppProviders({ children }: { children: ReactNode }) {
  return <LanguageProvider><AuthProvider><MembershipProvider><ScanProvider><TooltipProvider>
    <Toaster /><Sonner />{children}
  </TooltipProvider></ScanProvider></MembershipProvider></AuthProvider></LanguageProvider>;
}
