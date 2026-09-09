-- Private Lost Domains discovery. No sources, access grants or subscriptions
-- are seeded. Existing saved domains and Swipe entitlements are untouched.
CREATE TABLE sajda.lost_domain_access (
  owner_id text PRIMARY KEY REFERENCES public.sajda_auth_user(id) ON DELETE CASCADE,
  grant_source text NOT NULL CHECK (grant_source IN ('operator', 'billing')),
  source_reference text NOT NULL CHECK (length(btrim(source_reference)) BETWEEN 1 AND 200),
  daily_refresh boolean NOT NULL DEFAULT false,
  valid_from timestamptz NOT NULL DEFAULT now() CHECK (isfinite(valid_from)),
  expires_at timestamptz NOT NULL CHECK (isfinite(expires_at)),
  revoked_at timestamptz CHECK (revoked_at IS NULL OR isfinite(revoked_at)),
  CHECK (expires_at > valid_from)
);

-- Only reviewed, explicitly enabled public HTML sources may be requested.
-- URL/hostname equality, non-private address rules and live robots checking
-- are additionally enforced by the server engine before network access.
CREATE TABLE sajda.lost_domain_sources (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  url text NOT NULL UNIQUE CHECK (length(url) BETWEEN 10 AND 2048 AND url LIKE 'https://%'),
  host text NOT NULL CHECK (length(host) BETWEEN 3 AND 253 AND host = lower(host)),
  robots_url text NOT NULL CHECK (length(robots_url) BETWEEN 10 AND 2048 AND robots_url LIKE 'https://%'),
  enabled boolean NOT NULL DEFAULT false,
  robots_policy text NOT NULL DEFAULT 'unreviewed' CHECK (robots_policy IN ('unreviewed', 'allowed', 'denied')),
  policy_reviewed_at timestamptz CHECK (policy_reviewed_at IS NULL OR isfinite(policy_reviewed_at)),
  policy_expires_at timestamptz CHECK (policy_expires_at IS NULL OR isfinite(policy_expires_at)),
  review_reference text NOT NULL DEFAULT '' CHECK (length(review_reference) <= 500),
  CHECK (NOT enabled OR (robots_policy = 'allowed' AND policy_reviewed_at IS NOT NULL
    AND policy_expires_at IS NOT NULL AND policy_expires_at > policy_reviewed_at AND length(btrim(review_reference)) > 0)),
  CHECK (policy_expires_at IS NULL OR (policy_reviewed_at IS NOT NULL AND policy_expires_at <= policy_reviewed_at + interval '30 days'))
);

