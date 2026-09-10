import { useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bookmark, Check, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addToWatchlist } from "@/lib/watchlistService";
import { swipeAccountSnapshot } from "@/lib/swipeAccountSnapshot";
import type { SwipeWishlistEntry } from "@/lib/swipeWishlist";
import { swipeAccountSaveCopy } from "@/i18n/swipeAccountSaveCopy";

export interface SwipeAccountSaveProps {
  item: SwipeWishlistEntry;
  language: string;
  accountId: string | null;
  emailVerified: boolean;
  authLoading: boolean;
}

type SaveFailure = "failed" | "changed" | "invalid" | "limited" | "verify";
const linkClass = "inline-flex min-h-11 items-center rounded-lg text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Re-keying creates an independent lifetime for every account and auth state.
 * A response started by A can never mark a row saved for B (or later A). */
export default function SwipeAccountSave(props: SwipeAccountSaveProps) {
  return <AccountSaveAction key={JSON.stringify([props.accountId, props.emailVerified, props.authLoading, props.item.domain])} {...props} />;
}

function AccountSaveAction({ item, language, accountId, emailVerified, authLoading }: SwipeAccountSaveProps) {
  const copy = swipeAccountSaveCopy[language as keyof typeof swipeAccountSaveCopy] ?? swipeAccountSaveCopy.en;
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [failure, setFailure] = useState<SaveFailure | null>(null);
  const pending = useRef<AbortController | null>(null);
  const alive = useRef(false);
  const confirmed = useRef(false);
  useLayoutEffect(() => {
    alive.current = true;
    return () => { alive.current = false; pending.current?.abort(); pending.current = null; };
  }, []);

  const save = async () => {
    if (!alive.current || pending.current || confirmed.current || !accountId || !emailVerified || authLoading) return;
    const controller = new AbortController();
    pending.current = controller;
    const current = () => alive.current && pending.current === controller && !controller.signal.aborted;
    setState("saving"); setFailure(null);
    try {
      // The owner is captured before the asynchronous account-session check.
      await addToWatchlist(swipeAccountSnapshot(item), { accountId, signal: controller.signal });
      if (!current()) return;
      confirmed.current = true;
      setState("saved");
    } catch (error) {
      if (!current()) return;
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
      const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 0;
      setFailure(code === "invalid_snapshot" ? "invalid" : code === "account_changed" || status === 401 ? "changed"
        : code === "email_verification_required" ? "verify" : status === 429 ? "limited" : "failed");
      setState("idle");
    } finally {
      if (pending.current === controller) pending.current = null;
    }
  };

  return <div className="mt-4 border-t border-border pt-3" aria-label={`${copy.save}: ${item.domain}`}>
    {authLoading ? <p role="status" className="text-sm text-muted-foreground">{copy.checking}</p>
      : !accountId ? <Link className={linkClass} to="/auth?next=%2Fswipe">{copy.signIn}</Link>
        : !emailVerified ? <><p className="text-sm text-muted-foreground">{copy.verify}</p><Link className={linkClass} to="/account">{copy.account}</Link></>
          : <>
            <Button type="button" variant={state === "saved" ? "outline" : "default"} onClick={() => { void save(); }}
              disabled={state === "saving" || state === "saved"} aria-label={`${state === "saved" ? copy.saved : state === "saving" ? copy.saving : failure ? copy.retry : copy.save}: ${item.domain}`}
              className="h-auto min-h-11 w-full min-w-0 whitespace-normal py-2 text-left leading-5">
              {state === "saving" ? <RefreshCw className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
                : state === "saved" ? <Check className="h-4 w-4 shrink-0" aria-hidden="true" /> : <Bookmark className="h-4 w-4 shrink-0" aria-hidden="true" />}
              {state === "saving" ? copy.saving : state === "saved" ? copy.saved : failure ? copy.retry : copy.save}
            </Button>
            <p role={failure ? "alert" : "status"} className="mt-2 text-xs leading-5 text-muted-foreground">
              {failure ? copy[failure] : state === "saved" ? copy.saved : copy.help}
            </p>
            {(state === "saved" || failure) && <Link className={linkClass} to={failure === "changed" ? "/auth?next=%2Fswipe" : failure === "verify" ? "/account" : "/watchlist"}>
              {failure === "changed" ? copy.signIn : failure === "verify" ? copy.account : copy.open}
            </Link>}
          </>}
  </div>;
}
