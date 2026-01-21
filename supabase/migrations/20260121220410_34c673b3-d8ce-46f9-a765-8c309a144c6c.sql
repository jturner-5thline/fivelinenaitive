-- Fix RLS policies for company-wide access to lender_notes_history
-- (deal_lenders, milestones, status notes policies were created successfully)

-- LENDER NOTES HISTORY: Allow company members full access
DROP POLICY IF EXISTS "Users can manage own lender notes history" ON public.lender_notes_history;
DROP POLICY IF EXISTS "Company members can manage lender notes history" ON public.lender_notes_history;
DROP POLICY IF EXISTS "Company members can select lender notes history" ON public.lender_notes_history;
DROP POLICY IF EXISTS "Company members can insert lender notes history" ON public.lender_notes_history;
DROP POLICY IF EXISTS "Company members can update lender notes history" ON public.lender_notes_history;
DROP POLICY IF EXISTS "Company members can delete lender notes history" ON public.lender_notes_history;

CREATE POLICY "Company members can select lender notes history" 
ON public.lender_notes_history 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM deal_lenders dl
    JOIN deals d ON d.id = dl.deal_id
    JOIN company_members cm ON cm.company_id = d.company_id
    WHERE dl.id = lender_notes_history.deal_lender_id
    AND cm.user_id = auth.uid()
  )
  OR user_id = auth.uid()
);

CREATE POLICY "Company members can insert lender notes history" 
ON public.lender_notes_history 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM deal_lenders dl
    JOIN deals d ON d.id = dl.deal_id
    JOIN company_members cm ON cm.company_id = d.company_id
    WHERE dl.id = lender_notes_history.deal_lender_id
    AND cm.user_id = auth.uid()
  )
  OR user_id = auth.uid()
);

CREATE POLICY "Company members can update lender notes history" 
ON public.lender_notes_history 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM deal_lenders dl
    JOIN deals d ON d.id = dl.deal_id
    JOIN company_members cm ON cm.company_id = d.company_id
    WHERE dl.id = lender_notes_history.deal_lender_id
    AND cm.user_id = auth.uid()
  )
  OR user_id = auth.uid()
);

CREATE POLICY "Company members can delete lender notes history" 
ON public.lender_notes_history 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM deal_lenders dl
    JOIN deals d ON d.id = dl.deal_id
    JOIN company_members cm ON cm.company_id = d.company_id
    WHERE dl.id = lender_notes_history.deal_lender_id
    AND cm.user_id = auth.uid()
  )
  OR user_id = auth.uid()
);

-- Enable realtime for these tables (may already be enabled from previous partial migration)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'deal_lenders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.deal_lenders;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'deal_milestones'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.deal_milestones;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'deal_status_notes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.deal_status_notes;
  END IF;
END $$;