-- Create lender attachments table
CREATE TABLE public.lender_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  lender_name TEXT NOT NULL,
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  content_type TEXT,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.lender_attachments ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own lender attachments"
ON public.lender_attachments
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can upload their own lender attachments"
ON public.lender_attachments
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own lender attachments"
ON public.lender_attachments
FOR DELETE
USING (auth.uid() = user_id);

-- Create storage bucket for lender attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('lender-attachments', 'lender-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Users can view their lender attachments"
ON storage.objects
FOR SELECT
USING (bucket_id = 'lender-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload their lender attachments"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'lender-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their lender attachments"
ON storage.objects
FOR DELETE
USING (bucket_id = 'lender-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);