-- Pinned saved-report registry schedules and private, same-source change notices.
-- This does not enable cron, email, ownership claims or legal monitoring.
CREATE TABLE sajda.brand_monitors (
  namespace text NOT NULL CHECK (namespace IN ('development','preview','production')),
  owner_id text NOT NULL REFERENCES public.sajda_auth_user(id) ON DELETE CASCADE,
  report_id uuid NOT NULL,
  report_version integer NOT NULL CHECK (report_version BETWEEN 1 AND 100),
  version integer NOT NULL DEFAULT 1 CHECK (version BETWEEN 1 AND 10000),
  status text NOT NULL CHECK (status IN ('active','paused')),
  pause_reason text CHECK (pause_reason IN ('user','report_changed','plan_limit','history_full')),
  targets jsonb NOT NULL CHECK (jsonb_typeof(targets)='array' AND jsonb_array_length(targets) BETWEEN 1 AND 20 AND octet_length(targets::text)<=16384),
  baseline jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(baseline)='object' AND octet_length(baseline::text)<=32768),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  next_due_at timestamptz,
  claim_version integer,
  lease_expires_at timestamptz,
  last_attempt_at timestamptz,
  last_run_id uuid,
  last_run_status text CHECK (last_run_status IN ('pending','completed','failed')),
  last_failure_code text CHECK (last_failure_code IN ('provider_unavailable','invalid_evidence','check_interrupted')),
  last_coverage jsonb CHECK (jsonb_typeof(last_coverage)='object' AND octet_length(last_coverage::text)<=256),
  last_successful_at timestamptz,
  methodology_version text NOT NULL DEFAULT 'sajda.registry-monitor.v1' CHECK (methodology_version='sajda.registry-monitor.v1'),
  PRIMARY KEY(namespace,owner_id,report_id),
  FOREIGN KEY(namespace,owner_id,report_id,report_version) REFERENCES sajda.brand_report_versions(namespace,owner_id,report_id,version) ON DELETE CASCADE,
  CHECK(updated_at>=created_at),
  CHECK((status='active' AND pause_reason IS NULL AND next_due_at IS NOT NULL) OR (status='paused' AND pause_reason IS NOT NULL AND next_due_at IS NULL)),
  CHECK((last_run_id IS NULL AND last_attempt_at IS NULL AND last_run_status IS NULL) OR (last_run_id IS NOT NULL AND last_attempt_at IS NOT NULL AND last_run_status IS NOT NULL)),
  CHECK((last_run_status='failed' AND last_failure_code IS NOT NULL) OR (last_run_status IS DISTINCT FROM 'failed' AND last_failure_code IS NULL)),
  CHECK((last_run_status='completed' AND last_coverage IS NOT NULL) OR (last_run_status IS DISTINCT FROM 'completed' AND last_coverage IS NULL)),
  CHECK((claim_version IS NULL AND lease_expires_at IS NULL) OR (claim_version IS NOT NULL AND lease_expires_at IS NOT NULL AND last_run_id IS NOT NULL AND last_run_status='pending'))
);
CREATE INDEX brand_monitors_due_idx ON sajda.brand_monitors(namespace,next_due_at,created_at,report_id) WHERE status='active';
CREATE TABLE sajda.brand_monitor_alerts (
  namespace text NOT NULL CHECK (namespace IN ('development','preview','production')),
  owner_id text NOT NULL REFERENCES public.sajda_auth_user(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  report_id uuid NOT NULL,
  report_version integer NOT NULL CHECK (report_version BETWEEN 1 AND 100),
  monitor_version integer NOT NULL CHECK (monitor_version BETWEEN 1 AND 10000),
  run_id uuid NOT NULL,
  target text NOT NULL CHECK (length(target) BETWEEN 1 AND 253),
  previous_observation jsonb NOT NULL CHECK (jsonb_typeof(previous_observation)='object' AND octet_length(previous_observation::text)<=4096),
  current_observation jsonb NOT NULL CHECK (jsonb_typeof(current_observation)='object' AND octet_length(current_observation::text)<=4096),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  acknowledged_at timestamptz,
  PRIMARY KEY(namespace,owner_id,id),
  UNIQUE(namespace,owner_id,report_id,run_id,target),
  FOREIGN KEY(namespace,owner_id,report_id) REFERENCES sajda.brand_monitors(namespace,owner_id,report_id) ON DELETE CASCADE,
  FOREIGN KEY(namespace,owner_id,run_id) REFERENCES sajda.brand_check_runs(namespace,owner_id,id) ON DELETE CASCADE,
  CHECK(acknowledged_at IS NULL OR acknowledged_at>=created_at)
);
CREATE INDEX brand_monitor_alerts_history_idx ON sajda.brand_monitor_alerts(namespace,owner_id,report_id,created_at DESC,id DESC);
CREATE FUNCTION sajda.enforce_brand_monitor_alert_transition() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF OLD.acknowledged_at IS NOT NULL OR NEW.acknowledged_at IS NULL
    OR (NEW.namespace,NEW.owner_id,NEW.id,NEW.report_id,NEW.report_version,NEW.monitor_version,NEW.run_id,NEW.target,
      NEW.previous_observation,NEW.current_observation,NEW.created_at)
      IS DISTINCT FROM (OLD.namespace,OLD.owner_id,OLD.id,OLD.report_id,OLD.report_version,OLD.monitor_version,OLD.run_id,OLD.target,
      OLD.previous_observation,OLD.current_observation,OLD.created_at) THEN
    RAISE EXCEPTION 'A registry change observation is immutable; acknowledgment is one-way';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER brand_monitor_alerts_immutable BEFORE UPDATE ON sajda.brand_monitor_alerts
  FOR EACH ROW EXECUTE FUNCTION sajda.enforce_brand_monitor_alert_transition();
CREATE TABLE sajda.brand_monitor_requests (
  namespace text NOT NULL CHECK (namespace IN ('development','preview','production')),
  owner_id text NOT NULL REFERENCES public.sajda_auth_user(id) ON DELETE CASCADE,
  request_key uuid NOT NULL,
  report_id uuid NOT NULL,
  input_hash text NOT NULL CHECK (input_hash ~ '^[a-f0-9]{64}$'),
  result jsonb NOT NULL CHECK (jsonb_typeof(result)='object' AND octet_length(result::text)<=65536),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY(namespace,owner_id,request_key),
  FOREIGN KEY(namespace,owner_id,report_id) REFERENCES sajda.brand_monitors(namespace,owner_id,report_id) ON DELETE CASCADE
);
CREATE TABLE sajda.brand_monitor_worker_leases (
  namespace text PRIMARY KEY CHECK (namespace IN ('development','preview','production')),
  token uuid NOT NULL,
  expires_at timestamptz NOT NULL
);
ALTER TABLE sajda.brand_monitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE sajda.brand_monitor_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sajda.brand_monitor_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE sajda.brand_monitor_worker_leases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sajda.brand_monitors,sajda.brand_monitor_alerts,sajda.brand_monitor_requests,sajda.brand_monitor_worker_leases FROM PUBLIC;
