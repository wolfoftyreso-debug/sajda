/**
 * Backward-compatible route alias.
 *
 * New integrations use POST /api/v1/public/domains. Keep this entrypoint so
 * existing callers continue to receive the same strict, public contract.
 */
export { config, default } from "./domains.js";
