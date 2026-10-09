-- Expand website billing from the legacy Trading-only contract to the shared
-- Basic/Premium/Trading catalog. Existing rows are Trading by definition.
ALTER TABLE sajda.commerce_checkouts
  ADD COLUMN plan text NOT NULL DEFAULT 'trading'
  CHECK (plan IN ('basic','premium','trading'));
ALTER TABLE sajda.commerce_access
  ADD COLUMN plan text NOT NULL DEFAULT 'trading'
  CHECK (plan IN ('basic','premium','trading'));

-- Only a verified Trading purchase may authorize Lost Domains. Basic and
-- Premium remain visible through the account membership read model below.
CREATE OR REPLACE VIEW sajda.lost_domain_effective_access AS
  SELECT namespaces.namespace,a.owner_id,a.valid_from,a.expires_at,a.revoked_at,a.daily_refresh
    FROM sajda.lost_domain_access a
    CROSS JOIN (VALUES ('development'::text),('preview'::text),('production'::text)) namespaces(namespace)
    WHERE a.grant_source='operator'
  UNION ALL
  SELECT a.namespace,a.owner_id,a.valid_from,a.expires_at,a.revoked_at,a.daily_refresh
    FROM sajda.commerce_access a
    WHERE a.plan='trading' AND (a.namespace='production')=a.livemode
  UNION ALL
  SELECT a.namespace,a.owner_id,a.valid_from,LEAST(a.expires_at,a.verified_at+interval '24 hours'),a.revoked_at,false
    FROM sajda.native_commerce_subscriptions a
    WHERE a.plan='trading' AND a.status IN (1,4) AND (a.namespace='production')=(a.environment='Production');
REVOKE ALL ON sajda.lost_domain_effective_access FROM PUBLIC;
