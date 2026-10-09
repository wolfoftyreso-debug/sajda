import { z } from "zod/v4";
import { BRAND_REPORT_LIMIT, BRAND_REPORT_VERSION_LIMIT } from "./brand-reports.js";
import { BRAND_CHECK_DOMAIN_LIMIT } from "./brand-checks.js";
import { brandRegistrySourceUrl } from "./brand-evidence.js";
import type { PlanId } from "./plans.js";

/** Scheduled registry observations only: no ownership, price or legal monitoring. */
export const BRAND_MONITOR_INTERVAL_HOURS = 24;
export const BRAND_MONITOR_TICK_LIMIT = 2;
export const BRAND_MONITOR_LEASE_MS = 5 * 60 * 1000;
export const BRAND_MONITOR_ACTIVE_LIMITS: Readonly<Record<PlanId, number>> = { free: 0, basic: 1, premium: 5, trading: 10 };
export const BRAND_MONITOR_METHODOLOGY_VERSION = "sajda.registry-monitor.v1" as const;
const id = z.string().uuid().transform(value => value.toLowerCase());
const storedId = z.string().uuid().regex(/^[a-f0-9-]+$/u);
const reportVersion = z.number().int().min(1).max(BRAND_REPORT_VERSION_LIMIT);
const monitorVersion = z.number().int().min(1).max(10000);
const timestamp = z.string().datetime({ offset: true }).refine(value => Number.isFinite(Date.parse(value)));
const base = { reportId: id, requestKey: id };
export const brandMonitorsMutationSchema = z.discriminatedUnion("action", [
  z.strictObject({ ...base, action: z.literal("enable"), expectedReportVersion: reportVersion, expectedMonitorVersion: z.literal(0) }),
  z.strictObject({ ...base, action: z.literal("pause"), expectedMonitorVersion: monitorVersion }),
  z.strictObject({ ...base, action: z.literal("resume"), expectedMonitorVersion: monitorVersion }),
  z.strictObject({ ...base, action: z.literal("rebind"), expectedReportVersion: reportVersion, expectedMonitorVersion: monitorVersion }),
  z.strictObject({ ...base, action: z.literal("ack"), alertId: id }),
]);
export type BrandMonitorsMutationInput = z.infer<typeof brandMonitorsMutationSchema>;
export const brandMonitorsSelectorSchema = z.strictObject({ reportId: id,
  alertOffset: z.number().int().min(0).max(1999).default(0), alertLimit: z.number().int().min(1).max(20).default(10) });
export type BrandMonitorsSelector = z.infer<typeof brandMonitorsSelectorSchema>;
export const brandMonitorPauseReasonSchema = z.enum(["user", "report_changed", "plan_limit", "history_full"]);
export const brandMonitorSchema = z.strictObject({ reportId: storedId, reportVersion, version: monitorVersion,
  status: z.enum(["active", "paused"]), pauseReason: brandMonitorPauseReasonSchema.nullable(),
  targets: z.array(z.string().min(1).max(253)).min(1).max(BRAND_CHECK_DOMAIN_LIMIT),
  createdAt: timestamp, updatedAt: timestamp, nextDueAt: timestamp.nullable(),
  lastAttemptAt: timestamp.nullable(), lastRunId: storedId.nullable(),
  lastRunStatus: z.enum(["pending", "completed", "failed"]).nullable(),
  lastFailureCode: z.enum(["provider_unavailable", "invalid_evidence", "check_interrupted"]).nullable(),
  lastRunCoverage: z.strictObject({ total: z.number().int().min(1).max(BRAND_CHECK_DOMAIN_LIMIT),
    checked: z.number().int().min(0).max(BRAND_CHECK_DOMAIN_LIMIT), unknown: z.number().int().min(0).max(BRAND_CHECK_DOMAIN_LIMIT) }).nullable(),
  lastSuccessfulAt: timestamp.nullable(), baselineCount: z.number().int().min(0).max(BRAND_CHECK_DOMAIN_LIMIT),
  methodologyVersion: z.literal(BRAND_MONITOR_METHODOLOGY_VERSION),
}).superRefine((monitor, context) => {
  if (new Set(monitor.targets).size !== monitor.targets.length
    || monitor.status === "active" && (monitor.pauseReason !== null || monitor.nextDueAt === null)
    || monitor.status === "paused" && (monitor.pauseReason === null || monitor.nextDueAt !== null)
    || (monitor.lastAttemptAt === null) !== (monitor.lastRunId === null)
    || (monitor.lastRunId === null) !== (monitor.lastRunStatus === null)
    || monitor.lastRunStatus !== "failed" && monitor.lastFailureCode !== null
    || monitor.lastRunStatus === "failed" && monitor.lastFailureCode === null
    || (monitor.lastRunStatus === "completed") !== (monitor.lastRunCoverage !== null)
    || monitor.lastRunCoverage !== null && (monitor.lastRunCoverage.total !== monitor.targets.length
      || monitor.lastRunCoverage.checked + monitor.lastRunCoverage.unknown !== monitor.lastRunCoverage.total)
    || Date.parse(monitor.updatedAt) < Date.parse(monitor.createdAt)) {
    context.addIssue({ code: "custom", message: "Monitor state, schedule and archived attempt must agree." });
  }
});
export type BrandMonitor = z.infer<typeof brandMonitorSchema>;
export const brandMonitorObservationSchema = z.strictObject({ status: z.enum(["available", "registered"]),
  observedAt: timestamp, sourceUrl: z.string().url().max(2000) });
