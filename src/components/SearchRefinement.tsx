import { useId, useRef, useState } from "react";
import { Check, LoaderCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Language } from "@/i18n/LanguageProvider";
import { refinementText, searchRefinementCopy } from "@/i18n/searchRefinementCopy";
import { buildSearchRefinement, normalizeRefinementNames, REFINEMENT_REASONS } from "@/lib/searchRefinement";
import { cn } from "@/lib/utils";
import type { RefinementReason, SearchRefinement as SearchRefinementPayload } from "../../shared/search-refinement";

export interface SearchRefinementProps {
  language: Language;
  /** Up to 50 names from this result set, never a user's saved-domain list. */
  previousNames: readonly string[];
  /** The currently visible results the reader can choose as naming references. */
  candidateNames: readonly string[];
  busy?: boolean;
  disabled?: boolean;
  /** A localized explanation supplied by the existing access/consent boundary. */
  unavailableReason?: string;
  /** Called only by explicit submit. Keep existing quota and AI-consent checks. */
  onRefine: (refinement: SearchRefinementPayload) => void | Promise<void>;
  className?: string;
}

/**
 * Ephemeral feedback, not saving or monitoring. No network or storage access.
 * Mount with key={resultSetId} so a newly completed search starts clean.
 */
export default function SearchRefinement({
  language, previousNames, candidateNames, busy = false, disabled = false,
  unavailableReason, onRefine, className,
}: SearchRefinementProps) {
  const copy = searchRefinementCopy[language];
  const id = useId();
  const [reasons, setReasons] = useState<RefinementReason[]>([]);
  const [likedNames, setLikedNames] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);
  const pending = useRef(false);
  const previous = normalizeRefinementNames(previousNames);
  const candidates = normalizeRefinementNames(candidateNames).filter(name => previous.includes(name));
  const selectedNames = likedNames.filter(name => previous.includes(name));
  const refinement = buildSearchRefinement(previous, reasons, selectedNames);
  const locked = busy || submitting || disabled;

  if (!previous.length) return null;

  const toggleReason = (reason: RefinementReason) => {
    if (locked || pending.current) return;
    setFailed(false);
    setReasons(current => current.includes(reason) ? current.filter(value => value !== reason) : [...current, reason]);
  };
  const toggleName = (name: string) => {
    if (locked || pending.current) return;
    setFailed(false);
    setLikedNames(current => {
      const active = current.filter(value => previous.includes(value));
      return active.includes(name) ? active.filter(value => value !== name)
        : active.length < 5 ? [...active, name] : active;
    });
  };
  const submit = async () => {
    if (locked || pending.current || !refinement) return;
    pending.current = true;
    setSubmitting(true);
    setFailed(false);
    try {
      await onRefine(refinement);
    } catch {
      // Backend errors may contain internal details. Keep the user's choices
      // and expose one actionable, localized recovery message instead.
      setFailed(true);
    } finally {
      pending.current = false;
      setSubmitting(false);
    }
  };

  return (
    <section className={cn("min-w-0 rounded-2xl border border-border bg-card p-4 sm:p-5", className)}
      aria-labelledby={`${id}-title`} aria-busy={busy || submitting}>
      <h3 id={`${id}-title`} className="text-lg font-semibold tracking-tight text-foreground">{copy.title}</h3>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{copy.lead}</p>
      <fieldset disabled={locked} className="mt-3 min-w-0">
        <legend className="sr-only">{copy.reasonsLabel}</legend>
        <div className="flex flex-wrap gap-2">
          {REFINEMENT_REASONS.map(reason => (
            <Button key={reason} type="button" variant="outline" aria-pressed={reasons.includes(reason)}
              onClick={() => toggleReason(reason)} disabled={locked}
              className={cn("h-auto min-h-11 min-w-11 whitespace-normal px-3 py-2 text-left",
                reasons.includes(reason) && "border-primary bg-primary/10 text-primary")}>
              {reasons.includes(reason) && <Check aria-hidden="true" className="h-4 w-4 shrink-0" />}
              {copy.reasons[reason]}
            </Button>
          ))}
        </div>
      </fieldset>
      {candidates.length > 0 && (
        <details className="mt-3 min-w-0 border-t border-border pt-1">
          <summary className="min-h-11 cursor-pointer rounded-lg py-3 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            {copy.namesSummary}
            {selectedNames.length > 0 && <span className="ml-2 text-xs font-normal text-muted-foreground">{refinementText(copy.selectedNames, { count: selectedNames.length })}</span>}
          </summary>
          <p id={`${id}-names-hint`} className="mb-3 text-sm leading-6 text-muted-foreground">{copy.namesHint}</p>
          <fieldset disabled={locked} aria-describedby={`${id}-names-hint ${id}-selection`} className="min-w-0">
            <legend className="sr-only">{copy.namesSummary}</legend>
            <div className="flex flex-wrap gap-2">
              {candidates.map(name => {
                const selected = selectedNames.includes(name);
                return <Button key={name} type="button" variant="outline" aria-pressed={selected}
                  disabled={locked || (!selected && selectedNames.length >= 5)} onClick={() => toggleName(name)}
                  className={cn("h-auto min-h-11 min-w-11 max-w-full whitespace-normal break-all px-3 py-2 text-left",
                    selected && "border-primary bg-primary/10 text-primary")}>
                  {selected && <Check aria-hidden="true" className="h-4 w-4 shrink-0" />}{name}
                </Button>;
              })}
            </div>
          </fieldset>
          <p id={`${id}-selection`} role="status" className="mt-2 text-xs leading-5 text-muted-foreground">
            {selectedNames.length >= 5 ? copy.selectedLimit : refinementText(copy.selectedNames, { count: selectedNames.length })}
          </p>
        </details>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button type="button" onClick={() => { void submit(); }} disabled={locked || !refinement}
          aria-describedby={`${id}-request${unavailableReason ? ` ${id}-unavailable` : ""}`}
          className="h-auto min-h-11 min-w-11 w-full whitespace-normal px-4 py-3 sm:w-auto">
          {busy || submitting ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <RefreshCw aria-hidden="true" className="h-4 w-4" />}
          {busy || submitting ? copy.submitting : copy.submit}
        </Button>
        {refinement && <Button type="button" variant="ghost" disabled={locked}
          className="h-auto min-h-11 min-w-11 whitespace-normal px-3 py-2"
          onClick={() => { if (pending.current || locked) return; setReasons([]); setLikedNames([]); setFailed(false); }}>
          {copy.clear}
        </Button>}
      </div>
      <p id={`${id}-request`} className="mt-2 text-xs leading-5 text-muted-foreground">{refinement ? copy.requestNote : copy.chooseFeedback}</p>
      {unavailableReason && <p id={`${id}-unavailable`} className="mt-2 text-sm leading-6 text-muted-foreground">{unavailableReason}</p>}
      {failed && <p role="alert" className="mt-3 text-sm leading-6 text-destructive">{copy.failed}</p>}
    </section>
  );
}
