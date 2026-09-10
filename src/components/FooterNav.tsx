import { useLocation, useNavigate } from "react-router-dom";
import { Search, History, FolderOpen, Heart, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { isAnonymousSearchMode } from "@/lib/anonymousSearchMode";
import { useLanguage, type Language } from "@/i18n/LanguageProvider";
import { isNativeApp } from "@/lib/appSurface";

const footerMessages: Record<Language, {
  navigation: string;
  search: string;
  watchlist: string;
  history: string;
  domains: string;
  account: string;
}> = {
  en: {
    navigation: "Main navigation",
    search: "Search",
    watchlist: "Watchlist",
    history: "History",
    domains: "Domains",
    account: "Account",
  },
  sv: {
    navigation: "Huvudnavigering",
    search: "Sök",
    watchlist: "Bevaka",
    history: "Historik",
    domains: "Domäner",
    account: "Konto",
  },
  es: {
    navigation: "Navegación principal",
    search: "Buscar",
    watchlist: "Lista",
    history: "Historial",
    domains: "Dominios",
    account: "Cuenta",
  },
  fr: {
    navigation: "Navigation principale",
    search: "Recherche",
    watchlist: "Suivi",
    history: "Historique",
    domains: "Domaines",
    account: "Compte",
  },
  zh: {
    navigation: "主导航",
    search: "搜索",
    watchlist: "关注",
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

  if (isNativeApp || isAnonymousSearchMode()) return null;

  const navItems = [
    {
      label: copy.search,
      icon: Search,
      path: "/",
      requiresAuth: false,
    },
    {
      label: copy.watchlist,
      icon: Heart,
      path: "/watchlist",
      requiresAuth: true,
    },
    {
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
    },
  ];

  const handleNavigation = (path: string, requiresAuth: boolean) => {
    if (requiresAuth && !user) {
      navigate("/auth");
    } else {
      navigate(path);
    }
  };

  return (
    <footer className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 pb-[max(0.25rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_hsl(219_44%_12%/0.06)] backdrop-blur-xl md:hidden">
      <nav aria-label={copy.navigation} className="mx-auto flex h-[4.25rem] max-w-xl items-stretch justify-around px-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;

          return (
            <button
              key={item.path}
              onClick={() => handleNavigation(item.path, item.requiresAuth)}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-semibold transition-colors",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className={cn("h-5 w-5", isActive && "text-primary")} />
              <span className="max-w-full truncate">{item.label}</span>
            </button>
          );
        })}

        {/* Account button */}
        <button
          onClick={() => navigate(user ? "/account" : "/auth")}
          aria-label={copy.account}
          aria-current={location.pathname === "/auth" || location.pathname === "/account" ? "page" : undefined}
          className={cn(
            "flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-semibold transition-colors",
            location.pathname === "/auth" || location.pathname === "/account"
              ? "text-primary"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <User className="h-5 w-5" />
          <span className="max-w-full truncate">{copy.account}</span>
        </button>
      </nav>
    </footer>
  );
};

export default FooterNav;
