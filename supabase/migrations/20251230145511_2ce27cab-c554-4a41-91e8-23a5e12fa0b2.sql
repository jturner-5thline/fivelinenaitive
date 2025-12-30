-- Add is_flagged column to deals table
ALTER TABLE public.deals ADD COLUMN is_flagged boolean NOT NULL DEFAULT false;