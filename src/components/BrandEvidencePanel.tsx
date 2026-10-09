import { useId } from "react";
import type { BrandEvidenceReport } from "../../shared/brand-evidence";
import { safeBrandEvidenceSourceUrl } from "../../shared/brand-evidence";
import type { Language } from "@/i18n/languagePreference";
import { brandEvidenceCopy, evidenceCoverageText } from "@/i18n/brandEvidenceCopy";
import { formatLocalizedDateTime, formatLocalizedNumber } from "@/lib/localeFormat";

const states = ["checked", "reported", "listed", "unknown"] as const;

/** A shared, read-only evidence view. Scores and provider calls live elsewhere;
 * this panel cannot turn a report or a public-source listing into a check. */
export function BrandEvidencePanel({ report, language, compact = false, headingLevel = "h3" }: {
  report: BrandEvidenceReport;
  language: Language;
  compact?: boolean;
  headingLevel?: "h3" | "h4" | "h5";
}) {
  const c = brandEvidenceCopy[language], titleId = useId(), Heading = headingLevel;
  return <section data-brand-evidence aria-labelledby={titleId} className={`min-w-0 rounded-xl border border-border bg-background ${compact ? "mt-4 p-3" : "my-5 p-4 sm:p-5"}`}>
    <Heading id={titleId} className="text-base font-semibold leading-6">{c.title}</Heading>
    <dl className="mt-3 grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-4">{states.map(state =>
      <div key={state} data-evidence-count={state} className="min-w-0 rounded-lg border border-border px-3 py-2">
        <dt className="break-words text-xs leading-5 text-muted-foreground">{c[state]}</dt>
        <dd className="mt-1 text-xl font-semibold tabular-nums">{formatLocalizedNumber(report.summary[state], language)}</dd>
      </div>)}</dl>
    <p data-evidence-coverage className="mt-3 text-sm leading-6">{evidenceCoverageText(c, report.summary.checked, report.summary.total, report.summary.checked_coverage_percent)}</p>
    <p data-evidence-scope className="mt-1 text-xs leading-5 text-muted-foreground">{c.scope}</p>
    <p data-evidence-boundary className="mt-2 text-xs leading-5 text-muted-foreground">{c.boundary}</p>
    <details className="mt-3 border-t border-border pt-2">
      <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-primary focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{c.details}</summary>
      <p className="mb-4 text-sm leading-6 text-muted-foreground">{c.unknownHelp}</p>
      <div className="space-y-5">{states.map(state => {
        const entries = report.entries.filter(entry => entry.state === state);
        return <section key={state} data-evidence-group={state} aria-label={c[state]}>
          <p className="text-sm font-semibold">{c[state]} · {formatLocalizedNumber(entries.length, language)}</p>
          {entries.length ? <ul className="mt-2 divide-y divide-border">{entries.map(entry => {
            const source = safeBrandEvidenceSourceUrl(entry.source_url);
            return <li key={entry.id} data-evidence-entry={entry.id} data-evidence-state={state} className="min-w-0 py-3">
              <p className="break-all text-sm font-semibold">{entry.target}</p>
              <p className="mt-1 break-words text-sm leading-6">{c.statements[entry.statement]}</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-5 text-muted-foreground">
                <span data-evidence-freshness={entry.freshness}>{entry.freshness === "current" && entry.origin === "source_assertion" ? c.currentSource : entry.freshness === "current" && entry.origin === "user_report" ? c.currentReport : c.freshness[entry.freshness]}</span>
                {entry.observed_at ? <span>{entry.origin === "user_report" ? c.reportedAt : entry.origin === "source_assertion" ? c.sourceRetrieved : c.observed}: <time dateTime={entry.observed_at}>{formatLocalizedDateTime(entry.observed_at, language)}</time></span> : null}
                {source ? <a href={source} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 max-w-full items-center text-primary underline underline-offset-4">{c.source}</a> : null}
              </div>
            </li>;
          })}</ul> : <p className="mt-2 text-xs leading-5 text-muted-foreground">{c.empty}</p>}
        </section>;
      })}</div>
    </details>
  </section>;
}

export default BrandEvidencePanel;
