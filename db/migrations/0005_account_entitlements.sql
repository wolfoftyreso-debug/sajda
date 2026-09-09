-- Server-owned capabilities, not a simulated subscription or client plan.
-- This migration intentionally creates NO grants. Login, verified email and
-- saved domains do not confer premium access. Until an explicit, authorized
-- operator grant or verified billing integration exists, premium stays off.
-- source_reference must identify that external billing event or operator
-- decision; never derive it from a browser flag or a checkout return URL.

CREATE TABLE sajda.account_entitlements (
  user_id text NOT NULL REFERENCES public.sajda_auth_user (id) ON DELETE CASCADE,
  capability text NOT NULL CHECK (capability IN ('swipe_undo')),
  grant_source text NOT NULL CHECK (grant_source IN ('operator', 'billing')),
  source_reference text NOT NULL CHECK (length(btrim(source_reference)) BETWEEN 1 AND 200),
  granted_at timestamptz NOT NULL DEFAULT now() CHECK (isfinite(granted_at)),
  valid_from timestamptz NOT NULL DEFAULT now() CHECK (isfinite(valid_from)),
  expires_at timestamptz NOT NULL CHECK (isfinite(expires_at)),
  revoked_at timestamptz CHECK (revoked_at IS NULL OR isfinite(revoked_at)),
  PRIMARY KEY (user_id, capability),
  CHECK (expires_at > valid_from)
);

-- The primary key covers the runtime's exact owner + capability lookup.
-- The server table owner reads this; no public Data API or end-user policy
-- may create, update or self-grant premium access.
ALTER TABLE sajda.account_entitlements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sajda.account_entitlements FROM PUBLIC;
