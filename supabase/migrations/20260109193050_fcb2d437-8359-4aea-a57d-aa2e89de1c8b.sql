-- Add column to track migrated deals
ALTER TABLE public.deals 
ADD COLUMN migrated_from_personal boolean NOT NULL DEFAULT false;