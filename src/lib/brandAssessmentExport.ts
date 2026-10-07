import { assessBrandPresence, brandIndexInputSchema, type BrandIndexInput } from "../../shared/brand-presence-index";
import { createBrandEvidenceReport, safeBrandEvidenceSourceUrl } from "../../shared/brand-evidence";
import type { PackageDomainInput } from "../../shared/name-packages";
import type { Language } from "../i18n/languagePreference";
import { brandIndexCopy } from "../i18n/brandIndexCopy";
import { brandEvidenceCopy, evidenceCoverageText } from "../i18n/brandEvidenceCopy";
import { brandWorksheetCopy } from "../i18n/brandWorksheetCopy";
import { brandChecksCopy } from "../i18n/brandChecksCopy";
import { projectBrandDomainEvidence } from "./brandDomainEvidence";
import { escapePackageHtml } from "./namePackageExport";

/** An inert, portable offline snapshot. Rebuild scores and ages at export time;
 * never fetch sources, renew observation dates, or claim account persistence. */
export function exportBrandAssessment(input: BrandIndexInput, domainRows: readonly PackageDomainInput[], language: Language, now: number): string {
  const scope = brandIndexInputSchema.parse(input), result = assessBrandPresence(scope, now);
  const domains = projectBrandDomainEvidence(scope.domains, domainRows, now);
  const evidence = createBrandEvidenceReport([...result.evidence_report.entries, ...domains.entries], now);
  const c = brandIndexCopy[language], ec = brandEvidenceCopy[language], wc = brandWorksheetCopy[language], exportScope = brandChecksCopy[language].exportScope, e = escapePackageHtml;
  const states = ["checked", "reported", "listed", "unknown"] as const;
  const groups = states.map(state => `<section data-evidence-group="${state}"><h3>${e(ec[state])} (${e(evidence.summary[state])})</h3><ul>${evidence.entries.filter(entry => entry.state === state).map(entry => {
    const source = safeBrandEvidenceSourceUrl(entry.source_url);
    const freshness = entry.origin === "user_report" && entry.freshness === "current" ? ec.currentReport : ec.freshness[entry.freshness];
    return `<li data-evidence-entry="${e(entry.id)}" data-evidence-state="${state}"><strong>${e(entry.target)}</strong><p>${e(ec.statements[entry.statement])}</p><p>${e(freshness)}${entry.observed_at ? ` · ${e(entry.origin === "user_report" ? ec.reportedAt : ec.observed)}: <time datetime="${e(entry.observed_at)}">${e(entry.observed_at)}</time>` : ""}${source ? ` · <a href="${e(source)}" rel="noreferrer noopener">${e(ec.source)}</a>` : ""}</p></li>`;
  }).join("") || `<li>${e(ec.empty)}</li>`}</ul></section>`).join("");
  // The existing input/result/evidence contracts form the portable payload.
  // Raw provider responses and account identifiers never enter the document.
  const portable = JSON.stringify({ input: scope, assessment: result, evidence_report: evidence }, null, 2);
  return `<!doctype html><html lang="${e(language)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${e(c.title)} | Sajda</title><style>body{font:16px/1.6 system-ui,sans-serif;max-width:850px;margin:32px auto;padding:0 20px;color:#172033;overflow-wrap:anywhere}h1,h2,h3{line-height:1.25}section{border-top:1px solid #cad4e3;margin-top:24px;padding-top:12px}li{margin:12px 0}a{color:#0756b2}p{max-width:75ch}pre{white-space:pre-wrap;font-size:13px}summary{min-height:44px;cursor:pointer}</style></head><body><h1>${e(c.title)} · Sajda</h1><p><strong>${e(result.brand.name)}</strong> · ${e(result.brand.primary_domain)}</p><p>${e(wc.generatedAt)}: <time datetime="${e(result.generated_at)}">${e(result.generated_at)}</time></p><p>${e(wc.localBoundary)}</p><p data-export-account-history-excluded>${e(exportScope)}</p><p>${e(c.warningBody)}</p><h2>${e(c.reportedScore)}: ${e(result.index.reported_score === null ? c.notEnough : `${result.index.reported_score}/100`)}</h2><p>${e(c.verifiedScore)}: ${e(c.notVerified)}</p><p>${e(c.threshold)}</p><p>${e(c.methodology)}: ${e(result.methodology_version)}</p><h2>${e(ec.title)}</h2><p>${e(evidenceCoverageText(ec, evidence.summary.checked, evidence.summary.total, evidence.summary.checked_coverage_percent))}</p><p>${e(ec.scope)}</p><p>${e(ec.boundary)}</p><p>${e(ec.unknownHelp)}</p>${groups}<details><summary>${e(wc.portableData)}</summary><pre data-portable-brand-assessment>${e(portable)}</pre></details></body></html>`;
}
