import { Component, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useLanguage, type Language } from "@/i18n/LanguageProvider";

const en = {
  title: "This screen could not be opened",
  body: "Your account data has not been deleted. Try returning to search, or reload the app. Reloading may discard changes you have not saved.",
  reload: "Reload app", search: "Back to search",
};
const copy: Record<Language, typeof en> = {
  en,
  sv: { title: "Sidan kunde inte öppnas", body: "Dina kontouppgifter har inte raderats. Gå tillbaka till sökningen eller ladda om appen. Ändringar som du inte har sparat kan gå förlorade när du laddar om.", reload: "Ladda om appen", search: "Tillbaka till sökningen" },
  es: { title: "No se ha podido abrir esta pantalla", body: "Los datos de tu cuenta no se han eliminado. Vuelve a la búsqueda o recarga la aplicación. Al recargar, podrías perder los cambios que no hayas guardado.", reload: "Recargar la aplicación", search: "Volver a la búsqueda" },
  fr: { title: "Cet écran n’a pas pu s’ouvrir", body: "Les données de votre compte n’ont pas été supprimées. Revenez à la recherche ou rechargez l’application. Le rechargement peut effacer les modifications non enregistrées.", reload: "Recharger l’application", search: "Revenir à la recherche" },
  zh: { title: "无法打开此页面", body: "你的账户数据没有被删除。请返回搜索，或重新加载应用。重新加载可能会丢失尚未保存的更改。", reload: "重新加载应用", search: "返回搜索" },
};

/** A failed route must not remove the app's navigation or strand the user. */
class ScreenBoundary extends Component<{ children: ReactNode; language: Language }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() {
    // No query, report content, user identifiers or provider error text in logs.
    console.error(JSON.stringify({ event: "native_screen_failed" }));
  }
  render() {
    if (!this.state.failed) return this.props.children;
    const text = copy[this.props.language];
    const button = "inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-3 text-center font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
    return <main className="mx-auto max-w-xl space-y-5 px-5 py-8" aria-labelledby="native-screen-error-title">
      <div role="alert"><h1 id="native-screen-error-title" className="text-2xl font-semibold tracking-tight">{text.title}</h1></div>
      <p className="text-sm leading-6 text-muted-foreground">{text.body}</p>
      <div className="flex flex-wrap gap-3">
        <Link to="/" className={`${button} border border-border bg-card`}>{text.search}</Link>
        <button type="button" onClick={() => window.location.reload()} className={`${button} bg-primary text-primary-foreground`}>{text.reload}</button>
      </div>
    </main>;
  }
}

export default function NativeRouteBoundary({ children }: { children: ReactNode }) {
  const { language } = useLanguage();
  const { pathname, search } = useLocation();
  return <ScreenBoundary key={`${pathname}${search}`} language={language}>{children}</ScreenBoundary>;
}
