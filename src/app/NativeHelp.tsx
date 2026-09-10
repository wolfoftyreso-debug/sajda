import { Link } from "react-router-dom";
import SearchResultHelp from "@/components/SearchResultHelp";
import { useLanguage } from "@/i18n/LanguageProvider";
import { nativeCopy } from "./nativeCopy";

export default function NativeHelp() {
  const { language } = useLanguage();
  const copy = nativeCopy[language];
  return <main className="mx-auto max-w-3xl space-y-6 px-4 py-6" aria-labelledby="native-help-title">
    <h1 id="native-help-title" className="text-2xl font-semibold tracking-tight">{copy.help}</h1>
    {[[copy.search, copy.helpIntro], [copy.swipe, copy.swipeHelp], [copy.trading, copy.tradingHelp]].map(([title, body]) => <section key={title} className="rounded-2xl border border-border bg-card p-5">
      <h2 className="font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
    </section>)}
    <SearchResultHelp language={language} />
    <Link to="/contact" className="inline-flex min-h-11 items-center font-semibold text-primary underline">{copy.support}</Link>
  </main>;
}
