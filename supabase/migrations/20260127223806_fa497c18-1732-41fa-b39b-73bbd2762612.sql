-- Create deal_space_documents table for storing uploaded documents
CREATE TABLE public.deal_space_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  content_type TEXT,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Enable RLS
ALTER TABLE public.deal_space_documents ENABLE ROW LEVEL SECURITY;

-- Create policies - users can access documents for deals they own or are in same company
CREATE POLICY "Users can view deal space documents for their deals"
ON public.deal_space_documents
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.deals d
    WHERE d.id = deal_space_documents.deal_id
    AND (
      d.user_id = auth.uid()
      OR public.is_same_company_as_user(auth.uid(), d.user_id)
    )
  )
);

CREATE POLICY "Users can insert deal space documents for their deals"
ON public.deal_space_documents
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.deals d
    WHERE d.id = deal_space_documents.deal_id
    AND (
      d.user_id = auth.uid()
      OR public.is_same_company_as_user(auth.uid(), d.user_id)
    )
  )
);

CREATE POLICY "Users can delete deal space documents for their deals"
ON public.deal_space_documents
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.deals d
    WHERE d.id = deal_space_documents.deal_id
    AND (
      d.user_id = auth.uid()
      OR public.is_same_company_as_user(auth.uid(), d.user_id)
    )
  )
);

-- Create storage bucket for deal space documents
INSERT INTO storage.buckets (id, name, public) VALUES ('deal-space', 'deal-space', false);

-- Storage policies
CREATE POLICY "Users can view deal space files"
ON storage.objects FOR SELECT
USING (bucket_id = 'deal-space' AND auth.role() = 'authenticated');

CREATE POLICY "Users can upload deal space files"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'deal-space' AND auth.role() = 'authenticated');

CREATE POLICY "Users can delete deal space files"
ON storage.objects FOR DELETE
USING (bucket_id = 'deal-space' AND auth.role() = 'authenticated');