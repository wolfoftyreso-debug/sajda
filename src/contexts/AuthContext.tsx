import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
/* eslint-disable react-refresh/only-export-components -- The provider and consumer hook belong together. */
import type { AccountSession, AccountUser } from "@/integrations/neon/account-types";
import { accountError, getAccountAuthClient, isAccountAuthConfigured, readAccountSession } from "@/integrations/neon/auth";
import { accountCallbackUrl, passwordRecoveryUrl } from "@/lib/authNavigation";
import { isNativeApp } from "@/lib/appSurface";
import { nativeSignIn, nativeSignOut, forgetDeletedAccount } from "@/lib/nativeTransport";
import { useLanguage } from "@/i18n/LanguageProvider";

interface AuthResult { error: Error | null }

interface AuthContextType {
  user: AccountUser | null;
  session: AccountSession | null;
  loading: boolean;
  error: Error | null;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signInNative: () => Promise<AuthResult>;
  signUp: (email: string, password: string, redirectPath?: string) => Promise<AuthResult>;
  requestPasswordReset: (email: string, redirectPath?: string) => Promise<AuthResult>;
  requestEmailVerification: (email: string, redirectPath?: string) => Promise<AuthResult>;
  /** A one-use recovery link token is mandatory; signing in is not enough. */
  updatePassword: (password: string, recoveryToken?: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  /** Local cleanup only, after an owner-bound server deletion receipt. */
  completeAccountDeletion: (expectedAccountId: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function unexpiredSession(session: AccountSession | null): session is AccountSession {
  return !!session && typeof session.expires_at === "number" && Number.isFinite(session.expires_at) && session.expires_at * 1000 > Date.now();
}

function transientSessionFailure(failure: unknown): boolean {
  if (!failure || typeof failure !== "object") return false;
  const { status, code } = failure as { status?: unknown; code?: unknown };
  if (typeof status === "number") return status === 408 || status === 429 || status >= 500;
  // Network/timeouts have no HTTP response. An explicit auth error code is not
  // evidence of a transient outage and must never preserve a revoked identity.
  return code === undefined || code === "NETWORK_ERROR" || code === "TIMEOUT";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { language } = useLanguage();
  const [session, setSession] = useState<AccountSession | null>(null);
  const [loading, setLoading] = useState(isAccountAuthConfigured);
  const [error, setError] = useState<Error | null>(null);
  const revision = useRef(0);
  const mounted = useRef(true);
  const channel = useRef<BroadcastChannel | null>(null);
  const currentOwner = useRef<string | null>(null);
  const currentSession = useRef<AccountSession | null>(null);
  const pendingRefresh = useRef<{ revision: number; promise: Promise<{ session: AccountSession | null; error: Error | null }> } | null>(null);
  currentOwner.current = session?.user.id ?? null;
  currentSession.current = session;

  const publishSession = useCallback((next: AccountSession | null) => {
    currentSession.current = next;
    currentOwner.current = next?.user.id ?? null;
    setSession(next);
  }, []);

  const refresh = useCallback((identityChanged = false) => {
    if (identityChanged) {
      // Credentials changed locally/in another tab: the previous owner is no
      // longer a safe fallback, even when the following request is unavailable.
      revision.current += 1;
      publishSession(null);
      setError(null);
    } else if (pendingRefresh.current?.revision === revision.current) {
      return pendingRefresh.current.promise;
    }
    const current = ++revision.current;
    const previous = currentSession.current;
    const promise = (async () => {
      try {
        const received = await readAccountSession();
        const restored = unexpiredSession(received) ? received : null;
        if (!mounted.current || current !== revision.current) return { session: null, error: new Error("Your account changed while checking the session. Try again.") };
        publishSession(restored);
        setError(null);
        return { session: restored, error: null };
      } catch (failure) {
        const restoreError = accountError(failure, "Your account could not be checked. Please try again.");
        if (mounted.current && current === revision.current) {
          // This is display continuity only. Private requests still verify the
          // session on the server; an outage never grants or extends access.
          const retained = transientSessionFailure(failure) && unexpiredSession(previous) && currentSession.current === previous ? previous : null;
          publishSession(retained);
          setError(restoreError);
        }
        return { session: null, error: restoreError };
      } finally {
        if (pendingRefresh.current?.revision === current) pendingRefresh.current = null;
        if (mounted.current && current === revision.current) setLoading(false);
      }
    })();
    pendingRefresh.current = { revision: current, promise };
    return promise;
  }, [publishSession]);

  useEffect(() => {
    if (!session) return;
    let timer: ReturnType<typeof setTimeout>;
    const expire = () => {
      if (currentSession.current !== session) return;
      const remaining = (session.expires_at ?? 0) * 1000 - Date.now();
      if (!Number.isFinite(remaining) || remaining <= 0) {
        revision.current += 1;
        publishSession(null);
        setLoading(false);
        return;
      }
      timer = setTimeout(expire, Math.min(remaining, 2_147_483_647));
    };
    expire();
    return () => clearTimeout(timer);
  }, [session, publishSession]);

  useEffect(() => {
    mounted.current = true;
    if (!isAccountAuthConfigured) return () => { mounted.current = false; };
    void refresh();
    const restoreOnFocus = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", restoreOnFocus);
    document.addEventListener("visibilitychange", restoreOnFocus);
    // Revalidate expiration/revocation when an open tab remains active.
    const interval = window.setInterval(restoreOnFocus, 60_000);
    if (typeof BroadcastChannel !== "undefined") {
      channel.current = new BroadcastChannel("sajda-account-state");
      channel.current.onmessage = () => { void refresh(true); };
    }
    return () => {
      mounted.current = false;
      revision.current += 1;
      window.clearInterval(interval);
      window.removeEventListener("focus", restoreOnFocus);
      document.removeEventListener("visibilitychange", restoreOnFocus);
      channel.current?.close();
      channel.current = null;
    };
  }, [refresh]);

  const signIn = async (email: string, password: string): Promise<AuthResult> => {
    try {
      const client = await getAccountAuthClient();
      const result = await client.signIn.email({ email: email.trim(), password });
      if (result.error) return { error: accountError(result.error, "Sign-in failed.") };
      const restored = await refresh(true);
      if (restored.error || !restored.session) return { error: restored.error ?? new Error("Your session could not be restored. Try signing in again.") };
      channel.current?.postMessage("session-changed");
      return { error: null };
    } catch (failure) { return { error: accountError(failure, "The sign-in service is temporarily unavailable.") }; }
  };

  const signInNative = async (): Promise<AuthResult> => {
    try {
      await nativeSignIn();
      const restored = await refresh(true);
      return { error: restored.error ?? (restored.session ? null : new Error("Your app session could not be verified.")) };
    } catch (failure) { return { error: accountError(failure,"App sign-in was not completed. Try again.") }; }
  };

  const signUp = async (email: string, password: string, redirectPath?: string): Promise<AuthResult> => {
    try {
      const client = await getAccountAuthClient();
      const result = await client.signUp.email({
        email: email.trim(), password,
        name: email.trim().split("@")[0].slice(0, 100),
        callbackURL: accountCallbackUrl(window.location.origin, redirectPath),
        fetchOptions: { headers: { "x-sajda-language": language } },
      });
      if (result.error) return { error: accountError(result.error, "Your account could not be created.") };
      await refresh(true);
      channel.current?.postMessage("session-changed");
      return { error: null };
    } catch (failure) { return { error: accountError(failure, "The account service is temporarily unavailable.") }; }
  };

  const requestPasswordReset = async (email: string, redirectPath?: string): Promise<AuthResult> => {
    try {
      const client = await getAccountAuthClient();
      const result = await client.requestPasswordReset({ email: email.trim(), redirectTo: passwordRecoveryUrl(window.location.origin, redirectPath), fetchOptions: { headers: { "x-sajda-language": language } } });
      return { error: result.error ? accountError(result.error, "Password recovery is temporarily unavailable.") : null };
    } catch (failure) { return { error: accountError(failure, "Password recovery is temporarily unavailable.") }; }
  };

  const requestEmailVerification = async (email: string, redirectPath?: string): Promise<AuthResult> => {
    try {
      const client = await getAccountAuthClient();
      const result = await client.sendVerificationEmail({ email: email.trim(), callbackURL: accountCallbackUrl(window.location.origin, redirectPath), fetchOptions: { headers: { "x-sajda-language": language } } });
      return { error: result.error ? accountError(result.error, "The confirmation email could not be requested. Try again later.") : null };
    } catch (failure) { return { error: accountError(failure, "The confirmation email could not be requested. Try again later.") }; }
  };

  const updatePassword = async (password: string, recoveryToken?: string): Promise<AuthResult> => {
    if (!recoveryToken) return { error: new Error("Request a new password recovery link.") };
    try {
      const client = await getAccountAuthClient();
      const result = await client.resetPassword({ newPassword: password, token: recoveryToken });
      if (result.error) return { error: accountError(result.error, "This recovery link is invalid or expired. Request a new link.") };
      await refresh(true);
      channel.current?.postMessage("session-changed");
      return { error: null };
    } catch (failure) { return { error: accountError(failure, "Your password could not be updated. Try again.") }; }
  };

  const signOut = async () => {
    if (isNativeApp) {
      await nativeSignOut();
      revision.current += 1;
      publishSession(null); setError(null);
      return;
    }
    const client = await getAccountAuthClient();
    const result = await client.signOut({});
    if (result.error) throw accountError(result.error, "Sign-out failed. Please try again.");
    revision.current += 1;
    publishSession(null);
    setError(null);
    channel.current?.postMessage("session-changed");
  };

  const completeAccountDeletion = async (expectedAccountId: string) => {
    if (!expectedAccountId || currentOwner.current !== expectedAccountId) return false;
    // Fence outstanding refreshes before clearing the deleted identity. Never
    // issue a generic signOut: a different tab may have installed a new cookie.
    revision.current += 1;
    try {
      if (isNativeApp) await forgetDeletedAccount(expectedAccountId);
    } finally {
      if (mounted.current && currentOwner.current === expectedAccountId) {
        // A focus refresh may have started while native cleanup was pending.
        // It must not keep the same deleted identity alive, nor restore it late.
        // A different already-restored owner is still untouched.
        revision.current += 1;
        currentOwner.current = null;
        publishSession(null); setError(null); setLoading(false);
        channel.current?.postMessage("session-changed");
      }
    }
    return currentOwner.current === null;
  };

  return <AuthContext.Provider value={{ user: session?.user ?? null, session, loading, error, signIn, signInNative, signUp, requestPasswordReset, requestEmailVerification, updatePassword, signOut, completeAccountDeletion }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
