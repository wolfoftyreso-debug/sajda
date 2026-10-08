import { Link } from "react-router-dom";
import { ArrowRight, Check, RefreshCw } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useMembership } from "@/contexts/MembershipContext";
import { useLanguage } from "@/i18n/LanguageProvider";
import { formatMembershipExpiry, getMembershipCopy } from "@/i18n/membershipCopy";
import { isNativeApp } from "@/lib/appSurface";
import { nativeCopy } from "@/app/nativeCopy";
import { tradingAddonCopy } from "@/i18n/tradingAddonCopy";
import { membershipProductModel } from "../../shared/account-membership";

const actionClass = "h-auto min-h-11 justify-start whitespace-normal px-4 py-3 text-left leading-snug";

export default function AccountMembershipPanel({ showCompareLink = true }: { showCompareLink?: boolean } = {}) {
  const { membership, loading, error, refresh } = useMembership();
  const { user, requestEmailVerification } = useAuth();
  const { language } = useLanguage();
  const copy = getMembershipCopy(language);
  const addonCopy = tradingAddonCopy[language];
  const confirmed = !loading && !error && membership;
  const product = confirmed ? membershipProductModel(confirmed) : null;
  const expiry = confirmed ? formatMembershipExpiry(confirmed.expiresAt, language) : null;
  const needsVerification = error?.code === "email_verification_required";
  const currentOwner = useRef(user?.id ?? null);
  currentOwner.current = user?.id ?? null;
  const verificationRequest = useRef<{ owner: string } | null>(null);
  const [verification, setVerification] = useState<{ owner: string; status: "sending" | "sent" | "error" } | null>(null);
  const verificationStatus = verification && verification.owner === user?.id ? verification.status : null;
  useLayoutEffect(() => {
    verificationRequest.current = null; setVerification(null);
    return () => { verificationRequest.current = null; };
  }, [user?.id]);
  async function requestConfirmation() {
    if (!user?.email || currentOwner.current !== user.id || !needsVerification || verificationRequest.current?.owner === user.id) return;
    const request = { owner: user.id }; verificationRequest.current = request;
    setVerification({ owner: request.owner, status: "sending" });
    try {
      const result = await requestEmailVerification(user.email, "/account#trading");
      if (currentOwner.current === request.owner && verificationRequest.current === request) {
        setVerification({ owner: request.owner, status: result.error ? "error" : "sent" });
      }
    } catch {
      if (currentOwner.current === request.owner && verificationRequest.current === request) setVerification({ owner: request.owner, status: "error" });
    } finally { if (verificationRequest.current === request) verificationRequest.current = null; }
  }

  return (
    <section aria-labelledby="account-membership-title" className="min-w-0 rounded-2xl border border-primary/30 bg-card p-5 sm:p-6">
      <h2 id="account-membership-title" className="text-sm font-medium text-muted-foreground">{copy.currentPlan}</h2>
      {loading ? (
        <p role="status" className="mt-4 text-base">{copy.loading}</p>
      ) : error || !membership ? (
        <div className="mt-4" role="alert">
          <p className="font-semibold">{needsVerification ? copy.verificationTitle : copy.unavailable}</p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{needsVerification ? copy.verificationDetail : copy.unavailableDetail}</p>
          {needsVerification && user?.email && <>
            <Button type="button" className={`${actionClass} mt-4`} disabled={verificationStatus === "sending"} onClick={() => void requestConfirmation()}>
              {verificationStatus === "sending" ? addonCopy.verificationSending : addonCopy.verificationAction}
            </Button>
            {verificationStatus === "sent" && <p className="mt-3 text-sm leading-relaxed" role="status">{addonCopy.verificationSent}</p>}
            {verificationStatus === "error" && <p className="mt-3 text-sm leading-relaxed text-destructive" role="status">{addonCopy.verificationError}</p>}
          </>}
          {error?.requestId && <p className="mt-2 break-all text-xs text-muted-foreground">{copy.requestReference}: {error.requestId}</p>}
          <Button type="button" variant="outline" className={`${actionClass} mt-4`} onClick={() => void refresh()}>
            <RefreshCw aria-hidden="true" className="h-4 w-4 shrink-0" />{copy.retry}
          </Button>
        </div>
      ) : (
        <>
          <p data-current-plan={product!.basePlan} className="mt-3 text-3xl font-semibold tracking-tight">{copy.planNames[product!.basePlan]}</p>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {membership.accessSource === "operator" ? copy.assignedAccess : membership.accessSource === "subscription" ? copy.subscriptionAccess : copy.freeAccess}
          </p>
          {expiry && <p className="mt-2 text-sm">{copy.expires} <time dateTime={membership.expiresAt!}>{expiry}</time></p>}
          <div className="mt-6 border-t border-border pt-5">
            <h3 className="text-sm font-semibold">{copy.currentFeatures}</h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Button asChild variant="outline" className={actionClass}><Link to="/">{copy.search}<ArrowRight aria-hidden="true" className="ml-auto shrink-0" /></Link></Button>
              <Button asChild variant="outline" className={actionClass}><Link to="/swipe">{copy.swipe}<ArrowRight aria-hidden="true" className="ml-auto shrink-0" /></Link></Button>
              {membership.capabilities.save_domains && <Button asChild variant="outline" className={actionClass}><Link to="/watchlist">{copy.saved}<ArrowRight aria-hidden="true" className="ml-auto shrink-0" /></Link></Button>}
            </div>
            {membership.capabilities.swipe_undo && <p className="mt-3 flex items-start gap-2 text-sm"><Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{copy.undo}</p>}
          </div>
          <section id="trading" className="mt-5 scroll-mt-6 border-t border-border pt-5" aria-labelledby="account-trading-title" data-trading-addon={product!.addons.trading ? "active" : "inactive"}>
            <h3 id="account-trading-title" className="text-lg font-semibold">{addonCopy.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{addonCopy.description}</p>
            <p className="mt-3 text-sm font-semibold">{product!.addons.trading ? addonCopy.active : addonCopy.inactive}</p>
            {!product!.addons.trading && product!.basePlan !== "premium" && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{addonCopy.proRequiredBody}</p>}
            <Button asChild className={`${actionClass} mt-4`} variant={product!.addons.trading ? "default" : "outline"}>
              <Link to={product!.addons.trading ? "/plus" : "/pricing#trading-addon"}>
                {product!.addons.trading ? addonCopy.open : product!.basePlan === "premium" ? addonCopy.manage : addonCopy.chooseBundle}<ArrowRight aria-hidden="true" className="ml-auto shrink-0" />
              </Link>
            </Button>
            {product!.addons.trading && <Link to="/pricing#trading-addon" className="mt-2 flex min-h-11 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{addonCopy.manage}</Link>}
          </section>
          <Button type="button" variant="ghost" className={`${actionClass} mt-4 px-0 text-muted-foreground`} onClick={() => void refresh()}><RefreshCw aria-hidden="true" className="h-4 w-4 shrink-0" />{copy.refresh}</Button>
        </>
      )}
      <div className="mt-5 border-t border-border pt-5">
        <p className="text-sm leading-relaxed text-muted-foreground">{copy.sameAccount}</p>
        {showCompareLink && <Link to="/pricing" className="mt-2 inline-flex min-h-11 items-center gap-2 font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{isNativeApp ? nativeCopy[language].membership : copy.comparePlans}<ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0" /></Link>}
      </div>
    </section>
  );
}
