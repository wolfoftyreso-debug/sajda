# Provider connectors

Sajda compares official purchase paths without pretending that every
provider supplies a live retail quote. Registry availability and a provider's
checkout price are separate facts.

## Release behaviour

- Loopia is the only active price connection. Its public detailed price list
  is parsed conservatively and every amount carries its source and check time.
- The remaining public providers return an official HTTPS purchase/search link
  and `priceStatus: "not_connected"` until a dedicated, reviewed API adapter
  is available.
- A browser or AI model must never scrape login-protected pages, defeat a
  CAPTCHA, impersonate a user, or turn a marketing page into a price quote.
- `Openprovider` and `ResellerClub` are backend-only reseller integrations;
  they are not offered as public buyer choices without a separate reseller
  storefront and agreement.

## First implementation wave

These providers have documented API paths that can support an explicit,
credentialed server-side adapter:

| Provider | Expected capability | Official documentation |
| --- | --- | --- |
| Spaceship | Availability and per-domain prices | [Spaceship API](https://docs.spaceship.dev/) |
| Name.com | Availability/search | [Name.com API](https://docs.name.com/api/v1/overview) |
| NameSilo | Availability, registration and renewal prices | [NameSilo API](https://www.namesilo.com/api-reference) |
| Alibaba Cloud | Availability and domain price data | [Alibaba Cloud Domain API](https://help.aliyun.com/en/dws/developer-reference/api-domain-2018-01-29-overview) |
| InternetBS | Availability and pricing | [InternetBS API](https://www.internetbs.net/internet-bs-api.pdf) |
| Wix | Availability only; price remains checkout-confirmed | [Wix Domains API](https://dev.wix.com/docs/api-reference/account-level/domains/domain-search/availability-v2/introduction) |

## Adapter safety contract

Each provider adapter must:

1. Use the provider's documented HTTPS API with a server-only credential.
2. Enforce a provider-specific timeout, request cap and response schema.
3. Return `priceVerified: true` only when a current numeric quote is received
   from that documented API.
4. Return `not_connected`, `unavailable` or `unknown` on an error — never a
   guessed price or an inferred availability result.
5. Include the source URL and `checkedAt` time in the response.

Some providers require a fixed outbound IP allowlist. Vercel uses dynamic
egress by default, so those adapters need Vercel Static IPs or a separately
managed fixed-egress service before activation.
