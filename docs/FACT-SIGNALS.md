# Sajda fact signals

`GET /api/fact-signals` is a read-only feed for short, attributable bits of
domain-market context. It is designed for Sajda's small inspiration messages,
not for an appraisal, live listing, sales database, or availability check.

```text
GET /api/fact-signals?tld=com&limit=6
```

No API key is needed. The endpoint accepts only `tld` from Sajda's supported
extension set and `limit` from 1 to 10. It has no URL, host, feed, selector, or
callback parameter.

## What the feed may say

Every individual-sale item must contain the stable UI fields:

```json
{
  "id": "reported-sale-voice-com-2019",
  "domain": "voice.com",
  "amountUsd": 30000000,
  "saleDate": "2019-05-30",
  "reportedAt": "2019-06-18",
  "source": {
    "label": "U.S. SEC filing — MicroStrategy Voice.com sale",
    "url": "https://www.sec.gov/Archives/edgar/data/1050446/000119312519175320/d724928dex991.htm"
  },
  "verificationLevel": "primary_public_filing",
  "assetScope": "domain_only",
  "sourceType": "regulatory_filing",
  "lastCheckedAt": "2019-06-18"
}
```

Additional fields state whether the item is a curated historical record or an
approved aggregate snapshot. `lastCheckedAt` is a source update date for a
curated historical record and a retrieval timestamp for an aggregate snapshot;
it must not be presented as a newly verified sale. The client must present the
source link next to the claim and keep the caveat visible: historical sales are
context, **not** a valuation, current price, available listing, or
recommendation to buy.

The initial curated records are intentionally modest:

- `voice.com`, $30 million: a MicroStrategy press release filed with the U.S.
  SEC records a completed cash sale on 30 May 2019.
- `sex.com`, $13 million: Sedo's 18 November 2010 broker press release
  confirmed the sale.

Do not add a sale merely because it is frequently repeated online. For example,
there is deliberately no `george.com` record until an approved primary source
or licensed data provider can substantiate the exact transaction and scope.

## Dynamic source policy

The only dynamic source currently implemented is the fixed
`https://api.namebio.com/tldstats` endpoint. It is **aggregate TLD data only**:
the feed can report a one-year count, volume, average, maximum and standard
deviation for a chosen TLD. It never retrieves, stores, or displays NameBio
individual-sale records.

Enable that source only through a server environment variable:

```text
SAJDA_FACT_SIGNAL_SOURCES=namebio-tldstats
```

This value selects an ID from a hard-coded allowlist. It cannot specify a URL,
domain, path, request method, or authentication value. The connector:

- sends one fixed HTTPS `POST` request with a validated TLD;
- enforces JSON content type, a 64 KiB streamed response cap and a 5-second
  timeout;
- caches success for 24 hours and failure for 5 minutes;
- serializes first requests to at most four per minute per runtime process;
- preserves NameBio attribution, API documentation URL and fetch time in the
  returned fact.

NameBio's documentation requires attribution for its free aggregate endpoints.
Its Comps, CheckDomain, DailySales and TopSales endpoints are paid; it also
requires written permission before its paid API data is used in a product or
service. Those endpoints are intentionally **not implemented** here.

### Production rollout of dynamic sources

An in-memory cache is suitable for local development and a single runtime, but
not a guarantee across horizontally scaled serverless instances. Before turning
on any dynamic source in a production Vercel deployment, add a reviewed shared
cache plus a scheduled ingest job, retain source snapshots and errors, and keep
the source's published rate limit globally enforced. Do not solve this by
accepting a customer-provided feed URL.

For a future licensed individual-sale source (for example DN.Report or an
approved NameBio agreement), build a distinct fixed-domain adapter with:

1. a written licence and permitted product use;
2. server-only credentials stored in encrypted Vercel environment variables;
3. a static source ID and fixed endpoint, never an arbitrary URL;
4. documented response schema validation, size/time bounds, deduplication,
   retention, source URLs and source/report times; and
5. a human review queue before a sale is published as a Sajda fact.

## Non-negotiable boundaries

- No HTML scraping, browser automation or generic RSS/JSON fetcher.
- No credential, licence key or source URL reaches browser code.
- No assertion that a source record is a current price, an appraisal or a
  purchasable offer.
- No undisclosed asset scope: use `assetScope` when a deal may have included
  more than a domain.
- A source outage returns an attributable source status, not invented fallback
  facts.
