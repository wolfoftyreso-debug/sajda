import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { LoaderCircle, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/i18n/LanguageProvider";
import { safeAccountPath } from "@/lib/authNavigation";
import { nativeAvailable } from "@/lib/nativeTransport";
import { nativeCopy } from "./nativeCopy";
import { accountAccessCopy } from "@/i18n/accountAccessCopy";

export default function NativeAuth() {
  const { user, loading, signInNative } = useAuth();
  const { language } = useLanguage();
  const { search } = useLocation();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const mounted = useRef(true);
  const safeNext = safeAccountPath(new URLSearchParams(search).get("next"));
  const next = safeNext.split(/[?#]/u)[0] === "/auth" ? "/account" : safeNext;
  const copy = nativeCopy[language];
  const detail = accountAccessCopy[language].appAuth;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (user && !loading) navigate(next, { replace: true }); }, [user, loading, next, navigate]);
  const signIn = async () => {
    if (busy || loading || !nativeAvailable) return;
    setBusy(true); setFailed(false);
    try {
      const { error } = await signInNative();
      if (mounted.current) setFailed(Boolean(error));
      // The context's confirmed account, not a browser return alone, redirects.
    } catch { if (mounted.current) setFailed(true); }
    finally { if (mounted.current) setBusy(false); }
  };
  return <main className="mx-auto max-w-xl space-y-5 px-5 py-8" aria-labelledby="native-auth-title">
    <h1 id="native-auth-title" className="text-2xl font-semibold tracking-tight">{copy.signIn}</h1>
    <p className="text-sm leading-6 text-muted-foreground">{detail.body}</p>
    {!nativeAvailable && <p role="note" className="rounded-xl border border-border bg-card p-4 text-sm leading-6">{detail.preview}</p>}
    {failed && <p role="alert" className="text-sm leading-6 text-destructive">{detail.error}</p>}
    <Button type="button" onClick={() => void signIn()} disabled={busy || loading || !nativeAvailable} className="h-auto min-h-12 w-full whitespace-normal py-3">
      {busy || loading ? <LoaderCircle className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <LogIn className="h-5 w-5" aria-hidden="true" />}
      {busy || loading ? detail.waiting : copy.signIn}
    </Button>
    {(busy || loading) && <p role="status" className="sr-only">{detail.waiting}</p>}
    <Link to="/contact" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline">{copy.support}</Link>
  </main>;
}
