import { applyPackageObservations, buildNamePackages, normalizePackageEvidenceTimestamp, packageSocialUrl, SOCIAL_PLATFORMS, type NamePackage, type SocialObservation } from "../../shared/name-packages";
import { getNamePackageBrandIndex } from "../../shared/brand-candidate-index";
import { safeBrandEvidenceSourceUrl, type BrandEvidenceReport } from "../../shared/brand-evidence";
import { brandWorkspaceCopy } from "../i18n/brandWorkspaceCopy";
import { namePackagesCopy, type NamePackagesCopy } from "../i18n/namePackagesCopy";
import type { Language } from "../i18n/LanguageProvider";
import { marketCountText, namePackageCountryName, namePackageMarketsCopy } from "../i18n/namePackageMarketsCopy";
import { buildNamePackageMarketCoverage, type NamePackageMarketCode } from "../../shared/name-package-markets";
import { brandEvidenceCopy, evidenceCoverageText } from "../i18n/brandEvidenceCopy";

export function escapePackageHtml(value: unknown): string {
  return String(value).split("&").join("&amp;").split("<").join("&lt;").split(">").join("&gt;").split('"').join("&quot;").split("'").join("&#39;");
}
export function packageDomainStatus(domain: NamePackage["domains"][number], copy: NamePackagesCopy): string {
  if (domain.requestedAlternative) return copy.selectedUnverified;
  if (domain.evidenceStatus === "stale") return copy.stale;
  if (domain.evidenceStatus !== "fresh" || !domain.availabilityVerified) return copy.unknown;
  return domain.status === "available" ? copy.available : domain.status === "taken" ? copy.taken : copy.unknown;
}
export function packageSocialStatus(social: NamePackage["socials"][number], copy: NamePackagesCopy): string {
  return !social.formatValid ? copy.invalidHandle : social.status === "profile_found" ? copy.profileFound : social.status === "not_found" ? copy.notFound : copy.notChecked;
}
export const socialPlatformNames = { instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube", github: "GitHub", x: "X", linkedin: "LinkedIn" } as const;

function exportBrandEvidence(report: BrandEvidenceReport, language: Language): string {
  const c = brandEvidenceCopy[language], e = escapePackageHtml;
  const states = ["checked", "reported", "listed", "unknown"] as const;
  return `<section data-brand-evidence><h3>${e(c.title)}</h3><dl class="evidence-counts">${states.map(state => `<div data-evidence-count="${state}"><dt>${e(c[state])}</dt><dd>${e(report.summary[state])}</dd></div>`).join("")}</dl>
    <p data-evidence-coverage>${e(evidenceCoverageText(c, report.summary.checked, report.summary.total, report.summary.checked_coverage_percent))}</p><p data-evidence-scope>${e(c.scope)}</p><p data-evidence-boundary>${e(c.boundary)}</p>
    <details><summary>${e(c.details)}</summary><p>${e(c.unknownHelp)}</p>${states.map(state => `<section data-evidence-group="${state}"><h4>${e(c[state])}</h4><ul>${report.entries.filter(entry => entry.state === state).map(entry => {
      const source = safeBrandEvidenceSourceUrl(entry.source_url);
      const freshness = entry.freshness === "current" && entry.origin === "source_assertion" ? c.currentSource : entry.freshness === "current" && entry.origin === "user_report" ? c.currentReport : c.freshness[entry.freshness];
      return `<li data-evidence-entry="${e(entry.id)}" data-evidence-state="${state}"><strong>${e(entry.target)}</strong><p>${e(c.statements[entry.statement])}</p><small>${e(freshness)}${entry.observed_at ? ` · ${e(entry.origin === "user_report" ? c.reportedAt : entry.origin === "source_assertion" ? c.sourceRetrieved : c.observed)}: <time datetime="${e(entry.observed_at)}">${e(entry.observed_at)}</time>` : ""}${source ? ` · <a href="${e(source)}" rel="noreferrer noopener">${e(c.source)}</a>` : ""}</small></li>`;
    }).join("") || `<li>${e(c.empty)}</li>`}</ul></section>`).join("")}</details></section>`;
}

/** Self-contained HTML, no scripts, remote resources, search brief or embedded account IDs. */
export function exportNamePackageReport(packages: NamePackage[], language: Language, createdAt: string, markets?: readonly NamePackageMarketCode[]): string {
  const exportAt = normalizePackageEvidenceTimestamp(createdAt);
  if (exportAt === null) throw new Error("A valid export timestamp is required.");
  const now = Date.parse(exportAt);
  const c = namePackagesCopy[language] ?? namePackagesCopy.en;
  const w = brandWorkspaceCopy[language] ?? brandWorkspaceCopy.en;
  const mc = namePackageMarketsCopy[language] ?? namePackageMarketsCopy.en;
  const coverage = buildNamePackageMarketCoverage(markets);
  const e = escapePackageHtml;
  const stamp = (value: string | null) => value && Number.isFinite(Date.parse(value)) ? e(value) : e(c.noTime);
  const link = (url: string, label: string) => `<a href="${e(url)}" rel="noreferrer noopener">${e(label)}</a>`;
  const marketSection = `<section id="package-market-review"><h2>${e(mc.coverageTitle)}</h2><p><strong>${e(marketCountText(mc.coverage, coverage.requested_markets.length))}</strong></p><p>${e(mc.incomplete)}</p><h3>${e(mc.chosen)}</h3><p>${coverage.requested_markets.map(code => `${e(namePackageCountryName(code, language))} (${e(code)})`).join(" · ")}</p><h3>${e(mc.sources)}</h3>${coverage.checks.map(check => `<section data-market="${e(check.market)}"><h4>${e(namePackageCountryName(check.market, language))} (${e(check.market)}) · ${e(mc.notChecked)}</h4>${(["company", "trademark"] as const).map(kind => `<p><strong>${e(mc[kind])} · ${e(mc.manual)}</strong></p><ul>${check[kind].sources.map(source => `<li>${link(source.url, source.name)}<br><small>${e(mc.catalogDate)}: ${e(source.reviewed_on)}</small></li>`).join("")}</ul>`).join("")}<p>${e(mc.followUp)}</p><ul>${check.required_follow_up.map(code => `<li>${e(mc.followUps[code])}</li>`).join("")}</ul></section>`).join("")}</section>`;
  const sections = packages.map(saved => {
    const rebuilt = buildNamePackages(saved.domains, { platforms: SOCIAL_PLATFORMS.filter(platform => saved.socials.some(social => social.platform === platform)), observedAt: null, now, limit: 10 })
      .find(candidate => candidate.label === saved.label);
    if (!rebuilt) throw new Error("A valid name package is required for an export.");
    const observations = saved.socials.flatMap(social => social.handle && social.sourceUrl && social.checkedAt
      ? [{ platform: social.platform, handle: social.handle, sourceUrl: social.sourceUrl, checkedAt: social.checkedAt, status: social.status } satisfies SocialObservation] : []);
    const pkg = { ...applyPackageObservations(rebuilt, observations, now), displayName: saved.displayName }, index = getNamePackageBrandIndex(saved, now);
    return `<article><h2>${e(pkg.displayName)}</h2>
    <p><strong>${e(w.index)} · ${e(w.candidate)}: ${e(index.score)}/100</strong> · ${e(c.fitScore)}: ${e(index.nameFitScore)}/100</p>
    <p>${e(w.ceiling)} · ${e(index.methodologyVersion)}</p>
    <p>${e(c.scoreHint)}</p><p>${e(c.fitMethod)}</p><p>${e(c.scoreLimit)}</p><p>${e(c.domainReceiptTime)}: ${stamp(pkg.observedAt)}</p>
    ${exportBrandEvidence(index.evidence_report, language)}
    <h3>${e(c.domains)}</h3><ul>${pkg.domains.map(domain => `<li><strong>${e(domain.domain)}</strong> — ${e(packageDomainStatus(domain, c))}</li>`).join("")}</ul>
    <h3>${e(c.socials)}</h3><ul>${pkg.socials.map(social => { const url = social.handle ? packageSocialUrl(social.platform, social.handle) : null; return `<li><strong>${e(socialPlatformNames[social.platform])} ${e(social.handle ? `@${social.handle}` : "—")}</strong> — ${e(packageSocialStatus(social, c))}${url ? ` · ${link(url, c.openProfile)}` : ""}<br>${e(c.observed)}: ${stamp(social.checkedAt)}</li>`; }).join("")}</ul>
    <h3>${e(c.company)} · ${e(c.manual)}</h3><p>${e(mc.companyHelp)}</p>${link("#package-market-review", mc.cardPointer)}
    <h3>${e(c.trademark)} · ${e(c.manual)}</h3><p>${e(mc.trademarkHelp)}</p>${link("#package-market-review", mc.cardPointer)}
    <h3>${e(c.scoreParts)}</h3><ul>${([["fit", c.fitPart], ["domains", c.domainPart], ["socials", c.socialPart], ["company", c.companyPart], ["trademark", c.trademarkPart]] as const).map(([key, label]) => `<li>${e(label)}: ${e(pkg.scoreParts[key].score)}/${e(pkg.scoreParts[key].max)}</li>`).join("")}</ul>
    <p>${e(c.riskPenalty)}: −${e(pkg.riskPenalty)}</p><ul>${pkg.reasonCodes.map(code => `<li>${e(c.reasons[code])}</li>`).join("")}</ul></article>`;
  }).join("");
  return `<!doctype html><html lang="${e(language)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${e(c.title)} | Sajda</title><style>body{font:16px/1.6 system-ui,sans-serif;max-width:850px;margin:32px auto;padding:0 20px;color:#172033;overflow-wrap:anywhere}article{border-top:1px solid #cad4e3;margin-top:32px;padding-top:16px}h1,h2,h3{line-height:1.25}li{margin:12px 0}a{color:#0756b2}p{max-width:75ch}.evidence-counts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.evidence-counts>div{border:1px solid #cad4e3;border-radius:8px;padding:8px 12px}.evidence-counts dd{margin:4px 0;font-size:1.3em;font-weight:600}summary{min-height:44px;cursor:pointer;color:#0756b2;font-weight:600}@media(min-width:600px){.evidence-counts{grid-template-columns:repeat(4,minmax(0,1fr))}}@media print{article{break-inside:avoid}details>section{display:block}}</style></head><body><h1>${e(c.title)} · Sajda</h1><p>${e(c.exportTime)}: ${stamp(createdAt)}</p><p>${e(c.refreshHint)}</p>${marketSection}${sections}</body></html>`;
}
