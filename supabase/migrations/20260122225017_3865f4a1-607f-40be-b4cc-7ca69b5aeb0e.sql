-- Add tier column to master_lenders table
ALTER TABLE public.master_lenders 
ADD COLUMN tier text;