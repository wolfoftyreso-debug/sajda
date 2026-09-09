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
    body: "Your introductory search has been used. You can keep reviewing the results. Sign in to save candidates to your account; creating an account does not unlock more searches.",
    signIn: "Sign in",
    create: "Create account",
    continue: "Keep reviewing results",
    unavailableTitle: "Your free search is complete.",
    unavailableBody: "A browser gets one completed registry search or Swipe deck. This preview is running without an account service; sign-in and saved work are available when Sajda is connected to its production account service.",
  },
  sv: {
    eyebrow: "EN KOSTNADSFRI SÖKNING ANVÄND",
    title: "Din kostnadsfria sökning är klar.",
    body: "Din introduktionssökning är använd. Du kan fortsätta granska resultaten. Logga in för att spara kandidater på kontot; ett konto låser inte upp fler sökningar.",
    signIn: "Logga in",
    create: "Skapa konto",
    continue: "Fortsätt granska resultat",
    unavailableTitle: "Din kostnadsfria sökning är klar.",
    unavailableBody: "En webbläsare får en genomförd registerkontroll eller en Swajp-kortlek. Den här förhandsvisningen körs utan kontotjänst; inloggning och sparat arbete blir tillgängligt när Sajda är ansluten till sin produktionsmiljö.",
  },
  es: {
    eyebrow: "SE USÓ UNA BÚSQUEDA GRATUITA",
    title: "Tu búsqueda gratuita ha terminado.",
    body: "Ya has utilizado tu búsqueda de prueba. Puedes seguir revisando los resultados. Inicia sesión para guardar candidatos; crear una cuenta no desbloquea más búsquedas.",
    signIn: "Iniciar sesión",
    create: "Crear cuenta",
    continue: "Seguir revisando resultados",
    unavailableTitle: "Tu búsqueda gratuita ha terminado.",
    unavailableBody: "Cada navegador obtiene una búsqueda de registro completada o una baraja Swipe. Esta vista previa se ejecuta sin un servicio de cuentas; el inicio de sesión y el trabajo guardado estarán disponibles cuando Sajda esté conectado a su servicio de producción.",
  },
  fr: {
    eyebrow: "UNE RECHERCHE GRATUITE UTILISÉE",
    title: "Votre recherche gratuite est terminée.",
    body: "Votre recherche d’essai a été utilisée. Vous pouvez continuer à examiner les résultats. Connectez-vous pour enregistrer vos candidats ; créer un compte ne débloque pas de recherches supplémentaires.",
    signIn: "Se connecter",
    create: "Créer un compte",
    continue: "Continuer à examiner les résultats",
    unavailableTitle: "Votre recherche gratuite est terminée.",
    unavailableBody: "Chaque navigateur bénéficie d’une recherche de registre terminée ou d’un jeu Swipe. Cet aperçu fonctionne sans service de comptes ; la connexion et le travail enregistré seront disponibles lorsque Sajda sera connecté à son service de production.",
  },
  zh: {
    eyebrow: "一次免费搜索已使用",
    title: "你的免费搜索已完成。",
    body: "你的试用搜索已用完，但仍可查看结果。登录可将候选项保存到账户；创建账户不会解锁更多搜索。",
    signIn: "登录",
    create: "创建账户",
    continue: "继续查看结果",
    unavailableTitle: "你的免费搜索已完成。",
    unavailableBody: "每个浏览器可完成一次注册局搜索或一组 Swipe 卡片。此预览未连接账户服务；Sajda 接入生产账户服务后，即可登录并保存工作内容。",
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
