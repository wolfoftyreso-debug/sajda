import { Link, useLocation } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { hasSupabaseBrowserConfig } from "@/integrations/supabase/client";
import { isAccountAuthConfigured } from "@/integrations/neon/auth";
import { isLocalTestMode } from "@/lib/localTestMode";
import { useLanguage, type Language } from "@/i18n/LanguageProvider";
import { accountNavigationCopy } from "@/i18n/accountNavigationCopy";

type FooterCopy = {
  label: string;
  title: string;
  body: string;
  live: string;
  product: string;
  developer: string;
  company: string;
  legalTrust: string;
  search: string;
  searchHint: string;
  swipe: string;
  swipeHint: string;
  marketplace: string;
  marketplaceHint: string;
  today: string;
  watchlist: string;
  history: string;
  domains: string;
  signIn: string;
  signInHint: string;
  developerPortal: string;
  publicApi: string;
  apiReference: string;
  signals: string;
  apiAccess: string;
  story: string;
  howItWorks: string;
  contact: string;
  privacy: string;
  privacyHint: string;
  terms: string;
  termsHint: string;
  cookies: string;
  cookiesHint: string;
  accessibility: string;
  accessibilityHint: string;
  security: string;
  securityHint: string;
  status: string;
  statusHint: string;
  madeFor: string;
  apiDescription: string;
  sourcesDescription: string;
};

