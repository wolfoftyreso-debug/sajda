import React from "react";
import type { Language } from "@/i18n/LanguageProvider";

const english = {
  title: "Top 10 business names for your agent",
  lead: "Describe your business and choose the name language. Get ranked name packages with available-domain evidence and Sajda Brand Index.",
  method: "A score you can inspect",
  detail: "Each package includes the scoring version, subscores, source dates and missing checks. An unknown is never turned into an available name.",
  boundary: "Company names, trademarks and social registration still need separate checks. The current score can reach 70/100; it is not legal clearance or a valuation.",
  example: "Request example",
  access: "Public REST needs no key. Account REST uses a server-side key with domains:search. Both share existing search limits; fewer than ten packages may be returned.",
  scope: "No hidden AI calls, social lookups, saving or purchases. This tool does not assess your budget.",
  open: "Try name packages",
  schema: "Open API reference",
};
const copy: Record<Language, typeof english> = {
  en: english,
  sv: {
    title: "Topp 10 företagsnamn för din agent",
    lead: "Beskriv din verksamhet och välj namnspråk. Få rankade namnpaket med underlag för lediga domäner och Sajda Brand Index.",
    method: "Ett betyg du kan granska",
    detail: "Varje paket visar metodversion, delpoäng, källdatum och saknade kontroller. Okänt blir aldrig automatiskt ett ledigt namn.",
    boundary: "Företagsnamn, varumärken och registrering av sociala konton kräver separata kontroller. Nuvarande maxbetyg är 70/100; det är ingen juridisk klarering eller värdering.",
    example: "Exempel på begäran",
    access: "Publikt REST kräver ingen nyckel. Konto-REST använder en servernyckel med domains:search. Båda delar befintliga sökgränser; färre än tio paket kan returneras.",
    scope: "Inga dolda AI-anrop, sociala uppslag, sparanden eller köp. Verktyget bedömer inte din budget.",
    open: "Prova namnpaket",
    schema: "Öppna API-referensen",
  },
  es: {
    title: "Los 10 mejores nombres de empresa para tu agente",
    lead: "Describe tu negocio y elige el idioma del nombre. Recibe propuestas ordenadas con pruebas de disponibilidad de dominios y Sajda Brand Index.",
    method: "Una puntuación que puedes revisar",
    detail: "Cada paquete incluye la versión del método, las puntuaciones parciales, las fechas de las fuentes y las comprobaciones pendientes. Desconocido nunca significa disponible.",
    boundary: "Los nombres de empresa, las marcas y el registro de cuentas sociales requieren comprobaciones aparte. El máximo actual es 70/100; no es una autorización jurídica ni una valoración.",
    example: "Ejemplo de solicitud",
    access: "REST público no requiere clave. REST de cuenta usa una clave de servidor con domains:search. Ambos comparten los límites de búsqueda existentes; pueden devolver menos de diez paquetes.",
    scope: "Sin llamadas ocultas a IA, consultas sociales, guardados ni compras. Esta herramienta no evalúa tu presupuesto.",
    open: "Probar paquetes de nombres",
    schema: "Abrir referencia de la API",
  },
  fr: {
    title: "Les 10 meilleurs noms d’entreprise pour votre agent",
    lead: "Décrivez votre activité et choisissez la langue du nom. Recevez des propositions classées, accompagnées de preuves de disponibilité des domaines et du Sajda Brand Index.",
    method: "Une note que vous pouvez examiner",
    detail: "Chaque ensemble indique la version de la méthode, les sous-notes, les dates des sources et les vérifications manquantes. Inconnu ne signifie jamais disponible.",
    boundary: "Les noms d’entreprise, les marques et l’inscription sur les réseaux sociaux nécessitent des vérifications distinctes. Le maximum actuel est de 70/100 ; ce n’est ni une validation juridique ni une estimation de valeur.",
    example: "Exemple de requête",
    access: "L’API REST publique ne nécessite aucune clé. L’API de compte utilise une clé côté serveur avec domains:search. Elles partagent les limites de recherche existantes ; moins de dix ensembles peuvent être renvoyés.",
    scope: "Aucun appel caché à l’IA, aucune recherche sociale, sauvegarde ou acquisition. Cet outil n’évalue pas votre budget.",
    open: "Essayer les ensembles de noms",
    schema: "Ouvrir la référence API",
  },
  zh: {
    title: "为智能体提供十大企业名称建议",
    lead: "描述您的业务并选择名称语言，即可获取排序后的名称组合、域名可注册证据和Sajda Brand Index。",
    method: "可核查的评分",
    detail: "每个组合都包含方法版本、各项得分、来源日期和待完成的检查。未知绝不等于可注册。",
    boundary: "企业名称、商标和社交账号注册仍需单独核查。目前最高可得70/100分；这不是法律许可或价值评估。",
    example: "请求示例",
    access: "公共REST无需密钥。账户REST使用具有domains:search权限的服务器端密钥。两者共用现有搜索限额，返回的组合可能少于十个。",
    scope: "不会隐藏调用AI、查询社交平台、保存结果或购买域名。本工具不评估预算。",
    open: "试用名称组合",
    schema: "打开API参考文档",
  },
};

export default function NamePackageApiGuide({ language }: { language: Language }) {
  const text = copy[language] ?? english;
  const example = JSON.stringify({ businessDescription: "Logistics software that helps small European businesses plan deliveries",
    nameLanguage: "en", tlds: ["com", "dev"], platforms: ["github", "linkedin"],
    markets: ["US", "SE", "DE"], count: 10, locale: "en" }, null, 2);
  return <React.Fragment><section id="name-package-api" aria-labelledby="name-package-api-title" className="scroll-mt-24 border-y border-border/80 bg-secondary/30">
    <div className="mx-auto grid max-w-7xl gap-6 px-5 py-12 sm:px-7 lg:grid-cols-2">
      <div className="min-w-0">
        <h2 id="name-package-api-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">{text.title}</h2>
        <p className="mt-3 text-base leading-7 text-muted-foreground">{text.lead}</p>
        <h3 className="mt-5 font-semibold">{text.method}</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{text.detail}</p>
        <p className="mt-3 text-sm leading-6">{text.boundary}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <a href="/name-packages" className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">{text.open}</a>
          <a href="/api/openapi" className="inline-flex min-h-11 items-center rounded-xl border border-input bg-card px-4 py-2 text-sm font-semibold">{text.schema}</a>
        </div>
      </div>
      <details className="min-w-0 rounded-2xl border border-border bg-card p-5">
        <summary className="cursor-pointer font-semibold">{text.example}</summary>
        <p className="mt-4 break-all font-mono text-sm">MCP: business_names_recommend</p>
        <p className="mt-2 break-all font-mono text-sm">POST /api/v1/public/business-names</p>
        <pre className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-secondary/70 p-3 text-xs leading-5">{example}</pre>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{text.access}</p>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{text.scope}</p>
      </details>
    </div>
  </section></React.Fragment>;
}
