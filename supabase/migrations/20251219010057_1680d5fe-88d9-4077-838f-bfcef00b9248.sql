-- Add category column to lender_attachments table
ALTER TABLE public.lender_attachments 
ADD COLUMN category text NOT NULL DEFAULT 'general';