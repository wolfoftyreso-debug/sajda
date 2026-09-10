import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
/* eslint-disable react-refresh/only-export-components -- The provider and consumer hook belong together. */
import type { AccountSession, AccountUser } from "@/integrations/neon/account-types";
import { accountError, getAccountAuthClient, isAccountAuthConfigured, readAccountSession } from "@/integrations/neon/auth";
import { accountCallbackUrl, passwordRecoveryUrl } from "@/lib/authNavigation";
import { isNativeApp } from "@/lib/appSurface";
import { nativeSignIn, nativeSignOut } from "@/lib/nativeTransport";

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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AccountSession | null>(null);
  const [loading, setLoading] = useState(isAccountAuthConfigured);
  const [error, setError] = useState<Error | null>(null);
  const revision = useRef(0);
  const mounted = useRef(true);
  const channel = useRef<BroadcastChannel | null>(null);

  const refresh = useCallback(async () => {
    const current = ++revision.current;
    try {
      const restored = await readAccountSession();
      if (mounted.current && current === revision.current) {
        setSession(restored);
        setError(null);
      }
      return { session: restored, error: null };
    } catch (failure) {
      const restoreError = accountError(failure, "Could not restore your account session. Sign in again.");
      if (mounted.current && current === revision.current) {
        setSession(null);
        setError(restoreError);
      }
      return { session: null, error: restoreError };
    } finally {
      if (mounted.current && current === revision.current) setLoading(false);
    }
  }, []);

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
      channel.current.onmessage = () => { void refresh(); };
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
      const restored = await refresh();
      if (restored.error || !restored.session) return { error: restored.error ?? new Error("Your session could not be restored. Try signing in again.") };
      channel.current?.postMessage("session-changed");
      return { error: null };
    } catch (failure) { return { error: accountError(failure, "The sign-in service is temporarily unavailable.") }; }
  };

  const signInNative = async (): Promise<AuthResult> => {
    try {
      await nativeSignIn();
      const restored = await refresh();
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
      });
      if (result.error) return { error: accountError(result.error, "Your account could not be created.") };
      await refresh();
      channel.current?.postMessage("session-changed");
      return { error: null };
    } catch (failure) { return { error: accountError(failure, "The account service is temporarily unavailable.") }; }
  };

  const requestPasswordReset = async (email: string, redirectPath?: string): Promise<AuthResult> => {
    try {
      const client = await getAccountAuthClient();
      const result = await client.requestPasswordReset({ email: email.trim(), redirectTo: passwordRecoveryUrl(window.location.origin, redirectPath) });
      return { error: result.error ? accountError(result.error, "Password recovery is temporarily unavailable.") : null };
    } catch (failure) { return { error: accountError(failure, "Password recovery is temporarily unavailable.") }; }
  };

  const requestEmailVerification = async (email: string, redirectPath?: string): Promise<AuthResult> => {
    try {
      const client = await getAccountAuthClient();
      const result = await client.sendVerificationEmail({ email: email.trim(), callbackURL: accountCallbackUrl(window.location.origin, redirectPath) });
      return { error: result.error ? accountError(result.error, "The confirmation email could not be requested. Try again later.") : null };
    } catch (failure) { return { error: accountError(failure, "The confirmation email could not be requested. Try again later.") }; }
  };

  const updatePassword = async (password: string, recoveryToken?: string): Promise<AuthResult> => {
    if (!recoveryToken) return { error: new Error("Request a new password recovery link.") };
    try {
      const client = await getAccountAuthClient();
      const result = await client.resetPassword({ newPassword: password, token: recoveryToken });
      if (result.error) return { error: accountError(result.error, "This recovery link is invalid or expired. Request a new link.") };
      await refresh();
      channel.current?.postMessage("session-changed");
      return { error: null };
    } catch (failure) { return { error: accountError(failure, "Your password could not be updated. Try again.") }; }
  };

  const signOut = async () => {
    if (isNativeApp) {
      await nativeSignOut();
      revision.current += 1;
      setSession(null); setError(null);
      return;
    }
    const client = await getAccountAuthClient();
    const result = await client.signOut({});
    if (result.error) throw accountError(result.error, "Sign-out failed. Please try again.");
    revision.current += 1;
    setSession(null);
    setError(null);
    channel.current?.postMessage("session-changed");
  };

  return <AuthContext.Provider value={{ user: session?.user ?? null, session, loading, error, signIn, signInNative, signUp, requestPasswordReset, requestEmailVerification, updatePassword, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
