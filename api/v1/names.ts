/**
 * Backward-compatible route alias.
 *
 * New integrations use POST /api/v1/domains. Keep this entrypoint so existing
 * integrations retain their current behavior while the canonical resource is
 * explicitly domain-first.
 */
export { config, default } from "./domains.js";
