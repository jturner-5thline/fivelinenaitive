-- Add screenshot_url column to feedback table
ALTER TABLE public.feedback ADD COLUMN screenshot_url TEXT;

-- Create storage bucket for feedback screenshots
INSERT INTO storage.buckets (id, name, public) VALUES ('feedback-screenshots', 'feedback-screenshots', false);

-- RLS policies for feedback screenshots bucket
-- Only authenticated users can upload their own screenshots
CREATE POLICY "Users can upload feedback screenshots"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'feedback-screenshots' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Only admins can view feedback screenshots
CREATE POLICY "Admins can view feedback screenshots"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'feedback-screenshots' 
  AND public.is_admin(auth.uid())
);

-- Users can view their own screenshots
CREATE POLICY "Users can view own feedback screenshots"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'feedback-screenshots' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);