import { useCallback, useEffect, useState } from "react";
import { productFetch } from "@/lib/productFetch";
import { ArrowLeft, CheckCircle2, CircleAlert, LoaderCircle, RefreshCw, Server } from "lucide-react";
import { Link } from "react-router-dom";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { Button } from "@/components/ui/button";
import { useLanguage, type Language } from "@/i18n/LanguageProvider";

type CheckState = "checking" | "available" | "attention";

type Endpoint = {
  id: "contract" | "search" | "signals";
  method: "GET" | "OPTIONS";
  path: string;
};

type StatusCopy = {
  documentTitle: string;
  back: string;
  eyebrow: string;
  title: string;
  lead: string;
  refresh: string;
  refreshing: string;
  checked: string;
  checking: string;
  available: string;
  attention: string;
  endpointLabel: Record<Endpoint["id"], { title: string; body: string }>;
  noteTitle: string;
  note: string;
  developerAction: string;
  howItWorksAction: string;
};

const statusCopy: Record<Language, StatusCopy> = {
  en: {
    documentTitle: "Sajda status",
    back: "Back to Sajda",
    eyebrow: "Service status",
    title: "A clear view of Sajda’s public surface.",
    lead: "This page checks the public endpoints from your browser. It is a live reachability check—not an uptime promise or a purchase guarantee.",
    refresh: "Refresh checks",
    refreshing: "Checking",
    checked: "Last checked",
    checking: "Checking now",
    available: "Reachable",
    attention: "Needs attention",
    endpointLabel: {
      contract: { title: "API contract", body: "The machine-readable OpenAPI reference." },
      search: { title: "Public domain search", body: "The bounded public domain-search route." },
      signals: { title: "Market signals", body: "The source-attributed market-context feed." },
    },
    noteTitle: "What this does—and does not—confirm",
    note: "An endpoint being reachable does not confirm a specific domain’s availability, price, or checkout status. Those details remain attached to each search result and should be confirmed with the provider before purchase.",
    developerAction: "Open developer portal",
    howItWorksAction: "See how Sajda works",
  },
  sv: {
    documentTitle: "Sajda-status",
    back: "Tillbaka till Sajda",
    eyebrow: "Tjänststatus",
    title: "En tydlig bild av Sajdas publika yta.",
    lead: "Sidan kontrollerar de publika ändpunkterna från din webbläsare. Det är en direkt nåbarhetskontroll — inte ett driftslöfte eller en köpgaranti.",
    refresh: "Uppdatera kontroller",
    refreshing: "Kontrollerar",
    checked: "Senast kontrollerad",
    checking: "Kontrollerar nu",
    available: "Nås",
    attention: "Behöver uppmärksamhet",
    endpointLabel: {
      contract: { title: "API-kontrakt", body: "Den maskinläsbara OpenAPI-referensen." },
      search: { title: "Publik domänsökning", body: "Den avgränsade publika domänsökningsvägen." },
      signals: { title: "Marknadssignaler", body: "Flödet med källmärkta marknadssammanhang." },
    },
    noteTitle: "Vad detta bekräftar — och inte bekräftar",
    note: "Att en ändpunkt kan nås bekräftar inte en specifik domäns tillgänglighet, pris eller checkoutstatus. Informationen hör till varje resultat och ska bekräftas hos leverantören före köp.",
    developerAction: "Öppna utvecklarportalen",
    howItWorksAction: "Se hur Sajda fungerar",
  },
  es: {
    documentTitle: "Estado de Sajda",
    back: "Volver a Sajda",
    eyebrow: "Estado del servicio",
    title: "Una vista clara de la superficie pública de Sajda.",
    lead: "Esta página comprueba los endpoints públicos desde tu navegador. Es una comprobación de acceso en directo, no una promesa de disponibilidad ni de compra.",
    refresh: "Actualizar comprobaciones",
    refreshing: "Comprobando",
    checked: "Última comprobación",
    checking: "Comprobando ahora",
    available: "Accesible",
    attention: "Requiere atención",
    endpointLabel: {
      contract: { title: "Contrato de API", body: "La referencia OpenAPI legible por máquina." },
      search: { title: "Búsqueda pública de dominios", body: "La ruta pública de búsqueda de dominios acotada." },
      signals: { title: "Señales de mercado", body: "El feed de contexto de mercado con fuentes." },
    },
    noteTitle: "Lo que esto confirma y lo que no",
    note: "Que un endpoint sea accesible no confirma la disponibilidad, el precio o el estado de compra de un dominio concreto. Esos detalles acompañan a cada resultado y deben confirmarse con el proveedor antes de comprar.",
    developerAction: "Abrir portal de desarrolladores",
    howItWorksAction: "Ver cómo funciona Sajda",
  },
  fr: {
    documentTitle: "État de Sajda",
    back: "Retour à Sajda",
    eyebrow: "État du service",
    title: "Une vue claire de la surface publique de Sajda.",
    lead: "Cette page vérifie les endpoints publics depuis votre navigateur. Il s’agit d’un contrôle d’accessibilité en direct, pas d’une promesse de disponibilité ou d’achat.",
    refresh: "Actualiser les contrôles",
    refreshing: "Vérification",
    checked: "Dernière vérification",
    checking: "Vérification en cours",
    available: "Accessible",
    attention: "À vérifier",
    endpointLabel: {
      contract: { title: "Contrat API", body: "La référence OpenAPI lisible par machine." },
      search: { title: "Recherche publique de domaines", body: "La route publique de recherche de domaines limitée." },
      signals: { title: "Signaux de marché", body: "Le flux de contexte de marché avec sources." },
    },
    noteTitle: "Ce que cela confirme — et ne confirme pas",
    note: "L’accessibilité d’un endpoint ne confirme pas la disponibilité, le prix ou le statut de paiement d’un domaine précis. Ces éléments accompagnent chaque résultat et doivent être confirmés auprès du fournisseur avant achat.",
    developerAction: "Ouvrir le portail développeurs",
    howItWorksAction: "Voir comment Sajda fonctionne",
  },
  zh: {
    documentTitle: "Sajda 状态",
    back: "返回 Sajda",
    eyebrow: "服务状态",
    title: "清晰查看 Sajda 的公开服务面。",
    lead: "本页从您的浏览器检查公开端点。这是一项实时可达性检查，并非运行时间、购买或价格承诺。",
    refresh: "刷新检查",
    refreshing: "正在检查",
    checked: "上次检查",
    checking: "正在检查",
    available: "可访问",
    attention: "需要留意",
    endpointLabel: {
      contract: { title: "API 契约", body: "机器可读的 OpenAPI 参考。" },
      search: { title: "公开域名搜索", body: "受限的公开域名搜索路由。" },
      signals: { title: "市场信号", body: "标注来源的市场背景信息流。" },
    },
    noteTitle: "本页确认什么，又不确认什么",
    note: "端点可访问并不确认某个域名的可用性、价格或结算状态。这些信息附在每个搜索结果中，购买前仍应在服务商处确认。",
    developerAction: "打开开发者门户",
    howItWorksAction: "了解 Sajda 如何运作",
  },
};

