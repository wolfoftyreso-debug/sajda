/**
 * Retired: the former optional `vercel curl` transport placed passwords and
 * session cookies in child-process arguments. It must not be run again.
 * Use the bounded, exact-origin in-memory transport documented in
 * docs/AUTH-LIFECYCLE-VERIFICATION.md. No auth/database work occurs here.
 */
throw new Error("Legacy auth QA is retired. Use scripts/check-auth-lifecycle-preview.mjs with the documented Preview-only fences.");
