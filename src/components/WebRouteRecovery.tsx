import { useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation, useRouteError } from "react-router-dom";
import { useLanguage } from "@/i18n/LanguageProvider";
import { webRouteRecoveryCopy } from "@/i18n/webRouteRecoveryCopy";
import { webRouteErrorReference } from "@/lib/webRouteError";

const actionClass = "inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-3 text-center font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Web-only router fallback. It cannot determine the outcome of an API action. */
export default function WebRouteRecovery() {
  const { language } = useLanguage();
  const { pathname, key } = useLocation();
  const reference = webRouteErrorReference(useRouteError());
  const copy = webRouteRecoveryCopy[language];
  const heading = useRef<HTMLHeadingElement>(null);
  const reloadRequested = useRef(false);
  const [reloading, setReloading] = useState(false);
  const [reloadFailed, setReloadFailed] = useState(false);

  useLayoutEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    const reveal = () => {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      heading.current?.focus({ preventScroll: true });
    };
    reveal();
    const frame = window.requestAnimationFrame(reveal);
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) reveal(); };
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("pageshow", onPageShow);
      window.history.scrollRestoration = previous;
    };
  }, [key]);

  const reload = () => {
    if (reloadRequested.current) return;
    reloadRequested.current = true;
    setReloading(true); setReloadFailed(false);
    try { window.location.reload(); }
    catch {
      reloadRequested.current = false;
      setReloading(false); setReloadFailed(true);
    }
  };

  return <main className="flex min-h-screen items-start justify-center bg-background px-4 py-8 sm:px-6 sm:py-14" aria-labelledby="web-page-error-title">
    <section className="w-full max-w-xl min-w-0 rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-8">
      <img src="/sajda-logo.svg" alt="Sajda" className="h-10 w-auto" />
      <h1 id="web-page-error-title" ref={heading} tabIndex={-1} className="mt-8 text-2xl font-semibold tracking-tight outline-none sm:text-3xl">{copy.title}</h1>
      <p className="mt-4 text-sm leading-6 text-muted-foreground">{copy.body}</p>
      <p className="mt-3 text-sm leading-6">{copy.warning}</p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        {pathname !== "/" && <Link to="/" state={{ sajdaRecoveryFocus: true }} className={`${actionClass} bg-primary text-primary-foreground`}>{copy.search}</Link>}
        <button type="button" onClick={reload} disabled={reloading} className={`${actionClass} border border-border disabled:cursor-wait disabled:opacity-60`}>{reloading ? copy.reloading : copy.reload}</button>
      </div>
      {reloadFailed && <p className="mt-4 text-sm leading-6" role="alert">{copy.reloadFailed}</p>}
      {pathname !== "/account" && <Link to="/account" state={{ sajdaRecoveryFocus: true }} className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{copy.account}</Link>}
      <div className="mt-6 border-t border-border pt-5">
        <a href="mailto:dev@hypbit.com" className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{copy.support}</a>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy.supportHint}</p>
        <p className="mt-3 break-all text-xs text-muted-foreground">{copy.reference}: <span data-web-error-reference>{reference}</span></p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{copy.referenceHint}</p>
      </div>
    </section>
  </main>;
}
