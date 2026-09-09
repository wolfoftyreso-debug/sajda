import { lookup, Resolver } from "node:dns/promises";
import { createHash } from "node:crypto";
import { load } from "cheerio";
import { parse as parseDomain } from "tldts";
import robotsParserImport from "robots-parser";
import { type LostDomainOpportunity, type LostOpportunityCheck } from "../../shared/lost-domain-opportunity.js";
import { analyzeTradingMarketFit, type TradingMarketFit } from "../../shared/trading-market-fit.js";
import type { TradingDossier } from "../../shared/trading-dossier.js";
import type { TradingAcquisition } from "../../shared/trading-acquisition.js";
import type { TradingRegistrarEvidence } from "../../shared/trading-registrar.js";
import type { TradingArchiveEvidence } from "../../shared/trading-archive.js";
import { nameQualitySignals, interpretRdapResponse, registryRetryAt } from "./search-quality.mjs";
import { safeHttpsFetch, safeHttpsUrl, isPublicAddress, withAbort, LOST_DOMAINS_USER_AGENT,
  type SafeFetchOptions, type SafeFetchResponse, type PublicAddress } from "./lost-domains-fetch.js";

export interface LostDomainCandidate {
  domain: string; sourceUrl: string; targetUrl: string; anchor: string; sensitive: boolean;
}
export interface LostDomainEvidence {
  kind: "target_http" | "dns" | "mail" | "registry";
  source: string; method: string; observedAt: string; expiresAt: string; outcome: string;
  details?: Record<string, string | number | boolean | string[]>;
}
export interface Assessment extends LostDomainCandidate {
  dossier?: TradingDossier;
  acquisition?: TradingAcquisition;
  registrar?: TradingRegistrarEvidence;
  marketFit?: TradingMarketFit;
  archive?: TradingArchiveEvidence;
  registryStatus: "registered" | "registry_not_found" | "unknown";
  registrability: "unverified";
  confirmedRegistrable: false;
  reviewStatus: "review_candidate" | "registered" | "inconclusive" | "excluded";
  evidence: LostDomainEvidence[];
  risk: { level: "review" | "excluded"; reasons: string[] };
  /** Uncalibrated naming potential, not market value or expected SEO return. */
  potentialScore: number;
  /** Evidence coverage only, not probability of registration or investment success. */
  confidenceScore: number;
  /** Explainable review priority; not a price, return forecast or availability claim. */
  opportunityScore?: number;
  opportunity?: LostDomainOpportunity;
}
export class LostDomainsEngineError extends Error {
  constructor(readonly code: string) { super(code); this.name = "LostDomainsEngineError"; }
}
const REGISTRIES: Readonly<Record<string, string>> = {
  com: "https://rdap.verisign.com/com/v1/", net: "https://rdap.verisign.com/net/v1/",
  org: "https://rdap.publicinterestregistry.org/rdap/", app: "https://pubapi.registry.google/rdap/",
  dev: "https://pubapi.registry.google/rdap/", ai: "https://rdap.identitydigital.services/rdap/",
  xyz: "https://rdap.centralnic.com/xyz/", info: "https://rdap.identitydigital.services/rdap/",
  biz: "https://rdap.nic.biz/",
};
const MAX_OPERATION_MS = 10_000;
const EVIDENCE_AGE_MS = 15 * 60_000;
interface RobotsPolicy { isAllowed(url: string, userAgent: string): boolean | undefined; getCrawlDelay(userAgent: string): number | undefined }
// robots-parser ships a legacy ambient declaration; runtime is a CJS function.
const robotsParser = robotsParserImport as unknown as (url: string, body: string) => RobotsPolicy;
const text = (value: string, max = 160) => Array.from(value, character =>
  character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127 ? " " : character).join("").replace(/\s+/gu, " ").trim().slice(0, max);
