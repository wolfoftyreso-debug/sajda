import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import BrandWorkspaceEntry from "@/components/BrandWorkspaceEntry";
import { useLanguage } from "@/i18n/LanguageProvider";
import { brandLookupCopy, brandLookupDetailCopy } from "@/i18n/brandLookupCopy";
import { isNativeApp } from "@/lib/appSurface";
import { lookupBrand, safeBrandLookupLink } from "@/lib/brandLookupClient";
import { formatLocalizedDateTime } from "@/lib/localeFormat";
import { brandLookupInputSchema, type BrandLookupInput, type BrandLookupSearch, type BrandLookupProfile } from "../../shared/brand-lookup";

const action = "h-auto min-h-12 whitespace-normal px-4 py-3 text-left leading-6";
const platforms = { x: "X", instagram: "Instagram", linkedin: "LinkedIn" };

/** Search first; public database assertions are never ownership or legal verification. */
export default function BrandIndex() {
  const { language } = useLanguage(), c = brandLookupCopy[language], detail = brandLookupDetailCopy[language];
  const [query, setQuery] = useState(""), [matches, setMatches] = useState<BrandLookupSearch | null>(null), [profile, setProfile] = useState<BrandLookupProfile | null>(null);
  const [pending, setPending] = useState<BrandLookupInput["operation"] | null>(null), [error, setError] = useState<"invalid" | "unavailable" | null>(null), [cancelled, setCancelled] = useState(false);
  const requestRef = useRef<AbortController | null>(null), generation = useRef(0), retryRef = useRef<BrandLookupInput | null>(null);
  const inputRef = useRef<HTMLInputElement>(null), resultRef = useRef<HTMLHeadingElement>(null), [resultRevision, setResultRevision] = useState(0);
  useEffect(() => () => { generation.current++; requestRef.current?.abort(); }, []);
  useEffect(() => {
    if (resultRevision > 0 && resultRef.current) {
      resultRef.current.focus({ preventScroll: true });
      resultRef.current.scrollIntoView({ block: "start", behavior: "auto" });
    }
  }, [resultRevision]);

  function stop() { generation.current++; requestRef.current?.abort(); requestRef.current = null; setPending(null); }
  function edit(value: string) { stop(); setQuery(value); setMatches(null); setProfile(null); setError(null); setCancelled(false); retryRef.current = null; }
  async function run(request: BrandLookupInput) {
    stop(); const id = generation.current, controller = new AbortController(); requestRef.current = controller; retryRef.current = request;
    setPending(request.operation); setError(null); setCancelled(false); setProfile(null); if (request.operation === "search") setMatches(null);
    let timedOut = false;
    const timer = window.setTimeout(() => { timedOut = true; controller.abort(); }, 20_000);
    try {
      const response = await lookupBrand(request, { signal: controller.signal, native: isNativeApp, origin: import.meta.env.VITE_NATIVE_API_ORIGIN });
      if (id !== generation.current || controller.signal.aborted) return;
      if (response.operation === "search") setMatches(response); else setProfile(response);
      setResultRevision(value => value + 1);
    } catch {
      if (id === generation.current && (!controller.signal.aborted || timedOut)) setError("unavailable");
    } finally {
      window.clearTimeout(timer);
      if (id === generation.current) { setPending(null); requestRef.current = null; }
    }
  }
  function search(event: FormEvent) {
    event.preventDefault();
    const parsed = brandLookupInputSchema.safeParse({ operation: "search", query, locale: language });
    if (!parsed.success) { stop(); setError("invalid"); return; }
    void run(parsed.data);
  }
  const sourceTime = profile?.retrieved_at ?? matches?.retrieved_at;
  return <main className="mx-auto w-full max-w-5xl px-4 py-6 pb-20 sm:px-6" aria-labelledby="brand-lookup-title">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><Link to="/" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary"><ArrowLeft aria-hidden="true" className="h-4 w-4 shrink-0" />{c.home}</Link><LanguageSwitcher /></div>
    <header className="max-w-3xl"><p className="text-sm font-semibold text-primary">{c.eyebrow}</p><h1 id="brand-lookup-title" className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{c.title}</h1><p className="mt-4 text-base leading-7 text-muted-foreground">{c.intro}</p></header>
    <BrandWorkspaceEntry compact />
    <form onSubmit={search} noValidate className="my-7 rounded-2xl border border-border bg-card p-5 sm:p-6" aria-describedby="brand-lookup-disclosure">
      <label htmlFor="brand-lookup-query" className="block text-sm font-semibold">{c.label}</label>
      <input ref={inputRef} id="brand-lookup-query" value={query} onChange={event => edit(event.target.value)} maxLength={100} required autoComplete="off" className="mt-2 min-h-12 w-full min-w-0 rounded-xl border border-input bg-background px-3 py-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-invalid={error === "invalid"} />
      <p id="brand-lookup-disclosure" className="mt-3 text-sm leading-6 text-muted-foreground">{c.disclosure}</p>
      <div className="mt-4 flex flex-wrap gap-3"><Button type="submit" className={action} disabled={pending === "search"}><Search aria-hidden="true" className="h-4 w-4 shrink-0" />{pending === "search" ? c.searching : c.search}</Button>{pending && <Button type="button" variant="outline" className={action} onClick={() => { stop(); setCancelled(true); inputRef.current?.focus(); }}>{c.cancel}</Button>}</div>
    </form>
    {pending && <p role="status" className="mb-5 text-sm leading-6">{pending === "profile" ? c.loadingProfile : c.searching}</p>}
    {cancelled && <p role="status" className="mb-5 text-sm leading-6">{c.cancelled}</p>}
    {error && <section role="alert" className="mb-6 rounded-2xl border border-border bg-card p-5"><h2 className="font-semibold">{error === "invalid" ? c.invalid : c.unavailable}</h2>{error === "unavailable" && <><p className="mt-2 text-sm leading-6 text-muted-foreground">{c.unavailableHelp}</p>{retryRef.current && <Button type="button" variant="outline" className={`${action} mt-3`} onClick={() => { if (retryRef.current) void run({ ...retryRef.current, locale: language }); }}>{c.retry}</Button>}</>}</section>}
    {!profile && matches && <section aria-labelledby="brand-lookup-results-title" data-brand-lookup-matches>
      <h2 ref={resultRef} tabIndex={-1} id="brand-lookup-results-title" className="scroll-mt-6 text-xl font-semibold">{matches.status === "no_matches" ? c.noMatches : c.matches}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{matches.status === "no_matches" ? c.noMatchesHelp : c.matchesHelp}</p>
      {matches.has_more && <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail.more}</p>}
      <div className="mt-4 space-y-3">{matches.candidates.map(candidate => <article key={candidate.entity_id} className="min-w-0 rounded-2xl border border-border bg-card p-5" data-brand-match={candidate.entity_id}><h3 className="break-words text-lg font-semibold">{candidate.name}</h3><p className="mt-2 break-words text-sm leading-6 text-muted-foreground">{candidate.description || c.noDescription}</p><div className="mt-3 flex flex-wrap items-center gap-4"><Button type="button" variant="outline" className={action} onClick={() => void run({ operation: "profile", entity_id: candidate.entity_id, locale: language })}>{c.choose}</Button><a href={candidate.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 max-w-full items-center gap-1 text-sm text-primary underline underline-offset-4">{c.source}<ArrowUpRight aria-hidden="true" className="h-4 w-4 shrink-0" /></a></div></article>)}</div>
    </section>}
    {profile && <section aria-labelledby="brand-lookup-profile-title" data-brand-lookup-profile={profile.entity.entity_id}>
      <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><p className="text-sm text-muted-foreground">{c.profile}</p><h2 ref={resultRef} tabIndex={-1} id="brand-lookup-profile-title" className="mt-2 scroll-mt-6 break-words text-2xl font-semibold">{profile.entity.name}</h2><p className="mt-2 break-words text-sm leading-6 text-muted-foreground">{profile.entity.description || c.noDescription}</p></div><Button type="button" variant="outline" className={action} onClick={() => { stop(); setProfile(null); setError(null); setResultRevision(value => value + 1); }}>{c.change}</Button></div>
      <a href={profile.entity.source_url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-11 max-w-full items-center gap-1 text-sm text-primary underline underline-offset-4">{c.source}<ArrowUpRight aria-hidden="true" className="h-4 w-4 shrink-0" /></a>
      <p data-brand-source-warning className="mt-4 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm font-semibold leading-6">{c.sourceClaims}</p>
      <div className="mt-5 grid min-w-0 gap-5 sm:grid-cols-2">{(["website", "social"] as const).map(kind => <section key={kind} className="min-w-0 rounded-2xl border border-border bg-card p-5"><h3 className="text-lg font-semibold">{kind === "website" ? c.websites : c.socials}</h3><ul className="mt-3 space-y-4">{profile.assertions.filter(item => item.kind === kind).map(item => { const url = safeBrandLookupLink(item.url); return <li key={item.statement_id} data-brand-assertion={item.statement_id} className="min-w-0 border-t border-border pt-3"><p className="mb-1 text-xs font-semibold text-muted-foreground">{item.platform ? platforms[item.platform] : c.websites}</p>{url ? <a href={url} target="_blank" rel="noopener noreferrer" className="block break-all text-sm font-medium text-primary underline underline-offset-4">{item.value}</a> : <p className="break-all text-sm">{item.value}</p>}<a href={item.source_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-11 max-w-full items-center gap-1 text-xs text-primary underline underline-offset-4">{c.source}<ArrowUpRight aria-hidden="true" className="h-3 w-3 shrink-0" /></a></li>; })}</ul>{!profile.assertions.some(item => item.kind === kind) && <p className="mt-3 text-sm leading-6 text-muted-foreground">{kind === "website" ? c.noWebsites : c.noSocials}</p>}</section>)}</div>
      {profile.assertions.some(item => item.has_qualifiers) && <p className="mt-3 text-sm leading-6 text-muted-foreground">{detail.qualified}</p>}
      {profile.truncated && <p className="mt-3 text-sm leading-6 text-muted-foreground">{detail.truncated}</p>}
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{c.unknown}</p>
      <aside className="my-5 rounded-2xl border border-border bg-secondary/30 p-5" aria-label={c.sourceClaims}><p className="text-sm leading-6">{c.profileHelp}</p><p className="mt-2 text-sm leading-6 text-muted-foreground">{detail.coverage}</p></aside>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2"><section className="min-w-0 rounded-2xl border border-border bg-card p-5"><h3 className="text-sm font-semibold">{c.verifiedIndex}</h3><p data-brand-lookup-index="unavailable" className="mt-3 text-lg font-semibold">{c.notVerified}</p><p className="mt-3 text-sm leading-6 text-muted-foreground">{c.indexHelp}</p></section><dl className="min-w-0 space-y-4 rounded-2xl border border-border bg-card p-5"><div><dt className="text-sm text-muted-foreground">{c.listedCount}</dt><dd data-brand-listed-count className="mt-1 text-2xl font-semibold">{profile.assertions.length}</dd></div><div><dt className="text-sm text-muted-foreground">{c.verifiedCount}</dt><dd data-brand-verified-count className="mt-1 text-2xl font-semibold">0</dd></div></dl></div>
      <dl className="mt-5 space-y-2 text-sm"><div><dt className="font-semibold">{c.sourceModified}</dt><dd>{profile.entity.source_modified_at ? <time dateTime={profile.entity.source_modified_at}>{formatLocalizedDateTime(profile.entity.source_modified_at, language)}</time> : c.missingDate}</dd></div></dl>
    </section>}
    {sourceTime && <footer className="mt-5 border-t border-border pt-4 text-sm leading-6 text-muted-foreground"><p>{c.retrieved}: <time dateTime={sourceTime}>{formatLocalizedDateTime(sourceTime, language)}</time> · Wikidata · CC0</p><p className="mt-2">{c.ageHelp}</p></footer>}
    <section className="mt-8 border-t border-border pt-6"><h2 className="text-base font-semibold">{c.next}</h2><Link to="/brand-index/assessment" className="mt-2 inline-flex min-h-11 max-w-full items-center text-sm font-semibold text-primary underline underline-offset-4">{c.assessment}</Link><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{c.assessmentHelp}</p></section>
  </main>;
}
