import { getNamePackageBrandIndex } from "../../shared/brand-candidate-index";
import type { NamePackage } from "../../shared/name-packages";
import type { Language } from "@/i18n/LanguageProvider";
import { brandWorkspaceCopy } from "@/i18n/brandWorkspaceCopy";
import { namePackagesCopy } from "@/i18n/namePackagesCopy";
import { packageDomainStatus } from "@/lib/namePackageExport";

export function BrandIndexSummary({ pkg, language, now }: { pkg: NamePackage; language: Language; now?: number }) {
  const c = brandWorkspaceCopy[language], index = getNamePackageBrandIndex(pkg, now);
  return <section data-candidate-brand-index className="mt-5 rounded-2xl border border-primary/20 bg-primary/5 p-4" aria-label={c.index}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="text-sm font-semibold">{c.index}</h4><p className="mt-1 text-xs text-muted-foreground">{c.candidate}</p></div>
      <p className="text-3xl font-semibold tabular-nums">{index.score}<span className="text-sm font-normal text-muted-foreground"> / 100</span></p></div>
    <p className="mt-3 text-sm font-medium">{index.status === "conflicts_found" ? c.conflicts : index.status === "domains_ready" ? c.ready : c.incomplete}</p>
    <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">{(["fit", "domains", "socials", "company", "trademark"] as const).map(key =>
      <div key={key} className="min-w-0"><dt className="text-xs leading-5 text-muted-foreground">{c[key]}</dt><dd className="text-sm font-semibold tabular-nums">{index.dimensions[key].score} / {index.dimensions[key].max}</dd></div>)}
      <div><dt className="text-xs leading-5 text-muted-foreground">{c.coverage}</dt><dd className="text-sm font-semibold">{index.evidenceCoverage}%</dd></div></dl>
    <p className="mt-4 text-xs leading-5 text-muted-foreground">{c.ceiling}</p>
  </section>;
}

export function BrandPackageComparison({ packages, language, now, onClear }: { packages: NamePackage[]; language: Language; now: number; onClear: () => void }) {
  const c = brandWorkspaceCopy[language];
  return <section data-package-comparison className="mb-6 rounded-2xl border border-primary/30 bg-card p-4 sm:p-6" aria-labelledby="package-comparison-title">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 id="package-comparison-title" className="text-xl font-semibold">{c.comparison}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{c.compareHint}</p></div>
      <button type="button" className="min-h-11 text-sm font-semibold text-primary underline" onClick={onClear}>{c.clear}</button></div>
    <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-3">{packages.map(pkg => <article key={pkg.id} className="min-w-0"><h4 className="break-all text-lg font-semibold">{pkg.displayName}</h4><BrandIndexSummary pkg={pkg} language={language} now={now} />
      <ul className="mt-3 space-y-2 text-sm">{pkg.domains.map(domain => <li key={domain.domain} className="break-words"><span className="break-all font-medium">{domain.domain}</span><span className="block text-xs leading-5 text-muted-foreground">{packageDomainStatus(domain, namePackagesCopy[language])}</span></li>)}</ul>
    </article>)}</div>
  </section>;
}
