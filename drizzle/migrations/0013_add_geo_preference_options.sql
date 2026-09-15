ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS geo_preference_options jsonb;

INSERT INTO public.company_settings (company_id, geo_preference_options)
VALUES (
  'c4753066-0da9-4d87-8858-7eb1adecd173',
  '["US","US Regional - Southeast","US Regional - Southwest","US Regional - Northeast","US Regional - Northwest","Canada","UK","Euro-beer","Euro-all","International"]'::jsonb
)
ON CONFLICT (company_id) DO UPDATE
  SET geo_preference_options = EXCLUDED.geo_preference_options,
      updated_at = now();