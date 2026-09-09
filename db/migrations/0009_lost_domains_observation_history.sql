-- Additive indexes for account-scoped historical checks and source rotation.
-- No sources, grants, schedules, observations or billing state are changed.
CREATE INDEX lost_domain_assessments_history_idx
  ON sajda.lost_domain_assessments(owner_id, domain, observed_at DESC);
CREATE INDEX lost_domain_source_history_idx
  ON sajda.lost_domain_work_items(owner_id, source_id, run_id) WHERE kind = 'source';
