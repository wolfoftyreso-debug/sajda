import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowUpRight, LoaderCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPlusBillingCopy } from "@/i18n/plusBillingCopy";
import type { LostDomainsCopy } from "@/i18n/lostDomainsCopy";
import { getPlusBilling, openPlusBilling, PlusBillingError, type PlusBillingAction, type PlusBillingSnapshot } from "@/lib/plusBilling";
import { formatPlusMonthlyPrice } from "../../shared/plus-plan";
import { isNativeApp } from "@/lib/appSurface";
import NativePurchaseNotice from "@/app/NativePurchaseNotice";
import AccountMembershipPanel from "@/components/AccountMembershipPanel";

const button = "h-auto min-h-11 w-full whitespace-normal px-4 py-3 text-center";
export default function PlusBilling({ accountId, language, fallback, disabled = false, onStatusVerified }: { accountId: string | null; language: string; fallback: LostDomainsCopy; disabled?: boolean; onStatusVerified?: (accountId: string) => void }) {
  const copy = getPlusBillingCopy(language);
  const location = useLocation();
  const [data, setData] = useState<{ owner: string; value: PlusBillingSnapshot } | null>(null);
  const [busy, setBusy] = useState<"load" | PlusBillingAction | null>(null);
  const [error, setError] = useState<PlusBillingError | null>(null);
  const owner = useRef(accountId), request = useRef<AbortController | null>(null), mounted = useRef(true);
  const key = useRef<{ owner: string; action: PlusBillingAction; key: string } | null>(null);
  const snapshot = data?.owner === accountId ? data.value : null;
  const returnState = new URLSearchParams(location.search).get("billing");
  useLayoutEffect(() => {
    owner.current = accountId; mounted.current = true; request.current?.abort(); request.current = null; key.current = null;
    setData(null); setBusy(null); setError(null);
    return () => { mounted.current = false; request.current?.abort(); };
  }, [accountId]);
  useEffect(() => {
    if (disabled) { request.current?.abort(); request.current = null; setBusy(null); }
  }, [disabled]);
  const load = useCallback(async () => {
    if (isNativeApp || !accountId || request.current || disabled) return;
    const controller = new AbortController(); request.current = controller;
    const current = () => mounted.current && !controller.signal.aborted && owner.current === accountId && request.current === controller;
    setBusy("load"); setError(null);
    try {
      const value = await getPlusBilling({ accountId, signal: controller.signal });
      if (current()) {
        setData({ owner: accountId, value });
        onStatusVerified?.(accountId);
      }
    } catch (cause) {
      if (current()) { setData(null); setError(cause instanceof PlusBillingError ? cause : new PlusBillingError("unavailable")); }
    } finally { if (current()) { request.current = null; setBusy(null); } }
  }, [accountId, disabled, onStatusVerified]);
  useEffect(() => { if (accountId) void load(); }, [accountId, load]);
  async function open(action: PlusBillingAction) {
    if (isNativeApp || !accountId || request.current || disabled || !snapshot || !(action === "checkout" ? snapshot.ready && snapshot.canCheckout : snapshot.canManage)) return;
    const controller = new AbortController(); request.current = controller;
    const current = () => mounted.current && !controller.signal.aborted && owner.current === accountId && request.current === controller;
    setBusy(action); setError(null);
    try {
      if (!key.current || key.current.owner !== accountId || key.current.action !== action) key.current = { owner: accountId, action, key: crypto.randomUUID() };
      const url = await openPlusBilling({ accountId, signal: controller.signal }, action, key.current.key);
      // A redirect is never an entitlement. The workspace continues to rely on
      // authenticated server state after Stripe returns and on every refresh.
      if (current()) window.location.assign(url);
    } catch (cause) {
      if (current()) {
        const failure = cause instanceof PlusBillingError ? cause : new PlusBillingError("unavailable");
        setError(failure);
        if (failure.code === "checkout_expired") key.current = null;
        if (["unauthenticated", "account_changed", "checkout_expired", "subscription_changed"].includes(failure.code)) setData(null);
      }
    } finally { if (current()) { request.current = null; setBusy(null); } }
  }
  const price = snapshot?.ready ? snapshot.price : null;
  if (isNativeApp) return <div className="space-y-4">{accountId && <AccountMembershipPanel />}<NativePurchaseNotice /></div>;
  return <div aria-label={copy.title}>
    <p className="mt-5 text-sm text-muted-foreground">{copy.priceLabel}</p>
    <p className="mt-1 text-2xl font-semibold tracking-tight [overflow-wrap:anywhere]">{formatPlusMonthlyPrice(language)}</p>
    {price ? <>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{copy[price.taxBehavior]}</p>
      {snapshot?.mode === "live" && <p className="mt-3 text-xs leading-5 text-muted-foreground">{copy.liveNote}</p>}
    </> : <p className="mt-3 text-sm leading-6 text-muted-foreground">{fallback.priceNote}</p>}
    {snapshot?.mode === "test" && <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3"><p className="text-sm font-semibold">{copy.testMode}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{copy.testNote}</p></div>}
    {accountId && <div className="mt-4 border-t border-border pt-4">
      {busy === "load" && <p className="flex items-center gap-2 text-sm" role="status"><LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />{copy.loading}</p>}
      {error && <div role="alert" className="text-sm leading-6 text-destructive"><p>{copy.errors[error.code]}</p>{error.requestId && <p className="mt-2 break-all text-xs">{fallback.requestReference}: {error.requestId}</p>}</div>}
      {!busy && snapshot && !snapshot.ready && <p className="text-sm leading-6 text-muted-foreground">{copy.unavailable}</p>}
      {snapshot && snapshot.status !== "none" && <p className="text-sm leading-6">{copy.existing}: <strong className="font-semibold">{copy.statuses[snapshot.status]}</strong></p>}
      {snapshot?.accessExpiresAt && <p className="mt-2 text-xs leading-5 text-muted-foreground">{copy.expires}: <time dateTime={snapshot.accessExpiresAt}>{new Intl.DateTimeFormat(language === "sv" ? "sv-SE" : "en-GB", { dateStyle: "medium" }).format(new Date(snapshot.accessExpiresAt))}</time></p>}
      {returnState === "success" && <p className="mt-3 text-sm leading-6 text-muted-foreground" role="status">{copy.returnPending}</p>}
      {returnState === "cancel" && <p className="mt-3 text-sm leading-6 text-muted-foreground" role="status">{copy.cancelled}</p>}
      {snapshot?.ready && snapshot.canCheckout && <Button className={`${button} mt-4`} disabled={Boolean(busy) || disabled} onClick={() => void open("checkout")}>
        {busy === "checkout" ? copy.opening : snapshot.mode === "test" ? copy.testCheckout : copy.checkout}<ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden="true" /></Button>}
      {snapshot?.canManage && <Button variant="outline" className={`${button} mt-3`} disabled={Boolean(busy) || disabled} onClick={() => void open("portal")}>
        {busy === "portal" ? copy.openingPortal : copy.portal}<ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden="true" /></Button>}
      <Button variant="ghost" className={`${button} mt-2 text-xs`} disabled={Boolean(busy) || disabled} onClick={() => void load()}><RefreshCw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{copy.refresh}</Button>
      {error && ["unauthenticated", "account_changed", "email_verification_required"].includes(error.code) && <Button asChild variant="outline" className={`${button} mt-2`}><Link to="/auth?next=%2Fplus">{fallback.signIn}</Link></Button>}
    </div>}
    {(!snapshot?.ready || !accountId || error?.code === "review_required") && <Button asChild className={`${button} mt-5`}><Link to="/contact">{fallback.contact}<ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden="true" /></Link></Button>}
  </div>;
}
