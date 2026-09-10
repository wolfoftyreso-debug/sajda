import { Loader2, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DiscoveredDomain } from "@/contexts/ScanContext";
import { useLanguage } from "@/i18n/LanguageProvider";

interface ScanningIndicatorProps {
  isScanning: boolean;
  domainsScanned: number;
  domainsFound: number;
  timeRemaining?: number;
  targetDomains?: number;
  scanPhase?: "idle" | "collecting" | "orchestrating";
  activeTLDScans?: Map<string, number>;
  collectPerTLD?: number;
  recentHits?: DiscoveredDomain[];
  onStop?: () => void;
}

// The public API returns one completed response, not streamed progress. Do not
// invent checked counts, hit rates, completion percentages or time remaining.
export default function ScanningIndicator({ isScanning, activeTLDScans, onStop }: ScanningIndicatorProps) {
  const { language, t } = useLanguage();
  if (!isScanning) return null;
  const copy = {
    en: { title: "Finding and checking domains", body: "We are preparing your results and checking domain availability with the registries. Results will appear when the search is complete. Any unconfirmed status will be clearly labeled." },
    sv: { title: "Hittar och kontrollerar domäner", body: "Vi tar fram dina resultat och kontrollerar tillgängligheten hos domänregistren. Resultaten visas när sökningen är klar. Status som inte kan bekräftas märks tydligt." },
    es: { title: "Buscando y comprobando dominios", body: "Estamos preparando los resultados y esperando las comprobaciones del registro. Los resultados aparecerán al terminar; los estados sin confirmar se indicarán claramente." },
    fr: { title: "Recherche et vérification des domaines", body: "Nous préparons vos résultats et vérifions la disponibilité auprès des registres. Les résultats apparaîtront une fois la recherche terminée. Tout statut non confirmé sera clairement signalé." },
    zh: { title: "正在查找并核验域名", body: "我们正在生成结果，并向注册局查询域名是否可注册。搜索完成后即可查看结果，无法确认的状态会明确标注。" },
  }[language];
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm" aria-busy="true" aria-labelledby="search-progress-title">
      <div className="flex items-start gap-3" role="status">
        <Loader2 className="mt-1 h-5 w-5 shrink-0 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
        <div className="min-w-0">
          <h2 id="search-progress-title" className="font-semibold text-foreground">{copy.title}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{copy.body}</p>
          {activeTLDScans && activeTLDScans.size > 0 && (
            <p className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
              {Array.from(activeTLDScans.keys()).map((tld) => <span key={tld} className="rounded-md border border-border px-2 py-1 font-mono">.{tld}</span>)}
            </p>
          )}
        </div>
      </div>
      {onStop && <Button type="button" variant="outline" className="mt-4" onClick={onStop}><Square className="h-4 w-4" aria-hidden="true" />{t("search.stop")}</Button>}
    </section>
  );
}
