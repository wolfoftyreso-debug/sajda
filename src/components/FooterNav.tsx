import { useLocation, useNavigate } from "react-router-dom";
import { Search, History, FolderOpen, Heart, User, Layers, House } from "lucide-react";
import { nameProjectsEnabled } from "@/lib/nameProjectsFeature";
import { projectEntryCopy } from "@/i18n/projectEntryCopy";
import { hasSupabaseBrowserConfig } from "@/integrations/supabase/client";
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
    ] : hasSupabaseBrowserConfig ? [{
      label: copy.history,
      icon: History,
      path: "/history",
      requiresAuth: true,
    },
    {
      label: copy.domains,
      icon: FolderOpen,
      path: "/my-domains",
      requiresAuth: true,
    }] : []),
  ];

  const handleNavigation = (path: string, requiresAuth: boolean) => {
    if (requiresAuth && !user) {
      navigate(`/auth?next=${encodeURIComponent(path)}`);
    } else {
      navigate(path);
    }
  };

  const focusSearch = () => {
    const openSearch = () => {
      const field = document.getElementById("domain-theme");
      if (!(field instanceof HTMLInputElement)) return;
      field.scrollIntoView({ block: "center" });
      field.focus();
    };
    if (location.pathname !== "/") {
      navigate("/");
      window.setTimeout(openSearch, 280);
      return;
    }
    openSearch();
  };

  const itemClass = (isActive: boolean) => cn(
    "flex h-12 min-w-[4.25rem] flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-2 text-[11px] font-semibold transition-colors",
    isActive ? "bg-[#e8e8ed] text-foreground" : "text-muted-foreground hover:text-foreground",
  );

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 px-3 pb-[max(0.7rem,env(safe-area-inset-bottom))] md:hidden">
      <div className="mx-auto flex max-w-lg items-end justify-center gap-3">
        <nav
          aria-label={copy.navigation}
          className="pointer-events-auto flex h-[4.4rem] min-w-0 flex-1 items-center gap-1 overflow-x-auto rounded-full border border-black/[0.05] bg-white/92 px-2 shadow-[0_12px_40px_rgba(15,23,42,0.16)] backdrop-blur-xl"
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
        </nav>
        <button
          type="button"
          onClick={focusSearch}
          aria-label={copy.search}
          className="pointer-events-auto flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-black/[0.05] bg-white text-foreground shadow-[0_12px_40px_rgba(15,23,42,0.16)]"
        >
          <Search className="h-6 w-6" />
        </button>
      </div>
    </div>
  );
};

export default FooterNav;
