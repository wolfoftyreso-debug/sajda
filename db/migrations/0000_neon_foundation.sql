-- Sajda's provider-neutral Neon baseline.
--
-- This migration is intentionally independent of Supabase schemas, PostgREST,
-- browser RLS policies and auth.users. Neon Auth owns identity in neon_auth;
-- Vercel Functions enforce Sajda ownership before issuing application queries.

CREATE SCHEMA IF NOT EXISTS sajda;

CREATE TABLE IF NOT EXISTS sajda.schema_migrations (
  id text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

-- A durable, idempotent job ledger for Vercel Cron and background work.
CREATE TABLE IF NOT EXISTS sajda.job_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_name text NOT NULL,
  execution_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('started', 'completed', 'failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (job_name, execution_key)
);

CREATE INDEX IF NOT EXISTS job_runs_name_started_at_idx
  ON sajda.job_runs (job_name, started_at DESC);

-- Server-side rate-limit state. Browser code never reads or writes this table.
CREATE TABLE IF NOT EXISTS sajda.function_rate_limits (
  scope text NOT NULL,
  subject_hash text NOT NULL,
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, subject_hash, window_started_at)
);

CREATE INDEX IF NOT EXISTS function_rate_limits_window_idx
  ON sajda.function_rate_limits (scope, window_started_at DESC);
