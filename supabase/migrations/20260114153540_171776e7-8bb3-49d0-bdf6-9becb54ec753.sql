-- Add title and type columns to feedback table
ALTER TABLE public.feedback 
ADD COLUMN title TEXT,
ADD COLUMN type TEXT DEFAULT 'feature' CHECK (type IN ('bug', 'feature'));

-- Rename message to description for clarity (optional, keeping as is for backward compat)
COMMENT ON COLUMN public.feedback.message IS 'Description of the feedback';