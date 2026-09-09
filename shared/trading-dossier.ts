import { parse } from "tldts";
import { isTradingArchiveEvidence, type TradingArchiveEvidence } from "./trading-archive.js";

/** Evidence gates, not a valuation, statistical confidence model or purchase instruction. */
export const TRADING_DOSSIER_POLICY = Object.freeze({ freshSeconds: 900, historySeconds: 259_200,
  requiredChecks: 3, requiredSpanSeconds: 43_200, minimumSeparationSeconds: 1_200, maximumObservations: 128 });
export type TradingDossierFamily = "registry" | "dns" | "mail" | "website";
export type TradingDossierCheckState = "negative" | "active" | "conflict" | "unknown" | "stale";
export interface TradingDossierEvidence {
  kind: string; source: string; method: string; observedAt: string; expiresAt: string; outcome: string;
  details?: Record<string, string | number | boolean | string[]>;
}
export interface TradingDossierAssessment {
  domain: string; sourceUrl: string; targetUrl: string; sensitive: boolean;
  registryStatus: "registered" | "registry_not_found" | "unknown";
  evidence: readonly TradingDossierEvidence[];
  risk: { level: "review" | "excluded"; reasons: readonly string[] };
  reviewStatus?: string;
  archive?: TradingArchiveEvidence;
}
/** Actual account-scoped observations supplied by storage, never a user-provided count. */
export interface TradingDossierObservation {
  domain: string; observedAt: string; registryStatus: TradingDossierAssessment["registryStatus"];
  evidence?: readonly TradingDossierEvidence[]; sourceUrl?: string; targetUrl?: string;
}
export type TradingDossierStageId = "source_permission" | "registry" | "dns" | "mail" | "website" | "freshness"
  | "temporal" | "archive" | "registrar" | "rights" | "market_evidence";
export interface TradingDossierStage {
  id: TradingDossierStageId; state: "pass" | "fail" | "unknown" | "stale"; reasons: string[];
}
export interface TradingDossier {
  version: 1; methodology: "technical-dossier-v1"; domain: string; evaluatedAt: string;
  /** Earliest original evidence expiry; reading a report never renews this deadline. */
  validUntil: string | null;
  status: "ready_for_price_review" | "monitor" | "reject" | "incomplete";
  priority: "price_review" | "recheck" | "watch" | "none";
  stages: TradingDossierStage[]; reasons: string[]; blockers: TradingDossierStageId[];
  coverage: { families: Record<TradingDossierFamily, TradingDossierCheckState>; observedFamilies: number; requiredFamilies: 4;
    /** Four different checks; DNS, MX and HTTPS may share the same resolver. */
    independentProvidersVerified: false; newestEvidenceAt: string | null; oldestEvidenceAt: string | null; ageSeconds: number | null };
  temporal: { state: "stable_absence" | "transition" | "needs_more_observations" | "unknown";
    completeChecks: number; stableChecks: number; spanSeconds: number; firstStableAt: string | null; lastStableAt: string | null;
    requiredChecks: 3; requiredSpanSeconds: 43_200; minimumSeparationSeconds: 1_200; windowSeconds: 259_200 };
  dependencies: { activeMail: boolean; respondingHttp: boolean; resolvingDns: boolean; unsafeAddress: boolean; sensitive: boolean };
  lifecycle: { registered: boolean; expirationAt: string | null; expirationPassed: boolean; renewalObservedAt: string | null;
    statuses: string[]; expiryMeansAvailable: false };
  historicalContext: { archive: "observed" | "unknown" | "disabled"; priorExistence: true | null;
    ownershipVerified: false; backlinksVerified: false; trafficVerified: false };
  registrability: "unverified"; investmentValue: "unverified";
}