const sensitivePattern = /(?:^|[\s./_?&=-])(?:login|signin|sign-in|sso|oauth|auth|password|reset|verify|verification|mail|email|smtp|imap|webmail|cdn|sdk|api|webhook|script|checkout|payment|bankid)(?:$|[\s./_?&=-])/iu;
const sensitiveAnchor = /log\s*in|sign\s*in|password|webmail|e-?mail|logga\s*in|lösenord|bankid|authentication/iu;
function sensitiveLink(url: URL, anchor: string): boolean {
  let decodedPath: string;
  try { decodedPath = decodeURIComponent(url.pathname); } catch { return true; }
  // Never fetch a query-bearing link after redacting it: that would test a
  // different resource and could manufacture a false dead-link observation.
  return Boolean(url.search) || sensitivePattern.test(`${url.hostname}${decodedPath}`) || sensitiveAnchor.test(anchor)
    || /\.(?:js|mjs|wasm|exe|dmg|zip|msi|apk)(?:$|[?#])/iu.test(decodedPath)
    || [...url.searchParams.keys()].some(key => /token|secret|signature|credential|session|code|key/iu.test(key));
}
function domainFromHost(host: string): string | undefined {
  const parsed = parseDomain(host, { allowPrivateDomains: true });
  // Hosted subdomains (github.io etc.) are not registrable dropped domains.
  return parsed.isIcann && !parsed.isPrivate && parsed.domain ? parsed.domain : undefined;
}
function validCandidate(candidate: LostDomainCandidate): LostDomainCandidate {
  const source = safeHttpsUrl(candidate.sourceUrl), target = safeHttpsUrl(candidate.targetUrl);
  const domain = domainFromHost(target.hostname);
  if (!domain || domain !== candidate.domain || domain === domainFromHost(source.hostname)
    || typeof candidate.anchor !== "string" || typeof candidate.sensitive !== "boolean") throw new LostDomainsEngineError("invalid_candidate");
  return { domain, sourceUrl: source.href, targetUrl: target.href, anchor: text(candidate.anchor),
    sensitive: candidate.sensitive || sensitiveLink(target, candidate.anchor) };
}
function errorCode(error: unknown): string {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "unavailable";
  return /^(?:ENOTFOUND|ENODATA|ETIMEOUT|ESERVFAIL|EAI_AGAIN|ECANCELLED|blocked_address|dns_unavailable|timeout|aborted|robots_disallowed|robots_unavailable|robots_delay|network_unavailable|invalid_response|invalid_url|redirect_limit|response_too_large|unsupported_encoding)$/u.test(code) ? code : "unavailable";
}

function freshEvidence(item: LostDomainEvidence, now: number): boolean {
  const observed = Date.parse(item.observedAt), expires = Date.parse(item.expiresAt);
  return Number.isFinite(observed) && Number.isFinite(expires) && observed <= now && observed >= now - EVIDENCE_AGE_MS
    && expires > now && expires <= observed + EVIDENCE_AGE_MS;
}

/** Recompute from observations; never trust a stored or caller-supplied score. */
export function scoreLostDomainOpportunity(item: Assessment, now = Date.now()): LostDomainOpportunity {
  const current = item.evidence.filter(evidence => freshEvidence(evidence, now));
  const endpoint = REGISTRIES[parseDomain(item.domain).publicSuffix ?? ""];
  const registry = current.filter(evidence => endpoint && evidence.kind === "registry" && evidence.method === "rdap"
    && evidence.source === `${endpoint}domain/${encodeURIComponent(item.domain)}`);
  const registered = item.registryStatus === "registered" || registry.some(evidence => evidence.outcome === "registered");
  const absent = item.registryStatus === "registry_not_found" && registry.some(evidence => evidence.outcome === "registry_not_found" && evidence.details?.httpStatus === 404);
  const dns = current.filter(evidence => evidence.kind === "dns" && evidence.source === "system-dns-resolver" && evidence.method === "address_lookup");
  const mail = current.filter(evidence => evidence.kind === "mail" && evidence.source === "system-dns-resolver" && evidence.method === "mx_lookup");
  const dnsAbsent = dns.some(evidence => ["nxdomain", "no_address"].includes(evidence.outcome));
  const noMail = mail.some(evidence => evidence.outcome === "no_explicit_mx");
  const http = current.filter(evidence => evidence.kind === "target_http" && evidence.method === "https_get"
    && (evidence.source === item.targetUrl || evidence.source === `https://${item.domain}/`));
  // Even an HTTP 404/410 proves a server responded. It cannot establish a
  // dropped domain; a path can disappear while its domain remains in use.
  const httpResponds = http.some(evidence => ["responding", "dead_url", "redirected", "http_error"].includes(evidence.outcome)
    || typeof evidence.details?.httpStatus === "number" && evidence.details.httpStatus >= 100);
  const dnsResolves = dns.some(evidence => evidence.outcome === "resolves");
  const activeMail = mail.some(evidence => evidence.outcome === "mx_present");
  const excluded = item.sensitive || item.risk.level === "excluded" || item.reviewStatus === "excluded" || activeMail
    || current.some(evidence => evidence.outcome === "non_public_address" || evidence.details?.error === "blocked_address");
  const conflict = absent && (registered || dnsResolves || httpResponds || activeMail);
  // A DNS failure in the independently attempted HTTPS request is retained as
  // an unreachable website observation, not proof that the name can be bought.
  const websiteUnreachable = http.some(evidence => evidence.source === `https://${item.domain}/`
    && evidence.outcome === "unreachable" && evidence.details?.error === "dns_unavailable");
  const label = parseDomain(item.domain).domainWithoutSuffix ?? "";
  const naming = /^[a-z]{3,63}$/u.test(label) ? nameQualitySignals(label).score : 0;
  let provenance = false;
  try {
    const source = safeHttpsUrl(item.sourceUrl), target = safeHttpsUrl(item.targetUrl);
    provenance = !source.search && !target.search && Boolean(domainFromHost(source.hostname)) && domainFromHost(target.hostname) === item.domain
      && domainFromHost(source.hostname) !== item.domain;
  } catch { /* Invalid provenance never earns discovery points. */ }
  const eligible = !excluded && !registered && !conflict && absent && dnsAbsent && noMail && provenance;
  const tier: LostDomainOpportunity["tier"] = excluded ? "excluded" : eligible ? websiteUnreachable ? "priority_review" : "review" : "watch";
  const meaningfulAnchor = item.anchor.trim().length >= 4 && !/^(?:website|homepage|here|link|click here|source code|demo|download)$/iu.test(item.anchor.trim());
  const breakdown: LostDomainOpportunity["breakdown"] = { registry: absent && !registered ? 40 : 0,
    dns: dnsAbsent && !dnsResolves ? 15 : 0, mail: noMail && !activeMail ? 10 : 0,
    website: websiteUnreachable && !httpResponds ? 5 : 0, name: Math.round(naming * 0.2),
    source: provenance ? meaningfulAnchor ? 10 : 5 : 0, penalties: 0 };
  const total = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
  const cap = excluded ? 0 : registered ? 19 : tier === "watch" ? 29 : tier === "review" ? 69 : 100;
  breakdown.penalties = Math.max(0, total - cap);
  const reasons: string[] = [];
  if (absent) reasons.push("registry_record_absent");
  if (registered) reasons.push("domain_still_registered");
  if (dnsAbsent) reasons.push("dns_address_absent");
  if (noMail) reasons.push("no_explicit_mail_records");
  if (websiteUnreachable) reasons.push("apex_http_dns_unavailable");
  if (http.some(evidence => evidence.outcome === "dead_url")) reasons.push("broken_url_not_domain_expiry");
  if (httpResponds) reasons.push("website_responds");
  if (dnsResolves) reasons.push("dns_still_resolves");
  if (activeMail) reasons.push("active_mail_dependency");
  if (conflict) reasons.push("conflicting_observations");
  if (excluded) reasons.push("excluded_dependency_or_safety_risk");
  if (provenance) reasons.push("observed_source_link");
  if (naming) reasons.push("name_spelling_heuristic");
  else reasons.push("naming_model_not_applicable");
  if (item.evidence.some(evidence => !freshEvidence(evidence, now))) reasons.push("evidence_needs_refresh");
  const missingChecks: LostOpportunityCheck[] = [];
  if (!absent && !registered) missingChecks.push("registry");
  if (!dnsAbsent && !dnsResolves) missingChecks.push("dns");
  if (!noMail && !activeMail) missingChecks.push("mail");
  if (!websiteUnreachable && !httpResponds) missingChecks.push("website");
  missingChecks.push("registrar", "history", "trademark", "market_comparables");
  return { version: 1, tier, score: total - breakdown.penalties, breakdown, reasons, missingChecks };
}

/** Pure discovery never executes JS, loads frames/assets or follows forms. */
export function extractSourceCandidates(html: string, sourceUrl: string, maxLinks = 60, rotationKey?: string): LostDomainCandidate[] {
  const source = safeHttpsUrl(sourceUrl), sourceDomain = domainFromHost(source.hostname);
  if (!sourceDomain) throw new LostDomainsEngineError("invalid_source");
  const maximum = Number.isFinite(maxLinks) ? Math.max(1, Math.min(60, Math.trunc(maxLinks))) : 60;
  const $ = load(html); const candidates = new Map<string, LostDomainCandidate>();
  // These two approved Sphinx category pages have an observed, explicit
  // project contract: section > h3 and a primary link labelled "Website".
  // Do not guess this structure for any other publisher or category.
  const projectCategory = source.hostname === "awesome-selfhosted.net" && [
    "/tags/bookmarks-and-link-sharing.html", "/tags/wikis.html",
  ].includes(source.pathname);
  // Ignore <base>: an arbitrary document must not redirect our trust boundary.
  $("a[href]").slice(0, 1_000).each((_index, element) => {
    const link = $(element);
    // Navigation, site credits and account chrome are not resource listings.
    if (link.closest("nav,header,footer,aside,[role=navigation]").length) return;
    let target: URL;
    try { target = safeHttpsUrl(new URL($(element).attr("href") ?? "", source).href); } catch { return; }
    const domain = domainFromHost(target.hostname);
    if (!domain || domain === sourceDomain) return;
    const originalAnchor = text(link.text());
    // Curated lists often label every project URL "Website". Keep only the
    // local section's short title, never its description or whole page text.
    const section = projectCategory ? link.closest("section") : link.closest("section,article,li");
    const heading = section.children("h1,h2,h3,h4,h5,h6").first().clone();
    heading.find(".headerlink,[aria-hidden=true]").remove();
    const title = text(heading.text(), 120);
    if (projectCategory) {
      if (!section.children("h3").length || !title || originalAnchor !== "Website") return;
      const primary = section.find("a[href]").filter((_unused, entry) =>
        $(entry).closest("section")[0] === section[0] && text($(entry).text()) === "Website").first();
      if (primary[0] !== element) return;
      // A repository URL sometimes doubles as "Website". Its shared hosting
      // domain is not the project's own domain and must not consume a check.
      const forge = ["github.com", "codeberg.org", "gitlab.com", "sourceforge.net", "sr.ht"].includes(domain);
      const ownForgeHomepage = target.pathname === "/" && !target.search
        && title.toLowerCase().replace(/[^a-z0-9]/gu, "") === domain.split(".")[0];
      if (forge && !ownForgeHomepage) return;
    }
    const generic = /^(?:website|homepage|source code|demo|clients|download)$/iu.test(originalAnchor);
    const anchor = generic && title ? text(`${title} · ${originalAnchor}`) : originalAnchor;
    const sensitive = sensitiveLink(target, originalAnchor) || sensitiveLink(target, anchor)
      || /\b(?:account server|identity management|federated identity)\b/iu.test(title);
    // URL query strings can contain private tokens. Retain only the public
    // path as evidence; all query-bearing links are excluded before stripping
    // so the modified resource is never inspected as the original link.
    target.search = "";
    const existing = candidates.get(domain);
    if (existing) {
      if (sensitive) existing.sensitive = true;
      return;
    }
    // Inspect the complete bounded anchor window before selection, so a late
    // sensitive duplicate can never be hidden by an early quota cutoff.
    candidates.set(domain, { domain, sourceUrl: source.href, targetUrl: target.href, anchor, sensitive });
  });
  const all=[...candidates.values()];
  if(!rotationKey) return all.slice(0,maximum);
  // Two thirds meaning-led, one third deterministic exploration. A fresh
  // server-run ID opens a different window instead of forever scanning HTML #1–60.
  const strong=all.map(candidate=>({candidate,fit:analyzeTradingMarketFit(candidate.domain).score}))
    .sort((a,b)=>Number(a.candidate.sensitive)-Number(b.candidate.sensitive)||b.fit-a.fit||a.candidate.domain.localeCompare(b.candidate.domain))
    .slice(0,Math.ceil(maximum*2/3)).map(row=>row.candidate);
  const selected=new Set(strong.map(row=>row.domain));
  const exploratory=all.filter(row=>!selected.has(row.domain)).map(candidate=>({candidate,
    key:createHash("sha256").update(rotationKey.slice(0,100)).update(candidate.domain).digest("hex")}))
    .sort((a,b)=>a.key.localeCompare(b.key)).slice(0,maximum-strong.length).map(row=>row.candidate);
  return [...strong,...exploratory];
}

export interface EngineDependencies {
  fetch?: (url: string, options?: SafeFetchOptions) => Promise<SafeFetchResponse>;
  dns?: (domain: string, kind: "addresses" | "mx", signal: AbortSignal) => Promise<PublicAddress[] | { exchange: string; priority: number }[]>;
  now?: () => number;
  /** Production supplies durable provider backoff; process cache is only a fallback. */
  registryGate?: (endpoint: string) => Promise<boolean>;
  registryBackoff?: (endpoint: string, retryAtMs: number) => Promise<void>;
}
async function queryDns(domain: string, kind: "addresses" | "mx", signal: AbortSignal) {
  if (kind === "addresses") return withAbort(lookup(domain, { all: true, verbatim: true }) as Promise<PublicAddress[]>, signal);
  const resolver = new Resolver({ timeout: 1_500, tries: 1 });
  const cancel = () => resolver.cancel();
  signal.addEventListener("abort", cancel, { once: true });
  try { return await withAbort(resolver.resolveMx(domain), signal); }
  finally { signal.removeEventListener("abort", cancel); }
}

/** Injectable dependencies are test-only; callers cannot supply URLs/providers. */
export function createLostDomainsEngine(deps: EngineDependencies = {}) {
  const fetch = deps.fetch ?? safeHttpsFetch, dns = deps.dns ?? queryDns, now = deps.now ?? Date.now;
  const registryCooldown = new Map<string, number>();

  function operation(parent?: AbortSignal) {
    const deadline = now() + MAX_OPERATION_MS;
    const timeout = AbortSignal.timeout(MAX_OPERATION_MS);
    return { deadline, signal: parent ? AbortSignal.any([parent, timeout]) : timeout };
  }

  async function crawlerFetch(url: string, context: ReturnType<typeof operation>, allowedHosts?: readonly string[]) {
    const policies = new Map<string, ReturnType<typeof robotsParser> | null>();
    let requests = 0;
    const guard = async (target: URL, signal: AbortSignal) => {
      if (++requests > 4) throw new LostDomainsEngineError("redirect_limit");
      if (!policies.has(target.origin)) {
        const robotsUrl = new URL("/robots.txt", target).href;
        let response: SafeFetchResponse;
        try { response = await fetch(robotsUrl, { ...context, signal, maxBytes: 128_000, maxRedirects: 0,
          allowedHosts: [target.hostname], accept: "text/plain" }); }
        catch (error) {
          // Preserve a failed DNS/address check without pretending robots was
          // fetched or permission granted. No page request follows this error.
          const code = errorCode(error);
          if (["dns_unavailable", "blocked_address", "timeout", "aborted"].includes(code)) throw new LostDomainsEngineError(code);
          throw new LostDomainsEngineError("robots_unavailable");
        }
        if (response.status === 404) policies.set(target.origin, null);
        else if (response.status === 200 && /^text\/plain(?:;|$)/iu.test(response.headers["content-type"] ?? "")
          && !/<(?:!doctype|html|script)/iu.test(response.body) && !Array.from(response.body).some(character =>
            character.charCodeAt(0) < 32 && ![9, 10, 13].includes(character.charCodeAt(0)))) {
          policies.set(target.origin, robotsParser(robotsUrl, response.body));
        } else throw new LostDomainsEngineError("robots_unavailable");
      }
      const policy = policies.get(target.origin);
      if (policy && policy.isAllowed(target.href, LOST_DOMAINS_USER_AGENT) !== true) throw new LostDomainsEngineError("robots_disallowed");
      // A stated delay requires cross-worker scheduling. Until that exists,
      // decline this host rather than ignoring the publisher's constraint.
      if (policy && (policy.getCrawlDelay(LOST_DOMAINS_USER_AGENT) ?? 0) > 0) throw new LostDomainsEngineError("robots_delay");
    };
    return fetch(url, { ...context, maxBytes: 262_144, maxRedirects: 2, allowedHosts, beforeRequest: guard });
  }

  async function discoverSource(source: { url: string; allowedHost: string; maxLinks?: number; rotationKey?: string }, options: { signal?: AbortSignal } = {}) {
    const url = safeHttpsUrl(source.url);
    if (url.hostname !== source.allowedHost || !domainFromHost(url.hostname) || url.search) throw new LostDomainsEngineError("invalid_source");
    const context = operation(options.signal);
    const response = await withAbort(crawlerFetch(url.href, context, [source.allowedHost]), context.signal);
    if (response.status !== 200 || !/^text\/(?:html)(?:;|$)|^application\/xhtml\+xml(?:;|$)/iu.test(response.headers["content-type"] ?? "")) {
      throw new LostDomainsEngineError("source_unavailable");
    }
    return { candidates: extractSourceCandidates(response.body, response.url, source.maxLinks,source.rotationKey), observedAt: response.observedAt };
  }

  async function inspectCandidate(input: LostDomainCandidate, options: { signal?: AbortSignal } = {}): Promise<Assessment> {
    const candidate = validCandidate(input), context = operation(options.signal);
    const evidence: LostDomainEvidence[] = [];
    const reasons = new Set<string>(["registrar_not_checked", "history_not_checked", "trademark_not_checked"]);
    const add = (kind: LostDomainEvidence["kind"], source: string, method: string, outcome: string,
      details?: LostDomainEvidence["details"], observed = now()) => evidence.push({ kind, source, method, outcome,
        observedAt: new Date(observed).toISOString(), expiresAt: new Date(observed + EVIDENCE_AGE_MS).toISOString(), ...(details ? { details } : {}) });
    let excluded = candidate.sensitive;
    if (candidate.sensitive) reasons.add("sensitive_dependency_or_identity_link");
    // A sensitive dependency is not an acquisition target. Do not investigate
    // how to take over an auth/CDN/mail endpoint after flagging it.
    if (!excluded) await Promise.all([
      (async () => {
        const tld = parseDomain(candidate.domain).publicSuffix ?? "";
        const endpoint = REGISTRIES[tld];
        if (!endpoint) { add("registry", "unsupported-registry", "none", "unknown"); reasons.add("unsupported_registry"); return; }
        if ((registryCooldown.get(endpoint) ?? 0) > now()) { add("registry", endpoint, "rdap", "rate_limited"); return; }
        const url = `${endpoint}domain/${encodeURIComponent(candidate.domain)}`;
        try {
          if (deps.registryGate && !await withAbort(deps.registryGate(endpoint), context.signal)) {
            add("registry", endpoint, "rdap", "rate_limited"); return;
          }
          const response = await withAbort(fetch(url, { ...context, maxBytes: 262_144, maxRedirects: 0,
            allowedHosts: [new URL(endpoint).hostname], accept: "application/rdap+json,application/json" }), context.signal);
          if (response.status === 429) {
            const retryAt = registryRetryAt(response.headers["retry-after"] ?? null, now());
            registryCooldown.set(endpoint, retryAt);
            let backoffPersisted = false;
            if (deps.registryBackoff) {
              try { await withAbort(deps.registryBackoff(endpoint, retryAt), context.signal); backoffPersisted = true; }
              catch { /* Preserve the real 429 observation even if durable storage fails. */ }
            }
            add("registry", url, "rdap", "rate_limited", { httpStatus: 429, retryAt: new Date(retryAt).toISOString(), backoffPersisted }); return;
          }
          const state = interpretRdapResponse(response.status, response.headers["content-type"] ?? null, response.body, candidate.domain);
          const registryStatus = state === "taken" ? "registered" : state === "available" ? "registry_not_found" : "unknown";
          const details: NonNullable<LostDomainEvidence["details"]> = { httpStatus: response.status };
          if (state === "taken") {
            const body = JSON.parse(response.body);
            if (Array.isArray(body.status)) details.statuses = body.status.filter((v: unknown): v is string => typeof v === "string").slice(0, 12).map((v: string) => text(v, 50));
            // Public lifecycle data only. No registrant contact/PII is retained.
            if (Array.isArray(body.events)) details.events = body.events.slice(0, 12).flatMap((event: { eventAction?: unknown; eventDate?: unknown }) =>
              typeof event?.eventAction === "string" && typeof event.eventDate === "string" && Number.isFinite(Date.parse(event.eventDate))
                ? [`${text(event.eventAction, 40)}: ${new Date(event.eventDate).toISOString()}`] : []);
          }
          add("registry", url, "rdap", registryStatus, details, Date.parse(response.observedAt));
        } catch (error) { add("registry", url, "rdap", "unknown", { error: errorCode(error) }); }
      })(),
      (async () => {
        try {
          const records = await withAbort(dns(candidate.domain, "addresses", context.signal), context.signal) as PublicAddress[];
          if (!records.length) add("dns", "system-dns-resolver", "address_lookup", "no_address");
          else if (records.some(record => !isPublicAddress(record.address))) {
            excluded = true; reasons.add("non_public_dns"); add("dns", "system-dns-resolver", "address_lookup", "non_public_address");
          } else add("dns", "system-dns-resolver", "address_lookup", "resolves", { count: Math.min(records.length, 16) });
        } catch (error) {
          const code = errorCode(error);
          // getaddrinfo ENOTFOUND means no address, not an authoritative
          // NXDOMAIN response; it must not be presented as registry absence.
          add("dns", "system-dns-resolver", "address_lookup", ["ENOTFOUND", "ENODATA"].includes(code) ? "no_address" : "unknown", { error: code });
        }
      })(),
      (async () => {
        try {
          const records = await withAbort(dns(candidate.domain, "mx", context.signal), context.signal) as { exchange: string; priority: number }[];
          const active = records.some(record => typeof record.exchange === "string" && record.exchange !== "" && record.exchange !== ".");
          if (active) { excluded = true; reasons.add("active_mail_dependency"); }
          add("mail", "system-dns-resolver", "mx_lookup", active ? "mx_present" : "no_explicit_mx", { count: Math.min(records.length, 16) });
        } catch (error) { add("mail", "system-dns-resolver", "mx_lookup", ["ENODATA", "ENOTFOUND"].includes(errorCode(error)) ? "no_explicit_mx" : "unknown", { error: errorCode(error) }); }
      })(),
      (async () => {
        const apexUrl = `https://${candidate.domain}/`;
        // One bounded apex check distinguishes a broken resource path from a
        // website. The original URL retains its own independent provenance.
        const urls = [...new Set([candidate.targetUrl, apexUrl])];
        await Promise.all(urls.map(async url => {
          const scope = url === apexUrl ? "apex" : "linked_url";
          try {
            const response = await withAbort(crawlerFetch(url, context), context.signal);
            const differentDomain = domainFromHost(new URL(response.url).hostname) !== candidate.domain;
            if (differentDomain) reasons.add("redirects_to_other_domain");
            const outcome = differentDomain ? "redirected" : [404, 410].includes(response.status) ? "dead_url"
              : response.status >= 200 && response.status < 300 ? "responding" : "http_error";
            if (outcome === "dead_url") reasons.add("broken_url_not_domain_expiry");
            add("target_http", url, "https_get", outcome, { httpStatus: response.status, scope }, Date.parse(response.observedAt));
          } catch (error) {
            const code = errorCode(error);
            if (code === "blocked_address") { excluded = true; reasons.add("non_public_http_address"); }
            add("target_http", url, "https_get", code === "dns_unavailable" ? "unreachable" : "unknown", { error: code, scope });
          }
        }));
      })(),
    ]);
    const registryStatus: Assessment["registryStatus"] = evidence.some(item => item.kind === "registry" && item.outcome === "registered") ? "registered"
      : evidence.some(item => item.kind === "registry" && item.outcome === "registry_not_found") ? "registry_not_found" : "unknown";
    // All findings are observations, not confirmation of registrability. An
    // absent registry record conflicting with live DNS/HTTP needs more review.
    const contradiction = registryStatus === "registry_not_found" && evidence.some(item => item.outcome === "resolves"
      || item.kind === "target_http" && typeof item.details?.httpStatus === "number" && item.details.httpStatus >= 100);
    if (contradiction) reasons.add("conflicting_observations");
    const missingDns = !evidence.some(item => item.kind === "dns" && ["nxdomain", "no_address"].includes(item.outcome));
    const missingMail = !evidence.some(item => item.kind === "mail" && item.outcome === "no_explicit_mx");
    if (missingDns) reasons.add("dns_absence_not_verified");
    if (missingMail) reasons.add("mail_absence_not_verified");
    const reviewStatus: Assessment["reviewStatus"] = excluded ? "excluded" : registryStatus === "registered" ? "registered"
      : registryStatus === "registry_not_found" && !contradiction && !missingDns && !missingMail ? "review_candidate" : "inconclusive";
    const label = parseDomain(candidate.domain).domainWithoutSuffix ?? "";
    const namingSignal = /^[a-z]{3,63}$/u.test(label) ? nameQualitySignals(label).score : 0;
    if (!namingSignal) reasons.add("naming_model_not_applicable");
    const coverage = new Set(evidence.filter(item => !["unknown", "rate_limited"].includes(item.outcome)).map(item => item.kind));
    const confidenceScore = (coverage.has("registry") ? 35 : 0) + (coverage.has("dns") ? 15 : 0)
      + (coverage.has("mail") ? 10 : 0) + (coverage.has("target_http") ? 10 : 0);
    const assessment: Assessment = { ...candidate, registryStatus, registrability: "unverified", confirmedRegistrable: false, reviewStatus,
      evidence, risk: { level: excluded ? "excluded" : "review", reasons: [...reasons] },
      potentialScore: excluded ? 0 : Math.min(60, Math.round(namingSignal * 0.4) + (registryStatus === "registry_not_found" ? 20 : 0)), confidenceScore };
    const opportunity = scoreLostDomainOpportunity(assessment, now());
    return { ...assessment, opportunity, opportunityScore: opportunity.score,marketFit:analyzeTradingMarketFit(candidate.domain) };
  }
  return { discoverSource, inspectCandidate };
}

/** A pure review queue. Never upgrades registry absence into a purchase claim. */
export function rankAssessments(assessments: readonly Assessment[], now = Date.now()): { confirmed: Assessment[]; review: Assessment[]; excluded: Assessment[] } {
  const latest = new Map<string, Assessment>();
  for (const item of assessments) {
    const previous = latest.get(item.domain);
    const time = (entry: Assessment) => Math.max(0, ...entry.evidence.map(e => Date.parse(e.observedAt)).filter(Number.isFinite));
    const caution = (entry: Assessment) => ({ priority_review: 0, review: 1, watch: 2, excluded: 3 })[scoreLostDomainOpportunity(entry, now).tier];
    if (!previous || time(item) > time(previous) || time(item) === time(previous) && caution(item) > caution(previous)) latest.set(item.domain, item);
  }
  const review: Assessment[] = [], excluded: Assessment[] = [];
  for (const item of latest.values()) {
    const opportunity = scoreLostDomainOpportunity(item, now);
    const scored = { ...item, opportunity, opportunityScore: opportunity.score,marketFit:analyzeTradingMarketFit(item.domain) };
    if (item.reviewStatus === "review_candidate" && ["priority_review", "review"].includes(opportunity.tier)
      && item.registrability === "unverified" && item.confirmedRegistrable === false && item.risk.level !== "excluded") review.push(scored);
    else excluded.push(scored);
  }
  review.sort((a, b) => Number(b.opportunity!.tier === "priority_review") - Number(a.opportunity!.tier === "priority_review")
    || b.marketFit!.score - a.marketFit!.score || b.opportunityScore! - a.opportunityScore! || a.domain.localeCompare(b.domain));
  return { confirmed: [], review: review.slice(0, 30), excluded: [...review.slice(30), ...excluded] };
}

const engine = createLostDomainsEngine();
export const discoverSource = engine.discoverSource;
export const inspectCandidate = engine.inspectCandidate;
