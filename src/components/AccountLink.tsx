import { Link, useLocation } from "react-router-dom";
import { UserRound } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/i18n/LanguageProvider";
import { accountNavigationCopy } from "@/i18n/accountNavigationCopy";

/** The same account entry in every workspace. Never creates a Trading identity. */
export default function AccountLink({ compact = false }: { compact?: boolean }) {
  const { user, loading } = useAuth();
  const { language } = useLanguage();
  const { pathname } = useLocation();
  const copy = accountNavigationCopy[language];
  const label = user || loading ? copy.account : copy.signIn;
  return <Link to={user || loading ? "/account" : `/auth?next=${encodeURIComponent(pathname === "/auth" ? "/account" : pathname)}`}
    aria-label={label} className={`inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${compact ? "w-10" : "px-3"}`}>
    <UserRound className="h-4 w-4 shrink-0" aria-hidden="true" />
    {!compact && <span>{label}</span>}
  </Link>;
}
