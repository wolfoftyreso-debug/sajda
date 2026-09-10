import { NavLink, useLocation } from "react-router-dom";
import { Search, Layers, Heart, ChartNoAxesCombined, UserRound } from "lucide-react";
import { useLanguage } from "@/i18n/LanguageProvider";
import { nativeCopy } from "./nativeCopy";

export default function NativeNavigation() {
  const { language } = useLanguage();
  const { pathname } = useLocation();
  const copy = nativeCopy[language];
  const items = [
    { to: "/", label: copy.search, icon: Search },
    { to: "/swipe", label: copy.swipe, icon: Layers },
    { to: "/watchlist", label: copy.savedShort, fullLabel: copy.saved, icon: Heart },
    { to: "/plus", label: copy.trading, icon: ChartNoAxesCombined },
    { to: "/account", label: copy.account, icon: UserRound },
  ];
  return <nav aria-label={copy.navigation} className="sajda-native-navigation fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur-xl">
    <div className="mx-auto grid h-16 max-w-xl grid-cols-5 items-stretch px-1">
      {items.map(({ to, label, fullLabel, icon: Icon }) => <NavLink key={to} to={to} end aria-label={fullLabel ?? label}
        className={({ isActive }) => `flex min-h-11 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${isActive || to === "/account" && ["/more", "/auth", "/pricing"].includes(pathname) ? "text-primary" : "text-muted-foreground"}`}>
        <Icon className="h-5 w-5 shrink-0" aria-hidden="true" /><span className="max-w-full whitespace-normal break-words text-center leading-tight">{label}</span>
      </NavLink>)}
    </div>
  </nav>;
}
