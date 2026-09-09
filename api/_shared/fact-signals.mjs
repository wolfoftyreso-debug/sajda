/**
 * Server-only, evidence-first feed for small Sajda market signals.
 *
 * This is deliberately not a scraper. Every network request is to a fixed,
 * reviewed HTTPS endpoint defined in this file. Environment configuration can
 * enable a source ID, but can never supply a URL, host, selector, or request
 * template. That avoids turning a friendly fact feed into an SSRF proxy.
 *
 * The current optional connector only requests NameBio's free, aggregated
 * TLDStats endpoint. It never retrieves NameBio's paid individual-sale data.
 */

const NAMEBIO_TLDSTATS_ENDPOINT = "https://api.namebio.com/tldstats";
const NAMEBIO_DOCUMENTATION_URL = "https://api.namebio.com/docs/";
const NAMEBIO_SOURCE_ID = "namebio-tldstats";
const NAMEBIO_CACHE_TTL_MS = 24 * 60 * 60 * 1_000;
const NAMEBIO_FAILURE_CACHE_TTL_MS = 5 * 60 * 1_000;
const NAMEBIO_MIN_REQUEST_INTERVAL_MS = 15_000; // The free endpoint allows 4 RPM.
const NAMEBIO_TIMEOUT_MS = 5_000;
const NAMEBIO_RESPONSE_MAX_BYTES = 64 * 1_024;
const ALLOWED_TLDS = new Set(["com", "net", "org", "app", "dev", "ai", "xyz", "info", "biz", "se", "nu", "io"]);
const APPROVED_SOURCE_IDS = new Set([NAMEBIO_SOURCE_ID]);

/**
 * These are deliberately few and structured. They use primary public filings
 * or broker press releases, not copied sales lists. They are archival market
 * context, not availability, an appraisal, or a claim that Sajda witnessed a
 * transaction.
 */
const CURATED_DOMAIN_SALES = [
  {
    id: "reported-sale-voice-com-2019",
    type: "reported_domain_sale",
    dataStatus: "curated_primary_source",
    domain: "voice.com",
    amountUsd: 30_000_000,
    saleYear: 2019,
    saleDate: "2019-05-30",
    reportedAt: "2019-06-18",
    verificationLevel: "primary_public_filing",
    assetScope: "domain_only",
    sourceType: "regulatory_filing",
    claim: "Completed cash domain sale",
    source: {
      id: "sec-microstrategy-voice-com-2019",
      label: "U.S. SEC filing — MicroStrategy Voice.com sale",
      name: "U.S. SEC filing — MicroStrategy Voice.com sale",
      url: "https://www.sec.gov/Archives/edgar/data/1050446/000119312519175320/d724928dex991.htm",
      sourceUpdatedAt: "2019-06-18",
      attribution: "Company press release filed with the U.S. SEC; shown as historical market context.",
    },
  },
  {
    id: "reported-sale-sex-com-2010",
    type: "reported_domain_sale",
    dataStatus: "curated_primary_source",
    domain: "sex.com",
    amountUsd: 13_000_000,
    saleYear: 2010,
    reportedAt: "2010-11-18",
    verificationLevel: "broker_press_release",
    assetScope: "reported_domain_transaction",
    sourceType: "broker_press_release",
    claim: "Broker-confirmed domain sale",
    source: {
      id: "sedo-sex-com-2010",
      label: "Sedo press release — Sex.com sale",
      name: "Sedo press release — Sex.com sale",
      url: "https://sedo.com/es/sobre-sedo/sala-de-prensa/sala-de-prensa/sedo-confirms-sale-of-sexcom-for-record-13-million/",
      sourceUpdatedAt: "2010-11-18",
      attribution: "Sedo broker press release; shown as historical market context.",
    },
  },
];

const namebioCache = new Map();
const namebioInFlight = new Map();
let namebioLastRequestAt = 0;

function nowIso(now) {
  return new Date(now).toISOString();
}

function configuredSourceIds(environment) {
  const configured = environment?.SAJDA_FACT_SIGNAL_SOURCES ?? "";
  return new Set(
    configured
      .split(/[\n,]/u)
      .map((sourceId) => sourceId.trim().toLowerCase())
      .filter((sourceId) => APPROVED_SOURCE_IDS.has(sourceId)),
  );
}

function namebioIsEnabled(environment) {
  return configuredSourceIds(environment).has(NAMEBIO_SOURCE_ID);
}

