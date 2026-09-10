import type { PlanId } from "../../shared/plans";

type PlanCopy = {
  name: string;
  audience: string;
  description: string;
  points: string[];
};

export type PricingCopy = {
  back: string;
  eyebrow: string;
  title: string;
  lead: string;
  noticeTitle: string;
  notice: string;
  contents: string;
  trySearch: string;
  unavailable: string;
  exploreTrading: string;
  openTrading: string;
  currentLevel: string;
  included: string;
  account: string;
  signIn: string;
  checkingAccess: string;
  unknownAccess: string;
  assignedAccess: string;
  hierarchy: string;
  currentTitle: string;
  current: string;
  monitoringTitle: string;
  monitoring: string;
  terms: string;
  risk: string;
  plans: Record<PlanId, PlanCopy>;
};

const sv: PricingCopy = {
  back: "Tillbaka till sökningen",
  eyebrow: "Ett Sajda-konto. Fyra åtkomstnivåer.",
  title: "Från första idén till professionell domänanalys.",
  lead: "Prova gratis och använd samma inloggning hela vägen. Bas passar ett mindre projekt, Premium återkommande sökningar och Trading den som arbetar professionellt med domäner.",
  noticeTitle: "Priserna är satta. Betalda abonnemang är inte öppna ännu.",
  notice: "Här ser du nivåernas inriktning inför abonnemangsstart. Att skapa ett konto aktiverar inte en betalnivå, och ingen betalning tas emot här. Tilldelad teståtkomst visas på ditt befintliga konto och är inte ett köpt abonnemang.",
  contents: "Inriktning",
  trySearch: "Prova sökningen",
  unavailable: "Inte öppet för köp ännu",
  exploreTrading: "Utforska Trading",
  openTrading: "Öppna Trading",
  currentLevel: "Din aktuella nivå",
  included: "Ingår i din nivå",
  account: "Mitt konto och min åtkomst",
  signIn: "Logga in på ditt Sajda-konto",
  checkingAccess: "Kontrollerar din aktuella nivå…",
  unknownAccess: "Din aktuella nivå kunde inte bekräftas. Kontrollera åtkomsten på ditt konto.",
  assignedAccess: "Tilldelad åtkomst · inget betalt abonnemang",
  hierarchy: "Nivåerna bygger på varandra: Trading inkluderar Premium, Premium inkluderar Bas och Bas inkluderar Gratis. Detta gäller lanserade funktioner; planerade funktioner är inte automatiskt tillgängliga.",
  currentTitle: "Tillgängligt idag",
  current: "Prova domänsökningen, se registerstatus och jämför de prisuppgifter vi kan verifiera. Med verifierad inloggning kan du spara domäner redan nu, utan abonnemang.",
  monitoringTitle: "Bevakning byggs ut",
  monitoring: "Bas är tänkt för enkel bevakning, Premium för mer avancerad bevakning och Trading för prioriterad uppföljning av domänkandidater. Automatiska kontroller och aviseringar är inte aktiva idag. Sparade domäner är sparade ögonblicksbilder, inte löpande bevakningar.",
  terms: "Alla priser är i USD per månad. Före ett framtida köp ska användningsgränser, villkor, eventuell skatt och slutbelopp visas tydligt. Domänköp hos leverantörer ingår inte i abonnemangspriset.",
  risk: "Trading ger analysunderlag, inte en garanti för värde, tillgänglighet eller avkastning. Köp och slutlig kontroll görs hos vald domänleverantör.",
  plans: {
    free: { name: "Gratis", audience: "För att komma igång", description: "Testa en idé och förstå vad Sajda kan hjälpa dig med.", points: ["Prova domänsökningen", "Se registerstatus", "Jämför tillgängliga prisunderlag"] },
    basic: { name: "Bas", audience: "För ditt nästa projekt", description: "För dig som letar efter en domän då och då och vill hålla ordning på kandidaterna.", points: ["Allt i Gratis", "Spara och jämför domäner", "Arbeta med ett mindre projekt", "Begränsad användning av Swipe"] },
    premium: { name: "Premium", audience: "För återkommande sökningar", description: "För dig som utvecklar fler idéer och behöver mer utrymme att söka och jämföra.", points: ["Allt i Bas", "Ångra senaste svepet, ett steg", "Högre sök- och projektgränser", "Fördjupad granskning av kandidater"] },
    trading: { name: "Trading", audience: "För domänspecialister", description: "Undersök Lost Domains och fatta mer underbyggda beslut, med samma konto och inloggning.", points: ["Allt i Premium, inklusive ångra i Swipe", "Lost Domains-arbetsyta", "Källor och kontrollhistorik", "Riskbedömda kandidater för egen granskning"] },
  },
};

