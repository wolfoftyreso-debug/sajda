import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Globe2,
  Plus,
  Store,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import MarketplaceSellerWorkspace from "@/components/MarketplaceSellerWorkspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/i18n/LanguageProvider";
import { formatMarketplacePrice, interpolateMarketplace, marketplaceCopy } from "@/lib/marketplaceCopy";
import { hasSupabaseBrowserConfig } from "@/integrations/supabase/client";
import { isNativeApp } from "@/lib/appSurface";
import { nativeCopy } from "@/app/nativeCopy";
import {
  createMarketplaceListing,
  getMarketplaceListings,
  type MarketplaceCurrency,
  type MarketplaceListing,
} from "@/lib/marketplaceListings";

type ListingForm = {
  domain: string;
  price: string;
  currency: MarketplaceCurrency;
  description: string;
  contactName: string;
};

const initialForm: ListingForm = {
  domain: "",
  price: "",
  currency: "USD",
  description: "",
  contactName: "",
};

function MarketplaceHeader({ backLabel }: { backLabel?: string }) {
  if (isNativeApp) return null;
  return (
    <header className="border-b border-border/80 bg-card">
      <div className="mx-auto flex min-h-[4.75rem] w-full max-w-7xl items-center justify-between gap-4 px-5 sm:px-7">
        <Link
          to="/"
          className="inline-flex shrink-0 items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="Sajda"
        >
          <img src="/sajda-logo.svg" alt="Sajda" className="h-7 w-auto sm:h-8" />
        </Link>
        <div className="flex items-center gap-3 sm:gap-5">
          <Link
            to="/"
            className="hidden text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:inline-flex"
          >
            {backLabel ?? "Sajda"}
          </Link>
          <LanguageSwitcher />
        </div>
      </div>
    </header>
  );
}

function ListingCard({ listing }: { listing: MarketplaceListing }) {
  const { language } = useLanguage();
  const copy = marketplaceCopy[language];

  return (
    <article className="sajda-surface sajda-interactive flex h-full flex-col p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Globe2 className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-primary">
          {copy.categoryDraftStatus}
        </span>
      </div>
      <h2 className="mt-5 break-all text-xl font-semibold tracking-[-0.035em] text-foreground">{listing.domain}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{copy.askingPrice}</p>
      <p className="mt-1 text-lg font-semibold text-foreground">{formatMarketplacePrice(listing.askingPrice, listing.currency, language)}</p>
      <p className="mt-4 line-clamp-3 text-sm leading-6 text-muted-foreground">{listing.description}</p>
      <Button asChild variant="outline" className="mt-6 w-full">
        <Link to={`/marketplace/${listing.id}`}>
          {copy.openListing}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </Button>
    </article>
  );
}

export { MarketplaceHeader };

