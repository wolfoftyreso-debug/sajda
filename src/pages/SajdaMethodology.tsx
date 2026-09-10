import { useEffect } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  CircleAlert,
  Database,
  Eye,
  FileSearch,
  Globe2,
  Layers3,
  LockKeyhole,
  Search,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SEO_CANONICAL_ORIGIN } from "@/lib/seoCanonicalOrigin";

const PAGE_PATH = "/se/sa-fungerar-sajda";
const PAGE_TITLE = "Så fungerar Sajda — underlag för ditt domänval | Sajda";
const PAGE_DESCRIPTION = "Se hur Sajda hittar, kontrollerar och jämför domännamn. Status, priskällor och osäkerhet visas så att du kan välja själv.";

const process = [
  {
    icon: Search,
    number: "01",
    title: "Hitta en riktning",
    body: "Börja med ett exakt domännamn eller en kort beskrivning av det du vill bygga. Sajda använder din riktning för att göra nästa sökning mer relevant.",
  },
  {
    icon: BadgeCheck,
    number: "02",
    title: "Kontrollera underlaget",
    body: "Tillgänglighet och pris är olika frågor. Sajda visar dem separat och lämnar statusen öppen när den inte kan bekräftas.",
  },
  {
    icon: Layers3,
    number: "03",
    title: "Välj med sammanhang",
    body: "Jämför de alternativ som är meningsfulla för dig, spara de starkaste och avgör själv var ett köp ska göras.",
  },
] as const;

const states = [
  {
    icon: CheckCircle2,
    title: "Verifierad status",
    body: "När en relevant kontrollväg kan bekräfta statusen visar Sajda både resultatet och vilket underlag som användes.",
    tone: "success",
  },
  {
    icon: CircleAlert,
    title: "Okänd status",
    body: "Om en kontrollväg inte kan ge ett säkert svar visas inte en gissning som ett grönt ljus. Du ser i stället att statusen är okänd.",
    tone: "primary",
  },
  {
    icon: Globe2,
    title: "Bekräfta vid köp",
    body: "Domänstatus och villkor kan ändras. Registratorns egen kassa är alltid sista bekräftelsen före ett köp.",
    tone: "neutral",
  },
] as const;

const pricePrinciples = [
  "Ett pris visas bara när det finns ett begripligt underlag att visa tillsammans med det.",
  "Kampanjpris, förnyelse och moms är olika delar av kostnaden och ska inte blandas ihop.",
  "När Sajda saknar ett färskt pris pekar tjänsten vidare i stället för att fylla ut en siffra.",
] as const;

function setHeadAttribute(selector: string, attribute: string, value: string): () => void {
  const existing = document.head.querySelector<HTMLElement>(selector);
  const previous = existing?.getAttribute(attribute);

  if (existing) {
    existing.setAttribute(attribute, value);
    return () => {
      if (previous === null) existing.removeAttribute(attribute);
      else existing.setAttribute(attribute, previous);
    };
  }

  const tagName = selector.startsWith("link") ? "link" : "meta";
  const created = document.createElement(tagName);
  if (tagName === "link") created.setAttribute("rel", "canonical");
  else if (selector.includes("description")) created.setAttribute("name", "description");
  else created.setAttribute("name", "robots");
  created.setAttribute(attribute, value);
  document.head.appendChild(created);
  return () => created.remove();
}

function setMetaContent(attribute: "name" | "property", key: string, content: string): () => void {
  const selector = `meta[${attribute}='${key}']`;
  const existing = document.head.querySelector<HTMLMetaElement>(selector);
  const previous = existing?.content;

  if (existing) {
    existing.content = content;
    return () => {
      existing.content = previous ?? "";
    };
  }

  const created = document.createElement("meta");
  created.setAttribute(attribute, key);
  created.content = content;
  document.head.appendChild(created);
  return () => created.remove();
}

/**
 * Swedish public trust page. It deliberately stays independent from the
 * SEO-page manifest so it can be integrated as a dedicated canonical route.
 */
