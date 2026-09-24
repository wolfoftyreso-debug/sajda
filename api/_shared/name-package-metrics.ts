import { NAME_PACKAGE_INTELLIGENCE_SCHEMA_VERSION, type NamePackageIntelligence } from "../../shared/name-package-intelligence.js";
import { NAME_PACKAGE_METHODOLOGY_VERSION } from "../../shared/name-packages.js";

/** Best-effort synchronous completion telemetry, with aggregate counts only. */
export function recordNamePackageMetrics(result: NamePackageIntelligence,
  context: { requestId: string; surface: "public" | "account" },
  logger: (event: Record<string, unknown>) => void = event => console.info(JSON.stringify(event))): void {
  let domainEvidenceCount = 0, freshDomainCount = 0, unknownDomainCount = 0, missingLegalChecksCount = 0;
  for (const pkg of result.packages) {
    for (const domain of pkg.evidence.domains) {
      // Unchecked requested extensions are evidence slots, so incompleteness remains visible.
      domainEvidenceCount++;
      if (domain.authoritative && domain.freshness.status === "fresh"
        && (domain.status === "available" || domain.status === "taken")) freshDomainCount++;
      if (domain.status === "unknown" || domain.status === "checking") unknownDomainCount++;
    }
    if (pkg.evidence.company.status === "not_checked") missingLegalChecksCount++;
    if (pkg.evidence.trademark.status === "not_checked") missingLegalChecksCount++;
  }
  const requestId = typeof context.requestId === "string" && /^req_[A-Za-z0-9_-]{12,64}$/u.test(context.requestId)
    ? context.requestId : undefined;
  if (context.surface !== "public" && context.surface !== "account") return;
  try {
    logger({ event: "name_package_intelligence_completed", ...(requestId ? { request_id: requestId } : {}),
      surface: context.surface, schema_version: NAME_PACKAGE_INTELLIGENCE_SCHEMA_VERSION,
      methodology_version: NAME_PACKAGE_METHODOLOGY_VERSION,
      requested_count: result.requested_count, returned_count: result.returned_count,
      domain_evidence_count: domainEvidenceCount, fresh_domain_count: freshDomainCount,
      unknown_domain_count: unknownDomainCount, missing_legal_checks_count: missingLegalChecksCount });
  } catch { /* A synchronous logging failure must not fail an otherwise completed search. */ }
}