const REGISTRIES: Readonly<Record<string, string>> = {
  com: "https://rdap.verisign.com/com/v1/", net: "https://rdap.verisign.com/net/v1/",
  org: "https://rdap.publicinterestregistry.org/rdap/", app: "https://pubapi.registry.google/rdap/",
  dev: "https://pubapi.registry.google/rdap/", ai: "https://rdap.identitydigital.services/rdap/",
  xyz: "https://rdap.centralnic.com/xyz/", info: "https://rdap.identitydigital.services/rdap/", biz: "https://rdap.nic.biz/",
};
const FAMILIES: readonly TradingDossierFamily[] = ["registry", "dns", "mail", "website"];
const STAGES: readonly TradingDossierStageId[] = ["source_permission", ...FAMILIES, "freshness", "temporal", "archive", "registrar", "rights", "market_evidence"];
const requiredStages = new Set<TradingDossierStageId>(["source_permission", ...FAMILIES, "freshness", "temporal"]);
const date = (value: unknown): number => typeof value === "string" ? Date.parse(value) : NaN;
const iso = (value: number): string | null => Number.isFinite(value) ? new Date(value).toISOString() : null;
const distinct = <T>(items: readonly T[]): T[] => [...new Set(items)];
function registrable(domain: string): boolean {
  if (typeof domain !== "string" || domain.length > 253 || !/^[a-z0-9.-]+$/u.test(domain)
    || domain.split(".").some(label => !label || label.length > 63 || label.startsWith("-") || label.endsWith("-"))) return false;
  const parsed = parse(domain, { allowPrivateDomains: true });
  return !!parsed.isIcann && !parsed.isPrivate && !parsed.isIp && parsed.domain === domain;
}
function urlDomain(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash) return null;
    const parsed = parse(url.hostname, { allowPrivateDomains: true });
    return parsed.isIcann && !parsed.isPrivate && !parsed.isIp ? parsed.domain : null;
  } catch { return null; }
}
function sensitiveTarget(raw: string): boolean {
  try {
    const url = new URL(raw), value = `${url.hostname}${decodeURIComponent(url.pathname)}`;
    return /(?:^|[\s./_?&=-])(?:login|signin|sign-in|sso|oauth|auth|password|reset|verify|verification|mail|email|smtp|imap|webmail|cdn|sdk|api|webhook|script|checkout|payment|bankid)(?:$|[\s./_?&=-])/iu.test(value)
      || /\.(?:js|mjs|wasm|exe|dmg|zip|msi|apk)$/iu.test(value);
  } catch { return true; }
}
function familyOf(e: TradingDossierEvidence, item: Pick<TradingDossierAssessment, "domain" | "targetUrl">): TradingDossierFamily | null {
  const endpoint = REGISTRIES[parse(item.domain).publicSuffix ?? ""];
  if (e.kind === "registry" && e.method === "rdap" && endpoint && e.source === `${endpoint}domain/${encodeURIComponent(item.domain)}`) return "registry";
  if (e.kind === "dns" && e.method === "address_lookup" && e.source === "system-dns-resolver") return "dns";
  if (e.kind === "mail" && e.method === "mx_lookup" && e.source === "system-dns-resolver") return "mail";
  if (e.kind === "target_http" && e.method === "https_get" && (e.source === `https://${item.domain}/` || e.source === item.targetUrl)) return "website";
  return null;
}
function fresh(e: TradingDossierEvidence, now: number): boolean {
  const observed = date(e.observedAt), expires = date(e.expiresAt);
  return Number.isFinite(observed) && Number.isFinite(expires) && observed <= now && observed >= now - 900_000
    && expires > now && expires > observed && expires <= observed + 900_000;
}
function outcome(e: TradingDossierEvidence, family: TradingDossierFamily, domain: string): "negative" | "active" | "unknown" {
  if (family === "registry") return e.outcome === "registry_not_found" && e.details?.httpStatus === 404 ? "negative"
    : e.outcome === "registered" && e.details?.httpStatus === 200 ? "active" : "unknown";
  if (family === "dns") return ["nxdomain", "no_address"].includes(e.outcome) ? "negative" : e.outcome === "resolves" ? "active" : "unknown";
  if (family === "mail") return e.outcome === "no_explicit_mx" ? "negative" : e.outcome === "mx_present" ? "active" : "unknown";
  // Any HTTP response, including a broken path or blocked request, proves service presence.
  if (["responding", "dead_url", "redirected", "http_error"].includes(e.outcome)
    || typeof e.details?.httpStatus === "number" && e.details.httpStatus >= 100 && e.details.httpStatus <= 599) return "active";
  return e.source === `https://${domain}/` && e.outcome === "unreachable" && e.details?.error === "dns_unavailable" ? "negative" : "unknown";
}
type Snapshot = { states: Record<TradingDossierFamily, TradingDossierCheckState>; rows: TradingDossierEvidence[];
  oldest: number; newest: number; complete: boolean; negative: boolean; unsafe: boolean; conflict: boolean };
