import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Info } from "lucide-react";
import { Link } from "react-router-dom";
import { PLAN_ORDER, PREMIUM_INTRO_OFFER, formatPlanMonthlyPrice, type PlanId } from "../../shared/plans";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { Button } from "@/components/ui/button";
import { applyDocumentMetadata, useLanguage } from "@/i18n/LanguageProvider";
import { getPlanPurchaseCopy, getPricingCopy } from "@/i18n/pricingCopy";
import { legalRightsCopy } from "@/i18n/legalRightsCopy";
import { getPlusBillingCopy } from "@/i18n/plusBillingCopy";
import { swipePremiumCopy } from "@/i18n/swipePremiumCopy";
import { useAuth } from "@/contexts/AuthContext";
import { useMembership } from "@/contexts/MembershipContext";
import { getPlusBilling, openPlusBilling, PlusBillingError, type PlusBillingSnapshot } from "@/lib/plusBilling";
import { isNativeApp } from "@/lib/appSurface";

const actionClass = "h-auto min-h-11 w-full whitespace-normal px-4 py-3 text-center leading-snug";

export default function Pricing() {
  const { language } = useLanguage();
  const copy = getPricingCopy(language);
  const purchaseCopy = getPlanPurchaseCopy(language);
  const billingCopy = getPlusBillingCopy(language);
  const premiumCopy = swipePremiumCopy[language];
  const { user, loading: authLoading } = useAuth();
  const { membership, loading: membershipLoading, error: membershipError } = useMembership();
  const currentMembership = user && !authLoading && !membershipLoading && !membershipError ? membership : null;
  const [billing, setBilling] = useState<PlusBillingSnapshot | null>(null);
  const [billingBusy, setBillingBusy] = useState<PlanId | "load" | "portal" | null>(null);
  const [billingError, setBillingError] = useState<PlusBillingError | null>(null);
  const billingRequest = useRef<AbortController | null>(null);
  const billingIntent = useRef<{ owner: string; action: string; plan: PlanId; intro: boolean; key: string } | null>(null);
  const checkoutAvailable = Boolean(billing && Object.values(billing.plans).some(plan => plan.ready));

  useEffect(() => {
    applyDocumentMetadata(language, "/pricing");
    return () => applyDocumentMetadata(language, window.location.pathname);
  }, [language]);

  useEffect(() => {
    billingRequest.current?.abort();
    billingIntent.current = null;
    setBilling(null); setBillingError(null);
    if (!user || isNativeApp) { setBillingBusy(null); return; }
    const controller = new AbortController();
    billingRequest.current = controller; setBillingBusy("load");
    void getPlusBilling({ accountId: user.id, signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setBilling(value); })
      .catch(error => { if (!controller.signal.aborted && !(error instanceof Error && error.name === "AbortError")) setBillingError(error instanceof PlusBillingError ? error : new PlusBillingError("unavailable")); })
      .finally(() => { if (!controller.signal.aborted) { billingRequest.current = null; setBillingBusy(null); } });
    return () => controller.abort();
  }, [user]);

  const openBilling = useCallback(async (action: "checkout" | "portal", plan: Exclude<PlanId, "free"> = "trading") => {
    if (!user || billingRequest.current || isNativeApp) return;
    const controller = new AbortController(); billingRequest.current = controller;
    setBillingBusy(action === "portal" ? "portal" : plan); setBillingError(null);
    try {
      const intro = action === "checkout" && plan === "premium" && billing?.premiumIntro?.eligible === true;
      if (!billingIntent.current || billingIntent.current.owner !== user.id || billingIntent.current.action !== action || billingIntent.current.plan !== plan || billingIntent.current.intro !== intro) billingIntent.current = { owner: user.id, action, plan, intro, key: crypto.randomUUID() };
      const url = await openPlusBilling({ accountId: user.id, signal: controller.signal }, action, billingIntent.current.key, plan, intro ? { offer: PREMIUM_INTRO_OFFER.id } : {});
      if (!controller.signal.aborted) window.location.assign(url);
    } catch (error) {
      if (!controller.signal.aborted && !(error instanceof Error && error.name === "AbortError")) setBillingError(error instanceof PlusBillingError ? error : new PlusBillingError("unavailable"));
    } finally {
      if (!controller.signal.aborted) { billingRequest.current = null; setBillingBusy(null); }
    }
  }, [billing?.premiumIntro?.eligible, user]);

  const renderPlan = (id: PlanId) => {
    const plan = copy.plans[id];
    const isCurrent = currentMembership?.plan === id;
    const isIncluded = currentMembership && PLAN_ORDER.indexOf(id) < PLAN_ORDER.indexOf(currentMembership.plan);
    const intro = id === "premium" && !isNativeApp && !isCurrent && !isIncluded
      && !(billing?.premiumIntro?.ready === true && billing.premiumIntro.eligible === false);
    return (
      <article key={id} data-plan={id} aria-labelledby={`pricing-${id}`} className={`flex min-w-0 flex-col rounded-2xl border bg-card p-5 sm:p-6 ${id === "free" ? "border-primary/50" : "border-border"}`}>
        <p className="text-sm font-medium text-muted-foreground">{plan.audience}</p>
        <h3 id={`pricing-${id}`} className="mt-2 text-2xl font-semibold tracking-tight">{plan.name}</h3>
        {(isCurrent || isIncluded) && <p className="mt-2 text-sm font-semibold text-primary" data-plan-access={isCurrent ? "current" : "included"}>{isCurrent ? copy.currentLevel : copy.included}</p>}
        <p className="mt-5 break-words text-2xl font-semibold leading-snug tracking-tight tabular-nums" data-plan-price={id}>{formatPlanMonthlyPrice(id, language)}</p>
        {intro && <div className="mt-4 rounded-xl border border-primary/25 bg-primary/5 p-4" data-pricing-intro>
          <p className="text-xs font-semibold text-primary">{premiumCopy.offer}</p>
          <p className="mt-2 text-lg font-semibold">{premiumCopy.firstMonth}</p>
          <p className="mt-1 text-sm font-semibold">{premiumCopy.renewal}</p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{premiumCopy.eligibility}</p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{premiumCopy.terms}</p>
        </div>}
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{plan.description}</p>
        <div className="mb-6 mt-6 border-t border-border pt-5">
          <h4 className="text-sm font-semibold leading-snug text-foreground" data-plan-scope={id === "free" ? "available" : "planned"}>{id === "free" ? copy.contents : copy.plannedContents}</h4>
          <ul className="mt-3 space-y-3">
            {plan.points.map(point => <li key={point} className="flex min-w-0 items-start gap-2.5 text-sm leading-relaxed"><span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" /><span>{point}</span></li>)}
          </ul>
        </div>
        <div className="mt-auto" data-plan-action={id}>
          {id === "free" ? (
            <Button asChild className={actionClass}><Link to="/">{copy.trySearch}<ArrowRight aria-hidden="true" /></Link></Button>
          ) : isCurrent ? (
            <Button asChild variant="outline" className={actionClass}><Link to={id === "trading" ? "/plus" : "/account"}>{id === "trading" ? copy.openTrading : copy.account}<ArrowRight aria-hidden="true" /></Link></Button>
          ) : isIncluded ? (
            <Button type="button" disabled variant="secondary" className={`${actionClass} disabled:opacity-100`}>{copy.included}</Button>
          ) : !user ? (
            <Button asChild variant="outline" className={actionClass}><Link to="/auth?next=%2Fpricing">{copy.signIn}<ArrowRight aria-hidden="true" /></Link></Button>
          ) : isNativeApp ? (
            <Button type="button" disabled variant="secondary" className={`${actionClass} disabled:opacity-100`}>{purchaseCopy.unavailable}</Button>
          ) : billing?.plans[id].canCheckout && (!intro || billing.premiumIntro?.eligible === true) ? (
            <Button type="button" disabled={Boolean(billingBusy)} className={actionClass} onClick={() => void openBilling("checkout", id)}>{billingBusy === id ? purchaseCopy.opening : intro ? billing?.mode === "test" ? premiumCopy.testUpgrade : premiumCopy.upgrade : `${purchaseCopy.choose} ${plan.name}`}<ArrowRight aria-hidden="true" /></Button>
          ) : billing?.canManage ? (
            <Button type="button" variant="outline" disabled={Boolean(billingBusy)} className={actionClass} onClick={() => void openBilling("portal")}>{billingBusy === "portal" ? purchaseCopy.opening : purchaseCopy.manage}<ArrowRight aria-hidden="true" /></Button>
          ) : id === "trading" ? (
            <Button asChild variant="outline" className={actionClass}><Link to="/plus">{copy.exploreTrading}<ArrowRight aria-hidden="true" /></Link></Button>
          ) : (
            <Button type="button" disabled variant="secondary" className={`${actionClass} disabled:opacity-100`} aria-describedby="pricing-availability-title">{billingBusy === "load" ? purchaseCopy.checking : copy.unavailable}</Button>
          )}
        </div>
      </article>
    );
  };

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
          <div className="mt-5">
            {authLoading || (user && membershipLoading) ? <p role="status" className="text-sm text-muted-foreground">{copy.checkingAccess}</p> : user ? (
              <>
                {currentMembership ? (
                  <p className="text-sm font-semibold" data-account-plan={currentMembership.plan}>{copy.currentLevel}: {copy.plans[currentMembership.plan].name}{currentMembership.accessSource === "operator" && <span className="mt-1 block font-normal text-muted-foreground">{copy.assignedAccess}</span>}</p>
                ) : <p role="status" className="text-sm text-muted-foreground">{copy.unknownAccess}</p>}
                <Link to="/account" className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{copy.account}<ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0" /></Link>
              </>
            ) : <Link to="/auth?next=%2Faccount" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{copy.signIn}<ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0" /></Link>}
          </div>
        </div>

        <section className="mt-8 rounded-2xl border border-primary/25 bg-primary/5 p-5 sm:p-6" aria-labelledby="pricing-current-title">
          <h2 id="pricing-current-title" className="text-xl font-semibold">{copy.currentTitle}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">{copy.current}</p>
          <Button asChild className="mt-5 h-auto min-h-11 whitespace-normal px-5 py-3"><Link to="/">{copy.trySearch}<ArrowRight aria-hidden="true" /></Link></Button>
        </section>

        <aside className="my-8 flex min-w-0 items-start gap-3 rounded-xl border border-border bg-secondary/40 p-4 sm:my-10 sm:p-5" aria-labelledby="pricing-availability-title">
          <Info aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0">
            <h2 id="pricing-availability-title" className="font-semibold leading-snug">{checkoutAvailable ? purchaseCopy.readyTitle : copy.noticeTitle}</h2>
            <p className="mt-2 max-w-4xl text-sm leading-relaxed text-muted-foreground">{checkoutAvailable ? purchaseCopy.ready : copy.notice}</p>
          </div>
        </aside>
        {billing?.mode === "test" && <p role="status" className="-mt-4 mb-8 text-sm font-semibold text-primary">{billingCopy.testMode}</p>}
        {billing?.canManage && <div className="-mt-4 mb-8 max-w-4xl space-y-2 text-sm leading-relaxed text-muted-foreground" data-plan-change-policy><p>{billingCopy.planChangePolicy}</p><Link to="/contact" className="inline-flex min-h-11 items-center text-primary underline underline-offset-4">{legalRightsCopy[language].contactLink}</Link></div>}
        {billingError && <div role="alert" className="-mt-5 mb-8 space-y-2 text-sm font-medium text-destructive">
          <p>{billingCopy.errors[billingError.code]}</p>
          {billingError.requestId && <p className="break-all text-xs font-normal">{billingError.requestId}</p>}
          <Link to="/contact" className="inline-flex min-h-11 items-center underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{legalRightsCopy[language].contactLink}</Link>
        </div>}

        <section aria-labelledby="pricing-founder-title" data-plan-group="founder">
          <h2 id="pricing-founder-title" className="text-2xl font-semibold leading-tight tracking-tight">{copy.founderTitle}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">{copy.founderDescription}</p>
          <div className="mt-6 grid items-stretch gap-4 lg:grid-cols-3">
            {PLAN_ORDER.filter(id => id !== "trading").map(renderPlan)}
          </div>
        </section>

        <section className="mt-10 grid items-start gap-6 border-t border-border pt-10 md:grid-cols-2 sm:mt-12" aria-labelledby="pricing-specialist-title" data-plan-group="specialist">
          <div>
            <h2 id="pricing-specialist-title" className="text-2xl font-semibold leading-tight tracking-tight">{copy.specialistTitle}</h2>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">{copy.specialistDescription}</p>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">{copy.risk}</p>
          </div>
          {renderPlan("trading")}
        </section>

        <div className="mt-10 border-y border-border py-8 sm:mt-12">
          <section aria-labelledby="pricing-monitoring-title">
            <h2 id="pricing-monitoring-title" className="text-lg font-semibold">{copy.monitoringTitle}</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{copy.monitoring}</p>
          </section>
        </div>
        <div className="mt-6 max-w-4xl space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>{copy.hierarchy}</p>
          <p>{copy.terms}</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {[["/legal#terms", legalRightsCopy[language].termsLink], ["/legal#privacy", legalRightsCopy[language].privacyLink], ["/contact", legalRightsCopy[language].contactLink]].map(([to, label]) => (
              <Link key={to} to={to} className="inline-flex min-h-11 items-center text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{label}</Link>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
