-- Add notes_updated_at column to track when status notes were last updated
ALTER TABLE public.deals 
ADD COLUMN IF NOT EXISTS notes_updated_at timestamp with time zone;