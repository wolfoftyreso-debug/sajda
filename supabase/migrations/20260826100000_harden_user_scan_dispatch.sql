-- Harden the authenticated scan queue.
--
-- Historically an authenticated browser could insert any `user_scans` row
-- with `status = 'queued'`. A self-hosted worker used a service-role key to
-- claim every queued row, which turned that browser write into privileged
-- background work. New scan records are now created only through a bounded
-- SECURITY DEFINER request function. The worker only consumes rows carrying
-- the server-created dispatch marker from that function.
--
-- Existing rows deliberately remain `legacy` and are never claimed by the
-- hardened worker. This avoids guessing which historical queued records were
-- intentional while making the safety boundary effective immediately.

ALTER TABLE public.user_scans
  ADD COLUMN IF NOT EXISTS request_origin text NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS execution_mode text NOT NULL DEFAULT 'direct-edge',
  ADD COLUMN IF NOT EXISTS dispatch_token uuid,
  ADD COLUMN IF NOT EXISTS worker_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS execution_started_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_scans_request_origin_check') THEN
    ALTER TABLE public.user_scans
      ADD CONSTRAINT user_scans_request_origin_check
      CHECK (request_origin IN ('legacy', 'authenticated-rpc')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_scans_execution_mode_check') THEN
    ALTER TABLE public.user_scans
      ADD CONSTRAINT user_scans_execution_mode_check
      CHECK (execution_mode IN ('direct-edge', 'worker')) NOT VALID;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_user_scans_trusted_worker_queue
  ON public.user_scans(created_at ASC)
  WHERE status = 'queued'
    AND request_origin = 'authenticated-rpc'
    AND execution_mode = 'worker'
    AND dispatch_token IS NOT NULL;

-- Browser sessions can still read their own scan and result records, but they
-- can no longer create queue entries or change a scan's payload/status via
-- PostgREST. All state transitions happen in narrow server-owned paths below.
DROP POLICY IF EXISTS "Users can create their own scans" ON public.user_scans;
DROP POLICY IF EXISTS "Users can update their own scans" ON public.user_scans;
DROP POLICY IF EXISTS "Users can delete their own scans" ON public.user_scans;
DROP POLICY IF EXISTS "Users can insert scan results" ON public.scan_results;
DROP POLICY IF EXISTS "Users can delete their own scan results" ON public.scan_results;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.user_scans FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.scan_results FROM PUBLIC, anon, authenticated;

-- Centralized, authenticated request creation. This is the only browser
-- callable path that can create a scan which either the direct Edge function
-- or the self-hosted worker will honor. The shared database rate limiter is
-- used inside the function so concurrent requests cannot exceed the limit.
CREATE OR REPLACE FUNCTION public.request_user_scan(
  p_selected_tlds text[],
  p_scan_mode text,
  p_search_keyword text DEFAULT NULL,
  p_execution_mode text DEFAULT 'direct-edge'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requester_id uuid := auth.uid();
  normalized_tlds text[];
  normalized_keyword text;
  scan_id uuid;
BEGIN
  IF requester_id IS NULL OR auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '28000';
  END IF;

  IF p_scan_mode NOT IN ('light', 'medium', 'heavy', 'deep') THEN
    RAISE EXCEPTION 'invalid_scan_mode' USING ERRCODE = '22023';
  END IF;

  IF p_execution_mode NOT IN ('direct-edge', 'worker') THEN
    RAISE EXCEPTION 'invalid_execution_mode' USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(DISTINCT normalized_tld ORDER BY normalized_tld)
    INTO normalized_tlds
  FROM (
    SELECT regexp_replace(lower(btrim(tld)), '^\.', '') AS normalized_tld
    FROM unnest(COALESCE(p_selected_tlds, ARRAY[]::text[])) AS source(tld)
  ) AS normalized
  WHERE normalized_tld ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$';

  IF COALESCE(cardinality(normalized_tlds), 0) < 1 OR cardinality(normalized_tlds) > 4 THEN
    RAISE EXCEPTION 'invalid_selected_tlds' USING ERRCODE = '22023';
  END IF;

  normalized_keyword := NULLIF(btrim(COALESCE(p_search_keyword, '')), '');
  IF normalized_keyword IS NOT NULL AND char_length(normalized_keyword) > 120 THEN
    RAISE EXCEPTION 'search_keyword_too_long' USING ERRCODE = '22023';
  END IF;

  IF NOT public.consume_function_rate_limit(requester_id, 'user-scan-request', 2, 600) THEN
    RAISE EXCEPTION 'scan_rate_limit_reached' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.user_scans (
    user_id,
    status,
    scan_mode,
    selected_tlds,
    search_keyword,
    request_origin,
    execution_mode,
    dispatch_token
  ) VALUES (
    requester_id,
    'queued',
    p_scan_mode,
    normalized_tlds,
    normalized_keyword,
    'authenticated-rpc',
    p_execution_mode,
    gen_random_uuid()
  )
  RETURNING id INTO scan_id;

  RETURN scan_id;
END;
$$;

REVOKE ALL ON FUNCTION public.request_user_scan(text[], text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_user_scan(text[], text, text, text) TO authenticated;

-- The UI may cancel only its own queued/running request. It cannot modify the
-- request parameters or revive a cancelled/completed record.
CREATE OR REPLACE FUNCTION public.cancel_user_scan(p_scan_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requester_id uuid := auth.uid();
BEGIN
  IF requester_id IS NULL OR auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '28000';
  END IF;

  UPDATE public.user_scans
     SET status = 'cancelled',
         completed_at = now()
   WHERE id = p_scan_id
     AND user_id = requester_id
     AND status IN ('queued', 'running');

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_user_scan(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_user_scan(uuid) TO authenticated;

-- The self-hosted worker calls this with the service-role key. The update is
-- atomic and returns a dispatch token that must be presented to the Edge
-- function, preventing a raw browser-created row from ever becoming work.
CREATE OR REPLACE FUNCTION public.claim_next_trusted_user_scan()
RETURNS TABLE (scan_id uuid, dispatch_token uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH candidate AS (
    SELECT id
      FROM public.user_scans
     WHERE status = 'queued'
       AND request_origin = 'authenticated-rpc'
       AND execution_mode = 'worker'
       AND dispatch_token IS NOT NULL
     ORDER BY created_at ASC
     LIMIT 1
     FOR UPDATE SKIP LOCKED
  ), claimed AS (
    UPDATE public.user_scans AS scan
       SET status = 'running',
           worker_claimed_at = now()
      FROM candidate
     WHERE scan.id = candidate.id
     RETURNING scan.id, scan.dispatch_token
  )
  SELECT claimed.id, claimed.dispatch_token
    FROM claimed;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_next_trusted_user_scan() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_next_trusted_user_scan() TO service_role;

-- Defense in depth: even if a future migration accidentally restores a broad
-- UPDATE policy, an authenticated client can only cancel its own in-flight
-- scan. Payload, queue origin, dispatch token, progress and completion data
-- remain server-owned.
CREATE OR REPLACE FUNCTION public.guard_user_scan_browser_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL
     OR OLD.user_id <> auth.uid()
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.request_origin IS DISTINCT FROM OLD.request_origin
     OR NEW.execution_mode IS DISTINCT FROM OLD.execution_mode
     OR NEW.dispatch_token IS DISTINCT FROM OLD.dispatch_token
     OR NEW.selected_tlds IS DISTINCT FROM OLD.selected_tlds
     OR NEW.scan_mode IS DISTINCT FROM OLD.scan_mode
     OR NEW.search_keyword IS DISTINCT FROM OLD.search_keyword
     OR NEW.total_domains_scanned IS DISTINCT FROM OLD.total_domains_scanned
     OR NEW.worker_claimed_at IS DISTINCT FROM OLD.worker_claimed_at
     OR NEW.execution_started_at IS DISTINCT FROM OLD.execution_started_at
     OR NEW.status <> 'cancelled'
     OR OLD.status NOT IN ('queued', 'running')
     OR NEW.completed_at IS NULL THEN
    RAISE EXCEPTION 'user_scans_are_server_managed' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_user_scan_browser_update ON public.user_scans;
CREATE TRIGGER guard_user_scan_browser_update
  BEFORE UPDATE ON public.user_scans
  FOR EACH ROW EXECUTE FUNCTION public.guard_user_scan_browser_update();

COMMENT ON COLUMN public.user_scans.request_origin IS
  'Legacy rows are never worker-dispatched. authenticated-rpc rows were created by request_user_scan.';
COMMENT ON COLUMN public.user_scans.dispatch_token IS
  'Server-created worker dispatch marker; the worker must return it to user-domain-scan after an atomic claim.';
