import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { brandMonitorsCopy } from "@/i18n/brandMonitorsCopy";
import type { Language } from "@/i18n/languagePreference";
import { BrandMonitorsError, brandMonitorFailureIsUncertain, changeBrandMonitor, getBrandMonitors } from "@/lib/brandMonitorsClient";
import { formatLocalizedDateTime, formatLocalizedNumber } from "@/lib/localeFormat";
import type { BrandMonitorsMutationInput, BrandMonitorAlert } from "../../shared/brand-monitors";

const actionClass = "h-auto min-h-12 max-w-full whitespace-normal px-4 py-3 text-left leading-6";
type State = Awaited<ReturnType<typeof getBrandMonitors>>;
export type BrandReportMonitoringProps = {
  ownerId: string; reportId: string; reportVersion: number; historical: boolean; latest: boolean; clean: boolean; blocked: boolean;
  language: Language; now: number; onUnsettledChange: (value: boolean) => void;
};

/** Account-owned daily registry observations. Reads never start provider work;
 * unresolved writes retain their exact idempotency key until a receipt arrives. */
export default function BrandReportMonitoring({ ownerId, reportId, reportVersion, historical, latest, clean, blocked, language, now, onUnsettledChange }: BrandReportMonitoringProps) {
  const c = brandMonitorsCopy[language], headingId = useId(), alertsId = useId();
  const [state, setState] = useState<State | null>(null), [loaded, setLoaded] = useState(false), [reading, setReading] = useState(false), [writing, setWriting] = useState(false);
  const [uncertain, setUncertain] = useState(false), [readError, setReadError] = useState<BrandMonitorsError["code"] | null>(null), [writeError, setWriteError] = useState<BrandMonitorsError["code"] | null>(null);
  const [notice, setNotice] = useState<"saved" | "acknowledged" | null>(null);
  const alive = useRef(true), readRequest = useRef<AbortController | null>(null), writeRequest = useRef<AbortController | null>(null);
  const originalRequest = useRef<BrandMonitorsMutationInput | null>(null), refreshRef = useRef<(offset?: number) => Promise<void>>(async () => {});
  const monitor = state?.monitor ?? null, capacityAvailable = !!state && state.capacity.active < state.capacity.limit;
  const configAllowed = loaded && !readError && !historical && latest && clean && !blocked && !writing && !reading && !uncertain;
  const stopAllowed = loaded && !readError && !blocked && !writing && !reading && !uncertain && monitor?.status === "active";
  const canEnable = configAllowed && !monitor && capacityAvailable;
  const canResume = configAllowed && monitor?.status === "paused" && monitor.reportVersion === reportVersion && capacityAvailable && monitor.pauseReason !== "history_full";
  const canRebind = configAllowed && !!monitor && monitor.reportVersion !== reportVersion && (monitor.status === "active" || capacityAvailable);

  async function refresh(offset = 0) {
    readRequest.current?.abort();
    const controller = new AbortController(); readRequest.current = controller; setReading(true); setReadError(null);
    try {
      const value = await getBrandMonitors({ accountId: ownerId, signal: controller.signal }, { reportId, alertOffset: offset, alertLimit: 20 });
      if (controller.signal.aborted || !alive.current || readRequest.current !== controller) return;
      setState(value); setLoaded(true);
      // Reading current state cannot prove which ambiguous request committed.
      // Only replaying the original request can supply that immutable receipt.
    } catch (error) { if (!controller.signal.aborted && alive.current) setReadError(error instanceof BrandMonitorsError ? error.code : "unavailable"); }
    finally { if (readRequest.current === controller) { readRequest.current = null; if (alive.current) setReading(false); } }
  }
  refreshRef.current = refresh;
  useEffect(() => {
    alive.current = true; void refreshRef.current(0);
    return () => { alive.current = false; readRequest.current?.abort(); writeRequest.current?.abort(); originalRequest.current = null; onUnsettledChange(false); };
  }, [ownerId, reportId, reportVersion, onUnsettledChange]);
  useEffect(() => { onUnsettledChange(writing || uncertain); }, [writing, uncertain, onUnsettledChange]);

  async function mutate(kind: BrandMonitorsMutationInput["action"], alertId?: string) {
    if (writeRequest.current || readRequest.current || reading || blocked) return;
    let input = originalRequest.current;
    if (!input) {
      if (uncertain || !state || !loaded || readError) return;
      const base = { reportId, requestKey: crypto.randomUUID() };
      if (kind === "enable") { if (!canEnable) return; input = { ...base, action: kind, expectedReportVersion: reportVersion, expectedMonitorVersion: 0 }; }
      else if (kind === "pause") { if (!stopAllowed || !monitor) return; input = { ...base, action: kind, expectedMonitorVersion: monitor.version }; }
      else if (kind === "resume") { if (!canResume || !monitor) return; input = { ...base, action: kind, expectedMonitorVersion: monitor.version }; }
      else if (kind === "rebind") { if (!canRebind || !monitor) return; input = { ...base, action: kind, expectedReportVersion: reportVersion, expectedMonitorVersion: monitor.version }; }
      else { if (!alertId || !state.alerts.some(alert => alert.id === alertId && alert.acknowledgedAt === null)) return; input = { ...base, action: kind, alertId }; }
    }
    originalRequest.current = input;
    const controller = new AbortController(); writeRequest.current = controller; setWriting(true); setWriteError(null); setNotice(null); onUnsettledChange(true);
    try {
      const value = await changeBrandMonitor({ accountId: ownerId, signal: controller.signal }, input);
      if (controller.signal.aborted || !alive.current || writeRequest.current !== controller) return;
      originalRequest.current = null; setUncertain(false); setNotice(input.action === "ack" ? "acknowledged" : "saved"); setLoaded(false);
      // Receipts can describe an earlier revision after an exact replay. Never
      // replace current data with that old snapshot; perform a canonical GET.
      if (value.acknowledgedAlert) setState(previous => previous ? { ...previous, alerts: previous.alerts.map(alert => alert.id === value.acknowledgedAlert!.id ? value.acknowledgedAlert! : alert) } : previous);
      void refreshRef.current(state?.alertOffset ?? 0);
    } catch (error) {
      if (controller.signal.aborted || !alive.current) return;
      const unknown = brandMonitorFailureIsUncertain(error); setUncertain(unknown); if (!unknown) originalRequest.current = null;
      const code = error instanceof BrandMonitorsError ? error.code : "unavailable"; setWriteError(code);
      if (!unknown && code === "conflict") { setLoaded(false); void refreshRef.current(state?.alertOffset ?? 0); }
    } finally { if (writeRequest.current === controller) { writeRequest.current = null; if (alive.current) setWriting(false); } }
  }
  const alertRows = state?.alerts ?? [];
  return <section className="min-w-0 rounded-2xl border border-primary/25 bg-card p-5" aria-labelledby={headingId} data-brand-monitoring>
    <h3 id={headingId} className="text-lg font-semibold leading-7">{c.title}</h3>
    <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{c.help}</p>
    <p className="mt-2 max-w-3xl text-xs leading-5 text-muted-foreground" data-brand-monitor-limits>{c.limits}</p>
    {historical ? <p className="mt-3 text-sm leading-6">{c.historical}</p> : !latest ? <p className="mt-3 text-sm leading-6">{c.notLatest}</p> : !clean ? <p className="mt-3 text-sm leading-6">{c.dirty}</p> : null}
    {state && <>
      <dl className="mt-4 grid min-w-0 gap-3 rounded-xl border border-border p-3 sm:grid-cols-3" data-brand-monitor-capacity>
        <div className="min-w-0"><dt className="text-xs leading-5 text-muted-foreground">{c.plan}</dt><dd className="mt-1 font-semibold">{c[state.currentPlan]}</dd></div>
        <div className="min-w-0"><dt className="text-xs leading-5 text-muted-foreground">{c.used}</dt><dd className="mt-1 font-semibold tabular-nums">{formatLocalizedNumber(state.capacity.active, language)}</dd></div>
        <div className="min-w-0"><dt className="text-xs leading-5 text-muted-foreground">{c.limit}</dt><dd className="mt-1 font-semibold tabular-nums">{formatLocalizedNumber(state.capacity.limit, language)}</dd></div>
      </dl>
      {!state.cronScheduled && <p role="status" className="mt-3 rounded-xl border border-border p-3 text-sm leading-6" data-brand-monitor-scheduler-off>{c.scheduleOff}</p>}
      {state.capacity.limit === 0 ? <p className="mt-3 text-sm leading-6">{c.noAllowance}</p> : !capacityAvailable && monitor?.status !== "active" ? <p className="mt-3 text-sm leading-6">{c.capacity}</p> : null}
    </>}
    {uncertain && <p role="alert" className="mt-3 text-sm leading-6">{c.uncertain}</p>}
    <div className="mt-4 flex flex-wrap gap-3">
      {uncertain ? <Button type="button" className={actionClass} data-brand-monitor-retry disabled={writing || reading || blocked} onClick={() => { if (originalRequest.current) void mutate(originalRequest.current.action); }}>{writing ? c.updating : c.retry}</Button>
        : <>
          {monitor?.status === "active" ? <Button type="button" variant="outline" className={actionClass} data-brand-monitor-pause disabled={!stopAllowed} onClick={() => void mutate("pause")}>{writing ? c.updating : c.pause}</Button>
            : !historical && (!monitor ? <Button type="button" className={actionClass} data-brand-monitor-enable disabled={!canEnable} onClick={() => void mutate("enable")}>{writing ? c.updating : c.enable}</Button>
              : <Button type="button" className={actionClass} data-brand-monitor-resume disabled={!canResume} onClick={() => void mutate("resume")}>{writing ? c.updating : c.resume}</Button>)}
          {!historical && monitor && monitor.reportVersion !== reportVersion && <Button type="button" className={actionClass} data-brand-monitor-rebind disabled={!canRebind} onClick={() => void mutate("rebind")}>{writing ? c.updating : c.rebind}</Button>}
        </>}
      <Button type="button" variant="outline" className={actionClass} data-brand-monitor-refresh disabled={reading || writing} onClick={() => void refresh(0)}>{reading ? c.loading : c.refresh}</Button>
    </div>
    {readError && <p role="alert" className="mt-3 text-sm leading-6">{c[readError]}</p>}
    {writeError && <p role="alert" className="mt-3 text-sm leading-6">{c[writeError]}</p>}
    {notice && <p role="status" className="mt-3 text-sm leading-6">{c[notice]}</p>}
    {loaded && !monitor ? <p className="mt-3 text-sm leading-6 text-muted-foreground">{c.empty}</p> : null}
    {monitor && <section className="mt-4 min-w-0 border-t border-border pt-4" data-brand-monitor-status={monitor.status} aria-label={c.status}>
      <p className="text-sm font-semibold">{c.status}: {c[monitor.status]}</p>
      {monitor.pauseReason && <p className="mt-2 text-sm leading-6">{c[monitor.pauseReason]}</p>}
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{c.scopeVersion}: {monitor.reportVersion} · {c.currentVersion}: {reportVersion}</p>
      {monitor.reportVersion !== reportVersion && <p className="mt-2 text-sm leading-6">{c.scopeDifferent}</p>}
      <p className="mt-3 text-sm font-semibold">{c.scope}</p><ul className="mt-1 space-y-1">{monitor.targets.map(target => <li key={target} className="break-all text-sm leading-6">{target}</li>)}</ul>
      <dl className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
        {monitor.nextDueAt && <div className="min-w-0"><dt className="text-xs leading-5 text-muted-foreground">{c.nextDue}</dt><dd className="mt-1 text-sm leading-6"><time data-brand-monitor-next-due dateTime={monitor.nextDueAt}>{formatLocalizedDateTime(monitor.nextDueAt, language)}</time>{state?.cronScheduled && Date.parse(monitor.nextDueAt) < now && <span className="mt-1 block text-xs">{c.overdue}</span>}</dd></div>}
        {monitor.lastAttemptAt && <div className="min-w-0"><dt className="text-xs leading-5 text-muted-foreground">{c.lastAttempt}</dt><dd className="mt-1 text-sm leading-6"><time data-brand-monitor-last-attempt dateTime={monitor.lastAttemptAt}>{formatLocalizedDateTime(monitor.lastAttemptAt, language)}</time>{monitor.lastRunStatus && <span className="mt-1 block">{c[monitor.lastRunStatus]}</span>}</dd></div>}
        {monitor.lastSuccessfulAt && <div className="min-w-0"><dt className="text-xs leading-5 text-muted-foreground">{c.lastSuccess}</dt><dd className="mt-1 text-sm leading-6"><time data-brand-monitor-last-success dateTime={monitor.lastSuccessfulAt}>{formatLocalizedDateTime(monitor.lastSuccessfulAt, language)}</time></dd></div>}
        <div className="min-w-0"><dt className="text-xs leading-5 text-muted-foreground">{c.baseline}</dt><dd className="mt-1 text-sm tabular-nums">{monitor.baselineCount} / {monitor.targets.length}</dd></div>
      </dl>
      {monitor.lastRunCoverage && <p className="mt-3 text-sm leading-6" data-brand-monitor-coverage>{c.checked}: {monitor.lastRunCoverage.checked} / {monitor.lastRunCoverage.total} · {c.unknownDomains}: {monitor.lastRunCoverage.unknown}</p>}
      {!monitor.lastRunStatus && <p className="mt-3 text-sm leading-6">{c.noAttempt}</p>}
      <p className="mt-3 text-xs leading-5 text-muted-foreground">{c.everyDay}</p>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{c.unknownHelp}</p>
    </section>}
    {state && <section className="mt-5 min-w-0 border-t border-border pt-4" aria-labelledby={alertsId} data-brand-monitor-alerts>
      <h4 id={alertsId} className="text-base font-semibold leading-6">{c.alerts}</h4><p className="mt-2 text-sm leading-6 text-muted-foreground">{c.alertsHelp}</p>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{c.total}: {state.total} · {c.page} {Math.floor(state.alertOffset / 20) + 1}</p>
      {alertRows.length ? <ul className="mt-3 space-y-3">{alertRows.map(alert => <li key={alert.id} className="min-w-0 rounded-xl border border-border p-3" data-brand-monitor-alert={alert.id} data-brand-alert-read={alert.acknowledgedAt !== null}>
        <p className="break-all text-sm font-semibold">{alert.target}</p><p className="mt-1 text-xs leading-5">{alert.acknowledgedAt ? c.read : c.unread} · {c.scopeVersion}: {alert.reportVersion}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{c.recorded}: <time dateTime={alert.createdAt}>{formatLocalizedDateTime(alert.createdAt, language)}</time></p>
        <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2"><AlertObservation value={alert.previous} label={c.before} language={language} /><AlertObservation value={alert.current} label={c.after} language={language} /></div>
        {!alert.acknowledgedAt && <Button type="button" variant="outline" className={`${actionClass} mt-3`} data-brand-alert-ack={alert.id} disabled={writing || reading || uncertain || !!readError || !loaded || blocked} onClick={() => void mutate("ack", alert.id)}>{c.markRead}</Button>}
      </li>)}</ul> : <p className="mt-3 text-sm leading-6 text-muted-foreground">{c.noAlerts}</p>}
      {state.total > 20 || state.alertOffset > 0 ? <div className="mt-3 flex flex-wrap gap-3"><Button type="button" variant="outline" className={actionClass} data-brand-alert-previous disabled={reading || writing || state.alertOffset === 0} onClick={() => void refresh(Math.max(0, state.alertOffset - 20))}>{c.previous}</Button><Button type="button" variant="outline" className={actionClass} data-brand-alert-next disabled={reading || writing || !state.hasMore} onClick={() => void refresh(state.alertOffset + 20)}>{c.next}</Button></div> : null}
    </section>}
  </section>;
}

function AlertObservation({ value, label, language }: { value: BrandMonitorAlert["current"]; label: string; language: Language }) {
  const c = brandMonitorsCopy[language];
  return <div className="min-w-0 rounded-lg border border-border p-3"><p className="text-xs font-medium leading-5">{label}</p><p className="mt-1 text-sm font-semibold leading-6">{c[value.status]}</p>
    <p className="mt-1 text-xs leading-5 text-muted-foreground">{c.observed}: <time dateTime={value.observedAt}>{formatLocalizedDateTime(value.observedAt, language)}</time></p>
    <a href={value.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex min-h-11 max-w-full items-center break-words text-xs text-primary underline underline-offset-4">{c.source}</a>
  </div>;
}
