import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, BadgeDollarSign, CheckCircle2, CircleCheckBig, Clipboard, ExternalLink, Globe2, Info, MessageSquareText, RotateCcw, Send, ShieldCheck } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import SaleLandingGenerator from "@/components/SaleLandingGenerator";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/i18n/LanguageProvider";
import { hasSupabaseBrowserConfig } from "@/integrations/supabase/client";
import { MarketplaceHeader } from "@/pages/Marketplace";
import { marketplacePublicUrl } from "@/lib/appSurface";
import { formatMarketplacePrice, interpolateMarketplace, marketplaceCopy } from "@/lib/marketplaceCopy";
import { getMarketplaceListing, type MarketplaceListing } from "@/lib/marketplaceListings";
import {
  getMarketplaceRepository,
  type MarketplaceDomainListing,
  type MarketplacePublicDomainListing,
} from "@/lib/marketplaceRepository";

function CopyLinkButton({ url, label, copiedLabel }: { url: string; label: string; copiedLabel: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      window.prompt("Copy this link", url);
    }
  };

  return (
    <Button type="button" variant="outline" onClick={copy} className="w-full sm:w-auto">
      {copied ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <Clipboard className="h-4 w-4" aria-hidden="true" />}
      {copied ? copiedLabel : label}
    </Button>
  );
}

type BuyerEnquiryErrors = Partial<Record<"offer" | "message", string>>;

export type BuyerPurchaseEnquiry = {
  listingId: string;
  domain: string;
  offerAmount: number;
  currency: MarketplaceListing["currency"];
  message: string;
  createdAt: string;
};

export type BuyerPurchaseEnquiryDelivery = "local" | "received";

export type BuyerPurchaseEnquirySubmitter = (
  enquiry: BuyerPurchaseEnquiry,
) => void | { delivery?: BuyerPurchaseEnquiryDelivery } | Promise<void | { delivery?: BuyerPurchaseEnquiryDelivery }>;

export type BuyerEnquiryFormProps = {
  listing: Pick<MarketplaceListing, "id" | "domain" | "askingPrice" | "currency">;
  /**
   * Optional persistence hook for a public listing. Omit it for the browser-local preview.
   * A fulfilled callback is treated as a received enquiry unless it returns `{ delivery: "local" }`.
   */
  onSubmit?: BuyerPurchaseEnquirySubmitter;
  /**
   * Use `received` only when `onSubmit` persists the enquiry to a verified listing inbox.
   */
  deliveryMode?: BuyerPurchaseEnquiryDelivery;
};

