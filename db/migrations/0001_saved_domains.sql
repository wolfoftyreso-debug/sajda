-- Private saved-domain snapshots. The same-origin Vercel API obtains user_id
-- only from a verified Neon Auth JWT, never from caller-supplied JSON.
-- Snapshot prices/estimates are NOT current availability or verified prices.
CREATE TABLE IF NOT EXISTS sajda.saved_domains (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id text NOT NULL CHECK (length(user_id) BETWEEN 1 AND 200),
  domain text NOT NULL CHECK (length(domain) BETWEEN 3 AND 253),
  registrar_price numeric NOT NULL DEFAULT 0 CHECK (registrar_price BETWEEN 0 AND 1000000000000),
  estimated_value numeric NOT NULL DEFAULT 0 CHECK (estimated_value BETWEEN 0 AND 1000000000000),
  confidence_score numeric NOT NULL DEFAULT 0 CHECK (confidence_score BETWEEN 0 AND 100),
  rationale text NOT NULL DEFAULT '' CHECK (length(rationale) <= 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, domain)
);

CREATE INDEX IF NOT EXISTS saved_domains_user_id_desc_idx
  ON sajda.saved_domains (user_id, id DESC);

-- This schema is never a browser Data API surface. Fail closed if a role
-- without BYPASSRLS accidentally gains privileges; Vercel's runtime role
-- must be the table owner or an explicitly privileged server role.
ALTER TABLE sajda.saved_domains ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sajda.saved_domains FROM PUBLIC;