const en: PricingCopy = {
  back: "Back to search",
  eyebrow: "One Sajda account. Four access levels.",
  title: "From your first idea to professional domain research.",
  lead: "Try it free and keep the same login throughout. Basic suits a smaller project, Premium supports regular searches, and Trading is for domain professionals.",
  noticeTitle: "Plan prices are set. Subscriptions are not available yet.",
  notice: "These plans show what each level is designed for before subscriptions launch. Creating an account does not activate a paid plan, and no payment is collected here. Any test access granted by Sajda appears on your existing account and is not a paid subscription.",
  contents: "Focus",
  trySearch: "Try search",
  unavailable: "Not available to buy yet",
  exploreTrading: "Explore Trading",
  openTrading: "Open Trading",
  currentLevel: "Your current level",
  included: "Included in your level",
  account: "My account and access",
  signIn: "Sign in to your Sajda account",
  checkingAccess: "Checking your current level…",
  unknownAccess: "Your current level could not be confirmed. Check access on your account.",
  assignedAccess: "Assigned access · not a paid subscription",
  hierarchy: "Levels build on one another: Trading includes Premium, Premium includes Basic, and Basic includes Free. This applies to released features; planned features are not automatically available.",
  currentTitle: "Available today",
  current: "Try domain search, see registry status and compare the price information we can verify. Sign in and confirm your email to save domains without a subscription.",
  monitoringTitle: "Monitoring is being developed",
  monitoring: "Basic is intended for simple monitoring, Premium for more advanced monitoring, and Trading for prioritized follow-up of domain candidates. Automatic checks and alerts are not active today. Saved domains are snapshots, not ongoing monitoring.",
  terms: "All prices are in USD per month. Usage limits, terms, any applicable tax and the final total must be shown clearly before a future purchase. Domain purchases from providers are not included in the subscription price.",
  risk: "Trading provides research, not a guarantee of value, availability or returns. Purchases and final checks take place with your chosen domain provider.",
  plans: {
    free: { name: "Free", audience: "To get started", description: "Try an idea and discover how Sajda can help.", points: ["Try domain search", "See registry status", "Compare available price evidence"] },
    basic: { name: "Basic", audience: "For your next project", description: "For occasional domain searches when you want to keep your candidates organized.", points: ["Everything in Free", "Save and compare domains", "Work on a smaller project", "Limited swiping"] },
    premium: { name: "Premium", audience: "For regular searches", description: "For developing more ideas with more room to search and compare.", points: ["Everything in Basic", "Undo your last swipe, one step", "Higher search and project limits", "Deeper candidate review"] },
    trading: { name: "Trading", audience: "For domain specialists", description: "Investigate Lost Domains and make better-informed decisions with the same account and login.", points: ["Everything in Premium, including swipe undo", "Lost Domains workspace", "Sources and check history", "Risk-assessed candidates for your review"] },
  },
};

