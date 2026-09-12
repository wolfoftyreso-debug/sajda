import { createRequestId } from "./_shared/public-api.js";
import {
  getNeonSql,
  hasNeonDatabaseConfig,
  NeonDatabaseConfigurationError,
} from "./_shared/neon.js";

interface VercelRequestLike {
  method?: string;
}

interface VercelResponseLike {
  setHeader(name: string, value: string | number): void;
  status(code: number): VercelResponseLike;
  json(payload: unknown): void;
}

export const config = { maxDuration: 5 };

// Structural readiness only; checksum and constraint verification belong to
// the migration runner. Do not return this SQL or individual results publicly.
export const storageReadinessSql = `SELECT
  (SELECT bool_and(to_regclass(name) IS NOT NULL)
    FROM unnest(ARRAY['public.sajda_auth_user', 'public.sajda_auth_session',
      'public.sajda_auth_account', 'public.sajda_auth_verification', 'public.sajda_auth_rate_limit',
      'sajda.schema_migrations', 'sajda.saved_domains', 'public.sajda_contact_submissions',
      'sajda.lost_domain_runs', 'sajda.lost_domain_work_items', 'sajda.lost_domain_assessments',
      'sajda.lost_domain_effective_access', 'sajda.lost_domain_provider_backoff', 'sajda.commerce_events',
      'sajda.lost_domain_quote_requests', 'sajda.lost_domain_quote_observations',
      'sajda.trading_scenarios', 'sajda.developer_api_keys', 'sajda.developer_api_quotas',
      'sajda.native_authorization_codes', 'sajda.native_sessions', 'sajda.account_deletion_challenges',
      'sajda.native_commerce_accounts', 'sajda.native_commerce_subscriptions', 'sajda.native_commerce_events']) AS required(name))
  AND NOT EXISTS (
    SELECT 1 FROM (VALUES
      ('lost_domain_runs','verification_round'), ('lost_domain_runs','verification_max_rounds'),
      ('lost_domain_runs','verification_gap_seconds'), ('lost_domain_runs','run_lifetime_seconds'),
      ('lost_domain_runs','attempt_limit'), ('lost_domain_work_items','verification_round'),
      ('lost_domain_quote_requests','request_key'), ('lost_domain_quote_requests','assessment_id'),
      ('lost_domain_quote_observations','evidence'),
      ('trading_scenarios','namespace'), ('trading_scenarios','owner_id'),
      ('trading_scenarios','payload'), ('trading_scenarios','version'), ('trading_scenarios','last_input_hash')
    ) AS required(table_name,column_name)
    WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns actual
      WHERE actual.table_schema='sajda' AND actual.table_name=required.table_name
        AND actual.column_name=required.column_name)
  ) AS ready`;

function setHealthHeaders(response: VercelResponseLike, requestId: string): void {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Request-Id", requestId);
}

/**
 * A dependency-safe Vercel health probe.
 *
 * It never exposes a database URL, migration state, table name, user data or
 * provider error. Vercel monitors can use it after Neon is connected to prove
 * that the server-side runtime, rather than the browser, reaches Postgres.
 */
export function createHealthHandler(dependencies: {
  configured?: () => boolean;
  ready?: () => Promise<boolean>;
} = {}) { return async function handler(
  request: VercelRequestLike,
  response: VercelResponseLike,
): Promise<void> {
  const requestId = createRequestId();

  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    setHealthHeaders(response, requestId);
    response.status(405).json({
      ok: false,
      error: "Only GET requests are supported.",
      code: "method_not_allowed",
      requestId,
    });
    return;
  }

  if (!(dependencies.configured ?? hasNeonDatabaseConfig)()) {
    setHealthHeaders(response, requestId);
    response.status(503).json({
      ok: false,
      database: "not_configured",
      code: "database_not_configured",
      requestId,
    });
    return;
  }

  try {
    // End before the platform's five-second limit so a slow database still
    // returns the same safe, diagnosable JSON contract instead of a gateway page.
    const ready = await (dependencies.ready ?? (async () => {
      const rows = await getNeonSql().query(storageReadinessSql, [], {
        fetchOptions: { signal: AbortSignal.timeout(3_500) },
      });
      return rows[0]?.ready === true;
    }))();
    setHealthHeaders(response, requestId);
    if (!ready) {
      console.error(JSON.stringify({ event: "database_health_failed", requestId, code: "storage_not_ready" }));
      response.status(503).json({ ok: false, database: "connected", code: "storage_not_ready", requestId });
      return;
    }
    response.status(200).json({
      ok: true,
      database: "connected",
      requestId,
    });
  } catch (error) {
    const code = error instanceof NeonDatabaseConfigurationError
      ? error.code
      : "database_unavailable";
    console.error(JSON.stringify({ event: "database_health_failed", requestId, code }));
    setHealthHeaders(response, requestId);
    response.status(503).json({
      ok: false,
      database: "unavailable",
      code,
      requestId,
    });
  }
}; }

export default createHealthHandler();
