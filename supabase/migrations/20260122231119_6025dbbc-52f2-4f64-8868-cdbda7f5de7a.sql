-- Add active column to master_lenders table
ALTER TABLE public.master_lenders 
ADD COLUMN active boolean DEFAULT true;