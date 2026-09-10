import { Link } from "react-router-dom";
import { useLanguage } from "@/i18n/LanguageProvider";
import { nativeCopy } from "./nativeCopy";

export default function NativePurchaseNotice() {
  const { language } = useLanguage();
  const copy = nativeCopy[language];
  return <section className="rounded-2xl border border-border bg-card p-5" aria-labelledby="native-purchase-title">
    <h2 id="native-purchase-title" className="font-semibold">{copy.checkoutTitle}</h2>
    <p className="mt-3 text-sm leading-6 text-muted-foreground">{copy.checkoutBody}</p>
    <Link to="/contact" className="mt-2 inline-flex min-h-11 items-center font-semibold text-primary underline">{copy.support}</Link>
  </section>;
}