function snapshot(item: Pick<TradingDossierAssessment, "domain" | "targetUrl" | "registryStatus" | "evidence">, now: number): Snapshot {
  const recognised = item.evidence.slice(0, 32).filter(e => e && familyOf(e, item));
  const rows = recognised.filter(e => fresh(e, now));
  const states = Object.fromEntries(FAMILIES.map(family => {
    const entries = rows.filter(e => familyOf(e, item) === family), states = entries.map(e => outcome(e, family, item.domain));
    const positive = states.includes("active"), negative = states.includes("negative");
    return [family, positive && negative ? "conflict" : positive ? "active" : negative ? "negative"
      : recognised.some(e => familyOf(e, item) === family && !fresh(e, now)) ? "stale" : "unknown"];
  })) as Snapshot["states"];
  // A contradictory top-level registry state is never overridden by convenient evidence.
  if (item.registryStatus === "registered" && states.registry === "negative"
    || item.registryStatus === "registry_not_found" && states.registry === "active") states.registry = "conflict";
  if (item.registryStatus !== "registry_not_found" && states.registry === "negative") states.registry = "unknown";
  const decisive = rows.filter(e => outcome(e, familyOf(e, item)!, item.domain) !== "unknown");
  const timestamps = decisive.map(e => date(e.observedAt));
  const complete = FAMILIES.every(family => ["negative", "active", "conflict"].includes(states[family]));
  const conflict = Object.values(states).includes("conflict") || states.registry === "negative"
    && [states.dns, states.mail, states.website].some(state => state === "active");
  return { states, rows, oldest: timestamps.length ? Math.min(...timestamps) : NaN, newest: timestamps.length ? Math.max(...timestamps) : NaN,
    complete, negative: FAMILIES.every(family => states[family] === "negative") && !conflict,
    unsafe: rows.some(e => e.outcome === "non_public_address" || e.details?.error === "blocked_address"), conflict };
}

