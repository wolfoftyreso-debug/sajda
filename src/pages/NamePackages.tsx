import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, Download, LoaderCircle, PackageCheck, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import AiPrivacyControl from "@/components/AiPrivacyControl";
import FreeSearchGate from "@/components/FreeSearchGate";
import TLDSelector from "@/components/TLDSelector";
import NamePackageMarkets, { NamePackageMarketReview } from "@/components/NamePackageMarkets";
import { useAuth } from "@/contexts/AuthContext";
import { useScan } from "@/contexts/ScanContext";
import { useLanguage, type Language } from "@/i18n/LanguageProvider";
import { namePackagesCopy } from "@/i18n/namePackagesCopy";
import { namePackageResultCopy } from "@/i18n/namePackageResultCopy";
import NamePackageResultSummary from "@/components/NamePackageResultSummary";
import { brandLookupCopy } from "@/i18n/brandLookupCopy";
import { formatLocalizedDateTime } from "@/lib/localeFormat";
import { checkPackageSocials } from "@/lib/namePackageSocialClient";
import { nameProjectSearchEntry } from "@/lib/nameProjectSearch";
import { brandPackageSearchEntry } from "@/lib/brandPackageShortlist";
import { brandPackageLabel, brandPackageSeed, mergeBrandDomainChecks } from "@/lib/brandWorkspace";
import { runAnonymousSearch } from "@/lib/localTestSearch";
import { BrandIndexSummary, BrandPackageComparison } from "@/components/BrandIndexSummary";
import { SaveBrandPackageButton } from "@/components/SaveBrandPackageButton";
import { brandWorkspaceCopy } from "@/i18n/brandWorkspaceCopy";
import { nameLanguageCopy } from "@/i18n/nameLanguageCopy";
import { BRAND_NAME_LANGUAGES, type BrandNameLanguage } from "../../shared/name-languages";
import { buildNamePackageDomainCheckPlan } from "../../shared/brand-candidate-index";
import type { PackageDomainInput } from "../../shared/name-packages";
import type { BrandShortlistEntry } from "../../shared/name-projects";
import { exportNamePackageReport, packageDomainStatus, packageSocialStatus, socialPlatformNames } from "@/lib/namePackageExport";
import { marketCountText, namePackageMarketsCopy } from "@/i18n/namePackageMarketsCopy";
import { DEFAULT_NAME_PACKAGE_MARKETS, type NamePackageMarketCode } from "../../shared/name-package-markets";
import { isNativeApp } from "@/lib/appSurface";
import { nativeShareFile } from "@/lib/nativeTransport";
import { applyPackageObservations, buildNamePackages, normalizePackageEvidenceTimestamp, packageSocialUrl, SOCIAL_PLATFORMS, type NamePackage, type SocialObservation, type SocialPlatform } from "../../shared/name-packages";

const field = "mt-2 min-h-12 w-full min-w-0 rounded-xl border border-input bg-background px-4 py-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const action = "min-h-12 h-auto gap-2 whitespace-normal px-4 py-3";
const external = "inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary underline underline-offset-4";

export default function NamePackages() {
  const { user, loading } = useAuth();
  const { language } = useLanguage();
  if (loading) return <main className="mx-auto max-w-6xl px-4 py-8" aria-busy="true"><h1 className="text-3xl font-semibold">{namePackagesCopy[language].title}</h1><p role="status" className="mt-5">{namePackagesCopy[language].loading}</p></main>;
  // Account changes unmount all local input, exported data and late profile requests.
  return <Workspace key={`${user?.id ?? "guest"}:${Boolean(user?.email_verified)}`} accountId={user?.id ?? null} verified={Boolean(user?.email_verified) && !loading} language={language} />;
}

