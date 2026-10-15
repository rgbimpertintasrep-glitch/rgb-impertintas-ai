-- Product-level, source-linked technical evidence.
-- Pending evidence is never shown as verified guidance to the model.
CREATE TABLE IF NOT EXISTS public.rgb_product_technical_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.product_catalog(id) ON DELETE CASCADE,
  manufacturer text NOT NULL,
  source_url text NOT NULL,
  source_title text,
  source_type text NOT NULL DEFAULT 'manufacturer_technical_bulletin'
    CHECK (source_type IN ('manufacturer_technical_bulletin','manufacturer_product_page','official_support','verified_internal')),
  verification_status text NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending','verified','rejected')),
  suitable_surfaces text[] NOT NULL DEFAULT '{}'::text[],
  excluded_surfaces text[] NOT NULL DEFAULT '{}'::text[],
  use_cases text[] NOT NULL DEFAULT '{}'::text[],
  application_guidance text,
  surface_preparation text,
  dilution_guidance text,
  coat_guidance text,
  coverage_guidance text,
  drying_guidance text,
  technical_excerpt text,
  verified_by text,
  verified_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, source_url)
);

CREATE INDEX IF NOT EXISTS rgb_product_technical_facts_product_idx
  ON public.rgb_product_technical_facts (product_id);
CREATE INDEX IF NOT EXISTS rgb_product_technical_facts_status_idx
  ON public.rgb_product_technical_facts (verification_status, active);
CREATE INDEX IF NOT EXISTS rgb_product_technical_facts_surfaces_idx
  ON public.rgb_product_technical_facts USING gin (suitable_surfaces);
CREATE INDEX IF NOT EXISTS rgb_product_technical_facts_excluded_idx
  ON public.rgb_product_technical_facts USING gin (excluded_surfaces);

ALTER TABLE public.rgb_product_technical_facts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.rgb_product_technical_facts FROM anon, authenticated;
GRANT ALL ON TABLE public.rgb_product_technical_facts TO service_role;