export const brandMonitorAlertSchema = z.strictObject({ id: storedId, reportId: storedId, reportVersion,
  monitorVersion, runId: storedId, target: z.string().min(1).max(253), kind: z.literal("registration_changed"),
  previous: brandMonitorObservationSchema, current: brandMonitorObservationSchema,
  createdAt: timestamp, acknowledgedAt: timestamp.nullable(), methodologyVersion: z.literal(BRAND_MONITOR_METHODOLOGY_VERSION),
}).superRefine((alert, context) => {
  if (alert.previous.status === alert.current.status || alert.previous.sourceUrl !== alert.current.sourceUrl
    || brandRegistrySourceUrl(alert.target, alert.current.sourceUrl, "rdap") !== alert.current.sourceUrl
    || Date.parse(alert.current.observedAt) <= Date.parse(alert.previous.observedAt)
    || Date.parse(alert.createdAt) < Date.parse(alert.current.observedAt)
    || alert.acknowledgedAt !== null && Date.parse(alert.acknowledgedAt) < Date.parse(alert.createdAt)) {
    context.addIssue({ code: "custom", message: "An alert requires a newer definitive observation compared with an earlier baseline from the same audited source and target." });
  }
});
export type BrandMonitorAlert = z.infer<typeof brandMonitorAlertSchema>;
const envelope = { accountId: z.string().min(1).max(200), requestId: z.string().min(1).max(100) };
export const brandMonitorsResponseSchema = z.strictObject({ ...envelope, monitor: brandMonitorSchema.nullable(),
  currentPlan: z.enum(["free", "basic", "premium", "trading"]),
  capacity: z.strictObject({ active: z.number().int().min(0).max(BRAND_REPORT_LIMIT), limit: z.number().int().min(0).max(10) }),
  intervalHours: z.literal(BRAND_MONITOR_INTERVAL_HOURS), cronScheduled: z.boolean(),
  alerts: z.array(brandMonitorAlertSchema).max(20), total: z.number().int().min(0).max(2000),
  alertOffset: z.number().int().min(0).max(1999), alertLimit: z.number().int().min(1).max(20), hasMore: z.boolean(),
}).superRefine((page, context) => {
  if (page.capacity.limit !== BRAND_MONITOR_ACTIVE_LIMITS[page.currentPlan]
    || page.alerts.length !== Math.min(page.alertLimit, Math.max(0, page.total - page.alertOffset))
    || page.hasMore !== (page.alertOffset + page.alerts.length < page.total)
    || new Set(page.alerts.map(alert => alert.id)).size !== page.alerts.length
    || page.monitor && page.alerts.some(alert => alert.reportId !== page.monitor!.reportId)) {
    context.addIssue({ code: "custom", message: "Monitor capacity and alert pagination must match the retained account scope." });
  }
});
export const brandMonitorMutationResponseSchema = z.strictObject({ ...envelope,
  monitor: brandMonitorSchema, acknowledgedAlert: brandMonitorAlertSchema.nullable() });
