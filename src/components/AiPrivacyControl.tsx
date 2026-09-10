import { useId, useSyncExternalStore } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/i18n/LanguageProvider";
import { aiPrivacyCopy } from "@/i18n/aiPrivacyCopy";
import { hasAiPermission, setAiPermission, subscribeAiPermission } from "@/lib/aiConsent";

/** Explicit opt-in only. No data submission or product action occurs here. */
export default function AiPrivacyControl({ className = "" }: { className?: string }) {
  const { language } = useLanguage();
  const copy = aiPrivacyCopy[language] ?? aiPrivacyCopy.en;
  const enabled = useSyncExternalStore(subscribeAiPermission, hasAiPermission, () => false);
  const id = useId();
  return <section className={`rounded-xl border border-border bg-background p-4 text-sm ${className}`} aria-labelledby={id}>
    <h3 id={id} className="font-semibold text-foreground">{copy.title} <span className="font-normal text-muted-foreground" role="status">· {enabled ? copy.on : copy.off}</span></h3>
    <p className="mt-2 leading-6 text-muted-foreground">{copy.disclosure}</p>
    <p className="mt-2 leading-6 text-muted-foreground">{copy.choice}</p>
    <div className="mt-3 flex flex-wrap gap-2">
      {enabled ? <Button type="button" variant="outline" className="min-h-11 h-auto whitespace-normal text-left" onClick={() => setAiPermission(false)}>{copy.revoke}</Button>
        : <><Button type="button" variant="outline" className="min-h-11 h-auto whitespace-normal text-left" onClick={() => setAiPermission(true)}>{copy.allow}</Button>
          <Button type="button" variant="outline" className="min-h-11 h-auto whitespace-normal text-left" onClick={() => setAiPermission(false)}>{copy.decline}</Button></>}
    </div>
    <p className="mt-3 text-xs leading-5 text-muted-foreground">{copy.persistence}</p>
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-xs">
      <Link className="underline underline-offset-4" to="/legal#privacy">{copy.privacy}</Link>
      <a className="underline underline-offset-4" href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">{copy.google}</a>
      <a className="underline underline-offset-4" href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer">{copy.vercel}</a>
    </div>
  </section>;
}
