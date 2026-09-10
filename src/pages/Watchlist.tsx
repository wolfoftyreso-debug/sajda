import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Bookmark, ArrowLeft, Search, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import DomainCard from "@/components/DomainCard";
import { useAuth } from "@/contexts/AuthContext";
import { getWatchlist, removeFromWatchlist, type WatchlistItem } from "@/lib/watchlistService";
import { WatchlistPageSkeleton } from "@/components/PageSkeletons";
import { useLanguage } from "@/i18n/LanguageProvider";
import { savedDomainsCopy, savedCopyValues } from "@/i18n/savedDomainsCopy";
import { savedDomainExtension, selectSavedDomains, type SavedDomainSort } from "@/lib/savedDomainsWorkspace";
import { formatLocalizedDateTime } from "@/lib/localeFormat";

const Watchlist = () => {
  const [domains, setDomains] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadedAccountId, setLoadedAccountId] = useState<string | null>(null);
  const [confirmDomain, setConfirmDomain] = useState<string | null>(null);
  const [removingDomain, setRemovingDomain] = useState<string | null>(null);
  const [removeFailed, setRemoveFailed] = useState(false);
  const [removedDomain, setRemovedDomain] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [extension, setExtension] = useState("");
  const [sort, setSort] = useState<SavedDomainSort>("newest");
  const { user, loading: authLoading } = useAuth();
  const accountId = user?.id ?? null;
  const currentAccountId = useRef(accountId);
  currentAccountId.current = accountId;
  const activeRead = useRef<AbortController | null>(null);
  const accountLifetime = useRef<AbortController | null>(null);
  const activeDelete = useRef<{ accountId: string; domain: string } | null>(null);
  const currentConfirmation = useRef<string | null>(null);
  const navigate = useNavigate();
  const { language } = useLanguage();
  const copy = savedDomainsCopy[language];

  useEffect(() => { if (!authLoading && !accountId) navigate("/auth?next=%2Fwatchlist", { replace: true }); }, [accountId, authLoading, navigate]);

  const loadWatchlist = useCallback(async () => {
    if (!accountId || currentAccountId.current !== accountId || activeDelete.current) return;
    activeRead.current?.abort();
    const controller = new AbortController();
    activeRead.current = controller;
    const isCurrent = () => !controller.signal.aborted && activeRead.current === controller && currentAccountId.current === accountId;
    setLoading(true); setLoadFailed(false);
    try {
      const data = await getWatchlist({ accountId, signal: controller.signal });
      if (!isCurrent()) return;
      setDomains(data); setLoadedAccountId(accountId);
    } catch {
      if (!isCurrent()) return;
      setLoadFailed(true); setLoadedAccountId(accountId);
    } finally { if (isCurrent()) setLoading(false); }
  }, [accountId]);

  useEffect(() => {
    setDomains([]); setLoadedAccountId(null); setLoading(true); setLoadFailed(false);
    currentConfirmation.current = null;
    setConfirmDomain(null); setRemovingDomain(null); setRemoveFailed(false); setRemovedDomain(null);
    setQuery(""); setExtension(""); setSort("newest"); activeDelete.current = null;
    const lifetime = new AbortController();
    accountLifetime.current = lifetime;
    void loadWatchlist();
    return () => { lifetime.abort(); activeRead.current?.abort(); };
  }, [loadWatchlist]);

  const handleRemove = async (domain: string) => {
    if (!accountId || currentAccountId.current !== accountId || !accountLifetime.current
      || accountLifetime.current.signal.aborted || activeDelete.current || currentConfirmation.current !== domain) return;
    const token = { accountId, domain };
    activeDelete.current = token;
    // A list response started before this mutation must never resurrect a deleted row.
    activeRead.current?.abort(); setLoading(false);
    const signal = accountLifetime.current.signal;
    const isCurrent = () => !signal.aborted && currentAccountId.current === accountId && activeDelete.current === token;
    setRemovingDomain(domain); setRemoveFailed(false); setRemovedDomain(null);
    try {
      await removeFromWatchlist(domain, { accountId, signal });
      if (!isCurrent()) return;
      setDomains(previous => previous.filter(item => item.domain !== domain));
      currentConfirmation.current = null; setConfirmDomain(null); setRemovedDomain(domain);
    } catch { if (isCurrent()) setRemoveFailed(true); }
    finally { if (isCurrent()) { activeDelete.current = null; setRemovingDomain(null); } }
  };

  // Keep an active suffix filter visible even if its last row was just removed.
  const extensions = useMemo(() => [...new Set([...domains.map(item => savedDomainExtension(item.domain)).filter(Boolean), ...(extension ? [extension] : [])])].sort(), [domains, extension]);
  const visible = useMemo(() => selectSavedDomains(domains, query, extension, sort, language), [domains, query, extension, sort, language]);
  const resetFilters = () => { setQuery(""); setExtension(""); setSort("newest"); };
  const hasFilters = Boolean(query.trim() || extension || sort !== "newest");

  if (authLoading || !accountId || loadedAccountId !== accountId) return <WatchlistPageSkeleton />;

  return <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-6 sm:px-6" aria-labelledby="saved-domains-title">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3">
        <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" onClick={() => navigate("/")} aria-label={copy.back}><ArrowLeft className="h-5 w-5" aria-hidden="true" /></Button>
        <div className="min-w-0"><h1 id="saved-domains-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">{copy.title}</h1><p className="mt-2 text-sm text-muted-foreground">{copy.subtitle}</p></div>
      </div>
      <Button variant="outline" className="min-h-11 max-w-full whitespace-normal" disabled={loading || Boolean(removingDomain)} onClick={() => void loadWatchlist()} aria-describedby="saved-refresh-help"><RefreshCw className={`h-4 w-4 shrink-0 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />{loading ? copy.refreshing : copy.refresh}</Button>
    </header>
    <p id="saved-refresh-help" className="mt-4 text-sm text-muted-foreground">{copy.refreshHelp}</p>
    <p className="mt-5 rounded-2xl border border-border bg-secondary/50 p-4 text-sm leading-6">{copy.snapshot}</p>
    <p className="sr-only" role="status" aria-live="polite">{removedDomain ? savedCopyValues(copy.removed, { domain: removedDomain }) : ""}</p>

    {loadFailed && <section className="mt-5 rounded-2xl border border-destructive/30 p-4" role="alert"><h2 className="font-semibold">{copy.failed}</h2><p className="mt-2 text-sm">{copy.failedHelp}</p><Button className="mt-3 min-h-11" variant="outline" disabled={loading || Boolean(removingDomain)} onClick={() => void loadWatchlist()}>{copy.retry}</Button></section>}

    {domains.length > 0 && <>
      <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]" aria-label={copy.search}>
        <label className="min-w-0 text-sm font-medium" htmlFor="saved-domain-search">{copy.search}<Input id="saved-domain-search" type="search" className="mt-2 h-11" value={query} onChange={event => setQuery(event.target.value)} /></label>
        <label className="min-w-0 text-sm font-medium" htmlFor="saved-domain-extension">{copy.extension}<select id="saved-domain-extension" className="mt-2 h-11 w-full min-w-0 rounded-xl border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={extension} onChange={event => setExtension(event.target.value)}><option value="">{copy.allExtensions}</option>{extensions.map(value => <option key={value} value={value}>.{value}</option>)}</select></label>
        <label className="min-w-0 text-sm font-medium" htmlFor="saved-domain-sort">{copy.sort}<select id="saved-domain-sort" className="mt-2 h-11 w-full min-w-0 rounded-xl border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={sort} onChange={event => { if (["newest", "name", "oldest"].includes(event.target.value)) setSort(event.target.value as SavedDomainSort); }}><option value="newest">{copy.newest}</option><option value="name">{copy.name}</option><option value="oldest">{copy.oldest}</option></select></label>
      </section>
      <div className="mt-4 flex min-h-11 flex-wrap items-center justify-between gap-2"><p className="text-sm text-muted-foreground" role="status">{savedCopyValues(copy.results, { shown: visible.length.toLocaleString(language), total: domains.length.toLocaleString(language) })}</p>{hasFilters && <Button variant="ghost" className="min-h-11" onClick={resetFilters}>{copy.reset}</Button>}</div>
      {visible.length === 0 ? <section className="py-12 text-center"><h2 className="text-lg font-semibold">{copy.noMatches}</h2><p className="mt-2 text-sm text-muted-foreground">{copy.noMatchesHelp}</p><Button className="mt-4 min-h-11" variant="outline" onClick={resetFilters}>{copy.reset}</Button></section> :
        <div className="mt-4 grid items-start gap-5 md:grid-cols-2 xl:grid-cols-3">{visible.map(item => <section key={item.id} data-saved-domain={item.domain} className="min-w-0">
          <DomainCard domain={item.domain} status="unknown" checkMethod="none" availabilityVerified={false} registrarPrice={item.registrar_price} estimatedValue={item.estimated_value} confidenceScore={item.confidence_score} rationale={item.rationale || ""} isInWatchlist={true} showWatchlistActions={false} />
          <div className="px-2 pt-2">
            <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted-foreground">{savedCopyValues(copy.savedAt, { date: formatLocalizedDateTime(item.created_at, language) })}</p><Button variant="ghost" className="min-h-11 text-muted-foreground" disabled={Boolean(removingDomain)} aria-label={savedCopyValues(copy.removeLabel, { domain: item.domain })} onClick={() => { if (!activeDelete.current) { currentConfirmation.current = item.domain; setConfirmDomain(item.domain); setRemoveFailed(false); } }}><Trash2 className="h-4 w-4" aria-hidden="true" />{copy.remove}</Button></div>
            {confirmDomain === item.domain && <div className="mt-2 rounded-xl border border-border bg-card p-3" role="group" aria-labelledby={`remove-${item.id}`}>
              <p id={`remove-${item.id}`} className="break-words text-sm font-semibold">{savedCopyValues(copy.confirm, { domain: item.domain })}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">{copy.confirmHelp}</p>
              {removeFailed && <p className="mt-2 text-sm text-destructive" role="alert">{copy.removeFailed}</p>}
              <div className="mt-3 flex flex-wrap gap-2"><Button className="min-h-11 h-auto whitespace-normal" variant="destructive" disabled={Boolean(removingDomain)} onClick={() => void handleRemove(item.domain)}>{removingDomain === item.domain ? copy.removing : copy.confirmRemove}</Button><Button className="min-h-11" variant="outline" disabled={Boolean(removingDomain)} onClick={() => { currentConfirmation.current = null; setConfirmDomain(null); setRemoveFailed(false); }}>{copy.cancel}</Button></div>
            </div>}
          </div>
        </section>)}</div>}
    </>}
    {!loadFailed && domains.length === 0 && <section className="flex flex-col items-center py-16 text-center"><Bookmark className="h-8 w-8 text-primary" aria-hidden="true" /><h2 className="mt-4 text-xl font-semibold">{copy.empty}</h2><p className="mt-2 max-w-md text-muted-foreground">{copy.emptyHelp}</p><Button className="mt-5 min-h-11" onClick={() => navigate("/")}><Search className="h-4 w-4" aria-hidden="true" />{copy.start}</Button></section>}
  </main>;
};

export default Watchlist;
