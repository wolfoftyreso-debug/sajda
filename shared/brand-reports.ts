import { z } from "zod/v4";
import { assessBrandPresence, brandIndexInputSchema, brandIndexResultSchema } from "./brand-presence-index.js";

/** Saved reports retain user declarations. Saving is not a new source check. */
export const BRAND_REPORT_LIMIT = 50;
export const BRAND_REPORT_VERSION_LIMIT = 100;
export const BRAND_REPORT_MAX_BYTES = 65_536;
const id = z.string().uuid().transform(value => value.toLowerCase());
const storedId = z.string().uuid().regex(/^[a-f0-9-]+$/u);
const timestamp = z.string().datetime({ offset: true });
const version = z.number().int().min(1).max(BRAND_REPORT_VERSION_LIMIT);
function databaseText(value: unknown): boolean {
  if (Array.isArray(value)) return value.every(databaseText);
  if (value !== null && typeof value === "object") return Object.values(value).every(databaseText);
  if (typeof value !== "string") return true;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code === 0 || code >= 0xdc00 && code <= 0xdfff) return false;
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++index);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    }
  }
  return true;
}
const title = z.string().trim().min(1).max(120).refine(databaseText, "Text contains an unsupported character.");
export const brandReportSaveSchema = z.strictObject({
  id, requestKey: id, expectedVersion: z.number().int().min(0).max(BRAND_REPORT_VERSION_LIMIT),
  title, assessment: brandIndexInputSchema.refine(databaseText, "Text contains an unsupported character."),
});
export type BrandReportSaveInput = z.infer<typeof brandReportSaveSchema>;
export const brandReportSelectorSchema = z.strictObject({ id, version: version.optional() });
export type BrandReportSelector = z.infer<typeof brandReportSelectorSchema>;
export const brandReportSummarySchema = z.strictObject({
  id: storedId, title, version, createdAt: timestamp, updatedAt: timestamp,
}).refine(value => Date.parse(value.updatedAt) >= Date.parse(value.createdAt), "Invalid report dates.");
export type BrandReportSummary = z.infer<typeof brandReportSummarySchema>;
export const brandReportVersionSummarySchema = z.strictObject({ id: storedId, title, version, savedAt: timestamp });
export type BrandReportVersionSummary = z.infer<typeof brandReportVersionSummarySchema>;
export const brandReportSnapshotSchema = z.strictObject({
  id: storedId, title, version, savedAt: timestamp, assessment: brandIndexInputSchema,
  result: brandIndexResultSchema,
}).superRefine((value, context) => {
  const expected = assessBrandPresence(value.assessment, Date.parse(value.result.generated_at));
  if (JSON.stringify(value.result) !== JSON.stringify(expected)) {
    context.addIssue({ code: "custom", path: ["result"], message: "A saved report must derive only from its original user declarations." });
  }
});
export type BrandReportSnapshot = z.infer<typeof brandReportSnapshotSchema>;
const accountId = z.string().min(1).max(200);
const requestId = z.string().min(1).max(100);
export const brandReportsListResponseSchema = z.strictObject({
  accountId, reports: z.array(brandReportSummarySchema).max(BRAND_REPORT_LIMIT), requestId,
});
export const brandReportResponseSchema = z.strictObject({ accountId, report: brandReportSnapshotSchema, requestId });
export const brandReportHistoryResponseSchema = z.strictObject({
  accountId, versions: z.array(brandReportVersionSummarySchema).max(BRAND_REPORT_VERSION_LIMIT), requestId,
});
