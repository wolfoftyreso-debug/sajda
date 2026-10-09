import { useLocation, useNavigate } from "react-router-dom";
import { FolderOpen, Heart, User, Layers, House } from "lucide-react";
import { nameProjectsEnabled } from "@/lib/nameProjectsFeature";
import { projectEntryCopy } from "@/i18n/projectEntryCopy";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage, type Language } from "@/i18n/LanguageProvider";
import { isNativeApp } from "@/lib/appSurface";

const footerMessages: Record<Language, {
  navigation: string;
  home: string;
  search: string;
  watchlist: string;
  history: string;
  domains: string;
  account: string;
}> = {
  en: {
    navigation: "Main navigation",
    home: "Home",
    search: "Search",
    watchlist: "Saved",
    history: "History",
    domains: "Domains",
    account: "Account",
  },
  sv: {
    navigation: "Huvudnavigering",
    home: "Hem",
    search: "Sök",
    watchlist: "Sparat",
    history: "Historik",
    domains: "Domäner",
    account: "Konto",
  },
  es: {
    navigation: "Navegación principal",
    home: "Inicio",
    search: "Buscar",
    watchlist: "Guardados",
    history: "Historial",
    domains: "Dominios",
    account: "Cuenta",
  },
  fr: {
    navigation: "Navigation principale",
    home: "Accueil",
    search: "Recherche",
    watchlist: "Enregistrés",
    history: "Historique",
    domains: "Domaines",
    account: "Compte",
  },
  zh: {
    navigation: "主导航",
    home: "首页",
    search: "搜索",
    watchlist: "已保存",
    history: "历史记录",
    domains: "域名",
    account: "账户",
  },
};

const FooterNav = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { language } = useLanguage();
  const copy = footerMessages[language];

  if (isNativeApp) return null;

  const navItems = [
    {
      label: copy.home,
      icon: House,
      path: "/",
      requiresAuth: false,
    },
    {
      label: copy.watchlist,
      icon: Heart,
      path: "/watchlist",
      requiresAuth: true,
    },
    ...(nameProjectsEnabled ? [
      { label: "Swipe", icon: Layers, path: "/swipe", requiresAuth: false },
      { label: projectEntryCopy[language].short, icon: FolderOpen, path: "/projects", requiresAuth: true },
    ] : [{ label: "Swipe", icon: Layers, path: "/swipe", requiresAuth: false }]),
  ];

  const handleNavigation = (path: string, requiresAuth: boolean) => {
    if (requiresAuth && !user) {
      navigate(`/auth?next=${encodeURIComponent(path)}`);
    } else {
      navigate(path);
    }
  };

  const itemClass = (isActive: boolean) => cn(
    "flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-medium leading-tight",
    isActive ? "text-primary" : "text-muted-foreground",
  );

  return (
    <nav
      aria-label={copy.navigation}
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 backdrop-blur-xl md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div
        className="mx-auto grid h-14 max-w-lg"
        style={{ gridTemplateColumns: `repeat(${navItems.length + 1}, minmax(0, 1fr))` }}
      >
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;

          return (
            <button
              key={item.path}
              onClick={() => handleNavigation(item.path, item.requiresAuth)}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
              className={itemClass(isActive)}
            >
              <Icon className="h-5 w-5" />
              <span className="max-w-full truncate">{item.label}</span>
            </button>
          );
        })}

        <button
          onClick={() => navigate(user ? "/account" : "/auth")}
          aria-label={copy.account}
          aria-current={location.pathname === "/auth" || location.pathname === "/account" ? "page" : undefined}
          className={itemClass(location.pathname === "/auth" || location.pathname === "/account")}
        >
          <User className="h-5 w-5" />
          <span className="max-w-full truncate">{copy.account}</span>
        </button>
      </div>
    </nav>
  );
};

export default FooterNav;
