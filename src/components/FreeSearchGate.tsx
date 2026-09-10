import { Link, useLocation } from "react-router-dom";
import { ArrowRight, KeyRound, SearchCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useScan } from "@/contexts/ScanContext";
import { isAccountAuthConfigured } from "@/integrations/neon/auth";
import { useLanguage, type Language } from "@/i18n/LanguageProvider";

type GateCopy = {
  eyebrow: string;
  title: string;
  body: string;
  signIn: string;
  create: string;
  continue: string;
  unavailableTitle: string;
  unavailableBody: string;
};

const copyByLanguage: Record<Language, GateCopy> = {
  en: {
    eyebrow: "CONTINUE FOR FREE",
    title: "Keep searching with a free account.",
    body: "Sign in, or create an account and verify your email. Search and AI limits still apply; no subscription is required.",
    signIn: "Sign in",
    create: "Create free account",
    continue: "Keep reviewing results",
    unavailableTitle: "Your results are still available.",
    unavailableBody: "Sign-in is unavailable right now. You can keep reviewing these results, but another search requires an account with a verified email.",
  },
  sv: {
    eyebrow: "FORTSÄTT GRATIS",
    title: "Sök vidare med ett gratiskonto.",
    body: "Logga in eller skapa ett konto och bekräfta din e-postadress. Gränser för sökningar och AI gäller fortfarande. Inget abonnemang krävs.",
    signIn: "Logga in",
    create: "Skapa gratiskonto",
    continue: "Fortsätt granska resultat",
    unavailableTitle: "Dina resultat finns kvar.",
    unavailableBody: "Det går inte att logga in just nu. Du kan fortsätta granska resultaten, men en ny sökning kräver ett konto med bekräftad e-postadress.",
  },
  es: {
    eyebrow: "CONTINÚA GRATIS",
    title: "Sigue buscando con una cuenta gratuita.",
    body: "Inicia sesión o crea una cuenta y verifica tu correo. Se siguen aplicando los límites de búsqueda e IA. No necesitas una suscripción.",
    signIn: "Iniciar sesión",
    create: "Crear cuenta gratuita",
    continue: "Seguir revisando resultados",
    unavailableTitle: "Tus resultados siguen disponibles.",
    unavailableBody: "No se puede iniciar sesión en este momento. Puedes seguir revisando los resultados, pero otra búsqueda requiere una cuenta con el correo verificado.",
  },
  fr: {
    eyebrow: "CONTINUEZ GRATUITEMENT",
    title: "Poursuivez vos recherches avec un compte gratuit.",
    body: "Connectez-vous ou créez un compte et confirmez votre adresse e-mail. Les limites de recherche et d’IA restent applicables. Aucun abonnement n’est nécessaire.",
    signIn: "Se connecter",
    create: "Créer un compte gratuit",
    continue: "Continuer à consulter les résultats",
    unavailableTitle: "Vos résultats restent disponibles.",
    unavailableBody: "La connexion est indisponible pour le moment. Vous pouvez consulter vos résultats, mais une nouvelle recherche nécessite un compte avec une adresse e-mail confirmée.",
  },
  zh: {
    eyebrow: "继续免费搜索",
    title: "使用免费账户继续搜索。",
    body: "请登录，或创建账户并验证邮箱。搜索和 AI 使用仍有额度限制，无需订阅。",
    signIn: "登录",
    create: "创建免费账户",
    continue: "继续查看结果",
    unavailableTitle: "你的搜索结果仍可查看。",
    unavailableBody: "目前暂时无法登录。你可以继续查看这些结果，但再次搜索需要使用已验证邮箱的账户。",
  },
};

export default function FreeSearchGate() {
  const { freeSearchGateOpen, closeFreeSearchGate } = useScan();
  const { language } = useLanguage();
  const location = useLocation();
  const copy = copyByLanguage[language];
  const accountAccessAvailable = isAccountAuthConfigured;
  const next = `${location.pathname}${location.search}${location.hash}`;
  const authHref = `/auth?next=${encodeURIComponent(next)}`;

  return (
    <Dialog open={freeSearchGateOpen} onOpenChange={(open) => !open && closeFreeSearchGate()}>
      <DialogContent className="max-w-[31rem] rounded-2xl border-border bg-card p-6 shadow-[0_24px_80px_hsl(219_44%_12%/0.18)] sm:p-7">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-primary/15 bg-primary/[0.07] text-primary">
          {accountAccessAvailable ? <KeyRound className="h-5 w-5" aria-hidden="true" /> : <SearchCheck className="h-5 w-5" aria-hidden="true" />}
        </div>
        <DialogHeader className="mt-4 space-y-2 text-left">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">{copy.eyebrow}</p>
          <DialogTitle className="text-2xl font-semibold leading-tight tracking-[-0.035em] text-foreground">
            {accountAccessAvailable ? copy.title : copy.unavailableTitle}
          </DialogTitle>
          <DialogDescription className="max-w-[28rem] text-sm leading-6 text-muted-foreground">
            {accountAccessAvailable ? copy.body : copy.unavailableBody}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-3 gap-2 sm:justify-start sm:space-x-0">
          {accountAccessAvailable ? (
            <>
              <Button asChild variant="outline" onClick={closeFreeSearchGate}>
                <Link to={authHref}>{copy.signIn}</Link>
              </Button>
              <Button asChild onClick={closeFreeSearchGate}>
                <Link to={`${authHref}&mode=signup`}>
                  {copy.create}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            </>
          ) : (
            <Button type="button" onClick={closeFreeSearchGate}>
              {copy.continue}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
