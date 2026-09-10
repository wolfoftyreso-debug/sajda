import { Link } from "react-router-dom";
import { ArrowRight, Check, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMembership } from "@/contexts/MembershipContext";
import { useLanguage } from "@/i18n/LanguageProvider";
import { formatMembershipExpiry, getMembershipCopy } from "@/i18n/membershipCopy";
import { isNativeApp } from "@/lib/appSurface";
import { nativeCopy } from "@/app/nativeCopy";

const actionClass = "h-auto min-h-11 justify-start whitespace-normal px-4 py-3 text-left leading-snug";

export default function AccountMembershipPanel() {
  const { membership, loading, error, refresh } = useMembership();
  const { language } = useLanguage();
  const copy = getMembershipCopy(language);
  const confirmed = !loading && !error && membership;
  const expiry = confirmed ? formatMembershipExpiry(confirmed.expiresAt, language) : null;
  const needsVerification = error?.code === "email_verification_required";

  return (
    <section aria-labelledby="account-membership-title" className="min-w-0 rounded-2xl border border-primary/30 bg-card p-5 sm:p-6">
      <h2 id="account-membership-title" className="text-sm font-medium text-muted-foreground">{copy.currentPlan}</h2>
      {loading ? (
        <p role="status" className="mt-4 text-base">{copy.loading}</p>
      ) : error || !membership ? (
        <div className="mt-4" role="alert">
          <p className="font-semibold">{needsVerification ? copy.verificationTitle : copy.unavailable}</p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{needsVerification ? copy.verificationDetail : copy.unavailableDetail}</p>
          {error?.requestId && <p className="mt-2 break-all text-xs text-muted-foreground">{copy.requestReference}: {error.requestId}</p>}
          <Button type="button" variant="outline" className={`${actionClass} mt-4`} onClick={() => void refresh()}>
            <RefreshCw aria-hidden="true" className="h-4 w-4 shrink-0" />{copy.retry}
          </Button>
        </div>
      ) : (
        <>
          <p data-current-plan={membership.plan} className="mt-3 text-3xl font-semibold tracking-tight">{copy.planNames[membership.plan]}</p>
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
              {membership.capabilities.trading && <Button asChild className={actionClass}><Link to="/plus">{copy.trading}<ArrowRight aria-hidden="true" className="ml-auto shrink-0" /></Link></Button>}
            </div>
            {membership.capabilities.swipe_undo && <p className="mt-3 flex items-start gap-2 text-sm"><Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{copy.undo}</p>}
          </div>
          <Button type="button" variant="ghost" className={`${actionClass} mt-4 px-0 text-muted-foreground`} onClick={() => void refresh()}><RefreshCw aria-hidden="true" className="h-4 w-4 shrink-0" />{copy.refresh}</Button>
        </>
      )}
      <div className="mt-5 border-t border-border pt-5">
        <p className="text-sm leading-relaxed text-muted-foreground">{copy.sameAccount}</p>
        <Link to="/pricing" className="mt-2 inline-flex min-h-11 items-center gap-2 font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{isNativeApp ? nativeCopy[language].membership : copy.comparePlans}<ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0" /></Link>
      </div>
    </section>
  );
}
