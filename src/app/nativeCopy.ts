import type { Language } from "@/i18n/LanguageProvider";

const en = {
  navigation: "Main navigation", search: "Search", swipe: "Swipe", saved: "Saved", trading: "Trading", account: "Account", more: "More",
  help: "Help", marketplace: "Marketplace", developers: "Developer tools", membership: "Your plan", history: "Search history", domains: "My domains", today: "Today's 10",
  support: "Contact & support", privacy: "Privacy", terms: "Terms", security: "Security", status: "Service status", signIn: "Sign in", back: "Back", skip: "Skip to content",
  checkoutTitle: "Purchases are not available in this app yet",
  checkoutBody: "Your existing Sajda plan applies when you sign in to the same account. In-app purchase, purchase restoration and subscription management are not available in this version. Contact support for help with an existing subscription.",
  helpIntro: "Search an exact domain or describe an idea. Advanced search lets you choose extensions, providers and naming criteria. Searches and live checks need an internet connection.",
  swipeHelp: "In Swipe, keep or skip each name, choose extensions in settings and review your saved choices. Undo and account saving depend on your plan.",
  tradingHelp: "Trading shows your account's reports and job status. Starting a run, stopping it or refreshing a price requires an explicit action. Check the source, timestamp and uncertainty before using any result.",
};

export const nativeCopy: Record<Language, typeof en> = {
  en,
  sv: {
    navigation: "Huvudnavigering", search: "Sök", swipe: "Swajp", saved: "Sparat", trading: "Trading", account: "Konto", more: "Mer",
    help: "Hjälp", marketplace: "Marknadsplats", developers: "Utvecklarverktyg", membership: "Ditt paket", history: "Sökhistorik", domains: "Mina domäner", today: "Dagens 10",
    support: "Kontakt & support", privacy: "Integritet", terms: "Villkor", security: "Säkerhet", status: "Driftsstatus", signIn: "Logga in", back: "Tillbaka", skip: "Hoppa till innehåll",
    checkoutTitle: "Köp är inte tillgängliga i appen ännu",
    checkoutBody: "Ditt befintliga Sajda-paket gäller när du loggar in på samma konto. Köp i appen, köpåterställning och prenumerationshantering är inte tillgängliga i den här versionen. Kontakta support för hjälp med en befintlig prenumeration.",
    helpIntro: "Sök en exakt domän eller beskriv en idé. Avancerad sökning låter dig välja ändelser, leverantörer och namnkriterier. Sökning och livekontroller kräver internetanslutning.",
    swipeHelp: "I Swajp kan du behålla eller hoppa över namn, välja ändelser i inställningarna och granska dina sparade val. Ångra och kontosparande beror på ditt paket.",
    tradingHelp: "Trading visar kontots rapporter och körningsstatus. Att starta, stoppa eller uppdatera ett pris kräver en uttrycklig åtgärd. Granska källa, tidsstämpel och osäkerhet innan du använder ett resultat.",
  },
  es: { ...en, navigation: "Navegación principal", search: "Buscar", swipe: "Deslizar", saved: "Guardados", account: "Cuenta", more: "Más", help: "Ayuda", marketplace: "Mercado", developers: "Herramientas de desarrollo", membership: "Tu plan", privacy: "Privacidad", terms: "Condiciones", security: "Seguridad", status: "Estado", support: "Contacto y ayuda", signIn: "Iniciar sesión", back: "Volver", skip: "Ir al contenido", checkoutTitle: "Las compras aún no están disponibles en esta aplicación", checkoutBody: "Tu plan actual de Sajda se aplica al iniciar sesión con la misma cuenta. Esta versión no permite compras, restauración de compras ni gestión de suscripciones. Contacta con soporte para obtener ayuda con tu suscripción." },
  fr: { ...en, navigation: "Navigation principale", search: "Recherche", swipe: "Balayer", saved: "Enregistrés", account: "Compte", more: "Plus", help: "Aide", marketplace: "Marché", developers: "Outils développeurs", membership: "Votre offre", privacy: "Confidentialité", terms: "Conditions", security: "Sécurité", status: "État du service", support: "Contact et assistance", signIn: "Se connecter", back: "Retour", skip: "Aller au contenu", checkoutTitle: "Les achats ne sont pas encore disponibles dans cette application", checkoutBody: "Votre offre Sajda existante s’applique avec le même compte. Les achats, leur restauration et la gestion des abonnements ne sont pas disponibles dans cette version. Contactez l’assistance pour un abonnement existant." },
  zh: { ...en, navigation: "主导航", search: "搜索", swipe: "滑选", saved: "已保存", account: "账户", more: "更多", help: "帮助", marketplace: "交易市场", developers: "开发者工具", membership: "你的方案", privacy: "隐私", terms: "条款", security: "安全", status: "服务状态", support: "联系与支持", signIn: "登录", back: "返回", skip: "跳至内容", checkoutTitle: "此应用暂不支持购买", checkoutBody: "登录同一账户即可使用现有 Sajda 方案。此版本尚不支持应用内购买、恢复购买和订阅管理。如需处理现有订阅，请联系支持团队。" },
};
