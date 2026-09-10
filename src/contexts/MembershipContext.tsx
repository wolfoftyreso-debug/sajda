/* eslint-disable react-refresh/only-export-components -- Account provider and consumer belong together. */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getAccountMembership, MembershipError } from "@/lib/membership";
import type { AccountMembership } from "../../shared/account-membership";

interface MembershipContextValue {
  membership: AccountMembership | null;
  loading: boolean;
  error: MembershipError | null;
  refresh: () => Promise<void>;
}
interface Snapshot { owner: string | null; membership: AccountMembership | null; loading: boolean; error: MembershipError | null }
const MembershipContext = createContext<MembershipContextValue | undefined>(undefined);

/** One owner-scoped snapshot across the app; server actions still reauthorize. */
export function MembershipProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const owner = user?.id ?? null;
  const verified = user?.email_verified === true;
  const currentOwner = useRef(owner);
  currentOwner.current = owner;
  const controller = useRef<AbortController | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot>({ owner: null, membership: null, loading: false, error: null });
  const refresh = useCallback(async () => {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    if (authLoading || !owner || !verified) {
      setSnapshot({ owner, membership: null, loading: false, error: owner && !authLoading && !verified ? new MembershipError("email_verification_required") : null });
      return;
    }
    // Do not leave a previously granted level visible during a failed refresh.
    setSnapshot({ owner, membership: null, loading: true, error: null });
    try {
      const membership = await getAccountMembership({ accountId: owner, signal: request.signal });
      if (!request.signal.aborted && currentOwner.current === owner) setSnapshot({ owner, membership, loading: false, error: null });
    } catch (error) {
      if (!request.signal.aborted && currentOwner.current === owner) setSnapshot({ owner, membership: null, loading: false,
        error: error instanceof MembershipError ? error : new MembershipError("unavailable") });
    }
  }, [owner, verified, authLoading]);

  useEffect(() => {
    void refresh();
    const onFocus = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    const interval = window.setInterval(onFocus, 60_000);
    return () => {
      controller.current?.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refresh]);

  useEffect(() => {
    if (!snapshot.membership?.expiresAt) return;
    const delay = Math.max(0, Date.parse(snapshot.membership.expiresAt) - Date.now());
    const timer = window.setTimeout(() => { void refresh(); }, Math.min(delay, 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [snapshot.membership?.expiresAt, refresh]);

  // Account switches are hidden immediately, before effect cleanup/network work.
  const owned = !authLoading && verified && snapshot.owner === owner;
  const value = { membership: owned ? snapshot.membership : null,
    loading: authLoading || Boolean(owner && verified && (!owned || snapshot.loading)),
    error: owned ? snapshot.error : owner && !authLoading && !verified ? new MembershipError("email_verification_required") : null,
    refresh };
  return <MembershipContext.Provider value={value}>{children}</MembershipContext.Provider>;
}
export function useMembership(): MembershipContextValue {
  const value = useContext(MembershipContext);
  if (!value) throw new Error("useMembership must be used within a MembershipProvider");
  return value;
}
