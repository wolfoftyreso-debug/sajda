import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useLanguage } from "@/i18n/LanguageProvider";

const notFoundMessages = {
  en: {
    message: "Page not found",
    returnHome: "Back to search",
  },
  sv: {
    message: "Sidan hittades inte",
    returnHome: "Tillbaka till sökningen",
  },
  es: {
    message: "No encontramos esta página",
    returnHome: "Volver a la búsqueda",
  },
  fr: {
    message: "Page introuvable",
    returnHome: "Retour à la recherche",
  },
  zh: {
    message: "找不到此页面",
    returnHome: "返回搜索",
  },
} as const;

const NotFound = () => {
  const location = useLocation();
  const { language } = useLanguage();
  const copy = notFoundMessages[language];

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted px-5">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p className="mb-4 text-xl text-muted-foreground">{copy.message}</p>
        <a href="/" className="inline-flex min-h-11 items-center text-primary underline hover:text-primary/90">
          {copy.returnHome}
        </a>
      </div>
    </div>
  );
};

export default NotFound;