export default function SajdaMethodology() {
  useEffect(() => {
    const previousTitle = document.title;
    const description = document.querySelector<HTMLMetaElement>("meta[name='description']");
    const previousDescription = description?.content;
    const cleanups = [
      setHeadAttribute("link[rel='canonical']", "href", `${SEO_CANONICAL_ORIGIN}${PAGE_PATH}`),
      setHeadAttribute("meta[name='robots']", "content", "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"),
      setMetaContent("property", "og:title", PAGE_TITLE),
      setMetaContent("property", "og:description", PAGE_DESCRIPTION),
      setMetaContent("property", "og:url", `${SEO_CANONICAL_ORIGIN}${PAGE_PATH}`),
      setMetaContent("property", "og:locale", "sv_SE"),
      setMetaContent("name", "twitter:title", PAGE_TITLE),
      setMetaContent("name", "twitter:description", PAGE_DESCRIPTION),
    ];

    document.title = PAGE_TITLE;
    description?.setAttribute("content", PAGE_DESCRIPTION);

    return () => {
      document.title = previousTitle;
      if (description && previousDescription) description.setAttribute("content", previousDescription);
      cleanups.reverse().forEach((cleanup) => cleanup());
    };
  }, []);

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
              <p className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-card/85 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.15em] text-primary shadow-sm">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Så fungerar Sajda
              </p>
              <h1 className="mt-6 max-w-[13ch] text-balance text-4xl font-semibold leading-[1.02] tracking-[-0.055em] text-foreground sm:text-6xl">
                Ett domänval blir bättre när underlaget följer med.
              </h1>
              <p className="mt-6 max-w-2xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
                Sajda är en oberoende arbetsyta för att hitta, kontrollera och jämföra domännamn. Varje del av resultatet ska göra det tydligare vad som är bekräftat, vad som är osäkert och vad du behöver avgöra själv.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg">
                  <Link to="/">
                    Öppna sökningen
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link to="/se/sok-doman">Kontrollera ett namn</Link>
                </Button>
              </div>
            </div>

            <aside className="relative overflow-hidden rounded-[1.5rem] border border-primary/20 bg-card p-5 shadow-[0_22px_64px_hsl(219_44%_12%/0.11)] sm:p-6" aria-labelledby="method-evidence-title">
              <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full border-[18px] border-primary/10" aria-hidden="true" />
              <div className="relative">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                  <FileSearch className="h-5 w-5" aria-hidden="true" />
                </span>
                <p className="mt-5 text-xs font-bold uppercase tracking-[0.14em] text-primary">Ett läsbart resultat</p>
                <h2 id="method-evidence-title" className="mt-2 text-xl font-semibold tracking-[-0.035em] text-foreground">Tre saker hålls isär.</h2>
                <dl className="mt-5 divide-y divide-border rounded-xl border border-border bg-background px-4">
                  <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 py-3.5 text-sm">
                    <dt className="font-semibold text-foreground">Namnet</dt>
                    <dd className="text-muted-foreground">Din idé eller exakta domän.</dd>
                  </div>
                  <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 py-3.5 text-sm">
                    <dt className="font-semibold text-foreground">Status</dt>
                    <dd className="text-muted-foreground">Bekräftad eller tydligt okänd.</dd>
                  </div>
                  <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 py-3.5 text-sm">
                    <dt className="font-semibold text-foreground">Pris</dt>
                    <dd className="text-muted-foreground">Källa och aktualitet, när den finns.</dd>
                  </div>
                </dl>
                <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                  <Eye className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                  Sajda gör inte en oklar signal till ett säkert besked.
                </p>
              </div>
            </aside>
          </div>
        </section>

        <section className="mx-auto w-full max-w-7xl px-5 py-14 sm:px-7 sm:py-20" aria-labelledby="method-flow-title">
          <div className="max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Tre medvetna steg</p>
            <h2 id="method-flow-title" className="mt-3 text-balance text-3xl font-semibold tracking-[-0.045em] text-foreground sm:text-4xl">Från idé till ett beslut du kan stå för.</h2>
            <p className="mt-4 text-pretty text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">Sajda ska göra nästa steg tydligare, inte ersätta din bedömning med en svart låda.</p>
          </div>
          <ol className="mt-9 grid gap-4 lg:grid-cols-3">
            {process.map(({ body, icon: Icon, number, title }) => (
              <li key={number} className="sajda-surface relative overflow-hidden p-5 sm:p-6">
                <span className="absolute right-5 top-5 text-sm font-bold tracking-[0.12em] text-primary/50">{number}</span>
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-5 text-lg font-semibold tracking-[-0.025em] text-foreground">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="border-y border-border/80 bg-card" aria-labelledby="status-title">
          <div className="mx-auto grid w-full max-w-7xl gap-10 px-5 py-14 sm:px-7 sm:py-20 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)] lg:gap-16">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Tillgänglighet</p>
              <h2 id="status-title" className="mt-3 text-balance text-3xl font-semibold tracking-[-0.045em] text-foreground sm:text-4xl">Status är en signal, inte en dekor.</h2>
              <p className="mt-4 text-base leading-7 text-muted-foreground">Ett domännamn kan ändra status mellan en kontroll och en utcheckning. Därför behöver både det bekräftade och det okända få synas i samma språk.</p>
              <Link to="/se/sok-doman" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-primary transition-colors hover:text-primary/80">
                Så kontrollerar du en domän
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
            <div className="grid gap-3">
              {states.map(({ body, icon: Icon, title, tone }) => {
                const iconClass = tone === "success" ? "bg-emerald-500/10 text-emerald-700" : tone === "primary" ? "bg-primary/10 text-primary" : "bg-secondary text-primary";
                return (
                  <article key={title} className="flex gap-4 rounded-xl border border-border bg-background p-4 sm:p-5">
                    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${iconClass}`}>
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">{body}</p>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-7xl px-5 py-14 sm:px-7 sm:py-20" aria-labelledby="price-title">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.82fr)] lg:gap-16">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Pris och källa</p>
              <h2 id="price-title" className="mt-3 text-balance text-3xl font-semibold tracking-[-0.045em] text-foreground sm:text-4xl">Ett pris är användbart först när dess sammanhang går att se.</h2>
              <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">Sajda är inte en registrator. När ett pris visas ska det vara möjligt att förstå var uppgiften kommer ifrån och att gå vidare till registratorn för slutlig kontroll.</p>
              <ul className="mt-7 grid gap-3">
                {pricePrinciples.map((principle) => (
                  <li key={principle} className="flex gap-3 rounded-xl border border-border bg-card p-4 text-sm leading-6 text-muted-foreground">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    {principle}
                  </li>
                ))}
              </ul>
            </div>
            <aside className="self-start rounded-[1.25rem] border border-primary/15 bg-primary/[0.035] p-5 sm:p-6">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                <Database className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-5 text-xl font-semibold tracking-[-0.03em] text-foreground">Det slutliga priset hör hemma i kassan.</h3>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">Registratorns utcheckning avgör tillgänglighet, kampanjvillkor, skatt, premiumklassning och eventuella tillägg. Sajda hjälper dig fram till ett bättre underlag före det steget.</p>
            </aside>
          </div>
        </section>

        <section className="border-y border-border/80 bg-card" aria-labelledby="choice-title">
          <div className="mx-auto grid w-full max-w-7xl gap-5 px-5 py-14 sm:px-7 sm:py-20 lg:grid-cols-2">
            <article className="sajda-surface p-5 sm:p-6">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                <Layers3 className="h-5 w-5" aria-hidden="true" />
              </span>
              <h2 id="choice-title" className="mt-5 text-xl font-semibold tracking-[-0.03em] text-foreground">Du väljer registrator.</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">Sajda hjälper dig att se och jämföra vägar vidare. Sajda registrerar inte domänen åt dig och bestämmer inte var du ska köpa den.</p>
            </article>
            <article className="sajda-surface p-5 sm:p-6">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                <LockKeyhole className="h-5 w-5" aria-hidden="true" />
              </span>
              <h2 className="mt-5 text-xl font-semibold tracking-[-0.03em] text-foreground">Håll sökningen saklig.</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">Skriv inte in känsliga personuppgifter eller lösenord. Sajdas sökfält är till för namn, domäner och korta briefs — inte för privat information.</p>
              <Link to="/legal" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary transition-colors hover:text-primary/80">
                Läs villkor och integritet
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </article>
          </div>
        </section>

        <section className="mx-auto flex w-full max-w-7xl flex-col justify-between gap-6 px-5 py-12 sm:px-7 sm:py-16 lg:flex-row lg:items-center">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Nästa steg</p>
            <h2 className="mt-3 text-balance text-2xl font-semibold tracking-[-0.04em] text-foreground sm:text-3xl">Ta med din idé. Sajda hjälper dig att göra den kontrollerbar.</h2>
          </div>
          <Button asChild size="lg" className="shrink-0">
            <Link to="/">
              Starta en sökning
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </section>
      </main>
    </div>
  );
}
