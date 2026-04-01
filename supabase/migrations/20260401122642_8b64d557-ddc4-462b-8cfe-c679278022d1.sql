
-- Add enhanced matching fields to claap_meetings
ALTER TABLE public.claap_meetings 
  ADD COLUMN IF NOT EXISTS match_method text DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS match_confidence integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS match_reason text,
  ADD COLUMN IF NOT EXISTS match_candidates jsonb,
  ADD COLUMN IF NOT EXISTS manually_locked boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS matched_at timestamptz,
  ADD COLUMN IF NOT EXISTS matched_by uuid;

-- Update existing matched meetings to have match_method = 'auto'
UPDATE public.claap_meetings 
SET match_method = 'auto', 
    match_confidence = 70,
    matched_at = updated_at
WHERE deal_id IS NOT NULL AND match_method IS NULL;

-- Create claap_match_audit table for tracking all changes
CREATE TABLE IF NOT EXISTS public.claap_match_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.claap_meetings(id) ON DELETE CASCADE,
  action text NOT NULL,
  previous_deal_id uuid,
  new_deal_id uuid,
  previous_status text,
  new_status text,
  match_method text,
  match_confidence integer,
  match_reason text,
  performed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on audit table
ALTER TABLE public.claap_match_audit ENABLE ROW LEVEL SECURITY;

-- RLS: Company members can view audit logs for meetings in their company
CREATE POLICY "Company members can view match audit"
  ON public.claap_match_audit
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.claap_meetings cm
      JOIN public.company_members cmem ON cmem.company_id = cm.company_id
      WHERE cm.id = claap_match_audit.meeting_id
        AND cmem.user_id = auth.uid()
    )
  );

-- RLS: Company members can insert audit logs
CREATE POLICY "Company members can insert match audit"
  ON public.claap_match_audit
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.claap_meetings cm
      JOIN public.company_members cmem ON cmem.company_id = cm.company_id
      WHERE cm.id = claap_match_audit.meeting_id
        AND cmem.user_id = auth.uid()
    )
  );

-- Add match_status to claap_meetings for richer state tracking
-- Values: matched, suggested, unmatched, manually_linked, needs_review, ignored
ALTER TABLE public.claap_meetings 
  ADD COLUMN IF NOT EXISTS match_status text DEFAULT 'unmatched';

-- Update existing records
UPDATE public.claap_meetings SET match_status = 'matched' WHERE deal_id IS NOT NULL AND match_status = 'unmatched';
UPDATE public.claap_meetings SET match_status = 'unmatched' WHERE deal_id IS NULL AND match_status = 'unmatched';