function Workspace({ accountId, verified, language }: { accountId: string | null; verified: boolean; language: Language }) {
  const c = namePackagesCopy[language];
  const resultCopy = namePackageResultCopy[language];
  const w = brandWorkspaceCopy[language];
  const languageCopy = nameLanguageCopy[language];
  const scan = useScan();
  const location = useLocation(), navigate = useNavigate();
  const initial = nameProjectSearchEntry(location.state, verified ? accountId : null);
  const savedEntry = brandPackageSearchEntry(location.state, verified ? accountId : null);
  const seed = brandPackageSeed(location.state);
  const [projectId, setProjectId] = useState(savedEntry?.project.id ?? initial?.project.id);
  const [mode, setMode] = useState<"idea" | "exact">(savedEntry || seed ? "exact" : "idea");
  const [theme, setTheme] = useState(savedEntry?.entry.label ?? seed ?? initial?.project.title ?? "");
  const [brief, setBrief] = useState(initial?.brief ?? "");
  const [criteria, setCriteria] = useState(initial?.criteria);
  const initialNameLanguage = savedEntry?.entry.nameLanguage ?? (initial?.project.languages.length === 1 ? initial.project.languages[0] : initial?.criteria.nameLanguage);
  const [nameLanguage, setNameLanguage] = useState<BrandNameLanguage>(() => BRAND_NAME_LANGUAGES.find(value => value === initialNameLanguage) ?? "en");
  const [savedLanguage, setSavedLanguage] = useState<{ label: string; nameLanguage: BrandNameLanguage } | null>(savedEntry?.entry.nameLanguage ? { label: savedEntry.entry.label, nameLanguage: savedEntry.entry.nameLanguage } : null);
  // Language describes the response's request, never the currently edited form.
  // A saved preference applies only after checking that exact saved label.
  const resultNameLanguage = scan.lastSearchOptions?.namePackages && !scan.lastSearchOptions.domains?.length ? scan.lastSearchOptions.nameLanguage
    : savedLanguage && scan.lastSearchOptions?.domains?.length && scan.lastSearchOptions.domains.every(domain => brandPackageLabel(domain) === savedLanguage.label) ? savedLanguage.nameLanguage : undefined;
  const [tlds, setTlds] = useState<string[]>(savedEntry?.entry.requiredTlds ?? ["com", "ai"]);
  const [markets, setMarkets] = useState<NamePackageMarketCode[]>(savedEntry?.entry.markets ?? [...DEFAULT_NAME_PACKAGE_MARKETS]);
  const [platforms, setPlatforms] = useState<SocialPlatform[]>(savedEntry?.entry.platforms ?? [...SOCIAL_PLATFORMS]);
  const [checkedRows, setCheckedRows] = useState<PackageDomainInput[]>([]);
  const [checking, setChecking] = useState<string | null>(null);
  const [checkNotice, setCheckNotice] = useState<"checked" | "checkFailed" | "exactInvalid" | null>(null);
  const [compared, setCompared] = useState<string[]>([]);
  const domainRequest = useRef<AbortController | null>(null);
  const [observations, setObservations] = useState<SocialObservation[]>([]);
  const [socialBusy, setSocialBusy] = useState(false);
  const [notice, setNotice] = useState<"invalid" | "searchError" | "githubError" | "githubDone" | "exportFailed" | null>(null);
  const [now, setNow] = useState(Date.now);
  const [editingSearch, setEditingSearch] = useState(Boolean(initial || savedEntry || seed));
  const request = useRef<AbortController | null>(null), searching = useRef(false), alive = useRef(true);
  const consumedProject = useRef<string | null>(null);
  const resultHeading = useRef<HTMLHeadingElement | null>(null), focusAfterSearch = useRef(false);
  const searchInput = useRef<HTMLInputElement | null>(null), focusSearchEditor = useRef(false);

  useEffect(() => {
    if (!editingSearch || !focusSearchEditor.current || !searchInput.current) return;
    focusSearchEditor.current = false;
    searchInput.current.focus({ preventScroll: true });
    searchInput.current.scrollIntoView({ block: "center", behavior: "auto" });
  }, [editingSearch]);

  function editResultSearch() {
    if (showSearch && searchInput.current) {
      searchInput.current.focus({ preventScroll: true });
      searchInput.current.scrollIntoView({ block: "center", behavior: "auto" });
      return;
    }
    focusSearchEditor.current = true;
    setEditingSearch(true);
  }

  useEffect(() => {
    alive.current = true;
    const updateAge = () => setNow(Date.now());
    const timer = window.setInterval(updateAge, 30_000);
    window.addEventListener("focus", updateAge);
    document.addEventListener("visibilitychange", updateAge);
    return () => { alive.current = false; request.current?.abort(); domainRequest.current?.abort(); window.clearInterval(timer); window.removeEventListener("focus", updateAge); document.removeEventListener("visibilitychange", updateAge); };
  }, []);
  useEffect(() => {
    // A valid handoff can arrive after auth has loaded. Invalid-owner data is
    // never displayed and is removed from history as well.
    const entryKey = `${location.key}:${accountId}`;
    if (consumedProject.current === entryKey || !location.state?.nameProject && !location.state?.brandPackageSeed) return;
    consumedProject.current = entryKey;
    if (savedEntry) { setTheme(savedEntry.entry.label); setTlds(savedEntry.entry.requiredTlds); setPlatforms(savedEntry.entry.platforms); setMarkets(savedEntry.entry.markets); setNameLanguage(savedEntry.entry.nameLanguage ?? "en"); setSavedLanguage(savedEntry.entry.nameLanguage ? { label: savedEntry.entry.label, nameLanguage: savedEntry.entry.nameLanguage } : null); setMode("exact"); setProjectId(savedEntry.project.id); setEditingSearch(true); }
    else if (seed) { setTheme(seed); setMode("exact"); setEditingSearch(true); }
    else if (initial) { setTheme(initial.project.title); setBrief(initial.brief); setCriteria(initial.criteria); setNameLanguage(BRAND_NAME_LANGUAGES.find(value => value === (initial.project.languages.length === 1 ? initial.project.languages[0] : initial.criteria.nameLanguage)) ?? "en"); setProjectId(initial.project.id); setEditingSearch(true); }
    navigate({ pathname: location.pathname, search: location.search, hash: location.hash }, { replace: true, state: null });
  }, [initial, savedEntry, seed, accountId, location.key, location.state, location.pathname, location.search, location.hash, navigate]);
  useEffect(() => {
    request.current?.abort(); request.current = null;
    setSocialBusy(false); setObservations([]); setNow(Date.now());
    domainRequest.current?.abort(); domainRequest.current = null; setChecking(null); setCheckedRows([]); setCompared([]); setCheckNotice(null);
    setNotice(current => current === "githubDone" || current === "githubError" ? null : current);
  }, [scan.isScanning, scan.resultsCheckedAt, verified]);

  // Receipt identifies a live response but never refreshes a cached registry observation.
  // Explicit null also prevents a restored row from using the legacy receipt fallback.
  const packageDomains = useMemo(() => mergeBrandDomainChecks(scan.domains.map(domain => ({ ...domain,
    checkedAt: scan.restoredResults || !scan.resultsCheckedAt ? null : normalizePackageEvidenceTimestamp(domain.checkedAt),
  })), checkedRows, checkedRows.map(row => row.domain)), [scan.domains, scan.restoredResults, scan.resultsCheckedAt, checkedRows]);
  const packages = useMemo(() => scan.isScanning ? [] : buildNamePackages(packageDomains, { platforms, requiredTlds: scan.lastSearchOptions?.tlds, observedAt: scan.resultsCheckedAt ?? null, now })
    .map(pkg => applyPackageObservations(pkg, observations, now)).sort((a, b) => b.packageScore - a.packageScore || b.fitScore - a.fitScore || a.label.localeCompare(b.label)),
  [scan.isScanning, packageDomains, scan.resultsCheckedAt, scan.lastSearchOptions?.tlds, platforms, observations, now]);
  const githubHandles = [...new Set(packages.slice(0, 5).flatMap(pkg => pkg.socials.filter(social => social.platform === "github" && social.formatValid && social.handle).map(social => social.handle!)))];
  const showSearch = editingSearch || scan.isScanning || packages.length === 0;
  useEffect(() => {
    if (!focusAfterSearch.current || scan.isScanning || !packages.length || !resultHeading.current) return;
    focusAfterSearch.current = false;
    resultHeading.current.focus({ preventScroll: true });
    resultHeading.current.scrollIntoView({ block: "start", behavior: "auto" });
  }, [editingSearch, scan.isScanning, packages.length]);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (searching.current || scan.isScanning || domainRequest.current) return;
    if (!theme.trim() || !tlds.length) { setNotice("invalid"); return; }
    const exactLabel = mode === "exact" ? brandPackageLabel(theme) : null;
    if (mode === "exact" && !exactLabel) { setCheckNotice("exactInvalid"); return; }
    setCheckNotice(null);
    request.current?.abort(); request.current = null; setSocialBusy(false); setObservations([]); setNotice(null);
    focusAfterSearch.current = false;
    searching.current = true;
    try {
      const started = await scan.startScan({ theme: exactLabel ?? theme.trim(), brief: brief.trim(), advanced: mode === "idea" && Boolean(brief.trim()), tlds: [...tlds],
        namePackages: mode === "idea", ...(mode === "idea" ? { nameLanguage } : {}), ...(exactLabel ? { domains: tlds.map(tld => `${exactLabel}.${tld}`) } : {}), ...(mode === "idea" && criteria ? { criteria } : {}) });
      if (alive.current && !started) setNotice("searchError");
      if (alive.current && started) { focusAfterSearch.current = true; setEditingSearch(false); }
    } catch { if (alive.current) setNotice("searchError"); }
    finally { searching.current = false; }
  }
  async function checkDomains(pkg: NamePackage) {
    if (domainRequest.current || scan.isScanning || searching.current) return;
    const plan = buildNamePackageDomainCheckPlan(pkg, { onlyMissing: false });
    if (!plan.batches.length) { setCheckNotice("checkFailed"); return; }
    const controller = new AbortController(); domainRequest.current = controller;
    setChecking(pkg.id); setCheckNotice(null);
    try {
      for (const batch of plan.batches) {
        if (controller.signal.aborted) return;
        const access = scan.requestAnonymousSearchAccess();
        if (!access) return;
        try {
          const response = await runAnonymousSearch([], batch.length, pkg.label, language, { domains: batch, signal: controller.signal });
          if (!alive.current || controller.signal.aborted || domainRequest.current !== controller) { access.release(); return; }
          const rows: PackageDomainInput[] = response.results.filter(row => batch.includes(row.domain)).map(row => ({
            domain: row.domain, status: row.status, availabilityVerified: row.authoritative, checkMethod: row.checkMethod,
            checkedAt: normalizePackageEvidenceTimestamp(row.checkedAt), source: row.source, namingScore: row.namingScore,
          }));
          if (!rows.length) throw new Error("No requested domain observations were returned.");
          if (rows.some(row => row.availabilityVerified && row.status !== "unknown")) access.complete(); else access.release();
          setCheckedRows(previous => mergeBrandDomainChecks(previous, rows, batch)); setNow(Date.now());
        } catch (error) { access.release(); throw error; }
      }
      if (alive.current && !controller.signal.aborted) setCheckNotice("checked");
    } catch { if (alive.current && !controller.signal.aborted) setCheckNotice("checkFailed"); }
    finally { if (alive.current && domainRequest.current === controller) { domainRequest.current = null; setChecking(null); } }
  }
  async function checkGithub(handles = githubHandles) {
    if (!accountId || !verified || scan.isScanning || request.current || !handles.length) return;
    const controller = new AbortController(); request.current = controller; setSocialBusy(true); setNotice(null);
    try {
      const result = await checkPackageSocials({ accountId, signal: controller.signal }, handles);
      if (!alive.current || controller.signal.aborted || request.current !== controller) return;
      setObservations(previous => [...previous.filter(item => !result.some(next => item.platform === next.platform && item.handle === next.handle)), ...result]);
      setNow(Date.now()); setNotice("githubDone");
    } catch { if (alive.current && !controller.signal.aborted && request.current === controller) setNotice("githubError"); }
    finally { if (alive.current && request.current === controller) { request.current = null; setSocialBusy(false); } }
  }
  async function download() {
    if (!packages.length || scan.isScanning || checking) return;
    try {
      // Re-evaluate age when exporting, including when a mobile tab was suspended.
      const at = Date.now();
      const current = buildNamePackages(packageDomains, { platforms, requiredTlds: scan.lastSearchOptions?.tlds, observedAt: scan.resultsCheckedAt ?? null, now: at }).map(pkg => applyPackageObservations(pkg, observations, at))
        .sort((a, b) => b.packageScore - a.packageScore || b.fitScore - a.fitScore || a.label.localeCompare(b.label));
      const report = exportNamePackageReport(current, language, new Date(at).toISOString(), markets);
      const filename = `sajda-name-packages-${new Date(at).toISOString().slice(0, 10)}.html`;
      if (isNativeApp) { await nativeShareFile(filename, report); return; }
      const url = URL.createObjectURL(new Blob([report], { type: "text/html;charset=utf-8" }));
      const link = document.createElement("a"); link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { if (alive.current) setNotice("exportFailed"); }
  }
  function togglePlatform(platform: SocialPlatform) {
    request.current?.abort(); request.current = null; setSocialBusy(false);
    setPlatforms(previous => previous.includes(platform) ? previous.filter(value => value !== platform) : [...previous, platform]);
  }
  return <main className="mx-auto w-full max-w-6xl px-4 py-6 pb-28 sm:px-6" aria-labelledby="name-packages-title">
    <Link to="/" className="mb-5 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary"><ArrowLeft className="h-4 w-4" aria-hidden="true" />{c.home}</Link>
    <header className="mb-5 max-w-3xl"><p className="mb-3 text-sm font-semibold text-primary">Sajda Brand Index</p><h1 id="name-packages-title" className="text-3xl font-semibold tracking-tight sm:text-4xl">{w.title}</h1><p className="mt-3 text-base leading-7 text-muted-foreground">{w.intro}</p><p className="mt-4 text-sm font-medium text-primary">{w.workflow}</p></header>
    <Link to="/brand-index" className="mb-5 inline-flex min-h-11 max-w-full items-center gap-2 text-sm font-semibold text-primary underline underline-offset-4">{brandLookupCopy[language].entry}</Link>
    {packages.length > 0 && <Button type="button" variant="outline" className={action + " mb-4"} aria-expanded={showSearch} aria-controls="package-search-form" onClick={() => setEditingSearch(value => !value)}>{showSearch ? c.hideSearch : c.editSearch}</Button>}
    {showSearch && <form id="package-search-form" onSubmit={event => void search(event)} noValidate className="rounded-2xl border border-border bg-card p-5 sm:p-7">
      <fieldset disabled={scan.isScanning || Boolean(checking)} className="min-w-0 space-y-5 disabled:opacity-70">
        <div className="grid grid-cols-1 gap-2 rounded-xl bg-muted/50 p-2 sm:grid-cols-2" aria-label={w.title}>{(["idea", "exact"] as const).map(value => <Button key={value} type="button" variant={mode === value ? "default" : "ghost"} aria-pressed={mode === value} className={action} onClick={() => { setMode(value); setCheckNotice(null); }}>{value === "idea" ? w.create : w.exact}</Button>)}</div>
        <label htmlFor="package-theme" className="block text-base font-semibold">{mode === "idea" ? c.theme : w.exactLabel}<input ref={searchInput} id="package-theme" name="theme" value={theme} maxLength={180} required autoComplete="off" className={field} aria-describedby="package-theme-hint" aria-invalid={notice === "invalid" && !theme.trim() || checkNotice === "exactInvalid"} onChange={event => { setTheme(event.target.value); setNotice(null); setCheckNotice(null); }} /><span id="package-theme-hint" className="mt-2 block text-sm font-normal leading-6 text-muted-foreground">{mode === "idea" ? c.themeHint : w.exactHint}</span></label>
        {mode === "idea" && <label htmlFor="package-brief" className="block text-sm font-semibold">{c.brief}<textarea id="package-brief" name="brief" value={brief} maxLength={4000} rows={3} className={field} aria-describedby="package-brief-hint" onChange={event => { setBrief(event.target.value); setCriteria(undefined); }} /><span id="package-brief-hint" className="mt-2 block text-sm font-normal leading-6 text-muted-foreground">{c.briefHint}</span></label>}
        {mode === "idea" && <label htmlFor="package-name-language" className="block text-sm font-semibold">{languageCopy.label}<select id="package-name-language" name="nameLanguage" value={nameLanguage} className={field + " sm:max-w-sm"} aria-describedby="package-name-language-hint" onChange={event => { const selected = BRAND_NAME_LANGUAGES.find(value => value === event.target.value); if (selected) setNameLanguage(selected); }}>
          {BRAND_NAME_LANGUAGES.map(value => <option key={value} value={value}>{languageCopy.names[value]}</option>)}
        </select><span id="package-name-language-hint" className="mt-2 block max-w-2xl text-sm font-normal leading-6 text-muted-foreground">{languageCopy.hint}</span></label>}
        <details className="rounded-xl border border-border p-4"><summary className="min-h-11 cursor-pointer text-sm font-semibold">{w.configure}<span className="mt-2 block text-xs font-normal text-muted-foreground">{tlds.map(tld => "." + tld).join(" · ")} · {marketCountText(namePackageMarketsCopy[language].selected, markets.length)}</span></summary>
        <div className="mt-4 space-y-5">
        <TLDSelector selectedTLDs={tlds} onToggleTLD={tld => setTlds(previous => previous.includes(tld) ? previous.filter(value => value !== tld) : [...previous, tld])} disabled={scan.isScanning} />
        <fieldset aria-describedby="package-platform-help"><legend className="text-sm font-semibold">{c.platforms}</legend><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">{SOCIAL_PLATFORMS.map(platform => <label key={platform} className="flex min-h-12 min-w-0 cursor-pointer items-center gap-3 rounded-xl border border-border px-3 py-2 text-sm"><input type="checkbox" checked={platforms.includes(platform)} onChange={() => togglePlatform(platform)} className="h-4 w-4 shrink-0" /><span className="break-words">{socialPlatformNames[platform]}</span></label>)}</div><p id="package-platform-help" className="mt-3 text-sm leading-6 text-muted-foreground">{c.platformHelp}</p></fieldset>
        <NamePackageMarkets markets={markets} onChange={setMarkets} language={language} disabled={scan.isScanning || Boolean(checking)} />
        </div></details>
        {mode === "idea" && <AiPrivacyControl compact />}
        <Button type="submit" className={action + " w-full sm:w-auto"}><Search className="h-4 w-4 shrink-0" aria-hidden="true" />{mode === "idea" ? c.find : w.exact}</Button>
      </fieldset>
      {scan.isScanning && <div className="mt-5 flex flex-wrap items-center gap-4"><p role="status" className="flex items-center gap-2 text-sm"><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />{c.searching}</p><Button type="button" variant="outline" className={action} onClick={() => scan.stopScan()}>{c.stop}</Button></div>}
    </form>}
    {notice && <p role={notice === "githubDone" ? "status" : "alert"} className="mt-5 rounded-xl border border-border bg-card p-4 text-sm leading-6">{notice === "searchError" ? packages.length > 0 ? resultCopy.failedRetained : resultCopy.failedEmpty : c[notice]}</p>}
    {checkNotice && <p role={checkNotice === "checked" ? "status" : "alert"} className="my-5 rounded-xl border border-border bg-card p-4 text-sm leading-6">{w[checkNotice]}</p>}
    {!scan.isScanning && !packages.length && <section className="mt-8 rounded-2xl border border-dashed border-border p-6"><PackageCheck className="mb-4 h-8 w-8 text-primary" aria-hidden="true" /><h2 className="text-xl font-semibold">{notice === "searchError" ? resultCopy.failedTitle : c.empty}</h2><p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">{notice === "searchError" ? resultCopy.failedNext : c.emptyHint}</p></section>}
    {packages.length > 0 && <section className="mt-5" aria-labelledby="package-results-title"><header className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 id="package-results-title" ref={resultHeading} tabIndex={-1} className="scroll-mt-24 text-2xl font-semibold outline-none">{c.results}</h2><Button type="button" variant="outline" className={action} onClick={() => void download()}><Download className="h-4 w-4 shrink-0" aria-hidden="true" />{isNativeApp ? c.share : c.download}</Button></header>
      <NamePackageResultSummary packages={packages} language={language} generatedSearch={scan.lastSearchOptions?.namePackages === true && !scan.lastSearchOptions.domains?.length} requiredTlds={scan.lastSearchOptions?.tlds} onEditSearch={editResultSearch} />
      {compared.length > 0 && <BrandPackageComparison packages={packages.filter(pkg => compared.includes(pkg.id))} language={language} now={now} onClear={() => setCompared([])} />}
      {githubHandles.length > 0 && <section className="mb-4 rounded-xl border border-border bg-card p-4" aria-label={c.github}><div className="flex flex-wrap items-center justify-between gap-3"><p className="max-w-2xl text-sm leading-6 text-muted-foreground">{c.githubShort}</p>{verified ? <Button type="button" variant="outline" className={action} disabled={socialBusy} onClick={() => void checkGithub()}>{socialBusy && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}{socialBusy ? c.githubBusy : c.github}</Button> : <Link className={external} to="/auth?next=%2Fname-packages">{c.signIn}</Link>}</div><details className="mt-2"><summary className="cursor-pointer py-2 text-xs font-medium text-primary">{c.githubDetails}</summary><p className="mt-2 text-sm leading-6 text-muted-foreground">{c.githubHelp}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">{c.quota}</p>{!verified && <p className="mt-2 text-sm">{c.githubSignIn}</p>}</details></section>}
      {scan.lastSearchOptions?.theme && <p className="mb-5 break-words text-sm text-muted-foreground">{c.resultsFor}: {scan.lastSearchOptions.theme}</p>}
      {resultNameLanguage && <p className="mb-5 text-sm text-muted-foreground" data-name-language={resultNameLanguage}>{languageCopy.result}: {languageCopy.names[resultNameLanguage]}</p>}
      <div className="grid min-w-0 items-start gap-5 xl:grid-cols-2">{packages.map(pkg => <PackageCard key={pkg.id} pkg={pkg} language={language} canCheck={verified && Boolean(accountId)} socialBusy={socialBusy} onCheck={handle => void checkGithub([handle])}
        now={now} selected={compared.includes(pkg.id)} compareDisabled={compared.length >= 3 && !compared.includes(pkg.id)}
        onCompare={() => setCompared(previous => previous.includes(pkg.id) ? previous.filter(id => id !== pkg.id) : previous.length < 3 ? [...previous, pkg.id] : previous)}
        checking={checking === pkg.id} domainBusy={Boolean(checking)} onCheckDomains={() => void checkDomains(pkg)}
        entry={{ label: pkg.label, requiredTlds: scan.lastSearchOptions?.tlds ?? tlds, platforms, markets, ...(resultNameLanguage ? { nameLanguage: resultNameLanguage } : {}), source: "user_supplied" }} projectId={projectId} />)}</div>
      <div className="mt-6"><NamePackageMarketReview markets={markets} language={language} /></div>
      <p className="mt-6 max-w-3xl text-sm leading-6 text-muted-foreground">{c.refreshHint}</p>
    </section>}
    <FreeSearchGate />
  </main>;
}

function PackageCard({ pkg, language, canCheck, socialBusy, onCheck, now, selected, compareDisabled, onCompare, checking, domainBusy, onCheckDomains, entry, projectId }: {
  pkg: NamePackage; language: Language; canCheck: boolean; socialBusy: boolean; onCheck: (handle: string) => void;
  now: number; selected: boolean; compareDisabled: boolean; onCompare: () => void; checking: boolean; domainBusy: boolean; onCheckDomains: () => void; entry: BrandShortlistEntry; projectId?: string;
}) {
  const c = namePackagesCopy[language];
  const w = brandWorkspaceCopy[language];
  const marketCopy = namePackageMarketsCopy[language];
  const githubHandle = pkg.socials.find(social => social.platform === "github" && social.formatValid)?.handle;
  const available = pkg.domains.filter(domain => domain.evidenceStatus === "fresh" && domain.availabilityVerified && domain.status === "available").length;
  const conflicts = pkg.socials.filter(social => social.status === "profile_found").length;
  return <article className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card p-5 sm:p-6" aria-label={pkg.displayName}>
    <header><h3 className="break-all text-2xl font-semibold tracking-tight">{pkg.displayName}</h3><p className="mt-2 break-all text-sm text-muted-foreground">{pkg.domains.map(domain => domain.domain).join(" · ")}</p></header>
    <BrandIndexSummary pkg={pkg} language={language} now={now} />
    <dl className="mt-4 space-y-2 text-sm"><div className="flex flex-wrap justify-between gap-x-4 gap-y-1"><dt className="font-medium">{c.domains}</dt><dd>{c.domainSummary.replace("{available}", String(available)).replace("{total}", String(pkg.domains.length))}</dd></div>{pkg.socials.length > 0 && <div className="flex flex-wrap justify-between gap-x-4 gap-y-1"><dt className="font-medium">{c.socials}</dt><dd>{conflicts ? c.profileConflicts.replace("{count}", String(conflicts)) : c.socialSummary}</dd></div>}</dl>
    <p className="mt-2 text-sm">{c.legalSummary}</p>
    <div className="mt-4 flex flex-wrap gap-2"><Button type="button" variant={selected ? "default" : "outline"} aria-pressed={selected} className={action} disabled={compareDisabled} onClick={onCompare}>{selected ? w.comparing : w.compare}</Button>
      <SaveBrandPackageButton entry={entry} projectId={projectId} className={action} />
      <Button type="button" variant="outline" className={action} disabled={domainBusy} onClick={onCheckDomains}>{checking && <LoaderCircle className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />}{checking ? w.checking : w.check}</Button></div>
    <p className="mt-3 text-xs leading-5 text-muted-foreground">{w.recheckHint}</p>
    <details className="mt-5 border-t border-border pt-3"><summary className="flex min-h-11 cursor-pointer list-item items-center text-sm font-semibold text-primary">{c.details}</summary><div className="mt-4 space-y-6">
      <section><h4 className="font-semibold">{c.domains}</h4><p className="mt-2 text-xs text-muted-foreground">{c.domainReceiptTime}: {pkg.observedAt ? formatLocalizedDateTime(pkg.observedAt, language) : c.noTime}</p><ul className="mt-3 space-y-3">{pkg.domains.map(domain => <li key={domain.domain} className="rounded-xl border border-border p-3"><span className="block break-all font-medium">{domain.domain}</span><span className="mt-1 block text-sm text-muted-foreground">{packageDomainStatus(domain, c)}</span></li>)}</ul></section>
      {pkg.socials.length > 0 && <section><h4 className="font-semibold">{c.socials}</h4><ul className="mt-3 grid gap-3 sm:grid-cols-2">{pkg.socials.map(social => { const href = social.handle ? packageSocialUrl(social.platform, social.handle) : null; return <li key={social.platform} className="min-w-0 rounded-xl border border-border p-3"><strong className="text-sm">{socialPlatformNames[social.platform]}</strong><p className="mt-1 break-all font-medium">{social.handle ? `@${social.handle}` : "—"}</p><p className="mt-2 text-sm leading-6 text-muted-foreground">{packageSocialStatus(social, c)}</p>{social.checkedAt && <p className="mt-1 text-xs text-muted-foreground">{c.observed}: {formatLocalizedDateTime(social.checkedAt, language)}</p>}{href && <a className={external} href={href} target="_blank" rel="noopener noreferrer">{c.openProfile}<ArrowUpRight className="h-3 w-3 shrink-0" aria-hidden="true" /></a>}{social.alternatives.length > 0 && <details className="mt-2"><summary className="min-h-11 cursor-pointer text-xs leading-6">{c.alternatives}</summary><ul>{social.alternatives.map(alternative => <li key={alternative.handle}><a className={external + " break-all"} href={alternative.sourceUrl} target="_blank" rel="noopener noreferrer">@{alternative.handle}</a></li>)}</ul></details>}</li>; })}</ul></section>}
      {canCheck && githubHandle && <section className="rounded-xl border border-border p-4"><p className="text-sm leading-6 text-muted-foreground">{c.githubOneHelp}</p><Button type="button" variant="outline" className={action + " mt-3"} disabled={socialBusy} onClick={() => onCheck(githubHandle)}>{c.githubOne}</Button></section>}
      <section className="rounded-xl bg-muted/40 p-4"><h4 className="font-semibold">{c.company}</h4><p className="mt-2 text-sm font-medium">{c.manual}</p><p className="mt-2 text-sm leading-6 text-muted-foreground">{marketCopy.companyHelp}</p><a className={external} href="#package-market-review">{marketCopy.cardPointer}</a></section>
      <section className="rounded-xl bg-muted/40 p-4"><h4 className="font-semibold">{c.trademark}</h4><p className="mt-2 text-sm font-medium">{c.manual}</p><p className="mt-2 text-sm leading-6 text-muted-foreground">{marketCopy.trademarkHelp}</p><a className={external} href="#package-market-review">{marketCopy.cardPointer}</a></section>
      <section><h4 className="font-semibold">{c.scoreParts}</h4><p className="mt-2 text-sm leading-6 text-muted-foreground">{c.scoreHint}</p><p className="mt-2 text-sm leading-6 text-muted-foreground">{c.fitMethod}</p><p className="mt-2 text-sm leading-6 text-muted-foreground">{c.evidenceHint}</p><dl className="mt-4 space-y-2 text-sm">{([["fit", c.fitPart], ["domains", c.domainPart], ["socials", c.socialPart], ["company", c.companyPart], ["trademark", c.trademarkPart]] as const).map(([key, label]) => <div key={key} className="flex items-start justify-between gap-4"><dt>{label}</dt><dd className="shrink-0 tabular-nums">{pkg.scoreParts[key].score}/{pkg.scoreParts[key].max}</dd></div>)}<div className="flex items-start justify-between gap-4"><dt>{c.riskPenalty}</dt><dd>−{pkg.riskPenalty}</dd></div></dl><ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground">{pkg.reasonCodes.map(code => <li key={code}>{c.reasons[code]}</li>)}</ul></section>
    </div></details>
  </article>;
}
