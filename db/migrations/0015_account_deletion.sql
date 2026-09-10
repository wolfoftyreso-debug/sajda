-- One expiring confirmation per account. No email address or plaintext code.
-- Request and attempt budgets are shared by all devices, not browser-local.
CREATE TABLE sajda.account_deletion_challenges (
  owner_id text PRIMARY KEY REFERENCES public.sajda_auth_user(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  code_hash text NOT NULL CHECK (code_hash ~ '^[a-f0-9]{64}$'),
  language text NOT NULL CHECK (language IN ('en','sv','es','fr','zh')),
  expires_at timestamptz NOT NULL,
  attempts smallint NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  window_started_at timestamptz NOT NULL,
  request_count smallint NOT NULL CHECK (request_count BETWEEN 1 AND 3),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE sajda.account_deletion_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sajda.account_deletion_challenges FROM PUBLIC;

-- Do not discard or silently rewrite legacy saved-domain owners. NOT VALID
-- enforces the FK for every new write, closing the authenticate/delete/insert
-- race, while a later separately reviewed cleanup can validate older rows.
ALTER TABLE sajda.saved_domains ADD CONSTRAINT saved_domains_auth_owner_fk
  FOREIGN KEY(user_id) REFERENCES public.sajda_auth_user(id) ON DELETE CASCADE NOT VALID;
