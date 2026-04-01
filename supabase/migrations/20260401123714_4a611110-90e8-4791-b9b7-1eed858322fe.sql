
-- Table to store AI-generated match suggestions for calls
CREATE TABLE public.claap_match_suggestions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  meeting_id UUID NOT NULL REFERENCES public.claap_meetings(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  lender_name TEXT,
  company_name TEXT,
  contact_email TEXT,
  confidence NUMERIC NOT NULL DEFAULT 0,
  reason TEXT,
  suggestion_source TEXT NOT NULL DEFAULT 'ai',
  rank INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending',
  feedback_action TEXT,
  feedback_at TIMESTAMPTZ,
  feedback_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookup by meeting
CREATE INDEX idx_claap_match_suggestions_meeting ON public.claap_match_suggestions(meeting_id);
CREATE INDEX idx_claap_match_suggestions_status ON public.claap_match_suggestions(status);

-- Table to store user feedback for learning over time
CREATE TABLE public.claap_match_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  meeting_id UUID NOT NULL REFERENCES public.claap_meetings(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  suggested_deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  chosen_deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  suggestion_id UUID REFERENCES public.claap_match_suggestions(id) ON DELETE SET NULL,
  signals JSONB DEFAULT '{}',
  performed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_claap_match_feedback_company ON public.claap_match_feedback(company_id);

-- Add suggestion tracking columns to claap_meetings
ALTER TABLE public.claap_meetings 
  ADD COLUMN IF NOT EXISTS suggestions_generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suggestion_count INTEGER DEFAULT 0;

-- RLS
ALTER TABLE public.claap_match_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claap_match_feedback ENABLE ROW LEVEL SECURITY;

-- Policies for suggestions
CREATE POLICY "Company members can view suggestions" ON public.claap_match_suggestions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.claap_meetings cm
      JOIN public.company_members cmem ON cmem.company_id = cm.company_id
      WHERE cm.id = meeting_id AND cmem.user_id = auth.uid()
    )
  );

CREATE POLICY "Company members can update suggestions" ON public.claap_match_suggestions
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.claap_meetings cm
      JOIN public.company_members cmem ON cmem.company_id = cm.company_id
      WHERE cm.id = meeting_id AND cmem.user_id = auth.uid()
    )
  );

-- Policies for feedback
CREATE POLICY "Company members can view feedback" ON public.claap_match_feedback
  FOR SELECT TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Company members can insert feedback" ON public.claap_match_feedback
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())
  );
