-- Create flex_info_notifications table for info requests from Flex
CREATE TABLE public.flex_info_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'info_request',
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  user_email TEXT,
  lender_name TEXT,
  company_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.flex_info_notifications ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view notifications for their deals"
ON public.flex_info_notifications
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM deals d
    WHERE d.id = flex_info_notifications.deal_id
    AND (d.user_id = auth.uid() OR (d.company_id IS NOT NULL AND is_company_member(auth.uid(), d.company_id)))
  )
);

CREATE POLICY "Users can update notifications for their deals"
ON public.flex_info_notifications
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM deals d
    WHERE d.id = flex_info_notifications.deal_id
    AND (d.user_id = auth.uid() OR (d.company_id IS NOT NULL AND is_company_member(auth.uid(), d.company_id)))
  )
);

CREATE POLICY "Service role can insert notifications"
ON public.flex_info_notifications
FOR INSERT
WITH CHECK (true);

-- Add index for performance
CREATE INDEX idx_flex_info_notifications_deal_id ON public.flex_info_notifications(deal_id);
CREATE INDEX idx_flex_info_notifications_status ON public.flex_info_notifications(status);