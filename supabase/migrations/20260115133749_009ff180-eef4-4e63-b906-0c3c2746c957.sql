-- Create table for FLEx sync history
CREATE TABLE public.flex_sync_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  flex_deal_id TEXT,
  synced_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'success',
  error_message TEXT,
  payload JSONB,
  response JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.flex_sync_history ENABLE ROW LEVEL SECURITY;

-- Users can view sync history for deals they have access to
CREATE POLICY "Users can view sync history for their deals"
ON public.flex_sync_history
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.deals d
    WHERE d.id = deal_id
    AND (
      d.user_id = auth.uid()
      OR public.is_company_member(auth.uid(), d.company_id)
    )
  )
);

-- Users can insert sync history for deals they have access to
CREATE POLICY "Users can insert sync history for their deals"
ON public.flex_sync_history
FOR INSERT
WITH CHECK (
  synced_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.deals d
    WHERE d.id = deal_id
    AND (
      d.user_id = auth.uid()
      OR public.is_company_member(auth.uid(), d.company_id)
    )
  )
);

-- Create index for faster lookups
CREATE INDEX idx_flex_sync_history_deal_id ON public.flex_sync_history(deal_id);
CREATE INDEX idx_flex_sync_history_created_at ON public.flex_sync_history(created_at DESC);