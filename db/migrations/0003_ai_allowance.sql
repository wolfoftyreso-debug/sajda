-- Durable limits for optional paid AI only. No existing data is rewritten.
-- All routes share an environment-wide transaction advisory lock in the
-- Vercel server adapter; counters are consumed before a provider request.
CREATE TABLE public.sajda_ai_allowance_counters (
  namespace text NOT NULL CHECK (namespace IN (
    'sajda.ai.v1:development', 'sajda.ai.v1:preview', 'sajda.ai.v1:production'
  )),
  usage_day date NOT NULL,
  identity_hash text NOT NULL CHECK (identity_hash = 'global' OR identity_hash ~ '^[a-f0-9]{64}$'),
  request_count smallint NOT NULL CHECK (
    request_count BETWEEN 1 AND CASE WHEN identity_hash = 'global' THEN 100 ELSE 3 END
  ),
  last_request_at timestamptz NOT NULL,
  PRIMARY KEY (namespace, usage_day, identity_hash)
);

-- Expiring leases keep crashed/timed-out invocations from pinning capacity.
-- No prompts, output, session identifiers or unhashed client IPs are retained.
CREATE TABLE public.sajda_ai_allowance_leases (
  namespace text NOT NULL CHECK (namespace IN (
    'sajda.ai.v1:development', 'sajda.ai.v1:preview', 'sajda.ai.v1:production'
  )),
  lease_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (namespace, lease_id)
);

CREATE INDEX sajda_ai_allowance_leases_expiry_idx
  ON public.sajda_ai_allowance_leases (namespace, expires_at);

ALTER TABLE public.sajda_ai_allowance_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sajda_ai_allowance_leases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sajda_ai_allowance_counters, public.sajda_ai_allowance_leases FROM PUBLIC;
