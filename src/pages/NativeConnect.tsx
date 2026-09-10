import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/i18n/LanguageProvider";
import { Button } from "@/components/ui/button";

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
  const valid = /^[A-Za-z0-9_-]{43}$/.test(challenge) && /^[A-Za-z0-9_-]{32,128}$/.test(state);
  const sv = language === "sv";
  const connect = async () => {
    if (!valid || !user || busy) return;
    setBusy(true); setError(false);
    try {
      const response = await fetch("/api/native/auth",{
        method:"POST",credentials:"same-origin",redirect:"error",cache:"no-store",
        headers:{"Content-Type":"application/json","X-Sajda-Account":user.id},
        body:JSON.stringify({action:"authorize",challenge,state}),
        signal:AbortSignal.timeout(20_000),
      });
      const value = await response.json();
      if (!response.ok || typeof value.callback !== "string") throw new Error();
      const callback = new URL(value.callback);
      if (callback.protocol !== "com.hypbit.sajda:" || callback.host !== "auth"
        || callback.pathname !== "/callback" || callback.searchParams.get("state") !== state
        || !/^[A-Za-z0-9_-]{43}$/.test(callback.searchParams.get("code")??"")) throw new Error();
      window.location.assign(callback.href);
    } catch { setError(true); }
    finally { setBusy(false); }
  };
  return <main className="mx-auto max-w-md space-y-6 px-6 py-16">
    <h1 className="text-3xl font-semibold">{sv?"Logga in i Sajda-appen":"Sign in to the Sajda app"}</h1>
    <p>{sv?"Fortsätt endast om du själv precis startade inloggningen i Sajdas iPhone-app.":"Continue only if you just started sign-in in Sajda’s iPhone app."}</p>
    <p className="text-sm text-muted-foreground">{{
      en: "The app can use your account, saved names, API keys and membership features, and manage app sign-ins. This does not approve any purchase.",
      sv: "Appen får använda ditt konto, sparade namn, API-nycklar och medlemsfunktioner samt hantera appinloggningar. Inga köp godkänns här.",
      es: "La aplicación puede usar tu cuenta, nombres guardados, claves API y funciones del plan, y gestionar sesiones de la aplicación. Esto no autoriza ninguna compra.",
      fr: "L’application peut utiliser votre compte, vos noms enregistrés, vos clés API et les fonctions de votre offre, et gérer les connexions de l’application. Aucun achat n’est autorisé ici.",
      zh: "应用可使用你的账户、已保存的名称、API 密钥和方案功能，并管理应用登录。这不会授权任何购买。",
    }[language]}</p>
    {!valid ? <p role="alert">{sv?"Öppna inloggningen från Sajda-appen igen.":"Start sign-in again from the Sajda app."}</p>
      : loading ? <p role="status">{sv?"Kontrollerar konto…":"Checking account…"}</p>
      : !user ? <Button asChild><Link to={`/auth?next=${encodeURIComponent(location.pathname+location.search)}`}>{sv?"Logga in":"Sign in"}</Link></Button>
      : <><p className="break-words">{user.email}</p><Button className="w-full" disabled={busy} onClick={()=>void connect()}>{busy?(sv?"Ansluter…":"Connecting…"):(sv?"Anslut mitt konto till appen":"Connect my account to the app")}</Button></>}
    {error && <p role="alert">{sv?"Kontot kunde inte anslutas. Försök igen från appen.":"The account could not be connected. Start again from the app."}</p>}
    <Link className="block underline" to="/account">{sv?"Avbryt":"Cancel"}</Link>
  </main>;
}
