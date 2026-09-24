import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import NamePackageMarkets from "@/components/NamePackageMarkets";
import BrandWorkspaceEntry from "@/components/BrandWorkspaceEntry";
import { useLanguage, type Language } from "@/i18n/LanguageProvider";
import { brandIndexCopy } from "@/i18n/brandIndexCopy";
import { brandLookupCopy } from "@/i18n/brandLookupCopy";
import { namePackageCountryName } from "@/i18n/namePackageMarketsCopy";
import { formatLocalizedDateTime } from "@/lib/localeFormat";
import { socialPlatformNames } from "@/lib/namePackageExport";
import { SOCIAL_PLATFORMS, type SocialPlatform } from "../../shared/name-packages";
import { DEFAULT_NAME_PACKAGE_MARKETS, type NamePackageMarketCode } from "../../shared/name-package-markets";
import { assessBrandPresence, brandIndexInputSchema, BRAND_INDEX_STATUSES, type BrandIndexInput, type BrandIndexResult } from "../../shared/brand-presence-index";

const field = "mt-2 min-h-12 w-full min-w-0 rounded-xl border border-input bg-background px-3 py-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const action = "h-auto min-h-12 whitespace-normal px-4 py-3 text-left leading-6";
type ReportStatus = BrandIndexInput["observations"][number]["status"];
type Target = BrandIndexResult["targets"][number];

