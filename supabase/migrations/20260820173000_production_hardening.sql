-- Production hardening and local self-hosting migration.
--
-- This migration is intentionally append-only. Legacy domain_history rows have
-- no owner, so they are locked down rather than guessed/backfilled into a user
-- history table. Export and review them separately if they need to be retained.

-- The old migration schedules an HTTP call to a retired cloud project with an
-- embedded bearer token. Disable it; scheduling is now handled by the local
-- worker with an injected JOB_SECRET.
DO $$
DECLARE
  scheduled_job bigint;
BEGIN
  FOR scheduled_job IN
    SELECT jobid FROM cron.job WHERE jobname = 'hourly-registrar-scraper'
  LOOP
    PERFORM cron.unschedule(scheduled_job);
  END LOOP;
EXCEPTION
  WHEN undefined_table OR undefined_function THEN
    RAISE NOTICE 'pg_cron is not available; no legacy job was removed';
END;
$$;

-- Backend-only cache: authoritative availability has a short TTL and is never
-- exposed directly through PostgREST. The service role used by Edge Functions
-- bypasses RLS; browser users get no policy on this table.
CREATE TABLE IF NOT EXISTS public.domain_cache (
  domain text PRIMARY KEY,
  tld text NOT NULL,
  availability_status text NOT NULL CHECK (availability_status IN ('available', 'taken', 'unknown')),
  check_method text NOT NULL CHECK (check_method IN ('rdap', 'none')),
  registration_price_estimate numeric(10,2),
  checked_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT domain_cache_price_nonnegative CHECK (registration_price_estimate IS NULL OR registration_price_estimate >= 0)
);

ALTER TABLE public.domain_cache ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_domain_cache_expires_at ON public.domain_cache(expires_at);

-- User-owned history replaces legacy domain_history, which was public and did
-- not have a user_id. This table is deliberately separate to avoid assigning
-- historic rows to an arbitrary account.
CREATE TABLE IF NOT EXISTS public.user_domain_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  domain text NOT NULL,
  tld text NOT NULL,
  registrar_price numeric(10,2) NOT NULL CHECK (registrar_price >= 0),
  estimated_value numeric(12,2) NOT NULL CHECK (estimated_value >= 0),
  confidence_score integer NOT NULL CHECK (confidence_score BETWEEN 0 AND 100),
  rationale text,
  registrar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_domain_history_domain_key UNIQUE (user_id, domain)
);

ALTER TABLE public.user_domain_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own domain history"
  ON public.user_domain_history FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own domain history"
  ON public.user_domain_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own domain history"
  ON public.user_domain_history FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own domain history"
  ON public.user_domain_history FOR DELETE
  USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_user_domain_history_user_created
  ON public.user_domain_history(user_id, created_at DESC);

-- Existing legacy history is no longer browser-readable or browser-writable.
DROP POLICY IF EXISTS "Anyone can view domain history" ON public.domain_history;
DROP POLICY IF EXISTS "Anyone can insert domain history" ON public.domain_history;