/** Synchronous, deterministic and side-effect free. Missing observations remain missing. */
export function analyzeTradingDossier(item: TradingDossierAssessment, options: { now?: number;
  observations?: readonly TradingDossierObservation[]; sourceApproved?: boolean; superseded?: boolean } = {}): TradingDossier {
  const now = Number.isFinite(options.now) ? options.now! : Date.now();
  const provenance = registrable(item.domain) && urlDomain(item.targetUrl) === item.domain
    && !!urlDomain(item.sourceUrl) && urlDomain(item.sourceUrl) !== item.domain;
  const current = snapshot(item, now), dependencies = { activeMail: ["active", "conflict"].includes(current.states.mail),
    respondingHttp: ["active", "conflict"].includes(current.states.website), resolvingDns: ["active", "conflict"].includes(current.states.dns),
    unsafeAddress: current.unsafe, sensitive: item.sensitive === true || sensitiveTarget(item.targetUrl) };
  const registryRows = current.rows.filter(e => familyOf(e, item) === "registry" && outcome(e, "registry", item.domain) === "active");
  const lifecycleEvents = registryRows.flatMap(e => Array.isArray(e.details?.events) ? e.details.events : []);
  const eventDates = (name: string): number[] => lifecycleEvents.flatMap(event => {
    const match = new RegExp(`^${name}: (.+)$`, "iu").exec(event), at = match ? date(match[1]) : NaN;
    return Number.isFinite(at) ? [at] : [];
  });
  const expirations = eventDates("expiration"), renewals = [...eventDates("renewal"), ...eventDates("reregistration")].filter(at => at <= now);
  const expiration = expirations.length ? Math.max(...expirations) : NaN;
  const lifecycle: TradingDossier["lifecycle"] = { registered: item.registryStatus === "registered" || registryRows.length > 0,
    expirationAt: iso(expiration), expirationPassed: expiration < now, renewalObservedAt: iso(renewals.length ? Math.max(...renewals) : NaN),
    statuses: distinct(registryRows.flatMap(e => Array.isArray(e.details?.statuses) ? e.details.statuses : [])
      .filter(value => typeof value === "string" && value.length <= 50)).slice(0, 12), expiryMeansAvailable: false };

  const observations = (options.observations ?? []).filter(row => row.domain === item.domain && Number.isFinite(date(row.observedAt))
    && date(row.observedAt) <= now && date(row.observedAt) >= now - 259_200_000)
    .sort((a, b) => date(b.observedAt) - date(a.observedAt)).slice(0, 128);
  const historical = observations.flatMap(row => {
    if (!row.evidence || !row.evidence.length || row.sourceUrl && (!urlDomain(row.sourceUrl) || urlDomain(row.sourceUrl) === item.domain)
      || row.targetUrl && urlDomain(row.targetUrl) !== item.domain) return [];
    const data = snapshot({ ...row, evidence: row.evidence, targetUrl: row.targetUrl ?? item.targetUrl }, date(row.observedAt));
    // Retain partial active observations as barriers. Four complete checks are
    // required to corroborate absence; just one active dependency refutes it.
    return (data.complete || data.unsafe || Object.values(data.states).some(state => ["active", "conflict"].includes(state)))
      && data.newest < current.oldest && data.oldest >= now - 259_200_000 ? [data] : [];
  });
  const all = [...historical, ...(current.complete ? [current] : [])].sort((a, b) => b.newest - a.newest);
  const unique = new Map<string, Snapshot>();
  for (const entry of all) {
    const key = distinct(entry.rows.map(row => `${row.kind}|${row.source}|${row.method}|${row.observedAt}|${row.outcome}`)).sort().join("\n");
    if (!unique.has(key)) unique.set(key, entry);
  }
  // Traverse newest-first and stop at the first contradictory complete check.
  // Earlier clean observations cannot erase a more recent active dependency.
  const stable: Snapshot[] = [];
  const lastRegisteredAt = observations.filter(row => row.registryStatus === "registered")
    .reduce((latest, row) => Math.max(latest, date(row.observedAt)), -Infinity);
  for (const entry of unique.values()) {
    if (!entry.negative || entry.unsafe) break;
    if (entry.oldest <= lastRegisteredAt) break;
    if (!stable.length || stable[stable.length - 1].oldest - entry.newest >= 1_200_000) stable.push(entry);
  }
  const spanSeconds = stable.length > 1 ? Math.floor((stable[0].oldest - stable[stable.length - 1].newest) / 1000) : 0;
  const temporalPass = current.negative && stable.length >= 3 && spanSeconds >= 43_200;
  const transition = current.conflict || observations.some(row => row.registryStatus !== "unknown" && item.registryStatus !== "unknown"
    && row.registryStatus !== item.registryStatus) || [...unique.values()].some(entry => entry.conflict || entry.states.registry === "active");
  const temporal: TradingDossier["temporal"] = { state: temporalPass ? "stable_absence" : transition ? "transition"
    : current.complete || unique.size ? "needs_more_observations" : "unknown", completeChecks: [...unique.values()].filter(entry => entry.complete).length, stableChecks: stable.length,
    spanSeconds, firstStableAt: iso(stable.length ? stable[stable.length - 1].newest : NaN), lastStableAt: iso(stable.length ? stable[0].oldest : NaN),
    requiredChecks: 3, requiredSpanSeconds: 43_200, minimumSeparationSeconds: 1_200, windowSeconds: 259_200 };
  const validArchive = item.archive && item.archive.domain === item.domain && isTradingArchiveEvidence(item.archive)
    && date(item.archive.checkedAt) <= now ? item.archive : null;
  const archiveStatus = validArchive?.status ?? "unknown";
  const historicalContext: TradingDossier["historicalContext"] = { archive: archiveStatus,
    priorExistence: validArchive?.status === "observed" ? true : null, ownershipVerified: false, backlinksVerified: false, trafficVerified: false };
  const sourceState = !provenance || options.sourceApproved === false ? "fail" : options.sourceApproved === true ? "pass" : "unknown";
  const stages: TradingDossierStage[] = [{ id: "source_permission", state: sourceState,
    reasons: [!provenance ? "invalid_discovery_provenance" : options.sourceApproved === false ? "source_not_approved"
      : options.sourceApproved === true ? "source_permission_current" : "source_permission_unknown"] },
  ...FAMILIES.map((id): TradingDossierStage => ({ id, state: current.states[id] === "negative" ? "pass"
    : ["active", "conflict"].includes(current.states[id]) ? "fail" : current.states[id] === "stale" ? "stale" : "unknown",
  reasons: [`${id}_${current.states[id]}`] })),
  { id: "freshness", state: options.superseded ? "unknown" : current.complete ? "pass" : Object.values(current.states).includes("stale") ? "stale" : "unknown",
    reasons: [options.superseded ? "newer_observation_available" : current.complete ? "four_fresh_check_families" : "fresh_complete_evidence_required"] },
  { id: "temporal", state: temporalPass ? "pass" : transition ? "fail" : "unknown", reasons: [temporalPass ? "repeated_temporal_absence"
    : transition ? "registry_or_dependency_transition" : "three_checks_over_twelve_hours_required"] },
  { id: "archive", state: archiveStatus === "observed" ? "pass" : "unknown", reasons: [archiveStatus === "observed" ? "bounded_crawl_sightings_only"
    : archiveStatus === "disabled" ? "archive_disabled" : "archive_history_unknown"] },
  { id: "registrar", state: "unknown", reasons: ["registrability_and_exact_price_not_verified"] },
  { id: "rights", state: "unknown", reasons: ["trademark_and_ownership_not_verified"] },
  { id: "market_evidence", state: "unknown", reasons: ["comparables_demand_and_resale_value_not_verified"] }];
  const blockers = stages.filter(stage => requiredStages.has(stage.id) && stage.state !== "pass").map(stage => stage.id);
  const rejected = !provenance || item.evidence.length > 32 || options.sourceApproved === false || dependencies.activeMail || dependencies.unsafeAddress || dependencies.sensitive
    || item.risk.level === "excluded" || item.reviewStatus === "excluded";
  const status: TradingDossier["status"] = rejected ? "reject" : !blockers.length ? "ready_for_price_review"
    : lifecycle.registered || current.conflict || dependencies.respondingHttp || dependencies.resolvingDns || current.negative || transition ? "monitor" : "incomplete";
  const reasons = distinct([...stages.flatMap(stage => stage.reasons),
    ...(dependencies.activeMail ? ["active_mail_dependency"] : []), ...(dependencies.unsafeAddress ? ["unsafe_address"] : []),
    ...(dependencies.sensitive ? ["sensitive_dependency"] : []), ...(current.conflict ? ["conflicting_observations"] : []),
    ...(item.evidence.length > 32 ? ["invalid_evidence_size"] : []),
    ...(lifecycle.expirationPassed ? ["past_expiration_is_not_availability"] : []),
    ...(lifecycle.renewalObservedAt ? ["renewal_record_is_not_availability"] : []), "technical_gates_not_a_buy_signal"]);
  return { version: 1, methodology: "technical-dossier-v1", domain: item.domain, evaluatedAt: new Date(now).toISOString(),
    validUntil: status === "ready_for_price_review" ? iso(Math.min(current.oldest + 900_000, ...current.rows.map(row => date(row.expiresAt)))) : null, status,
    priority: status === "ready_for_price_review" ? "price_review" : status === "reject" ? "none" : lifecycle.registered ? "watch" : "recheck",
    stages, reasons, blockers, coverage: { families: current.states,
      observedFamilies: FAMILIES.filter(family => ["negative", "active", "conflict"].includes(current.states[family])).length,
      requiredFamilies: 4, independentProvidersVerified: false, newestEvidenceAt: iso(current.newest), oldestEvidenceAt: iso(current.oldest),
      ageSeconds: Number.isFinite(current.oldest) ? Math.max(0, Math.floor((now - current.oldest) / 1000)) : null },
    temporal, dependencies, lifecycle, historicalContext, registrability: "unverified", investmentValue: "unverified" };
}

