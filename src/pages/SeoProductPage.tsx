import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  ChevronRight,
  CircleAlert,
  Compass,
  FileSearch,
  Globe2,
  Layers3,
  Search,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { storeSearchEntryPreset } from "@/lib/searchEntryPreset";
import { seoBreadcrumbs, seoDocumentForPath } from "@/lib/seoDocuments";
import {
  getSeoProductPage,
  seoProductPages,
  type SeoProductPageId,
} from "@/lib/seoProductPages";

interface SeoProductPageProps {
  pageId: SeoProductPageId;
}

const signalIcons = {
  search: Search,
  check: BadgeCheck,
  compare: Layers3,
  project: FileSearch,
  globe: Globe2,
  direction: Compass,
} as const;

function prepareExactDomain(value: string, appendTld?: string): string | null {
  const compact = value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "");

  if (!compact || /\s/.test(compact)) return null;
  if (!appendTld || compact.includes(".")) return compact;
  return `${compact}.${appendTld}`;
}

function EntryField({ pageId }: SeoProductPageProps) {
  const page = getSeoProductPage(pageId);
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const isExactTldEntry = Boolean(page.field.appendTld);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const rawValue = value.trim();

    if (page.field.required && !rawValue) {
      setError("Skriv först vad du vill undersöka.");
      return;
    }

    const keyword = isExactTldEntry
      ? prepareExactDomain(rawValue, page.field.appendTld)
      : rawValue;
    if (isExactTldEntry && !keyword) {
      setError("Skriv ett domännamn utan mellanslag.");
      return;
    }

    storeSearchEntryPreset({
      ...page.preset,
      keyword: keyword || undefined,
      brief: page.preset.advanced ? rawValue || undefined : undefined,
      source: page.id,
    });
    navigate("/");
  };

  const setup = useMemo(() => {
    const parts: string[] = [];
    if (page.preset.tlds?.length) parts.push(page.preset.tlds.map((tld) => `.${tld}`).join(" + "));
    if (page.preset.advanced) parts.push("avancerad brief");
    if (page.preset.mode === "light") parts.push("direkt kontroll");
    if (page.preset.mode === "medium") parts.push("balanserad utforskning");
    if (page.preset.mode === "heavy") parts.push("bred utforskning");
    if (page.preset.mode === "deep") parts.push("fördjupat namnspår");
    return parts;
  }, [page.preset]);

  return (
    <aside className="relative overflow-hidden rounded-[1.5rem] border border-primary/20 bg-card p-5 shadow-[0_22px_64px_hsl(219_44%_12%/0.11)] sm:p-6" aria-labelledby={`${page.id}-entry-title`}>
      <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full border-[18px] border-primary/10" aria-hidden="true" />
      <div className="absolute bottom-0 left-0 h-24 w-full bg-[linear-gradient(90deg,hsl(var(--primary)/0.06)_1px,transparent_1px),linear-gradient(hsl(var(--primary)/0.06)_1px,transparent_1px)] bg-[size:20px_20px] [mask-image:linear-gradient(to_top,black,transparent)]" aria-hidden="true" />
      <div className="relative">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
          <Search className="h-5 w-5" aria-hidden="true" />
        </span>
        <p className="mt-5 text-xs font-bold uppercase tracking-[0.14em] text-primary">Öppna Sajdas sökning</p>
        <h2 id={`${page.id}-entry-title`} className="mt-2 text-xl font-semibold tracking-[-0.035em] text-foreground">
          Fortsätt i Sajdas arbetsyta
        </h2>
        <form className="mt-5" onSubmit={submit} noValidate>
          <noscript><p>Aktivera JavaScript för att använda domänsökningen. Ingen text skickas från det här formuläret utan JavaScript.</p></noscript>
          <label htmlFor={`${page.id}-search`} className="block text-sm font-semibold text-foreground">{page.field.label}</label>
          <Input
            id={`${page.id}-search`}
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              if (error) setError("");
            }}
            placeholder={page.field.placeholder}
            className="mt-2 h-12 border-input bg-background px-3.5 text-sm shadow-sm placeholder:text-muted-foreground/80"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={Boolean(error)}
            aria-describedby={`${page.id}-entry-note ${error ? `${page.id}-entry-error` : ""}`}
          />
          {error && <p id={`${page.id}-entry-error`} className="mt-2 text-sm font-medium text-destructive" role="alert">{error}</p>}
          <Button type="submit" size="lg" className="mt-3 w-full">
            {page.field.action}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </form>
        <p id={`${page.id}-entry-note`} className="mt-3 text-xs leading-5 text-muted-foreground">{page.field.hint}</p>
        {setup.length > 0 && (
          <div className="mt-5 border-t border-border pt-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Sökningen öppnas med</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {setup.map((item) => (
                <span key={item} className="rounded-full border border-primary/20 bg-primary/[0.045] px-2.5 py-1 text-xs font-semibold text-primary">
                  {item}
                </span>
              ))}
            </div>
          </div>
        )}
        <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
          Din text används bara för att förbereda sökningen i den här fliken. Ingen kontroll körs på den här sidan.
        </p>
      </div>
    </aside>
  );
}

