-- Private name-project foundation. API remains disabled until explicitly enabled.
-- No changes to saved-domain behavior, existing records or paid entitlements.
CREATE TABLE sajda.name_projects (
  namespace text NOT NULL CHECK (namespace IN ('development', 'preview', 'production')),
  owner_id text NOT NULL REFERENCES public.sajda_auth_user(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 32768),
  version integer NOT NULL DEFAULT 1 CHECK (version BETWEEN 1 AND 2147483646),
  last_input_hash text NOT NULL CHECK (last_input_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY (namespace, owner_id, id),
  CHECK (updated_at >= created_at)
);
CREATE INDEX name_projects_owner_updated_idx ON sajda.name_projects(namespace, owner_id, updated_at DESC, id DESC);

CREATE TABLE sajda.name_project_domains (
  namespace text NOT NULL,
  owner_id text NOT NULL,
  project_id uuid NOT NULL,
  domain text NOT NULL,
  position integer NOT NULL CHECK (position BETWEEN 0 AND 99),
  PRIMARY KEY (namespace, owner_id, project_id, domain),
  UNIQUE (namespace, owner_id, project_id, position),
  FOREIGN KEY (namespace, owner_id, project_id)
    REFERENCES sajda.name_projects(namespace, owner_id, id) ON DELETE CASCADE,
  FOREIGN KEY (owner_id, domain)
    REFERENCES sajda.saved_domains(user_id, domain) ON DELETE CASCADE
);
CREATE INDEX name_project_domains_saved_domain_idx ON sajda.name_project_domains(owner_id, domain);
-- Removing a project or a shortlist reference never removes a saved original.
-- Removing an original removes its references, not the project brief.
ALTER TABLE sajda.name_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE sajda.name_project_domains ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sajda.name_projects, sajda.name_project_domains FROM PUBLIC;
