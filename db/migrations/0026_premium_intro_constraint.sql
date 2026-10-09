-- PostgreSQL CHECK permits UNKNOWN. Strengthen the offer/coupon pairing
-- without rewriting migration 0025 or deleting any purchase intent.
ALTER TABLE sajda.commerce_checkouts
  DROP CONSTRAINT commerce_intro_offer_contract,
  ADD CONSTRAINT commerce_intro_offer_contract CHECK (
    (offer_id IS NULL AND coupon_id IS NULL) OR
    (offer_id IS NOT NULL AND offer_id='premium-first-month-v1' AND plan='premium'
      AND coupon_id IS NOT NULL AND length(coupon_id) BETWEEN 1 AND 255
      AND coupon_id ~ '^[A-Za-z0-9_-]+$')
  );
