ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS referral_source_doc_fields JSONB NOT NULL DEFAULT
    '[
      {"id":"referral_agreement_on_file","label":"Referral Agreement on file","type":"checkbox"},
      {"id":"w9_on_file","label":"W-9 on file","type":"checkbox"},
      {"id":"referral_fee","label":"Referral Fee","type":"text","placeholder":"e.g. 1%"},
      {"id":"lender_referred_pct","label":"Lender Referred %","type":"text","placeholder":"e.g. 50%"}
    ]'::jsonb;

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS referral_source_docs JSONB NOT NULL DEFAULT '{}'::jsonb;