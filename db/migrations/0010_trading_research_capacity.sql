-- Additive rollout: existing runs retain their original limits/deadlines.
-- No sources are enabled and no customer access is granted by this migration.
ALTER TABLE sajda.lost_domain_runs
  DROP CONSTRAINT lost_domain_runs_source_limit_check,
  DROP CONSTRAINT lost_domain_runs_candidate_limit_check,
  DROP CONSTRAINT lost_domain_runs_attempt_limit_check,
  ADD CONSTRAINT lost_domain_runs_source_limit_check CHECK (source_limit BETWEEN 1 AND 24),
  ADD CONSTRAINT lost_domain_runs_candidate_limit_check CHECK (candidate_limit BETWEEN 1 AND 600),
  ADD CONSTRAINT lost_domain_runs_attempt_limit_check CHECK (attempt_limit BETWEEN 1 AND 900),
  ADD COLUMN candidates_per_source integer NOT NULL DEFAULT 20 CHECK (candidates_per_source BETWEEN 1 AND 60),
  ADD COLUMN run_lifetime_seconds integer NOT NULL DEFAULT 21600 CHECK (run_lifetime_seconds BETWEEN 3600 AND 86400);

COMMENT ON COLUMN sajda.lost_domain_runs.candidates_per_source IS 'Server-owned discovery selection budget; immutable by application after run creation.';
COMMENT ON COLUMN sajda.lost_domain_runs.run_lifetime_seconds IS 'Per-run deadline. Historical runs keep the original six-hour limit.';

-- Keep observations immutable. A final verification is a new observation, not
-- an overwrite. Existing runs are grandfathered out of the new second pass.
ALTER TABLE sajda.lost_domain_runs ADD COLUMN verification_queued boolean NOT NULL DEFAULT true;
ALTER TABLE sajda.lost_domain_work_items ADD COLUMN verification boolean NOT NULL DEFAULT false;
ALTER TABLE sajda.lost_domain_assessments DROP CONSTRAINT lost_domain_assessments_run_id_domain_key;
CREATE INDEX lost_domain_assessments_latest_run_domain_idx
  ON sajda.lost_domain_assessments(owner_id,run_id,domain,observed_at DESC);
