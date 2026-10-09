import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { swipePremiumCopy } from "@/i18n/swipePremiumCopy";
import { getPlusBillingCopy } from "@/i18n/plusBillingCopy";
import { getPlusBilling, openPlusBilling, PlusBillingError, type PlusBillingSnapshot } from "@/lib/plusBilling";
import { isNativeApp } from "@/lib/appSurface";
import { PREMIUM_INTRO_OFFER } from "../../shared/plans";

const actionClass = "h-auto min-h-11 w-full whitespace-normal px-4 py-3 text-center leading-snug";

/** Mounted only inside the Undo dialog. No price, URL or checkout grants access. */
export default function SwipePremiumOffer({ accountId, language, authLoading, prepareReturn, onClose }: {
  accountId: string | null; language: keyof typeof swipePremiumCopy; authLoading: boolean;
  prepareReturn: () => boolean; onClose: () => void;
}) {
  const copy = swipePremiumCopy[language], billingCopy = getPlusBillingCopy(language);
  const [data, setData] = useState<{ owner: string; value: PlusBillingSnapshot } | null>(null);
  const [busy, setBusy] = useState<"load" | "checkout" | null>(null);
  const [error, setError] = useState<PlusBillingError | "checkpoint" | null>(null);
  const request = useRef<AbortController | null>(null), owner = useRef(accountId), mounted = useRef(true);
  const intent = useRef<{ owner: string; key: string; intro: boolean } | null>(null);
  const snapshot = data?.owner === accountId ? data.value : null;
  useLayoutEffect(() => {
    owner.current = accountId; mounted.current = true;
    request.current?.abort(); request.current = null; intent.current = null;
    setData(null); setBusy(null); setError(null);
    return () => { mounted.current = false; request.current?.abort(); };
  }, [accountId]);
  const load = useCallback(async () => {
    if (isNativeApp || authLoading || !accountId || request.current) return;
    const controller = new AbortController(); request.current = controller; setBusy("load"); setError(null);
    const current = () => mounted.current && owner.current === accountId && !controller.signal.aborted && request.current === controller;
    try { const value = await getPlusBilling({ accountId, signal: controller.signal }); if (current()) setData({ owner: accountId, value }); }
    catch (cause) { if (current()) { setData(null); setError(cause instanceof PlusBillingError ? cause : new PlusBillingError("unavailable")); } }
    finally { if (current()) { request.current = null; setBusy(null); } }
  }, [accountId, authLoading]);
  useEffect(() => { void load(); }, [load]);
  async function upgrade(intro: boolean) {
    if (isNativeApp || !accountId || authLoading || request.current || !snapshot?.plans.premium.canCheckout
      || intro && !snapshot.premiumIntro?.eligible) return;
    const controller = new AbortController(); request.current = controller; setBusy("checkout"); setError(null);
    const current = () => mounted.current && owner.current === accountId && !controller.signal.aborted && request.current === controller;
    try {
      // Save BEFORE creating a hosted payment, so storage failure cannot strand
      // the user after a commercial side effect. Retain keys on uncertain errors.
      if (!prepareReturn()) { setError("checkpoint"); return; }
      if (!intent.current || intent.current.owner !== accountId || intent.current.intro !== intro) intent.current = { owner: accountId, key: crypto.randomUUID(), intro };
      const url = await openPlusBilling({ accountId, signal: controller.signal }, "checkout", intent.current.key, "premium",
        { returnTo: "swipe", ...(intro ? { offer: PREMIUM_INTRO_OFFER.id } : {}) });
      if (current()) window.location.assign(url);
    } catch (cause) {
      if (current()) {
        const failure = cause instanceof PlusBillingError ? cause : new PlusBillingError("unavailable"); setError(failure);
        if (failure.code === "checkout_expired") intent.current = null;
        if (["intro_offer_unavailable", "checkout_expired", "subscription_changed", "account_changed", "unauthenticated", "app_store_subscription_exists"].includes(failure.code)) setData(null);
      }
    } finally { if (current()) { request.current = null; setBusy(null); } }
  }
  // An absent/unready offer is UNKNOWN, not evidence that a customer must pay
  // more. Only a ready offer with verified eligible=false shows standard price.
  const confirmedIneligible = snapshot?.premiumIntro?.ready === true && snapshot.premiumIntro.eligible === false;
  const intro = !confirmedIneligible;
  const available = snapshot?.plans.premium.canCheckout === true && (!intro || snapshot.premiumIntro?.ready === true);
  const authPath = "/auth?next=%2Fswipe%3Fpremium%3Doffer";
  const beforeSignIn = (event: { preventDefault(): void }) => { if (!prepareReturn()) { event.preventDefault(); setError("checkpoint"); } };
  if (isNativeApp) return <div className="space-y-4"><p className="text-sm leading-6 text-muted-foreground">{copy.native}</p><Button variant="outline" className={actionClass} onClick={onClose}>{copy.close}</Button></div>;
  return <div className="space-y-4" data-premium-offer>
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-primary">{intro ? copy.offer : "Pro"}</p>
      <p className="mt-2 text-2xl font-semibold leading-tight tracking-tight" data-intro-price>{intro ? copy.firstMonth : copy.standard}</p>
      {intro && <p className="mt-2 text-base font-semibold" data-intro-renewal>{copy.renewal}</p>}
      {intro && <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy.eligibility}</p>}
      {!intro && <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy.notEligible}</p>}
    </div>
    {snapshot?.mode === "test" && <div className="rounded-lg border border-primary/20 p-3" role="status"><p className="text-sm font-semibold">{billingCopy.testMode}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{billingCopy.testNote}</p></div>}
    {(authLoading || busy === "load") && <p role="status" className="text-sm text-muted-foreground">{copy.checking}</p>}
    {error && <div role="alert" className="space-y-1 text-sm leading-6 text-destructive"><p>{error === "checkpoint" ? copy.checkpointFailed : billingCopy.errors[error.code]}</p>{error !== "checkpoint" && error.requestId && <p className="break-all text-xs">{error.requestId}</p>}</div>}
    {!authLoading && !accountId ? <Button asChild className={actionClass}><Link to={authPath} onClick={beforeSignIn}>{copy.signIn}<ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0" /></Link></Button>
      : available ? <Button type="button" className={actionClass} disabled={Boolean(busy)} onClick={() => void upgrade(intro)}>{busy === "checkout" ? copy.opening : intro ? snapshot?.mode === "test" ? copy.testUpgrade : copy.upgrade : snapshot?.mode === "test" ? copy.testStandardUpgrade : copy.standardUpgrade}<Undo2 aria-hidden="true" className="h-4 w-4 shrink-0" /></Button>
        : !busy && accountId ? <p className="text-sm leading-6 text-muted-foreground">{snapshot?.appStoreManaged ? billingCopy.appStoreManaged : copy.unavailable}</p> : null}
    {accountId && !busy && !available && <Button variant="outline" className={actionClass} onClick={() => void load()}>{copy.refresh}</Button>}
    {error instanceof PlusBillingError && ["unauthenticated", "email_verification_required"].includes(error.code) && <Button asChild className={actionClass}><Link to={authPath} onClick={beforeSignIn}>{copy.signIn}</Link></Button>}
    <Button type="button" variant="outline" className={actionClass} onClick={onClose}>{copy.close}</Button>
    <p className="text-xs leading-5 text-muted-foreground">{copy.terms}</p>
    <Link to="/pricing" target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center justify-center text-center text-sm font-medium text-primary underline underline-offset-4">{copy.compare}</Link>
  </div>;
}
