-- Contact abuse control and retry deduplication, separate from paid AI limits.
-- The application persists no message, email address, name or raw client IP.
CREATE TABLE public.sajda_contact_submissions (
  namespace text NOT NULL CHECK (namespace IN (
    'sajda.contact.v1:development', 'sajda.contact.v1:preview', 'sajda.contact.v1:production'
  )),
  submission_id uuid NOT NULL,
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  identity_hash text NOT NULL CHECK (identity_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL CHECK (status IN ('pending', 'accepted')),
  attempts smallint NOT NULL CHECK (attempts BETWEEN 1 AND 3),
  created_at timestamptz NOT NULL,
  last_attempt_at timestamptz NOT NULL,
  lease_token uuid,
  lease_until timestamptz,
  accepted_at timestamptz,
  PRIMARY KEY (namespace, submission_id),
  CHECK ((status = 'accepted' AND accepted_at IS NOT NULL AND lease_token IS NULL AND lease_until IS NULL)
    OR (status = 'pending' AND accepted_at IS NULL)),
  CHECK ((lease_token IS NULL) = (lease_until IS NULL))
);

CREATE INDEX sajda_contact_submissions_activity_idx
  ON public.sajda_contact_submissions (namespace, last_attempt_at);
CREATE INDEX sajda_contact_submissions_retention_idx
  ON public.sajda_contact_submissions (namespace, created_at);

ALTER TABLE public.sajda_contact_submissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sajda_contact_submissions FROM PUBLIC;
