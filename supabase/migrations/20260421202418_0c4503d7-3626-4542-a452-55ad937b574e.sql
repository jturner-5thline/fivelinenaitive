-- Pending deal suggestions queue (e.g., contact emails detected in drafts)
CREATE TABLE public.pending_deal_suggestions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  company_id UUID NOT NULL,
  user_id UUID NOT NULL,
  suggestion_type TEXT NOT NULL DEFAULT 'contact_email_from_draft',
  status TEXT NOT NULL DEFAULT 'pending',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_thread_id TEXT,
  source_thread_subject TEXT,
  confirmed_at TIMESTAMP WITH TIME ZONE,
  confirmed_note_id UUID,
  dedup_key TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_pending_deal_suggestions_deal ON public.pending_deal_suggestions(deal_id, status);
CREATE INDEX idx_pending_deal_suggestions_user ON public.pending_deal_suggestions(user_id, status);
CREATE INDEX idx_pending_deal_suggestions_thread ON public.pending_deal_suggestions(source_thread_id);
CREATE UNIQUE INDEX idx_pending_deal_suggestions_dedup
  ON public.pending_deal_suggestions(deal_id, dedup_key)
  WHERE dedup_key IS NOT NULL AND status = 'pending';

ALTER TABLE public.pending_deal_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view suggestions for their company deals"
ON public.pending_deal_suggestions
FOR SELECT
TO authenticated
USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Users can create suggestions for their company deals"
ON public.pending_deal_suggestions
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND public.is_company_member(auth.uid(), company_id)
);

CREATE POLICY "Users can update suggestions for their company deals"
ON public.pending_deal_suggestions
FOR UPDATE
TO authenticated
USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Users can delete suggestions for their company deals"
ON public.pending_deal_suggestions
FOR DELETE
TO authenticated
USING (public.is_company_member(auth.uid(), company_id));

CREATE TRIGGER set_pending_deal_suggestions_updated_at
BEFORE UPDATE ON public.pending_deal_suggestions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();