/** Validate a serialized dossier at a client boundary. Recompute server-side from evidence when making decisions. */
export function isTradingDossier(value: unknown): value is TradingDossier {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as TradingDossier;
  if (row.version !== 1 || row.methodology !== "technical-dossier-v1" || !registrable(row.domain) || !Number.isFinite(date(row.evaluatedAt))
    || !["ready_for_price_review", "monitor", "reject", "incomplete"].includes(row.status)
    || !["price_review", "recheck", "watch", "none"].includes(row.priority)
    || row.registrability !== "unverified" || row.investmentValue !== "unverified"
    || !Array.isArray(row.stages) || row.stages.length !== STAGES.length || !Array.isArray(row.blockers) || !Array.isArray(row.reasons)) return false;
  if (row.status === "ready_for_price_review" ? !Number.isFinite(date(row.validUntil)) || date(row.validUntil) <= date(row.evaluatedAt)
    || date(row.validUntil) > date(row.evaluatedAt) + 900_000 : row.validUntil !== null) return false;
  const reasonsValid = (reasons: unknown): reasons is string[] => Array.isArray(reasons) && reasons.length <= 64
    && reasons.every(reason => typeof reason === "string" && /^[a-z][a-z0-9_]{0,79}$/u.test(reason)) && distinct(reasons).length === reasons.length;
  if (!reasonsValid(row.reasons) || row.stages.some((stage, i) => !stage || stage.id !== STAGES[i]
    || !["pass", "fail", "unknown", "stale"].includes(stage.state) || !reasonsValid(stage.reasons))) return false;
  const blockers = row.stages.filter(stage => requiredStages.has(stage.id) && stage.state !== "pass").map(stage => stage.id);
  if (JSON.stringify(row.blockers) !== JSON.stringify(blockers)) return false;
  const coverage = row.coverage, temporal = row.temporal, dependencies = row.dependencies, lifecycle = row.lifecycle, archive = row.historicalContext;
  const integer = (n: unknown, max = Number.MAX_SAFE_INTEGER): n is number => Number.isSafeInteger(n) && Number(n) >= 0 && Number(n) <= max;
  if (!coverage || !coverage.families || coverage.requiredFamilies !== 4 || coverage.independentProvidersVerified !== false
    || !integer(coverage.observedFamilies, 4) || FAMILIES.some(family => !["negative", "active", "conflict", "unknown", "stale"].includes(coverage.families[family]))
    || coverage.observedFamilies !== FAMILIES.filter(family => ["negative", "active", "conflict"].includes(coverage.families[family])).length
    || [coverage.newestEvidenceAt, coverage.oldestEvidenceAt].some(at => at !== null && !Number.isFinite(date(at)))
    || coverage.ageSeconds !== null && !integer(coverage.ageSeconds, 900)
    || !temporal || !["stable_absence", "transition", "needs_more_observations", "unknown"].includes(temporal.state)
    || temporal.requiredChecks !== 3 || temporal.requiredSpanSeconds !== 43_200 || temporal.minimumSeparationSeconds !== 1_200 || temporal.windowSeconds !== 259_200
    || !integer(temporal.completeChecks, 129) || !integer(temporal.stableChecks, temporal.completeChecks) || !integer(temporal.spanSeconds, 259_200)
    || [temporal.firstStableAt, temporal.lastStableAt].some(at => at !== null && !Number.isFinite(date(at)))
    || !dependencies || [dependencies.activeMail, dependencies.respondingHttp, dependencies.resolvingDns, dependencies.unsafeAddress, dependencies.sensitive].some(v => typeof v !== "boolean")
    || !lifecycle || typeof lifecycle.registered !== "boolean" || typeof lifecycle.expirationPassed !== "boolean" || lifecycle.expiryMeansAvailable !== false
    || [lifecycle.expirationAt, lifecycle.renewalObservedAt].some(at => at !== null && !Number.isFinite(date(at)))
    || !Array.isArray(lifecycle.statuses) || lifecycle.statuses.length > 12 || lifecycle.statuses.some(s => typeof s !== "string" || s.length > 50)
    || !archive || !["observed", "unknown", "disabled"].includes(archive.archive) || archive.priorExistence !== (archive.archive === "observed" ? true : null)
    || archive.ownershipVerified !== false || archive.backlinksVerified !== false || archive.trafficVerified !== false) return false;
  const temporalPass = temporal.stableChecks >= 3 && temporal.spanSeconds >= 43_200 && FAMILIES.every(family => coverage.families[family] === "negative");
  if ((temporal.state === "stable_absence") !== temporalPass || (row.stages.find(stage => stage.id === "temporal")!.state === "pass") !== temporalPass) return false;
  if (dependencies.activeMail || dependencies.unsafeAddress || dependencies.sensitive) { if (row.status !== "reject") return false; }
  if (row.status === "ready_for_price_review" && (row.blockers.length || lifecycle.registered || !temporalPass
    || Object.values(dependencies).some(Boolean) || row.priority !== "price_review")) return false;
  if (row.status !== "ready_for_price_review" && row.priority === "price_review" || row.status === "reject" && row.priority !== "none") return false;
  return true;
}
