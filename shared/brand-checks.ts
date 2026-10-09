import { z } from "zod/v4";
import { brandEvidenceEntrySchema, brandRegistrySourceUrl } from "./brand-evidence.js";
import { BRAND_REPORT_VERSION_LIMIT } from "./brand-reports.js";

/** Registry snapshots are separate from account-holder declarations and scores. */
export const BRAND_CHECK_RUN_LIMIT = 100;
export const BRAND_CHECK_DAILY_LIMIT = 10;
export const BRAND_CHECK_DOMAIN_LIMIT = 20;
export const BRAND_CHECK_PENDING_LEASE_MS = 5 * 60 * 1000;
export const BRAND_CHECK_METHODOLOGY_VERSION = "sajda.registry-observation.v1" as const;
const id = z.string().uuid().transform(value => value.toLowerCase());
const storedId = z.string().uuid().regex(/^[a-f0-9-]+$/u);
const version = z.number().int().min(1).max(BRAND_REPORT_VERSION_LIMIT);
const timestamp = z.string().datetime({ offset: true }).refine(value => Number.isFinite(Date.parse(value)));
export const brandChecksStartSchema = z.strictObject({ reportId: id, expectedVersion: version, requestKey: id });
export type BrandChecksStartInput = z.infer<typeof brandChecksStartSchema>;
export const brandChecksHistorySelectorSchema = z.strictObject({ reportId: id, version: version.optional(),
  offset: z.number().int().min(0).max(99).default(0), limit: z.number().int().min(1).max(20).default(10) });
export type BrandChecksHistorySelector = z.infer<typeof brandChecksHistorySelectorSchema>;
export const brandCheckEntrySchema = brandEvidenceEntrySchema.superRefine((entry, context) => {
  if (entry.kind !== "domain" || entry.id !== `check:domain:${entry.target}`
    || !["checked", "unknown"].includes(entry.state) || !["provider_observation", "none"].includes(entry.origin)
    || !["domain_available", "domain_registered", "domain_check_unavailable"].includes(entry.statement)
    || entry.source_url !== null && brandRegistrySourceUrl(entry.target, entry.source_url, "rdap") !== entry.source_url
    || entry.state === "checked" && (entry.origin !== "provider_observation" || entry.source_url === null)) {
    context.addIssue({ code: "custom", message: "A registry check must retain only the exact audited domain observation." });
  }
});
export const brandCheckFailureCodeSchema = z.enum(["provider_unavailable", "invalid_evidence", "check_interrupted"]);
export const brandCheckRunSchema = z.strictObject({
  id: storedId, reportId: storedId, reportVersion: version, status: z.enum(["pending", "completed", "failed"]),
  requestedAt: timestamp, completedAt: timestamp.nullable(), methodologyVersion: z.literal(BRAND_CHECK_METHODOLOGY_VERSION),
  entries: z.array(brandCheckEntrySchema).max(BRAND_CHECK_DOMAIN_LIMIT), failureCode: brandCheckFailureCodeSchema.nullable(),
}).superRefine((run, context) => {
  if (new Set(run.entries.map(entry => entry.target)).size !== run.entries.length
    || run.status === "pending" && (run.completedAt !== null || run.failureCode !== null || run.entries.length !== 0)
    || run.status === "failed" && (run.completedAt === null || run.failureCode === null || run.entries.length !== 0)
    || run.status === "completed" && (run.completedAt === null || run.failureCode !== null || run.entries.length === 0)
    || run.completedAt !== null && Date.parse(run.completedAt) < Date.parse(run.requestedAt)) {
    context.addIssue({ code: "custom", message: "Registry run state and retained observations must agree." });
  }
});
export type BrandCheckRun = z.infer<typeof brandCheckRunSchema>;
const accountId = z.string().min(1).max(200), requestId = z.string().min(1).max(100);
export const brandCheckResponseSchema = z.strictObject({ accountId, run: brandCheckRunSchema, requestId });
export const brandChecksHistoryResponseSchema = z.strictObject({ accountId, runs: z.array(brandCheckRunSchema).max(20),
  total: z.number().int().min(0).max(BRAND_CHECK_RUN_LIMIT), offset: z.number().int().min(0).max(99),
  limit: z.number().int().min(1).max(20), hasMore: z.boolean(), requestId,
}).superRefine((page, context) => {
  if (page.runs.length !== Math.min(page.limit, Math.max(0, page.total - page.offset))
    || page.hasMore !== (page.offset + page.runs.length < page.total)
    || new Set(page.runs.map(run => run.id)).size !== page.runs.length) {
    context.addIssue({ code: "custom", message: "Registry history pagination must describe the complete retained scope." });
  }
});
