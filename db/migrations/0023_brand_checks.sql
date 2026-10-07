-- Server-origin registry observations, never account-holder declarations.
-- Every reservation retains its exact immutable saved report scope.
CREATE TABLE sajda.brand_check_runs (
  namespace text NOT NULL CHECK (namespace IN ('development', 'preview', 'production')),
  owner_id text NOT NULL REFERENCES public.sajda_auth_user(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  report_id uuid NOT NULL,
  report_version integer NOT NULL CHECK (report_version BETWEEN 1 AND 100),
  input_hash text NOT NULL CHECK (input_hash ~ '^[a-f0-9]{64}$'),
  targets jsonb NOT NULL CHECK (jsonb_typeof(targets) = 'array' AND jsonb_array_length(targets) BETWEEN 1 AND 20 AND octet_length(targets::text) <= 16384),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  requested_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  lease_expires_at timestamptz NOT NULL DEFAULT statement_timestamp() + interval '5 minutes',
  completed_at timestamptz,
  methodology_version text NOT NULL CHECK (methodology_version = 'sajda.registry-observation.v1'),
  entries jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(entries) = 'array' AND jsonb_array_length(entries) <= 20 AND octet_length(entries::text) <= 65536),
  failure_code text CHECK (failure_code IN ('provider_unavailable', 'invalid_evidence', 'check_interrupted')),
  PRIMARY KEY (namespace, owner_id, id),
  FOREIGN KEY (namespace, owner_id, report_id, report_version)
    REFERENCES sajda.brand_report_versions(namespace, owner_id, report_id, version) ON DELETE CASCADE,
  CHECK (lease_expires_at = requested_at + interval '5 minutes'),
  CHECK (completed_at IS NULL OR completed_at >= requested_at),
  CHECK ((status = 'pending' AND completed_at IS NULL AND failure_code IS NULL AND entries = '[]'::jsonb)
    OR (status = 'failed' AND completed_at IS NOT NULL AND failure_code IS NOT NULL AND entries = '[]'::jsonb)
    OR (status = 'completed' AND completed_at IS NOT NULL AND failure_code IS NULL AND jsonb_array_length(entries) = jsonb_array_length(targets)))
);
CREATE INDEX brand_check_runs_history_idx ON sajda.brand_check_runs(namespace, owner_id, report_id, requested_at DESC, id DESC);
CREATE INDEX brand_check_runs_owner_day_idx ON sajda.brand_check_runs(namespace, owner_id, requested_at);
CREATE UNIQUE INDEX brand_check_runs_one_pending_idx ON sajda.brand_check_runs(namespace, owner_id, report_id) WHERE status = 'pending';

CREATE FUNCTION sajda.enforce_brand_check_transition() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF OLD.status <> 'pending' OR NEW.status = 'pending'
    OR (NEW.namespace, NEW.owner_id, NEW.id, NEW.report_id, NEW.report_version, NEW.input_hash,
      NEW.targets, NEW.requested_at, NEW.lease_expires_at, NEW.methodology_version)
      IS DISTINCT FROM (OLD.namespace, OLD.owner_id, OLD.id, OLD.report_id, OLD.report_version, OLD.input_hash,
      OLD.targets, OLD.requested_at, OLD.lease_expires_at, OLD.methodology_version) THEN
    RAISE EXCEPTION 'Registry observations and reservation identity are immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER brand_check_runs_immutable BEFORE UPDATE ON sajda.brand_check_runs
  FOR EACH ROW EXECUTE FUNCTION sajda.enforce_brand_check_transition();
ALTER TABLE sajda.brand_check_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sajda.brand_check_runs FROM PUBLIC;
