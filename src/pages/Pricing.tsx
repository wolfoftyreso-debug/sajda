import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Info } from "lucide-react";
import { Link } from "react-router-dom";
import { BASE_PLAN_ORDER, PREMIUM_INTRO_OFFER, formatPlanMonthlyPrice, formatTradingAddonMonthlyPrice, formatTradingBundleMonthlyPrice, type BasePlanId, type PlanId } from "../../shared/plans";
import { membershipProductModel } from "../../shared/account-membership";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { applyDocumentMetadata, useLanguage } from "@/i18n/LanguageProvider";
import { getPlanPurchaseCopy, getPricingCopy } from "@/i18n/pricingCopy";
import { legalRightsCopy } from "@/i18n/legalRightsCopy";
import { getPlusBillingCopy } from "@/i18n/plusBillingCopy";
import { swipePremiumCopy } from "@/i18n/swipePremiumCopy";
import { tradingAddonCopy } from "@/i18n/tradingAddonCopy";
import { tradingPurchaseCopy } from "@/i18n/tradingPurchaseCopy";
import { useAuth } from "@/contexts/AuthContext";
import { useMembership } from "@/contexts/MembershipContext";
import { cancelTradingAddonChange, changeTradingAddon, getPlusBilling, openPlusBilling, PlusBillingError, type PlusBillingSnapshot } from "@/lib/plusBilling";
import { isNativeApp } from "@/lib/appSurface";

const actionClass = "h-auto min-h-11 w-full whitespace-normal px-4 py-3 text-center leading-snug";

