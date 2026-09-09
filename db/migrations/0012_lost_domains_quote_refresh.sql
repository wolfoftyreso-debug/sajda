-- Explicit read-only registrar refreshes remain separate from immutable technical assessments.
-- No provider credentials, accounts, billing state, sources or permissions are seeded here.
ALTER TABLE sajda.lost_domain_runs ADD CONSTRAINT lost_domain_runs_namespace_owner_id_key UNIQUE(namespace,owner_id,id);
ALTER TABLE sajda.lost_domain_assessments ADD CONSTRAINT lost_domain_assessments_owner_run_id_key UNIQUE(owner_id,run_id,id);

CREATE TABLE sajda.lost_domain_quote_requests (
  id uuid PRIMARY KEY,
  namespace text NOT NULL CHECK(namespace IN ('development','preview','production')),
  owner_id text NOT NULL,
  run_id uuid NOT NULL,
  assessment_id uuid NOT NULL,
  domain text NOT NULL CHECK(length(domain) BETWEEN 3 AND 253 AND domain=lower(domain)),
  request_key uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','succeeded','failed')),
  requested_at timestamptz NOT NULL DEFAULT clock_timestamp() CHECK(isfinite(requested_at)),
  lease_token uuid,
  lease_until timestamptz CHECK(lease_until IS NULL OR isfinite(lease_until)),
  finished_at timestamptz CHECK(finished_at IS NULL OR isfinite(finished_at)),
  failure_code text CHECK(failure_code IS NULL OR failure_code ~ '^[a-z_]{1,60}$'),
  UNIQUE(namespace,owner_id,request_key), UNIQUE(namespace,owner_id,id,domain),
  FOREIGN KEY(namespace,owner_id,run_id) REFERENCES sajda.lost_domain_runs(namespace,owner_id,id) ON DELETE CASCADE,
  FOREIGN KEY(owner_id,run_id,assessment_id) REFERENCES sajda.lost_domain_assessments(owner_id,run_id,id) ON DELETE CASCADE,
  CHECK((status='pending') = (lease_token IS NOT NULL AND lease_until IS NOT NULL AND finished_at IS NULL)),
  CHECK(status='pending' OR (lease_token IS NULL AND lease_until IS NULL AND finished_at IS NOT NULL)),
  CHECK(status<>'succeeded' OR failure_code IS NULL)
);
CREATE UNIQUE INDEX lost_domain_quote_one_pending_owner_idx ON sajda.lost_domain_quote_requests(namespace,owner_id) WHERE status='pending';
CREATE INDEX lost_domain_quote_usage_idx ON sajda.lost_domain_quote_requests(namespace,owner_id,requested_at DESC);
CREATE INDEX lost_domain_quote_report_idx ON sajda.lost_domain_quote_requests(namespace,owner_id,run_id,domain,requested_at DESC);

CREATE TABLE sajda.lost_domain_quote_observations (
  request_id uuid PRIMARY KEY,
  namespace text NOT NULL,
  owner_id text NOT NULL,
  domain text NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT clock_timestamp() CHECK(isfinite(observed_at)),
  evidence jsonb NOT NULL CHECK(jsonb_typeof(evidence)='object' AND octet_length(evidence::text)<=8192),
  FOREIGN KEY(namespace,owner_id,request_id,domain) REFERENCES sajda.lost_domain_quote_requests(namespace,owner_id,id,domain) ON DELETE CASCADE,
  CHECK((evidence->>'domain') IS NOT DISTINCT FROM domain
    AND (evidence->>'provider') IS NOT DISTINCT FROM 'porkbun'
    AND (evidence->>'method') IS NOT DISTINCT FROM 'official_registrar_api')
);
CREATE TRIGGER lost_domain_quote_observations_immutable BEFORE UPDATE ON sajda.lost_domain_quote_observations
  FOR EACH ROW EXECUTE FUNCTION sajda.reject_lost_assessment_update();
ALTER TABLE sajda.lost_domain_quote_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE sajda.lost_domain_quote_observations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sajda.lost_domain_quote_requests,sajda.lost_domain_quote_observations FROM PUBLIC;
