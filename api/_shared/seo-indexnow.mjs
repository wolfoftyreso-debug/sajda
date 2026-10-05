import { SEO_PAGES, canonicalUrl } from "../../scripts/seo-routes.mjs";
import { indexNowSubmission, resolveSeoOrigin } from "../../scripts/seo-policy.mjs";

const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

export function indexNowPayload(origin, key, host) {
  return {
    host,
    key,
    keyLocation: `${origin}/${key}.txt`,
    urlList: SEO_PAGES.map((page) => canonicalUrl(page.path, origin)),
  };
}

/** Submit approved public URLs only. Never ping while noindex. */
export async function submitIndexNow(environment = process.env, fetchImpl = fetch) {
  const decision = indexNowSubmission(environment);
  if (!decision.submit) return { submitted: false, reason: decision.reason };
  const origin = resolveSeoOrigin(environment.SAJDA_CANONICAL_ORIGIN);
  const host = new URL(origin).hostname;
  const payload = indexNowPayload(origin, decision.key, host);
  const response = await fetchImpl(INDEXNOW_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) return { submitted: false, reason: "upstream_rejected" };
  return { submitted: true, reason: "index", count: payload.urlList.length };
}