const footerCopy: Record<Language, FooterCopy> = {
  en: {
    label: "Sajda site footer",
    title: "Find the name worth a second look.",
    body: "Discover strong options, check their status, compare the path to purchase, and keep the best ones close.",
    live: "Search, Swipe, marketplace and developer tools",
    product: "Product",
    developer: "Developers",
    company: "Company & trust",
    legalTrust: "Legal & trust",
    search: "Domain search",
    searchHint: "Generate and verify names",
    swipe: "Swipe",
    swipeHint: "Browse short checked names",
    marketplace: "Marketplace",
    marketplaceHint: "List a domain or explore offers",
    today: "Today’s 10",
    watchlist: "Watchlist",
    history: "Search history",
    domains: "My domains",
    signIn: "Sign in",
    signInHint: "Save searches and domain lists",
    developerPortal: "Developer portal",
    publicApi: "Public domain-search API",
    apiReference: "OpenAPI reference",
    signals: "Market signals (JSON)",
    apiAccess: "API access",
    story: "The Sajda story",
    howItWorks: "How Sajda works",
    contact: "Contact & support",
    privacy: "Privacy",
    privacyHint: "How Sajda handles personal data",
    terms: "Terms of use",
    termsHint: "Terms for using Sajda",
    cookies: "Cookies & storage",
    cookiesHint: "How Sajda uses local storage",
    accessibility: "Accessibility",
    accessibilityHint: "Our accessibility commitment",
    security: "Security",
    securityHint: "Security practices and reporting",
    status: "System status",
    statusHint: "Current service availability",
    madeFor: "Find the name of your future empire.",
    apiDescription: "Read the current API contract",
    sourcesDescription: "Inspect source-labelled market facts",
  },
  sv: {
    label: "Sajdas webbplatsfot",
    title: "Hitta namnet som är värt en andra titt.",
    body: "Upptäck starka alternativ, kontrollera status, jämför vägen till köp och spara de bästa nära till hands.",
    live: "Sök, Swajp, marknadsplats och utvecklarverktyg",
    product: "Produkt",
    developer: "Utvecklare",
    company: "Företag & förtroende",
    legalTrust: "Juridik & förtroende",
    search: "Domänsökning",
    searchHint: "Skapa och verifiera namn",
    swipe: "Swajp",
    swipeHint: "Bläddra bland korta kontrollerade namn",
    marketplace: "Marknadsplats",
    marketplaceHint: "Lägg ut en domän eller utforska objekt",
    today: "Dagens 10",
    watchlist: "Bevakningslista",
    history: "Sökhistorik",
    domains: "Mina domäner",
    signIn: "Logga in",
    signInHint: "Spara sökningar och domänlistor",
    developerPortal: "Utvecklarportal",
    publicApi: "Publikt domänsöknings-API",
    apiReference: "OpenAPI-referens",
    signals: "Marknadssignaler (JSON)",
    apiAccess: "API-åtkomst",
    story: "Berättelsen om Sajda",
    howItWorks: "Så fungerar Sajda",
    contact: "Kontakt & support",
    privacy: "Integritet",
    privacyHint: "Så hanterar Sajda personuppgifter",
    terms: "Användarvillkor",
    termsHint: "Villkor för att använda Sajda",
    cookies: "Cookies & lagring",
    cookiesHint: "Så använder Sajda lokal lagring",
    accessibility: "Tillgänglighet",
    accessibilityHint: "Vårt tillgänglighetsarbete",
    security: "Säkerhet",
    securityHint: "Säkerhetsarbete och rapportering",
    status: "Systemstatus",
    statusHint: "Aktuell driftsstatus",
    madeFor: "Hitta namnet på ditt framtida imperium.",
    apiDescription: "Läs det aktuella API-kontraktet",
    sourcesDescription: "Granska källmärkta marknadsfakta",
  },
  es: {
    label: "Pie de página de Sajda",
    title: "Encuentra el nombre que merece una segunda mirada.",
    body: "Descubre opciones sólidas, comprueba su estado, compara el camino de compra y guarda las mejores cerca.",
    live: "Búsqueda, Swipe, marketplace y herramientas para desarrolladores",
    product: "Producto",
    developer: "Desarrolladores",
    company: "Empresa y confianza",
    legalTrust: "Legal y confianza",
    search: "Búsqueda de dominios",
    searchHint: "Genera y verifica nombres",
    swipe: "Deslizar",
    swipeHint: "Explora nombres cortos comprobados",
    marketplace: "Marketplace",
    marketplaceHint: "Publica un dominio o explora ofertas",
    today: "Los 10 de hoy",
    watchlist: "Lista de seguimiento",
    history: "Historial de búsquedas",
    domains: "Mis dominios",
    signIn: "Iniciar sesión",
    signInHint: "Guarda búsquedas y listas de dominios",
    developerPortal: "Portal para desarrolladores",
    publicApi: "API pública de búsqueda de dominios",
    apiReference: "Referencia OpenAPI",
    signals: "Señales de mercado (JSON)",
    apiAccess: "Acceso a API",
    story: "La historia de Sajda",
    howItWorks: "Cómo funciona Sajda",
    contact: "Contacto y soporte",
    privacy: "Privacidad",
    privacyHint: "Cómo gestiona Sajda los datos personales",
    terms: "Términos de uso",
    termsHint: "Términos para usar Sajda",
    cookies: "Cookies y almacenamiento",
    cookiesHint: "Cómo usa Sajda el almacenamiento local",
    accessibility: "Accesibilidad",
    accessibilityHint: "Nuestro compromiso de accesibilidad",
    security: "Seguridad",
    securityHint: "Prácticas y avisos de seguridad",
    status: "Estado del sistema",
    statusHint: "Disponibilidad actual del servicio",
    madeFor: "Encuentra el nombre de tu futuro imperio.",
    apiDescription: "Consulta el contrato de API actual",
    sourcesDescription: "Consulta datos de mercado con fuente",
  },
  fr: {
    label: "Pied de page Sajda",
    title: "Trouvez le nom qui mérite un second regard.",
    body: "Découvrez des options fortes, vérifiez leur statut, comparez le chemin d’achat et gardez les meilleures à portée de main.",
    live: "Recherche, Swipe, place de marché et outils développeurs",
    product: "Produit",
    developer: "Développeurs",
    company: "Entreprise et confiance",
    legalTrust: "Juridique et confiance",
    search: "Recherche de domaines",
    searchHint: "Générer et vérifier des noms",
    swipe: "Balayer",
    swipeHint: "Parcourir des noms courts vérifiés",
    marketplace: "Place de marché",
    marketplaceHint: "Publier un domaine ou explorer les offres",
    today: "Les 10 du jour",
    watchlist: "Liste de suivi",
    history: "Historique de recherche",
    domains: "Mes domaines",
    signIn: "Se connecter",
    signInHint: "Enregistrer des recherches et listes de domaines",
    developerPortal: "Portail développeurs",
    publicApi: "API publique de recherche de domaines",
    apiReference: "Référence OpenAPI",
    signals: "Signaux de marché (JSON)",
    apiAccess: "Accès API",
    story: "L’histoire de Sajda",
    howItWorks: "Comment fonctionne Sajda",
    contact: "Contact et assistance",
    privacy: "Confidentialité",
    privacyHint: "Comment Sajda traite les données personnelles",
    terms: "Conditions d’utilisation",
    termsHint: "Conditions d’utilisation de Sajda",
    cookies: "Cookies et stockage",
    cookiesHint: "Comment Sajda utilise le stockage local",
    accessibility: "Accessibilité",
    accessibilityHint: "Notre engagement pour l’accessibilité",
    security: "Sécurité",
    securityHint: "Pratiques et signalement de sécurité",
    status: "État du système",
    statusHint: "Disponibilité actuelle du service",
    madeFor: "Trouvez le nom de votre futur empire.",
    apiDescription: "Lire le contrat API actuel",
    sourcesDescription: "Consulter les faits de marché sourcés",
  },
  zh: {
    label: "Sajda 网站页脚",
    title: "找到值得再看一眼的名称。",
    body: "发现有潜力的选项，核验其状态，比较购买路径，并把最好的选择留在身边。",
    live: "搜索、Swipe、交易市场与开发者工具",
    product: "产品",
    developer: "开发者",
    company: "公司与信任",
    legalTrust: "法律与信任",
    search: "域名搜索",
    searchHint: "生成并核验名称",
    swipe: "滑选",
    swipeHint: "浏览已核验的短名称",
    marketplace: "交易市场",
    marketplaceHint: "发布域名或浏览出售对象",
    today: "今日 10 个",
    watchlist: "关注列表",
    history: "搜索记录",
    domains: "我的域名",
    signIn: "登录",
    signInHint: "保存搜索和域名列表",
    developerPortal: "开发者门户",
    publicApi: "公开域名搜索 API",
    apiReference: "OpenAPI 参考",
    signals: "市场信号 (JSON)",
    apiAccess: "API 访问",
    story: "Sajda 的故事",
    howItWorks: "Sajda 如何运作",
    contact: "联系与支持",
    privacy: "隐私",
    privacyHint: "Sajda 如何处理个人数据",
    terms: "使用条款",
    termsHint: "使用 Sajda 的条款",
    cookies: "Cookie 与本地存储",
    cookiesHint: "Sajda 如何使用本地存储",
    accessibility: "无障碍访问",
    accessibilityHint: "我们的无障碍承诺",
    security: "安全",
    securityHint: "安全实践与报告",
    status: "系统状态",
    statusHint: "当前服务可用性",
    madeFor: "找到未来帝国的名字。",
    apiDescription: "查看当前 API 契约",
    sourcesDescription: "查看带来源标记的市场事实",
  },
};

