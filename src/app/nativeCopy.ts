import type { Language } from "@/i18n/LanguageProvider";

const en = {
  navigation: "Main navigation", search: "Search", swipe: "Swipe", saved: "Saved domains", savedShort: "Saved", trading: "Trading", account: "Account", more: "More",
  help: "Help", marketplace: "Marketplace", developers: "Developer tools", membership: "Your plan", history: "Search history", domains: "My domains", today: "Today's 10",
  support: "Contact & support", privacy: "Privacy", terms: "Terms", security: "Security", status: "Service status", signIn: "Sign in", back: "Back", skip: "Skip to content",
  checkoutTitle: "Purchases are not available in this app yet",
  checkoutBody: "Your existing Sajda plan applies when you sign in to the same account. In-app purchase, purchase restoration and subscription management are not available in this version. Contact support for help with an existing subscription.",
  helpIntro: "Search an exact domain or describe an idea. Advanced search lets you choose extensions, providers and naming criteria. Searches and live checks need an internet connection.",
  swipeHelp: "In Swipe, keep or skip each name, choose extensions in settings and review your picks. Undo requires Premium access. To save a name to your account, sign in and confirm your email address.",
  tradingHelp: "Trading shows your reports and research progress. You choose when to start or stop a run, or refresh a price. Check each result’s sources, check dates and limitations before using it.",
};

