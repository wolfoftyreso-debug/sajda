import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { unavailableFeatureView } from "@/i18n/unavailableFeatureCopy";
import { useLanguage } from "@/i18n/LanguageProvider";

// Do not render an apparently empty account while its storage is unavailable.
export default function AccountFeatureUnavailable() {
  const { language } = useLanguage();
  const { pathname } = useLocation();
  const text = unavailableFeatureView(language, pathname);
  return <main className="container mx-auto max-w-2xl px-5 py-12"><section className="rounded-2xl border border-border bg-card p-6"><h1 className="text-2xl font-semibold">{text.title}</h1><p className="mt-3 leading-7 text-muted-foreground">{text.body}</p><div className="mt-6 flex flex-wrap gap-3"><Button asChild className="h-auto min-h-11 whitespace-normal"><Link to={text.actionHref}>{text.action}</Link></Button><Button asChild variant="outline" className="h-auto min-h-11 whitespace-normal"><Link to={text.secondaryHref}>{text.secondary}</Link></Button></div></section></main>;
}