/** A local worksheet only. No account, lookup, autosave or verified-evidence path. */
export default function BrandIndexAssessment() {
  const { language } = useLanguage(), c = brandIndexCopy[language];
  const [brandName, setBrandName] = useState(""), [identity, setIdentity] = useState(""), [primary, setPrimary] = useState(""), [extraDomains, setExtraDomains] = useState("");
  const [platforms, setPlatforms] = useState<SocialPlatform[]>([...SOCIAL_PLATFORMS]);
  const [handles, setHandles] = useState<Partial<Record<SocialPlatform, string>>>({});
  const [markets, setMarkets] = useState<NamePackageMarketCode[]>([...DEFAULT_NAME_PACKAGE_MARKETS]);
  const [input, setInput] = useState<BrandIndexInput | null>(null), inputRef = useRef<BrandIndexInput | null>(null);
  const [invalidFields, setInvalidFields] = useState<string[]>([]), [confirmReset, setConfirmReset] = useState(false), [now, setNow] = useState(Date.now);
  const result = useMemo(() => input ? assessBrandPresence(input, now) : null, [input, now]);
  const nameFieldRef = useRef<HTMLInputElement>(null), resultHeadingRef = useRef<HTMLHeadingElement>(null), hadResultRef = useRef(false);
  const hasResult = result !== null;

  useEffect(() => {
    // Move focus only between worksheet stages, never when a report or its age changes.
    if (hasResult) resultHeadingRef.current?.focus();
    else if (hadResultRef.current) nameFieldRef.current?.focus();
    hadResultRef.current = hasResult;
  }, [hasResult]);

  useEffect(() => {
    const update = () => setNow(Date.now());
    const timer = window.setInterval(update, 30_000);
    window.addEventListener("focus", update);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", update); };
  }, []);

  function build(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const primaryDomain = primary.trim().toLowerCase();
    const requested = [primaryDomain, ...extraDomains.split(/[\s,]+/u).map(value => value.trim().toLowerCase()).filter(Boolean)];
    const parsed = brandIndexInputSchema.safeParse({ brand_name: brandName, identity_label: identity, primary_domain: primaryDomain,
      domains: [...new Set(requested)], socials: platforms.map(platform => ({ platform, handle: handles[platform]?.trim() || identity.trim() })), markets, observations: [] });
    if (!parsed.success) { setInvalidFields([...new Set(parsed.error.issues.map(issue => String(issue.path[0] ?? "scope")))]); return; }
    inputRef.current = parsed.data; setInput(parsed.data); setNow(Date.now()); setInvalidFields([]); setConfirmReset(false);
  }
  function record(targetId: string, status: ReportStatus, source: string): boolean {
    const current = inputRef.current;
    if (!current) return false;
    const at = Date.now();
    const parsed = brandIndexInputSchema.safeParse({ ...current, observations: [
      ...current.observations.filter(item => item.target_id !== targetId),
      { target_id: targetId, status, source_url: source.trim() || null, reported_at: new Date(at).toISOString() },
    ] });
    if (!parsed.success) return false;
    inputRef.current = parsed.data; setInput(parsed.data); setNow(at); return true;
  }
  function reset() { inputRef.current = null; setInput(null); setConfirmReset(false); setInvalidFields([]); }
  const isInvalid = (name: string) => invalidFields.includes(name);

  return <main className="mx-auto w-full max-w-6xl px-4 py-6 pb-20 sm:px-6" aria-labelledby="brand-index-title">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><Link to="/brand-index" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary"><ArrowLeft aria-hidden="true" className="h-4 w-4 shrink-0" />{brandLookupCopy[language].returnLookup}</Link><LanguageSwitcher /></div>
    <header className="max-w-3xl"><p className="text-sm font-semibold text-primary">{c.eyebrow}</p><h1 id="brand-index-title" className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{c.title}</h1><p className="mt-4 text-base leading-7 text-muted-foreground">{c.intro}</p></header>
    <BrandWorkspaceEntry />
    <aside className="my-6 rounded-2xl border border-border p-4" aria-labelledby="brand-index-warning"><h2 id="brand-index-warning" className="text-sm font-semibold">{c.warning}</h2><details className="mt-2"><summary className="min-h-11 cursor-pointer py-2 text-sm text-muted-foreground">{c.privacy}</summary><p className="mt-2 max-w-3xl text-sm leading-6">{c.warningBody}</p></details></aside>
    {!result ? <form onSubmit={build} noValidate className="min-w-0 space-y-6" aria-labelledby="brand-index-scope-title">
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6"><h2 id="brand-index-scope-title" className="mb-5 text-xl font-semibold">{c.scopeTitle}</h2>
        <div className="grid min-w-0 gap-5 sm:grid-cols-2">
          <label className="min-w-0 text-sm font-semibold" htmlFor="brand-index-name">{c.brand}<input ref={nameFieldRef} id="brand-index-name" name="brand_name" className={field} value={brandName} required maxLength={100} autoComplete="off" aria-invalid={isInvalid("brand_name")} onChange={event => setBrandName(event.target.value)} /></label>
          <label className="min-w-0 text-sm font-semibold" htmlFor="brand-index-identity">{c.identity}<input id="brand-index-identity" name="identity_label" className={field} value={identity} required maxLength={63} autoComplete="off" autoCapitalize="none" spellCheck={false} aria-invalid={isInvalid("identity_label")} aria-describedby="brand-index-identity-help" onChange={event => setIdentity(event.target.value)} /><span id="brand-index-identity-help" className="mt-2 block text-xs font-normal leading-5 text-muted-foreground">{c.identityHelp}</span></label>
          <label className="min-w-0 text-sm font-semibold" htmlFor="brand-index-primary">{c.primary}<input id="brand-index-primary" name="primary_domain" className={field} value={primary} required maxLength={253} autoComplete="off" autoCapitalize="none" spellCheck={false} aria-invalid={isInvalid("primary_domain")} aria-describedby="brand-index-domain-help" onChange={event => setPrimary(event.target.value)} /><span id="brand-index-domain-help" className="mt-2 block text-xs font-normal leading-5 text-muted-foreground">{c.domainHelp}</span></label>
          <label className="min-w-0 text-sm font-semibold" htmlFor="brand-index-domains">{c.domains}<textarea id="brand-index-domains" name="domains" className={field} value={extraDomains} rows={3} maxLength={5100} autoComplete="off" autoCapitalize="none" spellCheck={false} aria-invalid={isInvalid("domains")} aria-describedby="brand-index-domains-help" onChange={event => setExtraDomains(event.target.value)} /><span id="brand-index-domains-help" className="mt-2 block text-xs font-normal leading-5 text-muted-foreground">{c.domainsHelp}</span></label>
        </div>
      </section>
      <fieldset className="min-w-0 rounded-2xl border border-border bg-card px-5 pb-5 pt-2" aria-describedby="brand-index-social-help"><legend className="px-1 text-base font-semibold">{c.socials}</legend><p id="brand-index-social-help" className="mt-2 text-sm leading-6 text-muted-foreground">{c.socialsHelp}</p><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{SOCIAL_PLATFORMS.map(platform => <div key={platform} className="min-w-0 rounded-xl border border-border p-3"><label className="flex min-h-11 items-center gap-3 text-sm font-semibold"><input type="checkbox" data-brand-platform={platform} checked={platforms.includes(platform)} disabled={platforms.length === 1 && platforms[0] === platform} onChange={() => setPlatforms(previous => previous.includes(platform) ? previous.length > 1 ? previous.filter(value => value !== platform) : previous : [...previous, platform])} className="h-4 w-4 shrink-0" />{socialPlatformNames[platform]}</label><label htmlFor={`brand-handle-${platform}`} className="mt-2 block text-xs text-muted-foreground">{c.handle} · {socialPlatformNames[platform]}<input id={`brand-handle-${platform}`} className={field} value={handles[platform] ?? ""} placeholder={identity || undefined} maxLength={100} autoComplete="off" autoCapitalize="none" spellCheck={false} disabled={!platforms.includes(platform)} aria-invalid={isInvalid("socials") && platforms.includes(platform)} onChange={event => setHandles(previous => ({ ...previous, [platform]: event.target.value }))} /></label></div>)}</div></fieldset>
      <NamePackageMarkets markets={markets} onChange={setMarkets} language={language} />
      {invalidFields.length > 0 && <p role="alert" className="rounded-xl border border-destructive/40 bg-card p-4 text-sm leading-6">{c.invalid}</p>}
      <Button type="submit" className={action}><ClipboardList aria-hidden="true" className="h-4 w-4 shrink-0" />{c.build}</Button>
    </form> : <section aria-labelledby="brand-index-result-title" className="space-y-5" data-brand-index-result>
      <header className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><h2 ref={resultHeadingRef} tabIndex={-1} id="brand-index-result-title" className="scroll-mt-6 text-xl font-semibold">{c.results}</h2><p className="mt-2 break-words text-2xl font-semibold">{result.brand.name}</p><p className="mt-2 break-all text-sm text-muted-foreground">{result.brand.primary_domain}</p></div><Button type="button" variant="outline" className={action} onClick={() => setConfirmReset(true)}>{c.edit}</Button></header>
      {confirmReset && <section className="rounded-xl border border-border bg-card p-5" aria-label={c.edit}><p role="alert" className="text-sm leading-6">{c.resetWarning}</p><div className="mt-3 flex flex-wrap gap-3"><Button type="button" variant="outline" className={action} onClick={reset}>{c.reset}</Button><Button type="button" variant="ghost" className={action} onClick={() => setConfirmReset(false)}>{c.cancel}</Button></div></section>}
      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{c.fixed}</p>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2"><section className="min-w-0 rounded-2xl border border-primary/30 bg-card p-5" aria-labelledby="brand-index-reported-title"><h3 id="brand-index-reported-title" className="text-sm font-semibold">{c.reportedScore}</h3><p data-brand-reported-score={result.index.reported_score ?? "unavailable"} className={`mt-3 font-semibold ${result.index.reported_score === null ? "text-lg" : "text-4xl"}`}>{result.index.reported_score === null ? c.notEnough : `${result.index.reported_score} / ${result.index.maximum}`}</p><p className="mt-3 text-xs leading-5 text-muted-foreground">{c.threshold}</p></section><section className="min-w-0 rounded-2xl border border-border bg-card p-5" aria-labelledby="brand-index-verified-title"><h3 id="brand-index-verified-title" className="text-sm font-semibold">{c.verifiedScore}</h3><p data-brand-verified-score="unavailable" className="mt-3 text-lg font-semibold">{c.notVerified}</p><p className="mt-3 text-xs leading-5 text-muted-foreground">{c.warningBody}</p></section></div>
      <dl className="grid grid-cols-2 gap-3 rounded-2xl border border-border bg-card p-5 sm:grid-cols-3"><div><dt className="text-xs text-muted-foreground">{c.targetCount}</dt><dd data-brand-target-count className="mt-1 text-xl font-semibold">{result.counts.requested}</dd></div><div><dt className="text-xs text-muted-foreground">{c.reportedCoverage}</dt><dd data-brand-reported-coverage className="mt-1 text-xl font-semibold">{result.index.reported_coverage_percent}%</dd></div><div><dt className="text-xs text-muted-foreground">{c.verifiedCoverage}</dt><dd className="mt-1 text-xl font-semibold">0%</dd></div><div><dt className="text-xs text-muted-foreground">{c.unassessed}</dt><dd className="mt-1 text-xl font-semibold">{result.counts.unassessed}</dd></div><div><dt className="text-xs text-muted-foreground">{c.conflicts}</dt><dd className="mt-1 text-xl font-semibold">{result.counts.conflicts}</dd></div><div><dt className="text-xs text-muted-foreground">{c.stale}</dt><dd className="mt-1 text-xl font-semibold">{result.counts.stale}</dd></div></dl>
      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{c.coverageHelp}</p>
      <details className="rounded-xl border border-border p-4"><summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">{c.parts}</summary><dl className="space-y-3 text-sm">{([["domains", c.domainPart], ["socials", c.socialPart], ["markets", c.marketPart], ["consistency", c.consistencyPart]] as const).map(([key, text]) => <div key={key} className="flex items-start justify-between gap-3"><dt>{text}</dt><dd className="shrink-0 tabular-nums">{result.subscores[key].score} / {result.subscores[key].max}</dd></div>)}</dl><p className="mt-4 text-xs leading-5 text-muted-foreground">{c.methodology}: {result.methodology_version}</p><details className="mt-3"><summary className="cursor-pointer py-2 text-xs font-medium">{c.compareKey}</summary><p data-brand-comparison-key className="mt-2 break-all text-xs text-muted-foreground">{result.scope.comparison_key}</p></details></details>
      <section aria-labelledby="brand-index-review-title"><h3 id="brand-index-review-title" className="text-lg font-semibold">{c.review}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{c.recordHelp}</p><div className="mt-4 space-y-4">{(["domain", "social", "market"] as const).map(kind => <details key={kind} className="min-w-0 rounded-2xl border border-border bg-card p-4" open={kind === "domain"}><summary className="min-h-11 cursor-pointer py-2 text-base font-semibold">{c.groups[kind]} ({result.targets.filter(target => target.kind === kind).length})</summary>{kind === "market" && <p className="mt-2 text-sm leading-6 text-muted-foreground">{c.countryHelp}</p>}<div className="mt-3 space-y-3">{result.targets.filter(target => target.kind === kind).map(target => <TargetReport key={target.id} target={target} language={language} onRecord={(status, source) => record(target.id, status, source)} />)}</div></details>)}</div></section>
      <section className="rounded-2xl border border-border bg-secondary/30 p-5"><h3 className="font-semibold">{c.next}</h3><p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">{c.gaps}</p></section>
    </section>}
    <Link to="/name-packages" className="mt-8 inline-flex min-h-11 max-w-full items-start gap-2 py-2 text-sm font-semibold text-primary underline underline-offset-4"><span className="min-w-0">{c.packages}</span><ArrowRight aria-hidden="true" className="mt-1 h-4 w-4 shrink-0" /></Link>
  </main>;
}

