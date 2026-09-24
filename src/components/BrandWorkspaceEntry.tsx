import { Link } from "react-router-dom";
import { ArrowRight, Layers } from "lucide-react";
import { useLanguage } from "@/i18n/LanguageProvider";
import { brandWorkspaceCopy } from "@/i18n/brandWorkspaceCopy";

export default function BrandWorkspaceEntry({ compact = false }: { compact?: boolean }) {
  const { language } = useLanguage(), c = brandWorkspaceCopy[language];
  return <section className="my-5 rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 to-card p-5 sm:p-6">
    <p className="flex items-center gap-2 text-sm font-semibold text-primary"><Layers className="h-5 w-5 shrink-0" aria-hidden="true" />Sajda Brand Index</p>
    <h2 className="mt-3 text-xl font-semibold tracking-tight sm:text-2xl">{c.overview}</h2>
    {!compact && <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{c.overviewBody}</p>}
    <div className="mt-4 flex flex-wrap gap-3"><Link className="inline-flex min-h-12 max-w-full items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground" to="/name-packages"><span>{c.open}</span><ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" /></Link>
      <Link className="inline-flex min-h-12 items-center px-2 py-3 text-sm font-semibold text-primary underline underline-offset-4" to="/brand-index">{c.existing}</Link></div>
  </section>;
}
