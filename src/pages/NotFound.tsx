import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useLanguage } from "@/i18n/LanguageProvider";

const notFoundMessages = {
  en: {
    message: "Oops! Page not found",
    returnHome: "Return to Home",
  },
  sv: {
    message: "Hoppsan! Sidan hittades inte",
    returnHome: "Tillbaka till startsidan",
  },
  es: {
    message: "Vaya, no encontramos esa página",
    returnHome: "Volver al inicio",
  },
  fr: {
    message: "Oups, cette page est introuvable",
    returnHome: "Retour à l’accueil",
  },
  zh: {
    message: "抱歉，找不到这个页面",
    returnHome: "返回首页",
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
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p className="mb-4 text-xl text-muted-foreground">{copy.message}</p>
        <a href="/" className="text-primary underline hover:text-primary/90">
          {copy.returnHome}
        </a>
      </div>
    </div>
  );
};

export default NotFound;
