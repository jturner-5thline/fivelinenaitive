
-- Drop old user-scoped policies
DROP POLICY IF EXISTS "Users can create their own referral sources" ON public.referral_sources;
DROP POLICY IF EXISTS "Users can delete their own referral sources" ON public.referral_sources;
DROP POLICY IF EXISTS "Users can update their own referral sources" ON public.referral_sources;
DROP POLICY IF EXISTS "Users can view their own referral sources" ON public.referral_sources;

-- Drop unique constraint on (name, user_id)
ALTER TABLE public.referral_sources DROP CONSTRAINT IF EXISTS referral_sources_name_user_id_key;

-- Add new columns
ALTER TABLE public.referral_sources ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'Other';
ALTER TABLE public.referral_sources ADD COLUMN IF NOT EXISTS source_type TEXT;
ALTER TABLE public.referral_sources ADD COLUMN IF NOT EXISTS contact_name TEXT;
ALTER TABLE public.referral_sources ADD COLUMN IF NOT EXISTS contact_email TEXT;
ALTER TABLE public.referral_sources ADD COLUMN IF NOT EXISTS number_of_referrals INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.referral_sources ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.referral_sources ADD COLUMN IF NOT EXISTS relationship_owner_id UUID;
ALTER TABLE public.referral_sources ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.referral_sources ADD COLUMN IF NOT EXISTS promoted_to_partner_id UUID;

-- Make user_id nullable (legacy column)
ALTER TABLE public.referral_sources ALTER COLUMN user_id DROP NOT NULL;

-- Company-scoped RLS policies
CREATE POLICY "rs_select" ON public.referral_sources FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE POLICY "rs_insert" ON public.referral_sources FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE POLICY "rs_update" ON public.referral_sources FOR UPDATE TO authenticated
  USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE POLICY "rs_delete" ON public.referral_sources FOR DELETE TO authenticated
  USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));
