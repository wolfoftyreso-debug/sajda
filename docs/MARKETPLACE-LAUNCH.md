# Sajda Marketplace launch model

Sajda Marketplace is for domain listings. A tidy catalogue is not enough: the
domain-transfer process must use the party that is actually allowed to complete
the change of control.

## Product boundary

| Asset | Sajda can do now | Required before a live transaction | Never collect |
| --- | --- | --- | --- |
| Domain name | Seller draft, DNS-TXT proof request, registry/registrar status, transparent asking price | authenticated seller, durable listing store, proof review, registrar transfer workflow, licensed payment-provider marketplace payouts | registrar password, account session, AuthInfo/transfer code as stored inventory |

## Domain seller lifecycle

1. **Draft** — the seller creates a non-public listing with a price and factual
   description.
2. **Identity and trader review** — verify the seller before public listing.
   A business seller needs the required public trader information.
3. **Control proof** — issue a one-time DNS TXT challenge for the exact domain.
   The challenge and its expiry must be stored server-side; a browser-only token
   is not proof.
4. **Transfer readiness** — collect registrar, expiry, lock, dispute and
   transfer-eligibility states. The seller does not upload a password or a
   transfer code to Sajda.
5. **Offer and payment** — use a licensed payment provider's marketplace/escrow
   product. Sajda must not self-custody buyer funds.
6. **Registrar-confirmed transfer** — the relevant registrar performs the
   transfer / change of registrant, and both parties receive the registrar's
   confirmations.
7. **Settlement and record** — release funds only after the agreed transfer
   evidence is present; create receipts, audit records and support trail.

For gTLDs, the transfer flow must account for ICANN AuthInfo handling,
registrant confirmations, disputes and applicable 60-day locks. The code is a
registrar-issued transfer identifier, not a credential to retain in a seller
vault. See [ICANN Transfer Policy](https://www.icann.org/en/contracted-parties/accredited-registrars/resources/domain-name-transfers/policy).

For `.se`, holder verification and transfer are handled through the registrar
and registry rules. See [Internetstiftelsen's holder-verification guidance](https://internetstiftelsen.se/domaner/registrera-ett-domannamn/verifiering-av-domaninnehavare/).

## Operational release gates

No marketplace category becomes public merely because its interface exists.

- Durable server-side listings, audit events and abuse reporting.
- Seller / trader verification and mandatory public trader details where
  applicable.
- Category-specific terms, support escalation and moderation.
- A licensed payment provider's approved marketplace-payout architecture.
- Tax/DAC7 and consumer-law review before accepting third-party listings.
- A registrar integration or documented manual registrar hand-off for every
  live domain sale.
Until those gates are met, the app must use **local draft** states — never a
simulated live listing or checkout.
