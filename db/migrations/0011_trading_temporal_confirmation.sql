-- Bounded, durable temporal confirmation. Existing runs keep their original
-- deadlines and at most one immediate verification; no provider/source/access
-- configuration or historical assessment evidence is changed.
ALTER TABLE sajda.lost_domain_runs
  DROP CONSTRAINT lost_domain_runs_run_lifetime_seconds_check,
  ADD CONSTRAINT lost_domain_runs_run_lifetime_seconds_check CHECK (run_lifetime_seconds BETWEEN 3600 AND 259200),
  ADD COLUMN verification_round smallint NOT NULL DEFAULT 0 CHECK (verification_round BETWEEN 0 AND 3),
  ADD COLUMN verification_max_rounds smallint NOT NULL DEFAULT 1 CHECK (verification_max_rounds IN (1,3)),
  ADD COLUMN verification_gap_seconds integer[] NOT NULL DEFAULT ARRAY[0];

-- Grandfather old runs that already queued or intentionally disabled the pass.
UPDATE sajda.lost_domain_runs SET verification_round=1 WHERE verification_queued;
ALTER TABLE sajda.lost_domain_runs
  ADD CONSTRAINT lost_domain_runs_verification_progress_check CHECK (verification_round<=verification_max_rounds),
  ADD CONSTRAINT lost_domain_runs_verification_schedule_check CHECK (
    (verification_max_rounds=1 AND verification_gap_seconds=ARRAY[0]) OR
    (verification_max_rounds=3 AND verification_gap_seconds=ARRAY[1200,7200,43200]));

ALTER TABLE sajda.lost_domain_work_items
  ADD COLUMN verification_round smallint NOT NULL DEFAULT 0;
UPDATE sajda.lost_domain_work_items SET verification_round=1 WHERE verification;
ALTER TABLE sajda.lost_domain_work_items
  ADD CONSTRAINT lost_domain_work_verification_round_check CHECK (
    verification_round BETWEEN 0 AND 3 AND verification=(verification_round>0)
    AND (verification_round=0 OR kind='candidate'));

CREATE INDEX lost_domain_work_round_idx
  ON sajda.lost_domain_work_items(owner_id,run_id,verification_round,status);
CREATE INDEX lost_domain_attempts_run_lifetime_idx
  ON sajda.lost_domain_attempts(namespace,run_id,owner_id);

COMMENT ON COLUMN sajda.lost_domain_runs.verification_gap_seconds IS 'Server-owned minimum gaps after the preceding completed observation: legacy immediate, v3 20 minutes / 2 hours / 12 hours. Repetition is not registrability, value or a purchase recommendation.';
COMMENT ON COLUMN sajda.lost_domain_runs.verification_round IS 'Latest queued temporal round, not successful confirmation count. Attempts remain bounded across the full run lifetime.';
