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
  plannedContents: string;
  founderTitle: string;
  founderDescription: string;
  specialistTitle: string;
  specialistDescription: string;
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
  eyebrow: "Ett konto, från första idén till namnvalet.",
  title: "Hitta rätt namn för det du bygger.",
  lead: "Börja gratis med namnförslag, registerstatus och prisjämförelse. Trading är för specialister, inte ett krav för att hitta bra namn.",
  noticeTitle: "Priserna är satta. Betalda abonnemang är inte öppna ännu.",
  notice: "Betalpaketen visar planerad inriktning, inte ett köpklart erbjudande. Att skapa ett konto aktiverar inte en betalnivå. Tilldelad teståtkomst gäller på samma konto; inga pengar tas emot här.",
  contents: "Det här kan du göra nu",
  plannedContents: "Planerad inriktning · inte allt är lanserat",
  founderTitle: "Hitta namnet till ditt nästa projekt",
  founderDescription: "Börja med Gratis. De kommande betalpaketen är tänkta att ge mer utrymme att arbeta vidare, inte låsa dina sparade namn.",
  specialistTitle: "Undersöker du domäner som investering?",
  specialistDescription: "Trading är en separat researchyta för specialister. Samma Sajda-konto, inget extra inloggningsflöde.",
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
    free: { name: "Gratis", audience: "För första idén och dina favoriter", description: "Få namnförslag, kontrollera kandidater och spara dem du vill återkomma till.", points: ["Prova domänsökningen", "Se registerstatus", "Jämför tillgängliga prisunderlag", "Spara domäner med verifierat konto"] },
    basic: { name: "Bas", audience: "För en intensiv namnperiod", description: "Tänkt för dig som vill arbeta vidare från idé till ett fåtal bra finalister.", points: ["Allt i Gratis", "Mer utrymme att söka och förfina", "Jämför kandidater och domänändelser", "Bläddra bland korta domäner med Swipe"] },
    premium: { name: "Premium", audience: "För founders och små byråer", description: "Tänkt för dig som namnger nya produkter eller kundprojekt regelbundet.", points: ["Allt i Bas", "Ångra senaste svepet, ett steg", "Högre sökgränser för återkommande arbete", "Fördjupad granskning av kandidater"] },
    trading: { name: "Trading", audience: "För domänspecialister", description: "Undersök Lost Domains och fatta mer underbyggda beslut, med samma konto och inloggning.", points: ["Allt i Premium, inklusive ångra i Swipe", "Lost Domains-arbetsyta", "Källor och kontrollhistorik", "Riskbedömda kandidater för egen granskning"] },
  },
};

const en: PricingCopy = {
  back: "Back to search",
  eyebrow: "One account, from first idea to final choice.",
  title: "Find the right name for what you’re building.",
  lead: "Start free with name ideas, registry checks and price comparison. Trading is for specialists, not a requirement for finding good names.",
  noticeTitle: "Plan prices are set. Subscriptions are not available yet.",
  notice: "Paid plans describe the intended product, not an offer you can buy today. Creating an account does not activate a paid plan. Assigned test access uses the same account; no payment is collected here.",
  contents: "What you can do now",
  plannedContents: "Planned focus · not all features are live",
  founderTitle: "Name your next project",
  founderDescription: "Start with Free. The upcoming paid plans are intended to give you more room to work, not put your saved names behind a paywall.",
  specialistTitle: "Researching domains as an investment?",
  specialistDescription: "Trading is a separate research workspace for specialists. The same Sajda account, with no extra login.",
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
    free: { name: "Free", audience: "For your first idea and favorites", description: "Get name ideas, check candidates and save the ones worth coming back to.", points: ["Try domain search", "See registry status", "Compare available price evidence", "Save domains with a verified account"] },
    basic: { name: "Basic", audience: "For a focused naming sprint", description: "Designed to help you move from an idea to a few strong finalists.", points: ["Everything in Free", "More room to search and refine", "Compare candidates and domain endings", "Browse short domains with Swipe"] },
    premium: { name: "Premium", audience: "For founders and small agencies", description: "Designed for naming new products or client projects regularly.", points: ["Everything in Basic", "Undo your last swipe, one step", "Higher search limits for repeat work", "Deeper candidate review"] },
    trading: { name: "Trading", audience: "For domain specialists", description: "Investigate Lost Domains and make better-informed decisions with the same account and login.", points: ["Everything in Premium, including swipe undo", "Lost Domains workspace", "Sources and check history", "Risk-assessed candidates for your review"] },
  },
};

