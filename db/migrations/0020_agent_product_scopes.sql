-- Add opt-in agent permissions without modifying any existing key or grant.
-- This replaces only the allowed-value CHECK, never account ownership or RLS.
ALTER TABLE sajda.developer_api_keys
  DROP CONSTRAINT developer_api_keys_scopes_check;
ALTER TABLE sajda.developer_api_keys
  ADD CONSTRAINT developer_api_keys_scopes_check CHECK (
    cardinality(scopes) BETWEEN 1 AND 11
    AND array_position(scopes, NULL) IS NULL
    AND scopes <@ ARRAY[
      'domains:search', 'account:read', 'saved:read', 'saved:write',
      'trading:read', 'trading:run', 'trading:quote',
      'projects:read', 'projects:write', 'social:check', 'trading:write'
    ]::text[]
  );