export function BuyerEnquiryForm({ listing, onSubmit, deliveryMode }: BuyerEnquiryFormProps) {
  const { language } = useLanguage();
  const copy = marketplaceCopy[language];
  const [offer, setOffer] = useState("");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<BuyerEnquiryErrors>({});
  const [submitted, setSubmitted] = useState<{ offer: number; delivery: BuyerPurchaseEnquiryDelivery } | null>(null);
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const askingPrice = formatMarketplacePrice(listing.askingPrice, listing.currency, language);
  const fieldPrefix = `purchase-enquiry-${listing.id}`;
  const effectiveDelivery: BuyerPurchaseEnquiryDelivery = onSubmit && (deliveryMode ?? "received") === "received"
    ? "received"
    : "local";

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextErrors: BuyerEnquiryErrors = {};
    const offerValue = Number(offer);
    const trimmedMessage = message.trim();

    if (!Number.isFinite(offerValue) || offerValue <= 0 || offerValue > 1_000_000_000) {
      nextErrors.offer = copy.invalidOffer;
    }
    if (trimmedMessage.length < 12) nextErrors.message = copy.missingBuyerMessage;

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const enquiry: BuyerPurchaseEnquiry = {
      listingId: listing.id,
      domain: listing.domain,
      offerAmount: offerValue,
      currency: listing.currency,
      message: trimmedMessage,
      createdAt: new Date().toISOString(),
    };

    setSubmitError("");
    setIsSubmitting(true);
    try {
      const result = await onSubmit?.(enquiry);
      const returnedDelivery = result && typeof result === "object" ? result.delivery : undefined;
      setSubmitted({
        offer: offerValue,
        delivery: returnedDelivery ?? effectiveDelivery,
      });
    } catch {
      setSubmitError(copy.purchaseEnquirySaveFailed);
    } finally {
      setIsSubmitting(false);
    }
  };

  const reset = () => {
    setSubmitted(null);
    setOffer("");
    setMessage("");
    setErrors({});
    setSubmitError("");
  };

  const inputClassName = "mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20";
  const textareaClassName = "mt-2 min-h-28 w-full resize-y rounded-xl border border-input bg-background px-3 py-2.5 text-sm leading-6 text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20";

  return (
    <section className="sajda-surface overflow-hidden" aria-labelledby={`${fieldPrefix}-title`}>
      <div className="border-b border-border bg-[linear-gradient(118deg,hsl(var(--primary)/0.10),hsl(var(--card))_52%)] px-6 py-6 sm:px-8 sm:py-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-primary/20 bg-card text-primary shadow-sm">
              <MessageSquareText className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">{copy.purchaseEnquiryEyebrow}</p>
              <h2 id={`${fieldPrefix}-title`} className="mt-2 text-xl font-semibold tracking-[-0.035em] text-foreground sm:text-2xl">{copy.purchaseEnquiryTitle}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                {effectiveDelivery === "received" ? copy.purchaseEnquiryLiveLead : copy.purchaseEnquiryLead}
              </p>
            </div>
          </div>
          <div className="inline-flex shrink-0 items-center gap-2 self-start rounded-full border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground shadow-sm">
            <BadgeDollarSign className="h-4 w-4 text-primary" aria-hidden="true" />
            {askingPrice}
          </div>
        </div>
      </div>

      <div className="p-6 sm:p-8">
        {submitted !== null ? (
          <div className="rounded-2xl border border-primary/20 bg-primary/[0.055] p-5 sm:p-6" role="status" aria-live="polite">
            <div className="flex gap-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-card text-primary shadow-sm">
                <CircleCheckBig className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  {submitted.delivery === "received" ? copy.purchaseEnquiryReceivedTitle : copy.purchaseEnquirySentTitle}
                </h3>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  {submitted.delivery === "received" ? copy.purchaseEnquiryReceivedBody : copy.purchaseEnquirySentBody}
                </p>
                <p className="mt-3 text-sm font-semibold text-foreground">
                  {interpolateMarketplace(copy.purchaseEnquirySentOffer, {
                    price: formatMarketplacePrice(submitted.offer, listing.currency, language),
                  })}
                </p>
              </div>
            </div>
            <Button type="button" variant="outline" onClick={reset} className="mt-5">
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              {copy.purchaseEnquiryNew}
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} noValidate>
            <div className="grid gap-5 md:grid-cols-2">
              <label className="block text-sm font-semibold text-foreground" htmlFor={`${fieldPrefix}-offer`}>
                {copy.offerAmount}
                <span className="mt-1 block text-xs font-normal text-muted-foreground">
                  {interpolateMarketplace(copy.offerAmountHint, { price: askingPrice })}
                </span>
                <input
                  id={`${fieldPrefix}-offer`}
                  type="number"
                  min="1"
                  max="1000000000"
                  step="1"
                  inputMode="decimal"
                  value={offer}
                  onChange={(event) => setOffer(event.target.value)}
                  aria-invalid={Boolean(errors.offer)}
                  aria-describedby={errors.offer ? `${fieldPrefix}-offer-error` : undefined}
                  className={`${inputClassName} ${errors.offer ? "border-destructive focus:border-destructive focus:ring-destructive/20" : ""}`}
                />
                {errors.offer && <span id={`${fieldPrefix}-offer-error`} role="alert" className="mt-2 block text-xs font-medium text-destructive">{errors.offer}</span>}
              </label>

              <label className="block text-sm font-semibold text-foreground" htmlFor={`${fieldPrefix}-message`}>
                {copy.buyerMessage}
                <textarea
                  id={`${fieldPrefix}-message`}
                  maxLength={1000}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder={copy.buyerMessagePlaceholder}
                  aria-invalid={Boolean(errors.message)}
                  aria-describedby={errors.message ? `${fieldPrefix}-message-error` : undefined}
                  className={`${textareaClassName} ${errors.message ? "border-destructive focus:border-destructive focus:ring-destructive/20" : ""}`}
                />
                {errors.message && <span id={`${fieldPrefix}-message-error`} role="alert" className="mt-2 block text-xs font-medium text-destructive">{errors.message}</span>}
              </label>
            </div>

            {submitError && <p role="alert" className="mt-5 rounded-lg border border-destructive/25 bg-destructive/[0.05] px-3 py-2 text-sm font-medium text-destructive">{submitError}</p>}
            <div className="mt-6 flex flex-col gap-4 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-2xl text-xs leading-5 text-muted-foreground">{copy.purchaseEnquiryPrivacy}</p>
              <Button type="submit" className="shrink-0" disabled={isSubmitting}>
                <Send className="h-4 w-4" aria-hidden="true" />
                {effectiveDelivery === "received" ? copy.purchaseEnquirySendButton : copy.purchaseEnquiryButton}
              </Button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}

type ListingSource = "legacy" | "public" | "seller";

type ListingDetail = Pick<MarketplaceListing, "id" | "domain" | "askingPrice" | "currency" | "description"> & {
  source: ListingSource;
  sellerDisplayName?: string;
  contactName?: string;
  status?: MarketplaceDomainListing["status"];
  ownershipVerified?: boolean;
};

type PersistentListingCopy = {
  verified: string;
  sellerDraft: string;
  ownedBy: string;
  publicPage: string;
  signInTitle: string;
  signInBody: string;
  signInButton: string;
  saleSiteTitle: string;
  saleSiteBody: string;
};

const persistentListingCopy: Record<"en" | "sv" | "es" | "fr" | "zh", PersistentListingCopy> = {
  en: {
    verified: "DNS control verified",
    sellerDraft: "Seller listing",
    ownedBy: "Seller",
    publicPage: "Public Sajda page",
    signInTitle: "Sign in to make an offer.",
    signInBody: "A Sajda account keeps your offer connected to a real buyer profile and the listing record.",
    signInButton: "Sign in to make an offer",
    saleSiteTitle: "Deploy the for-sale page",
    saleSiteBody: "Download a clean static page that points buyers back to this verified Sajda listing.",
  },
  sv: {
    verified: "DNS-kontroll verifierad",
    sellerDraft: "Säljarannons",
    ownedBy: "Säljare",
    publicPage: "Publik Sajda-sida",
    signInTitle: "Logga in för att lägga ett bud.",
    signInBody: "Ett Sajda-konto kopplar ditt bud till en riktig köparprofil och annonsens historik.",
    signInButton: "Logga in för att lägga bud",
    saleSiteTitle: "Publicera säljsidan",
    saleSiteBody: "Ladda ner en ren statisk sida som leder köparen tillbaka till den verifierade Sajda-annonsen.",
  },
  es: {
    verified: "Control DNS verificado",
    sellerDraft: "Anuncio del vendedor",
    ownedBy: "Vendedor",
    publicPage: "Página pública de Sajda",
    signInTitle: "Inicia sesión para hacer una oferta.",
    signInBody: "Una cuenta Sajda vincula tu oferta con un perfil de comprador real y el registro del anuncio.",
    signInButton: "Iniciar sesión para ofertar",
    saleSiteTitle: "Publica la página de venta",
    saleSiteBody: "Descarga una página estática limpia que lleva al comprador a este anuncio verificado de Sajda.",
  },
  fr: {
    verified: "Contrôle DNS vérifié",
    sellerDraft: "Annonce vendeur",
    ownedBy: "Vendeur",
    publicPage: "Page Sajda publique",
    signInTitle: "Connectez-vous pour faire une offre.",
    signInBody: "Un compte Sajda relie votre offre à un véritable profil d’acheteur et à l’annonce.",
    signInButton: "Se connecter pour faire une offre",
    saleSiteTitle: "Déployez la page de vente",
    saleSiteBody: "Téléchargez une page statique sobre qui ramène l’acheteur vers cette annonce Sajda vérifiée.",
  },
  zh: {
    verified: "DNS 控制已验证",
    sellerDraft: "卖家刊登",
    ownedBy: "卖家",
    publicPage: "公开 Sajda 页面",
    signInTitle: "登录后即可出价。",
    signInBody: "Sajda 账户会将您的出价与真实买家资料和该刊登记录关联。",
    signInButton: "登录并出价",
    saleSiteTitle: "部署出售页面",
    saleSiteBody: "下载简洁的静态页面，将买家带回这个已验证的 Sajda 刊登页。",
  },
};

function toPersistentPublicListing(listing: MarketplacePublicDomainListing): ListingDetail {
  return {
    id: listing.id,
    domain: listing.domain,
    askingPrice: listing.askingPrice,
    currency: listing.currency,
    description: listing.description,
    sellerDisplayName: listing.sellerDisplayName,
    source: "public",
    ownershipVerified: true,
  };
}

function toPersistentSellerListing(listing: MarketplaceDomainListing): ListingDetail {
  return {
    id: listing.id,
    domain: listing.domain,
    askingPrice: listing.askingPrice,
    currency: listing.currency,
    description: listing.description,
    sellerDisplayName: listing.sellerDisplayName,
    source: "seller",
    status: listing.status,
    ownershipVerified: listing.ownershipVerificationStatus === "verified",
  };
}

function toLegacyListing(listing: MarketplaceListing): ListingDetail {
  return {
    id: listing.id,
    domain: listing.domain,
    askingPrice: listing.askingPrice,
    currency: listing.currency,
    description: listing.description,
    contactName: listing.contactName,
    source: "legacy",
  };
}

function listingUrlFor(id: string): string {
  return marketplacePublicUrl(id);
}

function ListingSummary({ listing, signedIn }: { listing: ListingDetail; signedIn: boolean }) {
  const { language } = useLanguage();
  const copy = marketplaceCopy[language];
  const persistent = persistentListingCopy[language];
  const listingUrl = listingUrlFor(listing.id);
  const isPersistent = listing.source !== "legacy";
  const isSellerView = listing.source === "seller";
  const isPublicListing = listing.source === "public";
  const canExportSaleSite = isSellerView && listing.status === "active" && listing.ownershipVerified;

  const submitOffer = async (enquiry: BuyerPurchaseEnquiry): Promise<{ delivery: "received" }> => {
    // A marketplace offer is immutable after submission. Keep its note to the
    // buyer's own words instead of embedding mutable personal contact details
    // inside the permanent offer record. The authenticated buyer identity is
    // already attached by the database through `buyer_id`.
    await getMarketplaceRepository().createOffer({ listingId: listing.id, amount: enquiry.offerAmount, message: enquiry.message });
    return { delivery: "received" };
  };

  return (
    <>
      <section className="sajda-canvas border-b border-border/70">
        <div className="mx-auto w-full max-w-6xl px-5 py-11 sm:px-7 sm:py-16">
          <Link to="/marketplace" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {copy.backToMarketplace}
          </Link>
          <div className="mt-8 grid gap-9 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,0.5fr)] lg:items-end lg:gap-16">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-card/90 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-primary shadow-sm">
                <Globe2 className="h-3.5 w-3.5" aria-hidden="true" />
                {copy.detailEyebrow}
              </div>
              <h1 className="mt-6 break-all text-balance text-4xl font-semibold leading-[1.02] tracking-[-0.055em] text-foreground sm:text-6xl">{listing.domain}</h1>
              <div className="mt-5 inline-flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm font-semibold text-primary">
                <Info className="h-4 w-4" aria-hidden="true" />
                {isPersistent ? (listing.ownershipVerified ? persistent.verified : persistent.sellerDraft) : copy.localDraft}
              </div>
            </div>
            <div className="sajda-surface-raised bg-card/95 p-6 sm:p-7">
              <p className="text-sm font-medium text-muted-foreground">{copy.askingPrice}</p>
              <p className="mt-2 text-3xl font-semibold tracking-[-0.045em] text-foreground">{formatMarketplacePrice(listing.askingPrice, listing.currency, language)}</p>
              <p className="mt-5 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">{isPersistent ? persistent.publicPage : copy.localOnlyBody}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-5 px-5 py-12 sm:px-7 sm:py-16 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.58fr)] lg:gap-7">
        <article className="sajda-surface p-6 sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">{copy.description}</p>
          <p className="mt-4 whitespace-pre-wrap text-base leading-8 text-foreground/85 sm:text-lg">{listing.description}</p>
        </article>

        <aside className="sajda-surface p-6 sm:p-7">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-muted text-foreground"><ShieldCheck className="h-5 w-5" aria-hidden="true" /></span>
            <div>
              <p className="text-sm font-semibold text-foreground">{isPersistent ? (listing.ownershipVerified ? persistent.verified : persistent.sellerDraft) : copy.localOnly}</p>
              <p className="text-sm text-muted-foreground">{copy.categoryDomain}</p>
            </div>
          </div>
          <dl className="mt-6 space-y-5 border-t border-border pt-5 text-sm">
            <div>
              <dt className="text-muted-foreground">{isPersistent ? persistent.ownedBy : copy.contact}</dt>
              <dd className="mt-1 font-semibold text-foreground">{listing.sellerDisplayName || listing.contactName || copy.notProvided}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{copy.directLink}</dt>
              <dd className="mt-2 break-all text-xs leading-5 text-foreground/80">{listingUrl}</dd>
            </div>
          </dl>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row lg:flex-col">
            <CopyLinkButton url={listingUrl} label={copy.copyLink} copiedLabel={copy.copied} />
            <a href={listingUrl} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-input bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              {copy.openListing}
            </a>
          </div>
        </aside>
      </section>

      {isPublicListing ? (
        <section className="mx-auto w-full max-w-6xl px-5 pb-6 sm:px-7 sm:pb-8">
          {signedIn ? (
            <BuyerEnquiryForm listing={listing} onSubmit={submitOffer} deliveryMode="received" />
          ) : (
            <div className="sajda-surface-raised border-primary/20 bg-primary/[0.035] p-6 sm:p-8">
              <MessageSquareText className="h-6 w-6 text-primary" aria-hidden="true" />
              <h2 className="mt-4 text-xl font-semibold tracking-[-0.03em]">{persistent.signInTitle}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{persistent.signInBody}</p>
              <Button asChild className="mt-5"><Link to="/auth">{persistent.signInButton}<ArrowRight className="h-4 w-4" /></Link></Button>
            </div>
          )}
        </section>
      ) : listing.source === "legacy" ? (
        <section className="mx-auto w-full max-w-6xl px-5 pb-6 sm:px-7 sm:pb-8"><BuyerEnquiryForm listing={listing} /></section>
      ) : null}

      {canExportSaleSite ? (
        <section className="mx-auto w-full max-w-6xl px-5 pb-12 sm:px-7 sm:pb-16">
          <div className="mb-5">
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">{persistent.saleSiteTitle}</p>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{persistent.saleSiteBody}</p>
          </div>
          <SaleLandingGenerator domain={listing.domain} price={listing.askingPrice} currency={listing.currency} description={listing.description} listingUrl={listingUrl} />
        </section>
      ) : listing.source === "legacy" ? (
        <section className="mx-auto w-full max-w-6xl px-5 pb-12 sm:px-7 sm:pb-16">
          <SaleLandingGenerator domain={listing.domain} price={listing.askingPrice} currency={listing.currency} description={listing.description} listingUrl={listingUrl} />
        </section>
      ) : null}
    </>
  );
}