const es: PricingCopy = {
  back: "Volver a la búsqueda", eyebrow: "Una cuenta, desde la primera idea hasta la elección final.",
  title: "Encuentra el nombre adecuado para tu proyecto.",
  lead: "Empieza gratis con ideas de nombres, consultas al registro y comparación de precios. Trading es para especialistas; no lo necesitas para encontrar buenos nombres.",
  noticeTitle: "Los precios están definidos. Las suscripciones aún no están disponibles.",
  notice: "Los planes de pago describen el producto previsto, no una oferta que puedas comprar hoy. Crear una cuenta no activa un plan de pago. El acceso de prueba usa la misma cuenta; aquí no se cobra nada.",
  contents: "Lo que puedes hacer ahora",
  plannedContents: "Enfoque previsto · no todo está disponible",
  founderTitle: "Encuentra el nombre de tu próximo proyecto",
  founderDescription: "Empieza con Gratis. Los próximos planes de pago están pensados para darte más capacidad de trabajo, no para cobrarte por acceder a tus nombres guardados.",
  specialistTitle: "¿Investigas dominios como inversión?",
  specialistDescription: "Trading es un espacio de investigación para especialistas. Usa tu misma cuenta de Sajda, sin otro inicio de sesión.",
  trySearch: "Probar la búsqueda", unavailable: "Aún no disponible para comprar", exploreTrading: "Explorar Trading", openTrading: "Abrir Trading",
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
    free: { name: "Gratis", audience: "Para tu primera idea y tus favoritos", description: "Consigue ideas, comprueba candidatos y guarda los que quieras revisar después.", points: ["Probar la búsqueda de dominios", "Consultar el estado en el registro", "Comparar los datos de precios disponibles", "Guardar dominios con una cuenta verificada"] },
    basic: { name: "Básico", audience: "Para una búsqueda de nombre intensiva", description: "Pensado para pasar de una idea a unos pocos finalistas sólidos.", points: ["Todo lo incluido en Gratis", "Más capacidad para buscar y afinar", "Comparar candidatos y extensiones", "Explorar dominios cortos con Swipe"] },
    premium: { name: "Premium", audience: "Para fundadores y pequeñas agencias", description: "Pensado para quienes buscan nombres para productos o proyectos de clientes con frecuencia.", points: ["Todo lo incluido en Básico", "Deshacer el último deslizamiento, un paso", "Límites de búsqueda más altos para uso frecuente", "Análisis más profundo de los candidatos"] },
    trading: { name: "Trading", audience: "Para especialistas en dominios", description: "Investiga Lost Domains y toma decisiones mejor fundamentadas con la misma cuenta.", points: ["Todo lo incluido en Premium, incluida la opción de deshacer en Swipe", "Espacio de trabajo de Lost Domains", "Fuentes e historial de comprobaciones", "Candidatos con análisis de riesgos para tu revisión"] },
  },
};

const fr: PricingCopy = {
  back: "Retour à la recherche", eyebrow: "Un compte, de la première idée au choix final.",
  title: "Trouvez le bon nom pour votre projet.",
  lead: "Commencez gratuitement : idées de noms, vérification dans le registre et comparaison des prix. Trading s’adresse aux spécialistes ; il n’est pas nécessaire pour trouver de bons noms.",
  noticeTitle: "Les tarifs sont définis. Les abonnements ne sont pas encore disponibles.",
  notice: "Les offres payantes décrivent le produit prévu, pas une offre que vous pouvez acheter aujourd’hui. Créer un compte n’active aucune offre payante. L’accès de test utilise le même compte ; aucun paiement n’est demandé ici.",
  contents: "Ce que vous pouvez faire maintenant",
  plannedContents: "Usage prévu · tout n’est pas encore disponible",
  founderTitle: "Trouvez le nom de votre prochain projet",
  founderDescription: "Commencez avec Gratuit. Les futures offres payantes doivent vous donner plus de possibilités, pas rendre vos noms enregistrés payants.",
  specialistTitle: "Vous étudiez les domaines comme investissement ?",
  specialistDescription: "Trading est un espace de recherche pour les spécialistes. Votre compte Sajda reste le même, sans connexion supplémentaire.",
  trySearch: "Essayer la recherche", unavailable: "Pas encore disponible à l’achat", exploreTrading: "Découvrir Trading", openTrading: "Ouvrir Trading",
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
    free: { name: "Gratuit", audience: "Pour votre première idée et vos favoris", description: "Trouvez des idées, vérifiez les domaines et enregistrez ceux que vous voulez revoir.", points: ["Essayer la recherche de domaines", "Consulter le statut dans le registre", "Comparer les données de prix disponibles", "Enregistrer des domaines avec un compte vérifié"] },
    basic: { name: "Basique", audience: "Pour une recherche de nom intensive", description: "Prévu pour passer d’une idée à quelques finalistes convaincants.", points: ["Tout ce qui est inclus dans Gratuit", "Plus de possibilités pour chercher et affiner", "Comparer les candidats et les extensions", "Parcourir des domaines courts avec Swipe"] },
    premium: { name: "Premium", audience: "Pour les fondateurs et petites agences", description: "Prévu pour nommer régulièrement des produits ou des projets clients.", points: ["Tout ce qui est inclus dans Basique", "Annuler le dernier balayage, un seul retour", "Limites de recherche plus élevées pour un usage régulier", "Analyse approfondie des candidats"] },
    trading: { name: "Trading", audience: "Pour les spécialistes des domaines", description: "Explorez Lost Domains et prenez des décisions mieux étayées avec le même compte.", points: ["Tout ce qui est inclus dans Premium, dont l’annulation dans Swipe", "Espace de travail Lost Domains", "Sources et historique des vérifications", "Candidats avec analyse des risques à examiner"] },
  },
};

