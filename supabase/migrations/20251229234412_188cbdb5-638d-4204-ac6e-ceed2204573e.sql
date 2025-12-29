-- Create a function to check if user is in a company
CREATE OR REPLACE FUNCTION public.is_company_member(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_members
    WHERE user_id = _user_id
      AND company_id = _company_id
  )
$$;

-- Add company_id column to deals table
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_deals_company_id ON public.deals(company_id);

-- Drop existing RLS policies on deals
DROP POLICY IF EXISTS "Users can view their own deals" ON public.deals;
DROP POLICY IF EXISTS "Users can create their own deals" ON public.deals;
DROP POLICY IF EXISTS "Users can update their own deals" ON public.deals;
DROP POLICY IF EXISTS "Users can delete their own deals" ON public.deals;
DROP POLICY IF EXISTS "Users can view deals" ON public.deals;
DROP POLICY IF EXISTS "Users can create deals" ON public.deals;
DROP POLICY IF EXISTS "Users can update deals" ON public.deals;
DROP POLICY IF EXISTS "Users can delete deals" ON public.deals;

-- Create new RLS policies for deals
CREATE POLICY "Users can view deals"
ON public.deals
FOR SELECT
USING (
  auth.uid() = user_id 
  OR (company_id IS NOT NULL AND is_company_member(auth.uid(), company_id))
);

CREATE POLICY "Users can create deals"
ON public.deals
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update deals"
ON public.deals
FOR UPDATE
USING (
  auth.uid() = user_id 
  OR (company_id IS NOT NULL AND is_company_member(auth.uid(), company_id))
);

CREATE POLICY "Users can delete deals"
ON public.deals
FOR DELETE
USING (
  auth.uid() = user_id 
  OR (company_id IS NOT NULL AND is_company_member(auth.uid(), company_id))
);

-- Update deal_lenders RLS policies
DROP POLICY IF EXISTS "Users can view lenders of their deals" ON public.deal_lenders;
DROP POLICY IF EXISTS "Users can create lenders for their deals" ON public.deal_lenders;
DROP POLICY IF EXISTS "Users can update lenders of their deals" ON public.deal_lenders;
DROP POLICY IF EXISTS "Users can delete lenders of their deals" ON public.deal_lenders;

CREATE POLICY "Users can view lenders of their deals"
ON public.deal_lenders
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM deals
    WHERE deals.id = deal_lenders.deal_id
    AND (deals.user_id = auth.uid() OR (deals.company_id IS NOT NULL AND is_company_member(auth.uid(), deals.company_id)))
  )
);

CREATE POLICY "Users can create lenders for their deals"
ON public.deal_lenders
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM deals
    WHERE deals.id = deal_lenders.deal_id
    AND (deals.user_id = auth.uid() OR (deals.company_id IS NOT NULL AND is_company_member(auth.uid(), deals.company_id)))
  )
);

CREATE POLICY "Users can update lenders of their deals"
ON public.deal_lenders
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM deals
    WHERE deals.id = deal_lenders.deal_id
    AND (deals.user_id = auth.uid() OR (deals.company_id IS NOT NULL AND is_company_member(auth.uid(), deals.company_id)))
  )
);

CREATE POLICY "Users can delete lenders of their deals"
ON public.deal_lenders
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM deals
    WHERE deals.id = deal_lenders.deal_id
    AND (deals.user_id = auth.uid() OR (deals.company_id IS NOT NULL AND is_company_member(auth.uid(), deals.company_id)))
  )
);

-- Update activity_logs RLS
DROP POLICY IF EXISTS "Users can view activity for their deals" ON public.activity_logs;
DROP POLICY IF EXISTS "Users can create activity for their deals" ON public.activity_logs;

CREATE POLICY "Users can view activity for their deals"
ON public.activity_logs
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM deals
    WHERE deals.id = activity_logs.deal_id
    AND (deals.user_id = auth.uid() OR (deals.company_id IS NOT NULL AND is_company_member(auth.uid(), deals.company_id)))
  )
);

CREATE POLICY "Users can create activity for their deals"
ON public.activity_logs
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM deals
    WHERE deals.id = activity_logs.deal_id
    AND (deals.user_id = auth.uid() OR (deals.company_id IS NOT NULL AND is_company_member(auth.uid(), deals.company_id)))
  )
);

-- Update deal_milestones RLS
DROP POLICY IF EXISTS "Users can view milestones for their deals" ON public.deal_milestones;
DROP POLICY IF EXISTS "Users can create milestones for their deals" ON public.deal_milestones;
DROP POLICY IF EXISTS "Users can update milestones for their deals" ON public.deal_milestones;
DROP POLICY IF EXISTS "Users can delete milestones for their deals" ON public.deal_milestones;

CREATE POLICY "Users can view milestones for their deals"
ON public.deal_milestones
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM deals
    WHERE deals.id = deal_milestones.deal_id
    AND (deals.user_id = auth.uid() OR (deals.company_id IS NOT NULL AND is_company_member(auth.uid(), deals.company_id)))
  )
);

CREATE POLICY "Users can create milestones for their deals"
ON public.deal_milestones
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM deals
    WHERE deals.id = deal_milestones.deal_id
    AND (deals.user_id = auth.uid() OR (deals.company_id IS NOT NULL AND is_company_member(auth.uid(), deals.company_id)))
  )
);

CREATE POLICY "Users can update milestones for their deals"
ON public.deal_milestones
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM deals
    WHERE deals.id = deal_milestones.deal_id
    AND (deals.user_id = auth.uid() OR (deals.company_id IS NOT NULL AND is_company_member(auth.uid(), deals.company_id)))
  )
);

CREATE POLICY "Users can delete milestones for their deals"
ON public.deal_milestones
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM deals
    WHERE deals.id = deal_milestones.deal_id
    AND (deals.user_id = auth.uid() OR (deals.company_id IS NOT NULL AND is_company_member(auth.uid(), deals.company_id)))
  )
);

-- Update deal_status_notes RLS
DROP POLICY IF EXISTS "Users can view status notes for their deals" ON public.deal_status_notes;
DROP POLICY IF EXISTS "Users can create status notes for their deals" ON public.deal_status_notes;
DROP POLICY IF EXISTS "Users can delete status notes for their deals" ON public.deal_status_notes;

CREATE POLICY "Users can view status notes for their deals"
ON public.deal_status_notes
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM deals
    WHERE deals.id = deal_status_notes.deal_id
    AND (deals.user_id = auth.uid() OR (deals.company_id IS NOT NULL AND is_company_member(auth.uid(), deals.company_id)))
  )
);

CREATE POLICY "Users can create status notes for their deals"
ON public.deal_status_notes
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM deals
    WHERE deals.id = deal_status_notes.deal_id
    AND (deals.user_id = auth.uid() OR (deals.company_id IS NOT NULL AND is_company_member(auth.uid(), deals.company_id)))
  )
);

CREATE POLICY "Users can delete status notes for their deals"
ON public.deal_status_notes
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM deals
    WHERE deals.id = deal_status_notes.deal_id
    AND (deals.user_id = auth.uid() OR (deals.company_id IS NOT NULL AND is_company_member(auth.uid(), deals.company_id)))
  )
);