-- A fact cannot be marked verified without a timestamp for when it was checked.
ALTER TABLE public.rgb_product_technical_facts
  ADD CONSTRAINT rgb_product_technical_facts_verified_at_check
  CHECK (verification_status <> 'verified' OR verified_at IS NOT NULL);
