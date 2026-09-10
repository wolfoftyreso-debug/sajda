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
    eyebrow: "ONE FREE SEARCH USED",
    title: "Your free search is complete.",
    body: "You have used your introductory search, but you can still review the results. Sign in to save domains to your account. Creating an account does not unlock more searches.",
    signIn: "Sign in",
    create: "Create account",
    continue: "Keep reviewing results",
    unavailableTitle: "Your free search is complete.",
    unavailableBody: "Each browser gets one completed registry search or one round of Swipe. Sign-in and account saving are not available in this preview because the account service is not connected.",
  },
  sv: {
    eyebrow: "EN KOSTNADSFRI SÖKNING ANVÄND",
    title: "Din kostnadsfria sökning är klar.",
    body: "Du har använt din introduktionssökning, men kan fortfarande granska resultaten. Logga in för att spara domäner på ditt konto. Ett konto ger inte fler sökningar.",
    signIn: "Logga in",
    create: "Skapa konto",
    continue: "Fortsätt granska resultat",
    unavailableTitle: "Din kostnadsfria sökning är klar.",
    unavailableBody: "Varje webbläsare får en genomförd registersökning eller en omgång Swipe. Det går inte att logga in eller spara på ett konto i den här förhandsvisningen eftersom kontotjänsten inte är ansluten.",
  },
  es: {
    eyebrow: "SE USÓ UNA BÚSQUEDA GRATUITA",
    title: "Tu búsqueda gratuita ha terminado.",
    body: "Ya has utilizado tu búsqueda de prueba, pero puedes seguir revisando los resultados. Inicia sesión para guardar dominios en tu cuenta. Crear una cuenta no desbloquea más búsquedas.",
    signIn: "Iniciar sesión",
    create: "Crear cuenta",
    continue: "Seguir revisando resultados",
    unavailableTitle: "Tu búsqueda gratuita ha terminado.",
    unavailableBody: "Cada navegador permite una búsqueda completa en el registro o una ronda de Swipe. Esta vista previa no permite iniciar sesión ni guardar en una cuenta porque el servicio de cuentas no está conectado.",
  },
  fr: {
    eyebrow: "UNE RECHERCHE GRATUITE UTILISÉE",
    title: "Votre recherche gratuite est terminée.",
    body: "Vous avez utilisé votre recherche d’essai, mais vous pouvez toujours consulter les résultats. Connectez-vous pour enregistrer des domaines dans votre compte. Créer un compte ne débloque pas de recherches supplémentaires.",
    signIn: "Se connecter",
    create: "Créer un compte",
    continue: "Continuer à examiner les résultats",
    unavailableTitle: "Votre recherche gratuite est terminée.",
    unavailableBody: "Chaque navigateur bénéficie d’une recherche complète auprès du registre ou d’une série Swipe. La connexion et l’enregistrement dans un compte ne sont pas disponibles dans cet aperçu, car le service de comptes n’est pas connecté.",
  },
  zh: {
    eyebrow: "一次免费搜索已使用",
    title: "你的免费搜索已完成。",
    body: "你的试用搜索已用完，但仍可查看结果。登录后可将域名保存到账户。创建账户不会增加搜索次数。",
    signIn: "登录",
    create: "创建账户",
    continue: "继续查看结果",
    unavailableTitle: "你的免费搜索已完成。",
    unavailableBody: "每个浏览器可完成一次注册局搜索或一轮 Swipe。此预览尚未连接账户服务，因此暂时无法登录或将域名保存到账户。",
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
