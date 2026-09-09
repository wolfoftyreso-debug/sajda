import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/i18n/LanguageProvider";

// Do not render an apparently empty account while its storage is unavailable.
export default function AccountFeatureUnavailable() {
  const { language } = useLanguage();
  const copy = {
    en: { title: "This account feature is not available yet", body: "This view is not connected to the account storage in this version. We cannot load or save its data here. You can still return to domain search.", action: "Back to domain search" },
    sv: { title: "Den här kontofunktionen är inte tillgänglig ännu", body: "Den här vyn är inte ansluten till kontolagringen i den här versionen. Vi kan inte läsa eller spara dess data här. Du kan fortfarande återgå till domänsökningen.", action: "Tillbaka till domänsökningen" },
    es: { title: "Esta función de cuenta aún no está disponible", body: "Esta vista no está conectada al almacenamiento de la cuenta en esta versión. No podemos cargar ni guardar sus datos aquí. Puedes volver a la búsqueda de dominios.", action: "Volver a buscar dominios" },
    fr: { title: "Cette fonctionnalité de compte n’est pas encore disponible", body: "Cette vue n’est pas reliée au stockage du compte dans cette version. Nous ne pouvons ni lire ni enregistrer ses données ici. Vous pouvez revenir à la recherche de domaines.", action: "Revenir à la recherche de domaines" },
    zh: { title: "此账户功能暂不可用", body: "当前版本的此页面尚未连接账户存储，无法读取或保存相关数据。你仍可返回域名搜索。", action: "返回域名搜索" },
  }[language];
  return <main className="container mx-auto max-w-2xl px-5 py-12"><section className="rounded-2xl border border-border bg-card p-6"><h1 className="text-2xl font-semibold">{copy.title}</h1><p className="mt-3 leading-7 text-muted-foreground">{copy.body}</p><Button asChild className="mt-6"><Link to="/">{copy.action}</Link></Button></section></main>;
}
