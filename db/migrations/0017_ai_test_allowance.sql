-- Additive test-capacity rollout; counters and leases are never reset.
-- The application still defaults every stage to three requests/IP/UTC day.
-- A server-only explicit test override can raise only preview/development to
-- twenty. Production remains three; the shared global ceiling remains 100.
ALTER TABLE public.sajda_ai_allowance_counters
  DROP CONSTRAINT sajda_ai_allowance_counters_check,
  ADD CONSTRAINT sajda_ai_allowance_counters_check CHECK (
    request_count BETWEEN 1 AND CASE
      WHEN identity_hash = 'global' THEN 100
      WHEN namespace IN ('sajda.ai.v1:preview', 'sajda.ai.v1:development') THEN 20
      ELSE 3
    END
  );
