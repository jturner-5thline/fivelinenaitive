-- Create feedback table
CREATE TABLE public.feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  message TEXT NOT NULL,
  page_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- Create function to check if user has 5thline.co email
CREATE OR REPLACE FUNCTION public.is_5thline_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users
    WHERE id = _user_id
      AND email LIKE '%@5thline.co'
  )
$$;

-- Policy: Only 5thline.co users can insert feedback
CREATE POLICY "5thline users can insert feedback"
ON public.feedback
FOR INSERT
WITH CHECK (
  auth.uid() = user_id 
  AND public.is_5thline_user(auth.uid())
);

-- Policy: Users can view their own feedback
CREATE POLICY "Users can view own feedback"
ON public.feedback
FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Admins can view all feedback
CREATE POLICY "Admins can view all feedback"
ON public.feedback
FOR SELECT
USING (public.is_admin(auth.uid()));