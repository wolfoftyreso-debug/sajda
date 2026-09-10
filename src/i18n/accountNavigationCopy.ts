import type { Language } from "./LanguageProvider";

export const accountNavigationCopy: Record<Language, { account: string; signIn: string; oneAccount: string }> = {
  en: { account: "My account", signIn: "Sign in", oneAccount: "One Sajda account for every plan. Use your existing login for search, Swipe and Trading — no separate account needed." },
  sv: { account: "Mitt konto", signIn: "Logga in", oneAccount: "Ett Sajda-konto för alla nivåer. Använd samma inloggning för sökning, Swipe och Trading — inget separat konto behövs." },
  es: { account: "Mi cuenta", signIn: "Iniciar sesión", oneAccount: "Una cuenta de Sajda para todos los planes. Usa tu inicio de sesión habitual para buscar, Swipe y Trading; no necesitas otra cuenta." },
  fr: { account: "Mon compte", signIn: "Se connecter", oneAccount: "Un compte Sajda pour toutes les offres. Utilisez vos identifiants habituels pour la recherche, Swipe et Trading, sans compte supplémentaire." },
  zh: { account: "我的账户", signIn: "登录", oneAccount: "所有方案共用一个 Sajda 账户。搜索、Swipe 和 Trading 使用同一登录，无需另建账户。" },
};
