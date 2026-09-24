import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Language } from "@/i18n/LanguageProvider";
import { marketCountText, namePackageCountryName, namePackageMarketsCopy } from "@/i18n/namePackageMarketsCopy";
import { buildNamePackageMarketCoverage, DEFAULT_NAME_PACKAGE_MARKETS, EU_NAME_PACKAGE_MARKETS, NAME_PACKAGE_MARKET_CODES, normalizeNamePackageMarkets, type NamePackageMarketCode } from "../../shared/name-package-markets";

export default function NamePackageMarkets({ markets, onChange, language, disabled = false }: {
  markets: NamePackageMarketCode[]; onChange: (markets: NamePackageMarketCode[]) => void; language: Language; disabled?: boolean;
}) {
  const c = namePackageMarketsCopy[language];
  const presets = [
    { id: "us", label: c.usa, markets: ["US"] as readonly NamePackageMarketCode[] },
    { id: "eu", label: c.eu, markets: EU_NAME_PACKAGE_MARKETS },
    { id: "us-eu", label: c.usaEu, markets: DEFAULT_NAME_PACKAGE_MARKETS },
    { id: "all", label: marketCountText(c.all, NAME_PACKAGE_MARKET_CODES.length), markets: NAME_PACKAGE_MARKET_CODES },
  ];
  const selected = new Set(markets);
  function toggle(market: NamePackageMarketCode) {
    if (disabled || selected.has(market) && markets.length === 1) return;
    onChange(normalizeNamePackageMarkets(selected.has(market) ? markets.filter(value => value !== market) : [...markets, market]));
  }
  return <fieldset id="package-markets" disabled={disabled} aria-describedby="package-markets-help" className="mb-5 min-w-0 rounded-2xl border border-border bg-card px-5 pb-5 pt-2 disabled:opacity-70 sm:px-6">
    <legend className="px-1 text-base font-semibold">{c.title}</legend>
    <p id="package-markets-help" className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{c.help}</p>
    <div className="mt-3 flex flex-wrap gap-2">{presets.map(preset => <Button key={preset.id} type="button" variant="outline" data-market-preset={preset.id} aria-pressed={markets.length === preset.markets.length && preset.markets.every(code => selected.has(code))} onClick={() => { if (!disabled) onChange(normalizeNamePackageMarkets(preset.markets)); }} className="h-auto min-h-11 whitespace-normal px-3 py-2 text-left leading-5 aria-pressed:border-primary aria-pressed:bg-primary/10">{preset.label}</Button>)}</div>
    <p data-selected-markets={markets.join(",")} className="mt-3 text-sm font-medium">{marketCountText(c.selected, markets.length)}</p>
    <details className="mt-2"><summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-primary">{c.choose}</summary>
      <div className="mt-2 grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-3">{NAME_PACKAGE_MARKET_CODES.map(market => <label key={market} className="flex min-h-12 min-w-0 cursor-pointer items-start gap-3 rounded-xl border border-border p-3 text-sm has-[:disabled]:cursor-default"><input type="checkbox" data-market-code={market} checked={selected.has(market)} disabled={disabled || selected.has(market) && markets.length === 1} onChange={() => toggle(market)} className="mt-0.5 h-4 w-4 shrink-0" /><span className="min-w-0 break-words">{namePackageCountryName(market, language)} <span className="text-xs text-muted-foreground">({market})</span></span></label>)}</div>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">{c.minimum}</p>
    </details>
  </fieldset>;
}

export function NamePackageMarketReview({ markets, language }: { markets: NamePackageMarketCode[]; language: Language }) {
  const c = namePackageMarketsCopy[language], coverage = buildNamePackageMarketCoverage(markets);
  return <section id="package-market-review" aria-labelledby="package-market-review-title" className="mb-5 min-w-0 scroll-mt-24 rounded-2xl border border-border bg-card p-5 sm:p-6">
    <h3 id="package-market-review-title" className="text-base font-semibold">{c.coverageTitle}</h3>
    <p data-market-coverage={coverage.requested_markets.length} data-requested-markets={coverage.requested_markets.length} data-checked-markets={0} className="mt-2 text-lg font-semibold">{marketCountText(c.coverage, coverage.requested_markets.length)}</p>
    <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{c.incomplete}</p>
    <details className="mt-3"><summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-primary">{c.sources}</summary>
      <div className="mt-2 space-y-2">{coverage.checks.map(check => <details key={check.market} data-market-review={check.market} className="min-w-0 rounded-xl border border-border px-4 pb-3 pt-1">
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">{namePackageCountryName(check.market, language)} ({check.market}) · {c.notChecked}</summary>
        <div className="grid gap-4 pt-2 sm:grid-cols-2">{(["company", "trademark"] as const).map(kind => <section key={kind} className="min-w-0"><h4 className="text-sm font-semibold">{c[kind]} · {c.manual}</h4><ul className="mt-2 space-y-2">{check[kind].sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 max-w-full items-start gap-1.5 py-2 text-sm text-primary underline underline-offset-4"><span className="min-w-0 break-words">{source.name}</span><ArrowUpRight className="mt-1 h-3 w-3 shrink-0" aria-hidden="true" /></a></li>)}</ul></section>)}</div>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-xs leading-5 text-muted-foreground">{check.required_follow_up.map(code => <li key={code}>{c.followUps[code]}</li>)}</ul>
      </details>)}</div>
    </details>
  </section>;
}
