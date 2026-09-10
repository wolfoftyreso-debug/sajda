import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowLeft, ArrowUpRight, Check, Download, FileSearch, LoaderCircle, RefreshCw, Search, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import AccountLink from "@/components/AccountLink";
import { tradingWorkspaceCopy } from "@/i18n/tradingWorkspaceCopy";
import PlusBilling from "@/components/PlusBilling";
import { isNativeApp } from "@/lib/appSurface";
import { nativeShareCsv } from "@/lib/nativeTransport";
import { nativeCopy } from "@/app/nativeCopy";
import TradingEvidenceSummary, { type TradingQuoteControls } from "@/components/TradingEvidenceSummary";
import { tradingText, tradingLocale, tradingRunCapacity, tradingOmittedRows, tradingShowMore } from "@/i18n/tradingEvidenceCopy";
import { filterTradingReport, tradingReportCsv, type TradingReportFilter } from "@/lib/tradingReport";
import { useAuth } from "@/contexts/AuthContext";
import { applyDocumentMetadata, useLanguage } from "@/i18n/LanguageProvider";
import { getLostDomainsCopy, type LostDomainsCopy } from "@/i18n/lostDomainsCopy";
import { changeLostDomains, freshReviewCandidates, getLostDomains, isFreshReviewCandidate, LostDomainsError,
  type LostDomainAssessment, type LostDomainsAction, type LostDomainsSnapshot } from "@/lib/lostDomains";

const panel = "rounded-2xl border border-border bg-card";
const button = "h-auto min-h-11 whitespace-normal px-4 py-3 text-center";
const link = "inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
type Report = Pick<LostDomainsSnapshot, "latestRun" | "candidates" | "candidatesOmitted" | "quoteUpdates">;
const DIAGNOSTICS_BATCH_SIZE = 50;
type OwnedData = { owner: string; snapshot: LostDomainsSnapshot; report: Report | null };

