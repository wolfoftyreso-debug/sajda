import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/i18n/LanguageProvider";
import { Button } from "@/components/ui/button";
import { accountAccessCopy } from "@/i18n/accountAccessCopy";
import { requestDeadline, throwIfCancelled } from "@/lib/abort";

/** A deliberate web consent step; merely visiting a URL never mints a grant. */
export default function NativeConnect() {
  const { user, loading } = useAuth();
  const { language } = useLanguage();
  const location = useLocation();
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState(false);
  const params = new URLSearchParams(location.search);
  const challenge = params.get("challenge") ?? "";
  const state = params.get("state") ?? "";
  const pending = useRef<ReturnType<typeof requestDeadline> | null>(null);
  useEffect(() => {
    setBusy(false); setError(false);
    return () => { pending.current?.cancel(); pending.current = null; };
  }, [user?.id, challenge, state]);
  const valid = /^[A-Za-z0-9_-]{43}$/.test(challenge) && /^[A-Za-z0-9_-]{32,128}$/.test(state);
  const copy = accountAccessCopy[language].native;
  const connect = async () => {
    if (!valid || !user || busy || pending.current) return;
    setBusy(true); setError(false);
    const deadline = requestDeadline(20_000);
    pending.current = deadline;
    try {
      const response = await fetch("/api/native/auth",{
        method:"POST",credentials:"same-origin",redirect:"error",cache:"no-store",
        headers:{"Content-Type":"application/json","X-Sajda-Account":user.id},
        body:JSON.stringify({action:"authorize",challenge,state}),
        signal:deadline.signal,
      });
      const value = await response.json();
      throwIfCancelled(deadline.signal);
      if (!response.ok || typeof value.callback !== "string") throw new Error();
      const callback = new URL(value.callback);
      if (callback.protocol !== "com.hypbit.sajda:" || callback.host !== "auth"
        || callback.pathname !== "/callback" || callback.searchParams.get("state") !== state
        || !/^[A-Za-z0-9_-]{43}$/.test(callback.searchParams.get("code")??"")) throw new Error();
      window.location.assign(callback.href);
    } catch { if (pending.current === deadline) setError(true); }
    finally {
      deadline.dispose();
      if (pending.current === deadline) { pending.current = null; setBusy(false); }
    }
  };
  return <main className="mx-auto max-w-md space-y-6 px-6 py-16">
    <h1 className="text-3xl font-semibold">{copy.title}</h1>
    <p>{copy.warning}</p>
    <p className="text-sm text-muted-foreground">{copy.permission}</p>
    {!valid ? <p role="alert">{copy.invalid}</p>
      : loading ? <p role="status">{copy.checking}</p>
      : !user ? <Button asChild><Link to={`/auth?next=${encodeURIComponent(location.pathname+location.search)}`}>{copy.signIn}</Link></Button>
      : <><p className="break-words">{user.email}</p><Button className="w-full whitespace-normal" disabled={busy} onClick={()=>void connect()}>{busy ? copy.connecting : copy.connect}</Button></>}
    {error && <p role="alert">{copy.failed}</p>}
    <Link className="block underline" to="/account">{copy.cancel}</Link>
  </main>;
}