const es: PricingCopy = {
  back: "Volver a la búsqueda", eyebrow: "Una cuenta de Sajda. Cuatro niveles de acceso.",
  title: "De tu primera idea al análisis profesional de dominios.",
  lead: "Prueba Sajda gratis y usa siempre la misma cuenta. Básico está pensado para un proyecto pequeño, Premium para búsquedas frecuentes y Trading para profesionales del sector.",
  noticeTitle: "Los precios están definidos. Las suscripciones aún no están disponibles.",
  notice: "Estos planes muestran para qué está pensado cada nivel antes del lanzamiento de las suscripciones. Crear una cuenta no activa un plan de pago y aquí no se cobra nada. El acceso de prueba que te conceda Sajda aparecerá en tu cuenta actual y no será una suscripción de pago.",
  contents: "Enfoque", trySearch: "Probar la búsqueda", unavailable: "Aún no disponible para comprar", exploreTrading: "Explorar Trading", openTrading: "Abrir Trading",
  currentLevel: "Tu nivel actual", included: "Incluido en tu nivel", account: "Mi cuenta y mi acceso", signIn: "Iniciar sesión en Sajda",
  checkingAccess: "Comprobando tu nivel actual…", unknownAccess: "No pudimos confirmar tu nivel actual. Comprueba el acceso desde tu cuenta.",
  assignedAccess: "Acceso concedido · no es una suscripción de pago",
  hierarchy: "Cada nivel incluye el anterior: Trading incluye Premium, Premium incluye Básico y Básico incluye Gratis. Esto se aplica a las funciones ya disponibles; las funciones previstas no se activan automáticamente.",
  currentTitle: "Disponible hoy", current: "Prueba la búsqueda de dominios, consulta su estado en el registro y compara los precios que podemos verificar. Inicia sesión y confirma tu correo para guardar dominios sin suscripción.",
  monitoringTitle: "El seguimiento está en desarrollo",
  monitoring: "Básico está pensado para seguimiento sencillo, Premium para seguimiento avanzado y Trading para seguimiento prioritario de dominios candidatos. Las comprobaciones y alertas automáticas aún no están activas. Los dominios guardados conservan los datos de ese momento; no se supervisan de forma continua.",
  terms: "Todos los precios son en USD al mes. Antes de cualquier compra futura se mostrarán claramente los límites de uso, las condiciones, los impuestos aplicables y el importe final. La compra de dominios a proveedores no está incluida en la suscripción.",
  risk: "Trading ofrece información para tu análisis, no garantiza valor, disponibilidad ni rentabilidad. La compra y la comprobación final se realizan con el proveedor de dominios que elijas.",
  plans: {
    free: { name: "Gratis", audience: "Para empezar", description: "Prueba una idea y descubre cómo puede ayudarte Sajda.", points: ["Probar la búsqueda de dominios", "Consultar el estado en el registro", "Comparar los datos de precios disponibles"] },
    basic: { name: "Básico", audience: "Para tu próximo proyecto", description: "Para buscar dominios de vez en cuando y mantener organizada tu selección.", points: ["Todo lo incluido en Gratis", "Guardar y comparar dominios", "Trabajar en un proyecto pequeño", "Uso limitado de Swipe"] },
    premium: { name: "Premium", audience: "Para búsquedas frecuentes", description: "Para desarrollar más ideas con mayor capacidad para buscar y comparar.", points: ["Todo lo incluido en Básico", "Deshacer el último deslizamiento, un paso", "Límites de búsqueda y proyectos más altos", "Análisis más profundo de los candidatos"] },
    trading: { name: "Trading", audience: "Para especialistas en dominios", description: "Investiga Lost Domains y toma decisiones mejor fundamentadas con la misma cuenta.", points: ["Todo lo incluido en Premium, incluida la opción de deshacer en Swipe", "Espacio de trabajo de Lost Domains", "Fuentes e historial de comprobaciones", "Candidatos con análisis de riesgos para tu revisión"] },
  },
};

const fr: PricingCopy = {
  back: "Retour à la recherche", eyebrow: "Un compte Sajda. Quatre niveaux d’accès.",
  title: "De votre première idée à l’analyse professionnelle de domaines.",
  lead: "Essayez Sajda gratuitement et conservez le même compte. Basique convient à un petit projet, Premium aux recherches régulières et Trading aux professionnels des domaines.",
  noticeTitle: "Les tarifs sont définis. Les abonnements ne sont pas encore disponibles.",
  notice: "Ces offres présentent l’usage prévu pour chaque niveau avant le lancement des abonnements. Créer un compte n’active aucune offre payante et aucun paiement n’est demandé ici. Tout accès de test accordé par Sajda apparaît sur votre compte actuel et ne constitue pas un abonnement payant.",
  contents: "Usage prévu", trySearch: "Essayer la recherche", unavailable: "Pas encore disponible à l’achat", exploreTrading: "Découvrir Trading", openTrading: "Ouvrir Trading",
  currentLevel: "Votre niveau actuel", included: "Inclus dans votre niveau", account: "Mon compte et mes accès", signIn: "Se connecter à Sajda",
  checkingAccess: "Vérification de votre niveau actuel…", unknownAccess: "Nous n’avons pas pu confirmer votre niveau actuel. Vérifiez vos accès depuis votre compte.",
  assignedAccess: "Accès accordé · sans abonnement payant",
  hierarchy: "Chaque niveau inclut le précédent : Trading inclut Premium, Premium inclut Basique et Basique inclut Gratuit. Cela concerne les fonctions déjà disponibles ; les fonctions prévues ne sont pas automatiquement accessibles.",
  currentTitle: "Disponible aujourd’hui", current: "Essayez la recherche de domaines, consultez leur statut dans le registre et comparez les prix que nous pouvons vérifier. Connectez-vous et confirmez votre adresse e-mail pour enregistrer des domaines sans abonnement.",
  monitoringTitle: "La surveillance est en cours de développement",
  monitoring: "Basique est prévu pour une surveillance simple, Premium pour une surveillance avancée et Trading pour un suivi prioritaire des domaines candidats. Les vérifications et alertes automatiques ne sont pas encore actives. Les domaines enregistrés conservent les données au moment de l’enregistrement ; ils ne font pas l’objet d’une surveillance continue.",
  terms: "Tous les tarifs sont en USD par mois. Avant tout achat futur, les limites d’utilisation, les conditions, les taxes éventuelles et le montant final seront clairement affichés. L’achat de domaines auprès de fournisseurs n’est pas inclus dans l’abonnement.",
  risk: "Trading fournit des éléments d’analyse, sans garantir la valeur, la disponibilité ni le rendement d’un domaine. L’achat et la vérification finale se font auprès du fournisseur que vous choisissez.",
  plans: {
    free: { name: "Gratuit", audience: "Pour commencer", description: "Testez une idée et découvrez comment Sajda peut vous aider.", points: ["Essayer la recherche de domaines", "Consulter le statut dans le registre", "Comparer les données de prix disponibles"] },
    basic: { name: "Basique", audience: "Pour votre prochain projet", description: "Pour rechercher des domaines occasionnellement et organiser votre sélection.", points: ["Tout ce qui est inclus dans Gratuit", "Enregistrer et comparer des domaines", "Travailler sur un petit projet", "Utilisation limitée de Swipe"] },
    premium: { name: "Premium", audience: "Pour des recherches régulières", description: "Pour développer davantage d’idées avec plus de possibilités de recherche et de comparaison.", points: ["Tout ce qui est inclus dans Basique", "Annuler le dernier balayage, un seul retour", "Limites de recherche et de projets plus élevées", "Analyse approfondie des candidats"] },
    trading: { name: "Trading", audience: "Pour les spécialistes des domaines", description: "Explorez Lost Domains et prenez des décisions mieux étayées avec le même compte.", points: ["Tout ce qui est inclus dans Premium, dont l’annulation dans Swipe", "Espace de travail Lost Domains", "Sources et historique des vérifications", "Candidats avec analyse des risques à examiner"] },
  },
};

