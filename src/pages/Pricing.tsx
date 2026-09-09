import { useEffect } from "react";
import { ArrowLeft, ArrowRight, Info } from "lucide-react";
import { Link } from "react-router-dom";
import { PLAN_ORDER, formatPlanMonthlyPrice } from "../../shared/plans";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { Button } from "@/components/ui/button";
import { applyDocumentMetadata, useLanguage } from "@/i18n/LanguageProvider";
import { getPricingCopy } from "@/i18n/pricingCopy";

const actionClass = "h-auto min-h-11 w-full whitespace-normal px-4 py-3 text-center leading-snug";

export default function Pricing() {
  const { language } = useLanguage();
  const copy = getPricingCopy(language);

  useEffect(() => {
    applyDocumentMetadata(language, "/pricing");
    return () => applyDocumentMetadata(language, window.location.pathname);
  }, [language]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
          <Link to="/" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <ArrowLeft aria-hidden="true" className="h-4 w-4 shrink-0" />{copy.back}
          </Link>
          <LanguageSwitcher className="[&_button]:min-h-11 [&_button]:min-w-10" />
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8" aria-labelledby="pricing-title">
        <div className="max-w-3xl">
          <p className="mb-3 text-sm font-semibold tracking-wide text-primary">{copy.eyebrow}</p>
          <h1 id="pricing-title" className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl lg:text-5xl">{copy.title}</h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">{copy.lead}</p>
        </div>

        <aside className="my-8 flex min-w-0 items-start gap-3 rounded-xl border border-border bg-secondary/40 p-4 sm:my-10 sm:p-5" aria-labelledby="pricing-availability-title">
          <Info aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0">
            <h2 id="pricing-availability-title" className="font-semibold leading-snug">{copy.noticeTitle}</h2>
            <p className="mt-2 max-w-4xl text-sm leading-relaxed text-muted-foreground">{copy.notice}</p>
          </div>
        </aside>

        <div className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-4">
          {PLAN_ORDER.map(id => {
            const plan = copy.plans[id];
            return (
              <article key={id} data-plan={id} aria-labelledby={`pricing-${id}`} className={`flex min-w-0 flex-col rounded-2xl border bg-card p-5 sm:p-6 ${id === "trading" ? "border-primary/50" : "border-border"}`}>
                <p className="text-sm font-medium text-muted-foreground">{plan.audience}</p>
                <h2 id={`pricing-${id}`} className="mt-2 text-2xl font-semibold tracking-tight">{plan.name}</h2>
                <p className="mt-5 break-words text-2xl font-semibold leading-snug tracking-tight tabular-nums" data-plan-price={id}>{formatPlanMonthlyPrice(id, language)}</p>
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{plan.description}</p>
                <div className="mb-6 mt-6 border-t border-border pt-5">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{copy.contents}</h3>
                  <ul className="mt-3 space-y-3">
                    {plan.points.map(point => <li key={point} className="flex min-w-0 items-start gap-2.5 text-sm leading-relaxed"><span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" /><span>{point}</span></li>)}
                  </ul>
                </div>
                <div className="mt-auto">
                  {id === "free" ? (
                    <Button asChild className={actionClass}><Link to="/">{copy.trySearch}<ArrowRight aria-hidden="true" /></Link></Button>
                  ) : id === "trading" ? (
                    <Button asChild variant="outline" className={actionClass}><Link to="/plus">{copy.exploreTrading}<ArrowRight aria-hidden="true" /></Link></Button>
                  ) : (
                    <Button type="button" disabled variant="secondary" className={`${actionClass} disabled:opacity-100`} aria-describedby="pricing-availability-title">{copy.unavailable}</Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        <div className="mt-10 grid gap-8 border-y border-border py-8 md:grid-cols-2 sm:mt-12">
          <section aria-labelledby="pricing-current-title">
            <h2 id="pricing-current-title" className="text-lg font-semibold">{copy.currentTitle}</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{copy.current}</p>
          </section>
          <section aria-labelledby="pricing-monitoring-title">
            <h2 id="pricing-monitoring-title" className="text-lg font-semibold">{copy.monitoringTitle}</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{copy.monitoring}</p>
          </section>
        </div>
        <div className="mt-6 max-w-4xl space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>{copy.terms}</p>
          <p>{copy.risk}</p>
        </div>
      </main>
    </div>
  );
}