export default function Pricing() {
  const { language } = useLanguage();
  const copy = getPricingCopy(language);
  const purchaseCopy = getPlanPurchaseCopy(language);
  const billingCopy = getPlusBillingCopy(language);
  const premiumCopy = swipePremiumCopy[language];
  const addonCopy = tradingAddonCopy[language];
  const addonPurchase = tradingPurchaseCopy[language];
  const { user, loading: authLoading } = useAuth();
  const { membership, loading: membershipLoading, error: membershipError } = useMembership();
  const currentMembership = user && !authLoading && !membershipLoading && !membershipError ? membership : null;
  const currentProduct = currentMembership ? membershipProductModel(currentMembership) : null;
  const [billingSnapshot, setBilling] = useState<PlusBillingSnapshot | null>(null);
  const billing = user && billingSnapshot?.accountId === user.id ? billingSnapshot : null;
  const portalAvailable = billing?.canManage === true && billing.tradingAddon?.pending === null;
  const [billingBusy, setBillingBusy] = useState<PlanId | "load" | "portal" | "addon" | null>(null);
  const [billingError, setBillingError] = useState<PlusBillingError | null>(null);
  const [addonConfirmation, setAddonConfirmation] = useState<{ owner: string; kind: "add" | "remove" | "cancel" | "retry"; key: string } | null>(null);
  const confirmation = addonConfirmation?.owner === user?.id ? addonConfirmation : null;
  const addonTrigger = useRef<{ owner: string; element: HTMLButtonElement | null } | null>(null);
  const addonPanel = useRef<HTMLElement | null>(null);
  const billingRequest = useRef<AbortController | null>(null);
  const billingIntent = useRef<{ owner: string; action: string; plan: PlanId; intro: boolean; key: string } | null>(null);
  const checkoutAvailable = Boolean(billing && Object.values(billing.plans).some(plan => plan.ready));

  function openAddonConfirmation(kind: "add" | "remove" | "cancel" | "retry", element: HTMLButtonElement | null) {
    if (!user || billingBusy) return;
    addonTrigger.current = { owner: user.id, element };
    setAddonConfirmation({ owner: user.id, kind, key: crypto.randomUUID() });
  }

  useEffect(() => {
    applyDocumentMetadata(language, "/pricing");
    return () => applyDocumentMetadata(language, window.location.pathname);
  }, [language]);

  useEffect(() => {
    billingRequest.current?.abort();
    billingIntent.current = null;
    setAddonConfirmation(null);
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

  const refreshBilling = useCallback(async () => {
    if (!user || billingRequest.current || isNativeApp) return;
    const controller = new AbortController(); billingRequest.current = controller;
    setBillingBusy("load"); setBilling(null); setBillingError(null);
    try {
      const value = await getPlusBilling({ accountId: user.id, signal: controller.signal });
      if (!controller.signal.aborted) setBilling(value);
    } catch (error) {
      if (!controller.signal.aborted) setBillingError(error instanceof PlusBillingError ? error : new PlusBillingError("unavailable"));
    } finally {
      if (!controller.signal.aborted) { billingRequest.current = null; setBillingBusy(null); }
    }
  }, [user]);

  async function confirmAddonChange() {
    if (!user || !confirmation || billingRequest.current || isNativeApp || !billing) return;
    const available = confirmation.kind === "add" ? billing.tradingAddon?.canAdd
      : confirmation.kind === "remove" ? billing.tradingAddon?.canRemove
      : confirmation.kind === "retry" ? billing.tradingAddon?.pending?.canRetry : billing.tradingAddon?.pending?.canCancel;
    if (!available) return;
    const controller = new AbortController(); billingRequest.current = controller;
    setBillingBusy("addon"); setBillingError(null);
    try {
      const scope = { accountId: user.id, signal: controller.signal };
      if (confirmation.kind === "cancel") await cancelTradingAddonChange(scope, confirmation.key);
      else await changeTradingAddon(scope, confirmation.key, confirmation.kind === "retry" ? billing.tradingAddon!.pending!.enabled : confirmation.kind === "add");
      // Mutation acknowledgement does not grant access. Read the verified schedule.
      if (controller.signal.aborted) return;
      setBilling(null);
      const value = await getPlusBilling(scope);
      if (!controller.signal.aborted) { setBilling(value); setAddonConfirmation(null); }
    } catch (error) {
      if (!controller.signal.aborted) {
        setBilling(null); setAddonConfirmation(null);
        setBillingError(error instanceof PlusBillingError ? error : new PlusBillingError("unavailable"));
      }
    } finally {
      if (!controller.signal.aborted) { billingRequest.current = null; setBillingBusy(null); }
    }
  }

  const openBilling = useCallback(async (action: "checkout" | "portal", plan: Exclude<PlanId, "free"> = "trading") => {
    if (!user || billingRequest.current || isNativeApp) return;
    if (action === "portal" && !portalAvailable) return;
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
  }, [billing?.premiumIntro?.eligible, portalAvailable, user]);

  const renderPlan = (id: BasePlanId) => {
    const plan = copy.plans[id];
    const isCurrent = currentProduct?.basePlan === id;
    const isIncluded = currentProduct && BASE_PLAN_ORDER.indexOf(id) < BASE_PLAN_ORDER.indexOf(currentProduct.basePlan);
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
            <Button asChild variant="outline" className={actionClass}><Link to="/account">{copy.account}<ArrowRight aria-hidden="true" /></Link></Button>
          ) : isIncluded ? (
            <Button type="button" disabled variant="secondary" className={`${actionClass} disabled:opacity-100`}>{copy.included}</Button>
          ) : !user ? (
            <Button asChild variant="outline" className={actionClass}><Link to="/auth?next=%2Fpricing">{copy.signIn}<ArrowRight aria-hidden="true" /></Link></Button>
          ) : isNativeApp ? (
            <Button type="button" disabled variant="secondary" className={`${actionClass} disabled:opacity-100`}>{purchaseCopy.unavailable}</Button>
          ) : billing?.plans[id].canCheckout && (!intro || billing.premiumIntro?.eligible === true) ? (
            <Button type="button" disabled={Boolean(billingBusy)} className={actionClass} onClick={() => void openBilling("checkout", id)}>{billingBusy === id ? purchaseCopy.opening : intro ? billing?.mode === "test" ? premiumCopy.testUpgrade : premiumCopy.upgrade : `${purchaseCopy.choose} ${plan.name}`}<ArrowRight aria-hidden="true" /></Button>
          ) : portalAvailable ? (
            <Button type="button" variant="outline" disabled={Boolean(billingBusy)} className={actionClass} onClick={() => void openBilling("portal")}>{billingBusy === "portal" ? purchaseCopy.opening : purchaseCopy.manage}<ArrowRight aria-hidden="true" /></Button>
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
                  <p className="text-sm font-semibold" data-account-plan={currentProduct!.basePlan}>{copy.currentLevel}: {copy.plans[currentProduct!.basePlan].name}{currentProduct!.addons.trading && <span className="mt-1 block">{addonCopy.active}</span>}{currentMembership.accessSource === "operator" && <span className="mt-1 block font-normal text-muted-foreground">{copy.assignedAccess}</span>}</p>
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
            {BASE_PLAN_ORDER.map(renderPlan)}
          </div>
        </section>

        <section id="trading-addon" className="mt-10 grid scroll-mt-6 items-start gap-6 border-t border-border pt-10 md:grid-cols-2 sm:mt-12" aria-labelledby="pricing-specialist-title" data-plan-group="addon">
          <div>
            <h2 id="pricing-specialist-title" className="text-2xl font-semibold leading-tight tracking-tight">{addonCopy.title}</h2>
            <p className="mt-3 text-sm font-semibold text-primary">{addonCopy.proRequired}</p>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">{copy.specialistDescription}</p>
            <p className="mt-4 max-w-xl text-sm leading-relaxed">{addonPurchase.explain}</p>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">{addonPurchase.timing}</p>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">{copy.risk}</p>
          </div>
          <article ref={addonPanel} tabIndex={-1} className="min-w-0 rounded-2xl border border-primary/30 bg-card p-5 sm:p-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-addon="trading" aria-labelledby="trading-addon-title">
            <h3 id="trading-addon-title" className="text-xl font-semibold">{addonCopy.priceLabel}</h3>
            <p className="mt-3 text-2xl font-semibold tabular-nums" data-addon-price="trading">+ {formatTradingAddonMonthlyPrice(language)}</p>
            <p className="mt-2 text-sm font-semibold" data-addon-total>{addonCopy.totalLabel}: {formatTradingBundleMonthlyPrice(language)}</p>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">{addonPurchase.noIntro}</p>
            <ul className="my-5 space-y-3 border-y border-border py-5">
              {copy.plans.trading.points.slice(1).map(point => <li key={point} className="flex items-start gap-2.5 text-sm leading-relaxed"><span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" /><span>{point}</span></li>)}
            </ul>
            {currentProduct && <p className="mb-4 text-sm font-semibold" data-addon-access={currentProduct.addons.trading ? "active" : "inactive"}>{currentProduct.addons.trading ? addonCopy.active : addonCopy.inactive}</p>}
            {billing?.tradingAddon?.pending ? <div data-addon-pending className="space-y-3" role="status">
              {billing.tradingAddon.pending.state === "processing" ? <p className="text-sm font-semibold" data-addon-processing>{addonPurchase.processing}</p>
                : <p className="text-sm font-semibold">{billing.tradingAddon.pending.enabled ? addonPurchase.pendingAdd : addonPurchase.pendingRemove} <time dateTime={billing.tradingAddon.pending.effectiveAt}>{new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : language, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(billing.tradingAddon.pending.effectiveAt))} UTC</time></p>}
              <p className="text-sm leading-relaxed text-muted-foreground">{addonPurchase.unchanged}</p>
              {billing.tradingAddon.pending.canRetry && <Button type="button" className={actionClass} disabled={Boolean(billingBusy)} onClick={event => openAddonConfirmation("retry", event.currentTarget)}>{addonPurchase.retry}</Button>}
              {billing.tradingAddon.pending.canCancel && <Button type="button" variant="outline" className={actionClass} disabled={Boolean(billingBusy)} onClick={event => openAddonConfirmation("cancel", event.currentTarget)}>{addonPurchase.cancelChange}</Button>}
            </div> : isNativeApp || billing?.appStoreManaged ? <p className="text-sm leading-relaxed text-muted-foreground">{addonPurchase.native}</p>
              : authLoading || billingBusy === "load" ? <Button disabled className={actionClass}>{purchaseCopy.checking}</Button>
              : !user ? <Button asChild className={actionClass}><Link to="/auth?next=%2Fpricing%23trading-addon">{copy.signIn}<ArrowRight aria-hidden="true" /></Link></Button>
              : billing?.tradingAddon?.canRemove ? <Button type="button" variant="outline" className={actionClass} disabled={Boolean(billingBusy)} onClick={event => openAddonConfirmation("remove", event.currentTarget)}>{addonPurchase.remove}</Button>
              : billing?.tradingAddon?.canAdd ? <Button type="button" className={actionClass} disabled={Boolean(billingBusy)} onClick={event => openAddonConfirmation("add", event.currentTarget)}>{addonPurchase.add}<ArrowRight aria-hidden="true" /></Button>
              : currentProduct?.addons.trading ? null
              : billing?.plans.trading.canCheckout ? <Button type="button" className={actionClass} disabled={Boolean(billingBusy)} onClick={() => void openBilling("checkout", "trading")}>{billingBusy === "trading" ? purchaseCopy.opening : addonPurchase.start}<ArrowRight aria-hidden="true" /></Button>
              : <p className="text-sm leading-relaxed text-muted-foreground">{addonPurchase.unavailable}</p>}
            {currentProduct?.addons.trading && <Button asChild className={`${actionClass} mt-3`}><Link to="/plus">{addonCopy.open}<ArrowRight aria-hidden="true" /></Link></Button>}
            {user && !isNativeApp && <Button type="button" variant="ghost" disabled={Boolean(billingBusy)} className={`${actionClass} mt-3`} onClick={() => void refreshBilling()}>{addonPurchase.refresh}</Button>}
          </article>
        </section>

        <Dialog open={Boolean(confirmation)} onOpenChange={open => { if (!open && billingBusy !== "addon") setAddonConfirmation(null); }}>
          <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto" onCloseAutoFocus={event => {
            event.preventDefault();
            const trigger = addonTrigger.current;
            if (!trigger || trigger.owner !== user?.id) return;
            const target = trigger.element?.isConnected ? trigger.element : addonPanel.current;
            target?.focus({ preventScroll: true });
          }}>
            <DialogTitle>{confirmation?.kind === "cancel" ? addonPurchase.confirmCancel : confirmation?.kind === "retry" ? addonPurchase.confirmRetry : confirmation?.kind === "remove" ? addonPurchase.confirmRemove : addonPurchase.confirmAdd}</DialogTitle>
            <DialogDescription className="text-base leading-relaxed">{confirmation?.kind === "cancel" ? addonPurchase.cancelTerms : confirmation?.kind === "retry" ? addonPurchase.retryTerms : confirmation?.kind === "remove" ? addonPurchase.removeTerms : addonPurchase.addTerms}</DialogDescription>
            {billing?.mode === "test" && <p className="text-sm font-semibold text-primary">{billingCopy.testMode}</p>}
            <Button type="button" className={actionClass} disabled={Boolean(billingBusy)} onClick={() => void confirmAddonChange()}>{billingBusy === "addon" ? addonPurchase.scheduling : confirmation?.kind === "cancel" ? addonPurchase.cancelChange : confirmation?.kind === "retry" ? addonPurchase.retry : addonPurchase.confirm}</Button>
            <Button type="button" variant="outline" className={actionClass} disabled={Boolean(billingBusy)} onClick={() => setAddonConfirmation(null)}>{addonPurchase.back}</Button>
          </DialogContent>
        </Dialog>

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