export default function MarketplaceListing() {
  const { listingId } = useParams();
  const { language } = useLanguage();
  const { user } = useAuth();
  const copy = marketplaceCopy[language];
  const [listing, setListing] = useState<ListingDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let current = true;
    setIsLoading(true);
    void (async () => {
      if (!listingId) {
        if (current) setListing(null);
        return;
      }

      if (!hasSupabaseBrowserConfig) {
        const legacy = getMarketplaceListing(listingId);
        if (current) setListing(legacy ? toLegacyListing(legacy) : null);
        return;
      }

      try {
        const repository = getMarketplaceRepository();
        const [publicListing, sellerListing] = await Promise.all([
          repository.getPublicActiveListing(listingId),
          user ? repository.getMyListing(listingId) : Promise.resolve(null),
        ]);
        if (!current) return;
        setListing(sellerListing ? toPersistentSellerListing(sellerListing) : publicListing ? toPersistentPublicListing(publicListing) : null);
      } catch {
        if (current) setListing(null);
      }
    })().finally(() => {
      if (current) setIsLoading(false);
    });
    return () => { current = false; };
  }, [listingId, user]);

  useEffect(() => {
    document.title = listing ? `${listing.domain} — ${copy.pageTitle}` : copy.pageTitle;
  }, [copy.pageTitle, listing]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <MarketplaceHeader backLabel={copy.backToMarketplace} />
      <main>
        {isLoading ? (
          <section className="mx-auto grid min-h-[45vh] w-full max-w-3xl place-items-center px-5 py-16 text-center sm:px-7"><p className="text-sm font-medium text-muted-foreground">{copy.loadingListing}</p></section>
        ) : listing ? (
          <ListingSummary listing={listing} signedIn={Boolean(user)} />
        ) : (
          <section className="mx-auto grid min-h-[60vh] w-full max-w-3xl place-items-center px-5 py-16 text-center sm:px-7">
            <div className="sajda-surface-raised max-w-xl p-7 sm:p-10">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-muted text-primary"><Globe2 className="h-6 w-6" aria-hidden="true" /></span>
              <h1 className="mt-6 text-balance text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">{copy.notFoundTitle}</h1>
              <p className="mt-4 text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">{copy.notFoundBody}</p>
              <Button asChild size="lg" className="mt-7"><Link to="/marketplace">{copy.createFirst}</Link></Button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
