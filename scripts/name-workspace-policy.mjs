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

/** Test proof, not a provider adapter: require the exact two requested names.
 * Cached observation dates remain unchanged; a request is not proof of a new
 * provider call. Unknown rows remain unknown and never count as fresh evidence. */
export function workspaceRegistryEvidence(payload, label, now = Date.now()) {
  if (!/^sajdaqa[a-f0-9]{12}$/u.test(label) || !Number.isFinite(now)
    || !Array.isArray(payload?.results) || payload.results.length !== 2) return null;
  const sources = { com: "verisign-rdap", ai: "identity-digital-rdap" }, seen = new Set(), evidence = [];
  for (const row of payload.results) {
    if (!row || !Object.hasOwn(sources, row.tld) || row.domain !== `${label}.${row.tld}` || seen.has(row.tld)
      || !["available", "taken", "unknown"].includes(row.status) || typeof row.authoritative !== "boolean") return null;
    seen.add(row.tld);
    const time = typeof row.checkedAt === "string" ? Date.parse(row.checkedAt) : NaN;
    const observedAtPresent = Number.isFinite(time) && new Date(time).toISOString() === row.checkedAt;
    const freshAuthoritative = row.authoritative && row.status !== "unknown" && row.checkMethod === "rdap"
      && row.source === sources[row.tld] && observedAtPresent && time <= now && now - time <= 300_000;
    if (row.authoritative && !freshAuthoritative || !row.authoritative && row.status !== "unknown") return null;
    evidence.push({ tld: row.tld, status: row.status, authoritative: row.authoritative, checkMethod: row.checkMethod,
      observedAtPresent, freshAuthoritative });
  }
  return evidence.some(row => row.freshAuthoritative) ? evidence : null;
}
