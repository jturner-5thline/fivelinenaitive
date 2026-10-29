ALTER TABLE public.referral_sources
  ADD COLUMN IF NOT EXISTS is_channel_partner boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS channel_partner_stage text NOT NULL DEFAULT 'prospect'
    CHECK (channel_partner_stage IN ('prospect','nurturing','trial','engaged'));