export const nativeCopy: Record<Language, typeof en> = {
  en,
  sv: {
    navigation: "Huvudnavigering", search: "Sök", swipe: "Swipe", saved: "Sparade domäner", savedShort: "Sparat", trading: "Trading", account: "Konto", more: "Mer",
    help: "Hjälp", marketplace: "Marknadsplats", developers: "Utvecklarverktyg", membership: "Ditt paket", history: "Sökhistorik", domains: "Mina domäner", today: "Dagens 10",
    support: "Kontakt & support", privacy: "Integritet", terms: "Villkor", security: "Säkerhet", status: "Driftsstatus", signIn: "Logga in", back: "Tillbaka", skip: "Hoppa till innehåll",
    checkoutTitle: "Köp är inte tillgängliga i appen ännu",
    checkoutBody: "Ditt befintliga Sajda-paket gäller när du loggar in på samma konto. Köp i appen, återställning av köp och hantering av abonnemang är inte tillgängliga i den här versionen. Kontakta supporten om du behöver hjälp med ett befintligt abonnemang.",
    helpIntro: "Sök efter ett specifikt domännamn eller beskriv en idé. I avancerad sökning kan du välja ändelser, leverantörer och krav på namnet. Sökningar och livekontroller kräver internetanslutning.",
    swipeHelp: "I Swipe kan du behålla eller hoppa över namn, välja ändelser i inställningarna och gå igenom dina val. För att ångra ett val behöver du Premium. För att spara på kontot behöver du logga in och bekräfta din e-postadress.",
    tradingHelp: "Trading visar dina rapporter och hur granskningarna går. Du väljer själv när du vill starta eller stoppa en körning eller uppdatera ett pris. Kontrollera resultatets källor, kontrolldatum och begränsningar innan du använder det.",
  },
  es: {
    navigation: "Navegación principal", search: "Buscar", swipe: "Swipe", saved: "Dominios guardados", savedShort: "Guardados", trading: "Trading", account: "Cuenta", more: "Más",
    help: "Ayuda", marketplace: "Mercado", developers: "Herramientas para desarrolladores", membership: "Tu plan", history: "Historial de búsqueda", domains: "Mis dominios", today: "Los 10 de hoy",
    privacy: "Privacidad", terms: "Condiciones", security: "Seguridad", status: "Estado del servicio", support: "Contacto y ayuda", signIn: "Iniciar sesión", back: "Volver", skip: "Ir al contenido",
    checkoutTitle: "Las compras aún no están disponibles en esta aplicación",
    checkoutBody: "Tu plan actual de Sajda se aplica al iniciar sesión con la misma cuenta. Esta versión no permite comprar, restaurar compras ni gestionar suscripciones desde la aplicación. Contacta con soporte si necesitas ayuda con una suscripción existente.",
    helpIntro: "Busca un dominio concreto o describe una idea. La búsqueda avanzada te permite elegir extensiones, proveedores y criterios para el nombre. Las búsquedas y las comprobaciones en tiempo real requieren conexión a internet.",
    swipeHelp: "En Swipe puedes conservar o descartar cada nombre, elegir extensiones en los ajustes y revisar tu selección. Para deshacer una elección necesitas acceso Premium. Para guardar un nombre en tu cuenta, inicia sesión y confirma tu correo.",
    tradingHelp: "Trading muestra tus informes y el progreso de las investigaciones. Tú decides cuándo iniciar o detener una búsqueda, o actualizar un precio. Revisa las fuentes, las fechas de comprobación y las limitaciones de cada resultado antes de utilizarlo.",
  },
  fr: {
    navigation: "Navigation principale", search: "Recherche", swipe: "Swipe", saved: "Domaines enregistrés", savedShort: "Enregistrés", trading: "Trading", account: "Compte", more: "Plus",
    help: "Aide", marketplace: "Place de marché", developers: "Outils de développement", membership: "Votre offre", history: "Historique des recherches", domains: "Mes domaines", today: "Les 10 du jour",
    privacy: "Confidentialité", terms: "Conditions", security: "Sécurité", status: "État du service", support: "Contact et assistance", signIn: "Se connecter", back: "Retour", skip: "Aller au contenu",
    checkoutTitle: "Les achats ne sont pas encore disponibles dans cette application",
    checkoutBody: "Votre offre Sajda actuelle s’applique lorsque vous vous connectez avec le même compte. Les achats intégrés, leur restauration et la gestion des abonnements ne sont pas disponibles dans cette version. Contactez l’assistance pour toute question sur un abonnement existant.",
    helpIntro: "Recherchez un domaine précis ou décrivez une idée. La recherche avancée permet de choisir les extensions, les fournisseurs et les critères du nom. Les recherches et les vérifications en temps réel nécessitent une connexion internet.",
    swipeHelp: "Dans Swipe, gardez ou ignorez chaque nom, choisissez les extensions dans les paramètres et retrouvez votre sélection. L’annulation du dernier choix nécessite un accès Premium. Pour enregistrer un nom dans votre compte, connectez-vous et confirmez votre adresse e-mail.",
    tradingHelp: "Trading affiche vos rapports et l’avancement des analyses. Vous choisissez quand lancer ou arrêter une analyse, ou actualiser un prix. Vérifiez les sources, les dates de vérification et les limites de chaque résultat avant de l’utiliser.",
  },
  zh: {
    navigation: "主导航", search: "搜索", swipe: "Swipe", saved: "已保存的域名", savedShort: "已保存", trading: "Trading", account: "账户", more: "更多",
    help: "帮助", marketplace: "交易市场", developers: "开发者工具", membership: "你的方案", history: "搜索历史", domains: "我的域名", today: "今日 10 选",
    privacy: "隐私", terms: "条款", security: "安全", status: "服务状态", support: "联系与支持", signIn: "登录", back: "返回", skip: "跳至内容",
    checkoutTitle: "此应用暂不支持购买",
    checkoutBody: "登录同一账户即可使用现有 Sajda 方案。此版本尚不支持应用内购买、恢复购买和订阅管理。如需处理现有订阅，请联系支持团队。",
    helpIntro: "输入具体域名，或描述你的创意。高级搜索支持选择后缀、服务商和命名条件。搜索和实时检查需要联网。",
    swipeHelp: "在 Swipe 中，你可以保留或跳过每个名称、在设置中选择后缀，以及回顾已选名称。撤销上一次选择需要 Premium 权限。要将名称保存到账户，请先登录并验证电子邮箱。",
    tradingHelp: "Trading 显示你的报告和研究进度。你可以主动开始或停止研究，也可以更新价格。使用任何结果前，请检查其来源、检查时间和局限性。",
  },
};
