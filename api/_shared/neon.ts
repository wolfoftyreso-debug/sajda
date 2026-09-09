import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

/**
 * Server-only Neon Postgres boundary for Vercel Functions.
 *
 * The browser must never receive DATABASE_URL or talk to Postgres directly.
 * Public and authenticated product calls belong behind same-origin /api/*
 * routes, where identity and ownership can be verified before querying Neon.
 */

export class NeonDatabaseConfigurationError extends Error {
  readonly code = "database_not_configured";

  constructor() {
    super("The server database is not configured.");
    this.name = "NeonDatabaseConfigurationError";
  }
}

let cachedSql: NeonQueryFunction<false, false> | null = null;

/**
 * Returns whether this server environment has a Neon connection string.
 * Deliberately does not expose or log the value.
 */
export function hasNeonDatabaseConfig(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

/**
 * Gets the pooled runtime URL injected by the Neon/Vercel integration.
 * Migrations and one-off administration must use DATABASE_URL_UNPOOLED in a
 * separate CLI process; this module is intentionally for request handlers.
 */
export function getNeonSql(): NeonQueryFunction<false, false> {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) throw new NeonDatabaseConfigurationError();

  if (!cachedSql) {
    cachedSql = neon(connectionString);
  }

  return cachedSql;
}

/** Visible only in server logs/health diagnostics; it never includes a URL. */
export function neonDatabaseStatus(): "configured" | "not_configured" {
  return hasNeonDatabaseConfig() ? "configured" : "not_configured";
}
