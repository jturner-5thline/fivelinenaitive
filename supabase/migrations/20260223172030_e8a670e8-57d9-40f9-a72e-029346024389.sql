
-- Add approval tracking to waitlist
ALTER TABLE public.waitlist 
ADD COLUMN approved_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN approved_by UUID DEFAULT NULL;
