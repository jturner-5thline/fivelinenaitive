-- Create table to link emails to deals
CREATE TABLE public.deal_emails (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  gmail_message_id TEXT NOT NULL,
  user_id UUID NOT NULL,
  linked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  notes TEXT,
  UNIQUE(deal_id, gmail_message_id)
);

-- Enable RLS
ALTER TABLE public.deal_emails ENABLE ROW LEVEL SECURITY;

-- Users can view email links for deals they own or are in the same company
CREATE POLICY "Users can view deal emails for accessible deals"
ON public.deal_emails
FOR SELECT
USING (
  user_id = auth.uid() OR
  EXISTS (
    SELECT 1 FROM public.deals d
    WHERE d.id = deal_id
    AND (d.user_id = auth.uid() OR public.is_same_company_as_user(auth.uid(), d.user_id))
  )
);

-- Users can link emails to their own deals or deals they can access
CREATE POLICY "Users can link emails to accessible deals"
ON public.deal_emails
FOR INSERT
WITH CHECK (
  user_id = auth.uid() AND
  EXISTS (
    SELECT 1 FROM public.deals d
    WHERE d.id = deal_id
    AND (d.user_id = auth.uid() OR public.is_same_company_as_user(auth.uid(), d.user_id))
  )
);

-- Users can unlink their own email links
CREATE POLICY "Users can unlink their own email links"
ON public.deal_emails
FOR DELETE
USING (user_id = auth.uid());

-- Add indexes
CREATE INDEX idx_deal_emails_deal_id ON public.deal_emails(deal_id);
CREATE INDEX idx_deal_emails_gmail_message_id ON public.deal_emails(gmail_message_id);
CREATE INDEX idx_deal_emails_user_id ON public.deal_emails(user_id);