import { packageSocialUrl, type NamePackage } from "../../shared/name-packages";
import { getNamePackageBrandIndex } from "../../shared/brand-candidate-index";
import { brandWorkspaceCopy } from "../i18n/brandWorkspaceCopy";
import { namePackagesCopy, type NamePackagesCopy } from "../i18n/namePackagesCopy";
import type { Language } from "../i18n/LanguageProvider";
import { marketCountText, namePackageCountryName, namePackageMarketsCopy } from "../i18n/namePackageMarketsCopy";
import { buildNamePackageMarketCoverage, type NamePackageMarketCode } from "../../shared/name-package-markets";

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

/** Self-contained HTML, no scripts, remote resources, search brief or embedded account IDs. */
export function exportNamePackageReport(packages: NamePackage[], language: Language, createdAt: string, markets?: readonly NamePackageMarketCode[]): string {
  const c = namePackagesCopy[language] ?? namePackagesCopy.en;
  const w = brandWorkspaceCopy[language] ?? brandWorkspaceCopy.en;
  const mc = namePackageMarketsCopy[language] ?? namePackageMarketsCopy.en;
  const coverage = buildNamePackageMarketCoverage(markets);
  const e = escapePackageHtml;
  const stamp = (value: string | null) => value && Number.isFinite(Date.parse(value)) ? e(value) : e(c.noTime);
  const link = (url: string, label: string) => `<a href="${e(url)}" rel="noreferrer noopener">${e(label)}</a>`;
  const marketSection = `<section id="package-market-review"><h2>${e(mc.coverageTitle)}</h2><p><strong>${e(marketCountText(mc.coverage, coverage.requested_markets.length))}</strong></p><p>${e(mc.incomplete)}</p><h3>${e(mc.chosen)}</h3><p>${coverage.requested_markets.map(code => `${e(namePackageCountryName(code, language))} (${e(code)})`).join(" · ")}</p><h3>${e(mc.sources)}</h3>${coverage.checks.map(check => `<section data-market="${e(check.market)}"><h4>${e(namePackageCountryName(check.market, language))} (${e(check.market)}) · ${e(mc.notChecked)}</h4>${(["company", "trademark"] as const).map(kind => `<p><strong>${e(mc[kind])} · ${e(mc.manual)}</strong></p><ul>${check[kind].sources.map(source => `<li>${link(source.url, source.name)}<br><small>${e(mc.catalogDate)}: ${e(source.reviewed_on)}</small></li>`).join("")}</ul>`).join("")}<p>${e(mc.followUp)}</p><ul>${check.required_follow_up.map(code => `<li>${e(mc.followUps[code])}</li>`).join("")}</ul></section>`).join("")}</section>`;
  const sections = packages.map(pkg => `<article><h2>${e(pkg.displayName)}</h2>
    <p><strong>${e(w.index)} · ${e(w.candidate)}: ${e(getNamePackageBrandIndex(pkg, Date.parse(createdAt)).score)}/100</strong> · ${e(c.fitScore)}: ${e(pkg.fitScore)}/100 · ${e(c.evidence)}: ${e(pkg.evidenceCoverage)}%</p>
    <p>${e(w.ceiling)} · ${e(getNamePackageBrandIndex(pkg, Date.parse(createdAt)).methodologyVersion)}</p>
    <p>${e(c.scoreHint)}</p><p>${e(c.fitMethod)}</p><p>${e(c.scoreLimit)}</p><p>${e(c.domainReceiptTime)}: ${stamp(pkg.observedAt)}</p>
    <h3>${e(c.domains)}</h3><ul>${pkg.domains.map(domain => `<li><strong>${e(domain.domain)}</strong> — ${e(packageDomainStatus(domain, c))}</li>`).join("")}</ul>
    <h3>${e(c.socials)}</h3><ul>${pkg.socials.map(social => { const url = social.handle ? packageSocialUrl(social.platform, social.handle) : null; return `<li><strong>${e(socialPlatformNames[social.platform])} ${e(social.handle ? `@${social.handle}` : "—")}</strong> — ${e(packageSocialStatus(social, c))}${url ? ` · ${link(url, c.openProfile)}` : ""}<br>${e(c.observed)}: ${stamp(social.checkedAt)}</li>`; }).join("")}</ul>
    <h3>${e(c.company)} · ${e(c.manual)}</h3><p>${e(mc.companyHelp)}</p>${link("#package-market-review", mc.cardPointer)}
    <h3>${e(c.trademark)} · ${e(c.manual)}</h3><p>${e(mc.trademarkHelp)}</p>${link("#package-market-review", mc.cardPointer)}
    <h3>${e(c.scoreParts)}</h3><ul>${([["fit", c.fitPart], ["domains", c.domainPart], ["socials", c.socialPart], ["company", c.companyPart], ["trademark", c.trademarkPart]] as const).map(([key, label]) => `<li>${e(label)}: ${e(pkg.scoreParts[key].score)}/${e(pkg.scoreParts[key].max)}</li>`).join("")}</ul>
    <p>${e(c.riskPenalty)}: −${e(pkg.riskPenalty)}</p><ul>${pkg.reasonCodes.map(code => `<li>${e(c.reasons[code])}</li>`).join("")}</ul></article>`).join("");
  return `<!doctype html><html lang="${e(language)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${e(c.title)} | Sajda</title><style>body{font:16px/1.6 system-ui,sans-serif;max-width:850px;margin:32px auto;padding:0 20px;color:#172033;overflow-wrap:anywhere}article{border-top:1px solid #cad4e3;margin-top:32px;padding-top:16px}h1,h2,h3{line-height:1.25}li{margin:12px 0}a{color:#0756b2}p{max-width:75ch}@media print{article{break-inside:avoid}}</style></head><body><h1>${e(c.title)} · Sajda</h1><p>${e(c.exportTime)}: ${stamp(createdAt)}</p><p>${e(c.refreshHint)}</p>${marketSection}${sections}</body></html>`;
}