CREATE TABLE sajda.lost_domain_campaigns (
  id uuid PRIMARY KEY,
  namespace text NOT NULL CHECK (namespace IN ('development', 'preview', 'production')),
  owner_id text NOT NULL REFERENCES public.sajda_auth_user(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(namespace, owner_id), UNIQUE(owner_id, id)
);

CREATE TABLE sajda.lost_domain_runs (
  id uuid PRIMARY KEY,
  namespace text NOT NULL CHECK (namespace IN ('development', 'preview', 'production')),
  owner_id text NOT NULL REFERENCES public.sajda_auth_user(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL,
  request_key text NOT NULL CHECK (length(request_key) BETWEEN 8 AND 100),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'partial', 'failed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz, finished_at timestamptz,
  failure_code text CHECK (failure_code IS NULL OR failure_code ~ '^[a-z_]{1,60}$'),
  engine_version text NOT NULL DEFAULT 'lost-domains-v1',
  source_limit smallint NOT NULL DEFAULT 3 CHECK (source_limit BETWEEN 1 AND 3),
  candidate_limit smallint NOT NULL DEFAULT 60 CHECK (candidate_limit BETWEEN 1 AND 60),
  attempt_limit smallint NOT NULL DEFAULT 80 CHECK (attempt_limit BETWEEN 1 AND 80),
  UNIQUE(namespace, owner_id, request_key), UNIQUE(owner_id, id),
  FOREIGN KEY(owner_id, campaign_id) REFERENCES sajda.lost_domain_campaigns(owner_id, id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX lost_domain_runs_one_active_owner_idx ON sajda.lost_domain_runs(namespace, owner_id)
  WHERE status IN ('queued', 'running');
CREATE INDEX lost_domain_runs_recent_idx ON sajda.lost_domain_runs(namespace, owner_id, created_at DESC);
CREATE INDEX lost_domain_runs_global_usage_idx ON sajda.lost_domain_runs(namespace, created_at DESC);

CREATE TABLE sajda.lost_domain_work_items (
  id uuid PRIMARY KEY,
  owner_id text NOT NULL,
  run_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('source', 'candidate')),
  source_id uuid NOT NULL REFERENCES sajda.lost_domain_sources(id),
  source_snapshot jsonb NOT NULL CHECK (jsonb_typeof(source_snapshot) = 'object' AND octet_length(source_snapshot::text) <= 8192),
  identity_key text NOT NULL CHECK (length(identity_key) BETWEEN 3 AND 253),
  candidate jsonb CHECK (candidate IS NULL OR (jsonb_typeof(candidate) = 'object' AND octet_length(candidate::text) <= 8192)),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'leased', 'retry_wait', 'succeeded', 'failed', 'cancelled')),
  attempts smallint NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  fence integer NOT NULL DEFAULT 0 CHECK (fence >= 0),
  lease_token uuid, lease_until timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
  failure_code text CHECK (failure_code IS NULL OR failure_code ~ '^[a-z_]{1,60}$'),
  completion_token uuid, result_hash text CHECK (result_hash IS NULL OR result_hash ~ '^[a-f0-9]{64}$'),
  source_evidence jsonb CHECK (source_evidence IS NULL OR (jsonb_typeof(source_evidence) = 'object' AND octet_length(source_evidence::text) <= 32768)),
  FOREIGN KEY(owner_id, run_id) REFERENCES sajda.lost_domain_runs(owner_id, id) ON DELETE CASCADE,
  UNIQUE(run_id, kind, identity_key), UNIQUE(owner_id, run_id, id),
  CHECK ((kind = 'candidate') = (candidate IS NOT NULL)),
  CHECK ((status = 'leased') = (lease_token IS NOT NULL AND lease_until IS NOT NULL)),
  CHECK ((lease_token IS NULL) = (lease_until IS NULL)),
  CHECK (lease_until IS NULL OR isfinite(lease_until))
);
CREATE INDEX lost_domain_work_due_idx ON sajda.lost_domain_work_items(status, next_attempt_at, created_at);
CREATE INDEX lost_domain_work_lease_idx ON sajda.lost_domain_work_items(lease_until) WHERE status = 'leased';

-- An attempt is charged BEFORE external work; retries do not erase usage.
CREATE TABLE sajda.lost_domain_attempts (
  work_id uuid NOT NULL, fence integer NOT NULL CHECK (fence > 0),
  owner_id text NOT NULL, run_id uuid NOT NULL,
  namespace text NOT NULL CHECK (namespace IN ('development', 'preview', 'production')),
  started_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(work_id, fence),
  FOREIGN KEY(owner_id, run_id, work_id) REFERENCES sajda.lost_domain_work_items(owner_id, run_id, id) ON DELETE CASCADE
);
CREATE INDEX lost_domain_attempts_budget_idx ON sajda.lost_domain_attempts(namespace, started_at DESC, owner_id);

CREATE TABLE sajda.lost_domain_assessments (
  id uuid PRIMARY KEY, owner_id text NOT NULL, run_id uuid NOT NULL, work_id uuid NOT NULL,
  domain text NOT NULL CHECK (length(domain) BETWEEN 3 AND 253 AND domain = lower(domain)),
  observed_at timestamptz NOT NULL DEFAULT now() CHECK (isfinite(observed_at)),
  potential_score smallint NOT NULL CHECK (potential_score BETWEEN 0 AND 100),
  confidence_score smallint NOT NULL CHECK (confidence_score BETWEEN 0 AND 100),
  qualified boolean NOT NULL DEFAULT false CHECK (qualified = false),
  assessment jsonb NOT NULL CHECK (jsonb_typeof(assessment) = 'object' AND octet_length(assessment::text) <= 32768),
  FOREIGN KEY(owner_id, run_id, work_id) REFERENCES sajda.lost_domain_work_items(owner_id, run_id, id) ON DELETE CASCADE,
  UNIQUE(work_id), UNIQUE(run_id, domain),
  CHECK ((assessment->>'domain') IS NOT DISTINCT FROM domain
    AND (assessment->>'registrability') IS NOT DISTINCT FROM 'unverified'
    AND (assessment->'confirmedRegistrable') IS NOT DISTINCT FROM 'false'::jsonb)
);
CREATE INDEX lost_domain_assessments_report_idx ON sajda.lost_domain_assessments(owner_id, run_id, potential_score DESC, confidence_score DESC);

-- Stored evidence is never rewritten by later refreshes. Account deletion
-- or a separately reviewed retention policy may delete rows, not alter them.
CREATE FUNCTION sajda.reject_lost_assessment_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  RAISE EXCEPTION 'Lost Domains assessments are immutable' USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER lost_domain_assessments_immutable BEFORE UPDATE ON sajda.lost_domain_assessments
  FOR EACH ROW EXECUTE FUNCTION sajda.reject_lost_assessment_update();

ALTER TABLE sajda.lost_domain_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE sajda.lost_domain_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE sajda.lost_domain_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE sajda.lost_domain_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sajda.lost_domain_work_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sajda.lost_domain_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sajda.lost_domain_assessments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sajda.lost_domain_access, sajda.lost_domain_sources, sajda.lost_domain_campaigns,
  sajda.lost_domain_runs, sajda.lost_domain_work_items, sajda.lost_domain_attempts,
  sajda.lost_domain_assessments FROM PUBLIC;
REVOKE ALL ON FUNCTION sajda.reject_lost_assessment_update() FROM PUBLIC;
