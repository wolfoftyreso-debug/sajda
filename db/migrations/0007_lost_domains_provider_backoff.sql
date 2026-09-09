-- Shared across workers/environments using this database. A serverless cold
-- start must not discard a registry's Retry-After instruction.
CREATE TABLE sajda.lost_domain_provider_backoff (
  provider text PRIMARY KEY CHECK (length(provider) BETWEEN 8 AND 300),
  blocked_until timestamptz NOT NULL CHECK (isfinite(blocked_until)),
  updated_at timestamptz NOT NULL DEFAULT now() CHECK (isfinite(updated_at))
);
ALTER TABLE sajda.lost_domain_provider_backoff ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sajda.lost_domain_provider_backoff FROM PUBLIC;