-- Persist enough provenance to explain and reproduce a screening result. No
-- unique constraint is added to the legacy scan_results table because an
-- existing installation may already contain duplicates; the new code avoids
-- unsafe upserts and migration does not delete user data.
ALTER TABLE public.scan_results
  ADD COLUMN IF NOT EXISTS availability_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS price_source text,
  ADD COLUMN IF NOT EXISTS checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS algorithm_version text,
  ADD COLUMN IF NOT EXISTS valuation_signals jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.user_domains
  ADD COLUMN IF NOT EXISTS valuation_algorithm_version text,
  ADD COLUMN IF NOT EXISTS valuation_signals jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scan_results_availability_status_check') THEN
    ALTER TABLE public.scan_results
      ADD CONSTRAINT scan_results_availability_status_check
      CHECK (availability_status IN ('available', 'taken', 'unknown')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scan_results_price_source_check') THEN
    ALTER TABLE public.scan_results
      ADD CONSTRAINT scan_results_price_source_check
      CHECK (price_source IS NULL OR price_source IN ('heuristic', 'registrar_quote')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scan_results_confidence_score_check') THEN
    ALTER TABLE public.scan_results
      ADD CONSTRAINT scan_results_confidence_score_check
      CHECK (confidence_score BETWEEN 0 AND 100) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scan_results_registrar_price_check') THEN
    ALTER TABLE public.scan_results
      ADD CONSTRAINT scan_results_registrar_price_check
      CHECK (registrar_price >= 0) NOT VALID;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_scan_results_scan_created
  ON public.scan_results(scan_id, created_at DESC);

-- Make scan state valid for future rows without destructively touching old
-- records. Explicit WITH CHECK prevents owners from changing ownership via an
-- UPDATE request.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_scans_status_check') THEN
    ALTER TABLE public.user_scans
      ADD CONSTRAINT user_scans_status_check
      CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_scans_scan_mode_check') THEN
    ALTER TABLE public.user_scans
      ADD CONSTRAINT user_scans_scan_mode_check
      CHECK (scan_mode IN ('light', 'medium', 'heavy', 'deep')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_scans_user_id_fkey') THEN
    ALTER TABLE public.user_scans
      ADD CONSTRAINT user_scans_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_subscriptions_user_id_fkey') THEN
    ALTER TABLE public.push_subscriptions
      ADD CONSTRAINT push_subscriptions_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;
  END IF;
END;
$$;

ALTER TABLE public.user_scans ALTER COLUMN status SET DEFAULT 'queued';

ALTER POLICY "Users can update their own scans" ON public.user_scans
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
ALTER POLICY "Users can update own domains" ON public.user_domains
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_scans_user_status_created
  ON public.user_scans(user_id, status, created_at DESC);

DROP TRIGGER IF EXISTS update_user_domains_updated_at ON public.user_domains;
CREATE TRIGGER update_user_domains_updated_at
  BEFORE UPDATE ON public.user_domains
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_scans_updated_at ON public.user_scans;
CREATE TRIGGER update_user_scans_updated_at
  BEFORE UPDATE ON public.user_scans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_domain_history_updated_at ON public.user_domain_history;
CREATE TRIGGER update_user_domain_history_updated_at
  BEFORE UPDATE ON public.user_domain_history
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_domain_cache_updated_at ON public.domain_cache;
CREATE TRIGGER update_domain_cache_updated_at
  BEFORE UPDATE ON public.domain_cache
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Public deletion of a global top list is not a user capability. Scheduled
-- functions use service role and do not need a browser RLS policy.
DROP POLICY IF EXISTS "Authenticated users can delete daily top domains" ON public.daily_top_domains;
CREATE POLICY "Admins can delete daily top domains"
  ON public.daily_top_domains FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

-- Admin configuration and evaluation history are private. The original public
-- policies were only needed by functions that used an anonymous client; the
-- hardened functions use service role server-side instead.
DROP POLICY IF EXISTS "Anyone can view model adapters" ON public.model_adapters;
DROP POLICY IF EXISTS "Anyone can view decision settings" ON public.decision_settings;
DROP POLICY IF EXISTS "Anyone can insert evaluation history" ON public.model_evaluation_history;

CREATE POLICY "Admins can view model adapters"
  ON public.model_adapters FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can view decision settings"
  ON public.decision_settings FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Idempotency/audit records for the local scheduler. No browser policy is
-- supplied; service role owns all writes.
CREATE TABLE IF NOT EXISTS public.job_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name text NOT NULL,
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'skipped')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  CONSTRAINT job_runs_job_schedule_key UNIQUE (job_name, scheduled_for)
);
ALTER TABLE public.job_runs ENABLE ROW LEVEL SECURITY;

-- Database-backed rate limiting works across Edge Runtime workers. Only the
-- service role may call the function; browser clients never receive access to
-- the backing table or RPC.
CREATE TABLE IF NOT EXISTS public.function_rate_limits (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, action)
);
ALTER TABLE public.function_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.consume_function_rate_limit(
  p_user_id uuid,
  p_action text,
  p_limit integer,
  p_window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  accepted boolean;
BEGIN
  IF p_limit < 1 OR p_window_seconds < 1 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'Invalid rate limit parameters';
  END IF;

  INSERT INTO public.function_rate_limits (user_id, action, window_started_at, request_count, updated_at)
  VALUES (p_user_id, p_action, now(), 1, now())
  ON CONFLICT (user_id, action) DO UPDATE
  SET window_started_at = CASE
        WHEN public.function_rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds)
          THEN now()
        ELSE public.function_rate_limits.window_started_at
      END,
      request_count = CASE
        WHEN public.function_rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds)
          THEN 1
        ELSE public.function_rate_limits.request_count + 1
      END,
      updated_at = now()
  WHERE public.function_rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds)
     OR public.function_rate_limits.request_count < p_limit
  RETURNING true INTO accepted;

  RETURN COALESCE(accepted, false);
END;
$$;

REVOKE ALL ON FUNCTION public.consume_function_rate_limit(uuid, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_function_rate_limit(uuid, text, integer, integer) TO service_role;

-- Surface the implemented engine accurately in the existing admin screen.
UPDATE public.model_adapters SET is_enabled = false
WHERE model_name IN ('openai/gpt-5', 'openai/gpt-5-mini', 'google/gemini-2.5-pro', 'google/gemini-2.5-flash', 'google/gemini-3-flash-preview');

INSERT INTO public.model_adapters (model_name, display_name, weight, is_enabled, notes)
VALUES (
  'deterministic/domain-engine-v2',
  'Lokal deterministisk domänmotor v2',
  1.0,
  true,
  'Reproducerbar kandidatgenerering och screening utan extern LLM. Värden är prioriteringssignaler, inte marknadsvärderingar.'
)
ON CONFLICT (model_name) DO UPDATE
SET display_name = EXCLUDED.display_name,
    notes = EXCLUDED.notes,
    is_enabled = true;
