import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/i18n/LanguageProvider";
import { nativeCopy } from "./nativeCopy";
import { nameProjectsEnabled } from "@/lib/nameProjectsFeature";
import { projectEntryCopy } from "@/i18n/projectEntryCopy";
import { namePackageEntryCopy } from "@/i18n/namePackageEntryCopy";

export default function NativeMore() {
  const { language } = useLanguage();
  const { user } = useAuth();
  const copy = nativeCopy[language];
  const links = [
    { to: user ? "/account" : "/auth?next=%2Faccount", label: user ? copy.account : copy.signIn },
    { to: "/pricing", label: copy.membership },
    { to: "/brand-index", label: "Sajda Brand Index" },
    { to: "/name-packages", label: namePackageEntryCopy[language].title },
    ...(nameProjectsEnabled ? [{ to: "/projects", label: projectEntryCopy[language].projects }, { to: "/plus", label: copy.trading }] : []),
    { to: "/marketplace", label: copy.marketplace },
    { to: "/developers", label: copy.developers },
    { to: "/help", label: copy.help },
    { to: "/contact", label: copy.support },
    { to: "/legal#privacy", label: copy.privacy },
    { to: "/legal#terms", label: copy.terms },
    { to: "/security", label: copy.security },
    { to: "/status", label: copy.status },
  ];
  return <main className="mx-auto max-w-3xl px-4 py-6" aria-labelledby="native-more-title">
    <h1 id="native-more-title" className="text-2xl font-semibold tracking-tight">{copy.more}</h1>
    <nav aria-label={copy.more} className="mt-6 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
      {links.map(({ to, label }) => <Link key={to} to={to} className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 font-medium hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
        <span>{label}</span><ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>)}
    </nav>
  </main>;
}
