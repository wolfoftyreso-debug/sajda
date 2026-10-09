/** Pure spend fence for the opt-in real Preview workspace browser probe. */
export function workspaceSearchAllowed(body, label, priorSearches) {
  if (!body || typeof body !== "object" || Array.isArray(body) || !/^sajdaqa[a-f0-9]{12}$/u.test(label)
    || !Number.isInteger(priorSearches) || priorSearches < 0 || priorSearches >= 2) return false;
  const keys = ["tlds", "count", "theme", "locale", "advanced", "domains", "swipe", "creativeMode"];
  return Object.keys(body).every(key => keys.includes(key)) && body.count === 2 && body.theme === label
    && body.locale === "en" && body.advanced === false && body.swipe === false
    && ["light", "medium", "heavy", "deep"].includes(body.creativeMode)
    && Array.isArray(body.tlds) && body.tlds.length === 2 && new Set(body.tlds).size === 2
    && body.tlds.every(tld => ["com", "ai"].includes(tld))
    && Array.isArray(body.domains) && body.domains.length === 2 && new Set(body.domains).size === 2
    && body.domains.every(domain => [`${label}.com`, `${label}.ai`].includes(domain));
}