const zh: PricingCopy = {
  back: "返回搜索", eyebrow: "一个账户，从最初的想法到最终的选择。", title: "为你的项目找到合适的名字。",
  lead: "免费获取命名建议、查看注册状态并比较价格。Trading 面向专业用户，寻找好名字不需要开通 Trading。",
  noticeTitle: "价格已确定，订阅暂未开放。",
  notice: "付费方案介绍的是规划中的产品，目前还不能购买。创建账户不会开通付费方案。测试权限使用同一账户，此页面不会收取费用。",
  contents: "现在可以做什么",
  plannedContents: "规划中的功能 · 尚未全部上线",
  founderTitle: "为下一个项目找到名字",
  founderDescription: "从免费方案开始。未来的付费方案旨在提供更多使用空间，不会要求你付费才能访问已保存的名字。",
  specialistTitle: "想把域名作为投资对象来研究？",
  specialistDescription: "Trading 是面向专业用户的独立研究工作区。使用同一个 Sajda 账户，无需另行登录。",
  trySearch: "试用搜索", unavailable: "暂未开放购买", exploreTrading: "了解 Trading", openTrading: "打开 Trading",
  currentLevel: "你的当前级别", included: "已包含在当前级别中", account: "我的账户与权限", signIn: "登录 Sajda 账户", checkingAccess: "正在检查当前级别…",
  unknownAccess: "无法确认你的当前级别，请前往账户页面检查权限。", assignedAccess: "已授予的权限 · 非付费订阅",
  hierarchy: "各级别逐级包含：Trading 包含 Premium，Premium 包含基础方案，基础方案包含免费方案。这仅适用于已上线的功能，计划中的功能不会自动开放。",
  currentTitle: "目前可用", current: "试用域名搜索、查看注册状态，并比较我们能够验证的价格信息。登录并验证邮箱后，无需订阅即可保存域名。",
  monitoringTitle: "监控功能正在开发中",
  monitoring: "基础方案计划提供简单监控，Premium 提供更深入的监控，Trading 提供候选域名的优先跟进。目前尚未启用自动检查和提醒。已保存的域名保留的是保存时的数据，并不会受到持续监控。",
  terms: "所有价格均为每月美元价格。在未来购买前，我们会明确显示使用限额、条款、适用税费和最终金额。向服务商购买域名的费用不包含在订阅价格中。",
  risk: "Trading 提供研究依据，不保证域名价值、可用性或投资回报。购买和最终检查应在你选择的域名服务商处完成。",
  plans: {
    free: { name: "免费", audience: "适合最初的想法与收藏", description: "获取命名建议、检查候选域名，并保存值得再次考虑的选项。", points: ["试用域名搜索", "查看注册状态", "比较现有价格信息", "通过已验证的账户保存域名"] },
    basic: { name: "基础", audience: "适合集中寻找名字的阶段", description: "计划帮助你从一个想法筛选出几个有潜力的最终候选。", points: ["免费方案的全部功能", "更多搜索和优化空间", "比较候选域名及其后缀", "通过 Swipe 浏览短域名"] },
    premium: { name: "Premium", audience: "面向创始人与小型工作室", description: "面向经常为新产品或客户项目寻找名字的用户。", points: ["基础方案的全部功能", "撤销上一次滑动，仅限一步", "更高的搜索限额，适合反复使用", "更深入的候选域名分析"] },
    trading: { name: "Trading", audience: "面向域名专业人士", description: "使用同一账户研究 Lost Domains，为决策获取更充分的依据。", points: ["Premium 的全部功能，包括撤销滑动", "Lost Domains 工作区", "来源与检查历史", "附带风险分析的候选域名，供你审阅"] },
  },
};

export function getPricingCopy(language: string): PricingCopy {
  return ({ en, sv, es, fr, zh } as Record<string, PricingCopy>)[language] ?? en;
}