const zh: PricingCopy = {
  back: "返回搜索", eyebrow: "一个 Sajda 账户，四种访问级别。", title: "从最初的创意到专业域名研究。",
  lead: "免费试用，始终使用同一个账户。基础方案适合小型项目，Premium 适合经常搜索的用户，Trading 面向域名专业人士。",
  noticeTitle: "价格已确定，订阅暂未开放。",
  notice: "以下内容介绍各方案在订阅上线前的定位。创建账户不会开通付费方案，此页面也不会收取费用。Sajda 授予的测试权限会显示在你的现有账户中，但不属于付费订阅。",
  contents: "适用场景", trySearch: "试用搜索", unavailable: "暂未开放购买", exploreTrading: "了解 Trading", openTrading: "打开 Trading",
  currentLevel: "你的当前级别", included: "已包含在当前级别中", account: "我的账户与权限", signIn: "登录 Sajda 账户", checkingAccess: "正在检查当前级别…",
  unknownAccess: "无法确认你的当前级别，请前往账户页面检查权限。", assignedAccess: "已授予的权限 · 非付费订阅",
  hierarchy: "各级别逐级包含：Trading 包含 Premium，Premium 包含基础方案，基础方案包含免费方案。这仅适用于已上线的功能，计划中的功能不会自动开放。",
  currentTitle: "目前可用", current: "试用域名搜索、查看注册状态，并比较我们能够验证的价格信息。登录并验证邮箱后，无需订阅即可保存域名。",
  monitoringTitle: "监控功能正在开发中",
  monitoring: "基础方案计划提供简单监控，Premium 提供更深入的监控，Trading 提供候选域名的优先跟进。目前尚未启用自动检查和提醒。已保存的域名保留的是保存时的数据，并不会受到持续监控。",
  terms: "所有价格均为每月美元价格。在未来购买前，我们会明确显示使用限额、条款、适用税费和最终金额。向服务商购买域名的费用不包含在订阅价格中。",
  risk: "Trading 提供研究依据，不保证域名价值、可用性或投资回报。购买和最终检查应在你选择的域名服务商处完成。",
  plans: {
    free: { name: "免费", audience: "适合初次尝试", description: "尝试一个创意，了解 Sajda 能为你做什么。", points: ["试用域名搜索", "查看注册状态", "比较现有价格信息"] },
    basic: { name: "基础", audience: "适合下一个项目", description: "适合偶尔搜索域名，并希望整理候选清单的用户。", points: ["免费方案的全部功能", "保存并比较域名", "处理一个小型项目", "有限次数的 Swipe 使用"] },
    premium: { name: "Premium", audience: "适合经常搜索的用户", description: "提供更多搜索和比较空间，帮助你探索更多创意。", points: ["基础方案的全部功能", "撤销上一次滑动，仅限一步", "更高的搜索和项目限额", "更深入的候选域名分析"] },
    trading: { name: "Trading", audience: "面向域名专业人士", description: "使用同一账户研究 Lost Domains，为决策获取更充分的依据。", points: ["Premium 的全部功能，包括撤销滑动", "Lost Domains 工作区", "来源与检查历史", "附带风险分析的候选域名，供你审阅"] },
  },
};

export function getPricingCopy(language: string): PricingCopy {
  return ({ en, sv, es, fr, zh } as Record<string, PricingCopy>)[language] ?? en;
}
