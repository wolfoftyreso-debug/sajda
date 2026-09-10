import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/i18n/LanguageProvider";

// Do not render an apparently empty account while its storage is unavailable.
export default function AccountFeatureUnavailable() {
  const { language } = useLanguage();
  const copy = {
    en: { title: "This account feature is not available yet", body: "This page cannot load or save account data in this version. That does not mean your account is empty. You can still search for domains.", action: "Back to domain search" },
    sv: { title: "Den här kontofunktionen är inte tillgänglig ännu", body: "Den här sidan kan inte hämta eller spara kontouppgifter i den här versionen. Det betyder inte att ditt konto är tomt. Du kan fortfarande söka efter domäner.", action: "Tillbaka till domänsökningen" },
    es: { title: "Esta función de la cuenta aún no está disponible", body: "Esta página no puede cargar ni guardar datos de tu cuenta en esta versión. Eso no significa que tu cuenta esté vacía. Puedes seguir buscando dominios.", action: "Volver a buscar dominios" },
    fr: { title: "Cette fonction du compte n’est pas encore disponible", body: "Cette page ne peut ni charger ni enregistrer les données de votre compte dans cette version. Cela ne signifie pas que votre compte est vide. Vous pouvez toujours rechercher des domaines.", action: "Retour à la recherche de domaines" },
    zh: { title: "此账户功能暂不可用", body: "此版本的页面无法加载或保存账户数据，但这并不表示你的账户为空。你仍可继续搜索域名。", action: "返回域名搜索" },
  }[language];
  return <main className="container mx-auto max-w-2xl px-5 py-12"><section className="rounded-2xl border border-border bg-card p-6"><h1 className="text-2xl font-semibold">{copy.title}</h1><p className="mt-3 leading-7 text-muted-foreground">{copy.body}</p><Button asChild className="mt-6 h-auto min-h-11 whitespace-normal"><Link to="/">{copy.action}</Link></Button></section></main>;
}
