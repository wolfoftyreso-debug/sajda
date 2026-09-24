import type { Language } from "@/i18n/LanguageProvider";
import { brandIndexCopy } from "@/i18n/brandIndexCopy";

const copy = {
  en: { title: "An existing-brand index for your agent", lead: "Calculate a self-assessment from the domains, social identities, markets and reports you supply.",
    trust: "This is not independent verification. All reports remain USER_SUPPLIED, the index is SELF_ASSESSMENT, and verified_score is always null. No reports means no reported score.",
    limits: "Public REST: no key, JSON up to 64 KiB. MCP: up to 16 KiB; account MCP requires domains:search. Request limits apply, but no domain or provider quota is used.",
    privacy: "No external lookups, URL fetching, saving or purchases. A matching name is not ownership proof. This is not legal clearance or brand valuation.",
    example: "Request example", schema: "Open API reference" },
  sv: { title: "Ett index för ditt befintliga varumärke i agenten", lead: "Beräkna en självbedömning utifrån de domäner, sociala identiteter, marknader och uppgifter du anger.",
    trust: "Detta är ingen oberoende verifiering. Uppgifterna är USER_SUPPLIED, indexet är SELF_ASSESSMENT och verified_score är alltid null. Utan uppgifter finns ingen rapporterad poäng.",
    limits: "Publikt REST: ingen nyckel, JSON upp till 64 KiB. MCP: upp till 16 KiB; konto-MCP kräver domains:search. Anropsgränser gäller, men ingen domän- eller leverantörskvot används.",
    privacy: "Inga externa uppslag, URL-hämtningar, sparanden eller köp. Ett matchande namn bevisar inte ägande. Detta är ingen juridisk klarering eller varumärkesvärdering.",
    example: "Exempel på begäran", schema: "Öppna API-referensen" },
  es: { title: "Un índice de marca existente para tu agente", lead: "Calcula una autoevaluación a partir de los dominios, identidades sociales, mercados e informes que proporciones.",
    trust: "No es una verificación independiente. Los informes siguen siendo USER_SUPPLIED, el índice es SELF_ASSESSMENT y verified_score siempre es null. Sin informes no hay puntuación declarada.",
    limits: "REST público: sin clave, JSON de hasta 64 KiB. MCP: hasta 16 KiB; MCP de cuenta requiere domains:search. Se aplican límites de solicitudes, pero no cuotas de dominios o proveedores.",
    privacy: "Sin consultas externas, descarga de URL, guardado ni compras. Un nombre coincidente no demuestra propiedad. No es una autorización jurídica ni una valoración de marca.",
    example: "Ejemplo de solicitud", schema: "Abrir referencia de la API" },
  fr: { title: "Un indice de marque existante pour votre agent", lead: "Calculez une autoévaluation à partir des domaines, identités sociales, marchés et déclarations que vous fournissez.",
    trust: "Ce n’est pas une vérification indépendante. Les déclarations restent USER_SUPPLIED, l’indice est SELF_ASSESSMENT et verified_score vaut toujours null. Sans déclaration, aucune note déclarée.",
    limits: "REST public : sans clé, JSON jusqu’à 64 KiB. MCP : jusqu’à 16 KiB ; le MCP de compte exige domains:search. Les limites de requêtes s’appliquent, sans quota de domaines ou de fournisseurs.",
    privacy: "Aucune recherche externe, récupération d’URL, sauvegarde ou acquisition. Un nom identique ne prouve pas la propriété. Ce n’est ni une validation juridique ni une estimation de marque.",
    example: "Exemple de requête", schema: "Ouvrir la référence API" },
  zh: { title: "供智能体使用的现有品牌指数", lead: "根据你提供的域名、社交身份、市场和报告计算自我评估。",
    trust: "这不是独立验证。所有报告均为USER_SUPPLIED，指数为SELF_ASSESSMENT，verified_score始终为null。没有报告时，不会生成报告评分。",
    limits: "公共REST无需密钥，JSON最大64 KiB。MCP最大16 KiB，账户MCP需要domains:search权限。适用请求次数限制，但不消耗域名或供应商配额。",
    privacy: "不进行外部查询、URL访问、保存或购买。名称匹配不代表所有权证明。这不是法律许可或品牌估值。",
    example: "请求示例", schema: "打开API参考文档" },
} satisfies Record<Language, { title: string; lead: string; trust: string; limits: string; privacy: string; example: string; schema: string }>;

export default function BrandIndexApiGuide({ language }: { language: Language }) {
  const text = copy[language];
  const example = JSON.stringify({ brand_name: "Example Brand", identity_label: "example", primary_domain: "example.com",
    domains: ["example.com"], socials: [{ platform: "github", handle: "example" }], markets: ["US"], observations: [] }, null, 2);
  return <section id="brand-index-api" aria-labelledby="brand-index-api-title" className="scroll-mt-24 border-b border-border/80 bg-background">
    <div className="mx-auto grid max-w-7xl gap-6 px-5 py-12 sm:px-7 lg:grid-cols-2">
      <div className="min-w-0">
        <h2 id="brand-index-api-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">{text.title}</h2>
        <p className="mt-3 text-base leading-7 text-muted-foreground">{text.lead}</p>
        <p className="mt-4 text-sm leading-6">{text.trust}</p>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{text.privacy}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <a href="/brand-index/assessment" className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">{brandIndexCopy[language].entry}</a>
          <a href="/api/openapi" className="inline-flex min-h-11 items-center rounded-xl border border-input bg-card px-4 py-2 text-sm font-semibold">{text.schema}</a>
        </div>
      </div>
      <details className="min-w-0 rounded-2xl border border-border bg-card p-5">
        <summary className="cursor-pointer font-semibold">{text.example}</summary>
        <p className="mt-4 break-all font-mono text-sm">MCP: brand_index_assess</p>
        <p className="mt-2 break-all font-mono text-sm">POST /api/v1/public/brand-index</p>
        <pre className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-secondary/70 p-3 text-xs leading-5">{example}</pre>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{text.limits}</p>
      </details>
    </div>
  </section>;
}
