/** Retired: preflight counts cannot fence a global Preview scheduler against
 * another account becoming due between that read and the worker claim.
 * Historical receipts describe their original run, not permission to reuse an
 * unsafe scheduler. No external capability is initialized by this entry point.
 */
console.error(JSON.stringify({ event: "brand_monitors_deployed_preview_probe_blocked", code: "fixture_scoped_scheduler_required" }));
process.exitCode = 1;
