import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useLanguage } from "@/i18n/LanguageProvider";
import { applyWebSeoMetadata } from "@/lib/webSeoMetadata";

export default function WebSeoMetadata() {
  const { pathname, search } = useLocation();
  const { selectedLanguage } = useLanguage();
  useEffect(() => {
    applyWebSeoMetadata(pathname, search, window.location.origin, selectedLanguage);
  }, [pathname, search, selectedLanguage]);
  return null;
}