function TargetReport({ target, language, onRecord }: { target: Target; language: Language; onRecord: (status: ReportStatus, source: string) => boolean }) {
  const c = brandIndexCopy[language];
  const [status, setStatus] = useState<ReportStatus>(target.reported_status), [source, setSource] = useState(target.source_url ?? ""), [notice, setNotice] = useState<boolean | null>(null);
  const identifier = target.kind === "market" && target.market ? `${namePackageCountryName(target.market, language)} (${target.market})`
    : target.kind === "social" && target.platform ? `${socialPlatformNames[target.platform]} · @${target.identifier}` : target.identifier;
  const suffix = encodeURIComponent(target.id);
  return <details data-brand-target={target.id} className="min-w-0 rounded-xl border border-border p-4"><summary className="min-h-11 cursor-pointer break-words py-2 text-sm font-semibold">{identifier}<span className="mt-1 block text-xs font-normal text-muted-foreground">{c.statuses[target.reported_status]} · {c.freshness[target.status_freshness]}</span></summary>
    <form onSubmit={event => { event.preventDefault(); setNotice(onRecord(status, source)); }} noValidate className="mt-3 space-y-4">
      <label htmlFor={`brand-status-${suffix}`} className="block text-sm font-medium">{c.status}<select id={`brand-status-${suffix}`} data-brand-status className={field} value={status} onChange={event => { setStatus(event.target.value as ReportStatus); setNotice(null); }}>{BRAND_INDEX_STATUSES.map(value => <option key={value} value={value}>{c.statuses[value]}</option>)}</select></label>
      <label htmlFor={`brand-source-${suffix}`} className="block text-sm font-medium">{c.source}<input id={`brand-source-${suffix}`} data-brand-source type="url" className={field} value={source} maxLength={512} autoComplete="off" autoCapitalize="none" spellCheck={false} aria-describedby={`brand-source-help-${suffix}`} aria-invalid={notice === false} onChange={event => { setSource(event.target.value); setNotice(null); }} /><span id={`brand-source-help-${suffix}`} className="mt-2 block text-xs font-normal leading-5 text-muted-foreground">{c.sourceHelp}</span></label>
      <Button type="submit" variant="outline" className={action}>{c.record}</Button>
      {target.reported_at && <p className="text-xs leading-5 text-muted-foreground">{c.reportedTime}: <time dateTime={target.reported_at}>{formatLocalizedDateTime(target.reported_at, language)}</time></p>}
      {notice !== null && <p role={notice ? "status" : "alert"} className="text-sm leading-6">{notice ? c.saved : c.invalidReport}</p>}
    </form>
  </details>;
}