export default function SeoProductPage({ pageId }: SeoProductPageProps) {
  const page = getSeoProductPage(pageId);
  const breadcrumbs = seoBreadcrumbs(seoDocumentForPath(page.path)!);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border/80 bg-card/95 backdrop-blur-xl">
        <div className="mx-auto flex min-h-[4.75rem] w-full max-w-7xl items-center justify-between gap-4 px-5 sm:px-7">
          <Link
            to="/se"
            className="inline-flex shrink-0 items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="Sajda Sverige"
          >
            <img src="/sajda-logo.svg" alt="Sajda" className="h-7 w-auto sm:h-8" />
          </Link>
          <nav className="hidden items-center gap-5 text-sm font-semibold text-muted-foreground md:flex" aria-label="Sajdas svenska sidor">
            <Link to="/se/sok-doman" className="transition-colors hover:text-foreground">Sök domän</Link>
            <Link to="/se/domannamn-generator" className="transition-colors hover:text-foreground">Hitta namn</Link>
            <Link to="/se/toppdomaner" className="transition-colors hover:text-foreground">Domänändelser</Link>
            <Link to="/se/guide/se-eller-com" className="transition-colors hover:text-foreground">.se eller .com</Link>
          </nav>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-lg text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Till sökningen</span>
            <span className="sm:hidden">Sök</span>
          </Link>
        </div>
      </header>

      <main>
        <section className="sajda-canvas overflow-hidden border-b border-border/70">
          <div className="mx-auto grid w-full max-w-7xl gap-10 px-5 py-14 sm:px-7 sm:py-20 lg:grid-cols-[minmax(0,1.08fr)_minmax(22rem,0.82fr)] lg:items-center lg:gap-16 lg:py-24">
            <div className="relative z-10 max-w-3xl">
              <nav aria-label="Brödsmulor" className="mb-5">
                <ol className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  {breadcrumbs.map((item, index) => (
                    <li key={item.path} className="inline-flex items-center gap-1.5" aria-current={index === breadcrumbs.length - 1 ? "page" : undefined}>
                      {index > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/70" aria-hidden="true" />}
                      {index === breadcrumbs.length - 1 ? <span className="text-foreground">{item.name}</span> : (
                        <Link to={item.path} className="rounded-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{item.name}</Link>
                      )}
                    </li>
                  ))}
                </ol>
              </nav>
              <p className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-card/85 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.15em] text-primary shadow-sm">
                <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                {page.eyebrow}
              </p>
              <h1 className="mt-6 max-w-[15ch] text-balance text-4xl font-semibold leading-[1.02] tracking-[-0.055em] text-foreground sm:text-6xl">
                {page.h1}
              </h1>
              <p className="mt-6 max-w-2xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
                {page.lead}
              </p>
              <div className="mt-8 grid max-w-2xl gap-3 sm:grid-cols-3">
                {page.signals.map((signal) => {
                  const Icon = signalIcons[signal.icon];
                  return (
                    <div key={signal.title} className="rounded-xl border border-border/90 bg-card/75 p-3.5 shadow-[0_1px_2px_hsl(219_44%_12%/0.035)]">
                      <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                      <p className="mt-2 text-sm font-semibold text-foreground">{signal.title}</p>
                    </div>
                  );
                })}
              </div>
            </div>
            <EntryField pageId={page.id} />
          </div>
        </section>

        <section className="mx-auto w-full max-w-7xl px-5 py-14 sm:px-7 sm:py-20">
          <div className="max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Produkt i praktiken</p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-[-0.045em] text-foreground sm:text-4xl">{page.productTitle}</h2>
            <p className="mt-4 text-pretty text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">{page.productLead}</p>
          </div>
          <div className="mt-9 grid gap-4 lg:grid-cols-3">
            {page.signals.map((signal) => {
              const Icon = signalIcons[signal.icon];
              return (
                <article key={signal.title} className="sajda-surface p-5 sm:p-6">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-5 text-lg font-semibold tracking-[-0.025em] text-foreground">{signal.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{signal.body}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="border-y border-border/80 bg-card">
          <div className="mx-auto grid w-full max-w-7xl gap-10 px-5 py-14 sm:px-7 sm:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.82fr)] lg:gap-16">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Så går det till</p>
              <h2 className="mt-3 text-balance text-3xl font-semibold tracking-[-0.045em] text-foreground sm:text-4xl">Tre steg till ett mer underbyggt val.</h2>
              <ol className="mt-8 grid gap-3">
                {page.steps.map((step, index) => (
                  <li key={step.title} className="flex gap-4 rounded-xl border border-border bg-background p-4 sm:p-5">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-secondary text-sm font-bold text-primary">{index + 1}</span>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">{step.title}</h3>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <aside className="self-start rounded-[1.25rem] border border-primary/15 bg-primary/[0.035] p-5 sm:p-6">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                <CircleAlert className="h-5 w-5" aria-hidden="true" />
              </span>
              <h2 className="mt-5 text-xl font-semibold tracking-[-0.03em] text-foreground">{page.scopeTitle}</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{page.scope}</p>
              <Link to="/se/sa-fungerar-sajda" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary/80">
                Så fungerar Sajdas underlag
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </aside>
          </div>
        </section>

        <section className="mx-auto w-full max-w-7xl px-5 py-14 sm:px-7 sm:py-20">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.82fr)] lg:gap-16">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Vanliga frågor</p>
              <h2 className="mt-3 text-balance text-3xl font-semibold tracking-[-0.045em] text-foreground sm:text-4xl">Rätt gränser gör verktyget användbart.</h2>
              <div className="mt-7 divide-y divide-border rounded-[1.25rem] border border-border bg-card">
                {page.faqs.map((faq) => (
                  <details key={faq.question} className="group px-5 py-1.5 sm:px-6">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-sm font-semibold text-foreground marker:content-none">
                      {faq.question}
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-border bg-background text-primary transition-transform group-open:rotate-45" aria-hidden="true">+</span>
                    </summary>
                    <p className="pb-4 text-sm leading-6 text-muted-foreground">{faq.answer}</p>
                    {faq.source && <p className="pb-4 text-xs leading-5 text-muted-foreground">
                      Källa: <a href={faq.source.url} className="text-primary underline underline-offset-2">{faq.source.title}</a>
                      {" · Kontrollerad "}<time dateTime={faq.source.reviewedAt}>{faq.source.reviewedAt}</time>
                    </p>}
                  </details>
                ))}
              </div>
            </div>
            <aside className="self-start rounded-[1.25rem] border border-border bg-secondary/40 p-5 sm:p-6">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Fortsätt från här</p>
              <h2 className="mt-3 text-xl font-semibold tracking-[-0.03em] text-foreground">Relaterade ingångar</h2>
              <nav className="mt-5 grid gap-2" aria-label="Relaterade Sajda-sidor">
                {page.related.map((relatedId) => {
                  const related = seoProductPages[relatedId];
                  return (
                    <Link key={related.path} to={related.path} className="group flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:border-primary/30 hover:bg-primary/[0.025]">
                      <span>{related.eyebrow}</span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-primary transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                    </Link>
                  );
                })}
              </nav>
            </aside>
          </div>
        </section>

        <section className="border-t border-border/80 bg-card">
          <div className="mx-auto flex w-full max-w-7xl flex-col justify-between gap-6 px-5 py-12 sm:px-7 sm:py-16 lg:flex-row lg:items-center">
            <div className="max-w-2xl">
              <h2 className="text-balance text-2xl font-semibold tracking-[-0.04em] text-foreground sm:text-3xl">Redo att pröva det i Sajdas sökning?</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">Inställningarna från den här sidan följer med, men du bestämmer själv när en registrykontroll startar.</p>
            </div>
            <Button asChild size="lg" className="shrink-0">
              <Link to="/">
                Öppna sökningen
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}
