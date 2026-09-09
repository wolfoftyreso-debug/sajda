import { useEffect, useState } from "react";
import { normalizeDomainMarketFactFeed, type DomainMarketFactFeed } from "@/lib/domainSaleFacts";

const FACT_SIGNAL_ENDPOINT = "/api/fact-signals";

/**
 * Optionally supplements the static, attributed archive with records supplied
 * by Sajda's own server. A missing endpoint, a non-OK response, or an invalid
 * payload is intentionally silent: the curated archive remains the fallback
 * and the client never asks an external sales site for data directly.
 */
export function useDomainSaleFactFeed(enabled = true): DomainMarketFactFeed | undefined {
  const [feed, setFeed] = useState<DomainMarketFactFeed | undefined>(undefined);

  useEffect(() => {
    if (!enabled) {
      setFeed(undefined);
      return undefined;
    }

    const controller = new AbortController();

    void fetch(FACT_SIGNAL_ENDPOINT, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return undefined;
        const payload: unknown = await response.json();
        const normalized = normalizeDomainMarketFactFeed(payload);
        return normalized.sales.length > 0 || normalized.aggregates.length > 0 ? normalized : undefined;
      })
      .then((normalized) => {
        if (normalized) setFeed(normalized);
      })
      .catch((error: unknown) => {
        // An abort is expected during navigation. Any other fetch failure also
        // leaves the offline curated archive in place without advertising a
        // non-existent live sales feed.
        if (error instanceof DOMException && error.name === "AbortError") return;
      });

    return () => controller.abort();
  }, [enabled]);

  return feed;
}
