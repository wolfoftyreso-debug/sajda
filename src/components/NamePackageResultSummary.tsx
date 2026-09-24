import React from "react";
import type { Language } from "../i18n/LanguageProvider";
import { namePackageResultCopy, packageResultText } from "../i18n/namePackageResultCopy";
import { NAME_PACKAGE_LIMIT, type NamePackage } from "../../shared/name-packages";
import { summarizePackageResults } from "../lib/namePackageResultSummary";

export default function NamePackageResultSummary({ packages, language, generatedSearch, requiredTlds, onEditSearch }: {
  packages: readonly NamePackage[]; language: Language; generatedSearch: boolean; requiredTlds?: readonly string[]; onEditSearch: () => void;
}): React.ReactElement {
  const c = namePackageResultCopy[language];
  const counts = summarizePackageResults(packages, requiredTlds);
  const partial = generatedSearch && counts.count < NAME_PACKAGE_LIMIT;
  const values = { ...counts, target: NAME_PACKAGE_LIMIT };
  return <section className="mb-5 rounded-xl border border-primary/20 bg-primary/5 p-4 sm:p-5" aria-label={packageResultText(c.count, values)} data-package-result-summary>
    <p className="text-lg font-semibold" role="status">{packageResultText(generatedSearch ? c.targetCount : c.count, values)}</p>
    {partial && <p className="mt-2 max-w-3xl text-sm leading-6">{packageResultText(c.partial, values)}</p>}
    <p className="mt-3 text-sm font-medium leading-6">{packageResultText(c.availability, values)}</p>
    {(counts.registered > 0 || counts.unconfirmed > 0) && <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-muted-foreground">
      {counts.registered > 0 && <li>{packageResultText(c.taken, { count: counts.registered })}</li>}
      {counts.unconfirmed > 0 && <li>{packageResultText(c.unknown, { count: counts.unconfirmed })}</li>}
    </ul>}
    <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{c.boundaries}</p>
    {(partial || counts.available < counts.count) && <button type="button" className="mt-3 min-h-11 text-left text-sm font-semibold text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={onEditSearch}>{c.adjust}</button>}
  </section>;
}
