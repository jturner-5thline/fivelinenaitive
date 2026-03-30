
-- Add sync_all_calls toggle to claap_integration_config
ALTER TABLE public.claap_integration_config
ADD COLUMN IF NOT EXISTS sync_all_calls boolean NOT NULL DEFAULT false;

-- Create claap_skipped_calls table for logging skipped calls
CREATE TABLE IF NOT EXISTS public.claap_skipped_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  claap_id text NOT NULL,
  title text,
  recording_url text,
  duration_seconds integer,
  organizer_email text,
  participants jsonb DEFAULT '[]'::jsonb,
  started_at timestamptz,
  skip_reason text NOT NULL,
  match_attempts jsonb DEFAULT '{}'::jsonb,
  force_synced boolean NOT NULL DEFAULT false,
  force_synced_by uuid,
  force_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add unique constraint on claap_id to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS claap_skipped_calls_claap_id_key ON public.claap_skipped_calls(claap_id);

-- RLS
ALTER TABLE public.claap_skipped_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view skipped calls"
ON public.claap_skipped_calls FOR SELECT TO authenticated
USING (
  company_id IN (
    SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
  )
);

-- Add call_type column to claap_meetings for tagging
ALTER TABLE public.claap_meetings
ADD COLUMN IF NOT EXISTS call_type text;

-- Add match_source to track what matched
ALTER TABLE public.claap_meetings
ADD COLUMN IF NOT EXISTS match_source text;

-- Add matched_lender_id
ALTER TABLE public.claap_meetings
ADD COLUMN IF NOT EXISTS matched_lender_id uuid;

-- Add matched_contact_id
ALTER TABLE public.claap_meetings
ADD COLUMN IF NOT EXISTS matched_contact_id uuid;

-- Add matched_crm_company_id for crm_companies match
ALTER TABLE public.claap_meetings
ADD COLUMN IF NOT EXISTS matched_crm_company_id uuid;