const taskNavigationPaths = new Set(["/", "/top-10-today", "/history", "/my-domains", "/account"]);

const footerLinkClassName = "group inline-flex min-h-8 items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

function FooterLink({
  to,
  children,
  description,
  external = false,
}: {
  to: string;
  children: React.ReactNode;
  description?: string;
  external?: boolean;
}) {
  const content = (
    <>
      <span>{children}</span>
      {external && <ArrowUpRight className="h-3.5 w-3.5 opacity-60 transition-transform duration-150 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />}
      {description && <span className="sr-only">: {description}</span>}
    </>
  );

  if (external) {
    return <a href={to} className={footerLinkClassName}>{content}</a>;
  }

  return <Link to={to} className={footerLinkClassName}>{content}</Link>;
}

function FooterColumn({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`footer-${heading.replace(/\s+/g, "-").toLowerCase()}`}>
      <h2
        id={`footer-${heading.replace(/\s+/g, "-").toLowerCase()}`}
        className="text-xs font-semibold uppercase tracking-[0.12em] text-foreground"
      >
        {heading}
      </h2>
      <div className="mt-3 flex flex-col items-start gap-1.5">{children}</div>
    </section>
  );
}

export default function SajdaFooter() {
  const { language } = useLanguage();
  const { user } = useAuth();
  const location = useLocation();
  const copy = footerCopy[language];
  const authDisabled = !isAccountAuthConfigured;
  const developerKeyPortalEnabled = isLocalTestMode() || hasSupabaseBrowserConfig;
  const hasTaskNavigation = !authDisabled && taskNavigationPaths.has(location.pathname);
  const currentYear = new Date().getFullYear();

  return (
    <footer className="mt-0 border-t border-border bg-[#f8fafc] text-foreground" aria-label={copy.label}>
      <div className="mx-auto w-full max-w-7xl px-5 py-10 sm:px-7 sm:py-12 lg:py-14">
        <div className="grid gap-10 xl:grid-cols-[minmax(17rem,1.2fr)_minmax(0,1.8fr)] xl:gap-16">
          <section aria-labelledby="footer-sajda-title">
            <Link
              to="/"
              className="inline-flex rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label="Sajda"
            >
              <img src="/sajda-logo.svg" alt="Sajda" className="h-7 w-auto" />
            </Link>
            <h2 id="footer-sajda-title" className="mt-5 max-w-md text-pretty text-xl font-semibold leading-tight tracking-[-0.03em] sm:text-2xl">
              {copy.title}
            </h2>
            <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">{copy.body}</p>
            <p className="mt-5 inline-flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
              {copy.live}
            </p>
          </section>

          <div className="grid gap-x-8 gap-y-9 sm:grid-cols-2 lg:grid-cols-4 lg:gap-x-10">
            <FooterColumn heading={copy.product}>
              <FooterLink to="/" description={copy.searchHint}>{copy.search}</FooterLink>
              <FooterLink to="/swipe" description={copy.swipeHint}>{copy.swipe}</FooterLink>
              <FooterLink to="/pricing">{language === "sv" ? "Priser & nivåer" : language === "es" ? "Precios y planes" : language === "fr" ? "Tarifs et offres" : language === "zh" ? "价格与方案" : "Pricing & plans"}</FooterLink>
              <FooterLink to="/plus">Sajda Trading · Lost Domains</FooterLink>
              <FooterLink to="/marketplace" description={copy.marketplaceHint}>{copy.marketplace}</FooterLink>
              {user && !authDisabled ? (
                <>
                  <FooterLink to="/account">{accountNavigationCopy[language].account}</FooterLink>
                  <FooterLink to="/watchlist">{copy.watchlist}</FooterLink>
                  {hasSupabaseBrowserConfig && <>
                    <FooterLink to="/top-10-today">{copy.today}</FooterLink>
                    <FooterLink to="/history">{copy.history}</FooterLink>
                    <FooterLink to="/my-domains">{copy.domains}</FooterLink>
                  </>}
                </>
              ) : !authDisabled ? (
                <FooterLink to="/auth" description={copy.signInHint}>{copy.signIn}</FooterLink>
              ) : null}
            </FooterColumn>

            <FooterColumn heading={copy.developer}>
              <FooterLink to="/developers">{copy.developerPortal}</FooterLink>
              <FooterLink to="/developers#public-console">{copy.publicApi}</FooterLink>
              <FooterLink to="/api/openapi" external description={copy.apiDescription}>{copy.apiReference}</FooterLink>
              <FooterLink to="/api/fact-signals" external description={copy.sourcesDescription}>{copy.signals}</FooterLink>
              <FooterLink to={developerKeyPortalEnabled ? "/developers#access" : "/developers#api-v1"}>{copy.apiAccess}</FooterLink>
            </FooterColumn>

            <FooterColumn heading={copy.company}>
              <FooterLink to="/story">{copy.story}</FooterLink>
              <FooterLink to="/how-it-works">{copy.howItWorks}</FooterLink>
              <FooterLink to="/contact">{copy.contact}</FooterLink>
            </FooterColumn>

            <FooterColumn heading={copy.legalTrust}>
              <FooterLink to="/legal#privacy" description={copy.privacyHint}>{copy.privacy}</FooterLink>
              <FooterLink to="/legal#terms" description={copy.termsHint}>{copy.terms}</FooterLink>
              <FooterLink to="/legal#cookies" description={copy.cookiesHint}>{copy.cookies}</FooterLink>
              <FooterLink to="/legal#accessibility" description={copy.accessibilityHint}>{copy.accessibility}</FooterLink>
              <FooterLink to="/security" description={copy.securityHint}>{copy.security}</FooterLink>
              <FooterLink to="/status" description={copy.statusHint}>{copy.status}</FooterLink>
            </FooterColumn>
          </div>
        </div>

        <div className={`mt-10 border-t border-border pt-5 text-xs leading-5 text-muted-foreground ${hasTaskNavigation ? "pb-24 md:pb-0" : "pb-[max(1rem,env(safe-area-inset-bottom))]"}`}>
          <p>© {currentYear} Sajda · {copy.madeFor}</p>
        </div>
      </div>
    </footer>
  );
}