export default function LostDomains() {
  const { user, loading: authLoading, signOut } = useAuth();
  const { language } = useLanguage();
  const copy = getLostDomainsCopy(language);
  const ux = tradingWorkspaceCopy[language];
  const accountId = user?.id ?? null;
  const [data, setData] = useState<OwnedData | null>(null);
  const [busy, setBusy] = useState<"load" | LostDomainsAction["action"] | null>(null);
  const [error, setError] = useState<LostDomainsError | null>(null);
  const [paused, setPaused] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(false);
  const [billingRefreshOwner, setBillingRefreshOwner] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now);
  const [query,setQuery]=useState("");
  const [filter,setFilter]=useState<TradingReportFilter>("all");
  const [tld,setTld]=useState("");
  const [exportFailed,setExportFailed]=useState(false);
  const [exporting,setExporting]=useState(false);
  const exportPending=useRef(false);
  const [diagnosticsLimit,setDiagnosticsLimit]=useState(DIAGNOSTICS_BATCH_SIZE);
  const [quoteBusyDomain,setQuoteBusyDomain]=useState<string|null>(null);
  const [quoteErrorDomain,setQuoteErrorDomain]=useState<string|null>(null);
  const ownerRef = useRef(accountId);
  const lifetime = useRef<AbortController | null>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const cancelling = useRef(false);
  const logoutPending = useRef(false);
  const startKey = useRef<{ owner: string; key: string } | null>(null);
  const quoteKeys = useRef(new Map<string,string>());
  const snapshot = data?.owner === accountId ? data.snapshot : null;
  const report = data?.owner === accountId ? data.report : null;
  const activeRun = snapshot?.activeRun ?? null;
  const time = useCallback((value: string) => new Intl.DateTimeFormat(tradingLocale[language], {
    dateStyle: "medium", timeStyle: "short",
  }).format(new Date(value)), [language]);

  useEffect(() => {
    applyDocumentMetadata(language, "/plus");
    return () => applyDocumentMetadata(language, window.location.pathname);
  }, [language]);

  useLayoutEffect(() => {
    ownerRef.current = accountId;
    activeRequest.current?.abort(); activeRequest.current = null;
    lifetime.current?.abort(); lifetime.current = new AbortController();
    startKey.current = null;
    quoteKeys.current.clear();setQuoteBusyDomain(null);setQuoteErrorDomain(null);
    cancelling.current = false;
    logoutPending.current = false;
    setSigningOut(false); setSignOutError(false);
    setBillingRefreshOwner(null);
    setData(null); setError(null); setBusy(null); setPaused(false);
    setQuery("");setFilter("all");setTld("");setExportFailed(false);setExporting(false);
    setDiagnosticsLimit(DIAGNOSTICS_BATCH_SIZE);
    return () => { lifetime.current?.abort(); activeRequest.current?.abort(); };
  }, [accountId]);

  const request = useCallback(async (action?: LostDomainsAction, replace = false) => {
    if (!accountId || ownerRef.current !== accountId || lifetime.current?.signal.aborted || logoutPending.current) return;
    if (activeRequest.current && !replace) return;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    const isCurrent = () => !controller.signal.aborted && ownerRef.current === accountId && activeRequest.current === controller
      && !lifetime.current?.signal.aborted;
    const scope = { accountId, signal: controller.signal };
    setBusy(action?.action ?? "load"); setError(null);
    if(action?.action==="refresh_quote"){setQuoteBusyDomain(action.domain);setQuoteErrorDomain(null);}
    const accept = (response: LostDomainsSnapshot) => {
      if (!isCurrent()) return;
      setData(previous => {
        if (!response.access) return { owner: accountId, snapshot: response, report: null };
        const prior = previous?.owner === accountId ? previous.report : null;
        // Keep the useful report when an attempt is cancelled or fails. Starting
        // or advancing another run must never wipe the previous findings.
        const hasReport = response.latestRun && ["succeeded", "partial"].includes(response.latestRun.status);
        return { owner: accountId, snapshot: response,
          report: hasReport ? { latestRun: response.latestRun, candidates: response.candidates, candidatesOmitted: response.candidatesOmitted, quoteUpdates:response.quoteUpdates } : prior };
      });
      if(response.latestRun)for(const [domain,update] of Object.entries(response.quoteUpdates??{})){
        if(update.status!=="pending")quoteKeys.current.delete(`${response.latestRun.id}:${domain}`);
        setQuoteErrorDomain(previous=>previous===domain?null:previous);
      }
      setNow(Date.now());
      if (action?.action === "start" || response.activeRun) startKey.current = null;
      if (action?.action !== "cancel") setPaused(false);
    };
    try {
      const response = action ? await changeLostDomains(scope, action) : await getLostDomains(scope);
      accept(response);
    } catch (cause) {
      if (!isCurrent()) return;
      let failure = cause instanceof LostDomainsError ? cause : new LostDomainsError("unavailable");
      if(action?.action==="refresh_quote"){
        if(failure.code==="quote_request_expired")quoteKeys.current.delete(`${action.runId}:${action.domain}`);
        else setQuoteErrorDomain(action.domain);
      }
      if (failure.code === "run_conflict") {
        // A second tab may already own a durable run. Join its current snapshot
        // without another start, another idempotency key, or unbounded retries.
        try { accept(await getLostDomains(scope)); return; }
        catch (recovery) {
          if (!isCurrent()) return;
          failure = recovery instanceof LostDomainsError ? recovery : new LostDomainsError("unavailable");
        }
      }
      setError(failure); setPaused(true);
      if (["account_changed", "unauthenticated", "plus_required"].includes(failure.code)) setData(null);
    } finally {
      if (isCurrent()) { activeRequest.current = null; cancelling.current = false; setBusy(null);setQuoteBusyDomain(null); }
    }
  }, [accountId]);

  useEffect(() => { if (!authLoading && accountId) void request(); }, [accountId, authLoading, request]);
  const billingStatusVerified = useCallback((verifiedOwner: string) => {
    if (ownerRef.current === verifiedOwner && !lifetime.current?.signal.aborted) setBillingRefreshOwner(verifiedOwner);
  }, []);
  useEffect(() => {
    if (!accountId || billingRefreshOwner !== accountId || authLoading || busy || signingOut) return;
    setBillingRefreshOwner(null);
    // Billing may have reconciled a delayed payment after our initial snapshot.
    // Read permission again from the server; never infer Plus from UI billing state.
    void request();
  }, [accountId, billingRefreshOwner, authLoading, busy, signingOut, request]);
  useEffect(() => {
    // No guest crawl, no automatic start, no intervals after leaving the page.
    if (!accountId || !snapshot?.access || !snapshot.enabled || !activeRun || paused || busy) return;
    const waiting = activeRun.nextCheckAt && Date.parse(activeRun.nextCheckAt) > Date.now();
    const timer = window.setTimeout(() => {
      // Deliberate temporal gaps are not failures. Refresh status without
      // spending mutation/rate-limit budget while the next check is not due.
      if (activeRun.nextCheckAt && Date.parse(activeRun.nextCheckAt) > Date.now()) void request();
      else void request({ action: "advance", runId: activeRun.id });
    }, waiting ? 30_000 : 10_000);
    return () => window.clearTimeout(timer);
  }, [accountId, snapshot?.access, snapshot?.enabled, activeRun, paused, busy, request]);
  useEffect(() => {
    if (!report) return;
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [report]);

  const filtered=useMemo(()=>filterTradingReport(report?.candidates??[],query,filter,tld,now),[report,query,filter,tld,now]);
  const candidates = useMemo(() => freshReviewCandidates(filtered, now), [filtered, now]);
  const candidateNames = new Set(candidates.map(row => row.domain));
  const diagnostics = filtered.filter(row => !candidateNames.has(row.domain));
  const visibleDiagnostics = diagnostics.slice(0,diagnosticsLimit);
  useEffect(() => { setDiagnosticsLimit(DIAGNOSTICS_BATCH_SIZE); }, [query,filter,tld,report?.latestRun?.id,accountId]);
  const tlds=[...new Set((report?.candidates??[]).map(row=>row.domain.split(".").at(-1)!))].sort();
  const priorityCount=(report?.candidates??[]).filter(row=>isFreshReviewCandidate(row,now)&&row.opportunity?.tier==="priority_review").length;
  const changedCount=(report?.candidates??[]).filter(row=>row.observationHistory?.registryChanged).length;
  const strongFitCount=filterTradingReport(report?.candidates??[],"","strong_fit","").length;
  const reviewCount = freshReviewCandidates(report?.candidates ?? [], now).length;
  const waiting = Boolean(activeRun?.nextCheckAt && Date.parse(activeRun.nextCheckAt) > now);
  // Unknown membership is neither guest access nor a failed subscription.
  const workspaceState = authLoading || accountId && !snapshot && !error ? "loading"
    : !accountId ? "guest" : !snapshot ? "error" : !snapshot.access ? "locked"
    : !snapshot.enabled || !snapshot.sourcesAvailable ? "unavailable"
    : activeRun ? paused ? "paused" : waiting ? "waiting" : "running"
    : report?.latestRun ? "results" : "ready";
  const showAccessOptions = !authLoading && (!accountId || snapshot?.access === false);
  const canStart = snapshot?.access && snapshot.enabled && snapshot.sourcesAvailable > 0 && !activeRun;
  const primaryLink = `${button} inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-auto`;
  async function exportReport() {
    if(!report?.latestRun || !snapshot?.access || data?.owner!==accountId || !filtered.length || exportPending.current) return;
    const owner=accountId;
    const signal=lifetime.current?.signal;
    const isCurrent=()=>ownerRef.current===owner&&!signal?.aborted;
    exportPending.current=true;setExporting(true);setExportFailed(false);
    let url:string|undefined;
    try {
      const filename=`sajda-research-${report.latestRun.id}.csv`;
      const csv="\uFEFF"+tradingReportCsv(filtered);
      if(isNativeApp){
        // WKWebView cannot save blob downloads with the website anchor flow.
        // The user chooses whether and where to share/save in the iOS sheet.
        await nativeShareCsv(filename,csv);
        return;
      }
      url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
      const anchor=document.createElement("a");anchor.href=url;anchor.download=filename;
      anchor.click();setExportFailed(false);
      const objectUrl=url;window.setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);
    } catch { if(url) URL.revokeObjectURL(url);if(isCurrent())setExportFailed(true); }
    finally {exportPending.current=false;if(isCurrent())setExporting(false);}
  }
  const attributedSources = [...new Set((report?.candidates ?? []).flatMap(row => {
    try { const url = new URL(row.sourceUrl); return url.protocol === "https:" && url.hostname === "awesome-selfhosted.net" ? [url.href] : []; }
    catch { return []; }
  }))];
  function start() {
    if (!accountId || activeRequest.current || !snapshot?.access || !snapshot.enabled || !snapshot.sourcesAvailable || activeRun) return;
    // An uncertain start retries the same immutable logical request. Nothing is
    // persisted in browser storage; account changes always discard this key.
    try {
      startKey.current ??= { owner: accountId, key: crypto.randomUUID() };
      if (startKey.current.owner !== accountId) return;
      void request({ action: "start", requestKey: startKey.current.key });
    } catch { setError(new LostDomainsError("unavailable")); }
  }
  function stop() {
    if (!activeRun || cancelling.current) return;
    cancelling.current = true;
    setPaused(true);
    // Aborting the browser request alone does not cancel durable server work.
    // Send and confirm a separate cancellation; never claim a local abort did it.
    void request({ action: "cancel", runId: activeRun.id }, true);
  }
  function refreshQuote(domain:string){
    if(!accountId || activeRequest.current || !snapshot?.access || !snapshot.enabled || !snapshot.quoteRefreshEnabled || !report?.latestRun || logoutPending.current) return;
    const candidate=report.candidates.find(row=>row.domain===domain);
    if(!candidate || candidate.sensitive || candidate.risk.level==="excluded" || candidate.dossier?.status==="reject" || report.quoteUpdates?.[domain]?.status==="pending")return;
    const identity=`${report.latestRun.id}:${domain}`;
    try{
      if(!quoteKeys.current.has(identity))quoteKeys.current.set(identity,crypto.randomUUID());
      void request({action:"refresh_quote",runId:report.latestRun.id,domain,requestKey:quoteKeys.current.get(identity)!});
    }catch{setQuoteErrorDomain(domain);setError(new LostDomainsError("unavailable"));}
  }
  function quoteControls(candidate:LostDomainAssessment):TradingQuoteControls{
    return{enabled:snapshot?.quoteRefreshEnabled===true && snapshot.enabled,disabled:!!busy || signingOut,blocked:candidate.sensitive || candidate.risk.level==="excluded" || candidate.dossier?.status==="reject",
      busy:quoteBusyDomain===candidate.domain,uncertain:quoteErrorDomain===candidate.domain,update:report?.quoteUpdates?.[candidate.domain],
      onRefresh:()=>refreshQuote(candidate.domain),onStatus:()=>void request()};
  }
  async function leaveAccount() {
    if (!accountId || logoutPending.current) return;
    logoutPending.current = true;
    setSigningOut(true); setSignOutError(false); setPaused(true);
    activeRequest.current?.abort(); activeRequest.current = null; setBusy(null);
    const scope = lifetime.current;
    try { await signOut(); }
    catch {
      if (ownerRef.current === accountId && !scope?.signal.aborted) setSignOutError(true);
    } finally {
      if (ownerRef.current === accountId && !scope?.signal.aborted) {
        logoutPending.current = false; setSigningOut(false);
      }
    }
  }

  return <main className="min-h-screen bg-background text-foreground">
    <div className="mx-auto w-full max-w-6xl px-4 pb-14 pt-7 sm:px-6 lg:px-8">
      {!isNativeApp && <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <Link to="/" className={link}><ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />{copy.back}</Link>
        <div className="flex flex-wrap items-center gap-2"><AccountLink /><LanguageSwitcher /></div>
      </div>}
      <header className={isNativeApp ? "pb-5" : "pb-5 pt-6"}>
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">Trading</h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">{ux.intro}</p>
        </div>
      </header>

      <section className="pb-8" aria-labelledby="plus-workspace-title">
        <section data-testid="trading-next-step" data-state={workspaceState} className={`${panel} border-primary/25 bg-primary/[0.035] p-5 sm:p-7`} aria-labelledby="plus-workspace-title">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">{ux.nextStep}</p>
          <h2 id="plus-workspace-title" className="mt-2 text-2xl font-semibold leading-tight tracking-tight">
            {({ loading: ux.accessLoading, guest: ux.guestTitle, error: ux.accessErrorTitle, locked: ux.accessTitle,
              unavailable: ux.unavailableTitle, ready: ux.readyTitle, running: ux.runningTitle, waiting: ux.waitingTitle,
              paused: ux.pausedTitle, results: reviewCount ? ux.resultsTitle : ux.noCandidatesTitle })[workspaceState]}
          </h2>
          {workspaceState === "loading" ? <div className="mt-4 flex items-center gap-3 text-sm text-muted-foreground" role="status"><LoaderCircle className="h-5 w-5 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />{copy.load}</div>
            : <>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                {workspaceState === "guest" ? ux.guestBody : workspaceState === "locked" ? copy.lockedBody
                  : workspaceState === "unavailable" ? !snapshot?.enabled ? copy.disabled : copy.noSources
                  : workspaceState === "results" ? reviewCount ? ux.resultsBody : ux.noCandidatesBody
                  : activeRun ? waiting ? copy.waitingNote : ux.runningBody
                  : workspaceState === "ready" ? ux.readyBody : null}
              </p>
              {activeRun && waiting && activeRun.nextCheckAt && <p className="mt-2 text-sm font-medium">{copy.waitingForCheck}: <time dateTime={activeRun.nextCheckAt}>{time(activeRun.nextCheckAt)}</time></p>}
              {report?.latestRun && !activeRun && <p className="mt-2 text-sm font-medium">{report.candidates.length} {tradingText(copy.locale, "Domains in this report")} · {reviewCount} {copy.reviews}</p>}
              <div className="mt-5 flex flex-col flex-wrap gap-3 sm:flex-row sm:items-center">
                {workspaceState === "guest" && <Link className={primaryLink} to="/auth?next=%2Fplus">{ux.signIn}<ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden="true" /></Link>}
                {workspaceState === "locked" && <a className={primaryLink} href="#trading-access">{ux.accessOptions}<ArrowDown className="h-4 w-4 shrink-0" aria-hidden="true" /></a>}
                {snapshot?.access && activeRun && <a className={primaryLink} href="#trading-progress">{ux.viewProgress}<ArrowDown className="h-4 w-4 shrink-0" aria-hidden="true" /></a>}
                {snapshot?.access && report?.latestRun && !activeRun && <a className={primaryLink} href="#trading-results">{reviewCount ? ux.viewResults : ux.viewChecked}<ArrowDown className="h-4 w-4 shrink-0" aria-hidden="true" /></a>}
                {canStart && <Button variant={report?.latestRun ? "outline" : "default"} className={`${button} sm:min-w-52`} onClick={start} disabled={Boolean(busy) || signingOut}>
                  {busy === "start" ? <LoaderCircle className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Search className="h-4 w-4 shrink-0" aria-hidden="true" />}
                  {busy === "start" ? copy.pending : startKey.current ? copy.retryStart : report?.latestRun ? ux.newScan : ux.start}
                </Button>}
                {accountId && <Button variant={workspaceState === "error" || workspaceState === "unavailable" && !report ? "default" : "ghost"} className={button} disabled={Boolean(busy) || signingOut} onClick={() => void request()}><RefreshCw className="h-4 w-4 shrink-0" aria-hidden="true" />{copy.reload}</Button>}
              </div>
              {workspaceState === "ready" && <p className="mt-3 max-w-2xl text-xs leading-5 text-muted-foreground">{ux.timing}</p>}
            </>}
        </section>

        {error && <div className="mt-5 rounded-xl border border-destructive/25 bg-destructive/5 p-4" role="alert">
          <p className="text-sm font-medium leading-6">{copy.errors[error.code]}</p>
          {startKey.current && <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy.recovery}</p>}
          {error.requestId && <p className="mt-2 break-all text-xs text-muted-foreground">{copy.requestReference}: {error.requestId}</p>}
          {["unauthenticated", "account_changed"].includes(error.code) && <Link className={`${link} mt-2`} to="/auth?next=%2Fplus">{copy.signIn}</Link>}
        </div>}

        {snapshot?.access && <div className="mt-5 space-y-5">
          {activeRun && <section id="trading-progress" tabIndex={-1} className={`${panel} scroll-mt-6 p-5 outline-none sm:p-6`} aria-labelledby="plus-run-title" aria-busy={busy === "advance"}>
            <div className="flex flex-wrap items-center justify-between gap-3"><h3 id="plus-run-title" className="font-semibold">{copy.currentRun}</h3>
              <p className="inline-flex items-center gap-2 text-sm font-medium text-primary" role="status">
                {busy === "advance" && <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}{copy.status[activeRun.status]}</p></div>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">{copy.progressNote}</p>
            {activeRun.capacity && <p className="mt-2 text-xs leading-5 text-muted-foreground">{tradingRunCapacity(language, activeRun.capacity.sourceLimit, activeRun.capacity.candidateLimit, activeRun.verificationMaxRounds ?? 1)}</p>}
            {activeRun.verificationMaxRounds === 3 && <p className="mt-3 text-sm leading-6">{copy.deepSchedule}</p>}
            {activeRun.nextCheckAt && Date.parse(activeRun.nextCheckAt) > now && <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-4" role="status">
              <p className="text-sm font-semibold">{copy.waitingForCheck}</p><p className="mt-1 text-sm"><time dateTime={activeRun.nextCheckAt}>{time(activeRun.nextCheckAt)}</time></p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{copy.waitingNote}</p>
            </div>}
            {activeRun.status === "running" && <p className="mt-3 text-sm font-medium" role="status">{activeRun.verificationCount ? (tradingText(copy.locale, "Rechecking the highest-priority candidates with fresh registry and risk observations.")) : activeRun.candidateCount ? copy.checkingStage : copy.collecting}</p>}
            <dl className="mt-5 grid gap-4 sm:grid-cols-3">
              <Metric label={copy.checking} value={activeRun.candidateCount ? `${activeRun.completedCount} / ${activeRun.candidateCount}` : "—"} />
              <Metric label={copy.sources} value={String(activeRun.sourceCount)} />
              <Metric label={copy.failedChecks} value={String(activeRun.failedCount)} />
              {!!activeRun.verificationCount && <Metric label={tradingText(copy.locale, "Final rechecks")} value={`${activeRun.completedVerificationCount ?? 0} / ${activeRun.verificationCount}`} />}
              {activeRun.verificationMaxRounds !== undefined && <Metric label={copy.reviewRound} value={`${activeRun.verificationRound ?? 0} / ${activeRun.verificationMaxRounds}`} />}
            </dl>
            {activeRun.status === "queued" && <p className="mt-4 text-sm text-muted-foreground">{copy.queued}</p>}
            {paused && <p className="mt-4 text-sm leading-6 text-muted-foreground" role="status">{copy.paused}</p>}
            <div className="mt-5 flex flex-wrap items-center gap-3">
              {paused && <Button className={button} disabled={Boolean(busy) || !snapshot.enabled || signingOut} onClick={() => void request()}><RefreshCw className="h-4 w-4" aria-hidden="true" />{copy.resume}</Button>}
              <Button variant="outline" className={button} disabled={busy === "cancel" || signingOut} onClick={stop}><Square className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{busy === "cancel" ? copy.pending : copy.stop}</Button>
              <p className="text-xs text-muted-foreground">{copy.updated}: <time dateTime={activeRun.updatedAt}>{time(activeRun.updatedAt)}</time></p>
            </div>
          </section>}

          {snapshot.latestAttempt && ["failed", "cancelled"].includes(snapshot.latestAttempt.status) && <p className="rounded-xl border border-border p-4 text-sm leading-6" role="status">
            <span className="font-medium">{copy.status[snapshot.latestAttempt.status]} · {time(snapshot.latestAttempt.updatedAt)}</span><br />
            {snapshot.latestAttempt.status === "failed" ? copy.failedAttempt : copy.cancelledAttempt}
          </p>}

          {report?.latestRun ? <section id="trading-results" tabIndex={-1} aria-labelledby="plus-report-title" className={`${panel} scroll-mt-6 overflow-hidden outline-none`}>
            <header className="border-b border-border p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3"><h3 id="plus-report-title" className="text-xl font-semibold tracking-tight">{copy.report}</h3>
                <span className="text-sm text-muted-foreground">{copy.status[report.latestRun.status]}</span></div>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{ux.domainHint}</p>
              {report.latestRun.status === "partial" && <p className="mt-3 rounded-lg bg-secondary/60 p-3 text-sm leading-6" role="status">{copy.partialReport}</p>}
              {!!report.candidatesOmitted && <p className="mt-3 rounded-lg border border-border bg-secondary/60 p-3 text-sm leading-6" role="status">{tradingOmittedRows(language, report.candidatesOmitted)}</p>}
              <p className="mt-2 text-xs text-muted-foreground">{copy.completed}: <time dateTime={report.latestRun.completedAt ?? report.latestRun.updatedAt}>{time(report.latestRun.completedAt ?? report.latestRun.updatedAt)}</time></p>
              {!!report.latestRun.verificationCount && <p className="mt-2 text-xs text-muted-foreground">{tradingText(copy.locale, "Final rechecks")}: {report.latestRun.completedVerificationCount ?? 0} / {report.latestRun.verificationCount}</p>}
              <details className="mt-4 border-t border-border pt-1">
              <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{ux.filters}</summary>
              <dl className="mt-3 grid grid-cols-2 gap-5 lg:grid-cols-5">
                <Metric label={tradingText(copy.locale, "Domains in this report")} value={String(report.candidates.length)} />
                <Metric label={tradingText(copy.locale, "Strong current signals")} value={String(priorityCount)} />
                <Metric label={tradingText(copy.locale, "Strong name fit")} value={String(strongFitCount)} />
                <Metric label={tradingText(copy.locale, "Registry changes")} value={String(changedCount)} />
                <Metric label={tradingText(copy.locale, "Approved source pages")} value={String(snapshot.sourcesAvailable)} />
              </dl>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
                <label className="min-w-0 text-xs font-medium">{tradingText(copy.locale, "Filter domain")}<input value={query} onChange={event=>setQuery(event.target.value)} maxLength={253} placeholder={tradingText(copy.locale, "Search this report…")} className="mt-1 block min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>
                <label className="min-w-0 text-xs font-medium">{tradingText(copy.locale, "Status")}<select value={filter} onChange={event=>setFilter(event.target.value as TradingReportFilter)} className="mt-1 block min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {([['all',tradingText(copy.locale, "All checks")],['price_review',tradingText(copy.locale, "Ready for price review")],['acquisition_review',tradingText(copy.locale, "Acquisition evidence complete")],['priority',tradingText(copy.locale, "Strong technical signals")],['strong_fit',tradingText(copy.locale, "Strong name fit")],['changed',tradingText(copy.locale, "Registry changed")],['unregistered',tradingText(copy.locale, "Registry absent")],['registered',tradingText(copy.locale, "Registered")],['unknown',tradingText(copy.locale, "Unknown status")],['excluded',tradingText(copy.locale, "Excluded")]] as const).map(([value,label])=><option value={value} key={value}>{label}</option>)}
                </select></label>
                <label className="min-w-0 text-xs font-medium">{tradingText(copy.locale, "Extension")}<select value={tld} onChange={event=>setTld(event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="">{tradingText(copy.locale, "All extensions")}</option>{tlds.map(value=><option key={value} value={value}>.{value}</option>)}</select></label>
                <Button variant="outline" className={`${button} self-end`} onClick={()=>void exportReport()} disabled={!filtered.length||signingOut||exporting} aria-busy={exporting}>{exporting?<LoaderCircle className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />:<Download className="h-4 w-4 shrink-0" aria-hidden="true" />}{tradingText(copy.locale, "Export CSV")}</Button>
              </div>
              <p className="mt-3 text-xs text-muted-foreground" role="status">{filtered.length} / {report.candidates.length} {tradingText(copy.locale, "checks match this selection. Export includes observation time and unverified registrability.")}</p>
              {filter==="strong_fit" && <p className="mt-2 text-xs leading-5 text-muted-foreground">{tradingText(copy.locale, "Strong name fit describes the words and extension. Check registry status separately; this filter can also include registered domains.")}</p>}
              {exportFailed&&<p role="alert" className="mt-2 text-sm text-destructive">{tradingText(copy.locale, "Export could not be created. Your report is preserved. Try again.")}</p>}
              </details>
            </header>
            <div className="p-5 sm:p-6">
              {candidates.length ? <ol className="space-y-4">{candidates.map((candidate, index) => <Candidate key={candidate.domain} candidate={candidate} index={index} copy={copy} time={time} quote={quoteControls(candidate)} />)}</ol>
                : <h4 className="text-sm font-medium leading-6 text-muted-foreground">{copy.none}</h4>}
              {diagnostics.length > 0 && <details key={`${filter}-${query}-${tld}`} open={!candidates.length||filter!=="all"||Boolean(query)||Boolean(tld)} className="mt-3 border-t border-border pt-2">
                <summary className="min-h-11 cursor-pointer py-3 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{ux.checkedDomains} ({diagnostics.length})</summary>
                <ul className="mt-3 divide-y divide-border">{visibleDiagnostics.map(row => <li key={row.domain}><details className="py-2">
                  <summary className="min-h-11 cursor-pointer py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <span className="break-all font-medium">{row.domain}</span><span className="ml-3 text-muted-foreground">{isFreshReviewCandidate(row, now) ? copy.freshOverflow : copy.diagnosticStates[row.reviewStatus]}</span>
                    <NameFitBadge candidate={row} language={language}/>
                  </summary>
                  {row.reviewStatus === "review_candidate" && !isFreshReviewCandidate(row, now) && <p className="mb-3 text-sm leading-6 text-muted-foreground">{copy.staleEvidence}</p>}
                  <Observations candidate={row} copy={copy} time={time} quote={quoteControls(row)} />
                </details></li>)}</ul>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs leading-5 text-muted-foreground" role="status">{visibleDiagnostics.length} / {diagnostics.length} {tradingText(copy.locale, "other checks displayed. Search and CSV include all matching rows in this report.")}</p>
                  {visibleDiagnostics.length<diagnostics.length && <Button variant="outline" className={button} onClick={()=>setDiagnosticsLimit(limit=>limit+DIAGNOSTICS_BATCH_SIZE)}>{tradingShowMore(language, Math.min(DIAGNOSTICS_BATCH_SIZE, diagnostics.length - visibleDiagnostics.length))}</Button>}
                </div>
              </details>}
              <details className="mt-5 border-t border-border pt-2">
                <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{ux.resultNotes}</summary>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{copy.reviewWarning}</p>
                <p className="mt-2 text-xs text-muted-foreground">{report.candidates.some(row=>row.registrar?.status==="checked")
                  ? (tradingText(copy.locale, "Registrar responses are timestamped observations. Sajda has not reserved or purchased any domain."))
                  : `${copy.confirmed}: ${copy.zeroConfirmed}`}</p>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">{copy.noneBody}</p>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">{copy.diagnosticsBody}</p>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">{copy.reportNote}</p>
              </details>
              {attributedSources.length > 0 && <div className="mt-5 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">
                <p>{copy.sourceAttribution} {copy.sourceLicense} <a className="font-medium text-primary underline underline-offset-2" href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">CC BY-SA 3.0</a>. {copy.sourceIndependence}</p>
                <div className="mt-1 flex flex-wrap gap-x-4">{attributedSources.map((url, index) => <a key={url} className={link} href={url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{copy.source}{attributedSources.length > 1 ? ` ${index + 1}` : ""}<ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></a>)}</div>
              </div>}
              <p className="mt-5 text-xs leading-5 text-muted-foreground">{copy.scoreNote}</p>
            </div>
          </section> : <div className={`${panel} p-7 text-center sm:p-10`}>
            <FileSearch className="mx-auto h-7 w-7 text-muted-foreground" aria-hidden="true" /><h3 className="mt-4 text-lg font-semibold">{activeRun ? copy.firstRun : copy.empty}</h3><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{activeRun ? copy.firstRunBody : ux.emptyHint}</p>
          </div>}
          <details className={`${panel} p-5`}>
            <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{ux.settings}</summary>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{copy.limits}</p>
            <p className="mt-2 text-sm font-medium">{snapshot.sourcesAvailable} {tradingText(copy.locale, "approved source pages available now.")}</p>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">{copy.progressNote}</p>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">{copy.deepSchedule}</p>
          </details>
        </div>}
      </section>

      {showAccessOptions && <aside id="trading-access" tabIndex={-1} className={`${panel} mb-8 scroll-mt-6 p-5 outline-none sm:p-6`} aria-label={isNativeApp ? nativeCopy[language].membership : copy.priceLabel}>
        <h2 className="mb-4 text-lg font-semibold">{ux.accessOptions}</h2>
        <div className="max-w-xl"><PlusBilling accountId={accountId} language={language} fallback={copy} disabled={signingOut} onStatusVerified={billingStatusVerified} /></div>
        {!accountId && <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">{copy.lockedBody}</p>}
        {!isNativeApp && <details className="mt-5 border-t border-border pt-1"><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{copy.included}</summary>
          <ul className="mt-3 space-y-3">{copy.features.map(feature => <li key={feature} className="flex items-start gap-2 text-sm leading-6 text-muted-foreground"><Check className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden="true" /><span>{feature}</span></li>)}</ul>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">{copy.limits}</p>
        </details>}
      </aside>}

      {snapshot?.access && <details className={`${panel} mb-8 p-5`}><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{tradingText(copy.locale, "Account and Trading subscription")}</summary>
        <div className="max-w-xl pt-4"><PlusBilling accountId={accountId} language={language} fallback={copy} disabled={signingOut} onStatusVerified={billingStatusVerified}/></div>
      </details>}

      {!authLoading && user && <details className={`${panel} mb-8 p-5`}>
        <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{copy.signedInAs} <span className="break-all">{user.email}</span></summary>
        <Button variant="outline" className={`${button} mt-3`} disabled={signingOut} onClick={() => void leaveAccount()}>{signingOut ? copy.signingOut : copy.signOut}</Button>
        {signOutError && <p role="alert" className="mt-3 text-sm leading-6 text-destructive">{copy.signOutFailed}</p>}
      </details>}

      <details id="plus-method" className="scroll-mt-8 border-t border-border pt-2">
        <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{copy.readMore}</summary>
        <h2 className="mt-4 max-w-2xl text-2xl font-semibold leading-9 tracking-tight">{copy.methodTitle}</h2>
        <ol className="mt-7 grid gap-6 md:grid-cols-3">{copy.steps.map((step, index) => <li key={step.title} className="min-w-0">
          <span className="text-sm font-semibold text-primary">0{index + 1}</span><h3 className="mt-3 text-lg font-semibold">{step.title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{step.body}</p></li>)}</ol>
        <div className="mt-8 grid gap-4 rounded-2xl bg-secondary/50 p-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:p-6"><Check className="h-5 w-5 text-primary" aria-hidden="true" /><div><h3 className="font-semibold">{copy.target}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{copy.targetBody}</p></div></div>
        <p className="mt-5 text-xs leading-6 text-muted-foreground">{copy.caution}</p>
      </details>
    </div>
  </main>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt className="text-xs font-medium text-muted-foreground">{label}</dt><dd className="mt-1 break-words text-xl font-semibold tracking-tight">{value}</dd></div>;
}

function Candidate({ candidate, index, copy, time,quote }: { candidate: LostDomainAssessment; index: number; copy: LostDomainsCopy; time: (value: string) => string;quote?:TradingQuoteControls }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsId = useId();
  return <li className="rounded-xl border border-border p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0"><p className="text-xs font-medium text-muted-foreground">{String(index + 1).padStart(2, "0")}</p><h4 className="mt-1 break-all text-xl font-semibold tracking-tight sm:text-2xl"><button type="button" aria-expanded={detailsOpen} aria-controls={detailsId} onClick={() => setDetailsOpen(open => !open)} className="min-h-11 text-left text-primary underline decoration-primary/30 underline-offset-4 hover:decoration-primary focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{candidate.domain}</button></h4>
        <NameFitBadge candidate={candidate} language={copy.locale}/>
        <p className="mt-2 text-xs font-medium leading-5 text-muted-foreground">{copy.registryNotFound}</p></div>
      {candidate.dossier ? <dl className="flex flex-wrap gap-x-5 gap-y-3"><div><dt className="text-xs text-muted-foreground">{tradingText(copy.locale, "Fresh check types")}</dt><dd className="mt-1 text-sm font-semibold">{candidate.dossier.coverage.observedFamilies} / 4</dd></div>
        <div><dt className="text-xs text-muted-foreground">{tradingText(copy.locale, "Consistent rounds")}</dt><dd className="mt-1 text-sm font-semibold">{candidate.dossier.temporal.stableChecks} / 3</dd></div></dl>
        : <dl className="flex flex-wrap gap-x-5 gap-y-3"><div><dt className="text-xs text-muted-foreground">{copy.score}</dt><dd className="mt-1 text-sm font-semibold">{candidate.opportunity?.score ?? candidate.potentialScore}/100</dd></div>
        <div><dt className="text-xs text-muted-foreground">{copy.coverage}</dt><dd className="mt-1 text-sm font-semibold">{candidate.confidenceScore}/100</dd></div></dl>}
    </div>
    {candidate.dossier && <p className="mt-3 text-sm font-medium">{candidate.dossier.status==="ready_for_price_review" && !(Date.parse(candidate.dossier.validUntil ?? "")>Date.now())
      ? (tradingText(copy.locale, "Evidence expired — a fresh check is required"))
      : ({ready_for_price_review: tradingText(copy.locale, "Technically ready for price review — not a purchase confirmation"), monitor: tradingText(copy.locale, "More checks required"), reject: tradingText(copy.locale, "Excluded from acquisition review"), incomplete: tradingText(copy.locale, "Evidence is missing")})[candidate.dossier.status]}</p>}
    <details id={detailsId} open={detailsOpen} onToggle={event => setDetailsOpen(event.currentTarget.open)} className="mt-3 border-t border-border pt-2">
      <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{copy.evidence}</summary>
      <Observations candidate={candidate} copy={copy} time={time} quote={quote} />
    </details>
  </li>;
}

function NameFitBadge({candidate,language}:{candidate:LostDomainAssessment;language:string}) {
  if (candidate.marketFit?.tier!=="strong" || candidate.sensitive || candidate.risk.level==="excluded" || candidate.reviewStatus==="excluded") return null;
  return <span className="mt-2 inline-flex rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary">{tradingText(language, "Strong name fit")} · {candidate.marketFit.score}/100</span>;
}

function Observations({ candidate, copy, time,quote }: { candidate: LostDomainAssessment; copy: LostDomainsCopy; time: (value: string) => string;quote?:TradingQuoteControls }) {
  return <div className="space-y-4 pb-2">
        <TradingEvidenceSummary candidate={candidate} language={copy.locale} time={time} quote={quote}/>
        <p className="text-sm leading-6 text-muted-foreground">{copy.reviewWarning}</p>
        {!candidate.sensitive && candidate.risk.level !== "excluded" && candidate.dossier?.status!=="reject" && candidate.acquisition?.status!=="excluded" && <div className="flex flex-wrap gap-x-5"><a className={link} href={candidate.sourceUrl} aria-label={`${copy.source}: ${candidate.domain}`} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{copy.source}<ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></a>
          <a className={link} href={candidate.targetUrl} aria-label={`${copy.targetLink}: ${candidate.domain}`} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{copy.targetLink}<ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></a></div>}
        {!candidate.evidence.length && <p className="text-sm leading-6 text-muted-foreground">{copy.noObservations}</p>}
        <ul className="divide-y divide-border">{candidate.evidence.map((item, evidenceIndex) => <li className="py-3" key={`${item.kind}-${evidenceIndex}`}>
          <p className="text-sm font-medium">{copy.observationKinds[item.kind]}</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{copy.outcomes[item.outcome] ?? copy.outcomes.unknown}</p>
          <p className="mt-1 break-all text-xs leading-5 text-muted-foreground">{copy.evidenceSource}: {item.source === "system-dns-resolver" ? copy.dnsSource : item.source === "unsupported-registry" ? copy.unsupportedSource : item.source}</p>
          <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">{copy.observed}: <time dateTime={item.observedAt}>{time(item.observedAt)}</time> · {copy.expires}: <time dateTime={item.expiresAt}>{time(item.expiresAt)}</time></p>
        </li>)}</ul>
        <div className="rounded-lg bg-secondary/50 p-3"><h5 className="text-sm font-semibold">{copy.risks}</h5>
          {candidate.risk.reasons.length ? <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-5 text-muted-foreground">{[...new Set(candidate.risk.reasons.map(reason => copy.riskReasons[reason] ?? copy.noRiskReasons))].map(reason => <li key={reason}>{reason}</li>)}</ul>
            : <p className="mt-1 text-xs leading-5 text-muted-foreground">{copy.noRiskReasons}</p>}
        </div>
      </div>
  ;
}
