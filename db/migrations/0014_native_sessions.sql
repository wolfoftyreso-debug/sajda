-- Additive app authorization. No passwords or bearer tokens are stored here.
-- Deleting/revoking the authorizing web session revokes its app access too.
CREATE TABLE sajda.native_authorization_codes (
  code_hash text PRIMARY KEY CHECK (code_hash ~ '^[a-f0-9]{64}$'),
  user_id text NOT NULL REFERENCES public.sajda_auth_user(id) ON DELETE CASCADE,
  session_id text NOT NULL REFERENCES public.sajda_auth_session(id) ON DELETE CASCADE,
  environment text NOT NULL CHECK (environment IN ('development','preview','production')),
  challenge text NOT NULL CHECK (challenge ~ '^[A-Za-z0-9_-]{43}$'),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX native_codes_expiry_idx ON sajda.native_authorization_codes(expires_at);
CREATE TABLE sajda.native_sessions (
  id uuid PRIMARY KEY,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  user_id text NOT NULL REFERENCES public.sajda_auth_user(id) ON DELETE CASCADE,
  session_id text NOT NULL REFERENCES public.sajda_auth_session(id) ON DELETE CASCADE,
  environment text NOT NULL CHECK (environment IN ('development','preview','production')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE INDEX native_sessions_owner_idx ON sajda.native_sessions(user_id,environment);
ALTER TABLE sajda.native_authorization_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sajda.native_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sajda.native_authorization_codes, sajda.native_sessions FROM PUBLIC;
