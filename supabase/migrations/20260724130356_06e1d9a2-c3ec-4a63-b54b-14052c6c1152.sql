ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS referral_fee TEXT,
  ADD COLUMN IF NOT EXISTS lender_referred_pct TEXT;