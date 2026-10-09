-- Account-owned self-assessments; not independent verification or monitoring.
-- Original claims and source timestamps are immutable across saved revisions.
CREATE TABLE sajda.brand_reports (
  namespace text NOT NULL CHECK (namespace IN ('development', 'preview', 'production')),
  owner_id text NOT NULL REFERENCES public.sajda_auth_user(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 120 AND title = btrim(title)),
  version integer NOT NULL CHECK (version BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY (namespace, owner_id, id),
  CHECK (updated_at >= created_at)
);
CREATE INDEX brand_reports_owner_updated_idx ON sajda.brand_reports(namespace, owner_id, updated_at DESC, id DESC);

CREATE TABLE sajda.brand_report_versions (
  namespace text NOT NULL,
  owner_id text NOT NULL,
  report_id uuid NOT NULL,
  version integer NOT NULL CHECK (version BETWEEN 1 AND 100),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 120 AND title = btrim(title)),
  assessment jsonb NOT NULL CHECK (jsonb_typeof(assessment) = 'object' AND octet_length(assessment::text) <= 65536),
  saved_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY (namespace, owner_id, report_id, version),
  FOREIGN KEY (namespace, owner_id, report_id)
    REFERENCES sajda.brand_reports(namespace, owner_id, id) ON DELETE CASCADE
);

CREATE TABLE sajda.brand_report_requests (
  namespace text NOT NULL,
  owner_id text NOT NULL,
  request_key uuid NOT NULL,
  report_id uuid NOT NULL,
  version integer NOT NULL CHECK (version BETWEEN 1 AND 100),
  input_hash text NOT NULL CHECK (input_hash ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY (namespace, owner_id, request_key),
  UNIQUE (namespace, owner_id, report_id, version),
  FOREIGN KEY (namespace, owner_id, report_id, version)
    REFERENCES sajda.brand_report_versions(namespace, owner_id, report_id, version) ON DELETE CASCADE
);

CREATE FUNCTION sajda.reject_brand_report_history_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  RAISE EXCEPTION 'Saved brand report history cannot be updated';
END;
$$;
CREATE TRIGGER brand_report_versions_immutable BEFORE UPDATE ON sajda.brand_report_versions
  FOR EACH ROW EXECUTE FUNCTION sajda.reject_brand_report_history_update();
CREATE TRIGGER brand_report_requests_immutable BEFORE UPDATE ON sajda.brand_report_requests
  FOR EACH ROW EXECUTE FUNCTION sajda.reject_brand_report_history_update();
ALTER TABLE sajda.brand_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE sajda.brand_report_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sajda.brand_report_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sajda.brand_reports, sajda.brand_report_versions, sajda.brand_report_requests FROM PUBLIC;
