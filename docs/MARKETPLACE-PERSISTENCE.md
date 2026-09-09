# Marketplace persistence: domain listings

> Status: **not live.** This document preserves the former Supabase/RLS design
> as migration input. New marketplace persistence will be built behind
> Vercel Functions backed by Neon; do not apply the migration or configure
> browser database credentials from this document.

This document is the implementation contract for Sajda's persistent domain
listing foundation. It deliberately does not implement payment, escrow,
registrar access, AuthInfo handling, buyer credentials, or a registrar
transfer workflow.

## What the migration creates

The marketplace-domain-listings migration adds:

- Marketplace seller profiles with seller-scoped public display identity.
- Durable domain listings and publication state.
- Expiring DNS-TXT domain-control challenges.
- Non-binding buyer offers.
- Append-only, server-written listing/proof/offer audit metadata.
- A narrow public view with only active, verified, unexpired listing fields.

Raw listing, proof, offer, and audit tables use RLS. Anonymous users have no
raw-table access. Sellers can access only their profile/listings/proofs and the
offers/audit records related to their own listings. Buyers can access only
their own offers. A browser cannot set a listing to active, mark a proof
verified, modify a proof token, or change an offer's terms after submission.

## Listing state model

| State | Meaning | Visible publicly |
| --- | --- | --- |
| seller_declared | Seller created or edited a draft. | No |
| proof_pending | A fresh DNS-TXT challenge was issued. | No |
| under_review | Seller submitted the proof; the server must check DNS. | No |
| active | A server-side verifier recorded a valid proof and publication approval. | Yes |
| paused, withdrawn, sold, rejected | Not on the public listing surface. | No |

Changing the domain resets proof state and expires any outstanding challenge.
The database rejects active unless the listing has a verified control proof, a
verification timestamp, and a publication timestamp.

## Historical migration notes

Apply all repository migrations in order to the intended Supabase project.
From a machine logged into the intended project:

~~~sh
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
~~~

For a self-hosted stack, run the migration through the database owner in the
same way as the existing production-hardening migration. Do not paste only the
table definitions: the functions, triggers, policies, view, and grants are
part of the contract.

After migration, regenerate the Supabase TypeScript types if the delivery
workflow uses generated types:

~~~sh
npx supabase gen types typescript --linked > src/integrations/supabase/types.ts
~~~

The checked-in types already contain this contract so the app compiles before
the next generation step.

## Vercel configuration

The default build-vercel mode remains anonymous search. To enable signed-in
sellers and persistent marketplace data in the same public-search deployment,
set these browser-safe Vercel Project Environment Variables for the required
environments:

~~~text
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
~~~

VITE_SUPABASE_ANON_KEY is also accepted for projects that still use the legacy
key name. Set one public key, not a service-role key. The build keeps public
search mode enabled: search remains public while Supabase auth is available
when both values above are present.

A DNS verifier endpoint must run server-side and needs:

~~~text
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=server-only-secret
~~~

Never prefix that value with VITE_; it must never reach the browser. The
verifier should resolve _sajda.DOMAIN externally, compare the exact stored
challenge token, then call:

~~~sql
select public.record_marketplace_domain_control_result(
  'PROOF_UUID',
  true,
  true,
  'DNS TXT record matched'
);
~~~

This RPC is granted only to service_role. Passing true for the third argument
publishes the listing; passing false leaves a verified listing in under_review.
The concrete request/response, DNS timeout, and rate-limit contract is in
[MARKETPLACE-DNS-VERIFICATION.md](./MARKETPLACE-DNS-VERIFICATION.md).

## Front-end repository

Use getMarketplaceRepository from src/lib/marketplaceRepository.ts. It exposes
the seller, listing, domain-control proof, offer, public-feed, and audit
methods.

~~~ts
const marketplace = getMarketplaceRepository();

await marketplace.ensureSellerProfile({ displayName: "Sajda seller" });
const listing = await marketplace.createListing({
  domain: "example.dev",
  description: "Short factual description.",
  askingPrice: 2500,
  currency: "USD",
  sellerDisplayName: "Sajda seller",
});

const proof = await marketplace.beginDomainControlProof(listing.id);
// Show the seller: proof.challengeRecord + proof.challengeToken
await marketplace.submitDomainControlProof(proof.id);
// The server verifier performs the next step; the browser cannot self-publish.
~~~

listPublicActiveListings and getPublicActiveListing use only the safe public
view. listMyListings uses seller-scoped RLS. createOffer creates a non-binding
offer; accepting one never means payment, transfer, or delivery occurred.

When no browser Supabase configuration is present, the repository offers an
isolated local fallback only while Vite runs in development. Production builds
throw MarketplaceRepositoryUnavailableError rather than silently saving
marketplace data in localStorage.

## Smoke checks

1. As an authenticated seller, create a profile and a seller_declared listing.
2. Confirm the listing does not appear in the public active-listing view.
3. Call beginDomainControlProof; confirm the listing enters proof_pending and
   the seller receives exactly one expiring TXT challenge.
4. Submit the proof and let the server resolve the TXT record.
5. Confirm direct browser updates to active and verified fail.
6. As service role, record a valid result with publication enabled; confirm
   the safe public view returns the listing.
7. As an anonymous user, confirm raw marketplace tables remain inaccessible.

Run project checks after integration:

~~~sh
npm run typecheck
npm run lint -- --quiet
npm run build:vercel
~~~