export default function Marketplace() {
  const { language } = useLanguage();
  const copy = marketplaceCopy[language];
  const navigate = useNavigate();
  const persistentMarketplace = hasSupabaseBrowserConfig;
  const [listings, setListings] = useState<MarketplaceListing[]>(() => getMarketplaceListings());
  const [form, setForm] = useState<ListingForm>(initialForm);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = copy.pageTitle;
  }, [copy.pageTitle]);

  const updateForm = <Key extends keyof ListingForm>(key: Key, value: ListingForm[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (error) setError(null);
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      const listing = createMarketplaceListing({
        domain: form.domain,
        askingPrice: Number(form.price),
        currency: form.currency,
        description: form.description,
        contactName: form.contactName,
      });
      setListings(getMarketplaceListings());
      setForm(initialForm);
      navigate(`/marketplace/${listing.id}`);
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "";
      if (code === "invalid-domain") setError(copy.invalidDomain);
      else if (code === "invalid-price") setError(copy.invalidPrice);
      else setError(copy.missingDescription);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <MarketplaceHeader backLabel="Sajda" />

      <main>
        <section className="sajda-canvas border-b border-border/70">
          <div className={isNativeApp ? "mx-auto w-full max-w-5xl px-4 py-6" : "mx-auto w-full max-w-5xl px-5 py-12 text-center sm:px-7 sm:py-16 lg:py-20"}>
            <div className="mx-auto max-w-3xl">
              {!isNativeApp && <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-card/90 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-primary shadow-sm">
                <Store className="h-3.5 w-3.5" aria-hidden="true" />
                {copy.eyebrow}
              </div>}
              <h1 className={isNativeApp ? "text-2xl font-semibold tracking-tight" : "mt-6 max-w-3xl text-balance text-4xl font-semibold leading-[1.03] tracking-[-0.055em] text-foreground sm:text-6xl"}>
                {isNativeApp ? nativeCopy[language].marketplace : persistentMarketplace ? copy.title : copy.createTitle}
              </h1>
              <p className="mx-auto mt-6 max-w-2xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">{persistentMarketplace ? copy.lead : copy.emptyBody}</p>
              {!persistentMarketplace && (
                <div className="mx-auto mt-5 max-w-2xl rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm leading-6 text-amber-950" role="note">
                  <span className="font-semibold">{copy.localBadge}.</span>{" "}{copy.localNotice}
                </div>
              )}
              <Button asChild size="lg" className="mt-8">
                <a href="#create-listing">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  {persistentMarketplace ? copy.createLink : copy.localCreateLink}
                </a>
              </Button>
            </div>
          </div>
        </section>

        {!persistentMarketplace && (
          <section className="mx-auto w-full max-w-7xl px-5 py-12 sm:px-7 sm:py-16">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">{copy.draftsLabel}</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">{copy.browseLabel}</h2>
              </div>
              <p className="text-sm font-medium text-muted-foreground">{interpolateMarketplace(copy.draftsCount, { count: listings.length })}</p>
            </div>

            {listings.length > 0 ? (
              <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {listings.map((listing) => <ListingCard key={listing.id} listing={listing} />)}
              </div>
            ) : (
              <div className="mt-7 rounded-[1.25rem] border border-dashed border-primary/25 bg-primary/[0.035] p-7 sm:p-9">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-card text-primary shadow-sm">
                  <Globe2 className="h-5 w-5" aria-hidden="true" />
                </span>
                <h2 className="mt-5 text-lg font-semibold tracking-[-0.025em]">{copy.emptyTitle}</h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{copy.emptyBody}</p>
              </div>
            )}
          </section>
        )}

        {persistentMarketplace ? (
          <section id="create-listing" className="border-y border-border/80 bg-card scroll-mt-6">
            <div className="mx-auto w-full max-w-7xl px-5 py-12 sm:px-7 sm:py-16">
              <MarketplaceSellerWorkspace />
            </div>
          </section>
        ) : (
          <section id="create-listing" className="border-y border-border/80 bg-card scroll-mt-6">
            <div className="mx-auto grid w-full max-w-7xl gap-9 px-5 py-12 sm:px-7 sm:py-16 lg:grid-cols-[minmax(0,0.75fr)_minmax(25rem,1fr)] lg:gap-16">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">{copy.domainPanelEyebrow}</p>
                <h2 className="mt-3 text-balance text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">{copy.createTitle}</h2>
                <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground">{copy.createLead}</p>
              </div>

              <form onSubmit={onSubmit} className="sajda-surface-raised p-5 sm:p-7" noValidate>
                <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_10rem]">
                  <div className="space-y-2">
                    <Label htmlFor="marketplace-domain">{copy.domainLabel}</Label>
                    <Input
                      id="marketplace-domain"
                      value={form.domain}
                      onChange={(event) => updateForm("domain", event.target.value)}
                      placeholder={copy.domainPlaceholder}
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="marketplace-price">{copy.priceLabel}</Label>
                    <Input
                      id="marketplace-price"
                      type="number"
                      min="1"
                      step="1"
                      value={form.price}
                      onChange={(event) => updateForm("price", event.target.value)}
                      placeholder="2500"
                      required
                    />
                  </div>
                </div>

                <div className="mt-5 max-w-[10rem] space-y-2">
                  <Label htmlFor="marketplace-currency">{copy.currencyLabel}</Label>
                  <select
                    id="marketplace-currency"
                    value={form.currency}
                    onChange={(event) => updateForm("currency", event.target.value as MarketplaceCurrency)}
                    className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value="USD">USD</option>
                    <option value="SEK">SEK</option>
                    <option value="EUR">EUR</option>
                  </select>
                </div>

                <div className="mt-5 space-y-2">
                  <Label htmlFor="marketplace-description">{copy.descriptionLabel}</Label>
                  <Textarea
                    id="marketplace-description"
                    value={form.description}
                    onChange={(event) => updateForm("description", event.target.value)}
                    placeholder={copy.descriptionPlaceholder}
                    maxLength={1400}
                    className="min-h-28 rounded-xl"
                    required
                  />
                </div>

                <div className="mt-5 space-y-2">
                  <Label htmlFor="marketplace-contact">
                    {copy.contactLabel} <span className="font-normal text-muted-foreground">({copy.contactOptional})</span>
                  </Label>
                  <Input
                    id="marketplace-contact"
                    value={form.contactName}
                    onChange={(event) => updateForm("contactName", event.target.value)}
                    placeholder={copy.contactPlaceholder}
                    maxLength={80}
                  />
                </div>

                {error && <p role="alert" className="mt-5 rounded-lg border border-destructive/25 bg-destructive/[0.05] px-3 py-2 text-sm font-medium text-destructive">{error}</p>}

                <div className="mt-6 rounded-xl border border-border bg-muted/45 p-4">
                  <p className="text-xs leading-5 text-muted-foreground">{copy.privacyNotice}</p>
                </div>
                <Button type="submit" size="lg" className="mt-6 w-full">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  {copy.localCreateLink}
                </Button>
              </form>
            </div>
          </section>
        )}

        <section className="mx-auto w-full max-w-7xl px-5 py-10 sm:px-7 sm:py-12">
          <Link
            to="/developers"
            className="inline-flex items-center gap-2 text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            Sajda Developers
          </Link>
        </section>
      </main>
    </div>
  );
}