function sourceStatus(id, status, detail) {
  return {
    id,
    status,
    ...(detail ? { detail } : {}),
  };
}

function toFiniteNonNegativeNumber(value) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function validateNamebioPeriod(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const period = value;
  const saleCount = toFiniteNonNegativeNumber(period.sale_count);
  const priceSumUsd = toFiniteNonNegativeNumber(period.price_sum);
  const averagePriceUsd = toFiniteNonNegativeNumber(period.price_avg);
  const highestPriceUsd = toFiniteNonNegativeNumber(period.price_max);
  const priceStddevUsd = toFiniteNonNegativeNumber(period.price_stddev);
  if ([saleCount, priceSumUsd, averagePriceUsd, highestPriceUsd, priceStddevUsd].some((number) => number === null)) return null;

  return {
    saleCount,
    priceSumUsd,
    averagePriceUsd,
    highestPriceUsd,
    priceStddevUsd,
  };
}

function validateNamebioResponse(raw, expectedTld) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const response = raw;
  if (typeof response.extension !== "string" || response.extension.trim().toLowerCase() !== `.${expectedTld}`) return null;
  if (!response.data || typeof response.data !== "object" || Array.isArray(response.data)) return null;

  const oneYear = validateNamebioPeriod(response.data["1y"]);
  if (!oneYear) return null;
  return oneYear;
}

async function parseJsonResponse(response) {
  const contentType = response.headers?.get?.("content-type") ?? "";
  if (!/application\/json(?:\s*;|$)|\+json(?:\s*;|$)/iu.test(contentType)) {
    throw new Error("Approved source returned a non-JSON response.");
  }

  const declaredLength = Number(response.headers?.get?.("content-length") ?? "");
  if (Number.isFinite(declaredLength) && declaredLength > NAMEBIO_RESPONSE_MAX_BYTES) {
    throw new Error("Approved source response exceeded the size limit.");
  }

  const reader = response.body?.getReader?.();
  if (!reader) throw new Error("Approved source response body could not be read.");
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > NAMEBIO_RESPONSE_MAX_BYTES) {
        await reader.cancel("Response exceeded size limit.");
        throw new Error("Approved source response exceeded the size limit.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock?.();
  }

  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(body));
  } catch {
    throw new Error("Approved source returned invalid JSON.");
  }
}

function cacheNamebio(tld, entry) {
  namebioCache.set(tld, entry);
  return entry;
}

async function fetchNamebioTldStats(tld, options) {
  const { now, fetchImpl } = options;
  const cached = namebioCache.get(tld);
  if (cached && cached.expiresAt > now) return { ...cached, cache: "hit" };

  const active = namebioInFlight.get(tld);
  if (active) return active;
  if (now - namebioLastRequestAt < NAMEBIO_MIN_REQUEST_INTERVAL_MS) {
    return {
      state: "throttled",
      expiresAt: now + NAMEBIO_MIN_REQUEST_INTERVAL_MS,
      cache: "miss",
    };
  }

  const operation = (async () => {
    namebioLastRequestAt = now;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), NAMEBIO_TIMEOUT_MS);
      try {
        const response = await fetchImpl(NAMEBIO_TLDSTATS_ENDPOINT, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          },
          body: new URLSearchParams({ extension: `.${tld}` }).toString(),
          redirect: "error",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Approved source request was not successful.");
        const parsed = validateNamebioResponse(await parseJsonResponse(response), tld);
        if (!parsed) throw new Error("Approved source response did not match the expected aggregate schema.");

        return cacheNamebio(tld, {
          state: "ready",
          value: parsed,
          fetchedAt: nowIso(now),
          expiresAt: now + NAMEBIO_CACHE_TTL_MS,
          cache: "miss",
        });
      } finally {
        clearTimeout(timeout);
      }
    } catch {
      return cacheNamebio(tld, {
        state: "unavailable",
        expiresAt: now + NAMEBIO_FAILURE_CACHE_TTL_MS,
        cache: "miss",
      });
    } finally {
      namebioInFlight.delete(tld);
    }
  })();

  namebioInFlight.set(tld, operation);
  return operation;
}

