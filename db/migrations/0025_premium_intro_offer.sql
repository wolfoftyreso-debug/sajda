-- Additive purchase-intent snapshots. No Stripe objects or entitlements created.
-- Old checkouts remain ordinary-price checkouts; no retroactive promotion.
ALTER TABLE sajda.commerce_checkouts
  ADD COLUMN offer_id text,
  ADD COLUMN coupon_id text,
  ADD COLUMN return_to text;
ALTER TABLE sajda.commerce_checkouts
  ADD CONSTRAINT commerce_intro_offer_contract CHECK (
    (offer_id IS NULL AND coupon_id IS NULL) OR
    (offer_id='premium-first-month-v1' AND plan='premium' AND coupon_id IS NOT NULL
      AND length(coupon_id) BETWEEN 1 AND 255 AND coupon_id ~ '^[A-Za-z0-9_-]+$')),
  ADD CONSTRAINT commerce_checkout_return_to CHECK (return_to IS NULL OR return_to='swipe');
CREATE INDEX commerce_intro_owner_history_idx ON sajda.commerce_checkouts(namespace,owner_id,created_at)
  WHERE offer_id IS NOT NULL;
