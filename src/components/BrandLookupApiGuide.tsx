import type { Language } from "@/i18n/LanguageProvider";

const copy = {
  en: { title: "Look up an existing brand by name", lead: "Search public Wikidata records, choose the intended entity, then request its profile. No worksheet is required to start.",
    trust: "Database-sourced assertions are not verified ownership, live availability or legal clearance. Brand and ownership scores remain null; a matching name is not proof.",
    limits: "Public REST: no key, JSON up to 6 KiB, 12 requests/minute per network address per instance. MCP: no public credentials; account MCP requires domains:search. Shared upstream limits apply; no domain-search quota is used.",
    privacy: "Queries go to the public database. No AI, registrar lookup, account access, saving or purchases. Avoid confidential search terms.",
    example: "Search, then select a profile", open: "Look up a brand", schema: "Open API reference" },
  sv: { title: "Slå upp ett befintligt varumärke med namn", lead: "Sök i offentliga Wikidata-poster, välj rätt entitet och hämta dess profil. Du behöver inte börja med ett formulär för självbedömning.",
    trust: "Databasuppgifter är inte verifierat ägande, aktuell tillgänglighet eller juridisk klarering. Varumärkes- och ägarpoäng förblir null; ett matchande namn är inget bevis.",
    limits: "Publikt REST: ingen nyckel, JSON upp till 6 KiB, 12 anrop/minut per nätverksadress och instans. Publikt MCP kräver inga uppgifter; konto-MCP kräver domains:search. Gemensamma källgränser gäller; ingen domänsökkvot används.",
    privacy: "Sökningar skickas till den offentliga databasen. Ingen AI, registratoruppslagning, kontoåtkomst, lagring eller köp. Undvik konfidentiella sökord.",
    example: "Sök och välj sedan en profil", open: "Slå upp ett varumärke", schema: "Öppna API-referensen" },
  es: { title: "Busca una marca existente por su nombre", lead: "Busca registros públicos de Wikidata, elige la entidad correcta y solicita su perfil. No necesitas empezar con una autoevaluación.",
    trust: "Los datos de la base no verifican propiedad, disponibilidad actual ni autorización jurídica. Las puntuaciones de marca y propiedad siguen siendo null; un nombre coincidente no es una prueba.",
    limits: "REST público: sin clave, JSON de hasta 6 KiB, 12 solicitudes/minuto por dirección de red e instancia. MCP público sin credenciales; MCP de cuenta requiere domains:search. Se aplican límites de la fuente, sin cuota de búsqueda de dominios.",
    privacy: "Las consultas se envían a la base pública. Sin IA, consultas a registradores, acceso a cuentas, guardado ni compras. Evita términos confidenciales.",
    example: "Busca y después elige un perfil", open: "Buscar una marca", schema: "Abrir referencia de la API" },
  fr: { title: "Rechercher une marque existante par son nom", lead: "Recherchez dans les données publiques de Wikidata, choisissez la bonne entité, puis demandez son profil. Aucun formulaire d’autoévaluation n’est nécessaire pour commencer.",
    trust: "Les données de la base ne vérifient ni la propriété, ni la disponibilité actuelle, ni la validité juridique. Les notes de marque et de propriété restent null ; un nom identique ne constitue pas une preuve.",
    limits: "REST public : sans clé, JSON jusqu’à 6 KiB, 12 requêtes/minute par adresse réseau et instance. MCP public sans identifiants ; MCP de compte exige domains:search. Les limites de la source s’appliquent, sans quota de recherche de domaines.",
    privacy: "Les requêtes sont transmises à la base publique. Aucune IA, recherche de bureau d’enregistrement, accès au compte, sauvegarde ou acquisition. Évitez les termes confidentiels.",
    example: "Rechercher, puis choisir un profil", open: "Rechercher une marque", schema: "Ouvrir la référence API" },
  zh: { title: "按名称查询现有品牌", lead: "搜索Wikidata公开记录，选择所需实体，再请求其资料。无需先填写自我评估表。",
    trust: "数据库信息不代表经过验证的所有权、实时可用性或法律许可。品牌和所有权评分始终为null；名称匹配不是证明。",
    limits: "公共REST无需密钥，JSON最大6 KiB，每个实例中每个网络地址每分钟12次请求。公共MCP无需凭据；账户MCP需要domains:search权限。适用共享来源限制，但不消耗域名搜索配额。",
    privacy: "查询会发送到公开数据库。不调用AI、域名注册商，不访问账户，不保存或购买。请勿输入机密信息。",
    example: "先搜索，再选择资料", open: "查询品牌", schema: "打开API参考文档" },
} satisfies Record<Language, { title: string; lead: string; trust: string; limits: string; privacy: string; example: string; open: string; schema: string }>;

export default function BrandLookupApiGuide({ language }: { language: Language }) {
  const text = copy[language];
  const example = JSON.stringify({ operation: "search", query: "IKEA", locale: language }, null, 2);
  return <section id="brand-lookup-api" aria-labelledby="brand-lookup-api-title" className="scroll-mt-24 border-b border-border/80 bg-secondary/30">
    <div className="mx-auto grid max-w-7xl gap-6 px-5 py-12 sm:px-7 lg:grid-cols-2">
      <div className="min-w-0">
        <h2 id="brand-lookup-api-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">{text.title}</h2>
        <p className="mt-3 text-base leading-7 text-muted-foreground">{text.lead}</p>
        <p className="mt-4 text-sm leading-6">{text.trust}</p>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{text.privacy}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <a href="/brand-index" className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">{text.open}</a>
          <a href="/api/openapi" className="inline-flex min-h-11 items-center rounded-xl border border-input bg-card px-4 py-2 text-sm font-semibold">{text.schema}</a>
        </div>
      </div>
      <details className="min-w-0 rounded-2xl border border-border bg-card p-5">
        <summary className="cursor-pointer font-semibold">{text.example}</summary>
        <p className="mt-4 break-all font-mono text-sm">MCP: brand_lookup</p>
        <p className="mt-2 break-all font-mono text-sm">POST /api/v1/public/brand-lookup</p>
        <pre className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-secondary/70 p-3 text-xs leading-5">{example}</pre>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{text.limits}</p>
      </details>
    </div>
  </section>;
}