const endpoints: Endpoint[] = [
  { id: "contract", method: "GET", path: "/api/openapi" },
  { id: "search", method: "OPTIONS", path: "/api/v1/public/domains" },
  { id: "signals", method: "GET", path: "/api/fact-signals?limit=1" },
];

function formatCheckedAt(date: Date, language: Language) {
  const locale = language === "zh" ? "zh-CN" : language;
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(date);
}

export default function Status() {
  const { language } = useLanguage();
  const copy = statusCopy[language];
  const [states, setStates] = useState<Record<Endpoint["id"], CheckState>>({ contract: "checking", search: "checking", signals: "checking" });
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  const checkEndpoints = useCallback(async () => {
    setIsChecking(true);
    setStates({ contract: "checking", search: "checking", signals: "checking" });

    const results = await Promise.all(endpoints.map(async (endpoint) => {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 6000);
      try {
        const response = await productFetch(endpoint.path, { method: endpoint.method, cache: "no-store", signal: controller.signal });
        // A catch-all SPA can return HTML with 200 for a broken API route.
        // Check the actual response contract before displaying green status.
        let valid = response.ok;
        if (endpoint.method === "OPTIONS") {
          const methods = response.headers.get("Allow") ?? response.headers.get("Access-Control-Allow-Methods") ?? "";
          valid = valid && methods.split(",").some((method) => method.trim() === "POST");
        } else {
          const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
          valid = valid && payload !== null && (endpoint.id === "contract"
            ? typeof payload.openapi === "string" && typeof payload.paths === "object"
            : Array.isArray(payload.facts));
        }
        return [endpoint.id, valid ? "available" : "attention"] as const;
      } catch {
        return [endpoint.id, "attention"] as const;
      } finally {
        window.clearTimeout(timeout);
      }
    }));

    setStates(Object.fromEntries(results) as Record<Endpoint["id"], CheckState>);
    setCheckedAt(new Date());
    setIsChecking(false);
  }, []);

  useEffect(() => {
    document.title = copy.documentTitle;
  }, [copy.documentTitle]);

  useEffect(() => {
    void checkEndpoints();
  }, [checkEndpoints]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-white/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-5 py-5 sm:px-7">
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {copy.back}
          </Link>
          <LanguageSwitcher />
        </div>
      </header>

      <section className="mx-auto w-full max-w-5xl px-5 pb-20 pt-14 sm:px-7 sm:pt-20">
        <div className="rounded-[2rem] border border-[#bddcf7] bg-[#eaf6ff] px-6 py-10 shadow-[0_20px_55px_hsl(210_55%_35%/0.10)] sm:px-10 sm:py-12">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">{copy.eyebrow}</p>
          <div className="mt-4 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <h1 className="text-balance text-3xl font-semibold tracking-[-0.045em] sm:text-5xl">{copy.title}</h1>
              <p className="mt-4 text-pretty text-base leading-7 text-[#45617e] sm:text-lg">{copy.lead}</p>
            </div>
            <Button type="button" onClick={() => void checkEndpoints()} disabled={isChecking} className="min-h-11 shrink-0 rounded-xl px-4">
              {isChecking ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />}
              {isChecking ? copy.refreshing : copy.refresh}
            </Button>
          </div>
        </div>

        <section className="mt-7 grid gap-3 sm:grid-cols-3" aria-live="polite" aria-label={copy.eyebrow}>
          {endpoints.map((endpoint) => {
            const state = states[endpoint.id];
            const isAvailable = state === "available";
            const isCheckingEndpoint = state === "checking";
            const Icon = isCheckingEndpoint ? LoaderCircle : isAvailable ? CheckCircle2 : CircleAlert;
            return (
              <article key={endpoint.id} className="rounded-2xl border border-border bg-white p-5 shadow-[0_10px_24px_hsl(210_45%_30%/0.06)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="rounded-xl border border-[#cae3fa] bg-[#eff8ff] p-2.5 text-primary"><Server className="h-5 w-5" aria-hidden="true" /></div>
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${isCheckingEndpoint ? "bg-slate-100 text-slate-600" : isAvailable ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
                    <Icon className={`h-3.5 w-3.5 ${isCheckingEndpoint ? "animate-spin" : ""}`} aria-hidden="true" />
                    {isCheckingEndpoint ? copy.checking : isAvailable ? copy.available : copy.attention}
                  </span>
                </div>
                <h2 className="mt-5 text-base font-semibold">{copy.endpointLabel[endpoint.id].title}</h2>
                <p className="mt-2 min-h-12 text-sm leading-6 text-muted-foreground">{copy.endpointLabel[endpoint.id].body}</p>
                <code className="mt-4 block truncate rounded-lg border border-border bg-slate-50 px-2.5 py-2 text-xs text-[#36516d]">{endpoint.method} {endpoint.path}</code>
              </article>
            );
          })}
        </section>

        <p className="mt-5 text-xs text-muted-foreground">{copy.checked}: {checkedAt ? formatCheckedAt(checkedAt, language) : copy.checking}</p>

        <section className="mt-10 rounded-2xl border border-border bg-white px-6 py-7 sm:px-8">
          <h2 className="text-xl font-semibold tracking-[-0.025em]">{copy.noteTitle}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">{copy.note}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild variant="outline" className="rounded-xl"><Link to="/developers">{copy.developerAction}</Link></Button>
            <Button asChild variant="outline" className="rounded-xl"><Link to="/how-it-works">{copy.howItWorksAction}</Link></Button>
          </div>
        </section>
      </section>
    </main>
  );
}