function namebioFact(tld, aggregate) {
  return {
    id: `namebio-tldstats-${tld}-1y`,
    type: "tld_market_aggregate",
    dataStatus: "approved_api_snapshot",
    verificationLevel: "approved_source_snapshot",
    assetScope: "tld_aggregate",
    sourceType: "approved_public_api",
    tld: `.${tld}`,
    period: "1y",
    currency: "USD",
    reportedAt: aggregate.fetchedAt,
    lastCheckedAt: aggregate.fetchedAt,
    metrics: aggregate.value,
    source: {
      id: NAMEBIO_SOURCE_ID,
      label: "NameBio TLDStats",
      name: "NameBio TLDStats",
      url: NAMEBIO_DOCUMENTATION_URL,
      apiUrl: NAMEBIO_TLDSTATS_ENDPOINT,
      retrievedAt: aggregate.fetchedAt,
      attribution: "Aggregate data from NameBio TLDStats. Attribution required by NameBio.",
    },
    caveat: "Aggregate historical sales statistics; not an appraisal, quote, availability result, or individual sale feed.",
  };
}

function staticFacts(limit) {
  return CURATED_DOMAIN_SALES.slice(0, limit).map((fact) => ({
    ...fact,
    // This is the source record's known update date, not a fictional fresh
    // verification performed each time the endpoint is requested.
    lastCheckedAt: fact.source.sourceUpdatedAt,
    caveat: "Historical reported market context only; not an appraisal, current listing, or purchase recommendation.",
  }));
}

/**
 * Gets a bounded, attributable fact feed. `tld` is constrained to the
 * product's known extension set before it reaches the fixed NameBio request.
 */
export async function getFactSignalFeed({
  tld = "com",
  limit = 6,
  environment = {},
  fetchImpl = globalThis.fetch,
  now = Date.now(),
} = {}) {
  const normalizedTld = String(tld).trim().toLowerCase().replace(/^\./u, "");
  if (!ALLOWED_TLDS.has(normalizedTld)) throw new Error("Unsupported TLD.");
  if (!Number.isInteger(limit) || limit < 1 || limit > 10) throw new Error("limit must be an integer from 1 to 10.");

  const facts = [];
  const sources = [
    {
      id: "curated-primary-domain-sales",
      status: "curated",
      mode: "reviewed_primary_records",
      detail: "Primary public filings and broker press releases only.",
    },
  ];

  if (namebioIsEnabled(environment)) {
    if (typeof fetchImpl !== "function") {
      sources.push(sourceStatus(NAMEBIO_SOURCE_ID, "unavailable", "The approved aggregate source is not available in this runtime."));
    } else {
      const aggregate = await fetchNamebioTldStats(normalizedTld, { now, fetchImpl });
      if (aggregate.state === "ready") {
        facts.push(namebioFact(normalizedTld, aggregate));
        sources.push({
          id: NAMEBIO_SOURCE_ID,
          status: "active",
          mode: "fixed_aggregate_api",
          url: NAMEBIO_DOCUMENTATION_URL,
          cache: aggregate.cache,
          fetchedAt: aggregate.fetchedAt,
        });
      } else if (aggregate.state === "throttled") {
        sources.push(sourceStatus(NAMEBIO_SOURCE_ID, "deferred", "The approved source is being rate-limited to its published free-tier policy."));
      } else {
        sources.push(sourceStatus(NAMEBIO_SOURCE_ID, "unavailable", "The approved aggregate source is temporarily unavailable."));
      }
    }
  } else {
    sources.push(sourceStatus(NAMEBIO_SOURCE_ID, "disabled", "Enable only this reviewed source ID server-side when approved."));
  }

  const availableSlots = Math.max(0, limit - facts.length);
  facts.push(...staticFacts(availableSlots));

  return {
    schemaVersion: "2026-08-24",
    generatedAt: nowIso(now),
    requestedTld: `.${normalizedTld}`,
    policy: {
      individualSales: "curated primary-source records only",
      dynamicIndividualSales: "not enabled",
      dynamicAggregate: namebioIsEnabled(environment) ? "fixed approved API only" : "disabled",
      purpose: "Historical market context and inspiration only; never an appraisal, quote, availability result, or purchase recommendation.",
    },
    sources,
    facts,
  };
}

export const factSignalSourcePolicy = {
  approvedSourceIds: [...APPROVED_SOURCE_IDS],
  namebio: {
    id: NAMEBIO_SOURCE_ID,
    mode: "fixed_aggregate_api_only",
    endpoint: NAMEBIO_TLDSTATS_ENDPOINT,
    documentationUrl: NAMEBIO_DOCUMENTATION_URL,
    cacheTtlMs: NAMEBIO_CACHE_TTL_MS,
    minimumRequestIntervalMs: NAMEBIO_MIN_REQUEST_INTERVAL_MS,
  },
};
