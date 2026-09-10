import { useEffect, useRef, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, CircleHelp, Menu } from "lucide-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useLanguage } from "@/i18n/LanguageProvider";
import NativeNavigation from "./NativeNavigation";
import { nativeCopy } from "./nativeCopy";
import "./native.css";

export default function NativeShell({ children }: { children: ReactNode }) {
  const { language } = useLanguage();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const content = useRef<HTMLDivElement>(null);
  const copy = nativeCopy[language];
  useEffect(() => {
    // Native navigation announces new screens and avoids leaving keyboard focus
    // behind on a control from the previous page.
    content.current?.focus({ preventScroll: true });
  }, [pathname]);
  return <div className={`sajda-native-shell ${pathname === "/swipe" ? "sajda-native-swipe" : ""}`}>
    <a href="#native-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-card focus:p-3">{copy.skip}</a>
    <header className="sajda-native-header border-b border-border bg-background">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-3">
        <div className="flex min-w-0 items-center gap-2">
          {pathname !== "/" && <button type="button" onClick={() => window.history.state?.idx > 0 ? navigate(-1) : navigate("/")} aria-label={copy.back} className="inline-flex h-11 w-11 items-center justify-center rounded-xl focus-visible:ring-2 focus-visible:ring-ring"><ArrowLeft className="h-5 w-5" aria-hidden="true" /></button>}
          <Link to="/" aria-label="Sajda" className="inline-flex min-h-11 items-center rounded-lg focus-visible:ring-2 focus-visible:ring-ring"><img src="/sajda-logo.svg" alt="Sajda" className="h-6 w-auto" /></Link>
        </div>
        <div className="flex items-center gap-1">
          <LanguageSwitcher className="[&_button]:min-h-11" />
          <Link to="/help" aria-label={copy.help} className="inline-flex h-11 w-11 items-center justify-center rounded-xl focus-visible:ring-2 focus-visible:ring-ring"><CircleHelp className="h-5 w-5" aria-hidden="true" /></Link>
          <Link to="/more" aria-label={copy.more} className="inline-flex h-11 w-11 items-center justify-center rounded-xl focus-visible:ring-2 focus-visible:ring-ring"><Menu className="h-5 w-5" aria-hidden="true" /></Link>
        </div>
      </div>
    </header>
    <div id="native-content" ref={content} tabIndex={-1} className="sajda-native-content outline-none">{children}</div>
    <NativeNavigation />
  </div>;
}
